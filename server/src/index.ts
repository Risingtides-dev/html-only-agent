import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

import express from "express";
import cors from "cors";
import { streamChat, type ChatMessage } from "./llm.js";
import {
  addFile,
  clearSession,
  listFiles,
  removeFile,
  MAX_FILE_BYTES,
  MAX_FILES_PER_SESSION,
} from "./sessions.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/files", (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  res.json({ files: listFiles(sessionId) });
});

app.post("/api/files", (req, res) => {
  const sessionId = String(req.body?.sessionId ?? "");
  const name = String(req.body?.name ?? "");
  const mime = String(req.body?.mime ?? "text/plain");
  const contentBase64 = String(req.body?.contentBase64 ?? "");

  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!contentBase64) {
    res.status(400).json({ error: "contentBase64 is required" });
    return;
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(contentBase64, "base64");
  } catch {
    res.status(400).json({ error: "invalid base64 content" });
    return;
  }

  const result = addFile(sessionId, name, mime, bytes);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({ file: result.file });
});

app.delete("/api/files", (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  clearSession(sessionId);
  res.status(204).end();
});

app.delete("/api/files/:name", (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");
  const name = String(req.params.name ?? "");
  if (!sessionId || !name) {
    res.status(400).json({ error: "sessionId and name are required" });
    return;
  }
  const removed = removeFile(sessionId, name);
  if (!removed) {
    res.status(404).json({ error: "file not found" });
    return;
  }
  res.status(204).end();
});

app.get("/api/files/limits", (_req, res) => {
  res.json({ maxFileBytes: MAX_FILE_BYTES, maxFilesPerSession: MAX_FILES_PER_SESSION });
});

app.post("/api/chat", (req, res) => {
  const messages = req.body?.messages as ChatMessage[] | undefined;
  const theme = req.body?.theme as string | undefined;
  const sessionId = req.body?.sessionId as string | undefined;

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

  streamChat(messages, theme, sessionId, controller.signal, {
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
