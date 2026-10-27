import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DesktopWebPassword, validateWebPassword } = require("../main/web-password.cjs");
const { DesktopService } = require("../main/service.cjs");

function encryption() {
  const key = randomBytes(32);
  return {
    isAsyncEncryptionAvailable: async () => true,
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptStringAsync: async value => {
      const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decryptStringAsync: async value => {
      const cipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
      cipher.setAuthTag(value.subarray(12, 28));
      return { result: Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString("utf8"), shouldReEncrypt: false };
    },
  };
}
async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-password-"));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const file = join(root, "desktop-web-password.bin");
  const options = { file, safeStorage: encryption(), environmentPassword: "", platform: "win32", ...overrides };
  return { root, file, options, store: new DesktopWebPassword(options) };
}

test("desktop password validation is bounded and never includes supplied secrets in errors", () => {
  const password = "strong password with spaces";
  assert.equal(validateWebPassword(password), password);
  for (const value of [null, {}, "short", " ".repeat(12), "x".repeat(1025), "汉".repeat(400), "secret\0password"]) {
    assert.throws(() => validateWebPassword(value), { message: "PASSWORD_INVALID" });
  }
});

test("password persistence is encrypted, reloadable, private and separate from settings", async t => {
  const { root, file, options, store } = await fixture(t);
  const password = "test-only-secret-password-一二三";
  let availableCalls = 0;
  const original = options.safeStorage.isAsyncEncryptionAvailable;
  options.safeStorage.isAsyncEncryptionAvailable = async () => { availableCalls++; return original(); };
  assert.equal(await store.load(), "");
  assert.equal(availableCalls, 0, "Missing credentials must not initialize the OS key store during cold startup");
  await writeFile(join(root, "desktop-settings.json"), '{"externalControl":false,"port":30141}');
  await store.save(password);
  assert.equal((await readFile(file)).includes(Buffer.from(password)), false);
  if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
  const reopened = new DesktopWebPassword(options);
  assert.equal(await reopened.load(), password);
  assert.deepEqual(await reopened.status(), { source: "stored", saved: true, available: true, error: null });
  assert.equal(JSON.stringify(await reopened.status()).includes(password), false);
  assert.equal(await readFile(join(root, "desktop-settings.json"), "utf8"), '{"externalControl":false,"port":30141}');
  await reopened.remove();
  assert.equal(await reopened.load(), "");
  await assert.rejects(readFile(file), { code: "ENOENT" });
});

test("environment configuration overrides stored passwords without decrypting or overwriting them", async t => {
  const { options, store, file } = await fixture(t);
  await store.save("original-stored-password");
  const before = await readFile(file);
  const env = new DesktopWebPassword({ ...options, environmentPassword: "environment-password", safeStorage: {
    ...options.safeStorage, decryptStringAsync: async () => { throw new Error("Must not decrypt ignored credential"); },
  } });
  assert.equal(await env.load(), "environment-password");
  assert.equal((await env.status()).source, "environment");
  await assert.rejects(env.save("new-desktop-password"), { message: "PASSWORD_ENVIRONMENT_CONTROLLED" });
  assert.deepEqual(await readFile(file), before);
  await env.remove();
  assert.equal(await env.load(), "environment-password");
});

test("unavailable or basic-text storage never persists a password", async t => {
  for (const platform of ["win32", "linux"]) {
    const safeStorage = { ...encryption(), isAsyncEncryptionAvailable: async () => platform === "linux", getSelectedStorageBackend: () => "basic_text" };
    const { store, file } = await fixture(t, { platform, safeStorage });
    assert.equal(await store.available(), false);
    await assert.rejects(store.save("never-store-this-password"), { message: "PASSWORD_STORAGE_UNAVAILABLE" });
    await assert.rejects(readFile(file), { code: "ENOENT" });
  }
});

test("corruption and encryption/write failures are recoverable without losing the old password", async t => {
  const { file, options, store } = await fixture(t);
  await store.save("previous-password-value");
  const before = await readFile(file);
  options.safeStorage.encryptStringAsync = async value => { throw new Error(value); };
  await assert.rejects(store.save("secret-in-an-internal-error"), { message: "PASSWORD_SAVE_FAILED" });
  assert.deepEqual(await readFile(file), before);
  const reopened = new DesktopWebPassword(options);
  assert.equal(await reopened.load(), "previous-password-value");
  await writeFile(file, "corrupt ciphertext");
  assert.equal(await reopened.load(), "");
  assert.equal((await reopened.status()).error, "decrypt");
  assert.equal(await readFile(file, "utf8"), "corrupt ciphertext");
  await reopened.remove();
  await mkdir(file);
  await assert.rejects(reopened.remove(), { message: "PASSWORD_REMOVE_FAILED" });
  assert.equal((await stat(file)).isDirectory(), true);
  assert.equal(await reopened.load(), "");
  assert.equal((await reopened.status()).error, "read");
  const { file: blockedFile, store: blockedStore } = await fixture(t);
  await mkdir(blockedFile);
  await assert.rejects(blockedStore.save("secret-that-cannot-be-written"), { message: "PASSWORD_SAVE_FAILED" });
  assert.equal((await stat(blockedFile)).isDirectory(), true);
});

test("the bundled backend receives the selected password, not a stale inherited environment", async t => {
  const { root } = await fixture(t);
  const entry = join(root, "backend.cjs");
  await writeFile(entry, `
    const http=require('node:http'),{createHash}=require('node:crypto');let server;
    process.on('message',message=>{
      if(message.type==='start') {server=http.createServer((req,res)=>res.end(req.url==='/__desktop-health'?'ready':JSON.stringify({passwordHash:createHash('sha256').update(process.env.PI_WEB_PASSWORD||'').digest('hex')})));server.listen(0,'127.0.0.1',()=>process.send({type:'ready',internalUrl:'http://127.0.0.1:'+server.address().port,nodeVersion:process.versions.node}));}
      if(message.type==='stop') server.close(()=>process.exit(0));
    });`);
  const previous = process.env.PI_WEB_PASSWORD;
  const testContext = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  process.env.PI_WEB_PASSWORD = "stale-parent-password";
  t.after(() => {
    if (previous === undefined) delete process.env.PI_WEB_PASSWORD; else process.env.PI_WEB_PASSWORD = previous;
    if (testContext !== undefined) process.env.NODE_TEST_CONTEXT = testContext;
  });
  const service = new DesktopService({ root, node: process.execPath, entry, dev: false, version: "test", password: "selected-stored-password" });
  t.after(() => service.stop());
  const hash = value => createHash("sha256").update(value).digest("hex");
  try {
    await service.start();
    assert.equal((await (await fetch(service.origin)).json()).passwordHash, hash("selected-stored-password"));
    assert.equal(process.env.PI_WEB_PASSWORD, "stale-parent-password");
    assert.throws(() => service.setPassword(""), /Stop/);
    await service.stop();
    service.setPassword("");
    await service.start();
    assert.equal((await (await fetch(service.origin)).json()).passwordHash, hash(""));
    assert.equal(service.status.passwordConfigured, false);
  } finally { await service.stop(); }
});
