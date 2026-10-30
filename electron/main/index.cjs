const { app, BrowserWindow, ipcMain, shell, clipboard, Tray, Menu, nativeImage, nativeTheme, session, dialog, safeStorage } = require("electron");
const { join, dirname, delimiter } = require("node:path");
const { pathToFileURL } = require("node:url");
const { DesktopService } = require("./service.cjs");
const { appendStartupRecord } = require("./startup-log.cjs");
const { DesktopWebPassword, validateWebPassword } = require("./web-password.cjs");
const { readSettings, writeSettings, validatePatch } = require("./settings.cjs");
const { assertSender, isAppUrl, externalLink } = require("./security.cjs");
const { validateClipboardText } = require("./clipboard.cjs");
const { historyUrl, openHistoryViewer } = require("./history-viewer.cjs");
const { version } = require("../../package.json");
const { existsSync } = require("node:fs");

const dev = process.argv.includes("--desktop-dev");
let window, tray, service, settings, webPassword, quitting = false, quitReady = false, allowWindowClose = false;
let closePrompt = null, quitPrompt = null;
let operations = Promise.resolve();
const settingsFile = () => join(app.getPath("userData"), "desktop-settings.json");
const loadingPage = join(__dirname, "../ui/loading.html");
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
  app.on("second-instance", showWindow);
  app.on("before-quit", event => {
    if (quitReady) return;
    event.preventDefault();
    if (quitting) return;
    void promptQuit();
  });
  app.on("window-all-closed", () => { if (!(tray && service?.status.externalUrl)) app.quit(); });
  app.on("activate", showWindow);
  void app.whenReady().then(boot).catch(() => {
    dialog.showErrorBox("My Slim Pi Web", "Desktop settings or runtime could not be loaded. Your Agent data was not changed. Restore desktop-settings.json or reinstall the application.");
    app.quit();
  });
}

function showWindow() {
  if (quitting || !window || window.isDestroyed()) return;
  window.show();
  if (window.isMinimized()) window.restore();
  window.focus();
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
    else if (historyUrl(url, service.origin)) openHistoryViewer({ BrowserWindow, session, parent: window, url, origin: service.origin, token: service.token });
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
    if (quitting || allowWindowClose) return;
    event.preventDefault();
    void requestWindowClose();
  });
  window.webContents.on("did-fail-load", (_event, code, _description, url, mainFrame) => {
    if (mainFrame && code !== -3 && url !== pathToFileURL(errorPage).href
      && url !== pathToFileURL(loadingPage).href && service?.status.phase === "running") {
      void window.loadFile(errorPage);
    }
  });
  window.on("enter-full-screen", () => window.webContents.send("desktop:fullscreen-changed", true));
  window.on("leave-full-screen", () => window.webContents.send("desktop:fullscreen-changed", false));
  // A native startup surface appears immediately, before Next.js or extensions load.
  void window.loadFile(loadingPage);
}
const viewers = new Set();
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "My Slim Pi Web", click: showWindow },
    { label: `Service: ${service.status.phase}`, enabled: false },
    { label: "Open local Web", enabled: Boolean(service.status.externalUrl), click: () => void openWeb() },
    { label: "Retry local service", enabled: service.status.phase === "error", click: () => void serial(restart).catch(() => {}) },
    { type: "separator" }, { label: "Quit / 退出应用", click: () => app.quit() },
  ]));
}

function inactiveWork() {
  return { active: false, runningSessionIds: [], awaitingInputSessionIds: [], backgroundSessionIds: [] };
}

async function readActiveWork() {
  if (!service) return inactiveWork();
  try {
    return await service.activeWork();
  } catch {
    // If the service is up but its task snapshot cannot be read, err on the
    // side of preserving work instead of silently killing it.
    return { ...inactiveWork(), active: service.status.phase === "running", unknown: true };
  }
}

