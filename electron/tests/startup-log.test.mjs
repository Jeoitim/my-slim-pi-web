import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
const { appendStartupRecord } = createRequire(import.meta.url)("../main/startup-log.cjs");

test("startup history retains slow first launches, is bounded and excludes credentials and paths", async t => {
  const area = await mkdtemp(join(tmpdir(), "pi-startup-log-"));
  t.after(() => rm(area, { recursive: true, force: true }));
  for (let i = 0; i < 23; i++) {
    await appendStartupRecord(area, { version: "test", nodeVersion: "24", token: "SECRET_TOKEN", origin: "SECRET_PATH",
      startup: { backendReadyMs: i === 3 ? 71_000 : i, password: "SECRET_PASSWORD", resolutionIndex: { state: "active", hits: 12, sources: { state: "active" } } } });
  }
  const text = await readFile(join(area, "startup-history.json"), "utf8");
  const history = JSON.parse(text);
  assert.equal(history.length, 20);
  assert.equal(history[0].timings.backendReadyMs, 71_000);
  assert.equal(history.at(-1).timings.backendReadyMs, 22);
  assert.equal(text.includes("SECRET"), false);
  assert.equal(history[0].resolutionIndex.sourcePackActive, true);
});
