import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
const packaged = process.argv.includes("--packaged");
const root = resolve(".");
const area = join(root, ".local", packaged ? "桌面 安装版 验证" : "桌面 开发版 验证");
const userData = join(area, "profiles", randomBytes(8).toString("hex"));
await mkdir(join(area, "agent"), { recursive: true });
await mkdir(userData, { recursive: true });
await writeFile(join(area, "desktop-lazy-viewer.txt"), "Desktop lazy file viewer verification\n");
const fixtureId = "d478334b-d3bd-49f6-85b4-e4c8c70f1dbb";
const fixtureDir = join(area, "agent/sessions/desktop-e2e");
await mkdir(fixtureDir, { recursive: true });
await writeFile(join(fixtureDir, `2026-10-20T00-00-00-000Z_${fixtureId}.jsonl`), [
  { type: "session", version: 3, id: fixtureId, timestamp: "2026-10-20T00:00:00.000Z", cwd: area },
  { type: "message", id: "00000001", parentId: null, timestamp: "2026-10-20T00:00:01.000Z", message: { role: "user", content: "Desktop shared-backend verification", timestamp: Date.parse("2026-10-20T00:00:01Z") } },
].map(value => JSON.stringify(value)).join("\n") + "\n");
const password = randomBytes(32).toString("hex");
const fetch = (url, options = {}) => globalThis.fetch(url, { signal: AbortSignal.timeout(10_000), ...options });
const environment = { ...process.env, PI_DESKTOP_NODE: process.execPath, PI_CODING_AGENT_DIR: join(area, "agent"),
  PI_DESKTOP_TEST_USER_DATA: userData, PI_WEB_PASSWORD: password, PI_WEB_REMOTE: "1", PI_WEB_ALLOWED_HOSTS: "agent.example.test" };
