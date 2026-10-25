import { readdir, stat, unlink, realpath, rm } from "node:fs/promises";
import { join, sep } from "node:path";

// Only generated deployment dependencies: retain executable TS extensions,
// package metadata, templates, licenses and native helpers.
export async function pruneDependencyMetadata(directory, { dryRun = false } = {}) {
  const result = { files: 0, bytes: 0 };
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /(?:\.d\.(?:ts|mts|cts)|\.(?:js|mjs|cjs|ts)\.map)$/.test(entry.name)) {
        result.bytes += (await stat(path)).size;
        result.files++;
        if (!dryRun) await unlink(path);
      }
    }
  }
  await visit(directory);
  return result;
}

// The bundled Node's platform/ABI is fixed. Retain unknown folders and all
// runtime assets except the explicitly known prebuilds for other targets.
export async function pruneForeignPtyPrebuilds(directory, platform = process.platform, arch = process.arch) {
  const root = await realpath(directory);
  const folder = join(root, "node-pty/prebuilds");
  const known = new Set(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"]);
  const result = { files: 0, bytes: 0 };
  let entries;
  try { entries = await readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return result; throw error; }
  async function count(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await count(child);
      else if (entry.isFile()) { result.files++; result.bytes += (await stat(child)).size; }
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !known.has(entry.name) || entry.name === `${platform}-${arch}`) continue;
    const path = await realpath(join(folder, entry.name));
    if (!path.startsWith(root + sep)) throw new Error("Native prebuild staging escaped the dependency directory");
    await count(path);
    await rm(path, { recursive: true, force: true });
  }
  return result;
}
