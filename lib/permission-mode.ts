import type { ExtensionStatusItem } from "./types";

export const PERMISSION_MODE_STATUS = "timrt-permission-mode";
export const PERMISSION_MODES = ["auto", "act", "ask", "plan"] as const;
export type PermissionMode = typeof PERMISSION_MODES[number];
export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && (PERMISSION_MODES as readonly string[]).includes(value);
}
export function permissionModeFromStatuses(statuses: readonly ExtensionStatusItem[]): PermissionMode | null {
  const value = statuses.find(item => item.key === PERMISSION_MODE_STATUS)?.text;
  return isPermissionMode(value) ? value : null;
}
