import { _electron as electron } from "playwright";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const baseline = process.argv.includes("--baseline");
const reportName = process.env.PI_DESKTOP_STARTUP_REPORT || (baseline ? "before" : "after");
if (!/^[a-z0-9-]+$/.test(reportName)) throw new Error("Startup report name must contain only lowercase letters, numbers and hyphens");
const executablePath = process.env.PI_DESKTOP_E2E_EXECUTABLE || resolve("dist-desktop/win-unpacked/MySlimPiWeb.exe");
const samples = [];
for (let index = 0; index < 3; index++) {
  const area = resolve(`.local/startup-${reportName}-${randomUUID()}`);
  await mkdir(join(area, "agent"), { recursive: true });
  await mkdir(join(area, "userData"), { recursive: true });
  const environment = { ...process.env, PI_DESKTOP_TEST_USER_DATA: join(area, "userData"), PI_CODING_AGENT_DIR: join(area, "agent") };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.PI_WEB_PASSWORD;
  delete environment.PI_WEB_REMOTE;
  const began = performance.now();
  const app = await electron.launch({ executablePath, args: [], env: environment, timeout: 120_000 });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(120_000);
    const navigations = [page.url()];
    const requests = [];
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    page.on("request", request => requests.push(request.url()));
    await page.waitForURL(url => url.protocol === "http:");
    const navigationMs = Math.round(performance.now() - began);
    await page.waitForFunction(() => {
      const field = document.querySelector('button[title="Settings"], button[title="设置"]');
      return field && Object.keys(field).some(key => key.startsWith("__reactProps$"));
    });
    const interactiveMs = Math.round(performance.now() - began);
    const status = await page.evaluate(() => window.piDesktop.getStatus());
    const retryShown = navigations.some(url => url.includes("error.html"));
    if (!baseline) {
      assert.equal(retryShown, false, "Healthy startup must never navigate to the failure page");
      assert.equal(requests.some(url => url.includes("/api/app-update")), false, "Desktop startup must not check upstream updates");
      assert.equal(await page.locator(".desktop-titlebar-actions").count(), 0);
      assert.equal(await page.locator(".desktop-titlebar svg").count(), 0);
    }
    const scriptBytes = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter(entry => entry.initiatorType === "script").reduce((bytes, entry) => bytes + entry.decodedBodySize, 0));
    if (index === 2) await page.screenshot({ path: resolve(`.local/desktop-startup-${reportName}.png`) });
    samples.push({ navigationMs, interactiveMs, retryShown, version: status.version, scriptBytes, startup: status.startup ?? null });
    console.log(JSON.stringify(samples.at(-1)));
  } catch (error) {
    const page = (await app.windows())[0];
    if (page) {
      await page.screenshot({ path: join(area, "failure.png") }).catch(() => {});
      console.log(await page.locator("body").innerText());
    }
    throw error;
  } finally { await app.close(); }
}
const median = [...samples].sort((a, b) => a.interactiveMs - b.interactiveMs)[1];
const report = { baseline, executablePath, samples, medianInteractiveMs: median.interactiveMs };
await writeFile(resolve(`.local/desktop-startup-${reportName}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ medianInteractiveMs: median.interactiveMs }));
