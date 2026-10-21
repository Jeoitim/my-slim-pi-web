const { contextBridge, ipcRenderer } = require("electron");

// No generic invoke/send, URL opener, filesystem or shell capability crosses this bridge.
contextBridge.exposeInMainWorld("piDesktop", Object.freeze({
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("desktop:settings"),
  writeClipboardText: text => ipcRenderer.invoke("desktop:clipboard-write", text),
  paste: () => ipcRenderer.invoke("desktop:paste"),
  getStatus: () => ipcRenderer.invoke("desktop:status"),
  updateSettings: patch => ipcRenderer.invoke("desktop:update", patch),
  openLocalWeb: () => ipcRenderer.invoke("desktop:open-web"),
  copyLocalWebUrl: () => ipcRenderer.invoke("desktop:copy-web"),
  restartService: () => ipcRenderer.invoke("desktop:restart"),
  retryService: () => ipcRenderer.invoke("desktop:retry"),
  quit: () => ipcRenderer.invoke("desktop:quit"),
  toggleFullScreen: () => ipcRenderer.invoke("desktop:fullscreen"),
  setTitleBarColors: colors => ipcRenderer.invoke("desktop:colors", colors),
}));
