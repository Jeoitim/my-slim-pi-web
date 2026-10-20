const http = require("node:http");
const { createHash, timingSafeEqual, sign } = require("node:crypto");
const connections = new WeakMap();

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const failed = error => { server.removeListener("listening", ready); reject(error); };
    const ready = () => { server.removeListener("error", failed); resolve(server); };
    server.once("error", failed);
    server.once("listening", ready);
    server.listen({ host: "127.0.0.1", port, exclusive: true });
  });
}
async function close(server) {
  if (!server) return;
  // Rebinding closes this entrance's streams; clients reconnect to the new entrance.
  await new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
    for (const socket of connections.get(server) ?? []) socket.destroy();
  });
}
function createListeners({ token, privateKey, handler, upgrade = (_req, socket) => socket.destroy() }) {
  const secretHash = createHash("sha256").update(token).digest();
  const signatures = Object.fromEntries(["internal", "external"].map(kind => [kind,
    `${kind}.${sign(null, Buffer.from(`pi-desktop-v1:${kind}`), privateKey).toString("base64")}`]));
  let internal, external;
  const ingress = kind => {
    const authorize = request => {
      const supplied = request.headers["x-pi-desktop-token"];
      const accepted = kind === "external" || (typeof supplied === "string"
        && timingSafeEqual(secretHash, createHash("sha256").update(supplied).digest()));
      // A browser cannot select its privilege level or carry the internal credential forward.
      delete request.headers["x-pi-desktop-token"];
      delete request.headers["x-pi-desktop-ingress"];
      if (accepted) request.headers["x-pi-desktop-ingress"] = signatures[kind];
      return accepted;
    };
    const server = http.createServer((request, response) => {
      if (!authorize(request)) { response.writeHead(403).end("Desktop authentication required"); return; }
      if (kind === "internal" && request.url === "/__desktop-health") {
        response.writeHead(200, { "Cache-Control": "no-store" }).end("ready"); return;
      }
      Promise.resolve(handler(request, response)).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end("Local service request failed");
      });
    });
    // No response timeout: SSE and ASK can remain open indefinitely.
    server.timeout = 0;
    server.requestTimeout = 0;
    server.headersTimeout = 60_000;
    const sockets = new Set();
    connections.set(server, sockets);
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    server.on("upgrade", (request, socket, head) => {
      if (!authorize(request)) { socket.destroy(); return; }
      Promise.resolve(upgrade(request, socket, head)).catch(() => socket.destroy());
    });
    return server;
  };
  return {
    async start() {
      internal = await listen(ingress("internal"), 0);
      return `http://127.0.0.1:${internal.address().port}`;
    },
    async configure(settings) {
      if (!settings.externalControl) { const previous = external; external = undefined; await close(previous); return null; }
      if (external?.address()?.port === settings.port) return `http://127.0.0.1:${settings.port}`;
      // Bind FIRST. A conflict leaves the previous listener and all agent sessions intact.
      const candidate = await listen(ingress("external"), settings.port);
      const previous = external;
      external = candidate;
      await close(previous);
      return `http://127.0.0.1:${settings.port}`;
    },
    async stop() { await Promise.all([close(internal), close(external)]); internal = external = undefined; },
  };
}
module.exports = { createListeners };
