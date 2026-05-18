// File icon resolver using the Material Icon Theme manifest.
//
// VS Code's most popular icon theme — pixel-identical icons for ~1200 file
// types (.js, .ts, .py, package.json, Dockerfile, .env, .gitignore, etc.)
// and ~4600 folder names. Bundled at build time via Vite's import.meta.glob
// so the renderer has zero runtime fetches; SVGs are emitted as static
// assets and resolved by URL.

import manifest from 'material-icon-theme/dist/material-icons.json'

// Vite collects every SVG in the icons folder at build time. Each entry is
// the absolute URL to the optimized SVG asset. Path is three levels up from
// this file to reach the project's node_modules (file-icons.js sits at
// src/renderer/src/, so ../../../ is the repo root).
const svgs = import.meta.glob(
  '../../../node_modules/material-icon-theme/icons/*.svg',
  { eager: true, query: '?url', import: 'default' }
)

// Build name → URL from the glob keys (strip path + .svg extension).
const ICON_URLS = {}
for (const [path, url] of Object.entries(svgs)) {
  const name = path.split('/').pop().replace(/\.svg$/, '')
  ICON_URLS[name] = url
}

// Manifest doesn't store .js / .ts / .py etc. directly under fileExtensions
// — those use VS Code language IDs. This map gives us the fallback path
// for common extensions whose icon is registered under languageIds.
const EXT_TO_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyw: 'python', pyi: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  dart: 'dart',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  cs: 'csharp',
  php: 'php',
  pl: 'perl', pm: 'perl',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  bat: 'console', cmd: 'console',
  html: 'html', htm: 'html',
  xml: 'xml',
  css: 'css',
  scss: 'sass', sass: 'sass',
  less: 'less',
  json: 'json', jsonc: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  md: 'markdown', markdown: 'markdown',
  txt: 'text',
  log: 'log',
  sql: 'database',
  lua: 'lua',
  vim: 'vim',
  hs: 'haskell',
  ex: 'elixir', exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure', cljs: 'clojure',
  scala: 'scala',
  ml: 'ocaml',
  fs: 'fsharp', fsx: 'fsharp',
  r: 'r',
  jl: 'julia',
  nim: 'nim',
  zig: 'zig',
  v: 'v',
  groovy: 'groovy', gradle: 'gradle',
  tf: 'terraform', tfvars: 'terraform',
  proto: 'proto',
  graphql: 'graphql', gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro'
}

const DEFAULT_FILE   = manifest.file
const DEFAULT_FOLDER = manifest.folder
const DEFAULT_FOLDER_OPEN = manifest.folderExpanded

// Resolve a filename to an icon name (using manifest lookups), then to a URL.
// Returns null if no SVG is bundled for the resolved icon.
export function iconUrlForFile(filename) {
  if (!filename) return resolveUrl(DEFAULT_FILE)
  const lower = filename.toLowerCase()

  // 1. Full filename match — covers package.json, .gitignore, Dockerfile, etc.
  if (manifest.fileNames[lower]) return resolveUrl(manifest.fileNames[lower])

  // 2. Longest matching multi-segment extension — covers test.jsx, route.ts,
  //    spec.ts, .d.ts, etc. We try progressively shorter suffixes so
  //    "App.test.jsx" matches "test.jsx" before falling back to "jsx".
  const parts = lower.split('.')
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join('.')
    if (manifest.fileExtensions[ext]) return resolveUrl(manifest.fileExtensions[ext])
  }

  // 3. Language fallback — for .js, .ts, .py etc. that are registered under
  //    languageIds rather than fileExtensions.
  const finalExt = parts.at(-1)
  const lang = EXT_TO_LANG[finalExt]
  if (lang && manifest.languageIds[lang]) {
    return resolveUrl(manifest.languageIds[lang])
  }

  // 4. Try the bare extension as an icon name directly (covers icons that
  //    happen to match an extension by name, e.g. css.svg, html.svg).
  if (ICON_URLS[finalExt]) return ICON_URLS[finalExt]

  return resolveUrl(DEFAULT_FILE)
}

export function iconUrlForFolder(name, isExpanded) {
  if (!name) return resolveUrl(isExpanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER)
  const lower = name.toLowerCase()
  const map = isExpanded ? manifest.folderNamesExpanded : manifest.folderNames
  if (map?.[lower]) return resolveUrl(map[lower])
  return resolveUrl(isExpanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER)
}

function resolveUrl(iconName) {
  if (!iconName) return ICON_URLS[DEFAULT_FILE] || null
  return ICON_URLS[iconName] || ICON_URLS[DEFAULT_FILE] || null
}
