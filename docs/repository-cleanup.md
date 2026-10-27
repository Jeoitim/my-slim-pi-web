# 仓库清理

根目录的 `clean-local.ps1` 是 Windows / PowerShell 7 仓库维护脚本。它用于清理构建和测试中间产物，不是卸载器，也不处理已安装应用或个人 AgentRoot。

先关闭本仓库的开发服务器、桌面测试及构建进程，预览清单后执行：

```powershell
pwsh -NoProfile -File ./clean-local.ps1
pwsh -NoProfile -File ./clean-local.ps1 -Execute
```

默认只预览，不删除。`-Execute` 清理已知生成目录 `.desktop`、`.next`、`.local`、`test-results`、`coverage`、`out`、`build`，以及 TypeScript 增量缓存、demo 构建输出、已知测试残留、桌面未打包运行目录、blockmap 和 builder 调试配置。`.local` 的原始诊断和截图也属于临时产物；需要长期保留的结论应先写进跟踪的文档。

保留 `node_modules`、Git 元数据、源码、配置和环境文件，以及 `dist-desktop` 中的安装包与 `.sha256`。删除 `.desktop` 也会移除本地打包工具缓存，之后可按正常构建流程重新生成或下载。保留安装包不代表已发布；GitHub Release 仍由发布工作流构建和上传。

脚本在删除前验证仓库标识、绝对路径边界、所有目标的父目录和 Git 跟踪状态；目标本身或父目录是链接时拒绝清理。生成目录内的 junction / 符号链接只删除链接本身，不进入其目标。发现相关进程时停止并报错，不自动终止进程，也不使用 `git clean -fdx`。

验证清理边界：

```powershell
pwsh -NoProfile -File ./scripts/test-clean-local.ps1
```

测试在独立临时 Git 仓库中检查预览不删除、已知产物删除、依赖/配置/安装包保留、重复执行、跟踪文件拒绝，以及目标、父目录和内部 junction 的安全边界。
