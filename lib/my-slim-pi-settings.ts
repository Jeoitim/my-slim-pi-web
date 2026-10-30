import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import { isMySlimPiAgent, mySlimPiSuiteDirectory } from "./my-slim-pi";
import { writePrivateFileAtomicSync } from "./atomic-file";

function configPath(agentDir: string) { return join(agentDir, "extensions/pi-permission-suite/config.json"); }
function readConfig(agentDir: string) {
  const value = JSON.parse(readFileSync(configPath(agentDir), "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)
    || (value.reviewer !== undefined && (!value.reviewer || typeof value.reviewer !== "object" || Array.isArray(value.reviewer)))) {
    throw new Error("Invalid My Slim Pi permission configuration");
  }
  return value;
}
export function readMySlimPiSettings(agentDir = getAgentDir()) {
  if (!isMySlimPiAgent(agentDir)) throw new Error("My Slim Pi installation not found");
  const config = readConfig(agentDir);
  let supported = false;
  const suite = mySlimPiSuiteDirectory(agentDir)!;
  for (const file of ["my-slim-pi-suite.compiled.mjs", "timrt-fast.mjs"]) {
    try { supported ||= readFileSync(join(suite, file), "utf8").includes('"approval-fallback"'); } catch {}
  }
  const value = config.reviewer?.humanFallback;
  return { supported, humanFallbackEnabled: value === undefined || value === "ask", shell: process.platform === "win32" ? "PowerShell" : "Bash" };
}
export async function writeMySlimPiSettings(enabled: boolean, agentDir = getAgentDir()) {
  if (!readMySlimPiSettings(agentDir).supported) throw new Error("Update and rebuild the My Slim Pi companion extension first");
  const file = configPath(agentDir);
  const release = await lockfile.lock(file, {realpath:false, retries:10});
  try {
    const config = readConfig(agentDir);
    config.reviewer = { ...config.reviewer, humanFallback: enabled ? "ask" : "pause" };
    writePrivateFileAtomicSync(file, JSON.stringify(config, null, 2) + "\n");
    return readMySlimPiSettings(agentDir);
  } finally { await release(); }
}