function activeWorkDetail(work, canBackground = true) {
  if (work.unknown) return canBackground
    ? "无法读取任务状态；仍可选择让应用留在后台。 / Task state is unavailable; the app can still stay in the background."
    : "无法读取任务状态。退出会停止本地后端和可能仍在运行的任务。 / Task state is unavailable; quitting stops the local backend and any work still running.";
  const running = new Set([...(work.runningSessionIds ?? []), ...(work.awaitingInputSessionIds ?? [])]);
  const background = new Set(work.backgroundSessionIds ?? []);
  const parts = [];
  if (running.size > 0) parts.push(`${running.size} 个回合正在运行或等待输入`);
  if (background.size > 0) parts.push(`${background.size} 个后台代理仍在工作`);
  return parts.length > 0 ? parts.join("；") : "仍有 Agent 工作尚未结束。";
}

function showBackgroundNotice(work) {
  if (!tray || process.platform !== "win32" || typeof tray.displayBalloon !== "function") return;
  try {
    tray.displayBalloon({
      title: "My Slim Pi Web",
      content: `${activeWorkDetail(work)} 应用仍在系统托盘运行。`,
    });
  } catch {
    // A missing Windows notification service must not change task execution.
  }
}

async function requestWindowClose() {
  if (closePrompt) return closePrompt;
  closePrompt = (async () => {
    const work = await readActiveWork();
    if (!work.active) {
      if (tray && service?.status.externalUrl) { window.hide(); return; }
      allowWindowClose = true;
      // Leave the close-event stack before asking again, so the second event
      // is a fresh, allowed close rather than a synchronous re-entry.
      setImmediate(() => window.close());
      return;
    }
    const canBackground = Boolean(tray);
    const buttons = canBackground
      ? ["继续在后台", "停止任务并退出", "取消"]
      : ["停止任务并退出", "取消"];
    const result = await dialog.showMessageBox(window, {
      type: "question",
      title: "任务仍在运行",
      message: "关闭窗口会影响正在运行的 Agent 工作。",
      detail: `${activeWorkDetail(work, canBackground)}\n\n${canBackground
        ? "选择“继续在后台”会保留后端和所有任务；只有“停止任务并退出”会中断它们。"
        : "当前没有可用的系统托盘；“停止任务并退出”会中断它们。"}`,
      buttons,
      defaultId: canBackground ? 0 : 1,
      cancelId: buttons.length - 1,
      noLink: true,
    });
    if (canBackground && result.response === 0) {
      window.hide();
      showBackgroundNotice(work);
      return;
    }
    if (result.response === (canBackground ? 1 : 0)) await stopAndQuit();
  })().finally(() => { closePrompt = null; });
  return closePrompt;
}

