import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = manifest.version;
const [operation, argument] = process.argv.slice(2);

function fail(message) { throw new Error(message); }

async function assets(directory, extension) {
  const names = (await readdir(directory)).filter(name => name.endsWith(extension));
  if (names.length !== 1 || !names[0].includes(version)) {
    fail(`Expected exactly one ${version} ${extension} asset in ${directory}; found ${names.join(", ") || "none"}`);
  }
  return names[0];
}

async function digest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

if (operation === "verify-tag") {
  const tag = argument;
  if (!/^v\d+\.\d+\.\d+-jeoitim\.[1-9]\d*$/.test(tag) || tag !== `v${version}`) {
    fail(`Tag ${tag} must match the fork package version v${version}`);
  }
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  if (lock.version !== version || lock.packages?.[""]?.version !== version) {
    fail("package-lock.json must match package.json");
  }
  const notes = await readFile(join(root, "docs/releases", `${version}.md`), "utf8");
  if (!notes.trim()) fail(`Missing release notes for ${version}`);
  console.log(`Release tag, lockfile, and notes match ${version}`);
} else if (operation === "checksum") {
  const extension = { windows: ".exe", linux: ".AppImage" }[argument];
  if (!extension) fail("checksum expects windows or linux");
  const directory = join(root, "dist-desktop");
  const name = await assets(directory, extension);
  const hash = await digest(join(directory, name));
  await writeFile(join(directory, `${name}.sha256`), `${hash}  ${name}\n`);
  console.log(`${name}: ${hash}`);
} else if (operation === "verify-download") {
  if (!argument) fail("verify-download expects an asset directory");
  for (const extension of [".exe", ".AppImage"]) {
    if (extension === ".AppImage" && !(await readdir(argument)).some(name => name.endsWith(extension))) {
      console.log("No Linux AppImage was built; publishing the Windows installer only");
      continue;
    }
    const name = await assets(argument, extension);
    const checksum = await readFile(join(argument, `${name}.sha256`), "utf8");
    const expected = `${await digest(join(argument, name))}  ${basename(name)}\n`;
    if (checksum !== expected) fail(`Checksum mismatch for ${name}`);
    console.log(`Verified ${name}`);
  }
} else {
  fail("Usage: release-artifacts.mjs verify-tag <tag> | checksum <windows|linux> | verify-download <directory>");
}
