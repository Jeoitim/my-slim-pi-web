const { mkdir, readFile, writeFile, rename } = require("node:fs/promises");
const { dirname } = require("node:path");

const defaults = Object.freeze({ externalControl: false, port: 30141 });
function validatePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)
    || Object.keys(patch).some(key => !["externalControl", "port"].includes(key))) {
    throw new Error("Invalid desktop settings");
  }
  if ("externalControl" in patch && typeof patch.externalControl !== "boolean") throw new Error("Invalid switch value");
  if ("port" in patch && (!Number.isInteger(patch.port) || patch.port < 1 || patch.port > 65535)) {
    throw new Error("Port must be an integer from 1 to 65535");
  }
  return patch;
}
async function readSettings(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return { ...defaults, ...validatePatch(value) };
  } catch (error) {
    if (error.code === "ENOENT") return { ...defaults };
    throw new Error("Desktop settings are unreadable. Restore desktop-settings.json from a backup; the file has been preserved.");
  }
}
async function writeSettings(file, settings) {
  validatePatch(settings);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}
module.exports = { defaults, validatePatch, readSettings, writeSettings };
