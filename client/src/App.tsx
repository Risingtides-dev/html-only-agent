import { useEffect, useRef, useState, type FormEvent } from "react";
import { IFRAME_SHELL } from "./iframe-shell";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "ready") setIframeReady(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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
    if (!userText || streaming || !iframeReady) return;

    setInput("");
    setError(null);
    setStreaming(true);

    const userMsg: ChatMessage = { role: "user", content: userText };
    const nextMessages = [...messages, userMsg];
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
        body: JSON.stringify({ messages: nextMessages }),
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
