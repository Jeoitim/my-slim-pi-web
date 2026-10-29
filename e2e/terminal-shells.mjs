// Real keyboard input, isolated production backend, and installed shell profiles.
import assert from "node:assert/strict";
import { fork, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { detectTerminalShells } from "../lib/terminal-shells.ts";

const root = resolve(".");
const desktop = process.argv.includes("--desktop");
const area = join(root, ".local", `terminal-shells-${randomUUID()}`);
const agent = join(area, "agent");
const user = join(area, "user");
const artifacts = join(root, "test-results", "terminal-shells");
await Promise.all([mkdir(join(agent, "sessions/fixture"), { recursive: true }), mkdir(user, { recursive: true }), mkdir(artifacts, { recursive: true })]);
await writeFile(join(area, "terminal-workspace-check.txt"), "WORKSPACE_DIRECTORY_OK\n");
const sessionId = randomUUID();
const timestamp = "2026-10-30T00:00:00.000Z";
await writeFile(join(agent, `sessions/fixture/${timestamp.replaceAll(":", "-")}_${sessionId}.jsonl`), [
  { type: "session", version: 3, id: sessionId, timestamp, cwd: area },
  { type: "message", id: "user", parentId: null, timestamp, message: { role: "user", content: "Terminal keyboard fixture", timestamp: Date.now() } },
].map(value => JSON.stringify(value)).join("\n") + "\n");
const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", NEXT_TELEMETRY_DISABLED: "1", HOME: user, USERPROFILE: user,
  APPDATA: join(user, "AppData/Roaming"), LOCALAPPDATA: join(user, "AppData/Local"),
  HISTFILE: process.platform === "win32" ? "NUL" : "/dev/null", PI_DESKTOP_TEST_USER_DATA: join(area, "desktop-profile") };
