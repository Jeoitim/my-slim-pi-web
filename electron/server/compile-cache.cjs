const { join } = require("node:path");
const { enableCompileCache, constants } = require("node:module");

function enableDesktopCompileCache(root, dev) {
  if (dev || process.env.NODE_DISABLE_COMPILE_CACHE === "1") return "disabled";
  // Built with the bundled Node and portable relative paths. Missing, stale or
  // unwritable caches must never prevent the application from starting.
  try {
    const { status } = enableCompileCache({ directory: join(root, ".compile-cache"), portable: true });
    return status === constants.compileCacheStatus.ENABLED || status === constants.compileCacheStatus.ALREADY_ENABLED
      ? "enabled" : "unavailable";
  } catch { return "unavailable"; }
}

module.exports = { enableDesktopCompileCache };
