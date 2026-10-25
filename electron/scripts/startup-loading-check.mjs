import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const area = await mkdtemp(resolve(".local/startup-loading-"));
const agent = join(area, "agent");
const userData = join(area, "userData");
await Promise.all([mkdir(agent), mkdir(userData)]);
const environment = {
  ...process.env,
  PI_DESKTOP_TEST_USER_DATA: userData,
  PI_CODING_AGENT_DIR: agent,
  PI_DESKTOP_NODE: process.execPath,
};
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.PI_WEB_PASSWORD;

const app = await electron.launch({
  executablePath: process.env.PI_DESKTOP_E2E_EXECUTABLE || require("electron"),
  args: process.env.PI_DESKTOP_E2E_EXECUTABLE ? [] : [resolve("electron/main/index.cjs"), "--desktop-dev"],
  env: environment,
  timeout: 120_000,
});
let exited = false;
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(180_000);
  await page.waitForURL(url => url.protocol === "file:" && url.pathname.endsWith("/loading.html"));
  await page.locator(".mark").waitFor({ state: "visible" });
  await page.locator(".progress").waitFor({ state: "visible" });
  await page.screenshot({ path: resolve(".local/desktop-loading.png") });
  await app.evaluate(({ BrowserWindow }) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) resolve();
    else window.once("show", resolve);
  }));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  await page.waitForURL(url => url.protocol === "http:" && !url.pathname.includes("error.html"));
  assert.ok(await page.locator('button[title="Settings"], button[title="设置"]').count() > 0);
  const origin = new URL(page.url()).origin;
  const exit = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Idle window close did not exit the app")), 20_000);
    app.process().once("exit", code => { clearTimeout(timer); resolve(code); });
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await exit, 0, "closing an idle window with no external entrance should quit cleanly");
  exited = true;
  await assert.rejects(fetch(origin));
  console.log("Visible loading page appeared before the Web UI, handed off automatically, and an idle close exited cleanly.");
} finally {
  if (!exited) await app.close().catch(() => {});
}
