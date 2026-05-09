import { useEffect, useRef, useState, type FormEvent, type DragEvent } from "react";
import { IFRAME_SHELL } from "./iframe-shell";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AttachedFile {
  name: string;
  mime: string;
  size: number;
  uploadedAt: number;
}

type Theme = "light" | "dark" | "paper";
const THEMES: Theme[] = ["light", "dark", "paper"];

const MAX_FILE_BYTES_CLIENT = 1_000_000;

function readSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem("html-only-agent-theme");
    if (saved && (THEMES as string[]).includes(saved)) return saved as Theme;
  } catch {}
  return "dark";
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} KB`;
  return `${(n / 1_000_000).toFixed(2)} MB`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

let tailwindParentPromise: Promise<void> | null = null;
function ensureTailwindInParent(): Promise<void> {
  if (tailwindParentPromise) return tailwindParentPromise;
  tailwindParentPromise = new Promise<void>((resolve) => {
    if (document.querySelector('script[data-tw-pdf]')) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.tailwindcss.com?plugins=typography";
    s.dataset.twPdf = "1";
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => resolve());
    document.head.appendChild(s);
  });
  return tailwindParentPromise;
}

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [sessionId, setSessionId] = useState<string>(newSessionId);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const messagesRef = useRef<ChatMessage[]>([]);
  const streamingRef = useRef(false);
  const iframeReadyRef = useRef(false);
  const themeRef = useRef<Theme>(theme);
  const sessionIdRef = useRef<string>(sessionId);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);
  useEffect(() => { iframeReadyRef.current = iframeReady; }, [iframeReady]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    try { localStorage.setItem("html-only-agent-theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    if (!iframeReady) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "theme", mode: theme }, "*");
  }, [theme, iframeReady]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data;
      if (data?.type === "ready") {
        setIframeReady(true);
        e.source?.postMessage(
          { type: "theme", mode: themeRef.current },
          { targetOrigin: "*" } as WindowPostMessageOptions,
        );
      }
      if (data?.type === "export") handleExport(data);
      if (data?.type === "refine" && typeof data.note === "string") {
        if (streamingRef.current || !iframeReadyRef.current) return;
        void sendUserText(`Refine your previous response — ${data.note.trim()}`);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function wrapDocument(innerHTML: string, ts: number): string {
    const stamp = new Date(ts).toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>html-only-agent · ${stamp}</title>
<script src="https://cdn.tailwindcss.com?plugins=typography"></script>
<style>
  html, body { margin: 0; padding: 0; }
  body {
    background: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 32px;
  }
  .doc-wrap { max-width: 880px; margin: 0 auto; }
  @media print {
    body { padding: 0; background: #fff; }
    .doc-wrap { max-width: none; }
  }
</style>
</head>
<body><div class="doc-wrap">${innerHTML}</div></body>
</html>`;
  }

  function handleExport(data: { format: "html" | "pdf"; html: string; ts: number }) {
    const doc = wrapDocument(data.html, data.ts);
    const stampSlug = new Date(data.ts)
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    if (data.format === "html") {
      const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `html-only-agent-${stampSlug}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (data.format === "pdf") {
      void renderPDF(data.html, stampSlug).catch((err) => {
        setError(`PDF export failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  async function renderPDF(innerHTML: string, stampSlug: string) {
    await ensureTailwindInParent();
    const [{ default: html2pdf }] = await Promise.all([
      import("html2pdf.js"),
    ]);

    const stage = document.createElement("div");
    stage.style.position = "fixed";
    stage.style.left = "-99999px";
    stage.style.top = "0";
    stage.style.width = "880px";
    stage.style.background = "#ffffff";
    stage.style.padding = "40px";
    stage.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    stage.innerHTML = innerHTML;
    document.body.appendChild(stage);

    await new Promise((r) => setTimeout(r, 350));

    try {
      const opts: any = {
        margin: [10, 10, 10, 10],
        filename: `html-only-agent-${stampSlug}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      };
      await html2pdf().set(opts).from(stage).save();
    } finally {
      document.body.removeChild(stage);
    }
  }

  function post(msg: unknown) {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }

  function resetChat() {
    if (streaming) return;
    const oldId = sessionIdRef.current;
    setMessages([]);
    setInput("");
    setError(null);
    setFiles([]);
    setSessionId(newSessionId());
    if (oldId) {
      void fetch(`/api/files?sessionId=${encodeURIComponent(oldId)}`, { method: "DELETE" }).catch(() => {});
    }
    post({ type: "reset" });
  }

  async function uploadFiles(list: FileList | File[]) {
    if (uploading) return;
    setError(null);
    setUploading(true);
    try {
      const arr = Array.from(list);
      for (const file of arr) {
        if (file.size === 0) {
          setError(`Skipped empty file: ${file.name}`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES_CLIENT) {
          setError(`${file.name} is too large (max ${formatBytes(MAX_FILE_BYTES_CLIENT)})`);
          continue;
        }
        const contentBase64 = await fileToBase64(file);
        const res = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            name: file.name,
            mime: file.type || "text/plain",
            contentBase64,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(`${file.name}: ${body.error ?? `upload failed (${res.status})`}`);
          continue;
        }
        const { file: meta } = await res.json();
        setFiles((prev) => {
          const others = prev.filter((f) => f.name !== meta.name);
          return [...others, meta];
        });
      }
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(name: string) {
    setError(null);
    const res = await fetch(
      `/api/files/${encodeURIComponent(name)}?sessionId=${encodeURIComponent(sessionIdRef.current)}`,
      { method: "DELETE" },
    );
    if (res.ok || res.status === 404) {
      setFiles((prev) => prev.filter((f) => f.name !== name));
    }
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    setDragActive(true);
  }

  function onDragLeave(e: DragEvent) {
    if (e.currentTarget === e.target) setDragActive(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer?.files;
    if (dropped && dropped.length > 0) void uploadFiles(dropped);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const userText = input.trim();
    if (!userText) return;
    setInput("");
    await sendUserText(userText);
  }

  async function sendUserText(userText: string) {
    if (!userText || streamingRef.current || !iframeReadyRef.current) return;
    setError(null);
    setStreaming(true);

    const userMsg: ChatMessage = { role: "user", content: userText };
    const nextMessages = [...messagesRef.current, userMsg];
    setMessages(nextMessages);

    const stamp = Date.now();
    const userId = `u-${stamp}`;
    const assistantId = `a-${stamp}`;
    post({ type: "turn-start", id: userId, role: "user", text: userText });
    post({ type: "turn-start", id: assistantId, role: "assistant" });

    let assembled = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          theme: themeRef.current,
          sessionId: sessionIdRef.current,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "chunk") {
            assembled += payload.text;
            post({ type: "chunk", id: assistantId, text: payload.text });
          } else if (payload.type === "thinking") {
            post({ type: "thinking", id: assistantId, text: payload.text });
          } else if (payload.type === "tool") {
            post({
              type: "tool",
              id: assistantId,
              name: payload.name,
              args: payload.args,
              status: payload.status,
              error: payload.error,
            });
          } else if (payload.type === "error") {
            throw new Error(payload.message);
          }
        }
      }

      post({ type: "turn-end", id: assistantId });
      setMessages([...nextMessages, { role: "assistant", content: assembled }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      post({ type: "turn-end", id: assistantId });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>html-only-agent</h1>
        <div className="header-right">
          <div className="theme-switch" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                data-active={theme === t}
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetChat}
            disabled={streaming || messages.length === 0}
          >
            New chat
          </button>
          <span className={`status ${iframeReady ? "ready" : "loading"}`}>
            {iframeReady ? "ready" : "loading"}
          </span>
        </div>
      </header>
      <main
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <iframe
          ref={iframeRef}
          title="conversation"
          sandbox="allow-scripts"
          srcDoc={IFRAME_SHELL}
        />
        {dragActive && (
          <div className="drop-overlay">
            <div className="drop-overlay-inner">
              <span className="drop-kicker">Drop to attach</span>
              <span className="drop-hint">text · csv · md · json · code · up to {formatBytes(MAX_FILE_BYTES_CLIENT)}</span>
            </div>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </main>
      {files.length > 0 && (
        <div className="files">
          {files.map((f) => (
            <span key={f.name} className="file-pill" title={`${f.mime} · ${formatBytes(f.size)}`}>
              <span className="file-name">{f.name}</span>
              <span className="file-size">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(f.name)}
                aria-label={`Remove ${f.name}`}
                disabled={streaming}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={onSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={!iframeReady || streaming || uploading}
          aria-label="Attach files"
          title="Attach files"
        >
          {uploading ? "…" : "+"}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Claude — replies render as live HTML…"
          disabled={!iframeReady || streaming}
          autoFocus
        />
        <button
          type="submit"
          disabled={!iframeReady || streaming || !input.trim()}
        >
          {streaming ? "Streaming…" : "Send"}
        </button>
      </form>
    </div>
  );
}
