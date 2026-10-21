import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageNextResources } from "../scripts/stage-resources.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-desktop-resources-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await mkdir(join(root, ".desktop/next/standalone/.desktop/next/server/app"), { recursive: true });
  await mkdir(join(root, ".desktop/next/static"), { recursive: true });
  await mkdir(join(root, "public"));
  await writeFile(join(root, ".desktop/next/standalone/.desktop/next/BUILD_ID"), "current-build");
  await writeFile(join(root, ".desktop/next/standalone/.desktop/next/server/app/index.html"), "current HTML shell");
  await writeFile(join(root, ".desktop/next/static/current.js"), "current script");
  await writeFile(join(root, "public/offline.html"), "offline page");
  return root;
}

test("restaging a release removes runtime route caches and obsolete client scripts", async t => {
  const root = await fixture(t);
  await stageNextResources(root);
  const server = join(root, ".desktop/server");
  const cache = join(server, ".desktop/next/server/route-cache/APP_PAGE/route");
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, "index.html"), "previous HTML shell");
  await writeFile(join(server, ".desktop/next/static/previous.js"), "previous script");
  await stageNextResources(root);
  await assert.rejects(access(cache), { code: "ENOENT" });
  await assert.rejects(access(join(server, ".desktop/next/static/previous.js")), { code: "ENOENT" });
  assert.equal(await readFile(join(server, ".desktop/next/server/app/index.html"), "utf8"), "current HTML shell");
  assert.equal(await readFile(join(server, ".desktop/next/static/current.js"), "utf8"), "current script");
  assert.equal(await readFile(join(server, "public/offline.html"), "utf8"), "offline page");
});

test("an incomplete build preserves the previous staged release", async t => {
  const root = await fixture(t);
  await stageNextResources(root);
  await rm(join(root, ".desktop/next/standalone/.desktop/next/BUILD_ID"));
  await assert.rejects(stageNextResources(root), { code: "ENOENT" });
  assert.equal(await readFile(join(root, ".desktop/server/.desktop/next/BUILD_ID"), "utf8"), "current-build");
});
