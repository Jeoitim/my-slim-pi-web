# 0.13.0 折叠交互验证

2026-10-30，Windows x64，Node 24.22.1，版本 `0.13.0-jeoitim.1`。上游集成独立于本功能，见 [PR #2](https://github.com/Jeoitim/my-slim-pi-web/pull/2) 和 [集成验证](upstream-013-validation.md)；本次交互改动为 [PR #3](https://github.com/Jeoitim/my-slim-pi-web/pull/3)。终端输入与 Shell 检测仍保留独立提交 `2a330cc`。

## 行为与页面验收

- 设置 → 常规 → 对话中的“默认折叠处理详情”默认开启，浏览器保存选择。开启后，处理过程从第一次思考或工具调用开始折叠。
- 单行预览直接使用原有思考/工具卡片的字形、边框、颜色和工具耗时。思考取最新非空行；工具结果和图片不挤入这行。预览可实际滚动回看最近活动，持续显示滚动条，点击可展开完整过程。
- 自动跟随最新活动；手动向上滚动后保留阅读位置，收起后重新跟随最新活动。展开后保留全部原始消息，过程区域最多 420px 且不超过可用视口的一半，可用键盘滚动。
- 任务完成后隐藏活动预览，保留可展开的过程头部；手动展开状态在完成时保留。最终回复、流式最终回复和提供方错误继续显示在过程区域之外。
- 关闭开关立即恢复原有平铺显示，历史和运行中的消息均不再有过程组高度限制或内部滚动。刷新后保留关闭选择，重新开启即时生效。单个思考/工具卡片自己的原有控制不变。
- 真实生产页面在 1280×800 浅色和 390×844 深色下通过上述交互、键盘和无横向溢出检查。中文设置行已在两种宽度下截图检查。

验收脚本：`node e2e/process-details.mjs`。使用隔离 AgentRoot 与确定性 SSE，不调用付费模型，不读取个人会话。截图与 HTML 保存在忽略目录 `test-results/process-details/`。Chromium 验收明确取消其默认 `--hide-scrollbars` 参数，确保截图也能检查实际滚动条。

## 字体、测试与生产构建

- 页面显式保留简体中文字体回退。浏览器字形证据：预览中的中文实际使用 Microsoft YaHei，西文使用原有 Noto Sans Mono。两个 HTML 快照均通过严格 fontcheck：0 错误、0 警告。
- 思考/工具渲染与活动边界检查 59/59；字体及浏览器偏好检查 19/19；终端/Shell 回归检查 21/21。
- 类型检查、Lint、隔离桌面生产构建通过。保留已有导出路由动态依赖警告，不把它记录成构建错误。
- 内置 Node 与 PTY 验证通过；启动源码包 2,073 个模块。真实后端启动并访问 `/`、`/api/sessions`、`/api/agent/running`，单个模块源码读取 **0**，Next VM 数据清单读取 **3**，分别统计。本机本次 ready 为 1,466ms，不作跨版本性能比较。
- [Linux CI](https://github.com/Jeoitim/my-slim-pi-web/actions/runs/41003811622)：Web 套件 3,218 项，3,216 通过、2 跳过、0 失败；桌面单元检查 24/24；类型、Lint 和页面 E2E 均通过。之后的文档与验收脚本变更由 PR 最终检查再次验证。
- 完整 Windows 套件的既有平台限制见 [集成验证](upstream-013-validation.md)。本功能没有将这些基线失败改记为通过；Linux/macOS 原生桌面安装包未在 Windows 上交叉构建。

本机日志：`.local/process-details-tests.log`、`.local/process-details-settings-tests.log`、`.local/process-details-terminal-regression.log`、`.local/process-details-e2e-final.log`、`.local/process-details-desktop-build-final.log`。生成资源位于 `.desktop/`，未使用开发 `.next/`。
