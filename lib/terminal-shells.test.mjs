import assert from "node:assert/strict";
import test from "node:test";
import { detectTerminalShells, resolveTerminalShell } from "./terminal-shells.ts";

test("Windows discovers installed PowerShell profiles, cmd and Git Bash without launching anything", () => {
  const installed = new Set([
    "c:\\program files\\powershell\\7\\pwsh.exe",
    "c:\\windows\\system32\\windowspowershell\\v1.0\\powershell.exe",
    "c:\\windows\\system32\\cmd.exe",
    "c:\\program files\\git\\bin\\bash.exe",
  ]);
  const result = detectTerminalShells({ platform: "win32", home: "C:\\Users\\test", env: {
    Path: '"C:\\Program Files\\PowerShell\\7";C:\\Windows\\System32;.;relative',
    SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files", comspec: "C:\\Windows\\System32\\cmd.exe",
  }, executable: file => installed.has(file.toLowerCase()) });
  assert.deepEqual(result.shells.map(shell => shell.id), ["pwsh", "powershell", "cmd", "git-bash"]);
  assert.equal(result.defaultShellId, "pwsh");
  assert.deepEqual(result.shells[0].args, ["-NoLogo"]);
});

test("Windows never mistakes the legacy WSL bash launcher or a relative PATH entry for Git Bash", () => {
  const seen = [];
  const result = detectTerminalShells({ platform: "win32", home: "C:\\Users\\test", env: {
    PATH: ".;untrusted;C:\\Windows\\System32", SystemRoot: "C:\\Windows", ProgramFiles: "C:\\none",
  }, executable: file => { seen.push(file); return /System32\\(?:cmd|bash)\.exe$/i.test(file); } });
  assert.deepEqual(result.shells.map(shell => shell.id), ["cmd"]);
  assert.ok(seen.every(file => /^[A-Z]:\\/i.test(file)));
});

test("Unix honors the executable login shell, falls back to an installed shell and deduplicates paths", () => {
  const executable = file => ["/bin/bash", "/bin/sh", "/opt/custom/fish"].includes(file);
  const result = detectTerminalShells({ platform: "linux", env: { PATH: ".:/bin", SHELL: "/opt/custom/fish" }, executable });
  assert.equal(result.defaultShellId, "login-shell");
  assert.deepEqual(result.shells.map(shell => shell.path), ["/bin/bash", "/bin/sh", "/opt/custom/fish"]);
  assert.equal(detectTerminalShells({ platform: "linux", env: { SHELL: "/missing" }, executable }).defaultShellId, "bash");
  assert.equal(detectTerminalShells({ platform: "linux", env: {}, executable: () => false }).defaultShellId, undefined);
});

test("client-supplied paths and command lines cannot become executable profiles", () => {
  for (const id of ["../../cmd.exe", "cmd /c echo unsafe", "/bin/sh", "unknown"]) {
    assert.throws(() => resolveTerminalShell(id), /unavailable/);
  }
});
