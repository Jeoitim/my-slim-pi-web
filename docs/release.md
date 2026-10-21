# My Slim Pi Web 发布流程

本 fork 的开发与发布分支是 `my-slim-pi-web`。GitHub Release 分发 Windows x64 NSIS 安装包与 Linux x64 AppImage；不发布上游 `@agegr/pi-web` npm 包。两个桌面包都在对应的原生系统中构建，内含独立 Node.js 24、npm 与 npx，使用同一 Next.js / Pi SDK 后端。

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

把已验证的发布提交推送到 `origin/my-slim-pi-web`，再只推送本次 tag：

```sh
git tag -a v<版本> -m "v<版本>"
git push origin my-slim-pi-web
git push origin v<版本>
```

不要使用 `git push --tags`。`.github/workflows/desktop-release.yml` 只响应 `v*-jeoitim.*` tag，并在构建前核对 tag 与两个包清单版本、发布说明。校验通过后，Windows 和 Linux runner 分别执行 `npm ci`、隔离桌面构建及打包。只有两个平台的包都成功且下载后的 SHA256 再次匹配，才会创建或更新 GitHub Release。一个平台失败时本次不会发布半套产物。重跑同一 tag 会更新说明和同名附件。

发布结束后查看 Actions 与 Release 页面，下载 Windows `.exe` 和 Linux `.AppImage` 验证文件名、大小与相邻的 `.sha256`。Windows 用户运行安装包；Linux 用户先给 AppImage 执行权限再运行。AppImage 的实际运行仍需在目标 Linux 桌面环境验证。当前没有代码签名，Windows 可能显示 SmartScreen 提示。

若构建失败，修复后创建新的修订号与 tag；不要移动已公开的 tag。发布后的代码回退也使用新修订号，保持已发布的安装包与来源提交可追溯。
