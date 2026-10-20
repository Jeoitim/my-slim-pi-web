# 权限状态与审批

## 数据流

```text
timrt-suite publish(ctx)
  → ctx.ui.setStatus("timrt-permission-mode", health.ok ? state.mode : undefined)
  → Pi Web 的 extensionStatuses / extension_ui_request
  → 输入框工具栏的权限菜单

用户选择
  → 现有 Agent command HTTP 接口：set_permission_mode
  → 校验模式、扩展命令和当前状态，串行等待会话空闲
  → 同一个 AgentSession.prompt("/approval-mode <mode>", { source: "rpc" })
  → 读取扩展发布的新状态；不吻合则返回错误
```

`set_permission_mode` 只是 Web 的现有命令端点适配，不是新的 Pi RPC 协议、工具或权限引擎。检查命令确实已注册后才调用，避免缺失命令时将文字发送给模型。所有权限判断仍在 timrt-suite 的 `tool_call` 及原审批模块内。

## 状态来源与失败处理

`lib/permission-mode.ts` 只接受 `auto`、`act`、`ask`、`plan` 四个精确值。不解析 ANSI、图标、中文说明或 `pi-permission-suite` 的临时“审批中”文本。GUI 不持久化模式，不读取/重写 `timrt-permissions`；原扩展在 session_start 从会话恢复并发布状态。实时事件及重连时的 get_state 复用上游状态恢复路径。

新会话尚未创建时没有可声称的真实模式，显示“权限”入口，菜单不预选任何模式。显式选择模式才初始化上游 dormant session。失败保留最后收到的状态并显示错误。控件以会话标识重新挂载，避免把上个会话的错误/等待状态带入新会话。

正常状态只显示一个模式控件。策略健康检查失败时撤销机器模式值，控件显示未知，保留原 pi-permission-suite 警告；模式切换也拒绝继续。其他扩展状态栏、通知及原有审批弹窗继续保留。策略校验失败通知由原 Agent 发出；即使显示 ACT/AUTO，也不意味着绕过只读保护。

## 审批桥接

复用上游 `requestExtensionUi`、FIFO 对话框、`extension_ui_request` / `extension_ui_response`、SSE 重放、Stop 和 shutdown。`timeout: 0` 不创建倒计时。只有布尔值 `confirmed: true` 才通过 confirm；取消标记优先于批准标记。select 只接受扩展提供的选项，取消和未知选项均返回 undefined。迟到/未知请求 ID 不会授权别的调用。

浏览器网络断开不等同于授权，也不等同于关闭 Agent 会话。未完成的无限等待仍暂停执行，重连重新呈现请求。Stop 及运行会话销毁使用原有 AbortSignal/默认拒绝路径。测试不通过缩短 ASK 等待时间来模拟无限等待。

## 资源与工具选择

SDK 通过 `getAgentDir()` 和 `PI_CODING_AGENT_DIR` 使用实际安装。My Slim Pi 识别依据是现有 `install/current-version` 和 `extensions/timrt-suite/permissions.ts`，没有新增配置目录。

识别为受管理安装后，新建/恢复忽略 Web 的工具预设记录和请求覆盖，沿用 SDK 与 Agent 的工具选择；`set_tools` 拒绝替换它们。Web 自己的子代理扩展及只读 MCP 预设策略不注入这些会话。MCP、工具发现及 Code mode 仍复用上游与 SDK 的现有加载机制；具体调用仍经过 timrt-suite，不以 MCP 的 readOnlyHint 代替 Agent 授权。

pi-cc 在 session_start 安排一次零延时 write renderer 注册。受管理会话的 ready 会等待这个启动回合结束，防止刚创建即关闭时回调访问已失效扩展上下文。没有修改第三方包或读取 SDK 私有字段来实现此兼容处理。

## 专属设置与 Agent 配套改动

“设置 → My Slim Pi”读取实际 Agent 安装中的 `extensions/pi-permission-suite/config.json`。人工审批开关对应现有字段 `reviewer.humanFallback`：开启为 `ask`，关闭为 `pause`。Web 只做带锁的单字段原子编辑，保留其他规则；不建立 Web 专用的权限配置。旧扩展尚未更新并构建时禁用开关。

Agent 每次评估读取这个偏好。AUTO/ACT 的自动判断仍照常运行；需要人工兜底时，关闭状态立即拒绝，不发审批提醒、不创建弹窗或 90 秒定时器。已打开的审批不被设置变动偷偷回答。ASK 的 `timeout:0` 始终保留逐次无限等待。CLI 也可用 `/approval-fallback on|off` 调整同一项。

策略 seal 仅把这一枚交互偏好视为可变状态，和原有模型选择一样；其他权限规则仍纳入校验，整个配置路径仍受工具写入保护。设置损坏或出现未知值时不启用人工兜底，不产生默认批准。关闭导致删除审批未通过时，仍保留原清理暂停规则。

后台模型按钮通过经过注册命令与空闲检查的 `open_my_slim_pi_settings` 适配，调用原 `/subagents` 设置页，选择审批/Hermes 模型。模型列表、供应商、保存方式及任务代理授权均由原扩展处理。

Web 的 Shell、内置子代理、插件安装及 Code mode 工具组合控件不适用于受管理安装，已隐藏或替换；相关写接口对受管理安装返回 403。保留有效的模型、技能、原生 MCP 和界面设置。原生 MCP 管理不意味着免除 Agent 的工具审批。Windows 使用 PowerShell，Linux 使用 Bash。

配套补丁包含稳定状态投影、以上交互偏好、CLI 入口、策略 seal 的单字段例外与针对性测试，另刷新 distribution.json 已有文件哈希。通过原维护构建器在各自仓库 `.local/` 的 Windows/Linux 独立 AgentRoot 验证。用户真实运行目录未部署；应用时继续使用原受管理更新、备份、构建与重载流程。
