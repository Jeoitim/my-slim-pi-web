const { join } = require("node:path");
const { readFileSync } = require("node:fs");
const { generateKeyPairSync } = require("node:crypto");
const { createRequire } = require("node:module");
const { createListeners } = require("./listeners.cjs");
const { validatePatch } = require("../main/settings.cjs");

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Desktop backend requires Node.js 24+");
let listeners, nextApp, stopping = false;
let queue = Promise.resolve();
const send = message => { if (process.connected) process.send(message); };
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 8000);
  deadline.unref();
  // Existing SDK signal handlers also dispose PTYs and AgentSession wrappers.
  await listeners?.stop();
  await nextApp?.close();
  process.exit(0);
}
process.once("disconnect", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
process.on("message", message => {
  if (message?.type === "stop") {
    // Keep the original SDK/terminal shutdown hooks in the same process.
    process.emit("SIGTERM");
    return;
  }
  queue = queue.then(async () => {
    if (message?.type === "start" && !listeners) {
      const { root, dev, token } = message;
      process.chdir(root);
      process.env.NODE_ENV = dev ? "development" : "production";
      process.env.PI_DESKTOP_BUILD = "1";
      if (dev) process.env.PI_DESKTOP_DEV = "1";
      const keys = generateKeyPairSync("ed25519");
      // Only the public verification key enters Next or subprocess environments.
      process.env.PI_DESKTOP_INGRESS_PUBLIC_KEY = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
      const projectRequire = createRequire(join(root, "package.json"));
      const conf = dev ? undefined : JSON.parse(readFileSync(join(root, ".desktop/next/required-server-files.json"), "utf8")).config;
      // Match Next's generated standalone bootstrap. Custom-server prepare() does
      // not forward `conf` to its router; without this it searches parent folders
      // for next.config.ts/.env and can compile source config on an installed launch.
      if (conf) process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(conf);
      else delete process.env.__NEXT_PRIVATE_STANDALONE_CONFIG;
      const next = projectRequire("next");
      nextApp = next({ dev, dir: root, turbopack: dev || undefined, webpack: !dev || undefined, conf, hostname: "127.0.0.1" });
      await nextApp.prepare();
      listeners = createListeners({ token, privateKey: keys.privateKey, handler: nextApp.getRequestHandler(), upgrade: nextApp.getUpgradeHandler() });
      const internalUrl = await listeners.start();
      send({ type: "ready", internalUrl, nodeVersion: process.versions.node });
    } else if (message?.type === "configure" && listeners) {
      try {
        const settings = validatePatch(message.settings);
        if (settings.externalControl && !process.env.PI_WEB_PASSWORD) throw new Error("Set PI_WEB_PASSWORD before enabling external control");
        const externalUrl = await listeners.configure(settings);
        send({ type: "configured", id: message.id, externalUrl });
      } catch (error) {
        const code = ["EADDRINUSE", "EACCES"].includes(error.code) ? error.code : null;
        send({ type: "configured", id: message.id, error: code
          ? `${code}: cannot bind 127.0.0.1:${message.settings.port}; the previous service is preserved.`
          : "Cannot enable external control. Check PI_WEB_PASSWORD and desktop settings." });
      }
    }
  }).catch(() => {
    send({ type: "failed", error: "Next.js could not start. Check the packaged resources, Node.js version, and desktop logs." });
    void stop();
  });
});
