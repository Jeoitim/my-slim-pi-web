# My Slim Pi Web

**My Slim Pi 的 WebUI 最简实现。** 基于 [agegr/pi-web](https://github.com/agegr/pi-web)，为现有 My Slim Pi 提供浏览器聊天、会话和审批入口。Agent 的工具、扩展、记忆与权限规则均沿用 My Slim Pi。

当前开发版本为 `0.13.0-jeoitim.1`，已通过独立 PR 集成上游 0.13.0；同步记录见 [upstream.md](docs/upstream.md)。

从源码运行需要 Node.js **24+**，以及已安装、构建完成的 [My Slim Pi](https://github.com/Jeoitim/my-slim-pi)（Pi **1.4.0**）。Windows 使用 PowerShell 7，Linux 使用原生 Bash / Node；两端各自安装依赖。桌面安装包自带 Node.js 24。

## 启动

在本仓库运行：

```sh
npm ci
npm run dev
```

打开 [本地界面](http://127.0.0.1:30141)。默认读取 `~/.pi/agent`。自定义安装目录时，启动前设置 `PI_CODING_AGENT_DIR`：

```powershell
# Windows
$env:PI_CODING_AGENT_DIR = "C:/path/to/agent"
```

```bash
# Linux
export PI_CODING_AGENT_DIR="/path/to/agent"
```

生产运行：停止开发服务器后执行 `npm run build`，再执行 `npm start`。默认仅监听本机。可选远程访问见 [Cloudflare Tunnel + Access](docs/remote-access.md)。

## Electron 桌面版

桌面与 Web 共用现有界面、权限系统和 Agent 数据。窗口按钮内嵌于应用顶部并跟随主题；“设置 → 桌面应用”管理受认证保护的本地 Web 入口、端口和后台服务。

预编译的 Windows x64 安装包见 [GitHub Releases](https://github.com/Jeoitim/my-slim-pi-web/releases)；Linux x64 AppImage 在原生构建成功时一同提供。已发布版本的下载说明与校验范围见[发布说明](docs/releases/0.12.2-jeoitim.6.md)；从源码构建如下：

```sh
npm run desktop:dev
npm run desktop:build
npm run desktop:pack
```

Windows x64 生成 NSIS 安装包，Linux x64 生成 AppImage；两者随包包含独立 Node.js 24 和 npm/npx。桌面构建隔离在 `.desktop/`；浏览器仍使用原命令。详情见 [桌面文档](docs/desktop.md)。

## 本项目设置

- **设置 → 常规 → 对话 → 默认折叠处理详情**：运行时显示最新一行原有思考或工具卡片，可滚动回看、点击展开；任务完成后隐藏预览。关闭开关恢复完整平铺显示，无过程区域高度限制或内部滚动。
- 终端自动检测系统 Shell，可在头部切换 PowerShell、CMD、Git Bash 等已安装的 Shell，已有终端继续保留。
- 对话工具栏切换 **AUTO / ACT / ASK / PLAN**，显示当前会话的真实权限状态。
- **设置 → My Slim Pi**：开关 AUTO/ACT 人工审批提醒。开启时等待最多 90 秒；关闭后直接拒绝，不弹窗、不等待。ASK 始终逐次审批、无限等待。
- 后台模型入口调用 My Slim Pi 原有设置，选择审批和 Hermes 模型。Web 不另建子代理体系。
- 移除被 My Slim Pi 接管的 Shell、Web 子代理、插件安装及 Code mode 工具组合设置；保留有效的界面、模型、技能和原生 MCP 设置。

旧安装需先通过 My Slim Pi 原有更新、备份与构建流程应用 [配套扩展补丁](patches/my-slim-pi-permission-status.patch)。不会自动改写现有 CLI 安装或凭据。

## 开发与来源

`npm run typecheck` · `npm run lint` · `npm run test:permissions` · `npm test`

[权限与配置](docs/permissions.md) · [两端验证及已知缺口](docs/compatibility.md) · [上游同步与回退](docs/upstream.md)

更多通用功能介绍请阅读 [上游项目 README](https://github.com/agegr/pi-web#readme)。保留上游 Git 历史和 MIT 许可证，基于 `e533d9b`（0.12.2），Pi SDK 固定为 **1.4.0**。仅在维护者推送版本 tag 后由工作流发布；应用不修改用户 PATH。