// Keep per-user installed shell executables discoverable while isolating their
// HOME, profiles and history from the real user.
const parentPath = process.env.PATH ?? "";
for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
env.PATH = [...detectTerminalShells().shells.map(shell => dirname(shell.path)), parentPath].join(process.platform === "win32" ? ";" : ":");
for (const key of ["ELECTRON_RUN_AS_NODE", "PI_WEB_PASSWORD", "PI_WEB_REMOTE", "PI_WEB_ALLOWED_HOSTS"]) delete env[key];
const token = randomBytes(32).toString("hex");
let log = "", browser, base, context;
const child = desktop
  ? spawn(process.env.PI_DESKTOP_E2E_EXECUTABLE || join(root, "dist-desktop/win-unpacked/MySlimPiWeb.exe"), ["--remote-debugging-port=0"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
  : fork(join(root, "electron/server/index.cjs"), [], { env, cwd: join(root, ".desktop/server"), windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
child.stderr.on("data", data => { log += data; });
child.stdout.on("data", data => { log += data; });
const exited = new Promise(resolve => child.once("exit", code => resolve(code)));
const deadline = async (promise, ms, label) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })]); }
  finally { clearTimeout(timer); }
};
try {
  if (desktop) {
    const endpoint = await deadline(new Promise(resolve => child.stderr.on("data", () => {
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(log);
      if (match) resolve(match[1]);
    })), 60_000, "Desktop did not expose its test browser connection");
    browser = await chromium.connectOverCDP(endpoint);
    context = browser.contexts()[0];
  } else {
    const ready = new Promise((resolve, reject) => child.on("message", message => {
      if (message.type === "ready") resolve(message.internalUrl);
      if (message.type === "failed") reject(new Error(message.error));
    }));
    child.send({ type: "start", root: join(root, ".desktop/server"), dev: false, token });
    base = await deadline(ready, 60_000, "Production backend did not become ready");
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 1280, height: 840 }, locale: "en-US", extraHTTPHeaders: { "x-pi-desktop-token": token } });
  }
  await context.addInitScript(() => {
    localStorage.setItem("pi-locale", "en");
    // No external network is available, but the same-machine backend works.
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (desktop) {
    await page.waitForURL(url => url.protocol === "http:", { timeout: 60_000 });
    base = new URL(page.url()).origin;
  }
  await page.goto(`${base}/?session=${sessionId}`);
  await page.locator('[data-entry-id="user"]').getByText("Terminal keyboard fixture", { exact: true }).waitFor();
  if (desktop) assert.equal(await page.evaluate(() => Boolean(window.piDesktop)), true);
  const catalogue = await page.evaluate(async () => (await fetch("/api/terminal/shells")).json());
  assert.ok(catalogue.shells.length > 0);
  assert.ok(catalogue.shells.every(shell => !Object.hasOwn(shell, "args")));
  const invalid = await page.evaluate(async cwd => (await fetch("/api/terminal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd, shellId: "../cmd.exe" }) })).status, area);
  assert.equal(invalid, 400);
  await page.getByRole("button", { name: "Open workspace terminal", exact: true }).click();
  const panel = () => page.locator(".terminal-panel:visible");
  const ready = () => panel().locator(".is-ready").waitFor();
  const tabs = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("pi-web:terminal-tabs")));
  const row = marker => page.waitForFunction(marker => [...document.querySelectorAll(".terminal-panel")].some(panel => panel.getBoundingClientRect().width > 0
    && [...panel.querySelectorAll(".xterm-rows > div")].some(row => row.textContent.trim() === marker)), marker);
  const type = async text => { await page.keyboard.type(text); await page.keyboard.press("Enter"); };
  const command = (shell, marker) => ["pwsh", "powershell"].includes(shell.id) ? `Write-Output '${marker}'` : shell.id === "cmd" ? `echo ${marker}` : `printf '%s\\n' '${marker}'`;
  const first = catalogue.shells.find(shell => shell.id === catalogue.defaultShellId);
  await ready();
  await type(command(first, "INITIAL_KEYBOARD_OK"));
  await row("INITIAL_KEYBOARD_OK");
  await page.getByRole("combobox", { name: "Terminal shell", exact: true }).focus();
  // Click only the surrounding padding, outside xterm's own mouse target.
  await page.locator(".terminal-xterm:visible").click({ position: { x: 30, y: 2 } });
  await type(command(first, "PADDING_KEYBOARD_OK"));
  await row("PADDING_KEYBOARD_OK");
  const firstId = (await tabs()).activeId;
  const retain = ["pwsh", "powershell"].includes(first.id) ? "$env:TERMINAL_RETAINED='alive'" : first.id === "cmd" ? "set TERMINAL_RETAINED=alive" : "export TERMINAL_RETAINED=alive";
  await type(retain);
  for (const shell of catalogue.shells) {
    await page.getByRole("combobox", { name: "Terminal shell", exact: true }).selectOption(shell.id);
    await ready();
    await page.waitForFunction(shellId => JSON.parse(sessionStorage.getItem("pi-web:terminal-tabs")).tabs.some(tab => tab.id === JSON.parse(sessionStorage.getItem("pi-web:terminal-tabs")).activeId && tab.shellId === shellId), shell.id);
    await page.locator(".terminal-xterm:visible").click({ position: { x: 20, y: 20 } });
    await type(command(shell, `PROFILE_${shell.id.replaceAll("-", "_")}_OK`));
    await row(`PROFILE_${shell.id.replaceAll("-", "_")}_OK`);
    await type(["pwsh", "powershell"].includes(shell.id) ? "Get-Content terminal-workspace-check.txt" : shell.id === "cmd" ? "type terminal-workspace-check.txt" : "cat terminal-workspace-check.txt");
    await row("WORKSPACE_DIRECTORY_OK");
    console.log(`PASS ${desktop ? "desktop" : "web"}: ${shell.name} real keyboard input`);
  }
  assert.equal((await tabs()).tabs.length, catalogue.shells.length);
  await page.reload();
  await ready();
  assert.equal((await tabs()).tabs.length, catalogue.shells.length);
  await page.getByRole("combobox", { name: "Terminal shell", exact: true }).selectOption(first.id);
  await ready();
  assert.equal((await tabs()).activeId, firstId, "switching back must reuse the original shell");
  await page.locator(".terminal-xterm:visible").click({ position: { x: 30, y: 2 } });
  const retained = ["pwsh", "powershell"].includes(first.id) ? "Write-Output ('RETAINED_' + $env:TERMINAL_RETAINED)" : first.id === "cmd" ? "echo RETAINED_%TERMINAL_RETAINED%" : "printf 'RETAINED_%s\\n' \"$TERMINAL_RETAINED\"";
  await type(retained);
  await row("RETAINED_alive");
  await page.screenshot({ path: join(artifacts, desktop ? "desktop.png" : "web.png") });
  // Simulate connection loss, then verify real input after explicit reconnect.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await panel().locator(".is-connecting").waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await ready();
  await type(command(first, "RECONNECTED_KEYBOARD_OK"));
  await row("RECONNECTED_KEYBOARD_OK");
  if (["pwsh", "powershell"].includes(first.id)) {
    // Real IME composition events; insertText alone is intentionally ignored
    // by xterm in screen-reader mode and is not a complete IME sequence.
    await page.keyboard.type("Write-Output '");
    const ime = await context.newCDPSession(page);
    await ime.send("Input.imeSetComposition", { text: "中文输入验证", selectionStart: 6, selectionEnd: 6 });
    await ime.send("Input.insertText", { text: "中文输入验证" });
    await ime.detach();
    await page.keyboard.type("'");
    await page.keyboard.press("Enter");
    await row("中文输入验证");
  }
  const restartShell = catalogue.shells.find(shell => shell.id !== first.id) ?? first;
  await page.getByRole("combobox", { name: "Terminal shell", exact: true }).selectOption(restartShell.id);
  await ready();
  const beforeRestart = (await tabs()).activeId;
  await page.getByRole("button", { name: "Restart terminal", exact: true }).click();
  await page.waitForFunction(oldId => JSON.parse(sessionStorage.getItem("pi-web:terminal-tabs")).activeId !== oldId, beforeRestart);
  await ready();
  const afterRestart = await tabs();
  assert.equal(afterRestart.tabs.find(tab => tab.id === afterRestart.activeId).shellId, restartShell.id);
  assert.equal(await page.evaluate(async id => (await fetch(`/api/terminal/${id}`)).status, beforeRestart), 404);
  await type(command(restartShell, "RESTARTED_KEYBOARD_OK"));
  await row("RESTARTED_KEYBOARD_OK");
  console.log(`PASS ${desktop ? "desktop" : "web"}: refresh retention, reconnect, IME and restart with ${restartShell.name}`);
  if (!desktop) {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(artifacts, "mobile.png") });
    await page.setViewportSize({ width: 1280, height: 840 });
  }
  // Clean up test-owned shells naturally before checking host exit.
  for (const shell of catalogue.shells) {
    await page.getByRole("combobox", { name: "Terminal shell", exact: true }).selectOption(shell.id);
    await ready();
    await page.locator(".terminal-xterm:visible").click({ position: { x: 30, y: 2 } });
    await type("exit");
    await panel().locator(".terminal-panel-exit").waitFor();
    const id = (await tabs()).activeId;
    assert.equal(await page.evaluate(async id => (await fetch(`/api/terminal/${id}`, { method: "DELETE" })).status, id), 200);
  }
  assert.deepEqual(errors, []);
  if (desktop) {
    // Keep the actual Quit path, disconnecting test CDP before it executes.
    await page.evaluate(() => { setTimeout(() => { void window.piDesktop.quit(); }, 500); });
    await browser.close(); browser = undefined;
    assert.equal(await deadline(exited, 30_000, "Desktop did not quit"), 0);
    await assert.rejects(fetch(base, { signal: AbortSignal.timeout(3000) }));
  }
  console.log(JSON.stringify({ desktop, passed: true, profiles: catalogue.shells.map(shell => shell.name), offlineLoopback: true, paddingFocus: true, retainedAfterReload: true, reconnect: true, restartPreservesShell: true }));
} catch (error) {
  await context?.pages()[0]?.screenshot({ path: join(artifacts, desktop ? "desktop-failure.png" : "web-failure.png") }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (child.connected) child.send({ type: "stop" });
  if (child.exitCode === null) await deadline(exited, 12_000, "Test process did not stop").catch(() => child.kill());
  await writeFile(join(artifacts, desktop ? "desktop.log" : "backend.log"), log);
}
