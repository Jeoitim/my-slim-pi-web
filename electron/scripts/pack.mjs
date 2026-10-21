import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));
process.env.ELECTRON_BUILDER_CACHE ??= join(root, ".desktop/builder-cache");
const { build, Platform, Arch } = await import("electron-builder");
const configuration = require("../../electron-builder.cjs");
const builderConfiguration = { ...configuration };
delete builderConfiguration.electronDist;
const options = new Set(process.argv.slice(2));
for (const option of options) if (!["--dir", "--linux", "--win", "--mac"].includes(option)) throw new Error(`Unsupported pack option: ${option}`);
const target = options.has("--linux") ? "linux" : options.has("--mac") ? "darwin" : options.has("--win") ? "win32" : process.platform;
const runtime = JSON.parse(await readFile(join(root, ".desktop/runtime/runtime.json"), "utf8"));
if (runtime.platform !== target || runtime.arch !== "x64") throw new Error("Build and package on the target platform with its own Node.js 24 x64 runtime and native dependencies");
const platform = target === "win32" ? Platform.WINDOWS : target === "darwin" ? Platform.MAC : Platform.LINUX;
const electronDist = join(root, "node_modules/electron/dist");
const installedElectron = await stat(electronDist).then(entry => entry.isDirectory(), () => false);
if (target === "win32" && !options.has("--dir")) {
  const { prepareWindowsTools } = await import("./windows-tools.mjs");
  await prepareWindowsTools(process.env.ELECTRON_BUILDER_CACHE);
}
// A dependency-free project root prevents builder's fallback collector from
// putting the Web's Node dependencies into Electron's ASAR a second time.
await build({
  projectDir: join(root, ".desktop/app"),
  targets: platform.createTarget(options.has("--dir") ? "dir" : undefined, Arch.x64),
  publish: "never",
  config: {
    ...builderConfiguration,
    ...(installedElectron ? { electronDist } : {}),
    electronVersion: require("electron/package.json").version,
    directories: { app: ".", output: join(root, "dist-desktop"), buildResources: join(root, ".desktop/icons") },
    extraResources: configuration.extraResources.map(resource => ({ ...resource, from: join(root, resource.from) })),
    win: { ...configuration.win, icon: join(root, configuration.win.icon) },
    linux: { ...configuration.linux, icon: join(root, configuration.linux.icon) },
  },
});
