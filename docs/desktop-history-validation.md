# 桌面完整历史修复验证

2026-10-30，Windows x64，版本保持 `0.13.0-jeoitim.1`。

## 原因与修复

在此前同版本的真实打包应用中复现：完整历史的导出接口返回 200，HTML 内有会话数据，但预览窗口的 `javascript:false` 使 `#messages` 始终为空。Pi SDK 的完整历史通过内嵌脚本渲染，单独展示静态 HTML 无法显示正文。

完整历史现在使用独立的只读窗口，保留 SDK 原有页面、思考、工具记录和分支树。仅为精确的本机会话导出地址启用脚本；窗口无 preload、Node 或桌面 IPC，使用独立内存会话和无同源权限的 CSP 沙盒。仅本窗口的 GET 主文档请求可携带内部令牌及主应用的登录凭据，登录 cookie 不写入历史窗口。禁止访问 Agent API、额外网络资源、子框架、重定向和新窗口，其他普通预览继续禁用脚本。

验证期间也观察到旧导出实现启动完整 CLI 时未生成文档便失败。导出现在由有 30 秒时限的独立 Node 进程直接调用 CLI 使用的同一个 SDK `exportFromFile()`，避免为 HTML 生成启动整个 CLI。路径使用独立参数传递，保留原有临时文件清理和深树补丁；Web 与桌面继续使用同一导出接口和 SDK 页面。

## 验证

- 桌面单元检查 26/26；Lint、隔离生产构建及生产 TypeScript 检查通过。
- 最终 NSIS 构建完成后，在同一份 Windows 运行目录分别进行无密码和有密码验收，均通过。原生窗口显示正文、思考、工具结果和内嵌图片；可以切换历史分支、返回主分支、刷新窗口。关闭历史窗口后主界面和桌面能力仍正常，应用退出后后端监听关闭。
- 历史窗口的 `window.origin` 为 `null`，无法读取应用存储，无 `require`、桌面桥或 opener；Agent 读取和创建请求均被阻止。
- 使用含中文和空格的 AgentRoot、工作目录；开启 Web 密码后正常显示和刷新，窗口 cookie 存储不包含主应用登录凭据。
- `electron/scripts/history-viewer-check.mjs` 生成独立的分支会话和桌面配置，可使用 `--password` 验证密码入口，`--baseline` 复现旧白屏。没有调用付费模型或读取个人 Agent 数据。
- 捆绑 Node 24.22.1 和 PTY 工作正常。启动源码包 2,073 个模块；真实后端与 `/`、`/api/sessions`、`/api/agent/running` 验证单个模块源码读取为 0，Next VM 数据清单读取为 3，分别统计。本次 ready 为 964ms，不作版本间性能比较。

旧安装包、校验文件及 blockmap 保存在 `dist-desktop/previous/0.13.0-jeoitim.1-before-history-fix/`。本次不修改版本号，不执行安装程序，不改动个人配置和开发 `.next/`。

NSIS 安装包生成成功：`dist-desktop/My.Slim.Pi.Web.Setup.0.13.0-jeoitim.1.exe`，219,891,568 字节，同名 `.exe.sha256` 已更新。仅解出指定资源进行核对：安装包的宿主 ASAR 与已验收应用哈希一致，历史窗口源码与工作区一致；Web BUILD_ID 与本次构建、运行目录均为 `7L6Q0mnwuSB-itp0NH3et`，服务端版本仍为 `0.13.0-jeoitim.1`。

SHA-256：`6a5b311fd81001fffbd533345c2814a19646114c6ff998110b71853884a52054`。

日志位于忽略目录 `.local/desktop-history-*.log`；窗口截图由完整历史检查脚本保存到本次独立的 `.local/history-viewer-*` 目录。
