// Build BOTH installer variants for a release:
//   - NexTerm-Setup-X.Y.Z.exe          (slim "online" — recommended default)
//   - NexTerm-Setup-X.Y.Z-offline.exe  (full offline with all GPU runtimes)
//
// Strategy: read package.json, snapshot its `build.files` array, run
// electron-builder twice with different exclusion sets, restore the
// original on the way out (so the git tree is clean).
//
// Run: node build-installers.mjs

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const pkgPath = join(root, 'package.json')
const original = readFileSync(pkgPath, 'utf8')
const pkg = JSON.parse(original)
const version = pkg.version

// Restore package.json on any exit so we don't leave it in a temp state.
process.on('exit',   () => writeFileSync(pkgPath, original))
process.on('SIGINT', () => process.exit(130))

function setBuildFiles(files, artifactName) {
  const next = JSON.parse(JSON.stringify(pkg))
  next.build.files = files
  next.build.win.artifactName = artifactName
  writeFileSync(pkgPath, JSON.stringify(next, null, 2))
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } })
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)))
  })
}

const BASE_EXCLUDES = [
  "out/**/*",
  "package.json",
  "!**/*.{ts,tsx,map,d.ts}",
  "!**/*.{md,markdown,txt}",
  "!**/{test,tests,__tests__,docs,example,examples,coverage}/**",
  "!**/.{git,github,vscode,idea}/**"
]

// SLIM: exclude all platform-specific @node-llama-cpp packages except the
// CPU-only win-x64 base. GPU runtimes are downloaded on first launch.
const SLIM_FILES = [
  ...BASE_EXCLUDES,
  "!node_modules/@node-llama-cpp/win-x64-cuda/**",
  "!node_modules/@node-llama-cpp/win-x64-cuda-ext/**",
  "!node_modules/@node-llama-cpp/win-x64-vulkan/**",
  "!node_modules/@node-llama-cpp/win-arm64/**",
  "!node_modules/@node-llama-cpp/mac-*/**",
  "!node_modules/@node-llama-cpp/linux-*/**"
]

// OFFLINE: include every Windows variant so the app works fully without
// any download. Still skip cross-platform variants (mac/linux) — they're
// useless on a Windows installer.
const OFFLINE_FILES = [
  ...BASE_EXCLUDES,
  "!node_modules/@node-llama-cpp/win-arm64/**",
  "!node_modules/@node-llama-cpp/mac-*/**",
  "!node_modules/@node-llama-cpp/linux-*/**"
]

async function main() {
  console.log(`\n=== Building SLIM installer (v${version}) ===\n`)
  setBuildFiles(SLIM_FILES, 'NexTerm-Setup-${version}.${ext}')
  // Pre-clean to avoid mixing artifacts between builds.
  for (const f of ['NexTerm-Setup-' + version + '.exe', 'NexTerm-Setup-' + version + '-offline.exe']) {
    const p = join(root, 'release', f)
    if (existsSync(p)) unlinkSync(p)
  }
  await run('npx', ['electron-vite', 'build'])
  await run('npx', ['electron-builder', '--win'])

  console.log(`\n=== Building OFFLINE installer (v${version}) ===\n`)
  setBuildFiles(OFFLINE_FILES, 'NexTerm-Setup-${version}-offline.${ext}')
  await run('npx', ['electron-builder', '--win'])

  writeFileSync(pkgPath, original)
  console.log('\n=== Done — release artifacts ===')
  for (const f of ['NexTerm-Setup-' + version + '.exe', 'NexTerm-Setup-' + version + '-offline.exe']) {
    const p = join(root, 'release', f)
    if (existsSync(p)) {
      const { statSync } = await import('node:fs')
      const size = statSync(p).size
      console.log(`  ${(size / 1024 / 1024).toFixed(1)} MB  ${f}`)
    }
  }
}

main().catch(err => {
  writeFileSync(pkgPath, original)
  console.error(err)
  process.exit(1)
})
