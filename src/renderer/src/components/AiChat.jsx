import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { paneRegistry } from './Terminal'

// Grab the last N visible lines of the currently active terminal pane.
// Used as automatic context so the user can ask "what does this error mean"
// without copy-pasting.
function captureActivePaneContext(maxLines = 30) {
  try {
    const { tabs, activeId, cwds } = useStore.getState()
    const tab    = tabs.find(t => t.id === activeId)
    const paneId = tab?.activePane
    if (!paneId) return null
    const info = paneRegistry.get(paneId)
    if (!info?.xterm) return null
    const buf = info.xterm.buffer.active
    const lines = []
    const start = Math.max(0, buf.length - maxLines)
    for (let i = start; i < buf.length; i++) {
      const line = buf.getLine(i)
      if (line) {
        const t = line.translateToString(true)
        if (t.trim()) lines.push(t)
      }
    }
    return {
      paneId,
      tabName: tab?.name || 'Terminal',
      cwd:     cwds[paneId] || '',
      output:  lines.join('\n').trim()
    }
  } catch { return null }
}

const CLOUD_PROVIDERS = [
  { id: 'groq',       label: 'Groq',       defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'gemini',     label: 'Gemini',     defaultModel: 'gemini-2.0-flash' },
  { id: 'cerebras',   label: 'Cerebras',   defaultModel: 'llama3.1-8b' },
  { id: 'openrouter', label: 'OpenRouter', defaultModel: 'meta-llama/llama-3.2-3b-instruct:free' }
]

function resolveCloudModel(provider, savedModel) {
  const def = CLOUD_PROVIDERS.find(p => p.id === provider)?.defaultModel
  if (!savedModel) return def
  const m = savedModel.toLowerCase()
  if (provider === 'gemini'     && !m.startsWith('gemini'))                         return def
  if (provider === 'cerebras'   && (m.includes('versatile') || m.includes('/') || m.startsWith('gemini'))) return def
  if (provider === 'groq'       && (m.startsWith('gemini') || m.includes('/')))    return def
  if (provider === 'openrouter' && !m.includes('/'))                                return def
  return savedModel
}

// Providers + models known to accept images. When the user attaches an image
// with anything else we surface a clear error instead of silently dropping it.
function supportsVision(provider, model) {
  if (provider === 'gemini') return /gemini-(2|1\.5)/.test(model || '')
  if (provider === 'groq')   return /vision|llama-3\.2-(11b|90b)/i.test(model || '')
  if (provider === 'openrouter') return /vision|llava|qwen2-vl|gemini|gpt-4|claude/i.test(model || '')
  return false
}

const CHAT_SYSTEM = `You are a helpful assistant inside NexTerm, a Windows terminal app.
Be concise. When the user wants a command, give the exact PowerShell command (no markdown fences).
When the user wants an explanation, keep it under 200 words. When the user attaches files, use them
as context. The conversation is multi-turn — earlier messages are visible to you.`

