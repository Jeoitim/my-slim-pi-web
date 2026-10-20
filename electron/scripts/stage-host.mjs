import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, sep } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));
const host = join(root, ".desktop/app");
const icons = join(root, ".desktop/icons");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await mkdir(host, { recursive: true });
await mkdir(icons, { recursive: true });
const png = await require("sharp")(join(root, "electron/assets/icon.svg")).resize(256, 256).png().toBuffer();
await writeFile(join(icons, "icon.png"), png);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
await writeFile(join(icons, "icon.ico"), Buffer.concat([ico, png]));
await cp(join(root, "electron"), join(host, "electron"), { recursive: true, force: true,
  filter: source => !source.includes(`${sep}tests`) && !source.includes(`${sep}scripts`) });
await writeFile(join(host, "package.json"), JSON.stringify({ name: manifest.name, version: manifest.version,
  description: manifest.description, license: manifest.license, author: "My Slim Pi contributors", main: "electron/main/index.cjs" }, null, 2));
console.log("Desktop host and platform icons staged.");
