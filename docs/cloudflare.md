# Cloudflare 部署与本地开发

本项目默认使用 Cloudflare Workers 托管静态资源及 HTTP 接口，使用一个 Durable Object 保存在线设备、配对码和房间状态。线上无需 Node.js 主机、Docker 或自建 TURN。

## 本地运行

```sh
npm ci
npm start
```

默认监听 `0.0.0.0:3000`。本机访问 `http://localhost:3000`；同一局域网的其他设备访问 `http://电脑的局域网IP:3000`，例如 `http://192.168.1.10:3000`。地址取决于电脑实际网络，也可能为 `10.x.x.x`。手机不能使用 localhost 访问电脑。路由器设备隔离和防火墙需要允许设备互访。

局域网 HTTP 可用于文件和文字互传；PWA 安装、通知等浏览器安全上下文功能仍需要 HTTPS。

## 发布

```sh
npx wrangler login
npm run check
npm run deploy
```

已配置生产地址：https://air.whogogo.com 。`wrangler.jsonc` 中的自定义域名会随 `npm run deploy` 一同绑定。首次部署会创建 `SignalingHub` Durable Object。静态资源和 `/config`、`/server` WebSocket 均通过同一域名提供。

## 传输模式与隐私

默认 `WS_FALLBACK=true`、`FORCE_WS=true`：即使浏览器支持 WebRTC，也通过 Cloudflare WebSocket 中继文件和文字，不依赖第三方 STUN/TURN。应用不将文件写入数据库或 R2，但中继服务会处理传输内容；这不是 WebRTC 点对点传输，也不提供应用层端到端加密。线上浏览器与 Cloudflare 之间通过 HTTPS/WSS 保护传输。本地 HTTP/WS 不加密。

可以在 `wrangler.jsonc` 中将 `FORCE_WS` 设为 `false`，恢复优先 WebRTC 模式。当前 WebRTC 默认不使用外部 ICE 服务；跨网络的可靠 WebRTC 需要另行配置 ICE 服务。原有 WebSocket fallback 只在设备不支持 WebRTC 时选择中继，不会自动接管失败的 WebRTC 连接。

## 验证

先启动本地服务，再运行：

```sh
npm test
TEST_URL=http://192.168.1.10:3000 npm test
npm run check
```

测试覆盖 HTTP、设备发现、文字中继、设备配对、公共房间和文件分块中继。测试不替代真实手机与电脑之间的完整文件接收验证。

## 运行边界

当前用一个全局 Durable Object 保持配对码和公共房间的原有语义，适合初期部署；大量并发需进一步按房间分片。使用标准 WebSocket API，连接存活期间不会休眠，会产生 Durable Object 活跃时长及请求费用。文件中继同时受 Cloudflare 服务配额和性能限制。

在线房间和待用配对码只在内存中存在；重新部署或对象重启会断开连接，客户端需要重连。已完成配对的 secret 保留在浏览器中，重连后重新加入。没有新增服务端文件存储。

如需使用旧 Node 服务：`npm run start:node`。默认开发和生产部署均以 Workers 为主。
