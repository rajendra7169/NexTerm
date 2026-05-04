// Minimal ANSI escape-sequence renderer. Maps SGR color codes to theme CSS vars.

const FG = {
  30: 'var(--c-black, #1a1a1a)',
  31: 'var(--c-red)',
  32: 'var(--c-green)',
  33: 'var(--c-yellow)',
  34: 'var(--c-blue)',
  35: 'var(--c-magenta)',
  36: 'var(--c-cyan)',
  37: 'var(--c-fg, #c0c0c0)',
  90: 'var(--c-bblack, #6b6b6b)',
  91: 'var(--c-bred)',
  92: 'var(--c-bgreen)',
  93: 'var(--c-byellow)',
  94: 'var(--c-bblue)',
  95: 'var(--c-bmagenta)',
  96: 'var(--c-bcyan)',
  97: 'var(--fg, #fff)'
}

function parseAnsi(text) {
  const re = /\x1b\[([0-9;]*)m/g
  const out = []
  let last = 0
  let style = {}
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), style: { ...style } })
    const codes = (m[1] || '0').split(';').map(Number)
    for (const c of codes) {
      if (c === 0) style = {}
      else if (c === 1) style.fontWeight = 700
      else if (FG[c]) style.color = FG[c]
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push({ text: text.slice(last), style: { ...style } })
  return out
}

export default function AnsiText({ lines }) {
  return (
    <pre className="ansi-pre">
      {lines.map((line, i) => (
        <div key={i} className="ansi-line">
          {parseAnsi(line).map((seg, j) => (
            <span key={j} style={seg.style}>{seg.text}</span>
          ))}
          {'\n'}
        </div>
      ))}
    </pre>
  )
}
