import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { get } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv[2]) throw new Error("Pass the staged server directory");
const root = resolve(process.argv[2]);
const agent = await mkdtemp(join(tmpdir(), "pi-startup-coverage-"));
const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", PI_DESKTOP_COVERAGE_ROOT: root, NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) if (["PI_WEB_PASSWORD", "PI_WEB_REMOTE", "ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "PI_DESKTOP_DISABLE_RESOLUTION_INDEX", "PI_DESKTOP_DISABLE_SOURCE_PACK"].includes(key.toUpperCase())) delete env[key];
const token = randomBytes(32).toString("hex");
const child = fork(fileURLToPath(new URL("../server/index.cjs", import.meta.url)), [], {
  execArgv: ["--require", fileURLToPath(new URL("./startup-read-counter.cjs", import.meta.url))],
  cwd: root, env, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
});
const exited = new Promise(resolve => child.once("exit", resolve));
function message(type) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => finish(new Error(`Startup coverage ${type} timed out`)), 120_000);
    const stopped = () => finish(new Error("Coverage backend exited prematurely"));
    const received = value => {
      if (value?.type === "failed") finish(new Error("Coverage backend failed to start"));
      if (value?.type === type) finish(null, value);
    };
    function finish(error, value) {
      clearTimeout(deadline); child.removeListener("exit", stopped); child.removeListener("message", received);
      if (error) reject(error); else resolve(value);
    }
    child.once("exit", stopped); child.on("message", received);
  });
}
try {
  const ready = message("ready");
  child.send({ type: "start", root, dev: false, token });
  const status = await ready;
  assert.equal(status.startup.resolutionIndex.sources.state, "active");
  for (const path of ["/", "/api/sessions", "/api/agent/running"]) {
    await new Promise((resolve, reject) => {
      const request = get(status.internalUrl + path, { headers: { "x-pi-desktop-token": token } }, response => {
        response.resume(); response.once("end", () => response.statusCode === 200 ? resolve() : reject(new Error(`Coverage route returned ${response.statusCode}`)));
        response.once("error", reject);
      });
      request.once("error", reject); request.setTimeout(30_000, () => request.destroy(new Error("Coverage route timed out")));
    });
  }
  const coverage = message("startup-coverage"); child.send({ type: "startup-coverage" });
  const result = await coverage;
  assert.equal(result.reads, 0, `Startup JavaScript escaped the source pack: ${result.files.join(", ")}`);
  console.log(JSON.stringify({ startupCoverageVerified: true, individualModuleReads: result.reads, generatedManifestReads: result.generatedManifestReads, startup: status.startup }));
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const deadline = setTimeout(() => child.kill(), 15_000);
    if (child.connected) child.send({ type: "stop" }); else child.kill();
    await exited; clearTimeout(deadline);
  }
  await rm(agent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
