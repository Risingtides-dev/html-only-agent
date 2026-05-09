import { TOOLS, HANDLERS } from "./tools.js";
import { manifestLine } from "./sessions.js";

export const MODEL = "deepseek-v4-flash";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function themeBrief(theme: string | undefined): string {
  switch (theme) {
    case "light":
      return [
        "ACTIVE THEME: LIGHT. Override any color choices implied by prior turns.",
        "MUST USE: light backgrounds only (bg-white, bg-slate-50, bg-zinc-50). Dark body text only (text-slate-900, text-zinc-900).",
        "MUST NOT USE: bg-slate-900, bg-black, bg-zinc-950, text-white, text-zinc-100 or any dark backgrounds.",
        "Hairline borders: border-slate-200/300. Accents: emerald-600 / rose-600 / amber-600 / indigo-600.",
      ].join("\n");
    case "paper":
      return [
        "ACTIVE THEME: PAPER. Override any color choices implied by prior turns.",
        "MUST USE: warm cream/paper backgrounds only (bg-stone-50, bg-amber-50, or inline style=\"background:#f5ecd6\"). Warm brown body text only (text-stone-700, text-stone-800).",
        "MUST NOT USE: dark backgrounds, black, slate-900, zinc-950, white text, text-zinc-100, or saturated electric colors.",
        "Use serif fonts throughout (font-serif). Editorial print aesthetic — FT Weekend, NYT Magazine, printed broadsheet.",
        "Hairline borders: border-stone-300/400. Accents: muted sepia/burgundy (text-amber-800, text-red-900).",
      ].join("\n");
    case "dark":
    default:
      return [
        "ACTIVE THEME: DARK. Override any color choices implied by prior turns.",
        "MUST USE: near-black backgrounds (bg-slate-950, bg-zinc-950, bg-neutral-900). Light body text (text-slate-100, text-zinc-200).",
        "MUST NOT USE: bg-white, bg-slate-50, text-slate-900, or any light backgrounds.",
        "Hairline borders: border-white/10 or border-slate-800. Accents: emerald-400 / rose-400 / amber-400 / indigo-400.",
      ].join("\n");
  }
}

function nowEastern(): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  return fmt.format(new Date());
}

