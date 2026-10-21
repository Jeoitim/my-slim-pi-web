import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { copyText } = await createJiti(import.meta.url).import("./clipboard.ts");
function globalValue(t, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
}

test("desktop copying uses the isolated native bridge despite denied browser permission", async t => {
  const writes = [];
  globalValue(t, "window", { piDesktop: { writeClipboardText: async text => writes.push(text) } });
  globalValue(t, "navigator", { clipboard: { writeText: () => { assert.fail("Desktop must not request browser clipboard permission"); } } });
  await copyText("const value = '中文';\n");
  assert.deepEqual(writes, ["const value = '中文';\n"]);
});

test("a failed native write is reported instead of pretending it copied", async t => {
  globalValue(t, "window", { piDesktop: { writeClipboardText: async () => { throw new Error("write failed"); } } });
  await assert.rejects(copyText("code"), /write failed/);
});

test("browser fallback reports execCommand failure and restores focus and selection", async t => {
  class Element { focus() { this.focused = true; } }
  const active = new Element();
  const range = { cloneRange: () => range };
  const restored = [];
  const selection = { rangeCount: 1, getRangeAt: () => range, removeAllRanges() {}, addRange: value => restored.push(value) };
  const textarea = { style: {}, select() {}, remove() { this.removed = true; } };
  globalValue(t, "HTMLElement", Element);
  globalValue(t, "window", { getSelection: () => selection });
  globalValue(t, "navigator", { clipboard: { writeText: async () => { throw new Error("permission denied"); } } });
  globalValue(t, "document", { activeElement: active, createElement: () => textarea, body: { appendChild() {} }, execCommand: () => false });
  await assert.rejects(copyText("code"), /Clipboard write failed/);
  assert.equal(textarea.removed, true);
  assert.equal(active.focused, true);
  assert.deepEqual(restored, [range]);
});
