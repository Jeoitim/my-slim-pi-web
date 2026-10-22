# 兼容性与验证记录

## 2026-10-22：Pi 1.4.0 例行维护

版本 `0.12.2-jeoitim.4`，上游基准从 `7c0778a` 更新到 `e533d9b`（仍为 pi-web 0.12.2）。七个 `@earendil-works/*` 包全部精确固定为 1.4.0，锁文件无嵌套 SDK 副本。My Slim Pi 源码参考提交为 `9457b93`，真实集成加载该仓库的隔离 Pi 1.4.0 资源。SDK 与第三方 node_modules 未修改。

本次额外适配：允许经过既有认证、Host/Origin 校验的 POST 会话续租；续租回报 My Slim Pi 扩展持有的后台活动，排除浏览器自身租约；集成测试使用新版原生 `web_search` 工具；修正新引入测试的 Windows 文件 URL，以及两份既有测试对 LF 换行的假设。MCP 后台连接失败测试改为等待两个连接到达终态，再断言错误与脱敏结果，未放宽生产连接或权限策略。

| 本次检查 | 结果 |
| --- | --- |
| Windows Node 24.20.0 类型 / ESLint | 通过 |
| WSL archlinux、原生 Node 24.22.0、独立 npm ci 与全量 Web 测试 | 2891 项：2889 通过、2 跳过、0 失败 |
| Windows 真实 Pi 1.4.0 资源与权限集成 | 9/9，通过四模式、恢复、隔离、ASK 允许/拒绝/取消与原生 PowerShell |
| Linux 真实 Pi 1.4.0 资源与权限集成 | 9/9，使用 Linux 原生扩展与 Bash |
| Windows 桌面单元/服务测试 | 9/9 |
| 新增隐藏页面事件流回归 | 13/13 |
| Windows 源码换行回归 | 5/5 |
| Windows 最终受影响回归合并运行 | 77/77 |
| Windows 隔离 desktop:build | 通过；随包 Node 24.20.0 和原生 PTY 验证通过 |
| Windows 打包目录应用回归 | 通过；登录、单实例、外部控制、文件预览、原生终端及退出后的监听清理 |
| 桌面生产后端的远程 HTTP/SSE 验证 | 通过；含续租 200、缺少 holder 400、未认证 401、Cookie、Host、CSRF、危险 API 拒绝、权限切换与 SSE 重连 |
| 发布 tag / package / lockfile / release notes 一致性 | v0.12.2-jeoitim.4，通过 |

Linux 首轮全量仅有两项源码换行失败；修正后第二轮出现一次 MCP 子进程尚未报告失败的时序断言，相关文件单独重跑 11/11 通过；显式等待连接终态后的最终全量结果为上表。测试使用测试 provider，无付费模型调用；本次没有重跑真实联网搜索。

Windows 首轮完整套件为 2838 项：2769 通过、47 失败、1 取消、21 跳过。其中包含后来修复的文件 URL/换行问题，以及 Windows ESM、POSIX 路径、文件链接/只读语义、MCP 和 PTY 失败；两个挂起的 MCP 测试子进程被定向终止，故该轮不是完整自然结束的全绿运行。本次未重新对每个 Windows 失败做未修改上游对照，不将其全部宣称为已证明无关。最终受影响检查与真实扩展/生产后端验证另列于上表。

构建使用 `.desktop/`，未运行覆盖开发 `.next/` 的生产构建。Windows 与 Linux 使用各自依赖和隔离 AgentRoot，没有修改用户实际 Agent 安装、凭据或 PATH。公网 Cloudflare Tunnel/Access、Linux 图形桌面及 macOS 仍需目标环境验收。

以下为 2026-10-20 的历史记录，不代表本次重测结果。

验证日期：2026-10-20。Web 基于 agegr/pi-web `7c0778a`（0.12.2），所有直接依赖的 `@earendil-works/*` 包统一精确固定为 **1.3.0**，提交独立 package-lock。未修改 SDK 或第三方 node_modules。

## 验证环境与隔离

| 项目 | Windows | Linux |
| --- | --- | --- |
| 环境 | 原生 Windows、PowerShell 7、Node 24.20.0 | WSL archlinux、原生 Bash、Node 24.22.0 |
| 依赖 | Windows 自己的 npm ci / 原生模块 | Linux 自己的 npm ci / 原生模块 |
| AgentRoot | My Slim Pi 源码仓库 `.local/web-compat-agent` | Linux 原生验证目录内独立安装 |
| 生产构建 | Web `.local/release-check` | Linux 原生源码副本 |

