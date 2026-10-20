import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { desktopIngress, isRemoteRequest } from "../../lib/remote-access.ts";
const require = createRequire(import.meta.url);
const { createListeners } = require("../server/listeners.cjs");
const { defaults, validatePatch, readSettings, writeSettings } = require("../main/settings.cjs");
const { isAppUrl, externalLink, assertSender } = require("../main/security.cjs");
const { DesktopService } = require("../main/service.cjs");

test("a missing Node runtime fails promptly and leaves no owned child", async () => {
  const service = new DesktopService({ node: join(tmpdir(), "pi-missing-runtime", "node.exe"), root: process.cwd(), version: "test", dev: false });
  await assert.rejects(service.start(), /Cannot start/);
  assert.equal(service.child, null);
  assert.equal(service.status.phase, "error");
  await service.stop();
  assert.equal(service.status.phase, "stopped");
});

test("desktop settings validate strictly, persist separately and preserve corrupt files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi desktop 中文 "));
  const file = join(dir, "desktop-settings.json");
  try {
    assert.deepEqual(await readSettings(file), defaults);
    for (const port of [0, 65536, 1.5, "30141", null, Infinity]) assert.throws(() => validatePatch({ port }));
    for (const value of [null, [], { externalControl: "true" }, { password: "x" }, { command: "kill" }]) assert.throws(() => validatePatch(value));
    await writeSettings(file, { externalControl: true, port: 65535 });
    assert.deepEqual(await readSettings(file), { externalControl: true, port: 65535 });
    await writeFile(file, "broken settings");
    await assert.rejects(readSettings(file), /preserved/);
    assert.equal(await readFile(file, "utf8"), "broken settings");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("only exact application main frame may invoke desktop capabilities", () => {
  const origin = "http://127.0.0.1:12345";
  const mainFrame = { url: origin + "/?session=one" };
  const contents = { mainFrame };
  const window = { webContents: contents, isDestroyed: () => false };
  const event = { sender: contents, senderFrame: mainFrame };
  assert.doesNotThrow(() => assertSender(event, window, origin));
  for (const url of ["https://evil.example/", "http://127.0.0.1:30141/", origin + "/api/files/uploaded.html", origin + "/api/sessions/x/export", "file:///tmp/x", "http://user@127.0.0.1:12345/"]) {
    mainFrame.url = url;
    assert.throws(() => assertSender(event, window, origin));
    assert.equal(isAppUrl(url, origin), false);
  }
  mainFrame.url = origin;
  assert.throws(() => assertSender({ ...event, senderFrame: { url: origin } }, window, origin));
  assert.throws(() => assertSender({ ...event, sender: {} }, window, origin));
  for (const url of ["file:///x", "javascript:alert(1)", "https://user:secret@x.test", origin]) assert.equal(externalLink(url), null);
  assert.equal(externalLink("https://www.electronjs.org/"), "https://www.electronjs.org/");
});

test("signed ingress cannot be selected by browser headers and does not weaken plain Web", () => {
  const keys = generateKeyPairSync("ed25519");
  const environment = { PI_DESKTOP_INGRESS_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "der" }).toString("base64"), PI_WEB_REMOTE: "1" };
  const marker = kind => `${kind}.${sign(null, Buffer.from(`pi-desktop-v1:${kind}`), keys.privateKey).toString("base64")}`;
  const request = value => new Request("http://127.0.0.1/api/terminal", { headers: { host: "127.0.0.1", "x-pi-desktop-ingress": value } });
  assert.equal(isRemoteRequest(request(marker("internal")), environment), false);
  assert.equal(isRemoteRequest(request(marker("external")), environment), true);
  for (const value of ["internal", "internal.ZmFrZQ==", marker("external").replace("external", "internal"), ""]) {
    assert.equal(isRemoteRequest(request(value), environment), true);
    assert.equal(desktopIngress(request(value), environment.PI_DESKTOP_INGRESS_PUBLIC_KEY), null);
  }
  assert.equal(isRemoteRequest(request(marker("internal")), { PI_WEB_REMOTE: "1" }), true);
  assert.equal(isRemoteRequest(request(""), {}), false);
});

test("one backend: private credential, external toggle, streaming and atomic port rollback", async () => {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  let sharedCounter = 0;
  const listeners = createListeners({ token: "test-secret", privateKey: keys.privateKey, handler: async (request, response) => {
    const kind = desktopIngress(new Request("http://127.0.0.1/", { headers: request.headers }), publicKey);
    if (request.url === "/events") {
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" });
      response.write("data: first\n\n");
      setTimeout(() => response.end("data: second\n\n"), 40);
    } else response.end(JSON.stringify({ counter: ++sharedCounter, kind, credential: request.headers["x-pi-desktop-token"] ?? null }));
  } });
  const blocker = http.createServer();
  await new Promise(resolve => blocker.listen(0, "127.0.0.1", resolve));
  const blockedPort = blocker.address().port;
  const freePort = async () => {
    const probe = http.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
  };
  const port = await freePort();
  const nextPort = await freePort();
  try {
    const origin = await listeners.start();
    assert.equal((await fetch(origin)).status, 403);
    const privateRequest = () => fetch(origin, { headers: { "x-pi-desktop-token": "test-secret" } }).then(r => r.json());
    assert.deepEqual(await privateRequest(), { counter: 1, kind: "internal", credential: null });
    const external = await listeners.configure({ externalControl: true, port });
    const publicResponse = await fetch(external, { headers: { "x-pi-desktop-ingress": "internal.fake", "x-pi-desktop-token": "fake" } }).then(r => r.json());
    assert.deepEqual(publicResponse, { counter: 2, kind: "external", credential: null });
    await assert.rejects(listeners.configure({ externalControl: true, port: blockedPort }), { code: "EADDRINUSE" });
    assert.equal((await fetch(external).then(r => r.json())).counter, 3);
    const stream = await fetch(external + "/events");
    const reader = stream.body.getReader();
    const first = await reader.read(); assert.match(new TextDecoder().decode(first.value), /first/);
    const second = await reader.read(); assert.match(new TextDecoder().decode(second.value), /second/);
    assert.equal((await reader.read()).done, true);
    const changed = await listeners.configure({ externalControl: true, port: nextPort });
    await assert.rejects(fetch(external));
    assert.equal((await fetch(changed).then(r => r.json())).kind, "external");
    await listeners.configure({ externalControl: false, port: nextPort });
    await assert.rejects(fetch(changed));
    assert.equal((await privateRequest()).kind, "internal");
  } finally {
    await listeners.stop();
    await new Promise(resolve => blocker.close(resolve));
  }
});
