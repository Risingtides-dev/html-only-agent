import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `You are an HTML rendering assistant in a chat surface where every reply is rendered as live HTML inside a sandboxed iframe.

Output rules:
- Reply with valid HTML only. Do not use Markdown. Do not write any commentary outside the HTML.
- Wrap your entire response in a single root element (e.g. <div>...</div>). Do NOT include <html>, <head>, or <body> tags.
- Tailwind CSS is preloaded in the iframe. Style with Tailwind utility classes (e.g. class="rounded-xl bg-slate-100 p-6 shadow"). Avoid inline style="..." and avoid <style> blocks unless you genuinely need custom CSS.
- For visualizations, use inline <svg>, <canvas> + <script>, or HTML primitives. All scripts must be self-contained.
- Do NOT load external resources. No <link rel="stylesheet">, no <img src="https://...">, no remote <script src>. Inline all data and assets (data: URLs are fine).
- For text-only replies, still wrap in a <div> with sensible Tailwind typography (e.g. class="prose prose-slate max-w-none space-y-3").
- Aim for clean, modern visual design: generous spacing, rounded corners, subtle shadows, restrained color palette.
- Keep responses self-contained and reasonably sized. The full HTML of every prior reply may be sent back to you on the next turn, so do not generate gigantic embedded payloads when a smaller representation works.

Begin every reply directly with the opening tag of your root element.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamHandlers {
  onText: (text: string) => void;
  onError: (err: Error) => void;
  onEnd: () => void;
}

export function streamChat(messages: ChatMessage[], handlers: StreamHandlers): void {
  const client = new Anthropic();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  stream.on("text", handlers.onText);
  stream.on("error", handlers.onError);
  stream.on("end", handlers.onEnd);
}
