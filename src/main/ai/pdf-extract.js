// Extract text from a PDF file using pdfjs-dist (legacy Node build).
// Returns { text, pageCount, truncated } — text capped at CHAR_LIMIT to keep AI prompts bounded.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const CHAR_LIMIT = 50_000

let pdfjsLib = null
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib
  // Legacy build is what runs in plain Node (no DOM).
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs v5 needs a worker file path even for the fake worker fallback.
  // Resolve the worker module from node_modules.
  const req = createRequire(import.meta.url)
  const workerPath = req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
  return pdfjsLib
}

export async function extractPdfText(filePath) {
  const lib = await loadPdfjs()
  const buf = readFileSync(filePath)
  // pdfjs needs a Uint8Array (not a Buffer that shares memory with other things).
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice()
  const doc = await lib.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false
  }).promise

  const pageCount = doc.numPages
  const pages = []
  let total = 0
  let truncated = false

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const tc = await page.getTextContent()
    // Join items, inserting newlines at significant y-coordinate jumps.
    let pageText = ''
    let lastY = null
    for (const it of tc.items) {
      const y = it.transform?.[5]
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) pageText += '\n'
      pageText += it.str
      if (it.hasEOL) pageText += '\n'
      else pageText += ' '
      lastY = y
    }
    pageText = pageText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    pages.push(`--- Page ${i} ---\n${pageText}`)
    total += pageText.length
    page.cleanup()
    if (total > CHAR_LIMIT) {
      truncated = true
      break
    }
  }

  await doc.cleanup()
  await doc.destroy()

  let text = pages.join('\n\n')
  if (text.length > CHAR_LIMIT) {
    text = text.slice(0, CHAR_LIMIT) + '\n…[truncated]'
    truncated = true
  }
  return { text, pageCount, truncated }
}
