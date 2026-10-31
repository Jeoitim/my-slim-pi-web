# Windows 安装修复验证

> **状态（2026-10-31）：已定位并修复，本机真实 `.1 → .2` 升级通过。** 上一轮“仍失败”的 `.2`（`c839…`）保留为证据；本轮版本未递增，仍为 **0.13.0-jeoitim.2**。修复针对用户机器上那份真实 `.1` 卸载器，而不是重编的隔离替身。

## 旧卸载链路：根因与证据

用户安装目录 `%LOCALAPPDATA%\Programs\MySlimPiWeb` 中的 `.1` payload 在 `resources/server` 下带有嵌套构建产物：

- `resources/server/.desktop/server/...`（其中再含 `dist-desktop/win-unpacked/...`）
- `resources/server/dist-desktop/...`
- `resources/server/.local/...`

旧卸载器以 `--updated` 运行时，stock `un.atomicRMDir` 会把文件镜像到 `$PLUGINSDIR/old-install`。最深镜像目录达到 **250 字符**；`CreateDirectoryW` 在超过 **248 字符**时失败（`ERROR_FILENAME_EXCED_RANGE` / 206），随后的 `Rename` 失败（`ERROR_PATH_NOT_FOUND` / 3），section `Abort`，卸载器返回 **2**。外层 `uninstallOldVersion` 重试 5 次后显示 `$(appCannotBeClosed)`；取消后 `handleUninstallResult` 显示 `$(uninstallFailed): 2`，与用户看到的“应用无法关闭”及退出提示吻合。

复现与排除：

- 真实旧卸载器：161,102 字节，SHA-256 `e497ffbd90516276012d28b72750443b6d7cdd67a2555a86d19288a73ac0978c`，FileVersion `0.13.0-jeoitim.1`；原安装 16,081 个文件。
- 直接执行 `/S /KEEP_APP_DATA /currentuser --updated _?=...`：exit **2**，约 18 秒；16,081 个文件、HKCU 登记和快捷方式均保留（restore 后中止）。
- `_?=` 不能隔离副本：`un.onInit` 的 `initMultiUser` 会用 `HKCU\Software\a8955933-…\InstallLocation` 覆盖 `$INSTDIR`。测试副本必须临时改登记值并恢复，否则仍操作真实安装和产品登记。
- 单独复制一个根目录文件、或只放全部根目录文件（18 个，335 MB）：exit 0；排除“进程占用/文件本身不可重命名”。
- Win32 复刻 `un.atomicRMDir`：在 `...\.desktop\server\...\upstream013-agent\mcp.json` 处 `CreateDirectory` 返回 206、`MoveFileEx` 返回 3，最大目标目录 250。
- 删除三个旧构建产物子树后，同一真实旧卸载器对副本 exit **0**，并删除副本、两个 HKCU 键和快捷方式。

## 修复

