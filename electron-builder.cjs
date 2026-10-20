module.exports = {
  appId: "io.github.jeoitim.my-slim-pi-web",
  productName: "My Slim Pi Web",
  electronDist: "node_modules/electron/dist",
  directories: { app: ".desktop/app", output: "dist-desktop", buildResources: ".desktop/icons" },
  extraMetadata: { main: "electron/main/index.cjs" },
  files: ["electron/main/**", "electron/preload/**", "electron/server/**", "electron/ui/**", "package.json"],
  extraResources: [
    { from: ".desktop/server", to: "server" },
    { from: ".desktop/runtime", to: "runtime" },
    { from: "electron/server", to: "desktop-host/electron/server" },
    { from: "electron/main/settings.cjs", to: "desktop-host/electron/main/settings.cjs" },
    { from: ".desktop/icons/icon.png", to: "icon.png" },
  ],
  // Backend native modules run in the independent Node runtime, outside ASAR.
  asar: true, npmRebuild: false, nodeGypRebuild: false,
  win: { target: [{ target: "nsis", arch: ["x64"] }], executableName: "MySlimPiWeb", icon: ".desktop/icons/icon.ico" },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false,
    createDesktopShortcut: true, createStartMenuShortcut: true, runAfterFinish: false },
  linux: { target: [{ target: "AppImage", arch: ["x64"] }], category: "Development", icon: ".desktop/icons/icon.png" },
  mac: { target: ["dmg"], category: "public.app-category.developer-tools" },
};
