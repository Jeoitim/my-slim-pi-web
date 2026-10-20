import { isIP } from "node:net";

export function isRemoteRequest(request: Request, environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.PI_WEB_REMOTE === "1") return true;
  try {
    const hostname = new URL("http://" + request.headers.get("host")).hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch { return true; }
}

/** Remote APIs fail closed: new upstream routes need an explicit audit before exposure. */
export function isRemoteApiAllowed(pathname: string, method: string): boolean {
  if (pathname === "/api/web-auth") return ["GET", "POST", "DELETE"].includes(method);
  if (method === "GET") {
    return /^\/api\/(?:sessions(?:\/.*)?|agent(?:\/[^/]+(?:\/events)?)?|models|home|file-index|git\/(?:status|diff)|push\/config|app-update)$/.test(pathname)
      || pathname.startsWith("/api/files/");
  }
  if (method === "POST") {
    return /^\/api\/agent\/(?:new|[^/]+)$/.test(pathname)
      || pathname === "/api/sessions/ui-state"
      || pathname === "/api/sessions/stats"
      || pathname === "/api/cwd/validate";
  }
  return false;
}

const REMOTE_AGENT_COMMANDS = new Set([
  "prompt", "steer", "follow_up", "abort", "abort_compaction", "get_state", "get_tools",
  "get_commands", "get_messages", "get_session_stats", "set_model", "set_thinking_level",
  "set_permission_mode", "extension_ui_response", "extension_ui_input", "compact", "navigate_tree",
]);
export function remoteAgentCommandError(command: Record<string, unknown>): string | null {
  if (!REMOTE_AGENT_COMMANDS.has(String(command.type))) return "This command is disabled for remote access";
  if (command.toolNames !== undefined) return "Remote tool overrides are disabled; My Slim Pi owns the loadout";
  if (["prompt", "steer", "follow_up"].includes(String(command.type))) {
    if (typeof command.message !== "string") return "A message is required";
    const message = command.message.trimStart();
    if (message.startsWith("!")) return "Direct shell commands bypass Agent approval and are disabled remotely";
    if (message.startsWith("/") && !/^\/approval-mode (?:auto|act|ask|plan)\s*$/.test(message)
      && !message.startsWith("/skill:")) return "This extension command requires local access";
  }
  return null;
}

/** An external Host must be explicitly listed, even when it is an IP literal. */
export function isRemoteHostConfigured(request: Request, allowed = process.env.PI_WEB_ALLOWED_HOSTS): boolean {
  const hostname = new URL("http://" + request.headers.get("host")).hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return true;
  return (allowed?.split(",") ?? []).some(value => {
    try { return new URL("http://" + value.trim()).hostname.toLowerCase() === hostname; }
    catch { return isIP(value.trim()) !== 0 && value.trim() === hostname; }
  });
}
