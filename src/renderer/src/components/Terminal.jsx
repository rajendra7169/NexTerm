import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ImageAddon } from "@xterm/addon-image";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store";
import { getTheme } from "../themes";
import { matchKey, getKey } from "../shortcuts";
import SearchBar from "./SearchBar";

// Cross-tab registry: Find component reads from this to search every xterm
export const paneRegistry = new Map(); // paneId → { xterm, tabId, name }

// Show a small preview card next to a hovered URL. Cached title fetches.
const linkTitleCache = new Map();   // url → title (or null)
async function fetchTitle(url) {
  if (linkTitleCache.has(url)) return linkTitleCache.get(url);
  try {
    const r = await window.nexterm.link.preview(url);
    linkTitleCache.set(url, r?.title || null);
    return r?.title || null;
  } catch {
    linkTitleCache.set(url, null);
    return null;
  }
}
function showLinkCard(event, uri, ref) {
  let card = ref.current;
  if (!card) {
    card = document.createElement("div");
    card.className = "link-hover-card";
    document.body.appendChild(card);
    ref.current = card;
  }
  const u = (() => { try { return new URL(uri); } catch { return null; } })();
  const host = u?.host || uri;
  card.innerHTML = `<div class="lh-host">${host}</div><div class="lh-url">${uri}</div><div class="lh-title">…</div>`;
  card.style.left = `${event.clientX + 12}px`;
  card.style.top  = `${event.clientY + 12}px`;
  card.style.display = "block";
  fetchTitle(uri).then(title => {
    if (!ref.current) return;
    const t = ref.current.querySelector(".lh-title");
    if (t) t.textContent = title || "(no title)";
  });
}
function hideLinkCard(ref) {
  if (ref.current) ref.current.style.display = "none";
}

