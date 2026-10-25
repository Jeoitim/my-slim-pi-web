import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneDependencyMetadata, pruneForeignPtyPrebuilds } from "../scripts/prune-resources.mjs";

test("deployment pruning keeps executable TypeScript and dynamic package resources", async t => {
  const root = await mkdtemp(join(tmpdir(), "pi-prune-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = join(root, "package");
  await mkdir(pkg);
  const removed = ["index.d.ts", "index.d.mts", "index.d.cts", "index.js.map", "index.mjs.map"];
  const kept = ["extension.ts", "index.js", "package.json", "template.md", "LICENSE", "pty.node", "data.map"];
  for (const name of [...removed, ...kept]) await writeFile(join(pkg, name), "test");
  assert.deepEqual(await pruneDependencyMetadata(root, { dryRun: true }), { files: 5, bytes: 20 });
  for (const name of removed) await access(join(pkg, name));
  assert.deepEqual(await pruneDependencyMetadata(root), { files: 5, bytes: 20 });
  for (const name of removed) await assert.rejects(access(join(pkg, name)), { code: "ENOENT" });
  for (const name of kept) await access(join(pkg, name));
});

test("native pruning retains the bundled Node target and unknown resource folders", async t => {
  const root = await mkdtemp(join(tmpdir(), "pi-native-prune-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["win32-x64", "win32-arm64", "linux-x64", "custom-assets"]) {
    await mkdir(join(root, "node-pty/prebuilds", name), { recursive: true });
    await writeFile(join(root, "node-pty/prebuilds", name, "native.node"), "test");
  }
  assert.deepEqual(await pruneForeignPtyPrebuilds(root, "win32", "x64"), { files: 2, bytes: 8 });
  for (const name of ["win32-x64", "custom-assets"]) await access(join(root, "node-pty/prebuilds", name, "native.node"));
  for (const name of ["win32-arm64", "linux-x64"]) await assert.rejects(access(join(root, "node-pty/prebuilds", name)), { code: "ENOENT" });
});
