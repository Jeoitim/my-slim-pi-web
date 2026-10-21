# Desktop 交付与验证记录

## 0.12.2-jeoitim.3 发布候选（2026-10-21）

本地 Windows x64 NSIS 复建产物为 `dist-desktop/My Slim Pi Web Setup 0.12.2-jeoitim.3.exe`，141,533,326 字节；SHA256：`d79ede5824ad6d12054d31fb051a318223ae0070f79ad15831189722aa0350eb`，同目录生成相邻 `.sha256` 文件。此值用于核对本地构建；GitHub Actions 发布附件有自己的校验文件。

本次通过 TypeScript、ESLint、桌面单元测试 9/9、权限/远程测试 8 项（1 项按原有条件跳过）、MCP 登录路由测试 10/10、隔离桌面资源构建、随包 Node.js 24.20.0 / node-pty 运行时验证、NSIS 打包及打包目录应用回归。打包目录回归检查了认证、桌面窗口、文件预览、终端和退出后监听器清理；返回 `passed: true`。Windows 全量单元测试曾因 MCP 路由测试使用 Unix `touch` 命令失败，已换成跨平台的服务端请求头验证；另外两个 MCP 集成测试在 Windows 临时目录清理时遇到 `EBUSY`，故不把 Windows 全量套件记作通过。发布工作流在 Ubuntu 运行全量测试，再在 Windows/Linux 原生 runner 分别打包。Linux AppImage 和实际 NSIS 安装后的本版本应用尚待 Actions/目标环境验收。

## 2026-10-21 启动、后台任务与扩展界面增量

本轮新增可见启动页、活动任务关闭确认和 RPC 扩展界面适配，不改变 Agent 数据目录或权限语义。

| 本轮检查 | 结果 |
| --- | --- |
| TypeScript / ESLint | 通过 |
| pi-subagents RPC widget 解析与上限 | 3/3；Fleet 树、异常 payload、Inspector reply |
| 会话 liveness / 后台任务识别 | 通过；浏览器选择租约不当作后台代理 |
| 本地扩展命令桥与远程白名单 | 通过；Inspector 只读命令可远程读取，其他扩展命令保持本地 |
| 桌面任务快照 API | 通过；运行回合、审批等待和后台代理去重 |
| Web 密码下的桌面任务快照 | 通过；主进程内部查询带 Basic 凭据，不把凭据写入设置或渲染层 |
| 真实 Electron 启动页交接 | 通过；先显示居中图标与进度条，再自动进入 WebUI |
| 真实 Electron 关闭/后台/退出 | 通过；阻塞扩展命令运行中关闭窗口提供后台选项，任务保持运行；最终退出后监听端口消失 |
| Windows PTY 退出 | 修复 node-pty 不接受 POSIX signal 的关闭异常；关闭终端不再抛 uncaughtException |
| 启动失败页 | 通过；缺失 Node 时仍显示可见、可重试错误页 |

`pi-ask-user` 在 RPC/Web 模式改走 Pi 的 `select`/`input` 对话框，保留 AUTO/ACT 90 秒推荐默认、ASK/PLAN 等待和取消语义；TUI 原生 picker 不变。`pi-subagents` 的 `subagent-async` 与 `subagent-inspect` JSON 被转换为原生 Fleet 列表和检查器，上游管理与插件页面保留。此次未重新打包 NSIS，也未推送或发布。

验证日期：2026-10-21。Windows x64 / PowerShell 7；开发 Node.js 24.20.0，Electron 44.9.1（内含 Node.js 24.22.0），electron-builder 26.15.3。后端运行在随包的独立 Node.js 24.20.0，不依赖 Electron ABI 或系统 Node。

## 0.12.2-jeoitim.2 右键菜单与剪贴板修复

当前产物：`dist-desktop/My Slim Pi Web Setup 0.12.2-jeoitim.2.exe`，141,523,867 字节（约 135.0 MiB）。SHA256：`cc171ced445e8dd0b31e5f2dda5505764caad92ffb7905dac3b4d2aa95d1502c`，同目录有 `.sha256` 文件。