// Draw the scrollback minimap. One pixel row per terminal line, colored by
// content density; "error"-looking lines get a red marker stripe.
const ERROR_RE = /\b(error|err|fail|failed|fatal|exception|panic|denied)\b/i;
function drawMinimap(xterm, canvas) {
  if (!canvas || !xterm) return;
  const buf = xterm.buffer.active;
  const total = buf.length;
  if (total === 0) return;
  const W = canvas.clientWidth || 12;
  const H = canvas.clientHeight || 200;
  if (canvas.width !== W * 2 || canvas.height !== H * 2) {
    canvas.width  = W * 2;
    canvas.height = H * 2;
  }
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.clearRect(0, 0, W, H);
  // Background tint
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, 0, W, H);
  // Each canvas row covers `step` terminal lines
  const step = total / H;
  for (let y = 0; y < H; y++) {
    const lineIdx = Math.floor(y * step);
    const line = buf.getLine(lineIdx);
    if (!line) continue;
    const text = line.translateToString(true);
    if (!text) continue;
    const density = Math.min(1, text.length / xterm.cols);
    const isError = ERROR_RE.test(text);
    if (isError) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
      ctx.fillRect(0, y, W, 1);
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.50 * density})`;
      ctx.fillRect(2, y, Math.max(2, W - 4), 1);
    }
  }
  // Viewport indicator
  const vpY = (buf.viewportY / Math.max(1, total - xterm.rows)) * (H - (xterm.rows / step));
  const vpH = (xterm.rows / step);
  ctx.fillStyle = "rgba(96, 165, 250, 0.35)";
  ctx.fillRect(0, vpY, W, Math.max(4, vpH));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Replay an asciinema events stream into an xterm with original timing
function playReplay(xterm, events) {
  if (!events || events.length === 0) return;
  xterm.write("\r\n\x1b[36m[Replay starting]\x1b[0m\r\n");
  let i = 0;
  const start = Date.now();
  function tick() {
    const now = (Date.now() - start) / 1000;
    while (i < events.length && events[i].t <= now) {
      try { xterm.write(events[i].data); } catch {}
      i++;
    }
    if (i < events.length) {
      const next = (events[i].t - now) * 1000;
      setTimeout(tick, Math.max(8, Math.min(2000, next)));
    } else {
      xterm.write("\r\n\x1b[36m[Replay finished]\x1b[0m\r\n");
    }
  }
  tick();
}

// Convert any CSS color (hex / rgb / rgba) to an rgba with the given alpha.
function withAlpha(color, alpha) {
  if (!color) return `rgba(0,0,0,${alpha})`;
  const hex = String(color).match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  return color; // already rgba/rgb — leave alone
}

// Detect light themes by checking the bg luminance — light themes need a more
// solid xterm bg or text becomes unreadable on top of OS blur / image layers.
function isLightBg(hex) {
  const m = String(hex).match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  // Perceptual luminance
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

// Override theme colors with user customizations.
// transparentBg = use a translucent THEME-tinted background (preserves text contrast)
function applyCustomColors(themeXterm, custom = {}, transparentBg = false) {
  const out = { ...themeXterm };
  const c = custom || {};
  if (c.background) {
    out.background = c.background;
  } else if (transparentBg) {
    // Light themes need higher alpha (more solid) for text to stay readable
    const alpha = isLightBg(themeXterm.background) ? 0.78 : 0.45;
    out.background = withAlpha(themeXterm.background, alpha);
  }
  if (c.foreground) {
    out.foreground = c.foreground;
    // PSReadLine renders typed text using the "white" ANSI color, NOT theme.foreground.
    // Override white + brightWhite so the user's chosen Foreground color actually
    // applies to text they type (otherwise it only affects banner/output).
    out.white = c.foreground;
    out.brightWhite = c.foreground;
  }
  if (c.cursor) out.cursor = c.cursor;
  if (c.cursorAccent) out.cursorAccent = c.cursorAccent;
  if (c.selectionBackground) {
    out.selection = c.selectionBackground;
    out.selectionBackground = c.selectionBackground;
  }
  return out;
}

export default function Terminal({ pane, tabId, active }) {
  const id = pane.id;
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const fitRef = useRef(null);
  const searchRef = useRef(null);
  const suggestionRef = useRef({ input: "", suggestion: "" });
  const commandStartRef = useRef(0);
  const lastNotifyRef   = useRef(0);
  const hoverCardRef    = useRef(null);
  const minimapRef      = useRef(null);

  const settings = useStore((s) => s.settings);
  const setActivePane = useStore((s) => s.setActivePane);
  const splitActivePane = useStore((s) => s.splitActivePane);
  const closePane = useStore((s) => s.closePane);

  const [showSearch, setShowSearch] = useState(false);
  const [suggestion, setSuggestion] = useState({ input: "", suggestion: "" });
  const [wslPrompt, setWslPrompt] = useState(false);
  const [wslInstalling, setWslInstalling] = useState(false);
  const [missingShell, setMissingShell] = useState(null);

  // Mount xterm + PTY
  useEffect(() => {
    if (!containerRef.current) return;

    const theme = getTheme(settings.theme);
    // Defensive numeric coercion — xterm's Buffer service crashes with a
    // RangeError ("Invalid array length") if scrollback is NaN / undefined /
    // negative, which has happened in child windows that mount before the
    // settings are fully hydrated.
    const safeNum = (v, fallback, min, max) => {
      const n = Number(v)
      if (!Number.isFinite(n)) return fallback
      return Math.max(min, Math.min(max, n))
    }
    const xterm = new XTerm({
      theme: applyCustomColors(
        theme.xterm,
        settings.customColors,
        !!settings.backgroundImage ||
          (settings.windowBlur && settings.windowBlur !== "none"),
      ),
      fontSize:   safeNum(settings.fontSize,   14, 6, 72),
      fontFamily: settings.fontFamily || 'Cascadia Code, Consolas, monospace',
      lineHeight: safeNum(settings.lineHeight, 1.2, 0.8, 3),
      cursorStyle: settings.cursorStyle || 'block',
      cursorBlink: settings.cursorBlink !== false,
      scrollback:  safeNum(settings.scrollback, 1000, 0, 100000),
      allowProposedApi: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const linksAddon = new WebLinksAddon(
      (_, uri) => window.nexterm.shell.open(uri),
      {
        hover: (event, uri) => {
          if (useStore.getState().settings.linkHoverCards === false) return;
          showLinkCard(event, uri, hoverCardRef);
        },
        leave: () => hideLinkCard(hoverCardRef),
      },
    );

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(linksAddon);

    // Inline images (Sixel + iTerm2 protocol)
    if (settings.inlineImages !== false) {
      try { xterm.loadAddon(new ImageAddon()); } catch (e) { console.error("[image addon]", e); }
    }

    xterm.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitRef.current = fitAddon;
    searchRef.current = searchAddon;
    paneRegistry.set(id, { xterm, tabId });

    // Spawn PTY (banner is injected on the main side via PowerShell -Command)
    const { cols, rows } = xterm;
    window.nexterm.pty
      .create({
        id,
        shell: pane.shell,
        cwd: pane.cwd,
        args: pane.args,
        cols,
        rows,
      })
      .then((res) => {
        if (res && res.ok === false) {
          xterm.write(`\r\n\x1b[31m[PTY ERROR] ${res.error}\x1b[0m\r\n`);
        }
      });

    // Sniff buffer to detect "no installed distributions" message — small,
    // resets every line, prevents matching arbitrary user output later.
    let wslSniff = "";
    let silenceTimer = null;
    const offData = window.nexterm.pty.onData(id, (data) => {
      xterm.write(data);
      const isWsl = /wsl(\.exe)?$/i.test(pane.shell || "");
      if (isWsl && !wslInstalling) {
        wslSniff = (wslSniff + data).slice(-512);
        if (/no installed distributions/i.test(wslSniff)) {
          setWslPrompt(true);
        }
        const m = wslSniff.match(/execvpe\((zsh|fish|bash)\) failed/i);
        if (m) setMissingShell(m[1].toLowerCase());
      }
      // Long-command notification: when output settles after a Return, if the
      // total elapsed time exceeded the threshold AND the window is not
      // focused, fire a system notification once per command.
      if (commandStartRef.current) {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          const s = useStore.getState().settings;
          if (s.notifyLongCommands === false) return;
          const elapsed = Date.now() - commandStartRef.current;
          const threshold = s.notifyThresholdMs ?? 30000;
          if (elapsed >= threshold &&
              !document.hasFocus() &&
              Date.now() - lastNotifyRef.current > 4000) {
            lastNotifyRef.current = Date.now();
            try {
              const tabName =
                useStore.getState().tabs.find(t => t.id === tabId)?.name || "Tab";
              new Notification(`NexTerm — ${tabName}`, {
                body: `Command finished after ${(elapsed / 1000).toFixed(1)}s`,
                silent: !s.notifySound
              });
            } catch {}
          }
          commandStartRef.current = 0;
        }, 1500);
      }
    });
    let reconnectAttempt = 0;
    let reconnectTimer = null;
    const offExit = window.nexterm.pty.onExit(id, (code) => {
      if (wslInstalling) return;
      xterm.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
      // Auto-reconnect for SSH profiles flagged with autoReconnect.
      // Only reconnect on non-zero exits so a user "exit" doesn't loop.
      if (pane.autoReconnect && code !== 0 && reconnectAttempt < 8) {
        reconnectAttempt++;
        const delay = Math.min(30000, 1000 * 2 ** (reconnectAttempt - 1));  // 1s,2s,4s…
        xterm.write(
          `\x1b[33m[NexTerm] auto-reconnect in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt}/8). Press Ctrl+C to cancel.\x1b[0m\r\n`,
        );
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          window.nexterm.pty
            .create({ id, shell: pane.shell, cwd: pane.cwd, args: pane.args, cols: xterm.cols, rows: xterm.rows })
            .then((res) => {
              if (res?.ok === false) {
                xterm.write(`\r\n\x1b[31m[reconnect failed] ${res.error}\x1b[0m\r\n`);
              } else {
                reconnectAttempt = 0;
              }
            });
        }, delay);
        // Cancel reconnect if user types Ctrl+C
        const cancel = xterm.onData((d) => {
          if (d === "\x03" && reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
            xterm.write("\r\n\x1b[33m[reconnect cancelled]\x1b[0m\r\n");
            cancel.dispose();
          }
        });
      }
    });

    const offSuggest = window.nexterm.suggest.on(id, (data) => {
      suggestionRef.current = data;
      setSuggestion(data);
    });

    const offCwd = window.nexterm.cwd.on(id, (dir) => {
      useStore.getState().setCwd(id, dir);
    });

    // Broadcast mode: when this pane's tab has broadcast=true, mirror typed
    // input to every other leaf pane in the same tab. The PTY ack (echoed
    // chars) still flows back per-pane via pty:data, so each pane shows what
    // it received. Skip if the data is from a paste (size > 1) to keep things
    // sane for multi-line edits.
    xterm.onData((data) => {
      window.nexterm.pty.write(id, data);
      // Long-command timer: track when a command line is committed
      if (data.includes("\r") || data.includes("\n")) {
        commandStartRef.current = Date.now();
      }
      // Broadcast — read fresh from store so the toggle is live
      const st = useStore.getState();
      const tab = st.tabs.find((t) => t.id === tabId);
      if (tab?.broadcast) {
        const allLeaves = (function walk(p) {
          if (!p) return [];
          if (p.kind === "leaf") return [p];
          return [...walk(p.a), ...walk(p.b)];
        })(tab.root);
        for (const leaf of allLeaves) {
          if (leaf.id !== id) {
            try { window.nexterm.pty.write(leaf.id, data); } catch {}
          }
        }
      }
    });

    // Keyboard handler — Ctrl+F search, Tab → accept suggestion
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      // Search shortcut (configurable, default Ctrl+F)
      const findKey = getKey(useStore.getState().settings, "find");
      if (matchKey(e, findKey)) {
        setShowSearch((s) => !s);
        return false;
      }

      // Ctrl+D with an existing selection → "select next occurrence"
      // (VS Code-style multi-cursor lite). With no selection, fall through so
      // Ctrl+D still sends EOF to the shell as expected.
      if (e.ctrlKey && e.code === "KeyD" && !e.shiftKey && !e.altKey) {
        const sel = xterm.getSelection();
        if (sel) {
          e.preventDefault();
          const found = searchRef.current?.findNext(sel, { regex: false, wholeWord: false, caseSensitive: true });
          if (!found) {
            xterm.write("\r\n\x1b[33m[no next match]\x1b[0m\r\n");
          }
          return false;
        }
      }

      // Ctrl+Shift+S — save scrollback to file
      if (e.ctrlKey && e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        try {
          const buf = xterm.buffer.active;
          const lines = [];
          for (let i = 0; i < buf.length; i++) {
            const line = buf.getLine(i);
            if (line) lines.push(line.translateToString(true));
          }
          const text = lines.join("\n").replace(/\n+$/, "") + "\n";
          window.nexterm.dialog
            .saveScrollback(text)
            .catch((err) => console.error("[saveScrollback]", err));
        } catch (err) {
          console.error("[scrollback]", err);
        }
        return false;
      }

      // Ctrl+C — copy selected text if any; otherwise let the shell get SIGINT
      if (e.ctrlKey && e.code === "KeyC" && !e.shiftKey && !e.altKey) {
        const sel = xterm.getSelection();
        if (sel) {
          try {
            navigator.clipboard.writeText(sel);
          } catch {}
          xterm.clearSelection();
          return false;
        }
        // No selection → fall through to default Ctrl+C behavior (interrupt)
      }

      // Ctrl+V / Shift+Insert paste are handled by xterm's built-in paste event
      // listener on the hidden textarea (see onPaste below). Don't override here
      // — that would double-paste because the browser also fires a paste event.

      // Tab — always block browser focus traversal so it can't jump to titlebar buttons
      if (e.code === "Tab" && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        try {
          const s = suggestionRef.current;
          if (
            !e.shiftKey &&
            s &&
            s.suggestion &&
            s.suggestion.length > s.input.length
          ) {
            // Accept suggestion
            const remaining = s.suggestion.slice(s.input.length);
            window.nexterm.pty.write(id, remaining);
            suggestionRef.current = {
              input: s.suggestion,
              suggestion: s.suggestion,
            };
            setSuggestion(suggestionRef.current);
            return false;
          }
          // Otherwise send a real Tab to the shell (for native tab-completion)
          window.nexterm.pty.write(id, "\t");
        } catch (err) {
          console.error("[Tab handler]", err);
        }
        return false;
      }
      return true;
    });

    // Ctrl+Scroll → zoom font.
    // Ctrl+Shift+Scroll → adjust window opacity.
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.shiftKey) {
        const cur = useStore.getState().settings.terminalOpacity ?? 1.0;
        const next = Math.max(
          0.3,
          Math.min(1.0, +(cur + (e.deltaY < 0 ? 0.01 : -0.01)).toFixed(2)),
        );
        if (next !== cur) {
          useStore.getState().updateSettings({ terminalOpacity: next });
          window.nexterm.win.setOpacity(next);
        }
      } else {
        const cur = useStore.getState().settings.fontSize;
        const next = Math.max(8, Math.min(32, cur + (e.deltaY < 0 ? 1 : -1)));
        if (next !== cur)
          useStore.getState().updateSettings({ fontSize: next });
      }
    };
    containerRef.current.addEventListener("wheel", onWheel, { passive: false });

    // Drag-drop files → paste their (quoted) paths into the terminal
    const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
    const onDrop = (e) => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;
      e.preventDefault();
      const isWslShell = /wsl(\.exe)?$/i.test(pane.shell || "");
      const quote = (p) => {
        // Convert C:\foo to /mnt/c/foo for WSL/bash-style; otherwise keep as-is
        if (isWslShell && /^[a-zA-Z]:[\\/]/.test(p)) {
          const drive = p[0].toLowerCase();
          const rest = p.slice(2).replace(/\\/g, "/");
          p = `/mnt/${drive}${rest.startsWith("/") ? rest : "/" + rest}`;
        }
        return /[\s'"`$]/.test(p) ? `"${p.replace(/"/g, '\\"')}"` : p;
      };
      const text = files.map(f => quote(f.path)).join(" ") + " ";
      window.nexterm.pty.write(id, text);
    };
    containerRef.current.addEventListener("dragover", onDragOver);
    containerRef.current.addEventListener("drop", onDrop);

    // Right-click → context menu (with current selection so we can offer "Search web for …")
    const onCtxMenu = () => {
      const sel = xterm.getSelection() || "";
      window.nexterm.ctx.show({ tabId: id, selection: sel });
    };
    containerRef.current.addEventListener("contextmenu", onCtxMenu);

    // Intercept paste for size warning
    const onPaste = async (e) => {
      const text = e.clipboardData?.getData("text/plain") || "";
      const s = useStore.getState().settings;
      if (
        s.warnPasteSize !== false &&
        text.length > (s.pasteWarnLimit || 5120)
      ) {
        e.preventDefault();
        const ok = await window.nexterm.confirm({
          message: `Paste ${(text.length / 1024).toFixed(1)} KiB?`,
          detail: `You're about to paste ${text.length} characters into the terminal.`,
        });
        if (ok) window.nexterm.pty.write(id, text);
      }
    };
    xterm.textarea && xterm.textarea.addEventListener("paste", onPaste);

    const offCtx = window.nexterm.ctx.onAction(
      ({ action, tabId: targetId }) => {
        if (targetId !== id) return;
        if (action === "copy") {
          const sel = xterm.getSelection();
          if (sel) navigator.clipboard.writeText(sel);
        } else if (action === "paste") {
          navigator.clipboard
            .readText()
            .then((t) => window.nexterm.pty.write(id, t));
        } else if (action === "clear") xterm.clear();
        else if (action === "selectAll") xterm.selectAll();
        else if (action === "splitRow") splitActivePane("row");
        else if (action === "splitCol") splitActivePane("col");
        else if (action === "closePane") closePane(id);
        else if (action === "recordStart") {
          window.nexterm.record
            .start({ paneId: id, cols: xterm.cols, rows: xterm.rows })
            .then((r) => {
              if (r?.ok) {
                xterm.write(`\r\n\x1b[36m[recording → ${r.path}]\x1b[0m\r\n`);
              } else if (r?.error) {
                xterm.write(`\r\n\x1b[31m[record failed] ${r.error}\x1b[0m\r\n`);
              }
            });
        } else if (action === "recordStop") {
          window.nexterm.record.stop({ paneId: id }).then((r) => {
            if (r?.ok) xterm.write(`\r\n\x1b[36m[recording stopped → ${r.path}]\x1b[0m\r\n`);
          });
        } else if (action === "replayOpen") {
          window.nexterm.replay.open().then((r) => {
            if (!r?.ok) return;
            playReplay(xterm, r.events);
          });
        } else if (action === "aiExplain") {
          // Capture last 40 buffer lines as context for the AI explain modal.
          try {
            const buf = xterm.buffer.active;
            const lines = [];
            const start = Math.max(0, buf.length - 40);
            for (let i = start; i < buf.length; i++) {
              const line = buf.getLine(i);
              if (line) lines.push(line.translateToString(true));
            }
            const output = lines.join("\n").replace(/\s+$/, "");
            // Best-effort extract of the last command: find a prompt char (❯ or >)
            // and take the text after it.
            let command = "(unknown)";
            for (let i = lines.length - 1; i >= 0; i--) {
              const m = lines[i].match(/[❯>]\s+(.+)$/);
              if (m && m[1].trim()) { command = m[1].trim(); break; }
            }
            useStore.setState({
              aiExplain: {
                command, output,
                cwd: useStore.getState().cwds[id] || "",
                paneId: id
              }
            });
          } catch (e) { console.error("[aiExplain]", e); }
        }
      },
    );

    // Click → focus this pane
    const onClick = () => setActivePane(tabId, id);
    containerRef.current.addEventListener("mousedown", onClick);

    // Resize
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        window.nexterm.pty.resize(id, xterm.cols, xterm.rows);
      } catch {}
    });
    ro.observe(containerRef.current);

    // Mini-map redraw (debounced)
    let minimapTimer = null;
    const scheduleMinimap = () => {
      if (useStore.getState().settings.miniMap !== true) return;
      if (minimapTimer) clearTimeout(minimapTimer);
      minimapTimer = setTimeout(() => drawMinimap(xterm, minimapRef.current), 120);
    };
    xterm.onWriteParsed(() => scheduleMinimap());
    xterm.onScroll(() => scheduleMinimap());

    return () => {
      try {
        offData();
      } catch {}
      try {
        offExit();
      } catch {}
      try {
        offSuggest();
      } catch {}
      try {
        offCtx();
      } catch {}
      try {
        offCwd();
      } catch {}
      try {
        ro.disconnect();
      } catch {}
      try {
        containerRef.current?.removeEventListener("wheel", onWheel);
      } catch {}
      try {
        containerRef.current?.removeEventListener("dragover", onDragOver);
      } catch {}
      try {
        containerRef.current?.removeEventListener("drop", onDrop);
      } catch {}
      try {
        if (silenceTimer) clearTimeout(silenceTimer);
      } catch {}
      try {
        if (reconnectTimer) clearTimeout(reconnectTimer);
      } catch {}
      try {
        containerRef.current?.removeEventListener("contextmenu", onCtxMenu);
      } catch {}
      try {
        containerRef.current?.removeEventListener("mousedown", onClick);
      } catch {}
      try {
        xterm.textarea && xterm.textarea.removeEventListener("paste", onPaste);
      } catch {}
      try {
        xterm.dispose();
      } catch (e) {
        console.error("[xterm dispose]", e);
      }
      try {
        window.nexterm.pty.kill(id);
      } catch (e) {
        console.error("[pty kill]", e);
      }
      try { paneRegistry.delete(id); } catch {}
    };
  }, [id]);

  // Live-apply settings
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    const theme = getTheme(settings.theme);
    xterm.options.theme = applyCustomColors(
      theme.xterm,
      settings.customColors,
      !!settings.backgroundImage ||
        (settings.windowBlur && settings.windowBlur !== "none"),
    );
    xterm.options.fontSize = settings.fontSize;
    xterm.options.fontFamily = settings.fontFamily;
    xterm.options.lineHeight = settings.lineHeight;
    xterm.options.cursorStyle = settings.cursorStyle;
    xterm.options.cursorBlink = settings.cursorBlink;
    setTimeout(() => {
      try {
        fitRef.current?.fit();
        window.nexterm.pty.resize(id, xterm.cols, xterm.rows);
      } catch {}
    }, 50);
  }, [settings]);

  // Focus when pane becomes active
  useEffect(() => {
    if (active) setTimeout(() => xtermRef.current?.focus(), 30);
  }, [active]);

  async function installWsl(distro) {
    setWslInstalling(true);
    setWslPrompt(false);
    try {
      xtermRef.current?.clear();
    } catch {}
    const r = await window.nexterm.wsl.install(distro, id);
    if (!r?.ok) {
      xtermRef.current?.write(
        `\r\n\x1b[31m[Install failed] ${r?.error || "unknown"}\x1b[0m\r\n`,
      );
      setWslInstalling(false);
    }
  }

  async function installWslShell(shellName) {
    setWslInstalling(true);
    setMissingShell(null);
    try {
      xtermRef.current?.clear();
    } catch {}
    const r = await window.nexterm.wsl.installShell(shellName, id);
    if (!r?.ok) {
      xtermRef.current?.write(
        `\r\n\x1b[31m[Install failed] ${r?.error || "unknown"}\x1b[0m\r\n`,
      );
      setWslInstalling(false);
    }
  }

  const ghostText =
    suggestion.suggestion &&
    suggestion.suggestion.length > suggestion.input.length
      ? suggestion.suggestion.slice(suggestion.input.length)
      : "";

  function onMinimapClick(e) {
    const xterm = xtermRef.current;
    if (!xterm) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const total = xterm.buffer.active.length;
    const target = Math.max(0, Math.min(total - 1, Math.floor(total * ratio)));
    xterm.scrollToLine(target);
  }

  return (
    <div className={`pane-wrap ${active ? "pane-active" : ""} ${settings.animatedBanner ? "pane-banner-glow" : ""}`}>
      {showSearch && (
        <SearchBar
          onFind={(q, opts) => searchRef.current?.findNext(q, opts)}
          onFindPrev={(q, opts) => searchRef.current?.findPrevious(q, opts)}
          onClose={() => {
            setShowSearch(false);
            xtermRef.current?.focus();
          }}
        />
      )}
      <div ref={containerRef} className="xterm-container" />
      {settings.miniMap && (
        <canvas
          ref={minimapRef}
          className="xterm-minimap"
          onClick={onMinimapClick}
          title="Click to jump"
        />
      )}
      {missingShell && !wslPrompt && !wslInstalling && (
        <div className="wsl-install-panel">
          <div className="wsl-install-title">
            {missingShell} is not installed in WSL
          </div>
          <div className="wsl-install-desc">
            Your WSL distro is set up, but <code>{missingShell}</code> isn't
            installed yet. NexTerm can install it for you (you'll be asked for
            your sudo password). After it finishes, close this tab and open a
            new {missingShell} tab.
          </div>
          <div className="wsl-install-actions">
            <button
              className="btn-primary"
              onClick={() => installWslShell(missingShell)}
            >
              Install {missingShell}
            </button>
            <button
              className="icon-btn"
              onClick={() => setMissingShell(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {wslPrompt && !wslInstalling && (
        <div className="wsl-install-panel">
          <div className="wsl-install-title">No WSL distribution installed</div>
          <div className="wsl-install-desc">
            Install one to use WSL inside NexTerm. The install runs in this same
            tab and may prompt for admin permission. A Windows restart is
            usually required afterwards.
          </div>
          <div className="wsl-install-actions">
            <button className="btn-primary" onClick={() => installWsl("Ubuntu")}>
              Install Ubuntu
            </button>
            <button className="btn-secondary" onClick={() => installWsl("Debian")}>
              Install Debian
            </button>
            <button
              className="btn-secondary"
              onClick={() =>
                window.nexterm.shell.open(
                  "https://learn.microsoft.com/windows/wsl/install",
                )
              }
            >
              Docs
            </button>
            <button className="icon-btn" onClick={() => setWslPrompt(false)}>
              ×
            </button>
          </div>
        </div>
      )}
      {ghostText && (
        <div className="suggestion-bar">
          <span className="hint">↹ Tab</span>
          <span className="suggestion-text">
            <span className="dim">{suggestion.input}</span>
            {ghostText}
          </span>
        </div>
      )}
    </div>
  );
}
