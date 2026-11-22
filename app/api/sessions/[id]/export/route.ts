import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { promisify } from "util";
import { pathToFileURL } from "url";
import { NextResponse } from "next/server";
import { resolveSessionPath } from "@/lib/session-reader";
import { contentDisposition } from "@/lib/content-disposition";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

type PiCodingAgentModule = {
  getPackageDir: () => string;
};

async function getPiPackageDir(): Promise<string | null> {
  try {
    const { getPackageDir } = (await import("@earendil-works/pi-coding-agent")) as PiCodingAgentModule;
    return getPackageDir();
  } catch {
    return null;
  }
}

async function exportSession(filePath: string, outputPath: string): Promise<void> {
  const packageDir = await getPiPackageDir();
  if (!packageDir) throw new Error("pi export helper not found");

  const exporterUrl = pathToFileURL(join(packageDir, "dist", "core", "export-html", "index.js")).href;
  // Keep large exports off the Agent's event loop, without booting the entire
  // CLI (providers, terminals and extensions) just to call this SDK function.
  await execFileAsync(process.execPath, [
    "--input-type=module", "--eval",
    "const { exportFromFile } = await import(process.argv[1]); await exportFromFile(process.argv[2], process.argv[3]);",
    exporterUrl, filePath, outputPath,
  ], {
    cwd: process.cwd(),
    windowsHide: true,
    timeout: 30_000,
    env: { ...process.env, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" },
    maxBuffer: 1024 * 1024,
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const inline = new URL(req.url).searchParams.get("inline") === "1";

  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Per-request private directory. A fixed /tmp/pi-web-export is created by
    // whichever OS user runs the first WebUI process; other users on the same
    // host then cannot write into it and history export fails.
    const tempDir = mkdtempSync(join(tmpdir(), "pi-web-export-"));
    const sessionBase = basename(filePath, ".jsonl");
    const fileName = `pi-session-${sessionBase}.html`;
    const outputPath = join(tempDir, `${randomUUID()}.html`);

    try {
      await exportSession(filePath, outputPath);

      const html = readFileSync(outputPath, "utf8");
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", fileName, "session.html"),
          "Cache-Control": "no-cache",
          "Content-Security-Policy": "frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
        },
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
