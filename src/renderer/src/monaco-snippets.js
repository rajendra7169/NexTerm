// Register a single dynamic completion provider per language id that resolves
// user snippets from the Zustand store on every completion request — so
// editing snippets in Settings shows up instantly without restarting.

import * as monaco from 'monaco-editor'
import { useStore } from './store'

const registered = new Set()

export function ensureSnippetProvider(languageId) {
  if (!languageId || registered.has(languageId)) return
  registered.add(languageId)
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const settings = useStore.getState().settings
      const snippets = settings.coder?.snippets || {}
      const list = [
        ...(snippets[languageId] || []),
        ...(snippets['*'] || [])     // wildcard snippets that apply to every language
      ]
      if (list.length === 0) return { suggestions: [] }
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn
      }
      const suggestions = list.map(s => ({
        label: s.prefix,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: s.body || '',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: s.description || 'NexTerm snippet',
        documentation: s.body,
        range
      }))
      return { suggestions }
    }
  })
}
