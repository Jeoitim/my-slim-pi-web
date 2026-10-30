import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const original = process.env.PI_CODING_AGENT_DIR;
const agent = await mkdtemp(join(tmpdir(), "slim-native-agents-"));
process.env.PI_CODING_AGENT_DIR = agent;
for (const directory of ["agents", "install", "extensions/timrt-suite", "npm/node_modules/pi-subagents/agents"]) await mkdir(join(agent, directory), { recursive: true });
await writeFile(join(agent, "install/current-version"), "1.4.0");
await writeFile(join(agent, "extensions/timrt-suite/permissions.ts"), "fixture");
await writeFile(join(agent, "npm/node_modules/pi-subagents/agents/cli-agent.md"), "---\nname: cli-agent\ndescription: CLI builtin\n---\nCLI prompt\n");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { GET, PUT, PATCH, DELETE } = await jiti.import("../app/api/subagents/profiles/route.ts");
const { PUT: saveBackground } = await jiti.import("../app/api/my-slim-pi/background-models/route.ts");
const { parseFrontmatter } = await jiti.import("./frontmatter.ts");
const { mySlimPiSettingsBridge } = await jiti.import("./my-slim-pi-agents.ts");
const { isRemoteApiAllowed } = await jiti.import("./remote-access.ts");
after(async () => {
  if (original === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = original;
  await rm(agent, { recursive: true, force: true });
});
const request = (url, method, body, headers = {}) => new Request(`http://localhost${url}`, {
  method, headers: { Host: "localhost", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const profiles = async () => (await (await GET(new Request("http://localhost/api/subagents/profiles"))).json());
const profileFile = join(agent, "agents/approver.md");
const hermesFile = join(agent, "hermes-memory-config.json");

test("native manager lists CLI builtins, user agents and Hermes without a session or project", async () => {
  await writeFile(profileFile, "---\nname: approver\ndescription: Internal reviewer\ntools: []\nallowed_subagents: none\nforeign: retained\n---\n\nOriginal reviewer prompt.\n");
  await writeFile(hermesFile, JSON.stringify({ memoryMode: "policy-only", llmThinkingOverride: "off" }));
  const data = await profiles();
  assert.equal(data.runtime, "my-slim-pi");
  assert.ok(data.profiles.some(p => p.name === "approver" && p.scope === "global"));
  assert.ok(data.profiles.some(p => p.name === "cli-agent" && p.scope === "builtin"));
  assert.ok(data.profiles.some(p => p.kind === "hermes"));
  assert.ok(!data.profiles.some(p => p.name === "general-purpose"));
});

test("model changes and clearing preserve the CLI's implicit defaults, foreign keys and exact prompt", async () => {
  const before = parseFrontmatter(await readFile(profileFile, "utf8"));
  const profile = (await profiles()).profiles.find(p => p.name === "approver");
  const response = await PUT(request("/api/subagents/profiles", "PUT", { scope: "global", profile: { ...profile, model: "fixture/new-model" } }));
  assert.equal(response.status, 200);
  const changed = parseFrontmatter(await readFile(profileFile, "utf8"));
  assert.deepEqual(changed.data, { ...before.data, model: "fixture/new-model" });
  assert.equal(changed.rest, before.rest);
  const clear = await PUT(request("/api/subagents/profiles", "PUT", { scope: "global", profile: { ...profile, model: undefined } }));
  assert.equal(clear.status, 200);
  const cleared = parseFrontmatter(await readFile(profileFile, "utf8"));
  assert.deepEqual(cleared.data, before.data);
  assert.equal(cleared.rest, before.rest);
});

test("native profile editing saves reasoning and prompts while CLI builtins remain read-only", async () => {
  const profile = (await profiles()).profiles.find(p => p.name === "approver");
  assert.equal((await PUT(request("/api/subagents/profiles", "PUT", { scope: "global", profile: { ...profile, thinking: "high", systemPrompt: "Explicitly edited prompt." } }))).status, 200);
  const stored = parseFrontmatter(await readFile(profileFile, "utf8"));
  assert.equal(stored.data.thinking, "high");
  assert.equal(stored.data.foreign, "retained");
  assert.equal(stored.rest.trim(), "Explicitly edited prompt.");
  assert.equal((await PATCH(request("/api/subagents/profiles", "PATCH", { scope: "builtin", name: "cli-agent", enabled: false }))).status, 403);
  assert.equal((await PUT(request("/api/subagents/profiles", "PUT", { scope: "project", profile }))).status, 400);
});

test("new CLI profiles include required identity fields without Web runtime flags", async () => {
  const template = (await profiles()).profiles.find(p => p.name === "approver");
  const response = await PUT(request("/api/subagents/profiles", "PUT", { scope: "global", profile: { ...template, name: "new-agent", description: "New CLI agent", tools: ["read"] } }));
  assert.equal(response.status, 200);
  const stored = parseFrontmatter(await readFile(join(agent, "agents/new-agent.md"), "utf8"));
  assert.equal(stored.data.name, "new-agent");
  assert.equal(stored.data.description, "New CLI agent");
  assert.equal(stored.data.tools, "read");
  assert.equal(stored.data.load_extensions, undefined);
  assert.equal(stored.data.codemode, undefined);
  assert.equal((await PUT(request("/api/subagents/profiles", "PUT", { scope: "global", profile: { ...template, name: "no-tools", tools: [] } }))).status, 200);
  assert.equal(parseFrontmatter(await readFile(join(agent, "agents/no-tools.md"), "utf8")).data.tools, "");
});

test("authored CLI identities update and delete their original file, not a guessed filename", async () => {
  const file = join(agent, "agents/custom-filename.md");
  await writeFile(file, "---\nname: named-agent\ndescription: CLI identity\n---\nKeep this prompt.\n");
  await writeFile(join(agent, "agents/README.md"), "Documentation, not an agent definition.");
  const profile = (await profiles()).profiles.find(p => p.name === "named-agent");
  assert.ok(!(await profiles()).profiles.some(p => p.name === "README"));
  assert.equal((await PUT(request("/api/subagents/profiles", "PUT", { scope: "global", profile: { ...profile, model: "fixture/new" } }))).status, 200);
  assert.equal(parseFrontmatter(await readFile(file, "utf8")).data.model, "fixture/new");
  await assert.rejects(access(join(agent, "agents/named-agent.md")));
  assert.equal((await DELETE(request("/api/subagents/profiles", "DELETE", { scope: "global", name: "named-agent" }))).status, 200);
  await assert.rejects(access(file));
});

test("Hermes changes preserve unrelated configuration and publish the CLI's live event without a prompt", async () => {
  const config = { memoryMode: "policy-only", llmThinkingOverride: "off", llmFallbackModels: ["old/a"], llmModelFallbacks: ["old/b"], fallbackModels: ["old/c"], nested: { keep: true } };
  await writeFile(hermesFile, JSON.stringify(config));
  const handlers = new Map(), events = [];
  mySlimPiSettingsBridge({ on: (name, callback) => handlers.set(name, callback), events: { emit: (name, data) => events.push({ name, data }) } });
  handlers.get("session_start")();
  assert.equal((await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: "fixture/summary" }))).status, 200);
  assert.deepEqual(JSON.parse(await readFile(hermesFile, "utf8")), { ...config, llmModelOverride: "fixture/summary" });
  assert.deepEqual(events.at(-1), { name: "timrt:hermes-model", data: { reference: "fixture/summary" } });
  assert.equal((await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: null }))).status, 200);
  assert.deepEqual(JSON.parse(await readFile(hermesFile, "utf8")), { memoryMode: "policy-only", llmThinkingOverride: "off", nested: { keep: true } });
  assert.deepEqual(events.at(-1).data, { reference: null });
  handlers.get("session_shutdown")();
  const count = events.length;
  await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: "fixture/later" }));
  assert.equal(events.length, count);
});

test("Hermes API keeps auth and schema boundaries and refuses corrupt files without overwriting them", async () => {
  assert.equal((await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: "fixture/a" }, { Origin: "https://evil.example" }))).status, 403);
  assert.equal((await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: "fixture/a" }, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: "fixture/a", path: "elsewhere" }))).status, 400);
  assert.equal((await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: "x\nmodel: y" }))).status, 409);
  await writeFile(hermesFile, "{");
  assert.equal((await saveBackground(request("/api/my-slim-pi/background-models", "PUT", { model: "fixture/a" }))).status, 409);
  assert.equal(await readFile(hermesFile, "utf8"), "{");
  assert.equal(isRemoteApiAllowed("/api/my-slim-pi/background-models", "PUT"), true);
  assert.equal(isRemoteApiAllowed("/api/my-slim-pi/background-models", "GET"), false);
});
