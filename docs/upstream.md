# 上游同步与回退

本地默认开发分支为 `my-slim-pi-web`，本地 `upstream` 分支专门跟踪 `upstream/main`。原本地 `main` 已更名，避免误作最新产品线。GitHub 远程默认分支仍保持原状，未经授权不推送或修改。

基底为 `https://github.com/agegr/pi-web.git` 默认分支 main，基准提交 `7c0778a`，上游版本 0.12.2。保留完整 Git 历史、MIT LICENSE及原 CONTRIBUTING / AGENTS；通用介绍直接链接上游 README。`origin` 指向本项目公开仓库 [Jeoitim/my-slim-pi-web](https://github.com/Jeoitim/my-slim-pi-web)，`upstream` 保留原上游地址。

本 fork 当前版本 `0.12.2-jeoitim.1`。每个上游基准下递增 `jeoitim` 修订号；集成更新上游后从新基准的 `.1` 开始。package.json / package-lock.json 同步修改。fork 不自动查询或推荐上游 npm / GitHub 应用更新，升级由本仓库维护和分发流程完成。

## 同步

由用户或外部维护者在源码仓库执行。下面流程不放进安装后 Agent 的提示词、技能或维护手册。

1. 保存当前工作并为已验证的 commit 留回退分支/标签。
2. `git fetch upstream`，阅读上游发布说明、AGENTS 与相关 topic notes；审查 SDK 与新增 API。
3. 本地 `upstream` 分支只 fast-forward 跟踪 `upstream/main`；`my-slim-pi-web` 是默认开发主线。从开发主线创建独立集成分支，合并选定上游 revision 并解决冲突。以干净、独立 PR 合入 `my-slim-pi-web`，不直接合并主线，不混入其他功能；见 [AGENTS.md](../AGENTS.md)。
4. 对比 `lib/rpc-manager.ts`、`proxy.ts`、Agent API、Extension UI 及组件状态恢复路径。新增远程 API 必须先审计再加入白名单。
5. 同步调整所有 `@earendil-works/*` 精确版本与 package-lock。不要只升级 coding-agent，也不要让嵌套依赖产生第二份 SDK。
6. 在 Windows / Linux 各自原生目录执行 `npm ci`、完整测试、类型、Lint、权限集成及隔离生产构建。使用各自 `.local` AgentRoot，不共享 node_modules。
7. 核对实际安装的预编译扩展、MCP 与任务子代理授权；更新验证结果和兼容矩阵。最后才按明确授权提交/发布。

## 定制边界

- `permission-mode.ts`、控件及 useAgentSession/ChatWindow：只做状态投影和命令交互。
- rpc-manager：受管理安装的工具/子代理所有权、模式命令、审批响应严格校验和启动就绪。
- remote-access/proxy/API 路由：远程认证与高风险入口限制。
- SettingsPanel/MySlimPiSettings 与设置 API：现有 Agent 偏好编辑、后台模型入口和无效设置清理。
- 名称、三语言短文本、Node 24、统一 Pi 1.3.0、测试及本文档。

不修改宿主 SDK 或第三方 node_modules。My Slim Pi 的配套源码改动与分发哈希独立保存在 Agent 仓库，继续使用原备份/维护机制。

## 回退

桌面宿主集中在 `electron/`，使用 electron-builder、独立 Node.js 24 和隔离的 Next 生产资源。上游同步需审查 SettingsPanel、page/layout、窗口主题、Next 配置和 remote-access 接点，保留单一 Agent 后端及签名的入口边界。桌面回归包括实际 Windows 产物、静态资源、PTY、端口和退出清理；详见 [desktop.md](desktop.md)。

停止当前 Web 进程，切换到此前验证的源码 commit，使用它的锁文件重新 `npm ci` 并重新构建，再启动。保留原 `.next` 可辅助检查，但不要把编译输出当作源码。Web 回退不要求改写用户会话或 CLI 安装。

Agent 改动若需回退，使用它自己的安装器快照和匹配的分发源码；不要只替换生成 seal。旧 Agent 没有稳定状态键时，本 GUI 显示未知/错误，不能根据彩色文本猜测权限。不要使用上游 `pi-web update` 安装另一个产品覆盖本 fork；`my-slim-pi-web` 启动器的 update 命令会提示走此源码流程。
