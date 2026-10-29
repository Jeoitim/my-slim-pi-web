# 终端输入与 Shell 切换验证

2026-10-30，Windows x64，版本 `0.12.2-jeoitim.9`。本次独立于此前过程折叠功能提交。

## 排查与行为

干净启动 `.8` 打包程序时，实际键盘可输入命令并执行。因此没有将用户报告的所有“无法输入”情况归为一个已证明的原因。本次修复了两条具体路径：

- 旧客户端会因 `navigator.onLine === false` 跳过终端 SSE 连接，并在 `offline` 事件上关闭它；桌面的 loopback 后端即使仍可访问，也因此无法输入。现在以真实连接状态判断，不再用外网状态阻止本地终端。
- 点击 xterm 外围的留白区不能可靠获得输入焦点。生产页面键盘测试先复现了只调用 `focus()` 仍被浏览器默认点击行为移走焦点的情况；修正为仅在 `.xterm` 外阻止默认指针行为并聚焦，保留其内部的文字选择。

终端头部新增 Shell 选择器，自动检测已安装的 PowerShell 7、Windows PowerShell、CMD、Git Bash；Unix 尊重可用的 `$SHELL`，并检测 zsh、bash、fish、sh。Windows 新终端优先 PowerShell 7。只检查绝对 PATH 和常见安装位置中的可执行文件，不运行探测命令，不把 System32 的 WSL `bash.exe` 当成 Git Bash。

选择 Shell 会打开或聚焦同一目录下该 Shell 的终端，已有终端及任务继续运行；标签显示 Shell 名称。刷新保留终端身份与进程，重启保留 Shell，文件区再次打开终端时优先保留当前所选终端。浏览器只能提交服务端识别的 Shell ID，不能提交可执行路径、命令行、环境或额外参数。终端创建继续检查工作目录，Shell 列表 API 继续使用既有 Web 密码与 Host/Origin 边界。

## 验证

- 终端、Shell 检测、标签恢复、输入队列、远程路由和翻译专项：27/27 通过。
- 权限回归：7 通过、1 跳过；真实 My Slim Pi 隔离安装集成未启用。
- 桌面单元检查：24/24 通过。
- Lint 通过。生产构建中的 TypeScript 检查通过。
- `npm run test:terminal:shells` 完整通过：四种已安装 Shell 的真实键盘输入及工作目录、离线 loopback、留白聚焦、切换与刷新后原进程/环境变量保留、重连、非默认 Windows PowerShell 重启及窄屏无横向溢出。
- `npm run test:desktop:terminal` 在 `.9` 的实际 `win-unpacked` 产物上完整通过同一组输入检查，正常 Quit 后宿主退出码 0、后端监听关闭。测试在 Quit 前断开其 CDP 调试连接，没有使用强制退出替代成功断言。
- 中文组合输入使用 Chromium 的 IME composition 协议验证；没有人工操作系统输入法候选窗口。保留 xterm 的屏幕阅读器支持，未为满足直接 `insertText` 的人工事件而关闭它。
- 桌面及 390px 页面截图已检查，保存在忽略目录 `test-results/terminal-shells/`。
- 最终隔离桌面构建与 NSIS 打包均通过；捆绑 Node 24.22.1 与真实 PTY 验证通过。启动源码包为 2,072 个模块，实际单独模块源码读取 0，Next VM 数据清单读取 3，单独统计。
- 完整 Web 套件本次没有重跑；此前运行的限制见 [process-folding-validation.md](process-folding-validation.md)。

Shell 与输入验收脚本为 `e2e/terminal-shells.mjs`：`npm run test:terminal:shells` 使用隔离生产后端，`npm run test:desktop:terminal` 使用实际打包应用。脚本通过真实键盘输入和输出行断言验证，不用向输入 API 发送命令代替键盘。测试使用独立 AgentRoot、HOME、配置及历史目录，没有调用付费模型或修改个人会话。

生产构建输出在 `.desktop/`，没有使用开发 `.next/`。安装器生成后仅运行 `win-unpacked` 验收，不执行安装或远程发布。Linux/macOS 原生终端本次没有执行，只验证了其检测规则。

## 构建产物

安装包：`dist-desktop/My.Slim.Pi.Web.Setup.0.12.2-jeoitim.9.exe`，219,724,987 字节（约 209.5 MiB）。已生成同名 `.exe.sha256` 文件；此前安装包保留。打包服务端的版本与最终生产 BUILD_ID 已核对一致。

SHA-256：

```text
6bfd6b7790d2a41595ab02ae44d49a14b968f5cbf51b20f961f840990cf27615
```

原始结果位于忽略目录 `.local/terminal-unit-final.log`、`.local/terminal-lint-final.log`、`.local/terminal-permissions.log`、`.local/terminal-desktop-unit.log`、`.local/terminal-shells-web-final.log`、`.local/terminal-shells-desktop.log`、`.local/terminal-desktop-build.log`、`.local/terminal-desktop-pack.log`。本次测试进程均已结束。
