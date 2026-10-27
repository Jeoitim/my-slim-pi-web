import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { get, Agent } from "node:http";
import assert from "node:assert/strict";

const area = await mkdtemp(resolve(".local/desktop-password-"));
const userData = join(area, "profile");
const agent = join(area, "agent");
const work = join(area, "work");
await Promise.all([mkdir(userData), mkdir(work), mkdir(join(agent, "extensions"), { recursive: true })]);
await writeFile(join(agent, "settings.json"), JSON.stringify({ extensions: ["./extensions/hold.ts"] }));
await writeFile(join(agent, "extensions/hold.ts"), `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export default function(pi: ExtensionAPI) {
  pi.registerCommand("hold", {description:"Test-only blocking dialog",handler:async(_args,ctx)=>{await ctx.ui.select("Password check",["Continue"]);}});
}`);
const environment = { ...process.env, PI_DESKTOP_TEST_USER_DATA: userData, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
for (const key of Object.keys(environment)) if (["PI_WEB_PASSWORD", "ELECTRON_RUN_AS_NODE", "PI_WEB_REMOTE", "PI_WEB_ALLOWED_HOSTS"].includes(key.toUpperCase())) delete environment[key];
const executablePath = process.env.PI_DESKTOP_E2E_EXECUTABLE || resolve("dist-desktop/win-unpacked/MySlimPiWeb.exe");
const first = randomBytes(24).toString("hex"), second = randomBytes(24).toString("hex"), inherited = randomBytes(24).toString("hex");
const credentialFile = join(userData, "desktop-web-password.bin");
const settingsFile = join(userData, "desktop-settings.json");
// Each restart reuses the public port with a different server. Use a fresh,
// fully consumed native HTTP connection rather than a persistent fetch pool.
const fetch = (url, options = {}) => new Promise((resolve, reject) => {
  const agent = new Agent({ keepAlive: true });
  const request = get(url, { headers: options.headers, agent }, response => {
    response.resume(); response.once("end", () => { agent.destroy(); resolve({ status: response.statusCode }); });
    response.once("error", failed);
  });
  function failed(error) { agent.destroy(); reject(new Error(`Test HTTP request failed: ${new URL(url).pathname}`, { cause: error })); }
  request.once("error", failed); request.setTimeout(10_000, () => request.destroy(new Error("Request timed out")));
});
const basic = password => ({ Authorization: `Basic ${Buffer.from(`pi:${password}`).toString("base64")}` });
let app, page;
async function launch(extra = {}) {
  app = await electron.launch({ executablePath, args: [], env: { ...environment, ...extra }, timeout: 120_000 });
  page = await app.firstWindow(); page.setDefaultTimeout(120_000);
  await page.waitForURL(url => url.protocol === "http:");
  await page.waitForLoadState("domcontentloaded");
}
async function close() {
  if (app) {
    // Test-owned profiles only: allow cleanup even after a deliberately failed login probe.
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); }).catch(() => {});
    await app.close(); app = null;
  }
}
async function login(password) {
  await page.waitForURL(url => url.protocol === "http:");
  await page.waitForLoadState("domcontentloaded");
  // Hydration must finish before typing so React owns the input value.
  if (new URL(page.url()).pathname === "/login") {
    await page.waitForFunction(() => {
      const input = document.querySelector('input[type="password"]');
      return input && Object.keys(input).some(key => key.startsWith("__reactProps$"));
    });
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in|log in|登录/i }).click();
    await page.waitForURL(url => url.pathname === "/");
  }
  await page.locator(".desktop-titlebar").waitFor();
}
async function settings() {
  await page.evaluate(() => localStorage.setItem("pi-locale", "zh-CN"));
  await page.reload();
  await page.locator('button[title="设置"]').first().click();
  await page.getByRole("button", { name: "桌面应用", exact: true }).click();
  await page.locator(".desktop-password-input").first().waitFor();
  await page.waitForFunction(() => !!document.querySelector(".desktop-settings .desktop-port-input")?.value);
}
async function fill(password) {
  await page.locator('.desktop-password-input').nth(0).fill(password);
  await page.locator('.desktop-password-input').nth(1).fill(password);
}
async function applyPassword(password) {
  const oldOrigin = new URL(page.url()).origin;
  await fill(password);
  await page.getByRole("button", { name: "保存密码并重启服务", exact: true }).click();
  await page.waitForURL(url => url.protocol === "http:" && url.origin !== oldOrigin);
  await login(password);
}
const status = () => page.evaluate(() => window.piDesktop.getStatus());
try {
  await launch(); await login(""); await settings();
  assert.equal((await status()).webPassword.source, "none");
  assert.equal((await status()).webPassword.available, true);
  assert.equal(await page.getByRole("switch", { name: "本地 Web 入口", exact: true }).isDisabled(), true);
  await fill("short");
  assert.equal(await page.getByRole("button", { name: "保存密码并重启服务", exact: true }).isDisabled(), true);
  await fill(first);
  await page.locator(".desktop-password-input").nth(1).fill(second);
  assert.equal(await page.getByRole("button", { name: "保存密码并重启服务", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "常规", exact: true }).click();
  await page.getByRole("button", { name: "桌面应用", exact: true }).click();
  assert.equal(await page.locator(".desktop-password-input").first().inputValue(), "");
  await page.screenshot({ path: join(area, "password-settings-empty.png") });
  await writeFile(join(area, "password-font-check.html"), await page.evaluate(() => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>.desktop-web-password{font-family:"Microsoft YaHei","Noto Sans SC",sans-serif}</style></head><body>${document.querySelector(".desktop-web-password").outerHTML}</body></html>`));
  await applyPassword(first); await settings();
  assert.equal((await status()).webPassword.source, "stored");
  assert.equal(await page.locator(".desktop-password-input").first().inputValue(), "");
  const ciphertext = await readFile(credentialFile);
  assert.equal(ciphertext.includes(Buffer.from(first)), false);
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  await page.evaluate(port => window.piDesktop.updateSettings({ port, externalControl: true }), port);
  const external = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(external + "/api/sessions")).status, 401);
  assert.equal((await fetch(external + "/api/sessions", { headers: basic(first) })).status, 200);
  for (const path of ["/api/models-config", "/api/terminal"]) assert.equal((await fetch(external + path, { headers: basic(first) })).status, 403);
  const cookie = await page.context().cookies();
  console.log("Saved with Windows encryption; Web authentication and restricted APIs passed.");
  await close(); await launch(); await login(first); await settings();
  assert.equal((await status()).webPassword.source, "stored");
  assert.equal((await status()).externalUrl, external);
  assert.equal((await fetch(external + "/api/sessions", { headers: basic(first) })).status, 200);
  // A slash-only extension waits for UI input without contacting a model provider.
  const session = await page.evaluate(async cwd => (await (await fetch("/api/agent/new", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd, type: "ensure_session" }) })).json()), work);
  assert.ok(session.sessionId, "The test session must start successfully");
  await page.evaluate(async id => {
    const stream = new EventSource(`/api/agent/${id}/events`);
    window.__passwordStream = stream;
    await new Promise((resolve, reject) => { stream.onopen = resolve; stream.onerror = () => reject(new Error("Test event stream failed")); });
    await fetch(`/api/agent/${id}/lease?holder=password-check`, { method: "POST" });
    window.__passwordLease = setInterval(() => { void fetch(`/api/agent/${id}/lease?holder=password-check`, { method: "POST" }); }, 5000);
  }, session.sessionId);
  console.log("Test event stream and session lease connected.");
  await page.evaluate(id => { void fetch(`/api/agent/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "prompt", message: "/hold" }) }).then(async response => { window.__passwordHoldResult = { status: response.status, data: await response.json() }; }); }, session.sessionId);
  await page.waitForFunction(async () => {
    if (window.__passwordHoldResult?.status >= 400) throw new Error(JSON.stringify(window.__passwordHoldResult));
    return (await (await fetch("/api/agent/running")).json()).awaitingInputSessionIds?.length > 0;
  });
  await app.evaluate(({ dialog }) => {
    globalThis.__passwordPrompts = [];
    globalThis.__passwordChoice = 1;
    dialog.showMessageBox = async (...args) => { globalThis.__passwordPrompts.push(args.at(-1)); return { response: globalThis.__passwordChoice }; };
  });
  const beforeOrigin = new URL(page.url()).origin;
  assert.equal(await page.evaluate(password => window.piDesktop.setWebPassword(password), second), false);
  assert.equal(new URL(page.url()).origin, beforeOrigin);
  assert.deepEqual(await readFile(credentialFile), ciphertext);
  assert.equal(await app.evaluate(() => globalThis.__passwordPrompts.length), 1);
  await app.evaluate(() => { globalThis.__passwordChoice = 0; });
  // The extension dialog may cover Settings; invoke the same restricted preload action.
  await page.evaluate(password => { void window.piDesktop.setWebPassword(password); }, second);
  await page.waitForURL(url => url.protocol === "http:" && url.origin !== beforeOrigin);
  await login(second); await settings();
  assert.equal((await fetch(external + "/api/sessions", { headers: basic(second) })).status, 200);
  assert.equal((await fetch(external + "/api/sessions", { headers: basic(first) })).status, 401);
  assert.equal((await fetch(external + "/api/sessions", { headers: { Cookie: cookie.map(entry => `${entry.name}=${entry.value}`).join("; ") } })).status, 401);
  assert.equal((await page.evaluate(async () => (await (await fetch("/api/agent/running")).json()).runningSessionIds)).length, 0);
  await page.screenshot({ path: join(area, "password-settings-saved.png") });
  console.log("Saved password survived relaunch; cancellation preserved active work; password rotation invalidated old credentials.");
  // Explicit environment configuration wins without decrypting or rewriting the stored secret.
  const beforeOverride = await readFile(credentialFile);
  await close(); await launch({ PI_WEB_PASSWORD: inherited }); await login(inherited); await settings();
  assert.equal((await status()).webPassword.source, "environment");
  assert.equal(await page.locator(".desktop-password-input").first().isDisabled(), true);
  assert.deepEqual(await readFile(credentialFile), beforeOverride);
  assert.equal((await fetch(external + "/api/sessions", { headers: basic(inherited) })).status, 200);
  assert.equal((await fetch(external + "/api/sessions", { headers: basic(second) })).status, 401);
  await close(); await launch(); await login(second); await settings();
  const previousOrigin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "删除密码并重启服务", exact: true }).click();
  await page.waitForURL(url => url.protocol === "http:" && url.origin !== previousOrigin);
  await login(""); await settings();
  assert.equal((await status()).webPassword.source, "none");
  assert.equal((await status()).externalUrl, null);
  assert.deepEqual(JSON.parse(await readFile(settingsFile, "utf8")), { externalControl: false, port });
  await assert.rejects(readFile(credentialFile), { code: "ENOENT" });
  await assert.rejects(fetch(external));
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  const logs = await readFile(join(userData, "startup-history.json"), "utf8");
  for (const password of [first, second, inherited]) {
    assert.equal(storage.includes(password), false); assert.equal(logs.includes(password), false);
  }
  await close(); await launch(); await login(""); await settings();
  assert.equal((await status()).passwordConfigured, false);
  // A corrupt encrypted file never prevents private desktop startup or opens Web access.
  await close(); await writeFile(credentialFile, "invalid encrypted credential");
  await writeFile(settingsFile, JSON.stringify({ externalControl: true, port }));
  await launch(); await login(""); await settings();
  assert.equal((await status()).webPassword.error, "decrypt");
  assert.equal((await status()).externalUrl, null);
  await assert.rejects(fetch(external));
  const corruptOrigin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "删除密码并重启服务", exact: true }).click();
  await page.waitForURL(url => url.protocol === "http:" && url.origin !== corruptOrigin);
  await login("");
  console.log("Environment override, deletion, relaunch, corrupt-file recovery and secret exclusion passed.");
  console.log(`Password UI screenshots and font audit: ${area}`);
} catch (error) {
  console.log("Password failure status:", await status().catch(() => null));
  await page?.screenshot({ path: join(area, "failure.png") }).catch(() => {});
  throw error;
} finally { await close(); }
