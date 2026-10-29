import assert from "node:assert/strict";
import test from "node:test";
import { getProcessActivity } from "./process-activity.ts";

test("activity follows the latest nonempty thought, tool or commentary", () => {
  const thought = { type: "thinking", thinking: "Old thought\nLatest thought\n  " };
  assert.deepEqual(getProcessActivity([thought]), { type: "thinking", text: "Latest thought" });
  const call = { type: "toolCall", toolName: "read", toolCallId: "r", input: { path: "src/index.ts" } };
  assert.deepEqual(getProcessActivity([thought, call]), { type: "toolCall", call, text: "src/index.ts" });
  assert.equal(getProcessActivity([call, thought]).type, "thinking");
  assert.equal(getProcessActivity([call, { type: "thinking", thinking: " " }]).type, "toolCall");
  assert.equal(getProcessActivity([{ type: "thinking", thinking: "", deferred: true }]).type, "thinking");
  assert.deepEqual(getProcessActivity([{ type: "text", text: "Progress\nChecking results" }]), { type: "text", text: "Checking results" });
  assert.equal(getProcessActivity([]), undefined);
});

test("previews stay bounded and never serialize write payloads", () => {
  const text = "💡".repeat(100_000);
  assert.equal(getProcessActivity([{ type: "thinking", thinking: text }]).text, "💡".repeat(240));
  const call = { type: "toolCall", toolCallId: "w", toolName: "write", input: { path: "file.txt", content: text } };
  assert.equal(getProcessActivity([call]).text, "file.txt");
  const shell = { ...call, input: { command: "echo hello\nsecret second line" } };
  assert.equal(getProcessActivity([shell]).text, "echo hello");
  assert.equal(getProcessActivity([{ ...call, input: {}, rawInput: '{"path":' }]).text, "");
});
