import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { ProcessDetailsGroup } = await jiti.import("./ProcessDetailsGroup.tsx");
const { createStreamingStore } = await jiti.import("@/lib/streaming-message");

function render(props = {}) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null,
    React.createElement(ProcessDetailsGroup, { messageCount: 2, toolCallCount: 1, store: createStreamingStore(), messageProps: {}, ...props }, "hidden full process")));
}

test("history and unfinished turns start folded; search reveals a bounded region", () => {
  for (const live of [false, true]) {
    const html = render({ live, activity: { type: "thinking", text: "latest thought" } });
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /latest thought/);
    assert.doesNotMatch(html, /hidden full process/);
  }
  const html = render({ reveal: true });
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /hidden full process/);
  assert.match(html, /max-height:min\(420px/);
  assert.match(html, /overflow-y:auto/);
  assert.match(html, /tabindex="0"/);
  const notices = render({ messageCount: 0, toolCallCount: 0, live: true });
  assert.match(notices, /hidden full process/);
  assert.doesNotMatch(notices, /aria-expanded/);
});

test("streaming thinking and tools fold immediately while answer text stays visible", () => {
  const store = createStreamingStore();
  const snapshot = content => store.dispatch({ type: "snapshot", message: { role: "assistant", model: "fixture", provider: "fixture", content } });
  const thought = { type: "thinking", thinking: "Old thought\nNewest thought" };
  snapshot([thought]);
  let html = render({ store, live: true, messageCount: 0, toolCallCount: 0 });
  assert.match(html, /1 message/);
  assert.match(html, /Newest thought/);
  assert.doesNotMatch(html, /Old thought/);
  const call = { type: "toolCall", toolCallId: "r", toolName: "read", input: { path: "fixture.txt" } };
  snapshot([thought, call]);
  html = render({ store, live: true });
  assert.match(html, /⋯ read · fixture.txt/);
  assert.doesNotMatch(html, /Newest thought/);
  snapshot([thought, { type: "text", text: "Visible final answer" }]);
  html = render({ store, live: true });
  assert.match(html, /Visible final answer/);
  assert.doesNotMatch(html, /Old thought/);
  snapshot([{ type: "text", text: "Plain answer" }]);
  html = render({ store, live: true, messageCount: 0 });
  assert.match(html, /Plain answer/);
  assert.doesNotMatch(html, /aria-expanded/);
});

test("latest tool status uses its actual result and MCP display names", () => {
  const call = { type: "toolCall", toolName: "mcp__opaque__id", toolCallId: "r", input: {} };
  const html = render({ activity: { type: "toolCall", call, text: "query" }, messageProps: { toolResults: new Map([["r", { isError: true, details: { server: "docs.v2", tool: "search.pages" } }]]) } });
  assert.match(html, /✕ docs.v2\/search.pages · query/);
  const pending = render({ live: true, activity: { type: "toolCall", call, text: "query" }, pendingToolResults: new Map([["r", {}]]), messageProps: { toolResults: new Map([["r", { content: [] }]]) } });
  assert.match(pending, /⋯ mcp__opaque__id · query/);
});
