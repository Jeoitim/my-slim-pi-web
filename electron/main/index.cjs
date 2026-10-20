const { app, BrowserWindow, ipcMain, shell, clipboard, Tray, Menu, nativeImage, nativeTheme, session, dialog } = require("electron");
const { join, dirname, delimiter } = require("node:path");
const { pathToFileURL } = require("node:url");
const { DesktopService } = require("./service.cjs");
const { readSettings, writeSettings, validatePatch } = require("./settings.cjs");
const { assertSender, isAppUrl, externalLink } = require("./security.cjs");
const { version } = require("../../package.json");
const { existsSync } = require("node:fs");

const dev = process.argv.includes("--desktop-dev");
let window, tray, service, settings, quitting = false, quitReady = false;
let operations = Promise.resolve();
const settingsFile = () => join(app.getPath("userData"), "desktop-settings.json");
const errorPage = join(__dirname, "../ui/error.html");
const iconPath = app.isPackaged ? join(process.resourcesPath, "icon.png")
  : existsSync(join(__dirname, "../../.desktop/icons/icon.png")) ? join(__dirname, "../../.desktop/icons/icon.png")
    : join(__dirname, "../../public/icons/icon-192.png");
const serial = action => {
  const next = operations.then(action);
  operations = next.catch(() => {});
  return next;
};

