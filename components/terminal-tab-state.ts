export interface TerminalTab {
  id: string;
  cwd: string;
  shellId?: string;
  shellName?: string;
  restored?: boolean;
  closing?: "close" | "restart";
}

export const TERMINAL_TABS_KEY = "pi-web:terminal-tabs";

export function newTerminalTab(cwd: string, shell?: { id: string; name: string }): TerminalTab {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { id, cwd, ...(shell ? { shellId: shell.id, shellName: shell.name } : {}) };
}

export function restoreTerminalTabs(raw: string | null): { tabs: TerminalTab[]; activeId: string | null; open: boolean } {
  try {
    const saved = JSON.parse(raw ?? "null");
    const tabs: TerminalTab[] = [];
    for (const tab of Array.isArray(saved?.tabs) ? saved.tabs : []) {
      if (tab && typeof tab.id === "string" && /^[a-f0-9]{32}$/.test(tab.id)
        && typeof tab.cwd === "string" && tab.cwd.trim()
        && (tab.shellId === undefined || (typeof tab.shellId === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(tab.shellId)))
        && !tabs.some((existing) => existing.id === tab.id)) {
        tabs.push({ id: tab.id, cwd: tab.cwd, restored: true,
          ...(tab.shellId ? { shellId: tab.shellId } : {}),
          ...(typeof tab.shellName === "string" && tab.shellName.length <= 100 ? { shellName: tab.shellName } : {}) });
      }
    }
    return { tabs, activeId: tabs.some((tab) => tab.id === saved.activeId) ? saved.activeId : null, open: saved?.open === true };
  } catch {
    return { tabs: [], activeId: null, open: false };
  }
}
