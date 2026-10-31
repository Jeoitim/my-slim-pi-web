// Full NSIS installation tests use a unique app ID, registry keys and target.
// They never install over the user's application or start an Agent backend.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, copyFile, readdir, stat, rm, realpath } from "node:fs/promises";
import { resolve, join, relative, sep } from "node:path";
import { createRequire } from "node:module";
import { build, Platform, Arch } from "electron-builder";
import { prepareWindowsTools } from "./windows-tools.mjs";

if (process.platform !== "win32") throw new Error("Run the installer regression on Windows");
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "../..");
const configuration = require("../../electron-builder.cjs");
const { UUID } = require("builder-util-runtime");
const id = randomUUID();
const area = join(root, ".local", `installer-upgrade-${id}`);
const app = join(area, "app");
const packages = join(area, "packages");
const minimal = join(area, "minimal");
const programs = resolve(process.env.LOCALAPPDATA, "Programs");
const target = join(programs, `PiInstallerCheck-${id.slice(0, 8)} 中文 & O'Brien`);
const appId = `io.github.jeoitim.my-slim-pi-web.installer-test.${id}`;
const guid = UUID.v5(appId, UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3"));
assert.notEqual(guid, "a8955933-6345-5f4d-8925-dae6cd836e32");
// A legacy installer's global-name fallback must never match the real product.
const fixtureExecutable = `PiInstallerFixture_${id.slice(0, 8)}`;
const uninstallerName = `Uninstall ${fixtureExecutable}.exe`;
const registrationKey = ["HKCU", "Software", "Microsoft", "Windows", "CurrentVersion", "Uninstall", guid].join("\\");
const payloadIndex = process.argv.indexOf("--payload");
const payload = payloadIndex < 0 ? minimal : await realpath(resolve(process.argv[payloadIndex + 1]));
if (payloadIndex >= 0) await stat(join(payload, "MySlimPiWeb.exe"));
const results = [];
process.env.ELECTRON_BUILDER_CACHE ??= join(process.env.LOCALAPPDATA, "electron-builder/Cache");

async function run(command, args, { timeout = 300_000, verbatim = false, ignoreError = false } = {}) {
  return await new Promise((accept, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, windowsVerbatimArguments: verbatim, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Owned fixture process timed out: ${command}`)); }, timeout);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (!ignoreError && code !== 0) reject(new Error(`Fixture command failed (${code}): ${output}`));
      else accept({ code, output });
    });
  });
}
async function inventory(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(directory, name));
    else {
      assert.ok(entry.isFile(), "Test payload must not contain links");
      files.push({ name, bytes: (await stat(join(directory, name))).size });
    }
  }
  return files;
}
const digest = async path => createHash("sha256").update(await readFile(path)).digest("hex");
async function verifyFiles() {
  const files = await inventory(payload);
  for (const file of files) assert.equal((await stat(join(target, file.name))).size, file.bytes, file.name);
  for (const name of ["MySlimPiWeb.exe", "resources/app.asar", "resources/runtime/node.exe"]) {
    if (files.some(file => file.name === name.split("/").join(sep))) assert.equal(await digest(join(target, name)), await digest(join(payload, name)), name);
  }
  assert.ok((await stat(join(target, uninstallerName))).size > 0);
  const registration = await run("reg.exe", ["query", registrationKey, "/v", "DisplayVersion", "/reg:64"]);
  assert.ok(registration.output.includes("0.13.0-jeoitim.2"), "Repaired version is registered");
  return files.length;
}
async function seedFiles() {
  // Native copying avoids a slow sequence of per-file JavaScript operations.
  const copied = await run("robocopy.exe", [payload, target, "/E", "/COPY:DAT", "/DCOPY:DAT", "/XJ", "/MT:8", "/R:0", "/W:0", "/NFL", "/NDL", "/NJH", "/NJS"], { ignoreError: true });
  assert.ok(copied.code >= 0 && copied.code < 8, `Fixture copy failed: ${copied.output}`);
}
async function install(version, label) {
  const started = Date.now();
  // NSIS consumes /D= and the entire remaining command line; do not add shell quotes.
  await run(join(packages, `fixture-${version}.exe`), ["/S", "/currentuser", `/D=${target}`], { verbatim: true });
  const files = await verifyFiles();
  assert.equal(await stat(join(target, 'resources/server/.desktop/next/server/route-cache/interrupted-test.json')).then(() => true, () => false), false, "Old generated page cache is removed");
  results.push({ label, files, ms: Date.now() - started });
  console.log(JSON.stringify(results.at(-1)));
}
async function uninstall() {
  const external = join(area, "fixture-uninstaller.exe");
  await copyFile(join(target, uninstallerName), external);
  await run(external, ["/S", "/currentuser", "/KEEP_APP_DATA", `_?=${target}`], { verbatim: true });
}
async function makeInstaller(version, source, repaired) {
  await writeFile(join(app, "package.json"), JSON.stringify({ name: `pi-install-test-${id}`, version, description: "Isolated NSIS regression", author: "Local test", main: "index.js" }));
  const nsis = repaired ? { ...configuration.nsis, include: join(root, configuration.nsis.include) } : { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false };
  await build({
    projectDir: app, prepackaged: source, targets: Platform.WINDOWS.createTarget("nsis", Arch.x64), publish: "never",
    config: {
      appId, productName: `Pi Installer Check ${id.slice(0, 8)}`, electronVersion: require("electron/package.json").version,
      asar: false, directories: { app: ".", output: packages },
      win: { executableName: fixtureExecutable, signAndEditExecutable: false, artifactName: "fixture-${version}.exe" },
      nsis: { ...nsis, createDesktopShortcut: false, createStartMenuShortcut: false, runAfterFinish: false },
    },
  });
}
try {
  await mkdir(app, { recursive: true });
  await mkdir(join(minimal, "resources/deep/nested"), { recursive: true });
  const source = join(area, "fixture.cs");
  await writeFile(source, "class Fixture { static void Main() { System.Threading.Thread.Sleep(-1); } }");
  await run(join(process.env.SystemRoot, "Microsoft.NET/Framework64/v4.0.30319/csc.exe"), ["/nologo", "/target:winexe", `/out:${join(minimal, "MySlimPiWeb.exe")}`, source]);
  await writeFile(join(minimal, "resources/deep/nested/check.txt"), "fixture");
  await prepareWindowsTools(process.env.ELECTRON_BUILDER_CACHE);
  await makeInstaller("0.13.0-jeoitim.1", minimal, false);
  await makeInstaller("0.13.0-jeoitim.2", payload, true);
  const legacy = await run(join(packages, "fixture-0.13.0-jeoitim.1.exe"), ["/S", "/currentuser", `/D=${target}`], { verbatim: true });
  assert.equal(legacy.code, 0);
  // Populate an old registered installation with the full real file tree while
  // retaining the legacy uninstaller, so its upgrade removal is exercised too.
  await seedFiles();
  await install("0.13.0-jeoitim.2", "legacy registered installation to repaired .2");
  await install("0.13.0-jeoitim.2", "same-version .2 reinstall");
  await uninstall();
  // An interrupted earlier install can leave files without any uninstall entry.
  await seedFiles();
  const cache = join(target, "resources/server/.desktop/next/server/route-cache");
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, "interrupted-test.json"), "old build cache");
  await install("0.13.0-jeoitim.2", "repair files without uninstall registration");
  await uninstall();
  await writeFile(join(area, "report.json"), JSON.stringify({ passed: true, fullPayload: payloadIndex >= 0, appId, guid, results }, null, 2));
  console.log(JSON.stringify({ passed: true, fullPayload: payloadIndex >= 0, results, area }));
} finally {
  // Only this run's random registry keys and directory are eligible for cleanup.
  assert.ok(appId.endsWith(id) && target.startsWith(programs + sep) && target.includes(id.slice(0, 8)));
  for (const view of ["32", "64"]) {
    for (const key of [["HKCU", "Software", guid].join("\\"), registrationKey]) {
      await run("reg.exe", ["delete", key, "/f", `/reg:${view}`], { ignoreError: true });
    }
  }
  const actual = await realpath(target).catch(() => null);
  if (actual) {
    assert.equal(relative(programs, actual).toLowerCase(), relative(programs, target).toLowerCase());
    await rm(actual, { recursive: true, force: true });
  }
}
