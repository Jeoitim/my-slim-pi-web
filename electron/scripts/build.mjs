import { cp, mkdir, readFile, writeFile, stat, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stageNextResources } from "./stage-resources.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Build desktop releases with Node.js 24 LTS (the executable is bundled)");
if (process.arch !== "x64") throw new Error("Build the initial desktop release on a native x64 host");
const server = join(root, ".desktop/server");
const runtime = join(root, ".desktop/runtime");
const environment = { ...process.env, PI_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" };
// npm 12 exports CLI-only allow-scripts flags into `npm run`; a nested project
// install rejects those flags even with scripts disabled. Do not inherit them.
for (const key of Object.keys(environment)) {
  if (key.toLowerCase().replaceAll("_", "-") === "npm-config-allow-scripts") delete environment[key];
}
async function run(command, args, cwd = root, env = environment) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", windowsHide: true, shell: false });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? accept() : reject(new Error(`Desktop build step failed (${code})`)));
  });
}
await mkdir(server, { recursive: true });
await mkdir(runtime, { recursive: true });
console.log("Building Next.js into the isolated .desktop/next directory…");
if (!process.argv.includes("--resources-only") && process.env.PI_DESKTOP_RESOURCES_ONLY !== "1") await run(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"]);
// Standalone establishes the deployment layout; complete production dependencies below
// retain SDK dynamic imports, extension templates, and native binaries tracing can miss.
await stageNextResources(root);
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await import("./stage-host.mjs");
const productionManifest = { ...manifest, scripts: {}, devDependencies: {}, main: undefined };
await writeFile(join(server, "package.json"), JSON.stringify(productionManifest, null, 2));
await cp(join(root, "package-lock.json"), join(server, "package-lock.json"));
const npmScript = process.env.npm_execpath;
if (!npmScript || !existsSync(npmScript)) throw new Error("Use npm run desktop:build so the matching npm runtime can be bundled");
console.log("Installing the locked production dependency tree (Node ABI, no Electron rebuild)…");
await run(process.execPath, [npmScript, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], server);
const binaryName = process.platform === "win32" ? "node.exe" : "node";
await cp(process.execPath, join(runtime, binaryName));
await chmod(join(runtime, binaryName), 0o755);
const npmRoot = resolve(dirname(npmScript), "..");
await cp(npmRoot, join(runtime, "node_modules/npm"), { recursive: true, force: true });
// Include npm/npx launchers for extensions that invoke them through PATH.
for (const name of ["npm", "npx"]) {
  if (process.platform === "win32") {
    const launcher = join(dirname(process.execPath), `${name}.cmd`);
    if (existsSync(launcher)) await cp(launcher, join(runtime, `${name}.cmd`));
    else await writeFile(join(runtime, `${name}.cmd`), `@"%~dp0node.exe" "%~dp0node_modules\\npm\\bin\\${name}-cli.js" %*\r\n`);
  } else {
    await writeFile(join(runtime, name), `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/node_modules/npm/bin/${name}-cli.js" "$@"\n`, { mode: 0o755 });
  }
}
// The standalone config contains build-machine tracing paths; none are needed at runtime.
const requiredFile = join(server, ".desktop/next/required-server-files.json");
const required = JSON.parse(await readFile(requiredFile, "utf8"));
required.config.distDir = ".desktop/next";
required.config.outputFileTracingRoot = server;
await writeFile(requiredFile, JSON.stringify(required));
// Native executable helpers need executable mode on Unix (upstream packaging workaround).
for (const helper of ["build/Release/spawn-helper", `prebuilds/${process.platform}-x64/spawn-helper`]) {
  const path = join(server, "node_modules/node-pty", helper);
  if (existsSync(path) && (await stat(path)).isFile()) await chmod(path, 0o755);
}
await writeFile(join(runtime, "runtime.json"), JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch }, null, 2));
console.log("Validating the bundled Node runtime and native terminal…");
await run(join(runtime, binaryName), [fileURLToPath(new URL("./verify-runtime.cjs", import.meta.url)), server]);
console.log("Desktop resources ready. Run npm run desktop:pack to create the installer.");