async function promptQuit() {
  if (quitPrompt) return quitPrompt;
  quitPrompt = (async () => {
    const work = await readActiveWork();
    if (!work.active) return stopAndQuit();
    const result = await dialog.showMessageBox(window, {
      type: "warning",
      title: "停止任务并退出？",
      message: "仍有 Agent 工作尚未结束。",
      detail: `${activeWorkDetail(work, false)}\n\n退出应用会停止本地后端，并中断正在运行的任务、审批等待和后台代理。`,
      buttons: ["停止任务并退出", "取消"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) await stopAndQuit();
  })().finally(() => { quitPrompt = null; });
  return quitPrompt;
}

async function showLoadingPage() {
  if (!window || window.isDestroyed()) return;
  await window.loadFile(loadingPage).catch(() => {});
}

async function showFailurePage() {
  if (!window || window.isDestroyed()) return;
  await window.loadFile(errorPage).catch(() => {});
}

async function stopAndQuit() {
  if (quitting) return;
  quitting = true;
  try {
    await serial(async () => { await service?.stop(); tray?.destroy(); });
  } finally {
    quitReady = true;
    app.quit();
  }
}

async function openWeb() {
  if (service.status.phase !== "running" || !service.status.externalUrl) throw new Error("External control is not running");
  // This URL is generated by our bound listener; no renderer URL input is accepted.
  await shell.openExternal(service.status.externalUrl);
}
async function restart() {
  await showLoadingPage();
  await service.stop();
  service.setPassword(await webPassword.load());
  return connect();
}
async function confirmPasswordRestart() {
  const work = await readActiveWork();
  if (!work.active) return true;
  const result = await dialog.showMessageBox(window, {
    type: "warning", title: "应用 Web 密码 / Apply Web password",
    message: "重启后端以应用密码？ / Restart the local service?",
    detail: `${activeWorkDetail(work, false)}\n\n这会中断当前任务、终端和待处理审批。 / Active tasks, terminals and approvals will be interrupted.`,
    buttons: ["继续并重启 / Continue and restart", "取消 / Cancel"], defaultId: 1, cancelId: 1, noLink: true,
  });
  return result.response === 0;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function loadApplication() {
  let lastError;
  for (let attempt = 0; attempt < 20 && !quitting; attempt++) {
    if (service.status.phase !== "running" || !service.origin) {
      throw lastError ?? new Error("Local service is not ready");
    }
    try {
      await window.loadURL(service.origin);
      return;
    } catch (error) {
      lastError = error;
      await wait(Math.min(1000, 100 + attempt * 100));
    }
  }
  throw lastError ?? new Error("Local Web UI could not be opened");
}
async function connect(started = service.start()) {
  try {
    await started;
    if (settings.externalControl) {
      try { await service.configure(settings); } catch (error) { service.state({ error: error.message }); }
    }
    await loadApplication();
  } catch (error) { await showFailurePage(); throw error; }
}
async function boot() {
  settings = await readSettings(settingsFile());
  webPassword = new DesktopWebPassword({ file: join(app.getPath("userData"), "desktop-web-password.bin"), safeStorage });
  const password = await webPassword.load();
  const root = app.isPackaged ? join(process.resourcesPath, "server") : join(__dirname, "../..");
  const node = app.isPackaged ? join(process.resourcesPath, "runtime", process.platform === "win32" ? "node.exe" : "node") : process.env.PI_DESKTOP_NODE;
  if (!node) throw new Error("Launch desktop development with npm run desktop:dev");
  // Make the bundled Node/npm available to SDK extensions without modifying the user's PATH.
  process.env.PATH = `${dirname(node)}${delimiter}${process.env.PATH ?? ""}`;
  service = new DesktopService({ node, root, dev, version, password,
    entry: app.isPackaged ? join(process.resourcesPath, "desktop-host/electron/server/index.cjs") : undefined });
  let loggedStartup;
  service.on("status", status => {
    updateTray();
    if (status.phase === "running" && status.startup && status.startup !== loggedStartup) {
      loggedStartup = status.startup;
      void appendStartupRecord(app.getPath("userData"), status).catch(() => {});
    }
  });
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
    tray.setToolTip("My Slim Pi Web"); tray.on("double-click", showWindow); updateTray();
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
  handle("clipboard-write", text => clipboard.writeText(validateClipboardText(text)));
  // Deliver the real paste event (text/images) to the focused editor/xterm.
  // No unrestricted clipboard-reading bridge is exposed to the renderer.
  handle("paste", () => { window.webContents.paste(); });
  handle("status", async () => ({ ...service.status, webPassword: await webPassword.status() }));
  handle("web-password-set", value => serial(async () => {
    validateWebPassword(value);
    if (webPassword.environmentControlled()) throw new Error("PASSWORD_ENVIRONMENT_CONTROLLED");
    if (!await webPassword.available()) throw new Error("PASSWORD_STORAGE_UNAVAILABLE");
    if (!await confirmPasswordRestart()) return false;
    await webPassword.save(value);
    await restart();
    return true;
  }));
  handle("web-password-remove", () => serial(async () => {
    if (!webPassword.saved) return false;
    if (webPassword.environmentControlled()) { await webPassword.remove(); return true; }
    if (!await confirmPasswordRestart()) return false;
    const previous = settings;
    const next = { ...settings, externalControl: false };
    await writeSettings(settingsFile(), next);
    try { await webPassword.remove(); }
    catch (error) { await writeSettings(settingsFile(), previous); throw error; }
    settings = next;
    await restart();
    return true;
  }));
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
    return clipboard.writeText(service.status.externalUrl);
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
