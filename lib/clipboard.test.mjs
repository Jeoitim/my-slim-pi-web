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

/**
 * Stands in for the browser globals `copyText` reaches for, and records what the
 * fallback path did with them. `navigator.clipboard` is left off for the
 * fallback cases: a page that is not a secure context does not have it, which is
 * exactly the environment the fallback exists for.
 */
function stubDom({ execResult, throwOnExec = false, clipboard } = {}) {
  const calls = { select: 0, exec: [], appended: 0, removed: 0 };
  const textarea = {
    value: "",
    style: {},
    select: () => { calls.select += 1; },
    remove: () => { calls.removed += 1; },
  };
  const previous = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  };
  // Node 24 exposes `navigator` as a getter-only global, so plain assignment
  // throws; define both names instead and put their descriptors back afterwards.
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define("navigator", clipboard ? { clipboard } : {});
  define("window", { getSelection: () => null });
  define("document", {
    createElement: (tag) => {
      assert.equal(tag, "textarea");
      return textarea;
    },
    body: {
      appendChild: () => { calls.appended += 1; },
    },
    execCommand: (command) => {
      calls.exec.push(command);
      if (throwOnExec) throw new Error("execCommand is gone");
      return execResult;
    },
  });
  return {
    calls,
    textarea,
    restore: () => {
      for (const [name, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test("a secure context hands the text to the async clipboard and touches no textarea", async () => {
  const handed = [];
  const dom = stubDom({ clipboard: { writeText: (text) => { handed.push(text); return Promise.resolve(); } } });
  try {
    await copyText("hello");
  } finally {
    dom.restore();
  }
  assert.deepEqual(handed, ["hello"]);
  assert.equal(dom.calls.exec.length, 0);
});

test("a non-secure context copies through the textarea fallback", async () => {
  const dom = stubDom({ execResult: true });
  try {
    await copyText("whole file");
  } finally {
    dom.restore();
  }
  assert.equal(dom.textarea.value, "whole file");
  assert.equal(dom.calls.select, 1);
  assert.deepEqual(dom.calls.exec, ["copy"]);
  assert.equal(dom.calls.appended, 1);
  assert.equal(dom.calls.removed, 1);
});

test("a refused fallback copy rejects instead of claiming success", async () => {
  // The browser can say no even without `navigator.clipboard`: no user
  // activation, a locked-down platform. Reporting success here made the caller's
  // "Copied" a lie, and nothing on screen said the text never left the page.
  const dom = stubDom({ execResult: false });
  try {
    await assert.rejects(copyText("refused"), /Clipboard write failed/);
  } finally {
    dom.restore();
  }
  // The textarea is gone before the rejection travels: no hidden node stays behind.
  assert.equal(dom.calls.removed, 1);
});

test("a throwing fallback copy rejects with the browser's error", async () => {
  const dom = stubDom({ throwOnExec: true });
  try {
    await assert.rejects(copyText("boom"), /execCommand is gone/);
  } finally {
    dom.restore();
  }
  assert.equal(dom.calls.removed, 1);
});
