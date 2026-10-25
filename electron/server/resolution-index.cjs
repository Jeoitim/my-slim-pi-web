const { registerHooks } = require("node:module");
const { readFileSync, writeFileSync } = require("node:fs");
const { join, isAbsolute, sep } = require("node:path");
const { pathToFileURL } = require("node:url");
const { gzipSync, gunzipSync } = require("node:zlib");

const INDEX_FILE = ".resolution-index.json";
const SOURCE_FILE = ".startup-sources.json.gz";

function startResolutionIndex(root, { dev = false, record = false } = {}) {
  const stats = { state: "disabled", hits: 0, misses: 0, entries: 0 };
  const sources = new Map();
  const sourceStats = { state: "disabled", hits: 0, entries: 0 };
  const inactive = { stats: () => ({ ...stats, sources: { ...sourceStats } }), save() {} };
  if (dev) return inactive;
  const useIndex = record || process.env.PI_DESKTOP_DISABLE_RESOLUTION_INDEX !== "1";
  const useSources = record || process.env.PI_DESKTOP_DISABLE_SOURCE_PACK !== "1";
  if (!useIndex && !useSources) return inactive;
  const base = pathToFileURL(root.endsWith(sep) ? root : root + sep).href;
  const portable = url => {
    if (typeof url !== "string" || !url.startsWith(base)) return null;
    const relative = url.slice(base.length);
    if (relative === "package.json") return relative;
    if (!relative.startsWith("node_modules/") && !relative.startsWith(".desktop/next/")) return null;
    if (relative.includes("?") || relative.includes("#")) return null;
    try {
      if (decodeURIComponent(relative).split(/[\\/]/).some(part => part === ".." || part === "." || part.includes("\0"))) return null;
      if (new URL(relative, base).href !== url) return null;
    } catch { return null; }
    return relative;
  };
  const expand = relative => {
    if (typeof relative !== "string") return null;
    const url = base + relative;
    return portable(url) === relative ? url : null;
  };
  const keyFor = (specifier, context) => {
    const parent = portable(context.parentURL);
    if (!parent || Object.keys(context.importAttributes ?? {}).length || specifier.startsWith("node:")) return null;
    let request = ["request", specifier];
    if (specifier.startsWith("file:")) {
      const relative = portable(specifier);
      if (!relative) return null;
      request = ["url", relative];
    } else if (isAbsolute(specifier)) {
      const relative = portable(pathToFileURL(specifier).href);
      if (!relative) return null;
      request = ["path", relative];
    }
    return JSON.stringify([parent, request, [...context.conditions].sort()]);
  };
  let identity;
  let entries = new Map();
  try {
    identity = { schema: 1, node: process.versions.node, platform: process.platform, arch: process.arch,
      version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
      buildId: readFileSync(join(root, ".desktop/next/BUILD_ID"), "utf8").trim() };
    if (!record && useIndex) {
      const data = JSON.parse(readFileSync(join(root, INDEX_FILE), "utf8"));
      if (JSON.stringify(data.identity) !== JSON.stringify(identity) || !Array.isArray(data.entries)) throw new Error("Stale resolution index");
      for (const entry of data.entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !expand(entry[1])) throw new Error("Invalid resolution index");
        const [parent, request, conditions] = JSON.parse(entry[0]);
        if (!expand(parent) || !Array.isArray(request) || request.length !== 2 || !["request", "url", "path"].includes(request[0])
          || typeof request[1] !== "string" || !Array.isArray(conditions) || !conditions.every(value => typeof value === "string")) throw new Error("Invalid resolution key");
        if (request[0] !== "request" && !expand(request[1])) throw new Error("Invalid resolution request");
        entries.set(entry[0], entry[1]);
      }
    }
  } catch {
    stats.state = "unavailable";
    return inactive;
  }
  stats.state = record ? "recording" : useIndex ? "active" : "disabled";
  stats.entries = entries.size;
  if (record) sourceStats.state = "recording";
  else if (useSources) {
    try {
      const data = JSON.parse(gunzipSync(readFileSync(join(root, SOURCE_FILE)), { maxOutputLength: 64 * 1024 * 1024 }).toString("utf8"));
      if (JSON.stringify(data.identity) !== JSON.stringify(identity) || !Array.isArray(data.modules)) throw new Error("Stale source pack");
      for (const entry of data.modules) {
        if (!Array.isArray(entry) || entry.length !== 3 || !expand(entry[0]) || !["module", "commonjs"].includes(entry[1]) || typeof entry[2] !== "string") throw new Error("Invalid source pack");
        sources.set(entry[0], { format: entry[1], source: entry[2] });
      }
      sourceStats.state = "active";
      sourceStats.entries = sources.size;
    } catch { sources.clear(); sourceStats.state = "unavailable"; }
  }
  const hook = registerHooks({ resolve(specifier, context, nextResolve) {
    if (!useIndex) return nextResolve(specifier, context);
    const key = keyFor(specifier, context);
    if (key && !record) {
      const target = entries.get(key);
      if (target) { stats.hits++; return { url: expand(target), shortCircuit: true }; }
    }
    const result = nextResolve(specifier, context);
    if (key) {
      stats.misses++;
      if (record) {
        const target = portable(result.url);
        if (target) { entries.set(key, target); stats.entries = entries.size; }
      }
    }
    return result;
  }, load(url, context, nextLoad) {
    const relative = portable(url);
    const eligible = relative && Object.keys(context.importAttributes ?? {}).length === 0;
    if (eligible && !record && sources.has(relative)) {
      sourceStats.hits++;
      return { ...sources.get(relative), shortCircuit: true };
    }
    const result = nextLoad(url, context);
    if (record && eligible && ["module", "commonjs"].includes(result.format) && result.source != null) {
      sources.set(relative, { format: result.format, source: typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8") });
      sourceStats.entries = sources.size;
    }
    return result;
  } });
  return {
    stats: () => ({ ...stats, sources: { ...sourceStats } }),
    save() {
      if (record) {
        writeFileSync(join(root, INDEX_FILE), JSON.stringify({ identity, entries: [...entries] }));
        writeFileSync(join(root, SOURCE_FILE), gzipSync(JSON.stringify({ identity, modules: [...sources].map(([path, value]) => [path, value.format, value.source]) }), { level: 6 }));
      }
    },
    close() { hook.deregister(); },
  };
}

module.exports = { startResolutionIndex, INDEX_FILE, SOURCE_FILE };
