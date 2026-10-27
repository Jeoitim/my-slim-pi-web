const { readFile, writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const numericFields = ["runtimeReadyMs", "startupAssetsMs", "loadNextMs", "prepareNextMs", "entryToReadyMs", "cpuMs", "backendReadyMs", "healthReadyMs"];
function startupRecord(status) {
  const record = { timestamp: new Date().toISOString(), version: String(status.version).slice(0, 64), nodeVersion: String(status.nodeVersion).slice(0, 32), timings: {} };
  for (const key of numericFields) {
    const value = status.startup?.[key];
    if (Number.isFinite(value) && value >= 0) record.timings[key] = Math.round(value);
  }
  const index = status.startup?.resolutionIndex;
  if (index) {
    record.resolutionIndex = {};
    for (const key of ["hits", "misses", "entries"]) if (Number.isFinite(index[key])) record.resolutionIndex[key] = index[key];
    record.resolutionIndex.active = index.state === "active";
    record.resolutionIndex.sourcePackActive = index.sources?.state === "active";
    for (const [field, key] of [["sourceHits", "hits"], ["sourceEntries", "entries"]]) {
      if (Number.isFinite(index.sources?.[key])) record.resolutionIndex[field] = index.sources[key];
    }
  }
  return record;
}

async function appendStartupRecord(directory, status) {
  const file = join(directory, "startup-history.json");
  let history = [];
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (Array.isArray(parsed)) history = parsed.slice(-19).filter(value => value && typeof value === "object");
  } catch { /* Diagnostics must not affect startup, including after a partial write. */ }
  history.push(startupRecord(status));
  await mkdir(directory, { recursive: true });
  await writeFile(file, JSON.stringify(history, null, 2));
}

module.exports = { appendStartupRecord, startupRecord };