桌面构建增加不经过应用画布的文本右键菜单。会话正文、代码块、输入框、文件/文档预览和终端分别提供适用的复制、全选、粘贴操作；菜单 portal 到 `body`，避开 36px 标题区，并在视口边缘翻向或收进可见范围。终端菜单覆盖显示区及其外围留白，使用终端自己的明暗主题；普通菜单使用应用主题。代码复制按钮、`/copy` 和右键复制统一经过受限的 Electron IPC；只有系统剪贴板写入成功后按钮才显示“已复制”。

| 本轮检查 | 结果 |
| --- | --- |
| TypeScript / 全仓库 ESLint | 通过 |
| 剪贴板单元测试 | 3/3 |
| 桌面 IPC / 安全边界 / 构建暂存 | 8/8；包含重复构建清除旧路由缓存和不完整构建保留上一份暂存资源 |
| 侧栏菜单组件与定位 | 16/16 |
| 语言包 / 既有会话菜单回归 | 12/12 |
| 隔离生产构建与 NSIS 打包 | 通过；随包 Node.js 24.20.0，Electron 44.9.1 |
| 生产 Web 资源 + 桌面桥模拟 | 代码复制精确；正文、输入框、文件预览、终端菜单通过；输入框和终端粘贴入口通过 |
| 菜单边界 | 页面右下角、全宽文件面板、终端右下角均未被画布裁切；实际点击终端底部留白通过；门户父节点为 `body` |
| 终端主题 | 深色 `#181b21`、浅色 `#f3f4f6` 均与终端面板一致 |
| 简体中文菜单字体 | fontcheck 0 error / 0 warning；Microsoft YaHei UI / Microsoft YaHei / `--font-ui` |
| 实际 Electron / NSIS 安装版 | 两者完整回归通过，均保留 sandbox、contextIsolation，关闭 nodeIntegration |
| 系统剪贴板 | 代码内容精确一致；正文、输入框、文件和终端复制通过；输入框与真实 PTY 原生粘贴通过；测试后恢复原剪贴板 |
| 终端全宽 → 还原 | 1280px、850px 两种窗口均实际点击通过 |
| 强制退出 / 后端清理 / 再启动恢复 | 实际安装位置通过 |
| 隔离安装 / 覆盖安装 / 卸载 | 安装与覆盖安装退出 0；最终卸载退出 0，测试应用可执行文件已移除 |
| 空配置独立启动 | 3/3；6.012、7.737、5.056 秒，中位数 6.012 秒；无 Retry 导航、无上游更新请求、标题栏无 SVG 图标 |

此前 Codex 专用 sandbox 账户的启动阻塞已解除。本轮在普通用户 `timrt`、full access 环境下直接运行 `dist-desktop/win-unpacked/MySlimPiWeb.exe`，并安装到 `.local/desktop-install-validation-20261021-final/桌面 应用` 后启动其中的 exe。测试使用独立 AgentRoot 和 userData；安装目录的父级故意保留会抛错的 `next.config.js`，实际安装版仍正常启动。没有改动真实 Agent 数据或现存用户安装。

实际验证还发现旧 `.desktop/server` 中残留的 Next 运行时 `server/route-cache` 会让新包继续返回旧 HTML、加载旧脚本。构建改为验证新 standalone 产物后重新创建生成目录，连续构建回归覆盖此问题；覆盖安装旧测试产物后，终端右下角留白处菜单也通过，确认安装后运行的是本次代码。安装、卸载和应用回归串行执行，避免 NSIS 关闭测试实例。

运行目录的剪贴板与边缘截图位于 `.local/desktop-clipboard-b1c561a5-e97f-463d-aaf2-c3d82e22ad91/`，实际安装版位于 `.local/desktop-clipboard-1ea0aa5f-1c0c-4e85-8d32-8cdd10b6fc7a/`；两个目录均包含终端明暗主题截图。早期浏览器桥模拟证据仍保存在 `.local/desktop-browser-context-menu/`。启动样本保存在 `.local/desktop-startup-after.json`，计时到 React 控件就绪；未重启操作系统或清空磁盘缓存。

本轮未重跑完整 Web 套件，历史非全绿结果保留在下文。Linux、macOS、真实 Cloudflare 和付费模型调用未在本轮重新验收。未推送、创建 PR 或发布。

## 0.12.2-jeoitim.1 修复版

