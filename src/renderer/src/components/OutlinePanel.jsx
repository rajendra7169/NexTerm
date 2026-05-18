import { useEffect, useState } from 'react'
import * as monaco from 'monaco-editor'

// Outline panel — lists symbols (functions / classes / variables) parsed
// from the active file.
//
// For JS/TS/JSX/TSX we use Monaco's TypeScript worker which already has
// a full parser. For other languages we fall back to a regex scan that
// catches the common shapes (def/function/class/const) — not perfect but
// useful enough to navigate a file quickly.
export default function OutlinePanel({ activeFile, editorRef }) {
  const [symbols, setSymbols] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeFile || !editorRef?.current) { setSymbols([]); return }
    let cancelled = false
    setLoading(true)

    async function load() {
      const ed = editorRef.current
      const model = ed?.getModel?.()
      if (!model) { setLoading(false); return }
      const langId = model.getLanguageId()
      let result = []
      try {
        if (langId === 'javascript' || langId === 'typescript' ||
            langId === 'javascriptreact' || langId === 'typescriptreact') {
          result = await getTsSymbols(model, langId)
        } else {
          result = getRegexSymbols(model.getValue(), langId)
        }
      } catch (e) {
        console.warn('[outline] parse failed', e)
      }
      if (cancelled) return
      setSymbols(result)
      setLoading(false)
    }

    load()
    // Re-parse on edits, but debounced so we don't run the worker on every keystroke
    let timer = null
    const model = editorRef.current?.getModel?.()
    const disposable = model?.onDidChangeContent(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(load, 500)
    })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      disposable?.dispose()
    }
  }, [activeFile, editorRef])

  function jumpTo(sym) {
    const ed = editorRef?.current
    if (!ed) return
    const line = sym.line || 1
    const col  = sym.column || 1
    ed.revealLineInCenter(line)
    ed.setPosition({ lineNumber: line, column: col })
    ed.focus()
  }

  return (
    <div className="outline-panel">
      <div className="outline-head">
        <span className="outline-title">OUTLINE</span>
        <span className="outline-count">{symbols.length}</span>
      </div>
      <div className="outline-list">
        {loading && symbols.length === 0 && <div className="outline-empty">Parsing…</div>}
        {!loading && symbols.length === 0 && (
          <div className="outline-empty">
            {activeFile ? 'No symbols found in this file' : 'Open a file to see its outline'}
          </div>
        )}
        {symbols.map((s, i) => (
          <div
            key={i}
            className="outline-row"
            style={{ paddingLeft: 6 + (s.depth || 0) * 14 }}
            onClick={() => jumpTo(s)}
            title={s.detail || s.name}
          >
            <span className={`outline-kind kind-${s.kind || 'symbol'}`}>{kindIcon(s.kind)}</span>
            <span className="outline-name">{s.name}</span>
            {s.detail && <span className="outline-detail">{s.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// Use Monaco's TypeScript worker to get a NavigationTree, then flatten.
// This handles JS too — Monaco serves JS and TS through the same worker.
async function getTsSymbols(model, langId) {
  const isTs = langId === 'typescript' || langId === 'typescriptreact'
  const getWorker = isTs
    ? monaco.languages.typescript.getTypeScriptWorker
    : monaco.languages.typescript.getJavaScriptWorker
  if (!getWorker) return []
  const worker = await getWorker()
  const client = await worker(model.uri)
  const tree = await client.getNavigationTree?.(model.uri.toString())
  if (!tree) return []
  const out = []
  flattenNavTree(tree, model, 0, out)
  // The root node is usually the file itself — drop it for a cleaner list
  return out[0]?.kind === 'module' ? out.slice(1) : out
}

function flattenNavTree(node, model, depth, out) {
  // Skip synthetic constructors and self-referential roots
  const skip = !node?.text || node.text === '<global>' || node.text === '"' + (model.uri?.path || '') + '"'
  const span = node.spans?.[0]
  let line = 1, column = 1
  if (span && typeof span.start === 'number') {
    const pos = model.getPositionAt(span.start)
    line = pos.lineNumber
    column = pos.column
  }
  if (!skip) {
    out.push({
      name: node.text,
      kind: tsKindToShort(node.kind),
      detail: node.kindModifiers || '',
      line, column, depth
    })
  }
  for (const c of node.childItems || []) {
    flattenNavTree(c, model, depth + (skip ? 0 : 1), out)
  }
}

function tsKindToShort(k) {
  if (k === 'class' || k === 'local class') return 'class'
  if (k === 'method' || k === 'getter' || k === 'setter') return 'method'
  if (k === 'function' || k === 'local function') return 'function'
  if (k === 'constructor') return 'constructor'
  if (k === 'interface') return 'interface'
  if (k === 'enum' || k === 'enum member') return 'enum'
  if (k === 'type' || k === 'type parameter') return 'type'
  if (k === 'property' || k === 'JSX attribute') return 'property'
  if (k === 'const' || k === 'let' || k === 'var') return 'variable'
  if (k === 'module' || k === 'script') return 'module'
  return 'symbol'
}

// Regex outline for languages without a Monaco worker (Python, Go, Rust,
// Java, C/C++, PHP, Ruby, Lua, etc). Intentionally conservative — we'd
// rather miss a few symbols than show garbage.
function getRegexSymbols(text, langId) {
  const lines = text.split('\n')
  const out = []
  // Per-language rules: regex → kind, name capture group
  const rules = LANG_RULES[langId] || LANG_RULES._default
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const r of rules) {
      const m = line.match(r.re)
      if (m) {
        out.push({
          name: m[r.nameIdx ?? 1],
          kind: r.kind,
          detail: r.detail ? m[r.detail] : '',
          line: i + 1, column: (line.indexOf(m[r.nameIdx ?? 1]) || 0) + 1,
          depth: 0
        })
        break
      }
    }
  }
  return out
}

// Common patterns. \b for word boundaries; capture the symbol name.
const LANG_RULES = {
  python: [
    { re: /^\s*class\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, kind: 'function' }
  ],
  go: [
    { re: /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_]\w*)/, kind: 'function' },
    { re: /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/, kind: 'class' },
    { re: /^\s*type\s+([A-Za-z_]\w*)\s+/, kind: 'type' }
  ],
  rust: [
    { re: /^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?fn\s+([A-Za-z_]\w*)/, kind: 'function' },
    { re: /^\s*(?:pub\s+)?(?:struct|enum|trait|type)\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*impl(?:<[^>]*>)?\s+(?:[\w<>,\s]+\s+for\s+)?([A-Za-z_]\w*)/, kind: 'class' }
  ],
  java: [
    { re: /^\s*(?:public|private|protected|static|final|abstract|\s)*\s*class\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*(?:public|private|protected|static|final|abstract|\s)*\s*interface\s+([A-Za-z_]\w*)/, kind: 'interface' },
    { re: /^\s*(?:public|private|protected|static|final|abstract|\s)+[\w<>[\],\s]+\s+([A-Za-z_]\w*)\s*\(/, kind: 'method' }
  ],
  csharp: [
    { re: /^\s*(?:public|private|protected|internal|static|sealed|abstract|partial|\s)*\s*class\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*(?:public|private|protected|internal|static|\s)*\s*interface\s+([A-Za-z_]\w*)/, kind: 'interface' },
    { re: /^\s*(?:public|private|protected|internal|static|\s)+[\w<>[\],\s]+\s+([A-Za-z_]\w*)\s*\(/, kind: 'method' }
  ],
  cpp: [
    { re: /^\s*(?:class|struct)\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*(?:[\w:&*<>\s]+\s+)?([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:const)?\s*\{/, kind: 'function' }
  ],
  c: [
    { re: /^\s*(?:struct|enum|union)\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*[\w*\s]+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/, kind: 'function' }
  ],
  php: [
    { re: /^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*interface\s+([A-Za-z_]\w*)/, kind: 'interface' },
    { re: /^\s*(?:public|private|protected|static|\s)*\s*function\s+([A-Za-z_]\w*)/, kind: 'function' }
  ],
  ruby: [
    { re: /^\s*class\s+([A-Z]\w*)/, kind: 'class' },
    { re: /^\s*module\s+([A-Z]\w*)/, kind: 'module' },
    { re: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/, kind: 'function' }
  ],
  lua: [
    { re: /^\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)/, kind: 'function' },
    { re: /^\s*([A-Za-z_]\w*)\s*=\s*function/, kind: 'function' }
  ],
  bash: [
    { re: /^\s*(?:function\s+)?([A-Za-z_]\w*)\s*\(\s*\)\s*\{/, kind: 'function' }
  ],
  powershell: [
    { re: /^\s*function\s+([A-Za-z_][\w-]*)/, kind: 'function' },
    { re: /^\s*class\s+([A-Za-z_]\w*)/, kind: 'class' }
  ],
  json: [
    // Top-level keys only — useful for package.json, tsconfig.json, etc.
    { re: /^\s{2,4}"([^"]+)"\s*:/, kind: 'property' }
  ],
  yaml: [
    { re: /^([A-Za-z_][\w-]*)\s*:/, kind: 'property' }
  ],
  markdown: [
    { re: /^(#{1,6})\s+(.+)$/, kind: 'section', nameIdx: 2 }
  ],
  css: [
    { re: /^\s*([.#@]?[A-Za-z_][\w-]*(?:\s*,\s*[.#@]?[A-Za-z_][\w-]*)*)\s*\{/, kind: 'property' }
  ],
  scss: [
    { re: /^\s*([.#@]?[A-Za-z_][\w-]*(?:\s*,\s*[.#@]?[A-Za-z_][\w-]*)*)\s*\{/, kind: 'property' }
  ],
  _default: [
    { re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/, kind: 'function' },
    { re: /^\s*(?:export\s+)?class\s+([A-Za-z_]\w*)/, kind: 'class' },
    { re: /^\s*def\s+([A-Za-z_]\w*)/, kind: 'function' }
  ]
}

const KIND_ICONS = {
  class: 'C', method: 'm', property: 'P', field: 'f',
  constructor: 'c', enum: 'E', interface: 'I', function: 'ƒ',
  variable: 'v', constant: '≡', struct: 'S', event: '!',
  type: 'T', module: 'M', section: '§', symbol: '·'
}
function kindIcon(k) { return KIND_ICONS[k] || '·' }
