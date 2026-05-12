// Configure Monaco to use bundled workers. Without this, Monaco tries to
// load workers from a CDN at runtime, which fails in Electron + Vite.
// Vite's `?worker` import returns a Worker constructor for the chunk.
//
// If real workers fail to instantiate (CSP, file:// quirks, etc.), Monaco
// will still render — just without IntelliSense / error checking for that
// language. We catch and log so the editor never crashes.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker   from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker    from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker   from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker     from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Fallback no-op worker if a real worker constructor throws.
const NOOP_WORKER_URL = URL.createObjectURL(
  new Blob(['self.onmessage = () => {};'], { type: 'application/javascript' })
)
function safeWorker(Ctor, label) {
  try { return new Ctor() }
  catch (e) {
    console.warn(`[Monaco] worker for "${label}" failed, falling back to no-op:`, e?.message || e)
    return new Worker(NOOP_WORKER_URL)
  }
}

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return safeWorker(JsonWorker, label)
    if (label === 'css' || label === 'scss' || label === 'less') return safeWorker(CssWorker, label)
    if (label === 'html' || label === 'handlebars' || label === 'razor') return safeWorker(HtmlWorker, label)
    if (label === 'typescript' || label === 'javascript') return safeWorker(TsWorker, label)
    return safeWorker(EditorWorker, 'editor')
  }
}
console.log('[Monaco] worker env configured (real workers + no-op fallback)')
