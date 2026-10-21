import { access, cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function stageNextResources(projectRoot) {
  const root = resolve(projectRoot);
  const next = join(root, ".desktop/next");
  const server = join(root, ".desktop/server");
  // Check the new build before clearing this fixed, generated staging directory.
  await Promise.all([
    access(join(next, "standalone/.desktop/next/BUILD_ID")),
    access(join(next, "static")),
    access(join(root, "public")),
  ]);
  // Running a staged server creates route-cache entries beside its build files.
  // Merging the next build into that directory can serve an earlier HTML shell.
  await rm(server, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await mkdir(server, { recursive: true });
  await cp(join(next, "standalone"), server, { recursive: true });
  await cp(join(next, "static"), join(server, ".desktop/next/static"), { recursive: true });
  await cp(join(root, "public"), join(server, "public"), { recursive: true });
}