两端不共享 node_modules，生产构建没有覆盖正在开发的 `.next`。测试使用独立会话、配置和工作目录，没有复制用户凭据，没有部署用户真实 `~/.pi/agent`、修改 PATH 或发布远程站点。模型回复通过测试 provider 注入；实际免费 Exa 调用明确指定免费 MCP，不调用付费 API 兜底。

## 已通过的检查

| 检查 | Windows | Linux |
| --- | --- | --- |
| TypeScript / ESLint | 通过，无错误或警告 | 通过，无错误或警告 |
| 隔离生产构建 | 通过 | 通过 |
| 权限与真实 AgentSession 集成 | 9/9 | 9/9 |
| 专属配置持久化、设置导航 | 7/7 | 7/7 |
| 真实免费 Exa，经 Web AgentSession | 通过 | 通过 |
| 生产 HTTP 认证、Cookie、CSRF、Host、API 限制、SSE 与重连 | 通过 | 通过 |

权限集成直接加载已构建的 My Slim Pi 资源：四模式真实状态、切换失败、会话恢复与隔离、PLAN 拒绝写入、ASK 非只读调用逐次允许/拒绝/取消、无限等待语义、原生 PowerShell/Bash，以及不重复注入 Web 子代理体系。审批响应只有布尔 true 可以批准；未知选项、取消、停止和迟到响应不会默认放行。ASK 的无限等待通过真实 timeout:0 路径验证，没有把等待时间缩短为测试超时。

专属配置测试验证开关只修改已有 `reviewer.humanFallback`，保留其他规则；未知值保持拒绝，损坏文件不覆写，旧扩展不接受不支持的设置。Agent 配套测试还验证：关闭时不通知、不弹窗、不等待；已创建的 reviewer 即时读取新值；ASK 仍等待；仅此交互字段不使 seal 失效，其他权限规则仍受保护。

浏览器实测覆盖权限菜单与原工具栏的布局、设置五个入口、开关保存及恢复、未创建会话时后台模型按钮的说明；后台模型入口使用原 `/subagents` 扩展对话框。

## 完整测试套件的实际结果

不把已有失败或平台差异记为通过。

| 原始全量运行 | 总数 | 通过 | 失败 | 取消 | 跳过 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web Windows，当前源码 | 2796 | 2731 | 45 | 1 | 19 |
| Web Windows，独立原始上游 1.2 基线 | 2787 | 2724 | 45 | 0 | 18 |
| Web Linux，当前源码 | 2832 | 2827 | 3 | 0 | 2 |

Windows 的上游测试含 POSIX 路径、文件链接/只读语义、直接导入 `C:` ESM 路径和 PTY 假设；独立原始基线同样有 45 个失败，但具体用例随并发时序变化，不能只凭数量判定完全一致。当前运行额外出现的 MCP 空闲释放、服务状态时限及外部 session writer 时序问题，相关三份文件串行重跑 **77/77 通过**。权限与本次配置测试另有明确通过结果，见上表。

Linux 两个失败在独立未修改的上游 1.2 基线也可重现：`components/FileViewer.test.mjs` 的局部 HTML 提取断言、`components/SettingsUi.test.mjs` 的旧源码结构断言。第三个是并发负载下 stdio MCP 的启动状态时序；整份 MCP 集成测试单独重跑 **11/11 通过**。这些未作为本次适配扩大修复范围。

My Slim Pi 源码仓库 Windows 根测试 **36 项：33 通过、3 跳过**；分享审计 **86 项 SHA256 全部有效**。Linux 原生维护检查 **119 项：115 通过、4 跳过**，随后 SDK 组件集成通过，包含记忆网关、hashline 过期锚点拒绝/新锚点编辑、PLAN/AUTO 恢复和原生 MCP manager。

Windows 原生维护检查（含重跑）为 **119 项：115 通过、1 失败、3 跳过**，失败是 `native queries and grammar-proven data pipelines bypass the approval model`：PowerShell 只读 AST 服务不可用时，原运行时保守地转入审批并拒绝，而该断言要求免审。相关整份测试单独重跑 **16/16 通过**。这与解析器启动/短暂恢复窗口有关，维护测试本身已使用串行文件运行，不能归因于测试文件并发。没有为通过断言延长权限等待、放宽只读分类或忽略失败。后续单独运行的 Windows SDK 组件集成 **通过**；Windows 外部备份/恢复检查也通过。

