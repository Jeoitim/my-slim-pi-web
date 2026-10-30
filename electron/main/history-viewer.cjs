const { randomUUID } = require("node:crypto");

// The SDK export renders its embedded session data with inline JavaScript.
// It needs no application APIs, external resources, preload or shared cookies.
const HISTORY_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-downloads";

function historyUrl(value, origin) {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.searchParams.get("inline") !== "1"
      || !/^\/api\/sessions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/export$/i.test(url.pathname)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

function historyRequestAllowed(details, url, viewerId) {
  return details.webContentsId === viewerId && details.method === "GET"
    && details.resourceType === "mainFrame" && details.url === url;
}

function openHistoryViewer({ BrowserWindow, session, parent, url, origin, token }) {
  const target = historyUrl(url, origin);
  if (!target) throw new Error("Invalid history URL");
  const isolated = session.fromPartition(`pi-history-${randomUUID()}`);
  isolated.setPermissionCheckHandler(() => false);
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const viewer = new BrowserWindow({ width: 1000, height: 760, parent, show: false, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
    javascript: true, session: isolated,
  } });
  const id = viewer.webContents.id;
  const allowed = details => historyRequestAllowed(details, target, id);
  const appCookies = parent.webContents.session.cookies;
  isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowed(details) }));
  isolated.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).filter(([key]) => !["x-pi-desktop-token", "authorization", "cookie"].includes(key.toLowerCase())));
    if (!allowed(details)) return callback({ cancel: true });
    headers["x-pi-desktop-token"] = token;
    // Reuse only the login proof for this exact document request. It never
    // enters the viewer's cookie jar or its opaque-origin script context.
    void appCookies.get({ url: target, name: "pi_web_session" }).then(cookies => {
      if (cookies.length) headers.Cookie = `pi_web_session=${cookies[0].value}`;
      callback({ requestHeaders: headers });
    }, () => callback({ cancel: true }));
  });
  isolated.webRequest.onHeadersReceived((details, callback) => {
    const headers = Object.fromEntries(Object.entries(details.responseHeaders ?? {}).filter(([key]) => key.toLowerCase() !== "content-security-policy"));
    headers["Content-Security-Policy"] = [HISTORY_CSP];
    callback({ responseHeaders: headers });
  });
  viewer.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  viewer.webContents.on("will-attach-webview", event => event.preventDefault());
  viewer.webContents.on("will-navigate", event => event.preventDefault());
  viewer.webContents.on("will-redirect", event => event.preventDefault());
  viewer.once("ready-to-show", () => { if (!viewer.isDestroyed()) viewer.show(); });
  viewer.once("closed", () => {
    isolated.webRequest.onBeforeRequest(null);
    isolated.webRequest.onBeforeSendHeaders(null);
    isolated.webRequest.onHeadersReceived(null);
    void isolated.clearStorageData().catch(() => {});
  });
  void viewer.loadURL(target).catch(() => {});
  return viewer;
}

module.exports = { historyUrl, historyRequestAllowed, openHistoryViewer };
