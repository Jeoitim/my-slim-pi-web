# Windows 安装失败交接（已定位并修复）

## 结果

`.1 → .2` 的真实升级已在本机通过：旧卸载器先复现 exit 2，清理旧构建产物后同一旧卸载器 exit 0；最终 `.2` 安装器在真实 `.1` 安装上静默升级 exit 0，注册表、快捷方式、安装文件与卸载器均更新为 `.2`，安装后的应用启动并完成 backend ready。版本保持 `0.13.0-jeoitim.2`。

这不是隔离测试的推断：旧二进制是用户实际安装目录中的那份，真实旧卸载器的失败与修复都直接复现过。

## 根因

`0.13.0-jeoitim.1` 的 payload 在 `resources/server` 下带有嵌套构建产物：

- `resources/server/.desktop/server/...`（其中再含 `dist-desktop/win-unpacked/...`）
- `resources/server/dist-desktop/...`
- `resources/server/.local/...`

旧安装器调用 stock electron-builder 卸载器时带 `--updated`，`un.atomicRMDir` 会把每个文件先镜像到 `$PLUGINSDIR/old-install`。最深镜像目录达到 **250 字符**；Windows `CreateDirectoryW` 在超过 **248 字符**时失败（`ERROR_FILENAME_EXCED_RANGE` 206），随后的 `Rename` 失败（`ERROR_PATH_NOT_FOUND` 3），section `Abort`，卸载器返回 **2**。外层 `uninstallOldVersion` 重试 5 次后显示 `$(appCannotBeClosed)`；用户取消后 `handleUninstallResult` 显示 `$(uninstallFailed): 2`。

证据：

- 真实旧卸载器：`Uninstall MySlimPiWeb.exe`，161,102 字节，SHA-256 `e497ffbd90516276012d28b72750443b6d7cdd67a2555a86d19288a73ac0978c`，FileVersion `0.13.0-jeoitim.1`。
- 直接按安装器参数执行（`/S /KEEP_APP_DATA /currentuser --updated _?=...`）：exit **2**，约 18 秒，16,081 个文件、HKCU 两个键、两个快捷方式均保留（restore 后中止）。
- 复制旧卸载器或传 `_?=<副本>` 不能把它隔离到副本：`un.onInit` 的 `initMultiUser` 会用 `HKCU\Software\a8955933-…\InstallLocation` 覆盖 `$INSTDIR`。测试副本必须临时改该登记值，结束后恢复；否则实际操作的仍是真实安装和产品登记。
- 同样的单文件 / 仅根目录文件测试 exit 0；说明不是进程占用或文件本身。
- Win32 复刻 `atomicRMDir`：在 `.desktop\server\...\upstream013-agent\mcp.json` 处 `CreateDirectory` 返回 206、`MoveFileEx` 返回 3；最大目标目录 250。
- 删掉三个旧构建产物子树后，同一真实旧卸载器对副本 exit **0**，删除副本、两个注册表键和快捷方式。

## 修复

