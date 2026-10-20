import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const area = await mkdtemp(resolve(".local/startup-failure-"));
await mkdir(join(area, "agent"));
const require = createRequire(import.meta.url);
const environment = { ...process.env, PI_DESKTOP_TEST_USER_DATA: join(area, "userData"),
  PI_CODING_AGENT_DIR: join(area, "agent"), PI_DESKTOP_NODE: join(area, "missing-node.exe") };
delete environment.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: require("electron"),
  args: [resolve("electron/main/index.cjs"), "--desktop-dev"], env: environment });
try {
  const page = await app.firstWindow();
  await page.waitForURL(url => url.protocol === "file:" && url.pathname.endsWith("/error.html"));
  await page.locator("#retry").waitFor({ state: "visible" });
  await app.evaluate(({ BrowserWindow }) => new Promise(resolve => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) resolve();
    else window.once("show", resolve);
  }));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  await Promise.all([page.waitForEvent("framenavigated"), page.locator("#retry").click()]);
  await page.locator("#retry").waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).protocol, "file:");
  console.log("Real startup failure shows the visible Retry page; retry remains functional.");
} finally { await app.close(); }
