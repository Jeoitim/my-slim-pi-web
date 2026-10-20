import { realpath, access } from "node:fs/promises";
import { resolve, sep, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

/** electron-builder 26.15.3 can finish extraction but fail its final Windows directory rename. */
export async function prepareWindowsTools(cache) {
  const tools = require("app-builder-lib/out/toolsets/windows.js");
  async function prepare(action, variable, sentinel) {
    if (process.env[variable]) return;
    try { await action(); }
    catch (error) {
      if (error.code !== "EPERM" || error.syscall !== "rename" || !error.path?.endsWith(".tmp")) throw error;
      const cachePath = await realpath(resolve(cache));
      const extracted = await realpath(error.path);
      if (!extracted.startsWith(cachePath + sep) || !error.dest?.startsWith(cachePath + sep)) throw error;
      // This error is AFTER builder's checksum validation and complete extraction.
      // Use its supported override; do not modify dependencies or forge a complete cache state.
      await access(join(extracted, sentinel));
      process.env[variable] = extracted;
      console.log(`Using verified extracted toolset through ${variable} (Windows cache rename fallback).`);
    }
  }
  await prepare(() => tools.getNsisElevatePath(), "ELECTRON_BUILDER_NSIS_DIR", "elevate.exe");
  await prepare(() => tools.getNsisPluginsPath(), "ELECTRON_BUILDER_NSIS_RESOURCES_DIR", "plugins");
}
