# Cloudflare Tunnel 与远程访问

本地使用直接打开 `http://127.0.0.1:30141`。远程方案是可选项；不要将这个可读写文件、执行命令的 Agent 直接绑定到公网地址。权限模式是个人操作防误触机制，不能代替认证或操作系统隔离。

## 先配置 Access，再启用 Tunnel

在自己的 Cloudflare 控制台的 Zero Trust → Access controls → Applications，为将使用的域名建立 [Self-hosted Access 应用](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)。应用覆盖**整个域名及全部路径**，配置只允许本人/指定身份的 Allow 策略，启用身份提供者的多因素认证；不要设置 Everyone、Bypass 或仅保护首页的路径规则。应用策略和 Tunnel 由用户本人配置，本项目不创建账户资源或保存 Cloudflare 凭据。

选择自己控制的域名，下面 `agent.example.com`、`<TUNNEL_UUID>`、`<用户目录>` 都必须替换。Tunnel 的服务地址指向 `http://127.0.0.1:30141`；保留外部 Host，不设置将其改写为 localhost 的 `httpHostHeader`。把服务端口留在 loopback，不配置路由器端口转发。

参考 [Cloudflare Tunnel 入门](https://developers.cloudflare.com/tunnel/get-started/)、[本地管理 Tunnel](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/) 和 [Ingress 配置](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/)。也可通过控制台配置 remotely-managed Tunnel；它不需要本地管理所用的账户级证书。认证策略以当前 Cloudflare 控制台为准。

## Web 环境

先停止开发服务并在本地完成 `npm run build`，远程使用生产服务 `npm start`。设置长随机 Web 密码，作为 Access 之外的第二层保护，不复用模型 Key。密码进入当前进程环境，不写进源码、命令行参数、历史或版本库。

Windows / PowerShell 7：

```powershell
cd C:\path\to\my-slim-pi-web
$env:PI_CODING_AGENT_DIR = "$env:USERPROFILE/.pi/agent"
$env:PI_WEB_REMOTE = '1'
$env:PI_WEB_ALLOWED_HOSTS = 'agent.example.com'
$env:PI_WEB_PASSWORD = Read-Host '输入长随机 Web 密码' -MaskInput
npm start
```

Linux / Bash：

```bash
cd /path/to/my-slim-pi-web
export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
export PI_WEB_REMOTE=1
export PI_WEB_ALLOWED_HOSTS=agent.example.com
read -rsp 'Web password: ' PI_WEB_PASSWORD
printf '\n'
export PI_WEB_PASSWORD
npm start
```

`PI_WEB_REMOTE=1` 会对 loopback 上的请求也应用远程认证和入口规则。外部 Host 即使是 IP 地址也会自动进入远程入口，且必须显式列入 `PI_WEB_ALLOWED_HOSTS`；密码缺失时拒绝访问。始终设置 remote 标记，以免其他代理改写 Host 造成误判。不要用 `dev:lan` / `start:lan` 对外暴露服务。

## cloudflared 示例

从官方来源安装 `cloudflared` 后，在**另一个终端**按需运行。下列命令会创建 Tunnel 和 DNS 记录，应由用户在自己的账户执行。

Windows 与 Linux 通用：

```text
cloudflared tunnel login
cloudflared tunnel create my-slim-pi-web
cloudflared tunnel route dns <TUNNEL_UUID> agent.example.com
```

在用户自己的 `.cloudflared/config.yml` 中配置：

```yaml
tunnel: <TUNNEL_UUID>
# Windows 示例：C:/Users/<用户名>/.cloudflared/<TUNNEL_UUID>.json
# Linux 示例：/home/<用户名>/.cloudflared/<TUNNEL_UUID>.json
credentials-file: <用户目录>/.cloudflared/<TUNNEL_UUID>.json
ingress:
  - hostname: agent.example.com
    service: http://127.0.0.1:30141
  - service: http_status:404
```

PowerShell：

```powershell
cloudflared tunnel --config "$env:USERPROFILE/.cloudflared/config.yml" ingress validate
cloudflared tunnel --config "$env:USERPROFILE/.cloudflared/config.yml" run <TUNNEL_UUID>
```

Bash：

```bash
cloudflared tunnel --config "$HOME/.cloudflared/config.yml" ingress validate
cloudflared tunnel --config "$HOME/.cloudflared/config.yml" run <TUNNEL_UUID>
```

不要把 Tunnel 凭据、账户证书、Access 服务 Token 或实际密码放入仓库。无人值守运行应使用系统服务管理器自己的受保护凭据机制。不要将随机 Quick Tunnel 当成已经配置 Access 的安全部署。

## 服务端边界

继续复用上游签名 Cookie、密码比对、登录/Basic 请求限速、Host 与跨站 Origin 检查。HTTPS/可信反向代理的 `X-Forwarded-Proto: https` 使登录 Cookie 带 `Secure`；Cookie 同时保留 `HttpOnly` 与 `SameSite=Lax`。外部域名必须精确列出，不使用通配符。API 的 Basic Auth 也需要经过 Access，不能因知道密码而绕过外层认证。

远程 API 使用服务端白名单；新上游路由默认不开放。已审查的 Web 功能与桌面窗口一致，包括会话重命名和删除、模型与密钥设置、技能和 MCP 管理、文件操作、终端及 Agent 命令。桌面宿主的密码、端口、退出与重启仍只经 Electron IPC 管理；打开本机文件管理器也只供本机使用。

这些直接 Web 操作不会触发 Agent 的 `tool_call`，不能称为受四模式保护。启用外部控制前应确认 Web 密码和 Access 策略只允许受信任的人使用。文件查看与上传沿用服务端路径授权，也不经过 Agent 审批。

## SSE、长任务与验收

上游 SSE 保留 `text/event-stream`、`no-cache, no-transform`、`X-Accel-Buffering: no`、30 秒心跳与断线重连/审批重放。不要为 `/api/*`、登录或 SSE 添加缓存规则，不要在中间代理缓冲事件。ASK 无限等待由 Agent 保持，不能用 HTTP 超时替代授权；网络断线不默认批准。

部署后按顺序验收：未登录 Access 被拒绝；通过 Access 后仍需 Web 密码；新会话能逐块收到回复；长任务保持事件流；ASK 等待至少 90 秒仍不执行，批准/拒绝只作用于当前调用；断网重连重放未完成请求；Stop/关闭会话不执行待批工具；会话重命名、设置保存与终端在浏览器可用；检查 Cookie 属性、异常 Host、跨站请求和未知 API 拒绝。

本次已验证本地 SDK/审批、SSE 和应用层认证边界。**没有用户的真实 Tunnel/Access 配置，尚未完成经 Cloudflare 公网链路的端到端验收。** 本地测试通过不等于 Tunnel、Access 会话过期或实际运营商网络已验证。具体结果见 [兼容报告](compatibility.md)。
