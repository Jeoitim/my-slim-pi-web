import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface TerminalShellInfo { id: string; name: string; path: string }
export interface TerminalShell extends TerminalShellInfo { args: string[] }

/** Inspect known executables only: discovering profiles never starts a shell. */
export function detectTerminalShells({ platform = process.platform, env = process.env, home = homedir(), executable = (file: string) => {
  try { accessSync(file, platform === "win32" ? constants.F_OK : constants.X_OK); return statSync(file).isFile(); }
  catch { return false; }
} }: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; home?: string; executable?: (file: string) => boolean } = {}): { shells: TerminalShell[]; defaultShellId?: string } {
  const windows = platform === "win32";
  const paths = windows ? path.win32 : path.posix;
  const value = (name: string) => env[Object.keys(env).find(key => windows ? key.toLowerCase() === name.toLowerCase() : key === name) ?? name];
  const directories = (value("PATH") ?? "").split(windows ? ";" : ":")
    .map(dir => dir.replace(/^"|"$/g, "")).filter(dir => paths.isAbsolute(dir));
  const shells: TerminalShell[] = [];
  const key = (file: string) => windows ? paths.normalize(file).toLowerCase() : file;
  const add = (id: string, name: string, candidates: (string | undefined)[], args: string[]) => {
    const file = candidates.find((file): file is string => Boolean(file && paths.isAbsolute(file) && executable(file)));
    if (file && !shells.some(shell => key(shell.path) === key(file))) shells.push({ id, name, path: file, args });
  };
  const onPath = (name: string) => directories.map(dir => paths.join(dir, name));
  if (windows) {
    const system = value("SystemRoot") || "C:\\Windows";
    const programFiles = value("ProgramFiles") || "C:\\Program Files";
    add("pwsh", "PowerShell 7", [...onPath("pwsh.exe"), paths.join(programFiles, "PowerShell/7/pwsh.exe"), paths.join(home, "scoop/apps/pwsh/current/pwsh.exe")], ["-NoLogo"]);
    add("powershell", "Windows PowerShell", [...onPath("powershell.exe"), paths.join(system, "System32/WindowsPowerShell/v1.0/powershell.exe")], ["-NoLogo"]);
    add("cmd", "Command Prompt", [value("ComSpec"), paths.join(system, "System32/cmd.exe"), ...onPath("cmd.exe")], []);
    // System32/bash.exe is a WSL launcher, not Git Bash.
    const bash = onPath("bash.exe").filter(file => !key(file).startsWith(key(paths.join(system, "System32")) + "\\"));
    add("git-bash", "Git Bash", [paths.join(programFiles, "Git/bin/bash.exe"), value("LOCALAPPDATA") && paths.join(value("LOCALAPPDATA")!, "Programs/Git/bin/bash.exe"), paths.join(home, "scoop/apps/git/current/bin/bash.exe"), ...bash], ["--login", "-i"]);
  } else {
    for (const name of ["zsh", "bash", "fish", "sh"]) {
      add(name, name, [...onPath(name), `/bin/${name}`, `/usr/bin/${name}`], ["-l"]);
    }
    const login = value("SHELL");
    if (login && !/\/(?:nologin|false)$/.test(login)) add("login-shell", paths.basename(login), [login], ["-l"]);
  }
  const preferred = windows ? shells[0] : shells.find(shell => shell.path === value("SHELL")) ?? shells[0];
  return { shells, defaultShellId: preferred?.id };
}

export function terminalShellInfo(shell: TerminalShell): TerminalShellInfo {
  return { id: shell.id, name: shell.name, path: shell.path };
}

export function resolveTerminalShell(id?: string): TerminalShell {
  const { shells, defaultShellId } = detectTerminalShells();
  const shell = shells.find(shell => shell.id === (id ?? defaultShellId));
  if (!shell) throw new Error(id ? "Selected terminal shell is unavailable. Refresh the shell list and try again." : "No supported terminal shell was found.");
  return shell;
}
