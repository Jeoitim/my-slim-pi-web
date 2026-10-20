import { existsSync } from "node:fs";
import { join } from "node:path";

/** Detect the existing managed installation; never create another resource directory. */
export function isMySlimPiAgent(agentDir: string): boolean {
  return existsSync(join(agentDir, "install", "current-version"))
    && existsSync(join(agentDir, "extensions", "timrt-suite", "permissions.ts"));
}
