import { isIP } from "node:net";
import { verify } from "node:crypto";

/** Only desktop listeners hold the private signing key; subprocesses see a public key. */
export function desktopIngress(request: Request, publicKey = process.env.PI_DESKTOP_INGRESS_PUBLIC_KEY): "internal" | "external" | null {
  if (!publicKey) return null;
  const match = /^(internal|external)\.([A-Za-z0-9+/=]+)$/.exec(request.headers.get("x-pi-desktop-ingress") ?? "");
  if (!match) return null;
  try {
    return verify(null, Buffer.from(`pi-desktop-v1:${match[1]}`), {
      key: Buffer.from(publicKey, "base64"), format: "der", type: "spki",
    }, Buffer.from(match[2], "base64")) ? match[1] as "internal" | "external" : null;
  } catch { return null; }
}

export function isRemoteRequest(request: Request, environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.PI_DESKTOP_INGRESS_PUBLIC_KEY) {
    return desktopIngress(request, environment.PI_DESKTOP_INGRESS_PUBLIC_KEY) !== "internal";
  }
  if (environment.PI_WEB_REMOTE === "1") return true;
  try {
    const hostname = new URL("http://" + request.headers.get("host")).hostname.toLowerCase();
    return !["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch { return true; }
}

// Browser features use the same backend on both desktop ingress paths. Keep
// this list explicit so a newly added API is reviewed before public exposure.
// Native DesktopSettings use IPC and are intentionally absent from this map.
const REMOTE_API_ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/api\/(?:app-update|auth\/providers|cache-miss-notices|cwd\/browse|file-index|git\/(?:status|diff)|home|mcp|models|models-config|models-config\/catalog|models\/enabled|my-slim-pi\/settings|plugins|project-trust|push\/config|skills|skills\/content|subagents\/profiles|subagents\/settings|tools\/settings|web-auth|worktrees)$/, "GET"],
  [/^\/api\/(?:agent\/running|sessions|sessions\/search|sessions\/ui-state|terminal\/shells)$/, "GET"],
  [/^\/api\/(?:agent\/[^/]+(?:\/bash-output|\/events)?|mcp\/sign-in\/[^/]+|sessions\/[^/]+(?:\/context|\/export|\/state)?|sessions\/[^/]+\/entries\/[^/]+\/(?:thinking|tool-result-image)|subagents\/[^/]+|terminal\/[^/]+(?:\/events)?|auth\/login\/[^/]+)$/, "GET"],
  [/^\/api\/files\/.+$/, "GET,POST"],
  [/^\/api\/(?:agent\/new|cwd\/browse|cwd\/validate|default-cwd|mcp|mcp\/sign-in|mcp\/test|models\/refresh|models-config\/discover|models-config\/test|plugins|plugins\/check|project-trust|provider-usage\/query|push\/subscribe|sessions\/delete|sessions\/stats|sessions\/ui-state|skills\/check|skills\/install|skills\/search|skills\/update|terminal|web-auth|worktrees)$/, "POST"],
  [/^\/api\/(?:agent\/[^/]+(?:\/lease)?|auth\/(?:api-key|login|logout)\/[^/]+|mcp\/sign-in\/[^/]+|sessions\/[^/]+\/(?:auto-name|fork)|subagents\/[^/]+|terminal\/[^/]+)$/, "POST"],
  [/^\/api\/(?:cache-miss-notices|models\/default|models\/enabled|models-config|my-slim-pi\/settings|subagents\/profiles|subagents\/settings|tools\/settings)$/, "PUT"],
  [/^\/api\/(?:sessions\/[^/]+|skills|subagents\/profiles)$/, "PATCH"],
  [/^\/api\/(?:auth\/api-key\/[^/]+|mcp\/sign-in\/[^/]+|sessions\/[^/]+|subagents\/profiles|terminal\/[^/]+|web-auth|worktrees)$/, "DELETE"],
];

/** Unknown routes and methods remain closed to remote requests. */
export function isRemoteApiAllowed(pathname: string, method: string): boolean {
  return REMOTE_API_ROUTES.some(([route, methods]) => route.test(pathname) && methods.split(",").includes(method));
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