- `electron/installer/app-processes.ps1` 新增 `-Action RepairLegacy`。仅当 `resources/server/.desktop/server/dist-desktop` 或 `resources/server/dist-desktop` 存在时，删除三个已知旧构建产物子树；使用 `\\?\` / `\\?\UNC\` 长路径，拒绝 reparse point，路径必须位于 `resources/server` 下。日志写入 `%TEMP%\pi-installer-legacy-repair.log`。成功（含无旧树）exit 1，失败 exit 2。
- `electron/installer/process-check.nsh` 的 `customCheckAppRunning` 在进程检查之后、`uninstallOldVersion` 之前调用仅安装器编译的 `PiRepairLegacyInstall`。修复失败显示独立的中/英/繁提示并退出 2，不再进入 5 次旧卸载重试。新 `.2` 卸载器不编译此修复。
- `electron/scripts/installer-legacy-repair.ps1` 回归：PowerShell 5.1/7、深层路径、保留 `keep.txt` 与 `.desktop/next`、无特征空 `.desktop/server` 不误删、junction 拒绝。

## 真实升级验证

1. 先对真实旧卸载器复现 exit 2（见上）。
2. 同一旧二进制对清理后的副本 exit 0。
3. 第一次 medium 运行：repair 日志确认三个旧子树已删除；但旧卸载器被复制到当时的 low 标签临时目录，无法操作 medium 安装，exit 2。
4. 将短临时目录改回 medium 后重跑：exit **0**，100.5 秒（旧树已不存在，repair 为 no-op）。
5. 安装后 16,040 个文件、840,470,511 字节；`DisplayVersion` = `0.13.0-jeoitim.2`；卸载器 FileVersion `.2`，SHA-256 `0038c6e808685433c665e32f6b6a8c958044f8cd85ac857c961b456ca53393d4`；无旧嵌套路径；桌面与开始菜单快捷方式存在。
6. 启动安装后的 `MySlimPiWeb.exe`：窗口出现；`startup-history.json` 更新，`backendReadyMs` 7,073、`healthReadyMs` 7,109；关闭后无残留进程。

## 本地安装包

`dist-desktop/My.Slim.Pi.Web.Setup.0.13.0-jeoitim.2.exe`

- 大小：**291,690,962** 字节
- SHA-256：`ab9ee22e14c7602f2f10e2e5994e57ef1a221c6913647db95d8adfd4fb279283`
- Web BUILD_ID：`a_5_tZs-pzarHFdycEvcd`
- 同名 `.exe.sha256` 已更新。
- 内嵌 `Uninstall MySlimPiWeb.exe`：141,490 字节，FileVersion `.2`，`0038c6…`；安装后实际文件与内嵌文件哈希一致。
- 内嵌 `$PLUGINSDIR\pi-app-processes.ps1` 2,414 字节，包含 `RepairLegacy`。
- `app-64.zip` 291,330,392 字节；抽查无 `resources/server/.desktop/server`、`dist-desktop` 或 `.local`。
- 失败的上一版 `.2` 保留在 `dist-desktop/previous/failed-jeoitim.2-c83917a4/`：291,696,271 字节，`c83917a4b220491c6dcb0c2e3b3d333fbb97e13655fc11f69adf7ab0e195a269`。不要误交付。

## 隔离回归（此前，仅作回归）

旧版升级、同版本重装、无登记残留修复三场景（16,035 个资源）及最小载荷缓存三场景仍保留在 `electron/scripts/installer-upgrade-check.mjs` 与 `installer-process-check.ps1`；它们使用随机标识/目录，不能替代真实旧二进制或真实登记。本轮新增的修复验证以真实 `.1` 二进制、真实安装目录和真实升级为准。

## 构建环境注意

本机 electron-builder 26.15.3 在 `computeScriptAndSignUninstaller` 中运行 `BUILD_UNINSTALLER` 中间安装器时，只传 `{ __COMPAT_LAYER: "RunAsInvoker" }`；Windows 分支的 `getProcessEnv` 用它替换整个环境，NSIS 丢失 `TEMP/TMP`，报 `Error writing temporary file`。本次用临时 `--import` 预加载把 `process.env` 合并进该次 exec 完成打包；未修改 `node_modules`，未提交该补丁。若重现该错误，先检查环境传递。

工作区产物会继承 **Low Mandatory Level**。安装包保持 Low 时，用户正常双击会在 NSIS 初始化阶段报 `Error writing temporary file. Make sure your temp folder is valid.`，界面尚未出现；这与旧卸载 exit 2 不同。已对 `dist-desktop` 包执行 `icacls … /setintegritylevel M`，并在 `C:\Users\timrt\Downloads` 保留同哈希副本（`ab9ee22e…`）。随后用该包做真实同版本重装：exit 0，116.5 秒，安装仍为 `.2`、16,040 个文件、卸载器 `0038c6…`，GUI 初始化正常。

受限 shell 中测试安装器时，`TEMP/TMP` 必须是安装器可写的短路径；旧卸载器镜像路径仍受 248/260 限制。最终测试使用 `C:\Users\timrt\AppData\Local\T`（medium 标签，30 字符），避免把旧卸载器复制到 low 标签临时目录而无法操作 medium 安装。

## 清理

沿用 `pwsh -NoProfile -File ./clean-local.ps1` 预览与 `-Execute`，不重写通用脚本；保留 `dist-desktop` 安装包、校验文件和 `.desktop` 之外的配置。临时证据目录、测试副本与 fixture 在记录结论后清理。没有推送、发布或改 GitHub Release。