// Test runs use disposable userData; installed app always uses Electron's per-user path.
if (process.env.PI_DESKTOP_TEST_USER_DATA) app.setPath("userData", process.env.PI_DESKTOP_TEST_USER_DATA);
app.setName("My Slim Pi Web");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (window) { window.show(); if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on("before-quit", event => {
    if (quitReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void serial(async () => { await service?.stop(); tray?.destroy(); quitReady = true; app.quit(); });
  });
  app.on("window-all-closed", () => { if (!(tray && service?.status.externalUrl)) app.quit(); });
  app.on("activate", () => { if (window) window.show(); });
  void app.whenReady().then(boot).catch(() => {
    dialog.showErrorBox("My Slim Pi Web", "Desktop settings or runtime could not be loaded. Your Agent data was not changed. Restore desktop-settings.json or reinstall the application.");
    app.quit();
  });
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  window = new BrowserWindow({
    width: 1280, height: 840, minWidth: 760, minHeight: 520, show: false,
    title: "My Slim Pi Web", backgroundColor: dark ? "#242424" : "#f5f5f5",
    icon: iconPath,
    titleBarStyle: "hidden",
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 14, y: 12 } }
      : { titleBarOverlay: { color: dark ? "#242424" : "#f5f5f5", symbolColor: dark ? "#e8e8e8" : "#1a1a1a", height: 36 } }),
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/index.cjs"), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: true,
      partition: "persist:pi-desktop", devTools: !app.isPackaged },
  });
  window.once("ready-to-show", () => { if (!quitting) window.show(); });
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  window.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url, service.origin)) return;
    event.preventDefault();
    const link = externalLink(url);
    if (link) void shell.openExternal(link);
  });
  window.webContents.on("will-redirect", (event, url) => { if (!isAppUrl(url, service.origin)) event.preventDefault(); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url, service.origin)) void window.loadURL(url);
    else {
      const parsed = (() => { try { return new URL(url); } catch { return null; } })();
      if (parsed?.origin === service.origin) {
        // Exports/previews get NO preload/IPC and cannot navigate into the privileged main window.
        const viewer = new BrowserWindow({ width: 1000, height: 760, parent: window, webPreferences: {
          nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
          javascript: false, partition: "persist:pi-desktop",
        } });
        const viewerId = viewer.webContents.id;
        viewers.add(viewerId);
        viewer.once("closed", () => viewers.delete(viewerId));
        viewer.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        viewer.webContents.on("will-navigate", event => event.preventDefault());
        void viewer.loadURL(url);
      } else {
        const link = externalLink(url);
        if (link) void shell.openExternal(link);
      }
    }
    return { action: "deny" };
  });
  window.on("close", event => {
    if (!quitting && tray && service.status.externalUrl) { event.preventDefault(); window.hide(); }
  });
  window.webContents.on("did-fail-load", (_event, code, _description, url, mainFrame) => {
    if (mainFrame && code !== -3 && url !== pathToFileURL(errorPage).href) void window.loadFile(errorPage);
  });
  window.on("enter-full-screen", () => window.webContents.send("desktop:fullscreen-changed", true));
  window.on("leave-full-screen", () => window.webContents.send("desktop:fullscreen-changed", false));
}
const viewers = new Set();
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "My Slim Pi Web", click: () => window?.show() },
    { label: `Service: ${service.status.phase}`, enabled: false },
    { label: "Open local Web", enabled: Boolean(service.status.externalUrl), click: () => void openWeb() },
    { label: "Retry local service", enabled: service.status.phase === "error", click: () => void serial(restart).catch(() => {}) },
    { type: "separator" }, { label: "Quit / 退出应用", click: () => app.quit() },
  ]));
}
async function openWeb() {
  if (service.status.phase !== "running" || !service.status.externalUrl) throw new Error("External control is not running");
  // This URL is generated by our bound listener; no renderer URL input is accepted.
  await shell.openExternal(service.status.externalUrl);
}
async function restart() {
  await service.stop();
  return connect();
}
async function connect(started = service.start()) {
  try {
    await started;
    if (settings.externalControl) {
      try { await service.configure(settings); } catch (error) { service.state({ error: error.message }); }
    }
    await window.loadURL(service.origin);
  } catch (error) { await window.loadFile(errorPage); throw error; }
}
async function boot() {
  settings = await readSettings(settingsFile());
  const root = app.isPackaged ? join(process.resourcesPath, "server") : join(__dirname, "../..");
  const node = app.isPackaged ? join(process.resourcesPath, "runtime", process.platform === "win32" ? "node.exe" : "node") : process.env.PI_DESKTOP_NODE;
  if (!node) throw new Error("Launch desktop development with npm run desktop:dev");
  // Make the bundled Node/npm available to SDK extensions without modifying the user's PATH.
  process.env.PATH = `${dirname(node)}${delimiter}${process.env.PATH ?? ""}`;
  service = new DesktopService({ node, root, dev, version,
    entry: app.isPackaged ? join(process.resourcesPath, "desktop-host/electron/server/index.cjs") : undefined });
  service.on("status", updateTray);
  // Start Node while Chromium creates its window and native menus.
  const started = service.start();
  void started.catch(() => {});
  createWindow();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "editMenu" }, { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen", accelerator: "F11" }] },
    { label: "App", submenu: [{ label: "Quit", accelerator: "CommandOrControl+Q", click: () => app.quit() }] },
  ]));
  const desktopSession = session.fromPartition("persist:pi-desktop");
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktopSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    delete headers["x-pi-desktop-token"];
    if ((details.webContentsId === window.webContents.id || viewers.has(details.webContentsId))
      && (details.url.startsWith(`${service.origin}/`)
        || details.url.startsWith(`${service.origin.replace("http:", "ws:")}/`))) headers["x-pi-desktop-token"] = service.token;
    callback({ requestHeaders: headers });
  });
  // Tray failure degrades to ordinary close-and-quit semantics.
  try {
    tray = new Tray(nativeImage.createFromPath(iconPath));
    tray.setToolTip("My Slim Pi Web"); tray.on("double-click", () => window?.show()); updateTray();
  } catch { tray = undefined; }
  registerIpc();
  await serial(() => connect(started)).catch(() => {});
}
function registerIpc() {
  const handle = (name, action) => ipcMain.handle(`desktop:${name}`, (event, ...args) => {
    assertSender(event, window, service.origin);
    return action(...args);
  });
  handle("settings", () => ({ ...settings }));
  handle("status", () => ({ ...service.status }));
  handle("update", patch => serial(async () => {
    const next = { ...settings, ...validatePatch(patch) };
    await service.configure(next);
    try { await writeSettings(settingsFile(), next); }
    catch (error) { await service.configure(settings); throw error; }
    settings = next;
    updateTray();
    return { ...settings };
  }));
  handle("open-web", openWeb);
  handle("copy-web", () => {
    if (!service.status.externalUrl || service.status.phase !== "running") throw new Error("External control is not running");
    clipboard.writeText(service.status.externalUrl);
  });
  handle("restart", () => serial(restart));
  handle("quit", () => { app.quit(); });
  handle("fullscreen", () => { window.setFullScreen(!window.isFullScreen()); });
  handle("colors", colors => {
    if (!colors || !/^#[a-f0-9]{6}$/i.test(colors.background) || !/^#[a-f0-9]{6}$/i.test(colors.foreground)) throw new Error("Invalid title bar colors");
    if (process.platform !== "darwin") window.setTitleBarOverlay({ color: colors.background, symbolColor: colors.foreground, height: 36 });
    window.setBackgroundColor(colors.background);
  });
  ipcMain.handle("desktop:retry", event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.url !== pathToFileURL(errorPage).href) throw new Error("Retry access denied");
    return serial(restart);
  });
}
