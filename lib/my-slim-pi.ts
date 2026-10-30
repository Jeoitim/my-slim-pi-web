import { existsSync } from "node:fs";
import { join } from "node:path";

/** Detect the existing managed installation; never create another resource directory. */
export function isMySlimPiAgent(agentDir: string): boolean {
  return existsSync(join(agentDir, "install", "current-version"))
    && mySlimPiSuiteDirectory(agentDir) !== undefined;
}

/** Current CLI branding and its earlier layout use the same ownership contract. */
export function mySlimPiSuiteDirectory(agentDir: string): string | undefined {
  for (const name of ["my-slim-pi-suite", "timrt-suite"]) {
    const directory = join(agentDir, "extensions", name);
    if (existsSync(join(directory, "permissions.ts"))) return directory;
  }
}
