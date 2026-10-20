const { createRequire } = require("node:module");
const { join } = require("node:path");
const projectRequire = createRequire(join(process.argv[2], "package.json"));
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Bundled Node is too old");
projectRequire("next");
const pty = projectRequire("node-pty").spawn(process.platform === "win32" ? "cmd.exe" : "/bin/sh",
  process.platform === "win32" ? ["/d", "/c", "echo desktop-pty-ok"] : ["-c", "printf desktop-pty-ok"], { cols: 80, rows: 24 });
let output = "";
const timer = setTimeout(() => { pty.kill(); console.error("PTY smoke test timed out"); process.exit(1); }, 10_000);
pty.onData(data => { output += data; });
pty.onExit(({ exitCode }) => {
  clearTimeout(timer);
  if (exitCode || !output.includes("desktop-pty-ok")) { console.error("PTY smoke test failed"); process.exit(1); }
  console.log(`Bundled Node ${process.versions.node} and node-pty are working.`);
  // Windows ConPTY can retain a worker handle after the shell's exit event.
  // This short-lived validation process must release the DLL before packaging.
  process.exit(0);
});
