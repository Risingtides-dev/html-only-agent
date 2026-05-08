# CLAUDE.md

Guidance for AI assistants working in this repository.

## Project intent

`html-only-agent` is a chat UI where Claude's responses are rendered as **raw HTML** rather than Markdown, so the model can produce rich visual output — layouts, charts, tables, interactive widgets — directly in the conversation surface.

## Architecture

Two-process app:

```
client/  Vite + React (port 5173)        server/  Express + OpenAI SDK → DeepSeek (port 3000)
─────────────────────────────────         ──────────────────────────────────────────────
chat input + sandboxed iframe   ────────► POST /api/chat (SSE)
└─ postMessage protocol drives             └─ streams DeepSeek reply back
   a single accumulating iframe               via the OpenAI SDK
                                              (baseURL: api.deepseek.com)
```

The iframe has `sandbox="allow-scripts"` (no `allow-same-origin`) and is bootstrapped once from `client/src/iframe-shell.ts`. Every assistant turn is appended into the same iframe's `<div id="feed">`. The parent never reloads the iframe — it just sends `postMessage` events.

### postMessage protocol (parent → iframe)

| Type          | Payload                                | Effect                                                                 |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `turn-start`  | `{id, role: "user"\|"assistant", text?}` | Append a new turn div. For user turns, `text` is set via `textContent`. |
| `chunk`       | `{id, text}`                           | Append text to the assistant turn buffer; sets `innerHTML = buffer` for live preview. Scripts do **not** run during streaming. |
| `turn-end`    | `{id}`                                 | Reparse the final HTML and replace nodes; `<script>` tags are cloned-recreated so they execute. |
| `reset`       | —                                      | Clear the feed.                                                        |

Iframe → parent: `{type: "ready"}` once on load.

### Streaming end-to-end

1. Client `App.tsx` POSTs `{messages}` to `/api/chat` with `fetch` + `ReadableStream` (POST + streaming, unlike EventSource).
2. Server pipes the OpenAI SDK's `chat.completions.create({stream: true})` deltas as SSE `data:` lines (`{type: "chunk", text}` or `{type: "done"}` / `{type: "error"}`).
3. Client decodes SSE and forwards each chunk's text to the iframe via `postMessage`.

## Repository layout

```
html-only-agent/
├── client/                       # Vite + React frontend
│   ├── package.json
│   ├── vite.config.ts            # proxies /api → :3000
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx               # input + iframe + SSE consumer
│       ├── iframe-shell.ts       # exports the srcdoc HTML string
│       └── styles.css            # outer chrome (dark UI shell)
├── server/                       # Express + Anthropic SDK backend
│   ├── package.json
│   └── src/
│       ├── index.ts              # POST /api/chat SSE endpoint
│       └── llm.ts                # OpenAI SDK wrapper, system prompt, streaming
├── .env.example                  # DEEPSEEK_API_KEY=, PORT=3000
├── .gitignore
├── README.md
└── CLAUDE.md
```

## Core product contract

Model output is **HTML, not Markdown**. The system prompt in `server/src/llm.ts` enforces:

- Reply with valid HTML only; wrap the entire response in a single root element (`<div>...</div>`).
- No `<html>`, `<head>`, or `<body>` tags.
- **Tailwind CSS is preloaded in the iframe** via Play CDN (`https://cdn.tailwindcss.com?plugins=typography`). Style with utility classes — avoid inline `style="..."` and `<style>` blocks unless genuinely needed.
- Inline all assets. No external `<link>`, remote `<img>`, or remote `<script src>` (data: URLs are fine).
- For visualizations: inline `<svg>`, `<canvas>` + `<script>`, or HTML primitives.
- Plain-text replies still get a `<div>` wrapper with sensible Tailwind typography.

If the model breaks these rules, fix the system prompt in `llm.ts` rather than working around it in the renderer.

## Security model