- `electron/installer/app-processes.ps1`：新增 `-Action RepairLegacy`。仅当 `resources/server/.desktop/server/dist-desktop` 或 `resources/server/dist-desktop` 存在（`.1` 的特征）时，删除三个已知旧构建产物子树；使用 `\\?\`/`\\?\UNC\` 长路径，拒绝 reparse point，校验路径必须位于 `resources/server` 下。日志：`%TEMP%\pi-installer-legacy-repair.log`。成功（包括无旧树）exit 1，失败 exit 2。
- `electron/installer/process-check.nsh`：`customCheckAppRunning` 在进程检查后、`uninstallOldVersion` 之前调用仅安装器编译的 `PiRepairLegacyInstall`。修复失败时显示独立文案（中/英/繁）并 exit 2，不再落入旧的 5 次重试 / “应用无法关闭”。
- 新 `.2` 卸载器不编译该修复；它只保留原有进程检查。新 payload 本身干净，不再生成这些嵌套目录。
- 回归：`electron/scripts/installer-legacy-repair.ps1`（PowerShell 5.1/7、深层路径、保留 `keep.txt`/`.desktop/next`、无特征空 `.desktop/server` 不误删、junction 拒绝）。

## 真实升级验证

1. 旧卸载器直接执行：exit 2（复现）。
2. 修复旧树后，同一旧卸载器对副本：exit 0。
3. 第一次 medium 运行：repair 日志确认三个旧子树已删除；但旧卸载器被复制到当时的 low 标签临时目录，无法操作 medium 安装，exit 2。
4. 将短临时目录改回 medium 后重跑：exit 0，100.5 秒（旧树已不存在，repair 为 no-op）；安装后文件 16,040、840,470,511 字节。
5. 安装后：DisplayVersion `0.13.0-jeoitim.2`；卸载器 FileVersion `.2`，SHA-256 `0038c6e808685433c665e32f6b6a8c958044f8cd85ac857c961b456ca53393d4`；无旧嵌套路径；桌面/开始菜单快捷方式存在。
6. 启动安装后的 `MySlimPiWeb.exe`：窗口出现，`startup-history.json` 更新，`backendReadyMs` 7,073、`healthReadyMs` 7,109；关闭后无残留进程。

## 当前产物

- 安装包：`dist-desktop/My.Slim.Pi.Web.Setup.0.13.0-jeoitim.2.exe`
- 大小：**291,690,962** 字节
- SHA-256：`ab9ee22e14c7602f2f10e2e5994e57ef1a221c6913647db95d8adfd4fb279283`
- Web BUILD_ID：`a_5_tZs-pzarHFdycEvcd`
- 同名 `.exe.sha256` 已更新。
- 失败的旧包保留在 `dist-desktop/previous/failed-jeoitim.2-c83917a4/`：291,696,271 字节，SHA-256 `c83917a4b220491c6dcb0c2e3b3d333fbb97e13655fc11f69adf7ab0e195a269`。不要误交付。

## 构建环境注意

本机 electron-builder 26.15.3 在 `computeScriptAndSignUninstaller` 中通过 `WineVmManager.exec` 运行 `BUILD_UNINSTALLER` 中间安装器时，只传 `{ __COMPAT_LAYER: "RunAsInvoker" }`；Windows 分支的 `getProcessEnv` 会用它**替换**整个环境，导致 NSIS 丢失 `TEMP/TMP`，报 “Error writing temporary file”。本次用临时 `--import` 预加载把 `process.env` 合并进该次 exec 后才完成打包；未修改 node_modules，也未提交该预加载。若下次打包重现该错误，先查这一点。

另外，在受限/低完整性 shell 中测试安装器时，必须把 `TEMP/TMP` 指到安装器可写的短路径；本次最终测试用 `C:\Users\timrt\AppData\Local\T`（medium 标签，30 字符），避免旧卸载器镜像路径再次逼近 248/260 限制，也避免把旧卸载器复制到 low 标签临时目录后无法操作 medium 安装。

## 代码入口

- `electron/installer/process-check.nsh`：`PiRepairLegacyInstall`、`customCheckAppRunning`。
- `electron/installer/app-processes.ps1`：`RepairLegacy`、`ClearCache`、`Check`/`Stop`。
- `electron/scripts/installer-legacy-repair.ps1`：回归。
- `node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh`：`uninstallOldVersion` / `handleUninstallResult`（未改）。
- `node_modules/app-builder-lib/templates/nsis/uninstaller.nsh`：stock `un.atomicRMDir`（未改）。

## 边界

- 没有推送、发布或改 GitHub Release。
- 没有修改用户数据（AgentRoot/设置）；升级只替换程序文件和产品登记。
- 其他机器/其他旧 payload 变体未逐一验证；修复只匹配已复现的 `.1` 特征，不认识的树保持原样。
