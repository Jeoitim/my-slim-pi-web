import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const helper = fileURLToPath(new URL("../server/compile-cache.cjs", import.meta.url));
async function snapshot(directory) {
  const files = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[path.slice(directory.length)] = (await readFile(path)).toString("hex");
    }
  }
  return files;
}

test("build-time portable cache survives installation relocation and invalidates changed source", async t => {
  const area = await mkdtemp(join(tmpdir(), "pi-cache-test-"));
  t.after(() => rm(area, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const build = join(area, "build");
  const installed = join(area, "installed");
  await mkdir(build);
  await writeFile(join(build, "dependency.cjs"), "module.exports = 'original';\n");
  await writeFile(join(build, "identity.mjs"), "export default import.meta.url;\n");
  const env = { ...process.env };
  for (const key of ["NODE_COMPILE_CACHE", "NODE_DISABLE_COMPILE_CACHE", "NODE_OPTIONS"]) delete env[key];
  const run = (root, dev = false) => {
    const code = `const {enableDesktopCompileCache}=require(${JSON.stringify(helper)}); console.log(enableDesktopCompileCache(${JSON.stringify(root)},${dev})); console.log(require(${JSON.stringify(join(root, "dependency.cjs"))})); import(${JSON.stringify(pathToFileURL(join(root, "identity.mjs")).href)}).then(module => console.log(module.default));`;
    const result = spawnSync(process.execPath, ["-e", code], { env, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split(/\r?\n/);
  };
  const identity = root => pathToFileURL(join(root, "identity.mjs")).href;
  assert.deepEqual(run(build, true), ["disabled", "original", identity(build)]);
  await assert.rejects(readdir(join(build, ".compile-cache")), { code: "ENOENT" });
  assert.deepEqual(run(build), ["enabled", "original", identity(build)]);
  const before = await snapshot(join(build, ".compile-cache"));
  assert.ok(Object.keys(before).length > 0);
  await cp(build, installed, { recursive: true });
  assert.deepEqual(run(installed), ["enabled", "original", identity(installed)]);
  assert.deepEqual(await snapshot(join(installed, ".compile-cache")), before, "Relocated startup must reuse the existing cache entries");
  await writeFile(join(installed, "dependency.cjs"), "module.exports = 'updated';\n");
  assert.deepEqual(run(installed), ["enabled", "updated", identity(installed)]);
});

test("an unusable compile cache does not break the backend", async t => {
  const root = await mkdtemp(join(tmpdir(), "pi-cache-unavailable-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, ".compile-cache"), "not a directory");
  const code = `console.log(require(${JSON.stringify(helper)}).enableDesktopCompileCache(${JSON.stringify(root)},false));`;
  const env = { ...process.env };
  delete env.NODE_DISABLE_COMPILE_CACHE;
  delete env.NODE_COMPILE_CACHE;
  delete env.NODE_OPTIONS;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "unavailable");
});
