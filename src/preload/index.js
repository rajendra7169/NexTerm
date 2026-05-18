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
    reset:      ()  => ipcRenderer.invoke('settings:reset'),
    onChanged: (cb) => {
      const fn = (_, s) => cb(s)
      ipcRenderer.on('settings:changed', fn)
      return () => ipcRenderer.removeListener('settings:changed', fn)
    }
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

  window: {
    openWith: (opts) => ipcRenderer.invoke('window:openWith', opts)
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
    load:       () => ipcRenderer.invoke('system:load'),
    liveCounts: () => ipcRenderer.invoke('system:liveCounts')
  },

  tray: {
    setEnabled: (on)   => ipcRenderer.invoke('tray:setEnabled', on),
    setTabs:    (tabs) => ipcRenderer.send('tray:setTabs', tabs),
    onFocusTab: (cb) => {
      const fn = (_, id) => cb(id)
      ipcRenderer.on('tray:focusTab', fn)
      return () => ipcRenderer.removeListener('tray:focusTab', fn)
    },
    onNewTab: (cb) => {
      const fn = () => cb()
      ipcRenderer.on('tray:newTab', fn)
      return () => ipcRenderer.removeListener('tray:newTab', fn)
    }
  },

  ai: {
    detectHardware:  ()      => ipcRenderer.invoke('ai:detectHardware'),
    detectOllama:    ()      => ipcRenderer.invoke('ai:detectOllama'),
    isOllamaRunning: ()      => ipcRenderer.invoke('ai:isOllamaRunning'),
    listLocalModels: ()      => ipcRenderer.invoke('ai:listLocalModels'),
    detectClaudeCli: ()      => ipcRenderer.invoke('ai:detectClaudeCli'),
    claudeLogin:     ()      => ipcRenderer.invoke('ai:claudeLogin'),
    complete:        (opts)  => ipcRenderer.invoke('ai:complete', opts),
    streamStart:     (opts)  => ipcRenderer.invoke('ai:stream:start', opts),
    streamCancel:    (id)    => ipcRenderer.invoke('ai:stream:cancel', id),
    onStreamEvent:   (cb) => {
      const fn = (_, evt) => cb(evt)
      ipcRenderer.on('ai:stream:event', fn)
      return () => ipcRenderer.removeListener('ai:stream:event', fn)
    },
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
    // Bundled in-process engine (node-llama-cpp) — no Ollama needed.
    bundled: {
      list:      ()   => ipcRenderer.invoke('aiBundled:list'),
      recommend: ()   => ipcRenderer.invoke('aiBundled:recommend'),
      loaded:    ()   => ipcRenderer.invoke('aiBundled:loaded'),
      load:      (id) => ipcRenderer.invoke('aiBundled:load', id),
      unload:    ()   => ipcRenderer.invoke('aiBundled:unload'),
      download:  (id) => ipcRenderer.invoke('aiBundled:download', id),
      remove:    (id) => ipcRenderer.invoke('aiBundled:remove', id)
    },
    bundledList:      ()    => ipcRenderer.invoke('aiBundled:list'),
    bundledRecommend: ()    => ipcRenderer.invoke('aiBundled:recommend'),
    bundledLoaded:    ()    => ipcRenderer.invoke('aiBundled:loaded'),
    bundledLoad:      (id)  => ipcRenderer.invoke('aiBundled:load', id),
    bundledUnload:    ()    => ipcRenderer.invoke('aiBundled:unload'),
    bundledDownload:  (id)  => ipcRenderer.invoke('aiBundled:download', id),
    bundledRemove:    (id)  => ipcRenderer.invoke('aiBundled:remove', id),
    bundledCancel:    (id)  => ipcRenderer.invoke('aiBundled:cancel', id),
    applyMode: (opts)       => ipcRenderer.invoke('ai:applyMode', opts || {}),
    bundledPartial:   (id)  => ipcRenderer.invoke('aiBundled:partial', id),
    onBundledProgress: (cb) => {
      const fn = (_, p) => cb(p)
      ipcRenderer.on('aiBundled:progress', fn)
      return () => ipcRenderer.removeListener('aiBundled:progress', fn)
    },

    convList:   (opts)   => ipcRenderer.invoke('ai:conv:list', opts || {}),
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

  project: {
    pickFolder: ()                => ipcRenderer.invoke('project:pickFolder'),
    list:       (dir)             => ipcRenderer.invoke('project:list', dir),
    read:       (path)            => ipcRenderer.invoke('project:read', path),
    write:      (path, text)      => ipcRenderer.invoke('project:write', { path, text }),
    create:     (path, isDir)     => ipcRenderer.invoke('project:create', { path, isDir }),
    delete:     (path)            => ipcRenderer.invoke('project:delete', path),
    rename:     (from, to)        => ipcRenderer.invoke('project:rename', { from, to }),
    watch:      (dir)             => ipcRenderer.invoke('project:watch', dir),
    unwatch:    (dir)             => ipcRenderer.invoke('project:unwatch', dir),
    listAllFiles: (dir)           => ipcRenderer.invoke('project:listAllFiles', dir),
    search:     (dir, query, options) => ipcRenderer.invoke('project:search', { dir, query, options }),
    loadWorkspaceConfig: (dir)    => ipcRenderer.invoke('project:loadWorkspaceConfig', dir),
    saveWorkspaceConfig: (dir, config) => ipcRenderer.invoke('project:saveWorkspaceConfig', { dir, config }),
    installCli:   ()              => ipcRenderer.invoke('project:installCli'),
    onFsEvent:  (cb) => {
      const fn = (_, data) => cb(data)
      ipcRenderer.on('project:fsEvent', fn)
      return () => ipcRenderer.removeListener('project:fsEvent', fn)
    }
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

  // Coder mode Source Control panel
  gitc: {
    status:      (dir)               => ipcRenderer.invoke('gitc:status', dir),
    init:        (dir)               => ipcRenderer.invoke('gitc:init', dir),
    stage:       (dir, paths)        => ipcRenderer.invoke('gitc:stage', { dir, paths }),
    unstage:     (dir, paths)        => ipcRenderer.invoke('gitc:unstage', { dir, paths }),
    stageAll:    (dir)               => ipcRenderer.invoke('gitc:stageAll', dir),
    discard:     (dir, path)         => ipcRenderer.invoke('gitc:discard', { dir, path }),
    commit:      (dir, message, stageAll) => ipcRenderer.invoke('gitc:commit', { dir, message, stageAll }),
    log:         (dir, limit)        => ipcRenderer.invoke('gitc:log', { dir, limit }),
    diffFile:    (dir, path, staged) => ipcRenderer.invoke('gitc:diffFile', { dir, path, staged }),
    diffStaged:  (dir)               => ipcRenderer.invoke('gitc:diffStaged', dir),
    fileMarkers: (dir, path)         => ipcRenderer.invoke('gitc:fileMarkers', { dir, path }),
    push:        (dir, setUpstream)  => ipcRenderer.invoke('gitc:push', { dir, setUpstream }),
    pull:        (dir)               => ipcRenderer.invoke('gitc:pull', dir),
    fetch:       (dir)               => ipcRenderer.invoke('gitc:fetch', dir),
    commitDiff:  (dir, hash)         => ipcRenderer.invoke('gitc:commitDiff', { dir, hash }),
    // Branches
    listBranches: (dir)              => ipcRenderer.invoke('gitc:listBranches', dir),
    checkout:    (dir, branch, createFromRemote) => ipcRenderer.invoke('gitc:checkout', { dir, branch, createFromRemote }),
    createBranch:(dir, name)         => ipcRenderer.invoke('gitc:createBranch', { dir, name }),
    renameBranch:(dir, oldName, newName) => ipcRenderer.invoke('gitc:renameBranch', { dir, oldName, newName }),
    // Stash
    stashList:   (dir)               => ipcRenderer.invoke('gitc:stashList', dir),
    stashPush:   (dir, message, includeUntracked) => ipcRenderer.invoke('gitc:stashPush', { dir, message, includeUntracked }),
    stashApply:  (dir, ref, pop)     => ipcRenderer.invoke('gitc:stashApply', { dir, ref, pop }),
    stashDrop:   (dir, ref)          => ipcRenderer.invoke('gitc:stashDrop', { dir, ref }),
    // Working tree reset
    discardAll:  (dir, includeUntracked) => ipcRenderer.invoke('gitc:discardAll', { dir, includeUntracked }),
    // Conflicts
    resolveConflict: (dir, path, side) => ipcRenderer.invoke('gitc:resolveConflict', { dir, path, side }),
    // Blame
    blame:       (dir, path)         => ipcRenderer.invoke('gitc:blame', { dir, path }),
    // Per-commit ops
    revert:      (dir, hash)         => ipcRenderer.invoke('gitc:revert', { dir, hash }),
    cherryPick:  (dir, hash)         => ipcRenderer.invoke('gitc:cherryPick', { dir, hash }),
    // gitignore
    gitignoreAdd:(dir, pattern)      => ipcRenderer.invoke('gitc:gitignoreAdd', { dir, pattern })
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
    initialCwd:     () => ipcRenderer.invoke('app:initialCwd'),
    initialProject: () => ipcRenderer.invoke('app:initialProject')
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
