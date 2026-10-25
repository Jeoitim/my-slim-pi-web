import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { get } from "node:http";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Load only local, read-only routes against a disposable, empty Agent directory.
// Never seed a release using the developer's sessions, extensions or credentials.
export async function warmCompileCache(node, root) {
  const area = await mkdtemp(join(tmpdir(), "pi-desktop-cache-"));
  const token = randomBytes(32).toString("hex");
  const env = { ...process.env, PI_CODING_AGENT_DIR: area, PI_OFFLINE: "1", NEXT_TELEMETRY_DISABLED: "1" };
  for (const name of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "NODE_COMPILE_CACHE", "NODE_DISABLE_COMPILE_CACHE", "PI_WEB_PASSWORD", "PI_WEB_REMOTE", "PI_DESKTOP_INGRESS_PUBLIC_KEY"]) delete env[name];
  let child;
  try {
    child = fork(fileURLToPath(new URL("../server/index.cjs", import.meta.url)), [], {
      execPath: node, execArgv: [], cwd: root, env, windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const exited = new Promise(resolve => child.once("exit", resolve));
    const ready = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => finish(new Error("Compile cache warmup timed out")), 120_000);
      const onError = () => finish(new Error("Compile cache runtime could not start"));
      const onExit = () => finish(new Error("Compile cache runtime exited before readiness"));
      const onMessage = message => {
        if (message?.type === "failed") finish(new Error("Compile cache backend could not start"));
        if (message?.type === "ready") finish(null, message);
      };
      const finish = (error, value) => {
        clearTimeout(deadline);
        child.removeListener("error", onError); child.removeListener("exit", onExit); child.removeListener("message", onMessage);
        if (error) reject(error); else resolve(value);
      };
      child.once("error", onError); child.once("exit", onExit); child.on("message", onMessage);
      child.send({ type: "start", root, dev: false, token, recordResolutions: true });
    });
    if (ready.startup?.compileCache !== "enabled") throw new Error("Bundled Node could not enable the portable compile cache");
    if (ready.startup?.resolutionIndex?.state !== "recording") throw new Error("Bundled Node could not record the startup resolution index");
    for (const path of ["/", "/api/sessions", "/api/agent/running"]) {
      await new Promise((resolve, reject) => {
        const request = get(ready.internalUrl + path, { headers: { "x-pi-desktop-token": token } }, response => {
          response.resume();
          response.once("end", () => response.statusCode === 200 ? resolve() : reject(new Error(`Compile cache route returned ${response.statusCode}`)));
          response.once("error", reject);
        });
        request.setTimeout(60_000, () => request.destroy(new Error("Compile cache route timed out")));
        request.once("error", reject);
      });
    }
    child.send({ type: "stop" });
    const deadline = setTimeout(() => child.kill(), 15_000);
    try { if (await exited !== 0) throw new Error("Compile cache runtime did not exit cleanly"); }
    finally { clearTimeout(deadline); }
    const index = JSON.parse(await readFile(join(root, ".resolution-index.json"), "utf8"));
    if (!index.entries?.length || !(await stat(join(root, ".startup-sources.json.gz"))).size) throw new Error("Startup assets were not generated");
    return ready.startup;
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once("exit", resolve));
      child.kill();
      await stopped;
    }
    await rm(area, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
