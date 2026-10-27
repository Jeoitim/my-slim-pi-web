const { open, mkdir, writeFile, rename, unlink } = require("node:fs/promises");
const { constants } = require("node:fs");
const { dirname } = require("node:path");
const { randomBytes } = require("node:crypto");

function validateWebPassword(value) {
  if (typeof value !== "string" || value.length < 12 || !value.trim() || value.includes("\0") || Buffer.byteLength(value, "utf8") > 1024) {
    throw new Error("PASSWORD_INVALID");
  }
  return value;
}

class DesktopWebPassword {
  constructor({ file, safeStorage, environmentPassword = process.env.PI_WEB_PASSWORD, platform = process.platform }) {
    Object.assign(this, { file, safeStorage, environmentPassword, platform });
    this.saved = false;
    this.source = "none";
    this.error = null;
  }
  environmentControlled() { return typeof this.environmentPassword === "string" && this.environmentPassword.length > 0; }
  async available() {
    try {
      // Never silently use Linux's hardcoded/basic-text fallback as encryption.
      if (this.platform === "linux" && (!this.safeStorage.isEncryptionAvailable()
        || ["basic_text", "unknown"].includes(this.safeStorage.getSelectedStorageBackend()))) return false;
      return await this.safeStorage.isAsyncEncryptionAvailable();
    } catch { return false; }
  }
  async status() {
    return { saved: this.saved, source: this.source, error: this.error, available: await this.available() };
  }
  async load() {
    this.saved = false; this.error = null; this.source = "none";
    let ciphertext;
    let handle;
    try {
      handle = await open(this.file, constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0));
      this.saved = true;
      const info = await handle.stat();
      if (!info.isFile() || info.size === 0 || info.size > 16 * 1024) throw new Error("Invalid encrypted credential");
      ciphertext = await handle.readFile();
    } catch (error) {
      if (error.code !== "ENOENT") { this.saved = true; this.error = "read"; }
    } finally { await handle?.close().catch(() => {}); }
    // Explicit deployment configuration overrides the desktop credential.
    if (this.environmentControlled()) { this.source = "environment"; return this.environmentPassword; }
    if (!ciphertext) return "";
    if (!await this.available()) { this.error = "unavailable"; return ""; }
    try {
      const { result } = await this.safeStorage.decryptStringAsync(ciphertext);
      validateWebPassword(result);
      this.source = "stored";
      return result;
    } catch { this.error = "decrypt"; return ""; }
  }
  async save(value) {
    validateWebPassword(value);
    if (this.environmentControlled()) throw new Error("PASSWORD_ENVIRONMENT_CONTROLLED");
    if (!await this.available()) throw new Error("PASSWORD_STORAGE_UNAVAILABLE");
    const temporary = `${this.file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      const ciphertext = await this.safeStorage.encryptStringAsync(value);
      if (!Buffer.isBuffer(ciphertext) || !ciphertext.length || ciphertext.length > 16 * 1024) throw new Error("Invalid encrypted credential");
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temporary, ciphertext, { flag: "wx", mode: 0o600 });
      await rename(temporary, this.file);
      this.saved = true; this.error = null;
    } catch { throw new Error("PASSWORD_SAVE_FAILED"); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  async remove() {
    try { await unlink(this.file); }
    catch (error) { if (error.code !== "ENOENT") throw new Error("PASSWORD_REMOVE_FAILED"); }
    this.saved = false; this.error = null;
  }
}

module.exports = { DesktopWebPassword, validateWebPassword };
