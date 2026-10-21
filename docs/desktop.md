# My Slim Pi Web Desktop

## 架构

Electron 是宿主，Next.js / Pi SDK 仍是唯一后端。聊天、会话、权限、审批、MCP、技能、记忆和终端不另建实现。桌面和浏览器共享同一进程内的 AgentSession 注册表以及 `PI_CODING_AGENT_DIR`，默认仍为 `~/.pi/agent`。不修改 My Slim Pi 源码或用户安装。

一个 Next.js 实例有两个 HTTP 入口，同进程分发，没有中间缓冲代理：

| 入口 | 行为 |
| --- | --- |
| 桌面内部 | 随机 loopback 端口，每次启动生成随机凭据，由 Electron 网络层注入；无凭据返回 403。隐藏地址不是安全边界。 |
| 外部控制 | 默认关闭。开启时绑定 `127.0.0.1:<port>`，默认 30141。浏览器和 Tunnel 都必须登录 Web 密码，并受远程 API 白名单限制。 |

内部/外部身份由监听器覆盖请求头并用进程内 Ed25519 私钥签名。Next 和工具环境只有公钥；伪造 Host 或标记不能提升权限。普通 Web 启动没有公钥，保留既有 `PI_WEB_REMOTE` 行为。桌面即使继承 `PI_WEB_REMOTE=1`，有效内部签名仍识别为内部；外部入口始终使用远程限制。

同机浏览器也走受限制入口；终端和配置维护等完整本地能力在桌面窗口使用。关闭外部控制会真正关闭固定监听端口及其连接，内部入口与 Agent 不受影响。这不是操作系统用户隔离：同一用户仍能调试进程或读取自己的 Agent 文件。

扩展兼容保持与 Pi TUI 同义：`pi-ask-user` 在 RPC/Web 模式使用 Pi 的 `select`/`input` 对话框，由桌面和浏览器渲染成原生表单；`pi-subagents` 的 `subagent-async` 与 `subagent-inspect` JSON widget 分别转为 Fleet 列表和任务检查器。上游 `/subagents`、Fleet Inspector 和插件页面继续保留，不用桌面专用字段改写扩展 API。

## 窗口与 IPC

`titleBarStyle:hidden` 移除系统标题条。macOS 原生交通灯内嵌于左上方；Windows/Linux 用 `titleBarOverlay` 把平台按钮叠加到 36px 应用顶部。颜色跟随现有主题，保留系统拖动、缩放、最大化双击及 Windows Snap。标题区只保留产品名称文字和平台按钮，不放品牌图标或额外全屏图标；全屏可用平台按钮或菜单 / F11。使用 `titlebar-area-*` 安全区避免按钮重叠。文件 / 终端面板全宽展开和窄窗口覆盖时都避开 36px 标题区，确保还原与关闭按钮可见。macOS/Linux 实际窗口管理器表现需要各平台验收。

保持 `nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`、`webSecurity:true`。IPC 检查主窗口、主 Frame、精确 origin 和应用页面路径；没有泛用 shell、原始 IPC、require 或任意 URL 打开能力。导出/预览窗口不加载 preload，禁用脚本。普通浏览器不显示桌面设置；PWA 不依赖 Electron。

桌面窗口的会话正文、代码、输入框、文件预览和终端提供与主题一致的文本右键菜单，按区域提供复制、全选和粘贴。菜单挂载在页面根部并限制在标题区下方的可见窗口内，避免被滚动画布或全宽面板裁切；终端菜单跟随终端自己的明暗主题。复制按钮和 `/copy` 通过受限 IPC 写入系统剪贴板，写入成功后才显示成功；粘贴使用编辑器和终端原有的原生粘贴事件，不向页面暴露通用剪贴板读取接口。

## 开发和打包

在原生 Windows/Linux x64 安装 Node.js **24 LTS**，各平台独立安装依赖：

```sh
npm ci
npm run desktop:dev
npm run desktop:build
npm run desktop:pack
```

唯一框架是 **electron-builder**。Windows 默认生成 NSIS 安装包；`npm run desktop:pack:dir` 生成运行目录。Linux 原生构建后执行 `npm run desktop:pack`（默认 AppImage x64），或 `node electron/scripts/pack.mjs --linux`。macOS 留有配置，首版不宣称已验证签名或分发。不要跨平台共用 node_modules 或 `.desktop`。