当前产物：`dist-desktop/My Slim Pi Web Setup 0.12.2-jeoitim.1.exe`，142,560,171 字节（约 136 MiB）。SHA256：`49c0b9f7c2edff74fcc07e55d2f8246b3c6dc74410eaade41ad0c59d2f8eaf56`，同目录有 `.sha256` 文件。

标题栏改为产品名称文字与平台按钮，移除品牌图标和额外全屏图标。终端 / 文件面板全宽和窄窗口覆盖时避开标题区，还原按钮可见、可点击。版本按上游基准加 fork 修订号命名；Web 和桌面均不查询上游应用更新。

启动直接等待自有后端就绪，不再先导航到 Retry。Node 与窗口初始化并行，可选面板按需加载。生产启动采用 Next 生成的 standalone 序列化配置，修正 custom-server `prepare()` 忽略 `conf` 后向父目录寻找源码配置的问题。

| 本轮检查 | 结果 |
| --- | --- |
| 类型 / 全仓库 ESLint / 隔离生产构建 | 通过；仍有既有 session export 动态依赖警告 |
| 随包 Node / 真实 PTY | 通过 |
| 桌面专项 | 5/5 |
| 权限模式 / ASK / 远程边界 | 9/9，隔离 AgentRoot |
| 更新版本逻辑及 API | 5/5；mock 确认 fork 接口没有任何上游 fetch |
| 设置、布局、PWA、远程代理相关回归 | 15/15 |
| 正常独立启动 | 3/3，无错误页导航、无更新检查请求、标题栏无 SVG 图标 |
| 实际启动失败 | 缺失 Node 时窗口可见，Retry 可重新尝试 |
| 最终打包运行目录 / 实际 NSIS 安装版 | 两者完整回归通过 |
| 终端全宽 → 还原 | 1280px、850px 两种窗口均实际点击通过；另验证文件预览和真实终端输出 |
| 强制退出 / 后端清理 / 再启动恢复 | 通过 |
| 隔离安装 / 卸载 | 均退出 0，测试应用已清理 |

实际安装目录位于 `.local/desktop-independent-validation/桌面 应用`，父目录故意放置会抛错的 `next.config.js`，安装后的应用仍正常启动并完成回归，确认不依赖父目录的源码配置。测试每轮使用独立 userData；终端输出检查通过既有输入 API 写入真实 PTY，再检查 xterm 展示。没有改动真实 Agent 数据或现存用户安装，没有推送或发布。

启动测量由 `electron/scripts/startup-check.mjs` 完成，从进程拉起计到 React 控件可用；每次均使用空的 AgentRoot 和 userData：

| 产物 | 第 1 次 | 第 2 次 | 第 3 次 |
| --- | --- | --- | --- |
| 原 0.1.0 | 54.945 s | 3.249 s | 3.151 s |
| 最终修复版 | 3.734 s | 3.364 s | 3.214 s |

新版中位数 3.364 秒，主要消除了首轮约一分钟的额外等待和正常启动的 Retry。后续短启动与旧版在同一量级。未重启操作系统或清空磁盘缓存，因此这是独立进程 / 空配置测试，不是重启后磁盘完全冷缓存的基准。

本轮未重跑完整 Web 套件；此前非全绿结果保留在下面。Linux、macOS、真实 Cloudflare 和付费模型调用仍未重新验收。

---

以下为 **0.1.0 首版的历史记录**，保留用于回退及说明完整套件的已知验证范围。

## 产物和实际安装

`dist-desktop/My Slim Pi Web Setup 0.1.0.exe`，约 135 MiB，NSIS 按用户安装；附 SHA256 文件。`dist-desktop/win-unpacked/MySlimPiWeb.exe` 是运行目录。

安装器退出码 **0**，实际安装到仓库 `.local/桌面 安装 验证应用`（中文与空格路径），随后启动**安装目录里的 exe**通过端到端验证。测试结束已运行卸载器，退出码 **0**，确认测试应用已移除，保留安装包和运行目录。不是只验证开发窗口或解包目录。

安装包 SHA256：`58c7bbb43306cd207ee565d8fdb400a2164ef6abd582cfe22d2c8325f37c7757`。

