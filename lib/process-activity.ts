import type { AssistantContentBlock, ToolCallContent } from "./types";

export type ProcessActivity =
  | { type: "thinking" | "text"; text: string }
  | { type: "toolCall"; call: ToolCallContent; text: string };

/** Read only a bounded tail: looping reasoning can grow to megabytes. */
function latestLine(text: string): string {
  const tail = text.slice(-1000).trimEnd();
  const line = tail.slice(Math.max(tail.lastIndexOf("\n"), tail.lastIndexOf("\r")) + 1).trim();
  return Array.from(line).slice(-240).join("");
}

export function getProcessActivity(blocks: AssistantContentBlock[]): ProcessActivity | undefined {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.type === "toolCall") {
      const input = block.input ?? {};
      // Keep the full argument table in the existing tool card. Never stringify
      // a potentially huge write payload just to fill a single status line.
      const detail = [input.path, input.file_path, input.command, input.query, input.description]
        .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
      const text = detail ? Array.from(detail.slice(0, 1000).split(/[\r\n]/, 1)[0]).slice(0, 240).join("") : "";
      return { type: "toolCall", call: block, text };
    }
    if (block.type === "thinking" || block.type === "text") {
      const text = latestLine(block.type === "thinking" ? block.thinking : block.text);
      if (text || (block.type === "thinking" && block.deferred)) return { type: block.type, text };
    }
  }
}

