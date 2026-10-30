import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { isMySlimPiAgent, mySlimPiSuiteDirectory } = await jiti.import("./my-slim-pi.ts");
const { readMySlimPiSettings } = await jiti.import("./my-slim-pi-settings.ts");

for (const [suite, bundle] of [["my-slim-pi-suite", "my-slim-pi-suite.compiled.mjs"], ["timrt-suite", "timrt-fast.mjs"]]) {
  test(`managed ownership and settings support the ${suite} CLI layout`, async t => {
    const root = await mkdtemp(join(tmpdir(), "slim-layout-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const directory = join(root, "extensions", suite);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "permissions.ts"), "fixture");
    assert.equal(isMySlimPiAgent(root), false, "an extension alone is not a managed install");
    await mkdir(join(root, "install"));
    await writeFile(join(root, "install/current-version"), "1.4.0");
    assert.equal(isMySlimPiAgent(root), true);
    assert.equal(mySlimPiSuiteDirectory(root), directory);
    await mkdir(join(root, "extensions/pi-permission-suite"));
    await writeFile(join(root, "extensions/pi-permission-suite/config.json"), JSON.stringify({ reviewer: { humanFallback: "pause" } }));
    await writeFile(join(directory, bundle), 'registerCommand("approval-fallback", fixture)');
    assert.equal(readMySlimPiSettings(root).supported, true);
    assert.equal(readMySlimPiSettings(root).humanFallbackEnabled, false);
  });
}