- Outer iframe: `sandbox="allow-scripts"` only. No `allow-same-origin` — the iframe runs in a unique origin and cannot read parent cookies, `localStorage`, or navigate the parent.
- API key (`DEEPSEEK_API_KEY`) lives on the server. The frontend never sees it. `cors` is permissive (`origin: true`) for local dev — tighten before deploying.
- Tailwind CDN is fetched from the iframe over HTTPS. Sandboxed iframes can still make outbound network requests; if you want to lock that down, add a `<meta http-equiv="Content-Security-Policy">` to each turn or to the shell.

## Streaming caveats

- During streaming, assistant HTML is rendered with `innerHTML = buffer` for live preview. **`<script>` tags inserted via `innerHTML` do not execute** — visualizations only animate after `turn-end`, when the buffer is reparsed and scripts are cloned/re-appended.
- Tailwind's Play CDN has a `MutationObserver` that picks up new utility classes on each chunk — no extra plumbing needed for live class generation.
- DeepSeek does context caching server-side automatically (no `cache_control` markers needed); identical prefixes are cached on hit. Don't interpolate timestamps or per-request IDs into the system prompt — that would silently invalidate the cache.

## Running locally

```bash
# 1. Set up env
cp .env.example .env  # then fill in DEEPSEEK_API_KEY (https://platform.deepseek.com)

# 2. Install + run server (terminal 1)
cd server
npm install
npm run dev          # tsx watch — listens on :3000

# 3. Install + run client (terminal 2)
cd client
npm install
npm run dev          # vite — http://localhost:5173 — proxies /api → :3000
```

Useful scripts:

| Where     | Command            | Purpose                       |
| --------- | ------------------ | ----------------------------- |
| `server/` | `npm run dev`      | tsx watch mode                |
| `server/` | `npm run build`    | tsc → `dist/`                 |
| `server/` | `npm run typecheck`| tsc `--noEmit`                |
| `client/` | `npm run dev`      | Vite dev server               |
| `client/` | `npm run build`    | tsc -b + vite build           |
| `client/` | `npm run typecheck`| Project-references typecheck  |

There is no test suite yet.

## Model + SDK conventions

- Provider: **DeepSeek** via its OpenAI-compatible API (`https://api.deepseek.com`).
- Model: `deepseek-chat` (DeepSeek-V3) — set in `server/src/llm.ts` as `MODEL`.
- SDK: `openai` ≥ 4.77 — uses `chat.completions.create({stream: true})` with `baseURL` pointed at DeepSeek.
- The other DeepSeek model is `deepseek-reasoner` (R1). It returns chain-of-thought in a separate `reasoning_content` field; for HTML output we want the final answer only, so stick with `deepseek-chat` unless you specifically want to render reasoning.
- To swap providers, replace the `baseURL` and env var in `llm.ts`. Any OpenAI-compatible endpoint should work without other code changes.

## Repository & workflow

- Local path: `/home/user/html-only-agent`
- GitHub: `risingtides-dev/html-only-agent`
- Default branch: `main`
- Active feature branch (this session): `claude/add-claude-documentation-B4gMV`
- Open pull requests as **draft** against `main`.
- Don't commit `.env`. `.gitignore` covers it.

## Likely next steps (not yet built)

These are explicit non-goals for v1, but the architecture is laid out to receive them:

- **Web Components catalog** in the iframe shell (`<bar-chart>`, `<data-table>`, `<kpi-card>`) so the model can emit compact tags instead of inline SVG. Keep registration metadata as the single source of truth and build the system-prompt catalog from it.
- **Bidirectional canvas:** iframe components emit `postMessage({type: "interaction", ...})`; the parent classifies events as local-only (no API call) vs agent-bound (synthetic user turn). Treat the page as a JIT UI Claude compiles, with local interactivity baked in.
- **History compression:** strip large `<svg>` / `<script>` blobs from prior assistant turns before re-sending, or have Claude emit a `<!-- summary: ... -->` comment alongside each reply and only send summaries for older turns.
- **CSP per turn** to block iframe network access entirely once external assets aren't needed.
