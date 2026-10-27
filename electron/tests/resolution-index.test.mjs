import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const helper = fileURLToPath(new URL("../server/resolution-index.cjs", import.meta.url));
async function fixture(t) {
  const area = await mkdtemp(join(tmpdir(), "pi-resolution-"));
  t.after(() => rm(area, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const root = join(area, "build");
  const files = {
    "package.json": JSON.stringify({ version: "test.1" }),
    ".desktop/next/BUILD_ID": "build-one",
    ".desktop/next/entry.mjs": "export {kind, Shared, origin} from 'pkg';",
    "node_modules/pkg/package.json": JSON.stringify({ exports: { ".": { import: "./esm.mjs", require: "./cjs.cjs" } } }),
    "node_modules/pkg/shared.cjs": "module.exports = class Shared {};",
    "node_modules/pkg/cjs.cjs": "exports.kind='require'; exports.Shared=require('./shared.cjs');",
    "node_modules/pkg/esm.mjs": "import Shared from './shared.cjs'; export {Shared}; export const kind='import', origin=import.meta.url;",
    "node_modules/future/index.js": "module.exports = 'fallback';",
    "node_modules/auto-cjs/package.json": JSON.stringify({ main: "index.js" }),
    "node_modules/auto-cjs/index.js": "module.exports = 'automatic-commonjs';",
    "node_modules/auto-esm/package.json": JSON.stringify({ main: "index.js" }),
    "node_modules/auto-esm/index.js": "export const marker = 'automatic-esm';",
  };
  for (const [name, source] of Object.entries(files)) {
    await mkdir(join(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), source);
  }
  return { root, area };
}
function run(root, { record = false, disabled = false, sourceDisabled = false, future = false, extension } = {}) {
  const code = `
    const {createRequire}=require('node:module');
    const index=require(${JSON.stringify(helper)}).startResolutionIndex(${JSON.stringify(root)},{record:${record}});
    const req=createRequire(${JSON.stringify(join(root, "package.json"))});
    const fs=require('node:fs');const read=fs.readFileSync;let scriptReads=0;
    fs.readFileSync=function(path,...args){if(String(path).startsWith(${JSON.stringify(root)})&&/\\.(?:js|cjs|mjs)$/.test(String(path)))scriptReads++;return read.call(this,path,...args);};
    const cjs=req('pkg');
    const autoCjs=req('auto-cjs'),autoEsm=req('auto-esm').marker;
    import(${JSON.stringify(pathToFileURL(join(root, ".desktop/next/entry.mjs")).href)}).then(async esm=>{
      const fallback=${future} ? req('future') : null;
      const before=index.stats().hits;
      const external=${extension ? `await import(${JSON.stringify(pathToFileURL(extension).href)})` : "null"};
      const externalHits=index.stats().hits-before;
      index.save();
      console.log(JSON.stringify({cjs:cjs.kind,esm:esm.kind,identity:cjs.Shared===esm.Shared,origin:esm.origin,autoCjs,autoEsm,scriptReads,fallback,external:external?.default,externalHits,stats:index.stats()}));
    });`;
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.PI_DESKTOP_DISABLE_RESOLUTION_INDEX;
  delete env.PI_DESKTOP_DISABLE_SOURCE_PACK;
  if (disabled) env.PI_DESKTOP_DISABLE_RESOLUTION_INDEX = "1";
  if (sourceDisabled) env.PI_DESKTOP_DISABLE_SOURCE_PACK = "1";
  const result = spawnSync(process.execPath, ["-e", code], { env, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("portable index preserves conditional exports, module identity and new dependency fallback", async t => {
  const { root, area } = await fixture(t);
  const recording = run(root, { record: true });
  assert.equal(recording.stats.state, "recording");
  assert.ok(recording.stats.entries > 0);
  assert.ok(recording.stats.sources.entries > 0);
  const manifest = await readFile(join(root, ".resolution-index.json"), "utf8");
  assert.equal(manifest.includes(root.replaceAll("\\", "\\\\")), false, "Index must not contain the build machine root");
  const installed = join(area, "安装目录 with spaces");
  await cp(root, installed, { recursive: true });
  const result = run(installed, { future: true });
  assert.equal(result.cjs, "require"); assert.equal(result.esm, "import"); assert.equal(result.identity, true);
  assert.equal(result.origin, pathToFileURL(join(installed, "node_modules/pkg/esm.mjs")).href);
  assert.equal(result.fallback, "fallback");
  assert.equal(result.stats.state, "active"); assert.ok(result.stats.hits > 0); assert.ok(result.stats.misses > 0);
  assert.equal(result.stats.sources.state, "active"); assert.ok(result.stats.sources.hits > 0);
  assert.equal(run(installed, { disabled: true }).stats.state, "disabled");
  assert.equal(run(installed, { sourceDisabled: true }).stats.sources.state, "disabled");
  const external = join(area, "user-extension");
  await mkdir(join(external, "node_modules/pkg"), { recursive: true });
  await writeFile(join(external, "node_modules/pkg/index.js"), "module.exports='user version';");
  await writeFile(join(external, "extension.mjs"), "import value from 'pkg'; export default value;");
  const plugin = run(installed, { extension: join(external, "extension.mjs") });
  assert.equal(plugin.external, "user version");
  assert.equal(plugin.externalHits, 0, "User extension dependency resolution must not use the packaged index");
});

test("the source pack serves auto-format CommonJS and ambiguous ESM without individual script reads", async t => {
  const { root, area } = await fixture(t);
  const recorded = run(root, { record: true });
  assert.ok(recorded.scriptReads > 0, "Recording must observe ordinary filesystem loading");
  const pack = JSON.parse(gunzipSync(await readFile(join(root, ".startup-sources.json.gz"))));
  assert.ok(pack.modules.some(([path, format]) => path === "node_modules/auto-cjs/index.js" && format === "auto"));
  assert.ok(pack.modules.some(([path, format]) => path === "node_modules/auto-esm/index.js" && format === "auto"));
  const installed = join(area, "relocated auto-format");
  await cp(root, installed, { recursive: true });
  const replayed = run(installed);
  assert.equal(replayed.scriptReads, 0, "Every recorded JavaScript module must be served from the source pack");
  assert.equal(replayed.autoCjs, "automatic-commonjs");
  assert.equal(replayed.autoEsm, "automatic-esm");
  assert.equal(replayed.identity, true);
  assert.ok(run(installed, { sourceDisabled: true }).scriptReads > 0, "The normal loader must remain available");
});

test("a corrupt or stale source pack falls back to files while the resolution index remains active", async t => {
  const { root } = await fixture(t);
  run(root, { record: true });
  await writeFile(join(root, ".startup-sources.json.gz"), "invalid gzip");
  const result = run(root);
  assert.equal(result.stats.state, "active");
  assert.equal(result.stats.sources.state, "unavailable");
  assert.equal(result.identity, true);
});

test("missing, corrupt, stale and escaping index files all fall back to Node", async t => {
  const { root } = await fixture(t);
  assert.equal(run(root).stats.state, "unavailable");
  await writeFile(join(root, ".resolution-index.json"), "{");
  assert.equal(run(root).stats.state, "unavailable");
  run(root, { record: true });
  const valid = JSON.parse(await readFile(join(root, ".resolution-index.json"), "utf8"));
  for (const field of ["node", "buildId", "version", "platform", "arch"]) {
    const stale = structuredClone(valid); stale.identity[field] = "different";
    await writeFile(join(root, ".resolution-index.json"), JSON.stringify(stale));
    assert.equal(run(root).stats.state, "unavailable", field);
  }
  for (const path of ["../outside.cjs", "node_modules/%2e%2e/%2e%2e/outside.cjs", "file:///outside.cjs"]) {
    const invalid = structuredClone(valid); invalid.entries[0][1] = path;
    await writeFile(join(root, ".resolution-index.json"), JSON.stringify(invalid));
    assert.equal(run(root).stats.state, "unavailable", path);
  }
});
