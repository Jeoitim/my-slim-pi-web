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

test("only running folds preview activity; completed history keeps just the header", () => {
  for (const live of [false, true]) {
    const html = render({ live, activities: [{ type: "thinking", text: "latest thought" }] });
    assert.match(html, /aria-expanded="false"/);
    assert.equal(html.includes("latest thought"), live);
    assert.equal(html.includes("data-thinking-card"), live);
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
  assert.match(html, /data-tool-card/);
  assert.match(html, /fixture.txt/);
  assert.match(html, /data-thinking-card/);
  assert.doesNotMatch(html, /Old thought/);
  snapshot([thought, { type: "text", text: "Visible final answer" }]);
  html = render({ store, live: true });
  assert.match(html, /Visible final answer/);
  assert.doesNotMatch(html, /Old thought/);
  snapshot([{ type: "text", text: "Plain answer" }]);
  html = render({ store, live: true, messageCount: 0 });
  assert.match(html, /Plain answer/);
  assert.doesNotMatch(html, /aria-expanded/);
});

test("preview reuses original tool styling, result duration and MCP names without output or images", () => {
  const call = { type: "toolCall", toolName: "mcp__opaque__id", toolCallId: "r", input: {} };
  const html = render({ live: true, activities: [{ type: "toolCall", call, text: "query" }], messageProps: { toolResults: new Map([["r", { isError: true, durationMs: 1200, content: [{ type: "text", text: "hidden output" }, { type: "image", source: { type: "url", url: "https://example.invalid/hidden-image.png" } }], details: { server: "docs.v2", tool: "search.pages" } }]]) } });
  assert.match(html, /data-tool-card/);
  assert.match(html, /docs.v2\//);
  assert.match(html, /search.pages/);
  assert.match(html, /1.2s/);
  assert.match(html, /rgba\(248,113,113,0.45\)/);
  assert.doesNotMatch(html, /hidden output|hidden-image/);
});

test("disabling folding restores the flat process and streaming answer without any group height cap", () => {
  const store = createStreamingStore();
  store.dispatch({ type: "snapshot", message: { role: "assistant", content: [{ type: "thinking", thinking: "Full current reasoning" }, { type: "text", text: "Current final answer" }] } });
  const html = render({ folded: false, live: true, store });
  assert.match(html, /hidden full process/);
  assert.match(html, /Full current reasoning/);
  assert.match(html, /Current final answer/);
  assert.doesNotMatch(html, /process-details-(?:group|body)|process-activity-scroll|max-height:|overflow-y:/);
});

test("folded preview retains only a bounded scroll history and does not serialize tool payloads", () => {
  const activities = Array.from({ length: 80 }, (_, i) => ({ type: "thinking", text: `Thought ${i}` }));
  const call = { type: "toolCall", toolName: "write", toolCallId: "write", input: { path: "file.txt", content: { toJSON() { throw new Error("must not serialize"); } } } };
  activities.push({ type: "toolCall", call, text: "file.txt" });
  const html = render({ live: true, activities });
  assert.equal((html.match(/class="process-activity-row"/g) ?? []).length, 32);
  assert.doesNotMatch(html, /Thought 0</);
  assert.match(html, /Thought 79/);
  assert.match(html, /file.txt/);
});
