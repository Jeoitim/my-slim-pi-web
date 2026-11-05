import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { chromium } from "playwright";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, interopDefault: true });
const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");
const { cacheSessionPath, invalidateSessionPathCache } = await jiti.import("../../../lib/session-reader.ts");
const { GET } = await jiti.import("./[id]/export/route.ts");

test("exports a real session with Pi 1.5's HTML helper", async (t) => {
  const area = await mkdtemp(join(tmpdir(), "pi-web-export-test-"));
  const manager = SessionManager.create(area, join(area, "sessions"));
  manager.appendMessage({ role: "user", content: "Export this message", timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "Export response" }], timestamp: Date.now() });
  const id = manager.getSessionId();
  cacheSessionPath(id, manager.getSessionFile());
  t.after(async () => { invalidateSessionPathCache(id); await rm(area, { recursive: true, force: true }); });
  const response = await GET(new Request(`http://localhost/api/sessions/${id}/export?inline=1`), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("content-disposition"), /^inline;/);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(await response.text());
  await page.getByText("Export this message", { exact: true }).waitFor();
  await page.getByText("Export response", { exact: true }).waitFor();
});
