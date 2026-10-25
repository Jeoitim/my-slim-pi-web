import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const { startResolutionIndex } = createRequire(import.meta.url)("../server/resolution-index.cjs");

if (!process.argv[2]) throw new Error("Pass the staged or installed server directory");
const root = resolve(process.argv[2]);
const area = await mkdtemp(join(tmpdir(), "pi-startup-resources-"));
process.env.PI_CODING_AGENT_DIR = area;
process.env.PI_OFFLINE = "1";
try {
  const index = startResolutionIndex(root);
  assert.equal(index.stats().state, "active");
  assert.equal(index.stats().sources.state, "active");
  const sdkRoot = join(root, "node_modules/@earendil-works/pi-coding-agent");
  const load = file => import(pathToFileURL(join(sdkRoot, file)).href);
  const sdk = await load("dist/index.js");
  const session = await load("dist/core/session-manager.js");
  const mcp = await load("dist/extensions/mcp/index.js");
  const model = await load("dist/core/model-runtime.js");
  assert.equal(sdk.SessionManager, session.SessionManager, "SessionManager must retain its original module identity");
  assert.equal(sdk.createMcpExtension, mcp.createMcpExtension, "MCP internals must share the SDK's module identity");
  assert.equal(sdk.ModelRuntime, model.ModelRuntime, "ModelRuntime must retain its original module identity");
  assert.equal(await realpath(sdk.getPackageDir()), await realpath(sdkRoot), "SDK resources must resolve within the relocated installation");
  console.log(JSON.stringify({ startupResourcesVerified: true, ...index.stats() }));
} finally { await rm(area, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
