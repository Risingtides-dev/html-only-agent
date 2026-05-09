import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import express from "express";
import cors from "cors";
import { streamChat, type ChatMessage } from "./llm.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", (req, res) => {
  const messages = req.body?.messages as ChatMessage[] | undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const controller = new AbortController();
  let closed = false;

  const send = (data: unknown) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const ping = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, 15000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    controller.abort();
  };

  res.on("close", cleanup);

  streamChat(messages, controller.signal, {
    onText: (text) => send({ type: "chunk", text }),
    onReasoning: (text) => send({ type: "thinking", text }),
    onTool: (ev) =>
      send({
        type: "tool",
        name: ev.name,
        args: ev.args,
        status: ev.status,
        ...(ev.error ? { error: ev.error } : {}),
      }),
    onError: (err) => {
      if (controller.signal.aborted) {
        cleanup();
        return;
      }
      send({ type: "error", message: err.message });
      cleanup();
      res.end();
    },
    onEnd: () => {
      send({ type: "done" });
      cleanup();
      res.end();
    },
  });
});

app.listen(PORT, () => {
  console.log(`html-only-agent server listening on http://localhost:${PORT}`);
});
