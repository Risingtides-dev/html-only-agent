import "dotenv/config";
import express from "express";
import cors from "cors";
import { streamChat, type ChatMessage } from "./claude.js";

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

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const ping = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => clearInterval(ping));

  streamChat(messages, {
    onText: (text) => send({ type: "chunk", text }),
    onError: (err) => {
      send({ type: "error", message: err.message });
      clearInterval(ping);
      res.end();
    },
    onEnd: () => {
      send({ type: "done" });
      clearInterval(ping);
      res.end();
    },
  });
});

app.listen(PORT, () => {
  console.log(`html-only-agent server listening on http://localhost:${PORT}`);
});
