import { _electron as electron } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const baseline = process.argv.includes("--baseline");
const sourceHost = process.argv.includes("--source-host");
const password = process.argv.includes("--password") ? randomUUID() : "";
const area = resolve(`.local/history-viewer-${randomUUID()}`);
const agent = join(area, "agent 中文 history");
const cwd = join(area, "workspace 中文");
const id = randomUUID();
const timestamp = new Date().toISOString();
await mkdir(join(agent, "sessions/fixture"), { recursive: true });
await mkdir(cwd);
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content, stopReason = "stop") => ({ role: "assistant", content, api: "openai-responses", provider: "fixture", model: "fixture", stopReason, usage, timestamp: Date.now() });
const entry = (entryId, parentId, message) => ({ type: "message", id: entryId, parentId, timestamp, message });
await writeFile(join(agent, "sessions/fixture", `2026-10-30T00-00-00-000Z_${id}.jsonl`), [
  { type: "session", version: 3, id, timestamp, cwd },
  entry("user", null, { role: "user", content: [{ type: "text", text: "Full history question · 完整历史验证" }, { type: "image", mimeType: "image/gif", data: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }], timestamp: Date.now() }),
  entry("process", "user", assistant([{ type: "thinking", thinking: "Full history private reasoning" }, { type: "toolCall", id: "call", name: "bash", arguments: { command: "echo history" } }], "toolUse")),
  entry("result", "process", { role: "toolResult", toolCallId: "call", toolName: "bash", content: [{ type: "text", text: "Full history tool output" }], isError: false, timestamp: Date.now() }),
  entry("branch", "user", assistant([{ type: "text", text: "Alternate history branch" }])),
  entry("answer", "result", assistant([{ type: "text", text: "**Full history answer**\n\n```js\nconsole.log('history');\n```" }])),
].map(value => JSON.stringify(value)).join("\n") + "\n");
const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_DESKTOP_TEST_USER_DATA: join(area, "profile"), PI_OFFLINE: "1", PI_DESKTOP_NODE: process.execPath };
for (const name of ["PI_WEB_PASSWORD", "PI_WEB_REMOTE", "ELECTRON_RUN_AS_NODE"]) delete env[name];
if (password) env.PI_WEB_PASSWORD = password;
const app = await electron.launch({ executablePath: sourceHost ? createRequire(import.meta.url)("electron") : process.env.PI_DESKTOP_E2E_EXECUTABLE || resolve("dist-desktop/win-unpacked/MySlimPiWeb.exe"), args: sourceHost ? [resolve("electron/main/index.cjs")] : [], env, timeout: 120_000 });
let origin;
try {
  const main = await app.firstWindow();
  main.setDefaultTimeout(30_000);
  await main.waitForURL(url => url.protocol === "http:", { timeout: 120_000 });
  origin = new URL(main.url()).origin;
  if (password) {
    await main.waitForURL(url => url.pathname === "/login");
    await main.waitForFunction(() => {
      const input = document.querySelector('input[type="password"]');
      return input && Object.keys(input).some(key => key.startsWith("__reactProps$"));
    });
    await main.locator('input[type="password"]').fill(password);
    await main.getByRole("button", { name: /sign in|log in|登录/i }).click();
    await main.waitForURL(url => url.pathname === "/");
  }
  await main.evaluate(() => localStorage.setItem("pi-locale", "en"));
  await main.goto(`${origin}/?session=${id}`);
  await main.getByText("Full history answer", { exact: true }).waitFor();
  const exportUrl = `${origin}/api/sessions/${id}/export?inline=1`;
  const response = await main.evaluate(async url => {
    const response = await fetch(url);
    const text = await response.text();
    return { status: response.status, html: text.includes('id="session-data"'), ...(!response.ok && { error: text.slice(0, 2000) }) };
  }, exportUrl);
  assert.deepEqual(response, { status: 200, html: true });
  const popup = app.waitForEvent("window");
  await main.getByRole("button", { name: "Full history", exact: true }).click();
  const viewer = await popup;
  const errors = [];
  viewer.on("pageerror", error => errors.push(error.message));
  viewer.setDefaultTimeout(30_000);
  await viewer.waitForURL(url => url.pathname.endsWith("/export"));
  await viewer.waitForLoadState("load");
  const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/export"))?.webContents.getLastWebPreferences());
  if (baseline) {
    assert.equal(preferences.javascript, false);
    assert.equal((await viewer.locator("#messages").innerText()).trim(), "");
    await viewer.screenshot({ path: join(area, "blank-before.png") });
    console.log(JSON.stringify({ baseline: true, exportStatus: response.status, javascript: preferences.javascript, renderedHistory: false, area }));
  } else {
    await viewer.getByText("Full history answer", { exact: true }).waitFor();
    await viewer.getByText("Full history question · 完整历史验证", { exact: true }).waitFor();
    await viewer.getByText("Full history private reasoning", { exact: true }).waitFor();
    await viewer.getByText("Full history tool output", { exact: true }).waitFor();
    await viewer.waitForFunction(() => [...document.querySelectorAll("#messages img")].some(image => image.naturalWidth > 0));
    assert.equal(preferences.javascript, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.sandbox, true);
    assert.ok(!preferences.preload);
    assert.deepEqual(await app.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/export"))?.webContents.session.cookies.get({ name: "pi_web_session" })), [], "The history session must not retain the app login cookie");
    assert.deepEqual(await viewer.evaluate(() => ({ bridge: typeof window.piDesktop, node: typeof window.require, opener: window.opener })), { bridge: "undefined", node: "undefined", opener: null });
    assert.deepEqual(await viewer.evaluate(() => {
      let storageBlocked = false;
      try { localStorage.getItem("history-boundary"); } catch { storageBlocked = true; }
      return { origin: window.origin, storageBlocked };
    }), { origin: "null", storageBlocked: true }, "History has an opaque origin, isolated from app storage");
    const blocked = await viewer.evaluate(async origin => Promise.all([
      fetch(`${origin}/api/agent/running`),
      fetch(`${origin}/api/agent/new`, { method: "POST", body: "{}" }),
    ].map(request => request.then(() => false, () => true))), origin);
    assert.deepEqual(blocked, [true, true], "History scripts cannot access Agent APIs");
    await viewer.locator('#tree-container [data-id="branch"]').click();
    await viewer.getByText("Alternate history branch", { exact: true }).waitFor();
    await viewer.locator('#tree-container [data-id="answer"]').click();
    await viewer.getByText("Full history answer", { exact: true }).waitFor();
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("/export"))?.isVisible()), true);
    await viewer.screenshot({ path: join(area, "history-after.png") });
    await viewer.reload();
    await viewer.getByText("Full history answer", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    assert.equal(main.url(), `${origin}/?session=${id}`);
    await viewer.close();
    assert.equal(await main.evaluate(() => Boolean(window.piDesktop)), true);
    console.log(JSON.stringify({ passed: true, fullTranscript: true, reasoning: true, tools: true, embeddedImages: true, branches: true, reload: true, isolatedViewer: true, agentRequestsBlocked: true, passwordProtected: Boolean(password), spacedUnicodePaths: true, area }));
  }
} catch (error) {
  for (const [index, page] of (await app.windows()).entries()) await page.screenshot({ path: join(area, `failure-${index}.png`) }).catch(() => {});
  throw error;
} finally {
  // This run owns the disposable AgentRoot; accept stopping only its work if
  // a failed startup leaves the native task-state check unanswered.
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); }).catch(() => {});
  await app.close();
  if (origin) await assert.rejects(fetch(origin, { signal: AbortSignal.timeout(3000) }));
}