原 `npm run dev`、`npm run build`、`npm start` 保持独立。桌面开发输出 `.desktop/dev`，生产输出 `.desktop/next`，安装资源 `.desktop/server`、`.desktop/runtime`、`.desktop/app`。不占浏览器开发的 30141 或 `.next/dev/lock`。开启固定入口遇到占用会报错，不复用/杀死第三方服务。

构建脚本复制构建主机的 **Node.js 24 二进制及匹配的 npm/npx**。安装用户无需 Node、npm install 或源码。只在本应用进程及子进程的 PATH 中加入随包运行时，不修改用户 PATH。

取舍：utilityProcess 和 Electron Node 模式依赖所选 Electron 的 Node 版本/ABI，后者还依赖模式开关。独立 Node 24 包体较大，但可直接验证 Web 运行条件和 node-pty ABI；不降低 engines，不进行 Electron ABI 重建。

使用 Next standalone 布局，再安装完整锁定的生产依赖以保留 SDK 动态导入、模板和原生资源，同时复制 public 与 Next static。Node/npm、后端启动脚本及 node-pty 放在 `extraResources` 的 ASAR 外；独立 Node 无法读取 ASAR。生产按 Next 生成的 standalone 启动器设置序列化配置，无需 TypeScript，也不向父目录查找源码配置或 `.env`；仅向 `next()` 传入 `conf` 不够，其 custom-server 的 `prepare()` 不会将该选项传给路由初始化。构建最后用随包 Node 启动真实 PTY，检查输出及退出。

每次构建先验证 standalone 产物，再重新创建生成目录 `.desktop/server`。不要把新版本直接覆盖进运行过的旧目录：Next 的运行时路由缓存可能保留旧 HTML，导致新安装包继续加载旧脚本。此步骤不清理开发用的 `.next` 或用户数据。

Windows 的打包脚本对固定版本 electron-builder 26.15.3 的 NSIS 缓存重命名故障提供小范围降级：仅在官方校验和完整解压已完成、最终 rename 返回 EPERM 时，用工具支持的目录覆盖继续。路径必须在本次构建缓存内，不修改第三方源码或伪造缓存完成状态。下载受网络限制时，可为构建过程设置 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 为可信镜像；仍保留校验。

## 外部控制与端口

设置 → 桌面应用提供开关、端口、状态、打开 Web、复制地址、重启和退出。配置只写 Electron `app.getPath("userData")/desktop-settings.json`，不写 Agent 设置/会话。损坏配置保留并报错，恢复自己的备份后重试。

启用前在启动环境设置长随机 `PI_WEB_PASSWORD`，桌面设置不会保存密码：

```powershell
$env:PI_CODING_AGENT_DIR = "$env:USERPROFILE/.pi/agent"
$env:PI_WEB_PASSWORD = Read-Host 'Web password' -MaskInput
$env:PI_WEB_ALLOWED_HOSTS = 'agent.example.com'
& 'C:/path/to/MySlimPiWeb.exe'
```

Linux 使用 export / read -rsp。不要将密码放入源码、命令行参数或桌面配置。不会自动创建 Tunnel、保存 Cloudflare Token、打开防火墙、绑定 0.0.0.0 或修改路由器。

端口接受 1–65535 整数，低于 1024 可能需要额外权限。变更先绑定新端口，成功才关闭旧入口；冲突保留旧入口和 Agent 会话。配置持久化失败恢复原入口。无需重启后端，但需同步修改 Tunnel 目标端口。

“重启服务”会停止整个本应用后端，等待退出、重新启动并检查就绪。它会中断正在执行的任务、终端和 ASK 等待，不会批准待审操作；只切换外部入口/端口不重启后端。重启前会切回启动页，就绪后自动进入 WebUI。

## Cloudflare

继续按 [remote-access.md](remote-access.md) 配置覆盖整个域名的 Access 与 HTTPS。Tunnel 指向实际 `http://127.0.0.1:<port>`，保留外部 Host，域名精确列入 `PI_WEB_ALLOWED_HOSTS`。不改写 Host 为 localhost，不关闭 Web 密码。loopback 不是 Access/认证的替代品。

