import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nexterm', {
  pty: {
    create: (opts)           => ipcRenderer.invoke('pty:create', opts),
    write:  (id, data)       => ipcRenderer.send('pty:write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.invoke('pty:resize', { id, cols, rows }),
    kill:   (id)             => ipcRenderer.invoke('pty:kill', { id }),
    onData: (id, cb) => {
      const ch = `pty:data:${id}`
      const fn = (_, d) => cb(d)
      ipcRenderer.on(ch, fn)
      return () => ipcRenderer.removeListener(ch, fn)
    },
    onExit: (id, cb) => {
      const ch = `pty:exit:${id}`
      const fn = (_, code) => cb(code)
      ipcRenderer.on(ch, fn)
      return () => ipcRenderer.removeListener(ch, fn)
    }
  },

  suggest: {
    on: (id, cb) => {
      const ch = `suggest:${id}`
      const fn = (_, data) => cb(data)
      ipcRenderer.on(ch, fn)
      return () => ipcRenderer.removeListener(ch, fn)
    }
  },

  history: {
    get:   (opts) => ipcRenderer.invoke('history:get', opts),
    clear: ()     => ipcRenderer.invoke('history:clear')
  },

  session: {
    get:   ()   => ipcRenderer.invoke('session:get'),
    save:  (s)  => ipcRenderer.invoke('session:save', s),
    clear: ()   => ipcRenderer.invoke('session:clear')
  },

  cwd: {
    get: (id)     => ipcRenderer.invoke('cwd:get', id),
    on:  (id, cb) => {
      const ch = `cwd:${id}`
      const fn = (_, dir) => cb(dir)
      ipcRenderer.on(ch, fn)
      return () => ipcRenderer.removeListener(ch, fn)
    }
  },

  settings: {
    get:        ()  => ipcRenderer.invoke('settings:get'),
    save:       (s) => ipcRenderer.invoke('settings:save', s),
    path:       ()  => ipcRenderer.invoke('settings:path'),
    reveal:     ()  => ipcRenderer.invoke('settings:reveal'),
    openEditor: ()  => ipcRenderer.invoke('settings:openEditor'),
    export:     ()  => ipcRenderer.invoke('settings:export'),
    import:     ()  => ipcRenderer.invoke('settings:import'),
    reset:      ()  => ipcRenderer.invoke('settings:reset')
  },

  startup: {
    get: ()    => ipcRenderer.invoke('startup:get'),
    set: (on)  => ipcRenderer.invoke('startup:set', on)
  },

  admin: {
    is:                ()   => ipcRenderer.invoke('app:isAdmin'),
    isDev:             ()   => ipcRenderer.invoke('app:isDev'),
    relaunchAsAdmin:   ()   => ipcRenderer.invoke('app:relaunchAsAdmin'),
    relaunchAsUser:    ()   => ipcRenderer.invoke('app:relaunchAsUser')
  },

  profile: {
    list:   ()    => ipcRenderer.invoke('profile:list'),
    add:    (p)   => ipcRenderer.invoke('profile:add', p),
    update: (p)   => ipcRenderer.invoke('profile:update', p),
    delete: (id)  => ipcRenderer.invoke('profile:delete', id)
  },

  vault: {
    list:   ()    => ipcRenderer.invoke('vault:list'),
    get:    (n)   => ipcRenderer.invoke('vault:get', n),
    set:    (p)   => ipcRenderer.invoke('vault:set', p),
    delete: (n)   => ipcRenderer.invoke('vault:delete', n)
  },

  win: {
    minimize:       () => ipcRenderer.send('win:minimize'),
    maximize:       () => ipcRenderer.send('win:maximize'),
    close:          () => ipcRenderer.send('win:close'),
    setOpacity:     (v)  => ipcRenderer.invoke('win:setOpacity', v),
    setAlwaysOnTop: (on) => ipcRenderer.invoke('win:setAlwaysOnTop', on),
    setBlur:        (m)  => ipcRenderer.invoke('win:setBlur', m),
    onMaximizeChange: (cb) => {
      const fn = (_, isMax) => cb(isMax)
      ipcRenderer.on('win:maximized', fn)
      return () => ipcRenderer.removeListener('win:maximized', fn)
    }
  },

  confirm: (opts) => ipcRenderer.invoke('confirm', opts),
  info:    (opts) => ipcRenderer.invoke('info', opts),

  shell: {
    open: (url) => ipcRenderer.send('shell:open', url)
  },

  wsl: {
    list:         ()               => ipcRenderer.invoke('wsl:list'),
    install:      (distro, paneId) => ipcRenderer.invoke('wsl:install', { distro, paneId }),
    installShell: (shell, paneId)  => ipcRenderer.invoke('wsl:installShell', { shell, paneId })
  },

  dialog: {
    saveScrollback: (text) => ipcRenderer.invoke('dialog:saveScrollback', text)
  },

  link: {
    preview: (url) => ipcRenderer.invoke('link:preview', url)
  },

  system: {
    load: () => ipcRenderer.invoke('system:load')
  },

  ai: {
    detectHardware:  ()      => ipcRenderer.invoke('ai:detectHardware'),
    detectOllama:    ()      => ipcRenderer.invoke('ai:detectOllama'),
    isOllamaRunning: ()      => ipcRenderer.invoke('ai:isOllamaRunning'),
    listLocalModels: ()      => ipcRenderer.invoke('ai:listLocalModels'),
    complete:        (opts)  => ipcRenderer.invoke('ai:complete', opts),
    testProvider:    (opts)  => ipcRenderer.invoke('ai:testProvider', opts),
    systemPrompts:   ()      => ipcRenderer.invoke('ai:systemPrompts'),
    installOllama:   ()      => ipcRenderer.invoke('ai:installOllama'),
    startOllama:     ()      => ipcRenderer.invoke('ai:startOllama'),
    pullModel:       (name)  => ipcRenderer.invoke('ai:pullModel', name),
    deleteModel:     (name)  => ipcRenderer.invoke('ai:deleteModel', name),
    onInstallProgress: (cb) => {
      const fn = (_, p) => cb(p)
      ipcRenderer.on('ai:installProgress', fn)
      return () => ipcRenderer.removeListener('ai:installProgress', fn)
    },
    onPullProgress: (cb) => {
      const fn = (_, p) => cb(p)
      ipcRenderer.on('ai:pullProgress', fn)
      return () => ipcRenderer.removeListener('ai:pullProgress', fn)
    },
    // Conversation history
    convList:   ()       => ipcRenderer.invoke('ai:conv:list'),
    convCreate: (opts)   => ipcRenderer.invoke('ai:conv:create', opts),
    convRename: (opts)   => ipcRenderer.invoke('ai:conv:rename', opts),
    convDelete: (id)     => ipcRenderer.invoke('ai:conv:delete', id),
    msgList:    (convId) => ipcRenderer.invoke('ai:msg:list', convId),
    msgAppend:  (opts)   => ipcRenderer.invoke('ai:msg:append', opts),
    pickFile:   ()       => ipcRenderer.invoke('ai:file:pick')
  },

  workspace: {
    load: (dir) => ipcRenderer.invoke('workspace:load', dir)
  },

  record: {
    start:  (opts) => ipcRenderer.invoke('record:start', opts),
    stop:   (opts) => ipcRenderer.invoke('record:stop', opts),
    status: (opts) => ipcRenderer.invoke('record:status', opts)
  },

  replay: {
    open: () => ipcRenderer.invoke('replay:open')
  },

  sftp: {
    connect:    (profile) => ipcRenderer.invoke('sftp:connect', profile),
    list:       (connId, path)            => ipcRenderer.invoke('sftp:list', { connId, path }),
    realpath:   (connId, path)            => ipcRenderer.invoke('sftp:realpath', { connId, path }),
    download:   (connId, remotePath)      => ipcRenderer.invoke('sftp:download', { connId, remotePath }),
    upload:     (connId, remoteDir, localPath) => ipcRenderer.invoke('sftp:upload', { connId, remoteDir, localPath }),
    delete:     (connId, path, isDir)     => ipcRenderer.invoke('sftp:delete', { connId, path, isDir }),
    rename:     (connId, oldPath, newPath)=> ipcRenderer.invoke('sftp:rename', { connId, oldPath, newPath }),
    disconnect: (connId)                  => ipcRenderer.invoke('sftp:disconnect', { connId })
  },

  git: {
    info: (path) => ipcRenderer.invoke('git:info', path)
  },

  quake: {
    apply: (opts) => ipcRenderer.invoke('quake:apply', opts)
  },

  explorer: {
    install:   () => ipcRenderer.invoke('explorer:installContextMenu'),
    uninstall: () => ipcRenderer.invoke('explorer:uninstallContextMenu')
  },

  notify: {
    show: (opts) => ipcRenderer.invoke('notify:show', opts)
  },

  app: {
    initialCwd: () => ipcRenderer.invoke('app:initialCwd')
  },

  banner: {
    get:          (opts) => ipcRenderer.invoke('banner:get', opts),
    getLogos:     ()     => ipcRenderer.invoke('banner:logos'),
    renderCustom: (opts) => ipcRenderer.invoke('banner:renderCustom', opts)
  },

  ctx: {
    show:     (opts) => ipcRenderer.send('ctx:show', opts),
    onAction: (cb)   => {
      const fn = (_, data) => cb(data)
      ipcRenderer.on('ctx:action', fn)
      return () => ipcRenderer.removeListener('ctx:action', fn)
    }
  }
})
