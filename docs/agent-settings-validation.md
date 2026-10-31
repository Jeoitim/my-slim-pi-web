# 原生子代理设置验证

2026-10-30，Windows x64，开发版本 `0.13.0-jeoitim.2`。

## 设置与配置

原“My Slim Pi”设置页恢复为上游 `AgentsConfig` 左右分栏界面；审批提醒移到常规页。审批模型和 Hermes 模型使用原生模型选择器，详情留在设置页，不再分发 `/subagents` 终端交互。

受管理安装沿用 CLI 子代理执行器。页面显示 CLI 自带定义、用户/项目定义和 Hermes 后台模型项；Hermes 不进入可分派的 Agent 列表。现有定义仅编辑共享的描述、提示词、模型与思考级别，CLI 运行选项在配置详情中只读显示。Web 子代理运行时、启用和并发控件继续隐藏，相关写接口仍拒绝受管理安装。

保存模型时保留其他 frontmatter 值、隐含默认值和原提示词正文；定义名称与文件名不一致时，编辑和删除使用实际源文件。新建定义包含 CLI 必需的 `name`、`description`，工具列表沿用 CLI 格式。普通 README 不列为代理。Hermes 使用原 JSON 配置和 `timrt:hermes-model` 即时事件，清除模型时按 CLI 规则移除回退列表。

没有打开项目或对话时也可管理全局模型。模型接口在未指定 cwd 时读取固定的 Agent 目录，显式项目仍执行原有目录授权与信任检查。

## 检查结果

- 最新相关单元及 API 检查 91/91；桌面单元检查 26/26。类型与 Lint 通过。
- 实际隔离 My Slim Pi 安装的权限集成通过：四模式、恢复、隔离与 ASK 审批等原有流程保持正常，使用模拟 provider，不调用付费模型。
- 使用已安装的 pi-subagents 自身解析器核对新建定义：标识、非空/空工具列表、模型、思考级别和提示词均正确。
- 实际桌面运行目录专项验收通过：模型保存与清除、思考级别、Hermes、页内详情、常规审批开关、新建和删除定义，以及无对话写入。脚本为 `electron/scripts/agent-settings-check.mjs`，使用独立 AgentRoot、桌面配置和虚拟模型供应商，并生成中文截图。
- 中文标签实际字体为 Segoe UI / Microsoft YaHei；中文 HTML 快照通过严格字体检查，0 错误、0 警告。1280×840 浅色与 760×520 深色窗口已截图检查。
- 隔离生产构建通过，捆绑 Node 24.22.1 与 PTY 工作正常。启动源码包包含 2,075 个模块；真实后端和三个启动入口单个模块源码读取为 0，Next VM 数据清单读取为 3，分别统计。本次 ready 为 1,777ms，不作版本间性能比较。

本次没有在 Linux/macOS 图形桌面验收；完整 Windows Web 套件的既有平台差异仍见 [上游集成记录](upstream-013-validation.md)。日志与截图位于忽略目录 `.local/agent-settings-*`，没有修改个人 Agent 目录、凭据或会话。

## 原设置界面安装包（已归档）

`dist-desktop/previous/0.13.0-jeoitim.2-original/My.Slim.Pi.Web.Setup.0.13.0-jeoitim.2.exe`，219,996,674 字节，同名 `.exe.sha256` 已生成。最终打包完成后再次通过原生设置验收；仅提取指定安装资源核对，宿主 ASAR 与已验收运行目录一致，Web BUILD_ID 均为 `CWztTjH_AGz5siXxbXmbz`，包内版本为 `0.13.0-jeoitim.2`。此处为安装修复前的历史构建，当前同版本修复包及校验值见 [安装修复验证](desktop-installer-validation.md)。

SHA-256：`3b54b61991974c99a061d83dfaaa6b8a4df4a1c77e84d4bebbb839e9175dc173`。
