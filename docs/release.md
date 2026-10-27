# My Slim Pi Web 发布流程

本 fork 的开发与发布分支是 `my-slim-pi-web`。GitHub Release 必须分发 Windows x64 NSIS 安装包；Linux x64 AppImage 在原生构建成功时一同分发。不发布上游 `@agegr/pi-web` npm 包。桌面包在对应的原生系统中构建，内含独立 Node.js 24、npm 与 npx，使用同一 Next.js / Pi SDK 后端。

## 版本与发布说明

版本格式为 `<已审查上游版本>-jeoitim.<修订号>`，例如 `0.12.2-jeoitim.3`；tag 在前面加 `v`。同一上游基准下递增修订号；合入新的上游发布后从 `.1` 开始。同步更新 `package.json`、`package-lock.json` 和 `docs/upstream.md`。在 `docs/releases/<版本>.md` 写好面向用户的说明；工作流直接用此文件作为 GitHub Release 正文。

发布说明应列出可见变化、安装方法、系统架构、已验证范围和已知限制。不要把先前版本的测试结果写成本次已验证结果。

## 发布前检查

在 `my-slim-pi-web` 上完成代码审查与本地验证，确认工作区只包含本次发布的变更。至少运行：

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:permissions
npm run test:desktop
node electron/scripts/release-artifacts.mjs verify-tag v<版本>
```

在 Windows 本机可额外运行 `npm run desktop:build`、`npm run desktop:pack` 和 `node electron/scripts/release-artifacts.mjs checksum windows` 检查实际安装包。桌面构建使用 `.desktop/`，不会覆盖开发用的 `.next/`。检查 `git ls-remote --tags origin v<版本>`，确保没有同名远程 tag。

## 触发发布

本地构建和验收完成后，可使用仓库清理脚本移除中间产物：先运行 `pwsh -NoProfile -File ./clean-local.ps1` 预览，再加 `-Execute` 执行。它保留依赖、配置以及 `dist-desktop` 安装包和校验文件；详细边界与脚本测试见 [仓库清理](repository-cleanup.md)。清理不代替发布校验，Release 附件仍由 GitHub runner 重新构建。

把已验证的发布提交推送到 `origin/my-slim-pi-web`，再只推送本次 tag：

```sh
git tag -a v<版本> -m "v<版本>"
git push origin my-slim-pi-web
git push origin v<版本>
```

不要使用 `git push --tags`。`.github/workflows/desktop-release.yml` 只响应 `v*-jeoitim.*` tag，并在构建前核对 tag 与两个包清单版本、发布说明。校验通过后，Windows 和 Linux runner 分别执行 `npm ci`、隔离桌面构建及打包。Windows 包必须成功且下载后的 SHA256 再次匹配，才会创建 GitHub Release；Linux 打包成功时也校验并附上 AppImage。桌面打包器不自行发布，只有工作流最后一步上传 Release 附件。可用 CI 的手动桌面打包检查先验证 GitHub runner，不会发布产物。

发布结束后查看 Actions 与 Release 页面，下载 Windows `.exe` 和相邻的 `.sha256` 验证文件名、大小与校验和。如有 Linux `.AppImage`，也验证其校验文件。发布附件使用不含空格的文件名，确保下载后可直接按 `.sha256` 文件核对。Windows 用户运行安装包；Linux 用户先给 AppImage 执行权限再运行。AppImage 的实际运行仍需在目标 Linux 桌面环境验证。当前没有代码签名，Windows 可能显示 SmartScreen 提示。

若构建失败且尚未创建 Release，可先撤回失败的 tag，修复并经 GitHub 构建验证后重新推送同名 tag。已经发布的 tag 不应移动；发布后的代码回退使用新修订号，保持安装包与来源提交可追溯。