export const SYSTEM_PROMPT = `You render replies as live HTML inside a sandboxed iframe with Tailwind (+ typography plugin) preloaded.

You have tools to fetch live data: web search, web fetch, weather, news, places (Google), street view, market quotes, and price aggregates. Use them whenever the user's question requires current/real-world information instead of guessing.

Format: a short plaintext intro is welcome — speak like a designer handing over a draft — then one HTML block wrapped in a single root <div>...</div>. No <html>, <head>, or <body> tags. No Markdown syntax.

Aesthetic — editorial with punch. Think New York Magazine spreads, Bloomberg Terminal, Wired features, FT Weekend. Strong typographic hierarchy: oversized hero numbers and display headlines (text-5xl / text-6xl with bold weights), tight all-caps mono kickers above sections, generous pull-quote treatments. Sharp corners (avoid rounded-*), hairline borders (border-slate-200/300), confident whitespace. Muted base (slate / stone / zinc) PLUS one saturated accent per render — emerald for up/positive, rose for down/negative, amber for caution, indigo for emphasis — used to draw the eye, not paint walls. Tabular numerals (font-mono, tabular-nums) for any data, sized large. Use rules (border-t / border-b) and grids to compose, not boxes-on-boxes. No emojis, no gradients, no bouncy shadows. Make it feel designed, not minimal.

Style with Tailwind utility classes. For visualizations, inline <svg>, <canvas> + <script>, or HTML primitives — fully self-contained.

For places, prefer the Places UI Kit web components when get_places returns IDs: <gmp-place-details><gmp-place-details-place-request place="PLACE_ID"></gmp-place-details-place-request><gmp-place-content-config></gmp-place-content-config></gmp-place-details>. The iframe loads Maps JS so these render natively.

External assets are fine; sandbox allows outbound. Don't invent specific photo URLs — prefer stable patterns: picsum.photos/{w}/{h}, placehold.co/{w}x{h}, cdn.simpleicons.org/{slug} (brand logos), flagcdn.com/w320/{cc}.png (flags), youtube.com/embed/{id} (video), upload.wikimedia.org/... (public domain).

Units: American/imperial throughout — °F for temperature, mph for wind, miles, feet, oz, lb, USD. Convert from API responses if they come back metric.

Prior assistant HTML may be sent back. Keep replies self-contained and reasonably sized so context doesn't bloat.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolEvent {
  name: string;
  args: Record<string, unknown>;
  status: "start" | "end";
  result?: string;
  error?: string;
}

export interface StreamHandlers {
  onText: (text: string) => void;
  onReasoning: (text: string) => void;
  onTool: (ev: ToolEvent) => void;
  onError: (err: Error) => void;
  onEnd: () => void;
}

export async function streamChat(
  messages: ChatMessage[],
  theme: string | undefined,
  sessionId: string | undefined,
  signal: AbortSignal,
  handlers: StreamHandlers,
): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    handlers.onError(new Error("DEEPSEEK_API_KEY is not set"));
    return;
  }

  const priorMessages = messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  const latest = messages[messages.length - 1];
  const manifest = sessionId ? manifestLine(sessionId) : null;
  const perTurn = [themeBrief(theme), `Current time: ${nowEastern()}.`];
  if (manifest) perTurn.push(manifest);
  const convo: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...priorMessages,
    { role: "system", content: perTurn.join("\n\n") },
  ];
  if (latest) convo.push({ role: latest.role, content: latest.content });

  try {
    let round = 0;
    while (true) {
      round++;
      const t0 = Date.now();
      const reqBody = JSON.stringify({
        model: MODEL,
        stream: true,
        max_tokens: 40000,
        messages: convo,
        tools: TOOLS,
        thinking: { type: "disabled" },
      });
      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: reqBody,
        signal,
      });
      console.log(`[llm] r${round} HTTP ${res.status} in ${Date.now() - t0}ms`);

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
      }

      const assistantMessage: any = { role: "assistant", content: "" };
      const accToolCalls = new Map<number, any>();
      let reasoningContent = "";

      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let firstChunkLogged = false;
      let done = false;

      streamLoop: while (!done) {
        const r = await reader.read();
        done = r.done;
        if (r.value) buf += decoder.decode(r.value, { stream: !done });

        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            done = true;
            break streamLoop;
          }
          let chunk: any;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          if (!firstChunkLogged) {
            firstChunkLogged = true;
            console.log(`[llm] r${round} first chunk after ${Date.now() - t0}ms`);
          }
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          const reasoningDelta = delta.reasoning_content;
          if (reasoningDelta) {
            reasoningContent += reasoningDelta;
            handlers.onReasoning(reasoningDelta);
          }
          if (delta.content) {
            assistantMessage.content += delta.content;
            handlers.onText(delta.content);
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              let entry = accToolCalls.get(idx);
              if (!entry) {
                entry = { id: tc.id ?? "", type: "function", function: { name: "", arguments: "" } };
                accToolCalls.set(idx, entry);
              }
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.function.name += tc.function.name;
              if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
            }
          }
        }
      }

      const toolCalls = [...accToolCalls.values()];

      if (toolCalls.length === 0) {
        handlers.onEnd();
        return;
      }

      assistantMessage.tool_calls = toolCalls;
      if (reasoningContent) assistantMessage.reasoning_content = reasoningContent;
      convo.push(assistantMessage);

      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(tc.function.arguments || "{}");
          } catch {
            parsed = { raw: tc.function.arguments };
          }
          handlers.onTool({ name: tc.function.name, args: parsed, status: "start" });
          const handler = HANDLERS[tc.function.name];
          let result: string;
          let error: string | undefined;
          try {
            result = handler ? await handler(parsed, { sessionId }) : `Error: unknown tool ${tc.function.name}`;
            if (result.startsWith("Error:")) error = result;
          } catch (err) {
            result = `Error: ${err instanceof Error ? err.message : String(err)}`;
            error = result;
          }
          handlers.onTool({ name: tc.function.name, args: parsed, status: "end", result, error });
          return { tc, result };
        }),
      );

      for (const r of results) {
        convo.push({
          role: "tool",
          tool_call_id: r.tc.id,
          content: r.result,
        });
      }
    }
  } catch (err) {
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
