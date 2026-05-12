// Ollama silent installer.
// 1. Downloads OllamaSetup.exe from ollama.com
// 2. Runs it with /SILENT /SUPPRESSMSGBOXES (Inno Setup convention)
// 3. Emits download/install progress via the provided onProgress callback

import { app } from 'electron'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import https from 'https'
import { spawn } from 'child_process'

const DOWNLOAD_URL = 'https://ollama.com/download/OllamaSetup.exe'

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    function makeRequest(currentUrl, redirectsLeft = 5) {
      const req = https.get(currentUrl, (res) => {
        // Handle 30x redirects (CDN typically does this)
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'))
          const next = res.headers.location
          res.resume()
          return makeRequest(next, redirectsLeft - 1)
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))

        const total = parseInt(res.headers['content-length'], 10) || 0
        let downloaded = 0
        const startTs = Date.now()
        const file = createWriteStream(dest)

        res.on('data', (chunk) => {
          downloaded += chunk.length
          const elapsed = Math.max(0.001, (Date.now() - startTs) / 1000)
          const speed = downloaded / elapsed
          const eta = total > downloaded && speed > 0 ? (total - downloaded) / speed : 0
          onProgress?.({
            phase: 'downloading',
            downloaded, total,
            percent: total ? (downloaded / total) * 100 : 0,
            speedBytesPerSec: speed,
            etaSeconds: eta
          })
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve(dest)))
        file.on('error', (err) => {
          try { unlinkSync(dest) } catch {}
          reject(err)
        })
      })
      req.on('error', reject)
      req.setTimeout(60_000, () => req.destroy(new Error('Timeout')))
    }
    makeRequest(url)
  })
}

function runInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    // Ollama uses Inno Setup; /SILENT and /SUPPRESSMSGBOXES are standard.
    const proc = spawn(installerPath, ['/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Installer exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

export async function installOllama(onProgress) {
  if (process.platform !== 'win32') {
    throw new Error('Auto-install is currently Windows-only')
  }
  const dest = join(app.getPath('temp'), `OllamaSetup-${Date.now()}.exe`)
  onProgress?.({ phase: 'starting', percent: 0 })
  await downloadFile(DOWNLOAD_URL, dest, onProgress)
  onProgress?.({ phase: 'installing', percent: 100 })
  await runInstaller(dest)
  try { unlinkSync(dest) } catch {}
  onProgress?.({ phase: 'done', percent: 100 })
}
