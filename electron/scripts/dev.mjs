import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Desktop development requires Node.js 24+");
const environment = { ...process.env, PI_DESKTOP_NODE: process.execPath };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [fileURLToPath(new URL("../main/index.cjs", import.meta.url)), "--desktop-dev"], {
  env: environment, stdio: "inherit", windowsHide: true,
});
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
