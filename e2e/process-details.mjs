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
  browser = await chromium.launch();
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
    const context = await browser.newContext({ viewport, locale: "en-US", extraHTTPHeaders: { "x-pi-desktop-token": token } });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(`**/api/agent/${id}/events`, route => route.continue({ url: streamUrl }));
    await page.route(`**/api/agent/${id}?*`, route => route.fulfill({ json: { running: busy, state: { isStreaming: busy, isPromptRunning: busy, extensionStatuses: [] } } }));
    await page.goto(`${base}/?session=${id}`);
    await page.locator("textarea").last().waitFor();
    await page.waitForFunction(() => document.querySelector('[data-entry-id="user"]'));
    await page.waitForTimeout(300);
    assert.ok(activeResponse, "UI must connect its SSE stream");
    busy = true;
    send({ type: "agent_start" });
    let message = assistant([{ type: "thinking", thinking: "First thought\nNewest thought" }]);
    send({ type: "message_start", message });
    const toggle = page.getByRole("button", { name: /^Process details/ });
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await page.locator(".process-activity").filter({ hasText: "Newest thought" }).waitFor();
    assert.equal(await page.locator(".process-details-body").count(), 0);
    send({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "\nLatest streamed thought" } });
    await page.locator(".process-activity").filter({ hasText: "Latest streamed thought" }).waitFor();
    await page.screenshot({ path: join(artifacts, `folded-thinking-${viewport.width}.png`) });

    const call = { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "echo latest-tool" } };
    message = { ...message, content: [{ type: "thinking", thinking: "First thought\nNewest thought\nLatest streamed thought" }, call], stopReason: "toolUse" };
    send({ type: "message_update", assistantMessageEvent: { type: "toolcall_end", contentIndex: 1, toolCall: call } });
    await page.locator(".process-activity").filter({ hasText: "⋯ bash · echo latest-tool" }).waitFor();
    await complete(message);
    send({ type: "tool_execution_start", toolCallId: "call-1", toolName: "bash" });
    send({ type: "tool_execution_update", toolCallId: "call-1", toolName: "bash", partialResult: { content: [{ type: "text", text: "partial output" }] } });
    await page.locator(".process-activity").filter({ hasText: "⋯ bash" }).waitFor();
    await complete({ role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "Tool result output" }], isError: false });
    send({ type: "tool_execution_end", toolCallId: "call-1", toolName: "bash" });
    await page.locator(".process-activity").filter({ hasText: "✓ bash" }).waitFor();
    await page.screenshot({ path: join(artifacts, `folded-tool-${viewport.width}.png`) });

    await page.locator(".process-activity").click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    // New completed steps must remain inside the same manually opened group.
    for (let i = 0; i < 24; i++) await complete({ ...assistant([{ type: "text", text: `Process step ${i}: retained details` }]), stopReason: "toolUse" });
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
    await page.reload();
    await page.getByText("Visible streamed final answer", { exact: true }).waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false", "Reloaded history defaults to folded");
    assert.equal(await body.count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    // An unsuccessful turn must keep the provider failure outside its folded process.
    busy = true;
    send({ type: "agent_start" });
    await complete({ role: "user", content: "Error fixture", timestamp: Date.now() });
    await complete({ ...assistant([{ type: "text", text: "Intermediate progress before failed tool" }]), stopReason: "toolUse" });
    await complete({ ...assistant([{ type: "thinking", thinking: "Error turn reasoning" }]), stopReason: "toolUse" });
    await complete({ ...assistant([]), stopReason: "error", errorMessage: "Fixture provider failure" });
    await page.getByText("Fixture provider failure", { exact: false }).waitFor();
    assert.equal(await page.getByText("Intermediate progress before failed tool", { exact: true }).count(), 0);
    assert.equal(await page.locator(".process-details-body").count(), 0);
    busy = false;
    send({ type: "agent_settled" });
    await page.getByRole("button", { name: "Stop agent", exact: true }).waitFor({ state: "hidden" });
    await page.getByText("Fixture provider failure", { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px: immediate folding, latest thought/tool, partial status, click expansion, height/keyboard scroll, streamed answer, completion, reload and visible provider errors`);
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