测试使用独立 AgentRoot、userData、随机密码和测试会话，没有复制真实凭据、改动用户 Agent、修改 PATH、推送或发布。首版未配置产品签名证书。Linux AppImage、macOS 窗口/安装、真实 Cloudflare Access/Tunnel 和付费模型调用未验证。

## 检查结果

| 检查 | 实际结果 |
| --- | --- |
| TypeScript / ESLint | 通过，无错误/警告 |
| Next.js 生产构建 | 通过，隔离在 `.desktop/next`；保留既有 session export 动态依赖警告 |
| 随包 Node / 真实 node-pty | 通过，真实 shell 输出及退出；ConPTY 验证进程显式退出释放 DLL |
| 桌面专项 | **5/5**，含缺少运行时、配置、IPC、签名和双入口 |
| 设置/远程/Next/i18n/PWA 回归 | **35/35** |
| 真实隔离 Agent 四模式/ASK/远程边界 | **9/9**，原测试 provider，无付费模型 |
| Electron 开发窗口 | 通过 |
| Windows 打包运行目录 | 通过 |
| NSIS 实际安装后的应用 | 通过 |
| 主进程强制退出、后端清理、再次启动恢复 | 通过，使用实际 Electron main PID |
| 隔离安装卸载 | 通过，应用已清理 |

实际窗口覆盖密码登录、中文设置、隔离参数、真实测试会话在两入口中的一致读取、内部维护 API 可读/外部 403、Host 白名单、关闭固定入口后内部继续运行、关闭窗口留托盘、重复启动只唤回同一宿主、配置持久化和退出后监听器消失。专项测试另覆盖端口冲突保留旧入口、切换端口、SSE 分块和损坏配置不覆写。

没有在桌面中再次执行真实付费聊天或逐个重新批准/拒绝所有扩展；四模式与 ASK 的真实 SDK 路径由原隔离集成测试验证，桌面加载同一 React 审批组件和 Next 后端。不能把这两类验证混称为所有桌面 Agent 场景都已人工验收。

## 完整 Web 套件

`npm test`：**2797 项，2729 通过、48 失败、1 取消、19 跳过**。`mcp-read-only-policy.integration` 与 `subagent-mcp.integration` 的进程长期不结束；终止这两个已确认属于本次运行的进程后才获得汇总。不能记为无挂起的全绿执行。

失败包含先前已记录的 Windows ESM/POSIX 路径、符号链接/只读语义、PTY、文件占用、静态源码断言和 MCP 时序问题，见 [compatibility.md](compatibility.md)。本次没有重新完成逐项上游基线比较，不把全部失败宣称为已证明无关。与本次接点直接相关的回归、权限和桌面检查另有明确通过结果。

## 文件范围

| 范围 | 新增或修改文件 |
| --- | --- |
| 宿主 | `electron/main/{index,service,security,settings}.cjs`、`electron/preload/index.cjs`、`electron/shared/contracts.d.ts` |
| 后端入口 | `electron/server/{index,listeners}.cjs`；`lib/remote-access.ts` 增加签名验证，原规则保留 |
| 错误页 | `electron/ui/error.{html,css,js}` |
| 打包/测试 | `electron/scripts/{dev,build,pack,stage-host,windows-tools,e2e,crash-check}.mjs`、`verify-runtime.cjs`、`electron/tests/desktop.test.mjs`、`electron/assets/icon.svg`、`electron-builder.cjs` |
| UI | 新增 DesktopShell、DesktopSettings、useDesktop、app/desktop.css；调整 page/login/layout、AppShell、PwaRegistration、SettingsPanel、settings-navigation；删除 SessionSidebar 的重复 bridge 类型 |
| 翻译/配置 | 三语言 messages、package.json/lock、next.config、tsconfig、eslint.config、.gitignore |
| 文档 | README、AGENTS、desktop/desktop-validation、upstream、三个相关 agents notes |

没有为桌面改写 rpc-manager、权限引擎或会话存储。维护路径为本地 `upstream` 纯跟踪 → 独立集成 PR → `my-slim-pi-web`。本地分支及默认配置已调整；远程默认分支未改，未推送新分支。详见 [AGENTS.md](../AGENTS.md) 和 [desktop.md](desktop.md)。
