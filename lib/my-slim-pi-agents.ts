import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { isMySlimPiAgent } from "./my-slim-pi";
import { listSubagentProfileSources, parseProfileFile, type SubagentProfile } from "./subagents";
import { parseFrontmatter } from "./frontmatter";
import { dump as stringifyYaml } from "js-yaml";

const BUSES = Symbol.for("my-slim-pi.settings-event-buses");
type Bus = ExtensionAPI["events"];
function buses(): Set<Bus> {
  const shared = globalThis as typeof globalThis & { [BUSES]?: Set<Bus> };
  return shared[BUSES] ??= new Set();
}

/** Uses the CLI's existing live Hermes event; no prompt or transcript entry. */
export function mySlimPiSettingsBridge(pi: ExtensionAPI) {
  pi.on("session_start", () => { buses().add(pi.events); });
  pi.on("session_shutdown", () => { buses().delete(pi.events); });
}

function hermesConfig(agentDir: string) {
  const value: unknown = JSON.parse(readFileSync(join(agentDir, "hermes-memory-config.json"), "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Hermes configuration");
  return value as Record<string, unknown>;
}

export function hermesModelProfile(agentDir = getAgentDir()): SubagentProfile {
  const config = hermesConfig(agentDir);
  const model = config.llmModelOverride;
  if (model !== undefined && typeof model !== "string") throw new Error("Invalid Hermes model configuration");
  return {
    kind: "hermes", name: "hermes-memory", displayName: "Hermes", description: "Memory summaries",
    systemPrompt: "", tools: [], loadSkills: false, loadExtensions: false, promptMode: "append",
    inheritContext: false, runInBackground: true, enabled: true, scope: "global",
    filePath: join(agentDir, "hermes-memory-config.json"), ...(model ? { model } : {}),
  };
}

export function listMySlimPiProfiles(cwd: string, agentDir = getAgentDir()): SubagentProfile[] {
  const directory = join(agentDir, "npm/node_modules/pi-subagents/agents");
  const builtinProfiles = existsSync(directory) ? readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
    .flatMap(entry => {
      const profile = parseProfileFile(join(directory, entry.name), "builtin");
      return profile ? [profile] : [];
    }) : [];
  const profiles = listSubagentProfileSources(cwd, builtinProfiles);
  if (existsSync(join(agentDir, "hermes-memory-config.json"))) profiles.push(hermesModelProfile(agentDir));
  return profiles.flatMap(profile => {
    if (profile.kind === "hermes" || !profile.filePath) return [profile];
    const { data } = parseFrontmatter(readFileSync(profile.filePath, "utf8"));
    if (typeof data?.name !== "string" || !data.name.trim() || typeof data.description !== "string" || !data.description.trim()) return [];
    return [{ ...profile, configuration: stringifyYaml(data, { noRefs: true, lineWidth: 100 }).trimEnd() }];
  });
}

export async function saveHermesModel(model: unknown, agentDir = getAgentDir()) {
  if (!isMySlimPiAgent(agentDir)) throw new Error("My Slim Pi installation not found");
  if (model !== null && (typeof model !== "string" || !model.trim() || model.length > 512 || /[\r\n\0]/.test(model))) {
    throw new Error("model must be a model reference or null");
  }
  const file = join(agentDir, "hermes-memory-config.json");
  const release = await lockfile.lock(file, { realpath: false, retries: 10 });
  try {
    const config = hermesConfig(agentDir);
    if (model === null) {
      delete config.llmModelOverride;
      delete config.llmFallbackModels;
      delete config.llmModelFallbacks;
      delete config.fallbackModels;
    } else config.llmModelOverride = (model as string).trim();
    writePrivateFileAtomicSync(file, JSON.stringify(config, null, 2) + "\n");
    for (const bus of buses()) bus.emit("timrt:hermes-model", { reference: model === null ? null : (model as string).trim() });
    return hermesModelProfile(agentDir);
  } finally { await release(); }
}
