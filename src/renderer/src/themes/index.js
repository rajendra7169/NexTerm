export const THEMES = {
  tokyonight: {
    name: 'Tokyo Night',
    bg: '#1a1b26', surface: '#24283b', border: '#414868', accent: '#7aa2f7',
    xterm: {
      background: '#1a1b26', foreground: '#c0caf5',
      cursor: '#c0caf5', cursorAccent: '#1a1b26', selection: '#364A8288',
      black: '#15161e',   red: '#f7768e',   green: '#9ece6a', yellow: '#e0af68',
      blue: '#7aa2f7',    magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e',   brightGreen: '#9ece6a',
      brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',   brightWhite: '#c0caf5'
    }
  },

  dracula: {
    name: 'Dracula',
    bg: '#282a36', surface: '#363948', border: '#6272a4', accent: '#bd93f9',
    xterm: {
      background: '#282a36', foreground: '#f8f8f2',
      cursor: '#f8f8f2', cursorAccent: '#282a36', selection: '#44475a88',
      black: '#21222c',   red: '#ff5555',   green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9',    magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e',   brightGreen: '#69ff94',
      brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',   brightWhite: '#ffffff'
    }
  },

  nord: {
    name: 'Nord',
    bg: '#2e3440', surface: '#3b4252', border: '#4c566a', accent: '#88c0d0',
    xterm: {
      background: '#2e3440', foreground: '#d8dee9',
      cursor: '#d8dee9', cursorAccent: '#2e3440', selection: '#434c5e88',
      black: '#3b4252',   red: '#bf616a',   green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1',    magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a',   brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',   brightWhite: '#eceff4'
    }
  },

  catppuccin: {
    name: 'Catppuccin',
    bg: '#1e1e2e', surface: '#313244', border: '#585b70', accent: '#89b4fa',
    xterm: {
      background: '#1e1e2e', foreground: '#cdd6f4',
      cursor: '#f5e0dc', cursorAccent: '#1e1e2e', selection: '#31324488',
      black: '#45475a',   red: '#f38ba8',   green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa',    magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8',   brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',   brightWhite: '#a6adc8'
    }
  },

  gruvbox: {
    name: 'Gruvbox',
    bg: '#282828', surface: '#3c3836', border: '#504945', accent: '#fabd2f',
    xterm: {
      background: '#282828', foreground: '#ebdbb2',
      cursor: '#ebdbb2', cursorAccent: '#282828', selection: '#3c383688',
      black: '#282828',   red: '#cc241d',   green: '#98971a', yellow: '#d79921',
      blue: '#458588',    magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
      brightBlack: '#928374', brightRed: '#fb4934',   brightGreen: '#b8bb26',
      brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b',
      brightCyan: '#8ec07c',   brightWhite: '#ebdbb2'
    }
  },

  solarizedDark: {
    name: 'Solarized Dark',
    bg: '#002b36', surface: '#073642', border: '#586e75', accent: '#268bd2',
    xterm: {
      background: '#002b36', foreground: '#839496',
      cursor: '#93a1a1', cursorAccent: '#002b36', selection: '#07364288',
      black: '#073642',   red: '#dc322f',   green: '#859900', yellow: '#b58900',
      blue: '#268bd2',    magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16',   brightGreen: '#859900',
      brightYellow: '#b58900', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',   brightWhite: '#fdf6e3'
    }
  },

  solarizedLight: {
    name: 'Solarized Light',
    bg: '#fdf6e3', surface: '#eee8d5', border: '#93a1a1', accent: '#268bd2',
    xterm: {
      background: '#fdf6e3', foreground: '#586e75',
      cursor: '#073642', cursorAccent: '#fdf6e3', selection: '#073642aa',
      // Proper Solarized LIGHT palette: white/brightWhite are DARK so text is readable
      black: '#073642',   red: '#dc322f',   green: '#859900', yellow: '#b58900',
      blue: '#268bd2',    magenta: '#d33682', cyan: '#2aa198', white: '#586e75',
      brightBlack: '#002b36', brightRed: '#cb4b16',   brightGreen: '#586e75',
      brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',   brightWhite: '#073642'
    }
  },

  monokai: {
    name: 'Monokai',
    bg: '#272822', surface: '#3e3d32', border: '#75715e', accent: '#f92672',
    xterm: {
      background: '#272822', foreground: '#f8f8f2',
      cursor: '#f8f8f0', cursorAccent: '#272822', selection: '#49483e88',
      black: '#272822',   red: '#f92672',   green: '#a6e22e', yellow: '#f4bf75',
      blue: '#66d9ef',    magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
      brightBlack: '#75715e', brightRed: '#f92672',   brightGreen: '#a6e22e',
      brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',   brightWhite: '#f9f8f5'
    }
  },

  oneDark: {
    name: 'One Dark',
    bg: '#282c34', surface: '#3e4451', border: '#5c6370', accent: '#61afef',
    xterm: {
      background: '#282c34', foreground: '#abb2bf',
      cursor: '#528bff', cursorAccent: '#282c34', selection: '#3e445188',
      black: '#282c34',   red: '#e06c75',   green: '#98c379', yellow: '#e5c07b',
      blue: '#61afef',    magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75',   brightGreen: '#98c379',
      brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',   brightWhite: '#ffffff'
    }
  },

  synthwave: {
    name: 'Synthwave 84',
    bg: '#2b213a', surface: '#34294f', border: '#495495', accent: '#ff7edb',
    xterm: {
      background: '#2b213a', foreground: '#f9f9f9',
      cursor: '#ff7edb', cursorAccent: '#2b213a', selection: '#34294f88',
      black: '#000000',   red: '#fe4450',   green: '#72f1b8', yellow: '#fede5d',
      blue: '#03edf9',    magenta: '#ff7edb', cyan: '#03edf9', white: '#ffffff',
      brightBlack: '#495495', brightRed: '#fe4450',   brightGreen: '#72f1b8',
      brightYellow: '#fede5d', brightBlue: '#03edf9', brightMagenta: '#ff7edb',
      brightCyan: '#03edf9',   brightWhite: '#ffffff'
    }
  },

  ayuDark: {
    name: 'Ayu Dark',
    bg: '#0b0e14', surface: '#11151c', border: '#475266', accent: '#ffb454',
    xterm: {
      background: '#0b0e14', foreground: '#bfbdb6',
      cursor: '#e6b450', cursorAccent: '#0b0e14', selection: '#475266aa',
      black: '#0b0e14',   red: '#f07178',   green: '#7fd962', yellow: '#e6b450',
      blue: '#59c2ff',    magenta: '#d2a6ff', cyan: '#95e6cb', white: '#bfbdb6',
      brightBlack: '#475266', brightRed: '#f07178',   brightGreen: '#7fd962',
      brightYellow: '#e6b450', brightBlue: '#59c2ff', brightMagenta: '#d2a6ff',
      brightCyan: '#95e6cb',   brightWhite: '#ffffff'
    }
  },

  ayuMirage: {
    name: 'Ayu Mirage',
    bg: '#1f2430', surface: '#232834', border: '#5c6773', accent: '#ffd57f',
    xterm: {
      background: '#1f2430', foreground: '#cbccc6',
      cursor: '#ffcc66', cursorAccent: '#1f2430', selection: '#33415e88',
      black: '#1f2430',   red: '#f28779',   green: '#bae67e', yellow: '#ffd580',
      blue: '#73d0ff',    magenta: '#dfbfff', cyan: '#95e6cb', white: '#cbccc6',
      brightBlack: '#5c6773', brightRed: '#ff3333',   brightGreen: '#a6cc70',
      brightYellow: '#ffcc66', brightBlue: '#5ccfe6', brightMagenta: '#d4bfff',
      brightCyan: '#95e6cb',   brightWhite: '#ffffff'
    }
  },

  githubDark: {
    name: 'GitHub Dark',
    bg: '#0d1117', surface: '#161b22', border: '#30363d', accent: '#58a6ff',
    xterm: {
      background: '#0d1117', foreground: '#c9d1d9',
      cursor: '#58a6ff', cursorAccent: '#0d1117', selection: '#1f6feb44',
      black: '#484f58',   red: '#ff7b72',   green: '#3fb950', yellow: '#d29922',
      blue: '#58a6ff',    magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
      brightBlack: '#6e7681', brightRed: '#ffa198',   brightGreen: '#56d364',
      brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',   brightWhite: '#f0f6fc'
    }
  },

  githubLight: {
    name: 'GitHub Light',
    bg: '#ffffff', surface: '#f6f8fa', border: '#d0d7de', accent: '#0969da',
    xterm: {
      background: '#ffffff', foreground: '#24292f',
      cursor: '#0969da', cursorAccent: '#ffffff', selection: '#0969da33',
      // white/brightWhite are DARK so PSReadLine "default" text is visible on light bg
      black: '#24292f',   red: '#cf222e',   green: '#116329', yellow: '#4d2d00',
      blue: '#0969da',    magenta: '#8250df', cyan: '#1b7c83', white: '#24292f',
      brightBlack: '#57606a', brightRed: '#a40e26',   brightGreen: '#1a7f37',
      brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9',
      brightCyan: '#3192aa',   brightWhite: '#000000'
    }
  },

  rosePine: {
    name: 'Rosé Pine',
    bg: '#191724', surface: '#1f1d2e', border: '#403d52', accent: '#c4a7e7',
    xterm: {
      background: '#191724', foreground: '#e0def4',
      cursor: '#e0def4', cursorAccent: '#191724', selection: '#403d5288',
      black: '#26233a',   red: '#eb6f92',   green: '#31748f', yellow: '#f6c177',
      blue: '#9ccfd8',    magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4',
      brightBlack: '#6e6a86', brightRed: '#eb6f92',   brightGreen: '#31748f',
      brightYellow: '#f6c177', brightBlue: '#9ccfd8', brightMagenta: '#c4a7e7',
      brightCyan: '#ebbcba',   brightWhite: '#e0def4'
    }
  },

  materialOcean: {
    name: 'Material Ocean',
    bg: '#0f111a', surface: '#1a1c25', border: '#464b5d', accent: '#82aaff',
    xterm: {
      background: '#0f111a', foreground: '#8f93a2',
      cursor: '#ffcc00', cursorAccent: '#0f111a', selection: '#1f2233aa',
      black: '#000000',   red: '#f07178',   green: '#c3e88d', yellow: '#ffcb6b',
      blue: '#82aaff',    magenta: '#c792ea', cyan: '#89ddff', white: '#ffffff',
      brightBlack: '#464b5d', brightRed: '#ff5370',   brightGreen: '#c3e88d',
      brightYellow: '#ffcb6b', brightBlue: '#82aaff', brightMagenta: '#c792ea',
      brightCyan: '#89ddff',   brightWhite: '#ffffff'
    }
  },

  cyberpunk: {
    name: 'Cyberpunk',
    bg: '#000b1e', surface: '#0a1a2f', border: '#0abdc6', accent: '#ea00d9',
    xterm: {
      background: '#000b1e', foreground: '#0abdc6',
      cursor: '#ea00d9', cursorAccent: '#000b1e', selection: '#ea00d944',
      black: '#000b1e',   red: '#ff0055',   green: '#00ff9c', yellow: '#f3e600',
      blue: '#0abdc6',    magenta: '#ea00d9', cyan: '#00f5ff', white: '#d7d7d5',
      brightBlack: '#123e7c', brightRed: '#ff0055',   brightGreen: '#00ff9c',
      brightYellow: '#f3e600', brightBlue: '#22b3fb', brightMagenta: '#ff7edb',
      brightCyan: '#00f5ff',   brightWhite: '#ffffff'
    }
  },

  everforest: {
    name: 'Everforest',
    bg: '#2d353b', surface: '#374145', border: '#475258', accent: '#a7c080',
    xterm: {
      background: '#2d353b', foreground: '#d3c6aa',
      cursor: '#d3c6aa', cursorAccent: '#2d353b', selection: '#47525888',
      black: '#475258',   red: '#e67e80',   green: '#a7c080', yellow: '#dbbc7f',
      blue: '#7fbbb3',    magenta: '#d699b6', cyan: '#83c092', white: '#d3c6aa',
      brightBlack: '#5c6a72', brightRed: '#e67e80',   brightGreen: '#a7c080',
      brightYellow: '#dbbc7f', brightBlue: '#7fbbb3', brightMagenta: '#d699b6',
      brightCyan: '#83c092',   brightWhite: '#d3c6aa'
    }
  },

  light: {
    name: 'Light',
    bg: '#fafafa', surface: '#f0f0f0', border: '#d0d0d0', accent: '#4078f2',
    xterm: {
      background: '#fafafa', foreground: '#383a42',
      cursor: '#000000', cursorAccent: '#fafafa', selection: '#a0a0a060',
      // white/brightWhite are DARK so default-foreground text is readable on light bg
      black: '#383a42',   red: '#d73a49',   green: '#22863a', yellow: '#b08800',
      blue: '#0366d6',    magenta: '#6f42c1', cyan: '#005cc5', white: '#383a42',
      brightBlack: '#5a5a5a', brightRed: '#cb2431',   brightGreen: '#28a745',
      brightYellow: '#dbab09', brightBlue: '#0366d6', brightMagenta: '#5a32a3',
      brightCyan: '#1b7c83',   brightWhite: '#000000'
    }
  }
}

export function getTheme(name) {
  return THEMES[name] || THEMES.tokyonight
}
