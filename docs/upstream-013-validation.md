# 上游 0.13.0 集成验证

日期：2026-10-30。集成分支 `codex/integrate-upstream-0.13.0`，源为 `agegr/pi-web` 的 `d128bae47cd3abbdfe7135443ac793f547c14e47`（v0.13.0），开发基线 `2a330cc`。版本为 `0.13.0-jeoitim.1`。本提交只集成上游及必要兼容处理，新的折叠行为另行提交。

## Windows 原生验证

- Node 24.22.1；类型检查、Lint 通过。
- 会话续期、Debug、压缩队列、发送恢复、隐藏页面重连及终端针对性回归：138/138 通过。桌面宿主单元检查：24/24 通过。
- Git 路径与外部目录链接检查：9 通过，4 项需 Windows symlink 权限的测试跳过；明确授权的 Windows junction 场景通过。
- 用相邻 CLI 仓库的原生安装器安装独立临时 AgentRoot，未复制用户凭据；Pi 1.4.0、10 个精确固定包、预编译扩展均加载成功。当前与旧版扩展目录检测及真实权限集成：11/11 通过，包括模式切换、拒绝 Web 替换工具、ASK 审批/拒绝/取消和原生 shell。测试使用模拟模型，未调用付费模型。扩展会保留运行句柄，该组测试使用 Node `--test-force-exit`，没有跳过断言。
- 实际桌面生产后端的远程入口：HTTP 认证、cookie、Host/Origin、CSRF、Web API、模式命令、Debug、SSE 与重连检查通过。
- 隔离桌面生产构建成功，内置 Node 与 PTY 工作正常。启动源包含 2,073 个脚本；真实后端启动并访问 `/`、`/api/sessions`、`/api/agent/running`，单个模块源码读取 **0**，Next VM 数据清单读取 **3**。本次记录启动至 ready 1,192ms，仅为本机单次证据，不与历史构建作性能对比。

## 全套测试的已知 Windows 基线问题

全套运行 3,213 项：3,176 通过、24 跳过、13 失败。随后修复唯一新增的 Windows junction 回归并通过专门测试。其余 12 个失败均在原基线 `2a330cc` 的独立 worktree 中重现，涉及 POSIX 文件模式/只读目录、HOME 与 USERPROFILE 显示路径、shell 环境变量与平台分隔符假设。没有把这些失败记为通过，也没有为本次集成修改其无关实现。

日志位于忽略的 `.local/upstream-013-*.log`；临时 AgentRoot 为 `.local/upstream013-agent`。Linux 未在此 Windows 环境本地运行，独立 PR 的 Linux CI 结果应与上述本机结果分开查看。

Linux CI：PR #2 的 [checks 与 e2e](https://github.com/Jeoitim/my-slim-pi-web/actions/runs/41002878806) 和 [build](https://github.com/Jeoitim/my-slim-pi-web/actions/runs/41002878834) 全部通过。首轮 e2e 发现旧定位规则同时匹配组头与预览按钮，已将匹配限定为组头开头后重跑通过。PR 已以 merge commit `3139b83` 合入 `my-slim-pi-web`，保留完整上游历史。