export default function AiChat({ onClose }) {
  const settings  = useStore(s => s.settings)
  const ai        = settings.ai || {}

  const [convs,    setConvs]    = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [attachments, setAttachments] = useState([])  // [{name, kind, text/dataBase64, size}]
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  // Streaming state — tokens arrive in real time and accumulate here
  const [streamingText, setStreamingText] = useState('')
  const [streamId, setStreamId] = useState(null)

  // Auto-captured terminal context (last 30 lines of active pane when chat opened).
  // User can toggle whether to send it with the next message.
  const [termCtx, setTermCtx] = useState(null)
  const [useTermCtx, setUseTermCtx] = useState(true)

  // Resizable width + fullscreen toggle
  const [width, setWidth] = useState(settings.aiChatWidth || 420)
  const [fullscreen, setFullscreen] = useState(false)

  const scrollRef = useRef(null)
  const inputRef  = useRef(null)
  const panelRef  = useRef(null)

  // Effective provider/model — always derived from current settings so the
  // footer toggle switches live. The conversation's stored provider/model
  // is just metadata (shown in history listing); we don't lock to it.
  const activeConv = convs.find(c => c.id === activeId)
  const mode     = ai.mode || 'cloud'
  const provider = mode === 'local' ? 'ollama' : (ai.cloud?.provider || 'groq')
  const model    = mode === 'local' ? (ai.local?.model || 'qwen2.5-coder:7b')
                                    : resolveCloudModel(provider, ai.cloud?.model)

  // Load conversation list
  async function refreshConvs() {
    const list = await window.nexterm.ai.convList()
    setConvs(list || [])
    if (list?.length && !activeId) setActiveId(list[0].id)
  }
  useEffect(() => { refreshConvs() }, [])

  // Load messages when active conversation changes
  useEffect(() => {
    let cancelled = false
    if (!activeId) { setMessages([]); return }
    window.nexterm.ai.msgList(activeId).then(rows => {
      if (!cancelled) setMessages(rows || [])
    })
    return () => { cancelled = true }
  }, [activeId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, busy])

  // Focus the textarea + capture current terminal context on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
    setTermCtx(captureActivePaneContext(30))
  }, [])

  // Refresh the context badge whenever the user switches tabs / panes so the
  // line count + tab name stay accurate.
  const activeTabId  = useStore(s => s.activeId)
  const activePaneId = useStore(s => {
    const tab = s.tabs.find(t => t.id === s.activeId)
    return tab?.activePane
  })
  useEffect(() => {
    setTermCtx(captureActivePaneContext(30))
  }, [activeTabId, activePaneId])

  // Persist width changes (debounced)
  useEffect(() => {
    if (fullscreen) return
    const t = setTimeout(() => {
      useStore.getState().updateSettings({ aiChatWidth: width })
    }, 400)
    return () => clearTimeout(t)
  }, [width, fullscreen])

  // Mouse drag on left edge to resize panel width
  function onResizeMouseDown(e) {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev) => {
      // Dragging LEFT increases width, dragging RIGHT shrinks it (panel anchored to right)
      const delta = startX - ev.clientX
      const next = Math.max(280, Math.min(window.innerWidth - 200, startW + delta))
      setWidth(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function newChat() {
    const c = await window.nexterm.ai.convCreate({
      title: 'New chat',
      provider, model
    })
    await refreshConvs()
    setActiveId(c.id)
    setMessages([])
    setInput('')
    setAttachments([])
    setError(null)
    setShowHistory(false)
  }

  async function deleteChat(id) {
    const ok = await window.nexterm.confirm({
      message: 'Delete this conversation?',
      detail: 'All messages in it will be removed permanently.',
      danger: true
    })
    if (!ok) return
    await window.nexterm.ai.convDelete(id)
    if (activeId === id) setActiveId(null)
    refreshConvs()
  }

  async function pickFile() {
    const r = await window.nexterm.ai.pickFile()
    if (!r?.ok) {
      if (r?.error) setError(r.error)
      return
    }
    setAttachments(a => [...a, r])
  }

  function removeAttachment(idx) {
    setAttachments(a => a.filter((_, i) => i !== idx))
  }

  async function getApiKey(p) {
    try { return await window.nexterm.vault.get(`ai.${p}.apiKey`) } catch { return null }
  }

  async function send() {
    const text = input.trim()
    if (!text && attachments.length === 0) return
    if (ai.enabled !== true) { setError('AI is disabled. Open Settings → AI to enable it.'); return }

    setError(null); setBusy(true)

    // Ensure a conversation exists
    let convId = activeId
    if (!convId) {
      const c = await window.nexterm.ai.convCreate({
        title: text.slice(0, 40) || 'New chat',
        provider, model
      })
      convId = c.id
      await refreshConvs()
      setActiveId(convId)
    } else if (messages.length === 0 && text) {
      // Rename auto-created chat to first user message
      await window.nexterm.ai.convRename({ id: convId, title: text.slice(0, 40) })
    }

    // Build the user message (include terminal context + attachments)
    const attMeta = attachments.map(a => ({ name: a.name, kind: a.kind, size: a.size, ext: a.ext, pageCount: a.pageCount }))
    let userContent = text

    // Re-capture LIVE terminal context at send time so we see the latest output,
    // not a stale snapshot from when the chat was opened.
    // If the user is asking about an attached file, skip terminal context — it
    // dominates the prompt and pushes the file out of attention.
    const includeTerm = useTermCtx && attachments.length === 0
    const liveCtx = includeTerm ? captureActivePaneContext(30) : null
    if (liveCtx?.output) {
      userContent =
        `[Current terminal — tab "${liveCtx.tabName}"${liveCtx.cwd ? `, cwd ${liveCtx.cwd}` : ''}]\n` +
        '```\n' + liveCtx.output + '\n```\n\n' +
        text
    }
    const imageAtts = attachments.filter(a => a.kind === 'image')
    if (imageAtts.length > 0 && !supportsVision(provider, model)) {
      setError(`Current model (${provider}/${model}) doesn't support images. Switch to Gemini 2.0 Flash, a Groq vision model, or an OpenRouter vision model.`)
      setBusy(false)
      return
    }
    if (attachments.length > 0) {
      const blocks = attachments.map(a => {
        if (a.kind === 'text') {
          const header = a.ext === 'pdf'
            ? `--- attached PDF: ${a.name} (${a.pageCount || '?'} pages${a.truncated ? ', truncated' : ''}) ---`
            : `--- attached file: ${a.name} ---`
          return `\n\n${header}\n${a.text}\n--- end ${a.name} ---`
        }
        if (a.kind === 'image') {
          return `\n\n[image attached: ${a.name}]`
        }
        return ''
      }).join('')
      userContent = userContent + blocks
    }

    // Persist user message
    const userMsg = await window.nexterm.ai.msgAppend({
      conversationId: convId,
      role: 'user',
      content: userContent,
      attachments: attMeta
    })

    // Optimistically render
    const userRow = { id: userMsg.id, role: 'user', content: userContent, attachments: attMeta, created_at: userMsg.created_at }
    setMessages(m => [...m, userRow])
    setInput('')
    setAttachments([])

    // Build prompt with history (last 20 messages to stay under context)
    try {
      let apiKey = null
      if (mode === 'cloud') {
        apiKey = await getApiKey(provider)
        if (!apiKey) { setError(`No API key set for ${provider}.`); setBusy(false); return }
      } else {
        const running = await window.nexterm.ai.isOllamaRunning()
        if (!running) { setError('Ollama daemon not running.'); setBusy(false); return }
      }
      const history = [...messages, userRow].slice(-20)
      const historyTxt = history.map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
      ).join('\n\n')

      const t0 = Date.now()
      // Extract images for the multimodal payload — only the current turn's images,
      // not images from earlier messages (those are referenced by name in the text history).
      const imagesPayload = imageAtts.map(a => ({
        mime: `image/${a.ext === 'jpg' ? 'jpeg' : a.ext}`,
        dataBase64: a.dataBase64
      }))
      const r = await window.nexterm.ai.streamStart({
        provider, model, apiKey,
        system: CHAT_SYSTEM,
        prompt: historyTxt + '\n\nAssistant:',
        ...(imagesPayload.length > 0 ? { images: imagesPayload } : {})
      })
      if (!r?.streamId) {
        setError('Failed to start AI stream')
        setBusy(false)
        return
      }
      setStreamId(r.streamId)
      setStreamingText('')

      // Subscribe to chunk events; resolve when end/error fires
      await new Promise(resolve => {
        let buf = ''
        const off = window.nexterm.ai.onStreamEvent((evt) => {
          if (evt.streamId !== r.streamId) return
          if (evt.type === 'chunk') {
            buf += evt.text
            setStreamingText(buf)
          } else if (evt.type === 'info') {
            // Auto-failover happened — prepend a small notice so it's visible
            // in the streaming bubble.
            buf = `_${evt.text}_\n\n` + buf
            setStreamingText(buf)
          } else if (evt.type === 'end') {
            const reply = buf.trim()
            const wasCancelled = !!evt.cancelled
            off()
            ;(async () => {
              if (!reply) {
                if (!wasCancelled) {
                  setError(`Empty response from ${provider}/${model}. Try again or pick a different model.`)
                }
              } else {
                const content = wasCancelled ? reply + '\n\n_[stopped]_' : reply
                const asst = await window.nexterm.ai.msgAppend({
                  conversationId: convId,
                  role: 'assistant',
                  content
                })
                setMessages(m => [...m, {
                  id: asst.id, role: 'assistant',
                  content, attachments: [],
                  created_at: asst.created_at
                }])
              }
              setStreamingText('')
              setStreamId(null)
              console.log(`[AiChat] streamed in ${Date.now() - t0}ms${wasCancelled ? ' (cancelled)' : ''}`)
              resolve()
            })()
          } else if (evt.type === 'error') {
            off()
            setError(evt.error || 'Stream error')
            setStreamingText('')
            setStreamId(null)
            resolve()
          }
        })
      })
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setBusy(false)
      refreshConvs()
    }
  }

  function onInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    if (e.key === 'Escape') onClose()
  }

  function insertIntoTerminal(text) {
    const tab = useStore.getState().tabs.find(t => t.id === useStore.getState().activeId)
    const paneId = tab?.activePane
    if (paneId) window.nexterm.pty.write(paneId, text)
  }

  async function detachToWindow() {
    // Phase-2 placeholder — separating into its own BrowserWindow requires
    // a second renderer entry point. Surface a helpful note for now.
    await window.nexterm.info({
      message: 'Detach to a separate window — coming soon',
      detail: 'For now you can press the ⛶ Fullscreen button to expand the chat across the whole NexTerm window.'
    })
  }

  return (
    <div
      ref={panelRef}
      className={`ai-chat ${fullscreen ? 'fullscreen' : ''}`}
      style={fullscreen ? undefined : { width }}
    >
      {/* Left-edge resize handle */}
      <div className="ai-chat-resize" onMouseDown={onResizeMouseDown} title="Drag to resize" />

      <div className="ai-chat-header">
        <span className="ai-chat-title">
          <span className="ai-chat-icon">✨</span> NexTerm AI
        </span>
        <div className="ai-chat-header-actions">
          <button className="ai-chat-icon-btn" onClick={() => setShowHistory(s => !s)} title="History">🕘</button>
          <button className="ai-chat-icon-btn" onClick={newChat} title="New chat">＋</button>
          <button className="ai-chat-icon-btn" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? '⤢' : '⛶'}
          </button>
          <button className="ai-chat-icon-btn" onClick={detachToWindow} title="Detach to new window (coming soon)">⧉</button>
          <button className="ai-chat-icon-btn" onClick={onClose} title="Close (Ctrl+Shift+A)">×</button>
        </div>
      </div>

      {showHistory && (
        <div className="ai-chat-history">
          <div className="ai-chat-history-header">Recent conversations</div>
          {convs.length === 0 && <div style={{ padding: 12, fontSize: 11, opacity: 0.5 }}>No history yet.</div>}
          {convs.map(c => (
            <div
              key={c.id}
              className={`ai-chat-history-item ${c.id === activeId ? 'active' : ''}`}
              onClick={() => { setActiveId(c.id); setShowHistory(false) }}
            >
              <div className="ai-chat-history-title">{c.title || 'Untitled'}</div>
              <div className="ai-chat-history-meta">
                {c.provider}/{c.model.split(/[\\/:]/).pop()} · {new Date(c.updated_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </div>
              <button
                className="ai-chat-history-del"
                onClick={(e) => { e.stopPropagation(); deleteChat(c.id) }}
                title="Delete conversation"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Terminal-context badge — shown when active pane has output.
          Auto-disabled when files are attached (the file is what you want
          to ask about, terminal would just dominate the prompt). */}
      {termCtx?.output && (
        <div className="ai-chat-ctx-badge" style={attachments.length > 0 ? { opacity: 0.5 } : undefined}>
          <label className="ai-chat-ctx-toggle">
            <input
              type="checkbox"
              checked={useTermCtx && attachments.length === 0}
              disabled={attachments.length > 0}
              onChange={e => setUseTermCtx(e.target.checked)}
            />
            <span>
              {attachments.length > 0
                ? 'Terminal output muted while a file is attached'
                : 'Include current terminal output with my next message'}
            </span>
          </label>
          <span className="ai-chat-ctx-meta" title={termCtx.output}>
            {termCtx.tabName} · {termCtx.output.split('\n').length} lines
          </span>
        </div>
      )}

      <div className="ai-chat-messages" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <div className="ai-chat-empty">
            <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
            <div style={{ fontWeight: 600 }}>How can I help?</div>
            <div style={{ marginTop: 14, fontSize: 11, opacity: 0.7, textAlign: 'left' }}>
              <div style={{ marginBottom: 4 }}>Try:</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>find all .log files modified today</li>
                <li>kill the process on port 3000</li>
                <li>explain this error <em>(then attach the log)</em></li>
                <li>convert this bash command to powershell</li>
              </ul>
            </div>
          </div>
        )}
        {messages.map(m => (
          <Message key={m.id} msg={m} onInsert={insertIntoTerminal} />
        ))}
        {busy && (
          <div className="ai-chat-msg ai-chat-msg-assistant">
            <div className="ai-chat-msg-role">Assistant</div>
            {streamingText ? (
              <Message msg={{ id: '__streaming__', role: 'assistant', content: streamingText, attachments: [] }} onInsert={insertIntoTerminal} />
            ) : (
              <div className="ai-chat-msg-body ai-chat-thinking">
                <span className="ai-bar-spinner" /> connecting to <strong>{provider}</strong> ({model.split(/[\\/:]/).pop()})…
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="ai-chat-error">⚠ {error}</div>}

      {attachments.length > 0 && (
        <div className="ai-chat-attachments">
          {attachments.map((a, i) => (
            <span key={i} className="ai-chat-chip">
              {a.ext === 'pdf' ? '📄' : '📎'} {a.name}
              <span style={{ opacity: 0.6 }}>
                {' · '}{(a.size/1024).toFixed(1)} KB
                {a.ext === 'pdf' && a.pageCount ? ` · ${a.pageCount}p` : ''}
              </span>
              <button onClick={() => removeAttachment(i)}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className="ai-chat-composer">
        <button className="ai-chat-icon-btn" onClick={pickFile} title="Attach a file as context" disabled={busy}>
          📎
        </button>
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          placeholder={busy ? 'Working…' : 'Ask anything'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onInputKeyDown}
          disabled={busy}
          rows={1}
        />
        {busy && streamId ? (
          <button
            className="btn-danger ai-chat-send"
            onClick={() => window.nexterm.ai.streamCancel(streamId)}
            title="Stop generating"
          >
            ◼
          </button>
        ) : (
          <button
            className="btn-primary ai-chat-send"
            onClick={send}
            disabled={busy || (!input.trim() && attachments.length === 0)}
          >
            {busy ? '…' : '↗'}
          </button>
        )}
      </div>

      <div className="ai-chat-footer">
        <span className="ai-chat-mode" title="Change in Settings → AI">
          {mode === 'cloud'
            ? <>☁ <strong>{provider}</strong> · {model}</>
            : <>💻 <strong>Ollama</strong> · {model}</>}
        </span>
        <button className="ai-chat-mode-switch" onClick={() => {
          const next = mode === 'cloud' ? 'local' : 'cloud'
          useStore.getState().updateSettings({ ai: { ...ai, mode: next } })
        }} title="Quick switch local ↔ cloud">
          {mode === 'cloud' ? '→ local' : '→ cloud'}
        </button>
      </div>
    </div>
  )
}

function Message({ msg, onInsert }) {
  const isUser = msg.role === 'user'
  // Detect fenced code blocks and render them with an Insert button.
  const parts = parseContent(msg.content)
  return (
    <div className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
      <div className="ai-chat-msg-role">{isUser ? 'You' : 'Assistant'}</div>
      <div className="ai-chat-msg-body">
        {parts.map((p, i) =>
          p.type === 'code' ? (
            <div key={i} className="ai-chat-code">
              <pre>{p.text}</pre>
              <div className="ai-chat-code-actions">
                <button className="ai-chat-icon-btn" onClick={() => navigator.clipboard.writeText(p.text)} title="Copy">📋</button>
                <button className="ai-chat-icon-btn" onClick={() => onInsert(p.text)} title="Insert into terminal">↳</button>
                <button className="ai-chat-icon-btn" onClick={() => onInsert(p.text + '\r')} title="Run in terminal">▶</button>
              </div>
            </div>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
      </div>
      {msg.attachments?.length > 0 && (
        <div className="ai-chat-msg-att">
          {msg.attachments.map((a, i) => <span key={i} className="ai-chat-chip">📎 {a.name}</span>)}
        </div>
      )}
    </div>
  )
}

function parseContent(s) {
  if (!s) return [{ type: 'text', text: '' }]
  const out = []
  const re = /```(?:\w+)?\n?([\s\S]*?)```/g
  let last = 0, m
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: s.slice(last, m.index) })
    out.push({ type: 'code', text: m[1] })
    last = re.lastIndex
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) })
  if (out.length === 0) out.push({ type: 'text', text: s })
  return out
}
