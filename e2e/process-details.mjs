// Real production UI with deterministic SSE fixtures; no model or personal AgentRoot.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
const area = join(root, ".local", `process-details-${randomUUID()}`);
const agent = join(area, "agent");
const sessions = join(agent, "sessions", "fixture");
const artifacts = join(root, "test-results", "process-details");
await mkdir(sessions, { recursive: true });
await mkdir(artifacts, { recursive: true });
const cases = [{ width: 1280, height: 800 }, { width: 390, height: 844 }].map(viewport => {
  const id = randomUUID();
  return { viewport, id, file: join(sessions, `2026-10-30T00-00-00-000Z_${id}.jsonl`) };
});
// Seed every file before the backend's first catalogue scan, as e2e/run does.
for (const { id, file } of cases) {
  const timestamp = "2026-10-30T00:00:00.000Z";
  await writeFile(file, [
    { type: "session", version: 3, id, timestamp, cwd: area },
    { type: "message", id: "user", parentId: null, timestamp, message: { role: "user", content: "Process details fixture", timestamp: Date.now() } },
  ].map(value => JSON.stringify(value)).join("\n") + "\n");
}
const token = randomBytes(32).toString("hex");
const child = fork(join(root, "electron/server/index.cjs"), [], {
  cwd: join(root, ".desktop/server"), windowsHide: true,
  env: { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", PI_WEB_PASSWORD: "", PI_WEB_REMOTE: "", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "ignore", "pipe", "ipc"],
});
let backendLog = "";
child.stderr.on("data", data => { backendLog += data; });
const exited = new Promise(resolve => child.once("exit", resolve));
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Backend timeout: ${backendLog.slice(-2000)}`)), 120_000);
  child.on("message", message => {
    if (message.type === "ready") { clearTimeout(timer); resolve(message); }
    if (message.type === "failed") { clearTimeout(timer); reject(new Error(message.error)); }
  });
});
child.send({ type: "start", root: join(root, ".desktop/server"), dev: false, token });
let browser;
let activeResponse;
const streams = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
  response.write(`data: ${JSON.stringify({ type: "connected", isStreaming: false })}\n\n`);
  activeResponse = response;
});
await new Promise(resolve => streams.listen(0, "127.0.0.1", resolve));
const streamUrl = `http://127.0.0.1:${streams.address().port}/events`;
const send = event => activeResponse.write(`data: ${JSON.stringify(event)}\n\n`);
const assistant = content => ({ role: "assistant", provider: "fixture", model: "fixture", timestamp: Date.now(), content });

try {
  const { internalUrl: base } = await ready;
  browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
  for (const { viewport, id, file } of cases) {
    const timestamp = "2026-10-30T00:00:00.000Z";
    let parentId = "user";
    const complete = async message => {
      const entryId = randomBytes(4).toString("hex");
      await appendFile(file, JSON.stringify({ type: "message", id: entryId, parentId, timestamp, message }) + "\n");
      parentId = entryId;
      send({ type: "message_end", message });
    };
    let busy = false;
    const context = await browser.newContext({ viewport, locale: "en-US", colorScheme: viewport.width <= 640 ? "dark" : "light", extraHTTPHeaders: { "x-pi-desktop-token": token } });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(`**/api/agent/${id}/events*`, route => route.continue({ url: streamUrl }));
    await page.route(`**/api/agent/${id}?*`, route => route.fulfill({ json: { running: busy, state: { isStreaming: busy, isPromptRunning: busy, extensionStatuses: [] } } }));
    await page.goto(`${base}/?session=${id}`);
    await page.locator("textarea").last().waitFor();
    await page.waitForFunction(() => document.querySelector('[data-entry-id="user"]'));
    for (let attempt = 0; attempt < 100 && !activeResponse; attempt++) await page.waitForTimeout(100);
    assert.ok(activeResponse, "UI must connect its SSE stream");
    busy = true;
    send({ type: "agent_start" });
    let message = assistant([{ type: "thinking", thinking: "First thought\nNewest thought" }]);
    send({ type: "message_start", message });
    const toggle = page.getByRole("button", { name: /^Process details/ });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    const preview = page.locator(".process-activity-scroll");
    await preview.locator("[data-thinking-card]").filter({ hasText: "Newest thought" }).waitFor();
    assert.equal(await page.locator(".process-details-body").count(), 0);
    send({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "\nLatest streamed thought · 最新思考" } });
    await preview.locator("[data-thinking-card]").filter({ hasText: "Latest streamed thought · 最新思考" }).waitFor();
    const cdp = await context.newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root: documentRoot } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: documentRoot.nodeId, selector: ".process-activity-scroll [data-thinking-card] button span" });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    await writeFile(join(artifacts, `fonts-${viewport.width}.json`), JSON.stringify(fonts, null, 2));
    assert.ok(fonts.some(font => /YaHei|Noto.*(?:SC|CJK)/i.test(font.familyName)), "Chinese preview uses an installed Simplified Chinese font");
    await cdp.detach();
    await writeFile(join(artifacts, `folded-thinking-${viewport.width}.html`), await page.evaluate(() => {
      const css = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules, rule => rule.cssText); } catch { return []; } }).join("\n");
      return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${css}</style></head><body>${document.querySelector(".process-details-group").outerHTML}</body></html>`;
    }));
    await page.screenshot({ path: join(artifacts, `folded-thinking-${viewport.width}.png`) });

    const call = { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "echo latest-tool" } };
    message = { ...message, content: [{ type: "thinking", thinking: "First thought\nNewest thought\nLatest streamed thought · 最新思考" }, call], stopReason: "toolUse" };
    send({ type: "message_update", assistantMessageEvent: { type: "toolcall_end", contentIndex: 1, toolCall: call } });
    await preview.locator("[data-tool-card]").filter({ hasText: "echo latest-tool" }).waitFor();
    await complete(message);
    send({ type: "tool_execution_start", toolCallId: "call-1", toolName: "bash" });
    send({ type: "tool_execution_update", toolCallId: "call-1", toolName: "bash", partialResult: { content: [{ type: "text", text: "partial output" }] } });
    assert.equal(await preview.getByText("partial output", { exact: true }).count(), 0);
    await complete({ role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "Tool result output" }], isError: false });
    send({ type: "tool_execution_end", toolCallId: "call-1", toolName: "bash" });
    await preview.locator("[data-tool-card]").filter({ hasText: "echo latest-tool" }).waitFor();
    assert.equal(await preview.getByText("Tool result output", { exact: true }).count(), 0);
    await page.screenshot({ path: join(artifacts, `folded-tool-${viewport.width}.png`) });

    for (let i = 0; i < 24; i++) await complete({ ...assistant([{ type: "text", text: `Process step ${i}: retained details` }]), stopReason: "toolUse" });
    await preview.getByText("Process step 23: retained details", { exact: true }).waitFor();
    const foldedSize = await preview.evaluate(element => ({ height: element.clientHeight, scroll: element.scrollHeight, row: element.lastElementChild.getBoundingClientRect().height, top: element.scrollTop }));
    assert.ok(foldedSize.scroll > foldedSize.height * 3, "Fold has actual scroll history");
    assert.ok(Math.abs(foldedSize.height - foldedSize.row) <= 1, "Only one original row is visible");
    assert.ok(foldedSize.top > 0, "Latest row is brought into view");
    await preview.evaluate(element => { element.scrollTop = 0; });
    await page.waitForTimeout(100);
    await complete({ ...assistant([{ type: "thinking", thinking: "Newest reasoning after scrolling" }]), stopReason: "toolUse" });
    await preview.getByText("Newest reasoning after scrolling", { exact: true }).waitFor({ state: "attached" });
    assert.equal(await preview.evaluate(element => element.scrollTop), 0, "New activity must not pull a reader away from older rows");
    await preview.focus();
    await page.keyboard.press("End");
    await page.waitForFunction(() => {
      const element = document.querySelector(".process-activity-scroll");
      return element.scrollHeight - element.clientHeight - element.scrollTop < 2;
    });
    await page.screenshot({ path: join(artifacts, `folded-scroll-${viewport.width}.png`) });
    await preview.getByRole("button", { name: /Newest reasoning after scrolling/ }).click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const body = page.locator(".process-details-body");
    await body.getByText("Process step 23: retained details", { exact: true }).waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const size = await body.evaluate(element => ({ height: element.clientHeight, scroll: element.scrollHeight, viewport: innerHeight }));
    assert.ok(size.scroll > size.height, "Long process must scroll internally");
    assert.ok(size.height <= Math.min(420, size.viewport / 2) + 1);
    await body.evaluate(element => { element.scrollTop = 100; });
    assert.ok(await body.evaluate(element => element.scrollTop > 0));
    await body.focus();
    await page.keyboard.press("End");
    await page.waitForFunction(() => document.querySelector(".process-details-body")?.scrollTop > 100);
    await page.screenshot({ path: join(artifacts, `expanded-scroll-${viewport.width}.png`) });

    message = assistant([{ type: "thinking", thinking: "Final private reasoning" }, { type: "text", text: "Visible streamed final answer" }]);
    send({ type: "message_start", message });
    await page.getByText("Visible streamed final answer", { exact: true }).waitFor();
    assert.equal(await body.getByText("Visible streamed final answer", { exact: true }).count(), 0);
    await complete({ ...message, stopReason: "stop" });
    busy = false;
    send({ type: "agent_settled" });
    await page.getByRole("button", { name: "Stop agent", exact: true }).waitFor({ state: "hidden" });
    await page.getByText("Visible streamed final answer", { exact: true }).waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true", "Completion must preserve manual expansion");
    await toggle.click();
    assert.equal(await body.count(), 0);
    assert.equal(await preview.count(), 0, "Completed turns hide the activity row");
    await page.reload();
    await page.getByText("Visible streamed final answer", { exact: true }).waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Reloaded history defaults to folded");
    assert.equal(await body.count(), 0);
    assert.equal(await preview.count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    const chooseFolding = async enabled => {
      const sidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
      if (await sidebar.isVisible()) await sidebar.click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const setting = page.getByRole("switch", { name: "Fold process details by default", exact: true });
      await setting.waitFor();
      if ((await setting.getAttribute("aria-checked")) !== String(enabled)) await setting.click();
      assert.equal(await setting.getAttribute("aria-checked"), String(enabled));
      await page.locator(".settings-dialog-close").click();
      if (viewport.width <= 640) await page.locator(".sidebar-overlay-backdrop").click({ position: { x: viewport.width - 5, y: viewport.height / 2 } });
    };
    await chooseFolding(false);
    await page.getByText("Process step 23: retained details", { exact: true }).waitFor();
    assert.equal(await page.locator(".process-details-group, .process-details-body, .process-activity-scroll").count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("pi-web:fold-process-details")), "false");
    await page.reload();
    await page.getByText("Process step 23: retained details", { exact: true }).waitFor();
    assert.equal(await page.locator(".process-details-group").count(), 0, "Off preference survives reload");
    await page.screenshot({ path: join(artifacts, `unfolded-original-${viewport.width}.png`) });

    // An unsuccessful turn must keep the provider failure outside its folded process.
    busy = true;
    send({ type: "agent_start" });
    await complete({ role: "user", content: "Error fixture", timestamp: Date.now() });
    await complete({ ...assistant([{ type: "text", text: "Intermediate progress before failed tool" }]), stopReason: "toolUse" });
    await complete({ ...assistant([{ type: "thinking", thinking: "Error turn reasoning" }]), stopReason: "toolUse" });
    await page.getByText("Intermediate progress before failed tool", { exact: true }).waitFor();
    assert.equal(await page.locator(".process-details-group").count(), 0, "Live process is flat while off");
    await chooseFolding(true);
    await complete({ ...assistant([]), stopReason: "error", errorMessage: "Fixture provider failure" });
    await page.getByText("Fixture provider failure", { exact: false }).waitFor();
    assert.equal(await page.locator(".process-details-body").count(), 0);
    busy = false;
    send({ type: "agent_settled" });
    await page.getByRole("button", { name: "Stop agent", exact: true }).waitFor({ state: "hidden" });
    await page.getByText("Fixture provider failure", { exact: false }).waitFor();
    assert.equal(await page.getByText("Intermediate progress before failed tool", { exact: true }).count(), 0);
    await page.evaluate(() => localStorage.setItem("pi-locale", "zh-CN"));
    await page.reload();
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    const showSidebar = page.getByRole("button", { name: "显示侧边栏", exact: true });
    if (await showSidebar.isVisible()) await showSidebar.click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    const chineseSwitch = page.getByRole("switch", { name: "默认折叠处理详情", exact: true });
    await chineseSwitch.scrollIntoViewIfNeeded();
    assert.equal(await chineseSwitch.getAttribute("aria-checked"), "true");
    await page.screenshot({ path: join(artifacts, `settings-zh-CN-${viewport.width}.png`) });
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px: original cards, one-row scroll history, reader position, bounded expansion, final answer, completion hides preview, setting off restores flat history/live display, persistence and provider errors`);
    await context.close();
    activeResponse = undefined;
  }
} finally {
  await browser?.close();
  streams.closeAllConnections();
  await new Promise(resolve => streams.close(resolve));
  if (child.connected) child.send({ type: "stop" });
  await Promise.race([exited, new Promise(resolve => setTimeout(() => { if (child.exitCode === null) child.kill(); resolve(); }, 10_000))]);
  await writeFile(join(artifacts, "backend.log"), backendLog);
}
