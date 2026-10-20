import { _electron as electron } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const area = resolve(".local/桌面 崩溃恢复 验证");
await mkdir(join(area, "agent"), { recursive: true });
await mkdir(join(area, "userData"), { recursive: true });
const environment = { ...process.env, PI_DESKTOP_TEST_USER_DATA: join(area, "userData"), PI_CODING_AGENT_DIR: join(area, "agent") };
delete environment.PI_WEB_PASSWORD;
delete environment.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.PI_DESKTOP_E2E_EXECUTABLE || resolve("dist-desktop/win-unpacked/MySlimPiWeb.exe");
const launch = () => electron.launch({ executablePath, env: environment, args: [], timeout: 120_000 });
async function ready(app) {
  const page = await app.firstWindow();
  await page.waitForURL(url => url.protocol === "http:", { timeout: 120_000 });
  await page.waitForLoadState("domcontentloaded");
  return new URL(page.url()).origin;
}
async function closed(origin) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { await fetch(origin, { signal: AbortSignal.timeout(500) }); }
    catch { return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail("Owned backend listener survived the host exit");
}
const first = await launch();
const oldOrigin = await ready(first);
const mainPid = await first.evaluate(() => process.pid);
process.kill(mainPid, "SIGKILL");
await closed(oldOrigin);
await first.close().catch(() => {});
const recovered = await launch();
try {
  const newOrigin = await ready(recovered);
  assert.notEqual(newOrigin, oldOrigin);
  assert.equal((await fetch(newOrigin, { signal: AbortSignal.timeout(5000) })).status, 403);
  await recovered.close();
  await closed(newOrigin);
  console.log("Packaged host forced exit, backend cleanup, single-instance recovery and normal quit passed.");
} finally { await recovered.close().catch(() => {}); }