delete environment.ELECTRON_RUN_AS_NODE;
const executablePath = packaged ? process.env.PI_DESKTOP_E2E_EXECUTABLE || join(root, "dist-desktop/win-unpacked/MySlimPiWeb.exe") : require("electron");
const launchArgs = packaged ? [] : [join(root, "electron/main/index.cjs"), "--desktop-dev"];
const app = await electron.launch({
  executablePath,
  args: launchArgs,
  env: environment, timeout: 120_000,
});
app.process().stdout?.on("data", data => process.stdout.write(data));
app.process().stderr?.on("data", data => process.stderr.write(data));
async function waitForWindowVisibility(visible) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const current = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
    if (current === visible) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Window did not become ${visible ? "visible" : "hidden"}`);
}
let privateOrigin;
try {
  const page = await app.firstWindow();
  page.on("pageerror", error => console.log("PAGE ERROR", error.message));
  page.on("requestfailed", request => console.log("REQUEST FAILED", request.url(), request.failure()?.errorText));
  page.on("console", message => { if (message.type() === "error") console.log("CONSOLE ERROR", message.text().split(password).join("[redacted]")); });
  page.on("response", response => { if (response.status() >= 400) console.log("HTTP", response.status(), response.url()); });
  page.setDefaultTimeout(120_000);
  await page.waitForURL(url => url.protocol === "http:", { timeout: 120_000 });
  privateOrigin = new URL(page.url()).origin;
  await page.waitForLoadState("domcontentloaded");
  console.log("Local Next.js ready; checking authentication and UI.");
  assert.equal((await fetch(privateOrigin)).status, 403);
  // Original Web login still applies even inside the desktop window.
  await page.goto(`${privateOrigin}/login`);
  if (new URL(page.url()).pathname === "/login") {
    await page.locator('input[type="password"]').fill(password);
    await page.waitForFunction(() => {
      const field = document.querySelector('input[type="password"]');
      return field && Object.keys(field).some(key => key.startsWith("__reactProps$"));
    });
    await page.locator('input[type="password"]').fill("");
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in|log in|登录/i }).click();
    await page.waitForURL(url => url.pathname === "/");
  }
  await page.evaluate(() => { localStorage.setItem("pi-locale", "zh-CN"); });
  await page.reload();
  await page.waitForSelector(".desktop-titlebar");
  assert.equal(await page.evaluate(() => typeof window.piDesktop.getSettings), "function");
  const native = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { sandbox: win.webContents.getLastWebPreferences().sandbox, node: win.webContents.getLastWebPreferences().nodeIntegration,
      isolation: win.webContents.getLastWebPreferences().contextIsolation, version: process.versions.node };
  });
  assert.equal(native.sandbox, true); assert.equal(native.node, false); assert.equal(native.isolation, true);
  await page.locator('button[title="设置"]').first().click();
  await page.getByRole("button", { name: "桌面应用", exact: true }).click();
  await page.waitForSelector(".desktop-port-input");
  await page.screenshot({ path: join(area, "desktop-settings.png") });
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  await page.evaluate(port => window.piDesktop.updateSettings({ externalControl: true, port }), port);
  const status = await page.evaluate(() => window.piDesktop.getStatus());
  assert.equal(status.externalUrl, `http://127.0.0.1:${port}`);
  const auth = `Basic ${Buffer.from(`pi:${password}`).toString("base64")}`;
  const publicApi = path => fetch(status.externalUrl + path, { headers: { Authorization: auth } });
  assert.equal((await publicApi("/api/sessions")).status, 200);
  assert.equal((await publicApi("/api/terminal")).status, 403);
  const localSettings = await page.evaluate(async () => (await fetch("/api/cache-miss-notices")).status);
  assert.equal(localSettings, 200);
  assert.equal((await publicApi("/api/cache-miss-notices")).status, 403);
  assert.equal((await publicApi("/api/models-config")).status, 403);
  const localRead = await page.evaluate(async () => (await fetch("/api/models-config")).status);
  assert.equal(localRead, 200);
  const privateSessions = await page.evaluate(async () => await (await fetch("/api/sessions")).json());
  assert.ok(JSON.stringify(privateSessions).includes(fixtureId));
  const publicSessions = await (await publicApi("/api/sessions")).json();
  // Background catalog enrichment can advance the revision between these two
  // sequential requests without changing the session rows or entrance identity.
  const { sessionListVersion: privateRevision, ...privateSnapshot } = privateSessions;
  const { sessionListVersion: publicRevision, ...publicSnapshot } = publicSessions;
  assert.deepEqual(publicSnapshot, privateSnapshot);
  assert.ok(Number.isSafeInteger(privateRevision) && Number.isSafeInteger(publicRevision) && publicRevision >= privateRevision);
  const remoteStatus = host => new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/api/sessions", headers: { host, authorization: auth } }, response => {
      response.resume(); response.once("end", () => resolve(response.statusCode));
    });
    request.on("error", reject); request.setTimeout(10_000, () => request.destroy(new Error("Remote request timed out")));
  });
  assert.equal(await remoteStatus("agent.example.test"), 200);
  assert.equal(await remoteStatus("unlisted.example.test"), 403);
  console.log("[e2e] closing the window with external control enabled");
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close(); });
  await waitForWindowVisibility(false);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  assert.equal((await publicApi("/api/sessions")).status, 200);
  // A second launch must focus the same host instead of starting another backend.
  console.log("[e2e] launching a second instance");
  await new Promise((resolve, reject) => {
    const second = spawn(executablePath, launchArgs, { env: environment, stdio: "ignore", windowsHide: true });
    const deadline = setTimeout(() => { second.kill(); reject(new Error("Second instance did not exit")); }, 15_000);
    second.once("error", reject); second.once("exit", () => { clearTimeout(deadline); resolve(); });
  });
  await waitForWindowVisibility(true);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  console.log("[e2e] second instance focused the existing host");
  assert.equal((await page.evaluate(() => window.piDesktop.getStatus())).externalUrl, status.externalUrl);
  await page.evaluate(() => window.piDesktop.updateSettings({ externalControl: false }));
  await assert.rejects(fetch(status.externalUrl));
  assert.equal((await page.evaluate(() => window.piDesktop.getStatus())).phase, "running");
  await page.screenshot({ path: join(area, "desktop-final.png") });
  const persisted = JSON.parse(await readFile(join(userData, "desktop-settings.json"), "utf8"));
  assert.equal(persisted.externalControl, false); assert.equal(persisted.port, port);
  // Opening optional panels must still work after moving them off the startup path.
  console.log("[e2e] closing settings and opening the fixture session");
  await page.locator(".settings-dialog-close").click();
  await page.goto(`${privateOrigin}/?session=${fixtureId}`);
  await page.getByText("Desktop shared-backend verification", { exact: true }).waitFor();
  const files = page.locator("#session-sidebar-panel-files");
  const fold = files.locator(".sidebar-files-section-toggle");
  await fold.waitFor();
  if (await fold.getAttribute("aria-expanded") !== "true") await fold.click();
  console.log("[e2e] opening the lazy file viewer");
  await files.getByText("desktop-lazy-viewer.txt", { exact: true }).click();
  await page.locator("#file-panel").getByText("Desktop lazy file viewer verification", { exact: true }).waitFor();
  console.log("[e2e] opening the terminal");
  const [terminalResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/api/terminal" && response.request().method() === "POST"),
    page.getByRole("button", { name: "打开工作区终端", exact: true }).click(),
  ]);
  const terminal = await terminalResponse.json();
  await page.locator(".terminal-panel:visible .is-ready").waitFor();
  for (const width of [1280, 850]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 840), width);
    await page.locator(".file-panel-expand-button").click();
    const restore = page.getByRole("button", { name: "还原文件面板宽度", exact: true });
    const restoreBox = await restore.boundingBox();
    const titleBox = await page.locator(".desktop-titlebar").boundingBox();
    assert.ok(restoreBox.y >= titleBox.y + titleBox.height - 1,
      `Expanded controls must stay below the titlebar (button ${restoreBox.y}, titlebar ${titleBox.y + titleBox.height})`);
    await page.screenshot({ path: join(area, `desktop-expanded-terminal-${width}.png`) });
    await restore.click();
    assert.equal(await page.locator(".file-panel-expand-button").getAttribute("aria-pressed"), "false");
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  const command = process.platform === "win32" ? 'cmd /v:on /c "set DESKTOP_LAZY_TOKEN=desktop-lazy-&echo !DESKTOP_LAZY_TOKEN!terminal-ok"' : "printf '%s%s\\n' desktop-lazy- terminal-ok";
  const inputStatus = await page.evaluate(async ({ id, command }) => (await fetch(`/api/terminal/${id}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "input", data: `${command}\r` }),
  })).status, { id: terminal.id, command });
  assert.equal(inputStatus, 200);
  await page.waitForFunction(() => [...document.querySelectorAll(".terminal-panel")].some(panel =>
    panel.getBoundingClientRect().width > 0 && panel.querySelector(".xterm-rows")?.textContent.includes("desktop-lazy-terminal-ok")), undefined, { polling: 100 });
  console.log(JSON.stringify({ packaged, passed: true, native, screenshot: join(area, "desktop-final.png") }));
} catch (error) {
  const page = (await app.windows())[0];
  if (page) await page.screenshot({ path: join(area, "failure.png") }).catch(() => {});
  throw error;
} finally {
  const child = app.process();
  await app.close();
  if (child.exitCode === null) {
    await Promise.race([
      new Promise(resolve => child.once("exit", resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Electron host did not exit after app.close()")), 15_000)),
    ]);
  }
  if (privateOrigin) {
    await assert.rejects(fetch(privateOrigin));
    console.log("Host exited and owned service listener stopped.");
  }
}
