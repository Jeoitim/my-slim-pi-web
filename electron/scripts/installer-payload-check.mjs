import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";

// Extract NSIS application payloads without executing either installer. This
// measures decompression/file creation, not registry/shortcuts/upgrade overhead.
const installers = process.argv.slice(2);
if (installers.length !== 2) throw new Error("Usage: node electron/scripts/installer-payload-check.mjs <old.exe> <new.exe> (requires 7z on PATH)");
for (const installer of installers) if (!(await stat(resolve(installer))).isFile()) throw new Error("Installer must be a regular file");
const area = resolve(`.local/installer-payload-${randomUUID()}`);
await mkdir(area, { recursive: true });
const samples = [];
async function extract(args) {
  await new Promise((accept, reject) => {
    const child = spawn(process.env.PI_DESKTOP_7ZIP || "7z", args, { shell: false, windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? accept() : reject(new Error(`7z extraction failed (${code})`)));
  });
}
async function inventory(root) {
  const result = { files: 0, bytes: 0 };
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await inventory(path);
      result.files += nested.files; result.bytes += nested.bytes;
    } else if (entry.isFile()) {
      result.files++; result.bytes += (await stat(path)).size;
    }
  }
  return result;
}
for (const [index, source] of installers.entries()) {
  const installer = resolve(source);
  const root = join(area, index === 0 ? "before" : "after");
  await mkdir(root);
  await extract(["e", installer, "-y", `-o${root}`, "$PLUGINSDIR/app-64.7z"]);
  const began = performance.now();
  await extract(["x", join(root, "app-64.7z"), "-y", `-o${join(root, "app")}`]);
  const extractMs = Math.round(performance.now() - began);
  const sample = { installer, installerBytes: (await stat(installer)).size, extractMs, ...await inventory(join(root, "app")) };
  samples.push(sample);
  console.log(JSON.stringify(sample));
}
const report = join(area, "report.json");
await writeFile(report, JSON.stringify({ samples, scope: "Sequential NSIS payload extraction; excludes installer UI, upgrade, registry and shortcuts. OS file caches were not flushed." }, null, 2));
console.log(`Report: ${report}`);
