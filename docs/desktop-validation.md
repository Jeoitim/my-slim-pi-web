# Desktop 交付与验证记录

验证日期：2026-10-20。Windows x64 / PowerShell 7；开发 Node.js 24.20.0，Electron 44.9.1（内含 Node.js 24.22.0），electron-builder 26.15.3。后端运行在随包的独立 Node.js 24.20.0，不依赖 Electron ABI 或系统 Node。

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