外部请求始终保留认证、Host/Origin、API 和命令限制，不能使用 Electron IPC；新 API 默认远程拒绝。SSE 由同一 handler 直接写响应，无缓冲或响应超时，ASK 继续使用原 Agent 协议。真实 Tunnel/Access、公网 DNS、跨网络长期连接需用户账户验收，不能由本地测试替代。

## 生命周期和更新

关闭窗口不再无提示地中断任务。若 `/api/agent/running` 或扩展 liveness 报告有运行回合、审批等待或后台代理，窗口会给出“继续在后台 / 停止任务并退出 / 取消”；选择后台只隐藏窗口，Electron 与独立 Node 后端继续运行，可从托盘重新打开。没有活动任务时保持原行为：外部入口运行时隐藏到托盘，否则正常退出。显式退出在有活动工作时也要二次确认；确认后才停止本应用持有的子进程，不按名字杀其他 Node/Next/Pi。

单实例锁避免重复宿主。IPC 就绪消息和带凭据的健康请求确认服务可用，不用固定延时。配置/重启操作串行。父进程崩溃或被强制结束时，IPC disconnect 触发后端退出，并有期限兜底防止孤儿。不会连接来源不明的残留服务。失败显示本地重试页，也可从托盘重试。

启动时 Node 后端与原生窗口并行初始化。窗口先显示本地 `loading.html`：居中品牌图标、双语句子和不确定进度条；服务、健康检查和必要配置都就绪后自动导航到 WebUI。正常启动不显示 Retry，不执行一次多余的停止/重启；真实失败才切到错误页。健康请求使用原生 loopback HTTP，终端、文件预览、子代理预览和设置面板按需加载，不在聊天首页初始化 xterm 等可选模块。

版本采用 `<上游基准版本>-jeoitim.<修订号>`，当前为 `0.12.2-jeoitim.2`。同一上游基准递增修订号，完成新上游版本的独立集成 PR 后，基准更新并从 `.1` 开始。页面不请求上游更新接口；即使直接调用 `/api/app-update`，fork 版本也只返回本地版本，不连接 npm 上游或推荐上游安装包。此规则同时适用于本 fork 的 Web 版。

首版无自动更新器。退出应用后安装新版本；卸载保留 userData，安装不覆盖 AgentRoot、凭据、模型、技能和会话。回退用此前验证的安装包并保留用户目录。不要用上游 pi-web 自动更新覆盖 fork。首版安装包未签名，发布签名与可信下载另行处理。

上游维护遵循 [AGENTS.md](../AGENTS.md)：`upstream` 纯跟踪 → 独立集成 PR → `my-slim-pi-web`。重点接点是 page/layout、DesktopShell/DesktopSettings、SettingsPanel、settings-navigation、remote-access 和 next.config；不复制 rpc-manager 或权限系统。

## 验证

运行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run test:permissions`、`npm run test:desktop`。桌面测试覆盖配置/损坏、IPC 来源、签名伪造、双入口共享状态、流式输出、端口冲突回退和关闭入口后内部存活。生产资源验证包含真实 PTY。开发窗口成功不能替代实际安装产物验证；各平台与 Cloudflare 未验证项必须在交付中说明。

`npm run test:desktop:app` 验证开发窗口；`npm run test:desktop:packaged` 验证 Windows 运行目录。设置 `PI_DESKTOP_E2E_EXECUTABLE` 可验证实际安装位置；全部使用 `.local` 隔离 AgentRoot 和 userData。`npm run test:desktop:startup-loading` 验证启动页先于 WebUI 出现并自动交接；`npm run test:desktop:lifecycle` 用阻塞扩展命令验证关闭提示、后台继续和退出后后端终止。`node electron/scripts/crash-check.mjs` 验证强制退出及恢复。实际记录见 [desktop-validation.md](desktop-validation.md)。

安装、卸载和应用回归必须串行执行。NSIS 安装器会关闭正在运行的同名应用，即使该实例来自另一个测试目录，也会中断 Electron 回归。

`node electron/scripts/startup-check.mjs` 测量打包应用三次独立空用户目录启动，记录进程拉起到 React 控件就绪的耗时，并断言正常启动没有 Retry 导航、没有上游检查请求、没有重复的全屏图标。`--baseline` 可记录旧产物；不要在测量间替换同一个运行目录。`node electron/scripts/startup-failure-check.mjs` 模拟缺失 Node，检查真实失败仍显示可见、可重试的错误窗口。两项启动检查都必须经过新的 loading 页。
