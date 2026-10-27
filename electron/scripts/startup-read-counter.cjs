// Build verification only; never included in the application or user runtime.
const fs = require("node:fs");
const { relative, resolve, sep } = require("node:path");
const { fileURLToPath } = require("node:url");
const root = resolve(process.env.PI_DESKTOP_COVERAGE_ROOT);
const original = fs.readFileSync;
let reads = 0;
let generatedManifestReads = 0;
const files = new Set();
fs.readFileSync = function (file, ...args) {
  if (typeof file === "string" || file instanceof URL) {
    const path = relative(root, resolve(file instanceof URL ? fileURLToPath(file) : file));
    if ((path.startsWith(`node_modules${sep}`) || path.startsWith(`.desktop${sep}next${sep}`)) && /\.(?:js|cjs|mjs)$/.test(path)) {
      // Next evaluates these generated data manifests with vm, outside Node's
      // module loader. Count them separately; they are not load-hook misses.
      if (path.startsWith(`.desktop${sep}next${sep}server${sep}`) && path.endsWith("_client-reference-manifest.js")) generatedManifestReads++;
      else { reads++; files.add(path.replaceAll(sep, "/")); }
    }
  }
  return original.call(this, file, ...args);
};
process.on("message", message => {
  if (message?.type === "startup-coverage") process.send({ type: "startup-coverage", reads, generatedManifestReads, files: [...files].slice(0, 20) });
});
