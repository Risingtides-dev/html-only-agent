import { useEffect, useRef, useState, type FormEvent } from "react";
import { IFRAME_SHELL } from "./iframe-shell";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Theme = "light" | "dark" | "paper";
const THEMES: Theme[] = ["light", "dark", "paper"];

function readSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem("html-only-agent-theme");
    if (saved && (THEMES as string[]).includes(saved)) return saved as Theme;
  } catch {}
  return "dark";
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
  const [iframeReady, setIframeReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [theme, setTheme] = useState<Theme>(readSavedTheme);

  const messagesRef = useRef<ChatMessage[]>([]);
  const streamingRef = useRef(false);
  const iframeReadyRef = useRef(false);
  const themeRef = useRef<Theme>(theme);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);
  useEffect(() => { iframeReadyRef.current = iframeReady; }, [iframeReady]);
  useEffect(() => { themeRef.current = theme; }, [theme]);

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
    setMessages([]);
    setInput("");
    setError(null);
    post({ type: "reset" });
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
        body: JSON.stringify({ messages: nextMessages, theme: themeRef.current }),
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
      <main>
        <iframe
          ref={iframeRef}
          title="conversation"
          sandbox="allow-scripts"
          srcDoc={IFRAME_SHELL}
        />
        {error && <div className="error">{error}</div>}
      </main>
      <form onSubmit={onSubmit}>
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
