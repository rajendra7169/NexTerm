// Register languages that Monaco doesn't ship out of the box.
// Add more here as users hit them.

import * as monaco from 'monaco-editor'

// ─── Dart ─────────────────────────────────────────────────────────────
monaco.languages.register({ id: 'dart', extensions: ['.dart'], aliases: ['Dart', 'dart'] })

monaco.languages.setMonarchTokensProvider('dart', {
  defaultToken: '',
  tokenPostfix: '.dart',

  keywords: [
    'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class',
    'const', 'continue', 'covariant', 'default', 'deferred', 'do', 'dynamic',
    'else', 'enum', 'export', 'extends', 'extension', 'external', 'factory',
    'false', 'final', 'finally', 'for', 'Function', 'get', 'hide', 'if',
    'implements', 'import', 'in', 'interface', 'is', 'late', 'library',
    'mixin', 'new', 'null', 'on', 'operator', 'part', 'required', 'rethrow',
    'return', 'set', 'show', 'static', 'super', 'switch', 'sync', 'this',
    'throw', 'true', 'try', 'typedef', 'var', 'void', 'while', 'with', 'yield'
  ],
  builtins: [
    'int', 'double', 'String', 'bool', 'List', 'Map', 'Set', 'num', 'Object',
    'Iterable', 'Future', 'Stream', 'print', 'Widget', 'StatelessWidget',
    'StatefulWidget', 'BuildContext', 'State', 'runApp', 'MaterialApp',
    'Scaffold', 'AppBar', 'Text', 'Container', 'Column', 'Row', 'Center'
  ],
  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||',
    '++', '--', '+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>', '+=',
    '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '??', '??=', '..', '?.', '...'
  ],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|u\{[0-9A-Fa-f]+\})/,

  tokenizer: {
    root: [
      // Annotations
      [/@[a-zA-Z_]\w*/, 'annotation'],

      // Identifiers and keywords
      [/[a-zA-Z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@builtins': 'type.identifier',
          '@default':  'identifier'
        }
      }],

      // Whitespace and comments
      { include: '@whitespace' },

      // Delimiters and operators
      [/[{}()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],

      [/[;,.]/, 'delimiter'],

      // Strings — handle multi-line raw and regular
      [/r"""/, { token: 'string', next: '@string_raw_triple_double' }],
      [/r'''/, { token: 'string', next: '@string_raw_triple_single' }],
      [/"""/,  { token: 'string', next: '@string_triple_double' }],
      [/'''/,  { token: 'string', next: '@string_triple_single' }],
      [/r"/,   { token: 'string', next: '@string_raw_double' }],
      [/r'/,   { token: 'string', next: '@string_raw_single' }],
      [/"/,    { token: 'string', next: '@string_double' }],
      [/'/,    { token: 'string', next: '@string_single' }]
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/\/.*$/, 'comment.doc'],
      [/\/\/.*$/, 'comment']
    ],
    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment']
    ],

    string_double: [
      [/[^\\"$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./,      'string.escape.invalid'],
      [/\$\{/,     { token: 'delimiter.bracket', next: '@interp_block' }],
      [/\$[a-zA-Z_]\w*/, 'variable.predefined'],
      [/"/,        { token: 'string', next: '@pop' }]
    ],
    string_single: [
      [/[^\\'$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./,      'string.escape.invalid'],
      [/\$\{/,     { token: 'delimiter.bracket', next: '@interp_block' }],
      [/\$[a-zA-Z_]\w*/, 'variable.predefined'],
      [/'/,        { token: 'string', next: '@pop' }]
    ],
    string_triple_double: [
      [/[^"$]+/, 'string'],
      [/\$\{/, { token: 'delimiter.bracket', next: '@interp_block' }],
      [/\$[a-zA-Z_]\w*/, 'variable.predefined'],
      [/"""/, { token: 'string', next: '@pop' }],
      [/"/, 'string']
    ],
    string_triple_single: [
      [/[^'$]+/, 'string'],
      [/\$\{/, { token: 'delimiter.bracket', next: '@interp_block' }],
      [/\$[a-zA-Z_]\w*/, 'variable.predefined'],
      [/'''/, { token: 'string', next: '@pop' }],
      [/'/, 'string']
    ],
    string_raw_double:        [[/[^"]+/, 'string'], [/"/, { token: 'string', next: '@pop' }]],
    string_raw_single:        [[/[^']+/, 'string'], [/'/, { token: 'string', next: '@pop' }]],
    string_raw_triple_double: [[/[^"]+/, 'string'], [/"""/, { token: 'string', next: '@pop' }], [/"/, 'string']],
    string_raw_triple_single: [[/[^']+/, 'string'], [/'''/, { token: 'string', next: '@pop' }], [/'/, 'string']],

    interp_block: [
      [/}/, { token: 'delimiter.bracket', next: '@pop' }],
      { include: 'root' }
    ]
  }
})

monaco.languages.setLanguageConfiguration('dart', {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string', 'comment'] }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ]
})

console.log('[Monaco] extra languages registered: dart')
