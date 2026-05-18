import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { paneRegistry } from "./Terminal";
import AiSetup from "./AiSetup";
import GpuRuntimeManager from "./GpuRuntimeManager";

// Grab the last N visible lines of the currently active terminal pane.
// Used as automatic context so the user can ask "what does this error mean"
// without copy-pasting.
function captureActivePaneContext(maxLines = 30) {
  try {
    const { tabs, activeId, cwds } = useStore.getState();
    const tab = tabs.find((t) => t.id === activeId);
    const paneId = tab?.activePane;
    if (!paneId) return null;
    const info = paneRegistry.get(paneId);
    if (!info?.xterm) return null;
    const buf = info.xterm.buffer.active;
    const lines = [];
    const start = Math.max(0, buf.length - maxLines);
    for (let i = start; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) {
        const t = line.translateToString(true);
        if (t.trim()) lines.push(t);
      }
    }
    return {
      paneId,
      tabName: tab?.name || "Terminal",
      cwd: cwds[paneId] || "",
      output: lines.join("\n").trim(),
    };
  } catch {
    return null;
  }
}

const CLOUD_PROVIDERS = [
  // 'anthropic' is gated on the Claude extension being installed (see the
  // model picker below). It supports two auth modes: 'cli' (Claude Pro
  // subscription via subprocess) and 'api' (paid Anthropic API key).
  { id: "anthropic", label: "Claude", defaultModel: "claude-sonnet-4-6", extensionId: "anthropic.claude" },
  { id: "groq", label: "Groq", defaultModel: "llama-3.3-70b-versatile" },
  { id: "gemini", label: "Gemini", defaultModel: "gemini-2.0-flash" },
  { id: "cerebras", label: "Cerebras", defaultModel: "llama3.1-8b" },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "meta-llama/llama-3.2-3b-instruct:free",
  },
];

function resolveCloudModel(provider, savedModel) {
  const def = CLOUD_PROVIDERS.find((p) => p.id === provider)?.defaultModel;
  if (!savedModel) return def;
  const m = savedModel.toLowerCase();
  if (provider === "gemini" && !m.startsWith("gemini")) return def;
  if (
    provider === "cerebras" &&
    (m.includes("versatile") || m.includes("/") || m.startsWith("gemini"))
  )
    return def;
  if (provider === "groq" && (m.startsWith("gemini") || m.includes("/")))
    return def;
  if (provider === "openrouter" && !m.includes("/")) return def;
  return savedModel;
}

// Providers + models known to accept images. When the user attaches an image
// with anything else we surface a clear error instead of silently dropping it.
function supportsVision(provider, model) {
  if (provider === "gemini") return /gemini-(2|1\.5)/.test(model || "");
  if (provider === "groq")
    return /vision|llama-3\.2-(11b|90b)/i.test(model || "");
  if (provider === "openrouter")
    return /vision|llava|qwen2-vl|gemini|gpt-4|claude/i.test(model || "");
  return false;
}

// Show a path relative to project root, or shorten an absolute path with
// "…/parent/name" so the strip stays compact.
function shortenForStrip(absPath, projectPath) {
  if (!absPath) return ''
  if (projectPath && absPath.startsWith(projectPath)) {
    return absPath.slice(projectPath.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
  }
  const parts = absPath.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 2) return absPath.replace(/\\/g, '/')
  return '…/' + parts.slice(-2).join('/')
}

const CHAT_SYSTEM = `You are a helpful assistant inside NexTerm, a Windows terminal app.
Be concise. When the user wants a command, give the exact PowerShell command (no markdown fences).
When the user wants an explanation, keep it under 200 words. When the user attaches files, use them
as context. The conversation is multi-turn — earlier messages are visible to you.`;

