const { fork } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { join } = require("node:path");
const { EventEmitter } = require("node:events");
const { get } = require("node:http");
const { performance } = require("node:perf_hooks");

function checkHealth(origin, token) {
  return new Promise((resolve, reject) => {
    const request = get(`${origin}/__desktop-health`, { headers: { "x-pi-desktop-token": token } }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", data => { body += data; if (body.length > 64) request.destroy(new Error("Invalid health response")); });
      response.once("end", () => response.statusCode === 200 && body === "ready" ? resolve() : reject(new Error("Local service health check failed")));
      response.once("error", reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error("Local service health check timed out")), 5000);
    request.once("close", () => clearTimeout(deadline));
    request.once("error", reject);
  });
}

class DesktopService extends EventEmitter {
  constructor({ node, root, dev, version, entry = join(__dirname, "../server/index.cjs") }) {
    super();
    Object.assign(this, { node, root, dev, version, entry });
    this.child = null;
    this.origin = "";
    this.token = randomBytes(32).toString("hex");
    this.pending = new Map();
    this.status = { phase: "stopped", externalUrl: null, error: null, passwordConfigured: Boolean(process.env.PI_WEB_PASSWORD), version, nodeVersion: "" };
  }
  state(patch) { Object.assign(this.status, patch); this.emit("status", this.status); }
  async start() {
    const began = performance.now();
    if (this.child) throw new Error("Service is already started");
    this.state({ phase: "starting", error: null });
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.NODE_OPTIONS;
    const child = fork(this.entry, [], {
      execPath: this.node, cwd: this.root, env: environment,
      stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
    });
    this.child = child;
    const mask = text => {
      for (const [key, value] of Object.entries(process.env)) {
        if (value && /(password|secret|token|api_?key)/i.test(key)) text = text.split(value).join("[redacted]");
      }
      return text;
    };
    child.stdout.on("data", data => { if (this.dev) process.stdout.write(mask(data.toString())); });
    child.stderr.on("data", data => { if (this.dev) process.stderr.write(mask(data.toString())); });
    child.on("error", () => {}); // Startup wait below converts spawn errors into a safe UI error.
    child.once("exit", () => {
      if (this.child !== child) return;
      this.child = null;
      this.origin = "";
      for (const entry of this.pending.values()) entry.reject(new Error("The local service stopped"));
      this.pending.clear();
      this.state({ phase: this.status.phase === "stopping" ? "stopped" : "error", externalUrl: null,
        error: this.status.phase === "stopping" ? null : "The local service exited. Retry from Desktop settings or the tray." });
    });
    child.on("message", message => {
      if (message.type !== "configured") return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error));
      else { this.state({ externalUrl: message.externalUrl, error: null }); pending.resolve(); }
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error("Local service startup timed out")), 90_000);
        const onError = () => finish(new Error("Cannot start the bundled Node.js runtime"));
        const onExit = () => finish(new Error("Local service exited before becoming ready"));
        const onMessage = message => {
          if (message.type === "failed") finish(new Error(message.error));
          if (message.type !== "ready") return;
          if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(message.internalUrl)) { finish(new Error("Invalid service readiness message")); return; }
          this.origin = message.internalUrl;
          this.status.nodeVersion = message.nodeVersion;
          finish();
        };
        const finish = error => {
          clearTimeout(timer);
          child.removeListener("message", onMessage); child.removeListener("error", onError); child.removeListener("exit", onExit);
          if (error) reject(error); else resolve();
        };
        child.once("error", onError); child.once("exit", onExit); child.on("message", onMessage);
        child.send({ type: "start", root: this.root, dev: this.dev, token: this.token });
      });
      const backendReadyMs = Math.round(performance.now() - began);
      // Native HTTP avoids initializing a general fetch stack for one loopback probe.
      await checkHealth(this.origin, this.token);
      this.state({ phase: "running", startup: { backendReadyMs, healthReadyMs: Math.round(performance.now() - began) } });
    } catch (error) {
      await this.stop();
      this.state({ phase: "error", error: error.message });
      throw error;
    }
  }
  async configure(settings) {
    if (!this.child || this.status.phase !== "running") throw new Error("Local service is not running");
    const id = randomBytes(12).toString("hex");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Service configuration timed out")); }, 15_000);
      this.pending.set(id, { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.child.send({ type: "configure", id, settings });
    });
  }
  async stop() {
    const child = this.child;
    if (!child) { this.state({ phase: "stopped", externalUrl: null }); return; }
    if (!child.pid) { this.child = null; this.state({ phase: "stopped", externalUrl: null }); return; }
    this.state({ phase: "stopping", externalUrl: null });
    await new Promise(resolve => {
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      if (child.connected) child.send({ type: "stop" }); else child.kill();
    });
  }
}
module.exports = { DesktopService };