Linux 的源码根测试另有 Windows 安装器假设：36 项中 25 通过、11 失败，其中 10 项缺少 pwsh，1 项使用 Windows 的假 esbuild fixture。不能用这批测试代替 Linux 原生安装及维护检查；后者已单独运行。

## 复现方式

常规检查在 Web 仓库运行：

```sh
npm ci
npm run typecheck
npm run lint
npm test
```

真实权限集成需要先按 My Slim Pi 原有安装/构建流程创建**可丢弃的独立 AgentRoot**，并应用配套补丁。Windows 示例：

```powershell
$env:MY_SLIM_PI_TEST_AGENT_DIR = "C:/path/to/my-slim-pi/.local/web-compat-agent"
npm run test:permissions
node --test lib/my-slim-pi-settings.test.mjs lib/settings-navigation.test.mjs
```

Linux 使用 `export MY_SLIM_PI_TEST_AGENT_DIR=/path/to/disposable/agent`。测试文件会校验隔离位置；不要把它指向真实安装。

`e2e/remote-access.mjs` 需要已启动的独立生产服务器，参数检查写在脚本开头；服务器使用测试 AgentRoot、随机测试密码及准确允许的 Host。它通过原生 HTTP 请求保留 Host 头，验证真实代理边界，不用 Node fetch 的 Host 覆盖来假装外部请求。测试结束应停止该服务器。

开发时不在同一目录执行生产 build。需要构建验证时，另建源码副本并安装该系统的依赖，执行 `npm run build`；实际生产使用按 [README](../README.md) 停止开发服务后构建。

## 设置兼容范围

| 设置 | 当前处理 |
| --- | --- |
| 外观、字体、聊天、通知、侧栏 | 保留有效的浏览器/界面设置 |
| 模型、供应商、技能、原生 MCP | 沿用上游及 Pi SDK 机制 |
| Shell 与 defaultTools / Code mode 组合 | 隐藏无效控件；受管理安装的旧写接口拒绝 |
| Web 内置子代理配置与插件管理 | 替换/隐藏；受管理安装的旧写接口拒绝 |
| AUTO/ACT 人工审批兜底 | 编辑 Agent 的既有字段；关闭即拒绝，ASK 不受影响 |
| 审批/Hermes 后台模型 | 原 `/subagents` 设置入口 |

## 剩余边界

- 实际 Cloudflare Tunnel + Access 的公网身份验证、DNS、长时间跨网络切换与多设备链路尚未建立或验收。已验证应用端真实 HTTP/SSE 边界；公网部署按 [远程访问文档](remote-access.md) 逐项验收。
- 没有对真实供应商执行付费模型聊天或付费搜索。真实资源与 AgentSession 路径已测试，模型输出来自测试 provider，免费 Exa MCP 单独实测。
- 旧 Agent 未应用并构建配套补丁时，模式显示未知/错误，人工审批开关禁用；不会猜测权限或静默批准。

上游复用和升级/回退边界见 [upstream.md](upstream.md)，Agent 七份源码/清单变更完整保存在 [配套补丁](../patches/my-slim-pi-permission-status.patch)。

Agent 配套变更文件：

| 文件（My Slim Pi 仓库） | 变更 |
| --- | --- |
| `agent/extensions/timrt-suite/permissions.ts` | 发布稳定模式键；注册原 CLI 风格的审批兜底开关命令 |
| `agent/extensions/timrt-suite/terminal-notifications.ts` | 读取/保存既有偏好；关闭时不创建有时限的审批 UI |
| `agent/extensions/timrt-suite/approval-reviewer.ts` | 每次评估读取偏好；关闭时拒绝并停止审批通知 |
| `agent/customization/runtime/policy-files.cjs` | 仅给有效交互偏好增加 seal 例外，保留规则与写路径保护 |
| `agent/customization/checks/tests/notifications-btw.test.mjs` | 实测偏好即时生效、ASK、通知及 seal 边界 |
| `agent/customization/checks/tests/auto-reviewer.test.mjs` | 对齐关闭时无通知的预期 |
| `distribution.json` | 使用原脚本刷新以上文件的分发哈希 |