export default function AiChat({ onClose }) {
  const settings = useStore((s) => s.settings);
  const ai = settings.ai || {};

  const [convs, setConvs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]); // [{name, kind, text/dataBase64, size}]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  // Streaming state — tokens arrive in real time and accumulate here.
  // streamingTools is the live array of tool calls Claude is making this
  // turn (each entry: { id, tool, input, result, isError }). Rendered as
  // inline cards above the streaming text so users see what Claude is
  // doing in real time.
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState([]);
  const [streamId, setStreamId] = useState(null);

  // Auto-captured terminal context (last 30 lines of active pane when chat opened).
  // User can toggle whether to send it with the next message.
  const [termCtx, setTermCtx] = useState(null);
  const [useTermCtx, setUseTermCtx] = useState(true);

  // Resizable width + fullscreen toggle
  const [width, setWidth] = useState(settings.aiChatWidth || 420);
  const [fullscreen, setFullscreen] = useState(false);

  // New composer state: references (current file is auto-added), thinking mode,
  // chat mode (Ask / Agent), and picker visibility.
  const [extraRefs, setExtraRefs] = useState([]);       // [{ path, name }] — user-added references
  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [chatMode, setChatMode] = useState('ask');      // 'ask' | 'agent'
  const [showSetup, setShowSetup] = useState(false);
  // null until first detection finishes. true → at least one AI backend is
  // ready (cloud key, downloaded bundled model, or installed Ollama).
  const [aiConfigured, setAiConfigured] = useState(null);
  // What's actually available — used to filter the model picker so it only
  // shows backends/models the user can actually pick right now.
  const [available, setAvailable] = useState({
    cloudKeys: {},      // { groq: true, gemini: false, anthropic: false, ... }
    bundledModels: [],  // [{ id, name, downloaded }]
    ollamaInstalled: false,
    ollamaRunning: false,
    claudeCli: null     // { bin, version } if Claude Code CLI is installed
  });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const modelPopRef = useRef(null);
  const modePopRef = useRef(null);
  // Refs for the buttons that toggle the popovers so we can exclude them
  // from the outside-click dismiss handler (otherwise the button's own
  // toggle would race against the dismiss).
  const modelBtnRef = useRef(null);
  const modeBtnRef = useRef(null);

  // Derive the project context from the active tab. The AI chat is scoped to
  // the project the user is currently in — even if no file is open yet, the
  // editor tab's projectPath defines the chat context.
  const allTabs = useStore(s => s.tabs);
  const focusedId = useStore(s => s.activeId);
  const currentFile = (() => {
    const t = allTabs.find(t => t.id === focusedId);
    if (t?.type === 'editor') {
      return {
        path: t.activeFile || null,
        name: t.activeFile ? t.activeFile.split(/[\\/]/).pop() : null,
        projectPath: t.projectPath
      };
    }
    // Active tab is terminal. If this window is dominantly a project window
    // (any editor tab exists), still scope chat to that project.
    const ed = allTabs.find(t => t.type === 'editor');
    if (ed) {
      return {
        path: ed.activeFile || null,
        name: ed.activeFile ? ed.activeFile.split(/[\\/]/).pop() : null,
        projectPath: ed.projectPath
      };
    }
    return null;
  })();

  // Effective provider/model — always derived from current settings so the
  // footer toggle switches live. The conversation's stored provider/model
  // is just metadata (shown in history listing); we don't lock to it.
  const activeConv = convs.find((c) => c.id === activeId);
  const mode = ai.mode || "bundled";
  const provider =
    mode === "local"   ? "ollama"  :
    mode === "bundled" ? "bundled" :
    ai.cloud?.provider || "groq";
  const model =
    mode === "local"   ? (ai.local?.model || "qwen2.5-coder:7b") :
    mode === "bundled" ? (ai.bundled?.model || null) :
    resolveCloudModel(provider, ai.cloud?.model);

  // The key under which we remember "which chat is active for this context".
  // Editor mode = the project path; terminal mode = the literal "__terminal__".
  const contextKey = currentFile?.projectPath || '__terminal__';

  // Load conversation list + restore the previously-active chat for THIS
  // context. So closing and reopening the panel resumes the same chat;
  // switching to a different project or terminal-only mode starts a blank
  // chat (unless that context had a previous active chat).
  async function refreshConvs() {
    const opts = currentFile?.projectPath
      ? { projectPath: currentFile.projectPath }
      : { terminalOnly: true };
    const list = await window.nexterm.ai.convList(opts);
    setConvs(list || []);
    // Restore the saved active chat for this context, but only on first mount
    // when nothing is active yet.
    const saved = useStore.getState().settings.aiChatActive?.[contextKey];
    if (saved && (list || []).some(c => c.id === saved)) {
      setActiveId(saved);
    }
  }
  useEffect(() => {
    refreshConvs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextKey]);

  // Persist activeId for this context whenever it changes so close/reopen
  // restores it. Setting null also clears the saved value.
  useEffect(() => {
    useStore.getState().setAiChatActive(contextKey, activeId);
  }, [activeId, contextKey]);

  // Load messages when active conversation changes
  useEffect(() => {
    let cancelled = false;
    if (!activeId) {
      setMessages([]);
      return;
    }
    window.nexterm.ai.msgList(activeId).then((rows) => {
      if (!cancelled) setMessages(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // Focus the textarea + capture current terminal context on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
    setTermCtx(captureActivePaneContext(30));
  }, []);

  // Refresh the context badge whenever the user switches tabs / panes so the
  // line count + tab name stay accurate.
  const activeTabId = useStore((s) => s.activeId);
  const activePaneId = useStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    return tab?.activePane;
  });
  useEffect(() => {
    setTermCtx(captureActivePaneContext(30));
  }, [activeTabId, activePaneId]);

  // Persist width changes (debounced)
  useEffect(() => {
    if (fullscreen) return;
    const t = setTimeout(() => {
      useStore.getState().updateSettings({ aiChatWidth: width });
    }, 400);
    return () => clearTimeout(t);
  }, [width, fullscreen]);

  // Mouse drag on left edge to resize panel width
  function onResizeMouseDown(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev) => {
      // Dragging LEFT increases width, dragging RIGHT shrinks it (panel anchored to right)
      const delta = startX - ev.clientX;
      const next = Math.max(
        280,
        Math.min(window.innerWidth - 200, startW + delta),
      );
      setWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  async function newChat() {
    const c = await window.nexterm.ai.convCreate({
      title: "New chat",
      provider,
      model,
      projectPath: currentFile?.projectPath || null,
    });
    await refreshConvs();
    setActiveId(c.id);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setError(null);
    setShowHistory(false);
  }

  async function deleteChat(id) {
    const ok = await window.nexterm.confirm({
      message: "Delete this conversation?",
      detail: "All messages in it will be removed permanently.",
      danger: true,
    });
    if (!ok) return;
    await window.nexterm.ai.convDelete(id);
    if (activeId === id) setActiveId(null);
    refreshConvs();
  }

  async function pickFile() {
    const r = await window.nexterm.ai.pickFile();
    if (!r?.ok) {
      if (r?.error) setError(r.error);
      return;
    }
    setAttachments((a) => [...a, r]);
  }

  function removeAttachment(idx) {
    setAttachments((a) => a.filter((_, i) => i !== idx));
  }

  // Detect what's available — full picture, so the model picker can show
  // only real options AND we know whether to surface the setup overlay.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = { cloudKeys: {}, bundledModels: [], ollamaInstalled: false, ollamaRunning: false, claudeCli: null }
      try {
        for (const p of ['anthropic', 'groq', 'gemini', 'cerebras', 'openrouter']) {
          const k = await window.nexterm.vault.get(`ai.${p}.apiKey`)
          if (cancelled) return
          next.cloudKeys[p] = !!k
        }
      } catch {}
      // Detect Claude Code CLI (subscription-auth path). Only matters if
      // the Claude extension is installed.
      try {
        next.claudeCli = await window.nexterm.ai.detectClaudeCli?.()
      } catch {}
      try {
        const list = await window.nexterm.ai.bundledList?.()
        if (cancelled) return
        next.bundledModels = (list || []).filter(m => m.downloaded)
      } catch {}
      try {
        const ol = await window.nexterm.ai.detectOllama?.()
        if (cancelled) return
        next.ollamaInstalled = !!ol?.installed
        next.ollamaRunning   = !!ol?.running
      } catch {}
      if (cancelled) return
      setAvailable(next)
      const anyCloud   = Object.values(next.cloudKeys).some(Boolean)
      const anyBundled = next.bundledModels.length > 0
      const anyOllama  = next.ollamaInstalled
      setAiConfigured(anyCloud || anyBundled || anyOllama)
    })()
    return () => { cancelled = true }
  }, [ai.enabled, ai.mode, ai.bundled?.model, ai.cloud?.provider])

  // Dismiss popovers on outside click. Exclude the toggling button itself
  // so its onClick can close the popover (otherwise the dismiss + onClick
  // race re-opens it).
  useEffect(() => {
    if (!modelPickerOpen && !modePickerOpen) return
    function onDoc(e) {
      const t = e.target
      if (modelPickerOpen) {
        const insidePop = modelPopRef.current?.contains(t)
        const onBtn    = modelBtnRef.current?.contains(t)
        if (!insidePop && !onBtn) setModelPickerOpen(false)
      }
      if (modePickerOpen) {
        const insidePop = modePopRef.current?.contains(t)
        const onBtn    = modeBtnRef.current?.contains(t)
        if (!insidePop && !onBtn) setModePickerOpen(false)
      }
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [modelPickerOpen, modePickerOpen])

  // Load file content for any reference file (current file + extras) and
  // inline it into the prompt. Capped per-file at 30k chars to stay sane.
  async function buildReferenceBlock() {
    const refs = []
    if (currentFile?.path) refs.push(currentFile)
    for (const r of extraRefs) if (!refs.some(x => x.path === r.path)) refs.push(r)
    if (refs.length === 0) return ''
    const blocks = []
    for (const r of refs) {
      try {
        const got = await window.nexterm.project.read(r.path)
        if (!got?.ok || got.binary || got.kind === 'image') continue
        const text = (got.text || '').slice(0, 30000)
        blocks.push(`--- ${r.name} ---\n${text}\n--- end ${r.name} ---`)
      } catch {}
    }
    if (blocks.length === 0) return ''
    return '\n\nReference files:\n' + blocks.join('\n\n')
  }

  async function getApiKey(p) {
    try {
      return await window.nexterm.vault.get(`ai.${p}.apiKey`);
    } catch {
      return null;
    }
  }

  async function send() {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    // Only force the setup card when truly nothing is set up. If the user has
    // a backend configured but just disabled AI, that's a different case —
    // we surface a regular error pointing to Settings.
    if (ai.enabled !== true) {
      if (aiConfigured === false) { setShowSetup(true); return }
      setError("AI is disabled. Enable it in Settings → AI.");
      return;
    }

    setError(null);
    setBusy(true);

    // Ensure a conversation exists
    let convId = activeId;
    if (!convId) {
      const c = await window.nexterm.ai.convCreate({
        title: text.slice(0, 40) || "New chat",
        provider,
        model,
        projectPath: currentFile?.projectPath || null,
      });
      convId = c.id;
      await refreshConvs();
      setActiveId(convId);
    } else if (messages.length === 0 && text) {
      // Rename auto-created chat to first user message
      await window.nexterm.ai.convRename({
        id: convId,
        title: text.slice(0, 40),
      });
    }

    // Build the user message (include terminal context + attachments)
    const attMeta = attachments.map((a) => ({
      name: a.name,
      kind: a.kind,
      size: a.size,
      ext: a.ext,
      pageCount: a.pageCount,
    }));
    let userContent = text;

    // Re-capture LIVE terminal context at send time so we see the latest output,
    // not a stale snapshot from when the chat was opened.
    // If the user is asking about an attached file, skip terminal context — it
    // dominates the prompt and pushes the file out of attention.
    const includeTerm = useTermCtx && attachments.length === 0;
    const liveCtx = includeTerm ? captureActivePaneContext(30) : null;
    if (liveCtx?.output) {
      userContent =
        `[Current terminal — tab "${liveCtx.tabName}"${liveCtx.cwd ? `, cwd ${liveCtx.cwd}` : ""}]\n` +
        "```\n" +
        liveCtx.output +
        "\n```\n\n" +
        text;
    }
    // Inline reference files (current editor file + any user-added refs).
    const refBlock = await buildReferenceBlock();
    if (refBlock) userContent = userContent + refBlock;
    const imageAtts = attachments.filter((a) => a.kind === "image");
    if (imageAtts.length > 0 && !supportsVision(provider, model)) {
      setError(
        `Current model (${provider}/${model}) doesn't support images. Switch to Gemini 2.0 Flash, a Groq vision model, or an OpenRouter vision model.`,
      );
      setBusy(false);
      return;
    }
    if (attachments.length > 0) {
      const blocks = attachments
        .map((a) => {
          if (a.kind === "text") {
            const header =
              a.ext === "pdf"
                ? `--- attached PDF: ${a.name} (${a.pageCount || "?"} pages${a.truncated ? ", truncated" : ""}) ---`
                : `--- attached file: ${a.name} ---`;
            return `\n\n${header}\n${a.text}\n--- end ${a.name} ---`;
          }
          if (a.kind === "image") {
            return `\n\n[image attached: ${a.name}]`;
          }
          return "";
        })
        .join("");
      userContent = userContent + blocks;
    }

    // Persist user message
    const userMsg = await window.nexterm.ai.msgAppend({
      conversationId: convId,
      role: "user",
      content: userContent,
      attachments: attMeta,
    });

    // Optimistically render
    const userRow = {
      id: userMsg.id,
      role: "user",
      content: userContent,
      attachments: attMeta,
      created_at: userMsg.created_at,
    };
    setMessages((m) => [...m, userRow]);
    setInput("");
    setAttachments([]);

    // Build prompt with history (last 20 messages to stay under context)
    try {
      let apiKey = null;
      // Claude via Claude Code CLI doesn't need an API key — auth is owned
      // by the CLI's Pro-subscription flow. Detect that mode and skip the
      // API key requirement.
      const extCfg = (settings.extensionConfig || {})['anthropic.claude'] || {};
      const isClaudeCli = provider === 'anthropic' && extCfg.authMode === 'cli';
      if (mode === "cloud" && !isClaudeCli) {
        apiKey = await getApiKey(provider);
        if (!apiKey) {
          setError(`No API key set for ${provider}.`);
          setBusy(false);
          return;
        }
      } else if (mode === "cloud" && isClaudeCli) {
        // Confirm Claude Code CLI is actually installed; otherwise surface
        // a clear actionable error instead of a cryptic subprocess failure.
        const cli = await window.nexterm.ai.detectClaudeCli?.();
        if (!cli) {
          setError('Claude Code CLI not found. Install with: npm i -g @anthropic-ai/claude-code (then run "claude login" once).');
          setBusy(false);
          return;
        }
      } else if (mode === "local") {
        // Ollama-only check — try to AUTO-START the daemon if it's not up.
        let running = await window.nexterm.ai.isOllamaRunning();
        if (!running) {
          // Auto-start in the background. Brief wait for it to come up.
          const sr = await window.nexterm.ai.startOllama();
          if (!sr?.ok) {
            setError(
              sr?.error?.includes('not installed') || sr?.error?.includes("isn't installed")
                ? "Ollama isn't installed. Install it from Settings → AI, or switch to Built-in mode."
                : "Couldn't start Ollama. Open Settings → AI for details, or switch to Built-in mode."
            );
            setBusy(false);
            return;
          }
          running = true;
        }
      } else if (mode === "bundled") {
        // Built-in (node-llama-cpp) — needs a downloaded model selected
        if (!ai.bundled?.model) {
          setError("No built-in model selected. Open Settings → AI → Built-in and download a model.");
          setBusy(false);
          return;
        }
      }
      const history = [...messages, userRow].slice(-20);
      // For Claude via CLI, the subprocess maintains its own session via
      // --resume, so we only send the latest user message. For every other
      // provider we send the rendered chat history as before.
      const isClaudeCliSend = provider === 'anthropic' && extCfg.authMode === 'cli';
      const historyTxt = isClaudeCliSend
        ? userRow.content
        : history
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n\n");

      const t0 = Date.now();
      // Extract images for the multimodal payload — only the current turn's images,
      // not images from earlier messages (those are referenced by name in the text history).
      const imagesPayload = imageAtts.map((a) => ({
        mime: `image/${a.ext === "jpg" ? "jpeg" : a.ext}`,
        dataBase64: a.dataBase64,
      }));
      // Compose the system prompt — adjust based on chat mode + thinking
      let systemPrompt = CHAT_SYSTEM;
      if (chatMode === 'agent') {
        systemPrompt +=
          `\n\nYou are in AGENT MODE. Be action-oriented: when the user describes a goal, ` +
          `write a concrete step-by-step plan, then propose the exact PowerShell commands or ` +
          `file edits needed. Use fenced code blocks for every command so the user can run them ` +
          `with one click. Be terse and specific — don't explain what the user already knows.`;
      } else {
        systemPrompt +=
          `\n\nYou are in ASK MODE. Answer the user's question concisely based on the reference ` +
          `files and terminal context provided. When you suggest a command, put it in a fenced ` +
          `code block so the user can run it directly.`;
      }
      if (thinkingMode) {
        systemPrompt +=
          `\n\nThink step by step before answering. Internally consider edge cases, possible ` +
          `pitfalls, and alternative approaches. Present your reasoning briefly before the final ` +
          `answer (keep it under 200 words of reasoning, then the answer).`;
      }
      // For provider 'anthropic', pick the auth mode from extension config
      // (already loaded above into `extCfg`). 'cli' uses the Claude Code
      // subprocess (Pro subscription), 'api' uses the API key path.
      const authMode = provider === 'anthropic' ? (extCfg.authMode || (apiKey ? 'api' : 'cli')) : undefined
      // cwd is needed for the CLI path so Claude has access to the project files.
      const cwd = currentFile?.projectPath || null
      const r = await window.nexterm.ai.streamStart({
        provider,
        model,
        apiKey,
        authMode,
        cwd,
        // chatMode is 'ask' or 'agent' — Claude CLI uses this to gate
        // which tools it can call (ask = read-only, agent = full).
        chatMode,
        system: systemPrompt,
        // For Claude CLI mode, historyTxt is already just the user's message
        // and we don't append the "Assistant:" marker (CLI is in chat mode).
        prompt: isClaudeCliSend ? historyTxt : historyTxt + "\n\nAssistant:",
        ...(imagesPayload.length > 0 ? { images: imagesPayload } : {}),
      });
      if (!r?.streamId) {
        setError("Failed to start AI stream");
        setBusy(false);
        return;
      }
      setStreamId(r.streamId);
      setStreamingText("");
      setStreamingTools([]);

      // Subscribe to chunk events; resolve when end/error fires
      await new Promise((resolve) => {
        let buf = "";
        let tools = [];   // local snapshot — keeps state setter in sync with the stream
        const off = window.nexterm.ai.onStreamEvent((evt) => {
          if (evt.streamId !== r.streamId) return;
          if (evt.type === "chunk") {
            buf += evt.text;
            setStreamingText(buf);
          } else if (evt.type === "tool_call") {
            tools = [...tools, { id: evt.id, tool: evt.tool, input: evt.input, result: null, isError: false }];
            setStreamingTools(tools);
          } else if (evt.type === "tool_result") {
            tools = tools.map(t => t.id === evt.toolUseId
              ? { ...t, result: evt.text, isError: !!evt.isError }
              : t);
            setStreamingTools(tools);
          } else if (evt.type === "info") {
            // Auto-failover happened — prepend a small notice so it's visible
            // in the streaming bubble.
            buf = `_${evt.text}_\n\n` + buf;
            setStreamingText(buf);
          } else if (evt.type === "end") {
            const reply = buf.trim();
            const wasCancelled = !!evt.cancelled;
            const finalTools = tools;
            off();
            (async () => {
              if (!reply && finalTools.length === 0) {
                if (!wasCancelled) {
                  setError(
                    `Empty response from ${provider}/${model}. Try again or pick a different model.`,
                  );
                }
              } else {
                const content = wasCancelled
                  ? reply + "\n\n_[stopped]_"
                  : reply;
                // Tool events are persisted as JSON in the attachments slot
                // so they re-render when the conversation is reopened.
                const attachments = finalTools.length > 0
                  ? [{ kind: 'tool_calls', data: finalTools }]
                  : undefined;
                const asst = await window.nexterm.ai.msgAppend({
                  conversationId: convId,
                  role: "assistant",
                  content,
                  attachments,
                });
                setMessages((m) => [
                  ...m,
                  {
                    id: asst.id,
                    role: "assistant",
                    content,
                    attachments: attachments || [],
                    created_at: asst.created_at,
                  },
                ]);
              }
              setStreamingText("");
              setStreamingTools([]);
              setStreamId(null);
              console.log(
                `[AiChat] streamed in ${Date.now() - t0}ms${wasCancelled ? " (cancelled)" : ""}`,
              );
              resolve();
            })();
          } else if (evt.type === "error") {
            off();
            setError(evt.error || "Stream error");
            setStreamingText("");
            setStreamingTools([]);
            setStreamId(null);
            resolve();
          }
        });
      });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
      refreshConvs();
    }
  }

  function onInputKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape") onClose();
  }

  function insertIntoTerminal(text) {
    const tab = useStore
      .getState()
      .tabs.find((t) => t.id === useStore.getState().activeId);
    const paneId = tab?.activePane;
    if (paneId) window.nexterm.pty.write(paneId, text);
  }

  async function detachToWindow() {
    // Phase-2 placeholder — separating into its own BrowserWindow requires
    // a second renderer entry point. Surface a helpful note for now.
    await window.nexterm.info({
      message: "Detach to a separate window — coming soon",
      detail:
        "For now you can press the ⛶ Fullscreen button to expand the chat across the whole NexTerm window.",
    });
  }

  return (
    <div
      ref={panelRef}
      className={`ai-chat ${fullscreen ? "fullscreen" : ""}`}
      style={fullscreen ? undefined : { width }}
    >
      {/* Left-edge resize handle */}
      <div
        className="ai-chat-resize"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize"
      />

      {/* First-time setup overlay — only shown when:
            (a) user explicitly opened it via the menu/CTA, OR
            (b) NO AI backend has ever been configured (no cloud key, no
                bundled model downloaded, no Ollama installed).
          If ANY backend exists, we don't get in the user's way — they can
          chat immediately, or switch backends via the options menu. */}
      {(showSetup || (aiConfigured === false && messages.length === 0)) && (
        <div className="ai-chat-setup-overlay">
          <AiSetup
            compact
            onDone={() => setShowSetup(false)}
            onSkip={() => setShowSetup(false)}
          />
        </div>
      )}

      <div className="ai-chat-header">
        <span className="ai-chat-title">
          <span className="ai-chat-icon">✨</span> NexTerm AI
        </span>
        <div className="ai-chat-header-actions">
          <button
            className="ai-chat-icon-btn"
            onClick={() => setShowHistory((s) => !s)}
            title="History"
          >
            🕘
          </button>
          <button
            className="ai-chat-icon-btn"
            onClick={newChat}
            title="New chat"
          >
            ＋
          </button>
          <button
            className="ai-chat-icon-btn"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? "⤢" : "⛶"}
          </button>
          <button
            className="ai-chat-icon-btn"
            onClick={detachToWindow}
            title="Detach to new window (coming soon)"
          >
            ⧉
          </button>
          <button
            className="ai-chat-icon-btn"
            onClick={onClose}
            title="Close (Ctrl+Shift+A)"
          >
            ×
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="ai-chat-history">
          <div className="ai-chat-history-header">Recent conversations</div>
          {convs.length === 0 && (
            <div style={{ padding: 12, fontSize: 11, opacity: 0.5 }}>
              No history yet.
            </div>
          )}
          {convs.map((c) => (
            <div
              key={c.id}
              className={`ai-chat-history-item ${c.id === activeId ? "active" : ""}`}
              onClick={() => {
                setActiveId(c.id);
                setShowHistory(false);
              }}
            >
              <div className="ai-chat-history-title">
                {c.title || "Untitled"}
              </div>
              <div className="ai-chat-history-meta">
                {c.provider}/{c.model.split(/[\\/:]/).pop()} ·{" "}
                {new Date(c.updated_at).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
              <button
                className="ai-chat-history-del"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(c.id);
                }}
                title="Delete conversation"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Terminal-context badge — shown when active pane has output.
          Auto-disabled when files are attached (the file is what you want
          to ask about, terminal would just dominate the prompt). */}
      {/* The old terminal-context badge is replaced by the "⚠ Errors" toggle
          in the new composer below. */}

      {/* First-launch GPU runtime nudge — only renders when bundled AI is
          selected AND no matching GPU runtime is installed yet. Dismisses
          permanently once the user clicks "Not now". The component itself
          handles the visibility logic (returns null when there's nothing
          actionable). */}
      {mode === 'bundled' && !localStorage.getItem('nexterm.gpuBannerDismissed') && (
        <GpuRuntimeManager compact onDismiss={() => {
          localStorage.setItem('nexterm.gpuBannerDismissed', '1')
          // Force a re-render
          setError(e => e)
        }} />
      )}

      <div className="ai-chat-messages" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <div className="ai-chat-empty">
            <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
            <div style={{ fontWeight: 600 }}>How can I help?</div>
            <div
              style={{
                marginTop: 14,
                fontSize: 11,
                opacity: 0.7,
                textAlign: "left",
              }}
            >
              <div style={{ marginBottom: 4 }}>Try:</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>find all .log files modified today</li>
                <li>kill the process on port 3000</li>
                <li>
                  explain this error <em>(then attach the log)</em>
                </li>
                <li>convert this bash command to powershell</li>
              </ul>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} msg={m} onInsert={insertIntoTerminal} />
        ))}
        {busy && (
          <div className="ai-chat-msg ai-chat-msg-assistant">
            <div className="ai-chat-msg-role">Assistant</div>
            {streamingTools.length > 0 && (
              <div className="ai-tools">
                {streamingTools.map(t => <ToolCard key={t.id} tool={t} />)}
              </div>
            )}
            {streamingText ? (
              <Message
                msg={{
                  id: "__streaming__",
                  role: "assistant",
                  content: streamingText,
                  attachments: [],
                }}
                onInsert={insertIntoTerminal}
              />
            ) : streamingTools.length === 0 ? (
              <div className="ai-chat-msg-body ai-chat-thinking">
                <span className="ai-bar-spinner" /> connecting to{" "}
                <strong>{provider}</strong> ({model.split(/[\\/:]/).pop()})…
              </div>
            ) : null}
          </div>
        )}
      </div>

      {error && <div className="ai-chat-error">⚠ {error}</div>}

      {attachments.length > 0 && (
        <div className="ai-chat-attachments">
          {attachments.map((a, i) => (
            <span key={i} className="ai-chat-chip">
              {a.ext === "pdf" ? "📄" : "📎"} {a.name}
              <span style={{ opacity: 0.6 }}>
                {" · "}
                {(a.size / 1024).toFixed(1)} KB
                {a.ext === "pdf" && a.pageCount ? ` · ${a.pageCount}p` : ""}
              </span>
              <button onClick={() => removeAttachment(i)}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* When in terminal-only mode (no editor tab), bring back the simple
          "include terminal output" toggle at the TOP — same as old behaviour. */}
      {!currentFile && termCtx?.output && (
        <div className="ai-term-strip">
          <label>
            <input
              type="checkbox"
              checked={useTermCtx}
              onChange={(e) => setUseTermCtx(e.target.checked)}
            />
            <span>Include current terminal output</span>
          </label>
          <span className="ai-term-strip-meta">{termCtx.tabName} · {termCtx.output.split('\n').length} lines</span>
        </div>
      )}

      {/* Minimal single-strip composer (Claude-style) */}
      <div className="ai-composer-min">
        <div className="ai-composer-min-input">
          <textarea
            ref={inputRef}
            placeholder={busy ? "Working…" : (chatMode === 'agent' ? "Describe a task — Agent will plan & propose" : "Ask anything")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={busy}
            rows={1}
          />
        </div>

        <div className="ai-composer-min-row">
          {/* Left cluster: + add reference, ≡ menu, divider, current file/path */}
          <button
            className="ai-icon-btn"
            onClick={() => {
              if (currentFile?.projectPath) setRefPickerOpen(true)
              else pickFile()  // Fallback to file picker when no project is open
            }}
            disabled={busy}
            title={currentFile?.projectPath ? 'Add reference file from project' : 'Attach a file'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
          </button>

          <button
            ref={modelBtnRef}
            className={`ai-icon-btn ${(thinkingMode || chatMode === 'agent') ? 'on' : ''}`}
            onClick={() => { setModelPickerOpen(o => !o); setModePickerOpen(false) }}
            title="Options · thinking · model · errors · terminal"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2.5" />
              <path d="M10 5l-4 6" />
            </svg>
          </button>

          {busy && (
            <span className="ai-spinner-small" title="Generating…"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="6" strokeDasharray="20 12" /></svg></span>
          )}

          <span className="ai-composer-min-divider" />

          <span
            className="ai-composer-min-file"
            title={(currentFile?.path || extraRefs[0]?.path || 'No reference') + (extraRefs.length ? `\nReferences:\n${extraRefs.map(r => '• ' + r.path).join('\n')}` : '')}
          >
            {currentFile ? (
              <>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ opacity: 0.7 }}><path d="M3 2h7l3 3v9H3z" /><path d="M10 2v3h3" /></svg>
                <span className="ai-composer-min-path">{shortenForStrip(currentFile.path, currentFile.projectPath)}</span>
                {extraRefs.length > 0 && <span className="ai-composer-min-more">+{extraRefs.length}</span>}
              </>
            ) : extraRefs.length > 0 ? (
              <span className="ai-composer-min-path">📎 {extraRefs[0].name}{extraRefs.length > 1 && <span className="ai-composer-min-more"> +{extraRefs.length - 1}</span>}</span>
            ) : (
              <span className="ai-composer-min-empty">No reference</span>
            )}
          </span>

          <span style={{ flex: 1 }} />

          {/* Right cluster: mode chip + send */}
          <button
            ref={modeBtnRef}
            className="ai-composer-min-mode"
            onClick={() => { setModePickerOpen(o => !o); setModelPickerOpen(false) }}
            title="Switch between Ask and Agent modes"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4L2 7l3 3M11 4l3 3-3 3" />
            </svg>
            <span>{chatMode === 'agent' ? 'Agent' : 'Ask'}</span>
          </button>

          {busy && streamId ? (
            <button
              className="ai-composer-min-send danger"
              onClick={() => window.nexterm.ai.streamCancel(streamId)}
              title="Stop generating"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>
            </button>
          ) : (
            <button
              className="ai-composer-min-send"
              onClick={send}
              disabled={busy || (!input.trim() && attachments.length === 0)}
              title={chatMode === 'agent' ? 'Send to Agent' : 'Send'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 14V2M3 7l5-5 5 5" />
              </svg>
            </button>
          )}
        </div>

        {/* Big "options" popover from the ≡ button */}
        {modelPickerOpen && (
          <div className="ai-opts-pop" ref={modelPopRef}>
            <div className="ai-opts-item" onClick={() => { setModelPickerOpen(false); pickFile() }}>
              <span className="ai-opts-icon">📎</span>
              <span className="ai-opts-label">Attach file</span>
              <span className="ai-opts-meta">PDF / image / log</span>
            </div>
            <div className="ai-opts-divider" />
            <div className={`ai-opts-item ${thinkingMode ? 'on' : ''}`} onClick={() => setThinkingMode(t => !t)}>
              <span className="ai-opts-icon">💭</span>
              <span className="ai-opts-label">Thinking mode</span>
              <span className={`ai-opts-switch ${thinkingMode ? 'on' : ''}`} />
            </div>
            <div className={`ai-opts-item ${useTermCtx ? 'on' : ''}`} onClick={() => setUseTermCtx(v => !v)}>
              <span className="ai-opts-icon">⚠</span>
              <span className="ai-opts-label">Read terminal errors</span>
              <span className={`ai-opts-switch ${useTermCtx ? 'on' : ''}`} />
            </div>
            <div className="ai-opts-divider" />
            <div className="ai-opts-section-label">Switch model</div>
            {(() => {
              // Build the list of ACTUALLY available options.
              const installedExt = settings.installedExtensions || []
              const items = []
              for (const p of CLOUD_PROVIDERS) {
                // Some cloud providers are gated behind an extension install
                // (e.g. Claude). Skip them entirely if the extension isn't
                // installed.
                if (p.extensionId && !installedExt.includes(p.extensionId)) continue
                // Show the provider if EITHER a vault API key is present OR
                // an alternative auth path exists (Claude's CLI subscription).
                const hasKey = !!available.cloudKeys[p.id]
                const hasCli = p.id === 'anthropic' && available.claudeCli
                if (!hasKey && !hasCli) continue
                items.push({
                  kind: 'cloud', id: p.id, label: p.label, meta: p.defaultModel,
                  authMode: hasKey ? 'api' : 'cli'
                })
              }
              for (const m of available.bundledModels) {
                items.push({ kind: 'bundled', id: m.id, label: 'Built-in · ' + m.name, meta: 'In-process' })
              }
              if (available.ollamaInstalled) {
                items.push({ kind: 'local', id: 'ollama', label: 'Local · Ollama', meta: ai.local?.model || 'qwen2.5-coder:7b', warn: !available.ollamaRunning && 'Daemon not running' })
              }
              if (items.length === 0) {
                return (
                  <div
                    className="ai-opts-item"
                    onClick={() => { setShowSetup(true); setModelPickerOpen(false) }}
                  >
                    <span className="ai-opts-icon">＋</span>
                    <span className="ai-opts-label">Set up an AI provider</span>
                    <span className="ai-opts-meta">Required</span>
                  </div>
                )
              }
              return items.map(it => {
                const isActive =
                  (it.kind === 'cloud'   && mode === 'cloud'   && provider === it.id) ||
                  (it.kind === 'bundled' && mode === 'bundled' && ai.bundled?.model === it.id) ||
                  (it.kind === 'local'   && mode === 'local')
                return (
                  <div
                    key={it.kind + ':' + it.id}
                    className={`ai-opts-item compact ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (it.kind === 'cloud') {
                        const p = CLOUD_PROVIDERS.find(x => x.id === it.id)
                        // Persist the auth mode so streamStart routes the
                        // request to the right backend (api vs cli).
                        const extensionConfig = { ...(settings.extensionConfig || {}) }
                        if (p.extensionId) {
                          extensionConfig[p.extensionId] = {
                            ...(extensionConfig[p.extensionId] || {}),
                            authMode: it.authMode
                          }
                        }
                        useStore.getState().updateSettings({
                          ai: { ...ai, mode: 'cloud', cloud: { ...(ai.cloud || {}), provider: it.id, model: p?.defaultModel } },
                          extensionConfig
                        })
                      } else if (it.kind === 'bundled') {
                        useStore.getState().updateSettings({ ai: { ...ai, mode: 'bundled', bundled: { ...(ai.bundled || {}), model: it.id } } })
                      } else if (it.kind === 'local') {
                        useStore.getState().updateSettings({ ai: { ...ai, mode: 'local' } })
                      }
                      setModelPickerOpen(false)
                    }}
                  >
                    <span className="ai-opts-tick">{isActive ? '●' : ' '}</span>
                    <span className="ai-opts-label">{it.label}</span>
                    <span className="ai-opts-meta">{it.warn || it.meta}</span>
                  </div>
                )
              })
            })()}
            <div className="ai-opts-divider" />
            <div
              className="ai-opts-item"
              onClick={() => {
                setModelPickerOpen(false)
                const addTab = useStore.getState().addTab
                const t = addTab()
                setTimeout(() => {
                  window.nexterm.pty.write(t.activePane, 'echo "Tip: run \\"claude\\" to launch the Claude CLI here, or use the AI side panel (Ctrl+Shift+A)."\r')
                }, 600)
              }}
            >
              <span className="ai-opts-icon">🖥</span>
              <span className="ai-opts-label">Open NexTerm AI in terminal</span>
              <span className="ai-opts-meta">New tab</span>
            </div>
          </div>
        )}

        {/* Ask / Agent mode picker */}
        {modePickerOpen && (
          <div className="ai-opts-pop ai-opts-pop-right" ref={modePopRef}>
            <div
              className={`ai-opts-item ${chatMode === 'ask' ? 'active' : ''}`}
              onClick={() => { setChatMode('ask'); setModePickerOpen(false) }}
            >
              <span className="ai-opts-icon">💬</span>
              <div style={{ flex: 1 }}>
                <div className="ai-opts-label">Ask mode</div>
                <div className="ai-opts-desc">Answers your questions based on the current file + references. Read-only.</div>
              </div>
            </div>
            <div
              className={`ai-opts-item ${chatMode === 'agent' ? 'active' : ''}`}
              onClick={() => { setChatMode('agent'); setModePickerOpen(false) }}
            >
              <span className="ai-opts-icon">🤖</span>
              <div style={{ flex: 1 }}>
                <div className="ai-opts-label">Agent mode</div>
                <div className="ai-opts-desc">Plans multi-step tasks and proposes commands or file edits in code blocks you can run with one click.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reference file picker — re-uses the project's full file list */}
      {refPickerOpen && currentFile?.projectPath && (
        <ReferenceFilePicker
          projectPath={currentFile.projectPath}
          existingPaths={[currentFile.path, ...extraRefs.map(r => r.path)]}
          onPick={(file) => {
            setExtraRefs(refs => refs.some(r => r.path === file.path) ? refs : [...refs, file])
          }}
          onClose={() => setRefPickerOpen(false)}
        />
      )}
      {refPickerOpen && !currentFile?.projectPath && (
        <div className="qo-backdrop" onMouseDown={() => setRefPickerOpen(false)}>
          <div className="qo-panel" style={{ padding: 30, textAlign: 'center' }} onMouseDown={(e) => e.stopPropagation()}>
            <p>Open a project (Coder mode) first to add reference files.</p>
            <button className="btn-secondary" onClick={() => setRefPickerOpen(false)} style={{ marginTop: 12 }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Reference file picker — fuzzy search over the project's files.
function ReferenceFilePicker({ projectPath, existingPaths, onPick, onClose }) {
  const [files, setFiles] = useState([])
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  useEffect(() => {
    inputRef.current?.focus()
    window.nexterm.project.listAllFiles(projectPath).then(r => {
      if (r?.ok) setFiles(r.items || [])
    })
  }, [projectPath])
  const filtered = !query.trim()
    ? files.slice(0, 200)
    : files.filter(f => f.rel.toLowerCase().includes(query.toLowerCase())).slice(0, 200)
  return (
    <div className="qo-backdrop" onMouseDown={onClose}>
      <div className="qo-panel" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="qo-input"
          placeholder="Add reference file (fuzzy search)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        />
        <div className="qo-list">
          {filtered.length === 0 && <div className="qo-empty">No matching files</div>}
          {filtered.map(f => {
            const already = existingPaths.includes(f.path)
            const slash = f.rel.lastIndexOf('/')
            const name = slash >= 0 ? f.rel.slice(slash + 1) : f.rel
            const dir  = slash >= 0 ? f.rel.slice(0, slash) : ''
            return (
              <div
                key={f.path}
                className={`qo-row ${already ? 'disabled' : ''}`}
                onClick={() => { if (!already) { onPick({ path: f.path, name }); onClose() } }}
                style={already ? { opacity: 0.4 } : undefined}
              >
                <span className="qo-name">{name}</span>
                {dir && <span className="qo-dir">{dir}</span>}
                {already && <span className="qo-dir">· already added</span>}
              </div>
            )
          })}
        </div>
        <div className="qo-footer">
          <span>Click a file to add it as reference</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}

// Inline card for a single Claude tool call (Read, Edit, Write, Bash, ...).
// Shows the tool name + primary input (file path for file ops, command for
// shell), with a collapsible "Show output" toggle that reveals the result.
function ToolCard({ tool }) {
  const [open, setOpen] = useState(false)
  const t = tool.tool || 'tool'
  const inp = tool.input || {}
  // Primary description per tool — file path for file ops, command for Bash,
  // pattern for Grep, etc. Falls back to JSON-stringified input.
  const summary = (() => {
    if (t === 'Read'  || t === 'Edit' || t === 'Write' || t === 'MultiEdit' || t === 'NotebookEdit') return inp.file_path || inp.notebook_path
    if (t === 'Bash' || t === 'BashOutput' || t === 'KillBash') return inp.command || inp.bash_id || ''
    if (t === 'Glob') return inp.pattern || ''
    if (t === 'Grep') return inp.pattern + (inp.path ? ` in ${inp.path}` : '')
    if (t === 'LS')   return inp.path || ''
    if (t === 'WebFetch') return inp.url || ''
    if (t === 'WebSearch') return inp.query || ''
    if (t === 'TodoWrite') return `${(inp.todos || []).length} items`
    return JSON.stringify(inp).slice(0, 100)
  })()
  const done = tool.result !== null && tool.result !== undefined
  const icon = TOOL_ICONS[t] || '⚡'
  return (
    <div className={`ai-tool-card ${tool.isError ? 'err' : ''} ${done ? 'done' : 'pending'}`}>
      <div className="ai-tool-head" onClick={() => done && setOpen(o => !o)} style={{ cursor: done ? 'pointer' : 'default' }}>
        <span className="ai-tool-icon">{icon}</span>
        <span className="ai-tool-name">{t}</span>
        <span className="ai-tool-summary">{summary}</span>
        {!done
          ? <span className="ai-tool-status pending">…</span>
          : tool.isError
            ? <span className="ai-tool-status err">✕</span>
            : <span className="ai-tool-status ok">✓</span>}
        {done && <span className="ai-tool-chev">{open ? '▾' : '▸'}</span>}
      </div>
      {open && done && (
        <pre className="ai-tool-output">{(tool.result || '').slice(0, 8000) + ((tool.result || '').length > 8000 ? '\n…(truncated)' : '')}</pre>
      )}
    </div>
  )
}
const TOOL_ICONS = {
  Read: '📄', Edit: '✎', Write: '✎', MultiEdit: '✎', NotebookEdit: '✎',
  Bash: '▶', BashOutput: '▶', KillBash: '■',
  Glob: '🔍', Grep: '🔍', LS: '📁',
  WebFetch: '🌐', WebSearch: '🌐',
  TodoWrite: '☐'
}

function Message({ msg, onInsert }) {
  const isUser = msg.role === "user";
  // Detect fenced code blocks and render them with an Insert button.
  const parts = parseContent(msg.content);
  // Pull any persisted tool-call attachments (Claude's Read/Edit/Write
  // history) so reopening a conversation re-renders the cards.
  const toolBundle = (msg.attachments || []).find(a => a?.kind === 'tool_calls')
  const persistedTools = toolBundle?.data || []
  return (
    <div className={`ai-chat-msg ai-chat-msg-${msg.role}`}>
      <div className="ai-chat-msg-role">{isUser ? "You" : "Assistant"}</div>
      {persistedTools.length > 0 && (
        <div className="ai-tools">
          {persistedTools.map(t => <ToolCard key={t.id} tool={t} />)}
        </div>
      )}
      <div className="ai-chat-msg-body">
        {parts.map((p, i) =>
          p.type === "code" ? (
            <div key={i} className="ai-chat-code">
              <pre>{p.text}</pre>
              <div className="ai-chat-code-actions">
                <button
                  className="ai-chat-icon-btn"
                  onClick={() => navigator.clipboard.writeText(p.text)}
                  title="Copy"
                >
                  📋
                </button>
                <button
                  className="ai-chat-icon-btn"
                  onClick={() => onInsert(p.text)}
                  title="Insert into terminal"
                >
                  ↳
                </button>
                <button
                  className="ai-chat-icon-btn"
                  onClick={() => onInsert(p.text + "\r")}
                  title="Run in terminal"
                >
                  ▶
                </button>
              </div>
            </div>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </div>
      {msg.attachments?.length > 0 && (
        <div className="ai-chat-msg-att">
          {msg.attachments.map((a, i) => (
            <span key={i} className="ai-chat-chip">
              📎 {a.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function parseContent(s) {
  if (!s) return [{ type: "text", text: "" }];
  const out = [];
  const re = /```(?:\w+)?\n?([\s\S]*?)```/g;
  let last = 0,
    m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last)
      out.push({ type: "text", text: s.slice(last, m.index) });
    out.push({ type: "code", text: m[1] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ type: "text", text: s.slice(last) });
  if (out.length === 0) out.push({ type: "text", text: s });
  return out;
}
