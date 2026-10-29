import { stat } from "fs/promises";
import { resolve } from "path";
import { NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { createTerminal, getTerminalShell } from "@/lib/terminal-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { id?: unknown; cwd?: unknown; cols?: unknown; rows?: unknown; shellId?: unknown };
    if (body.shellId !== undefined && (typeof body.shellId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(body.shellId))) {
      return NextResponse.json({ error: "Invalid terminal shell" }, { status: 400 });
    }
    if (body.id !== undefined && (typeof body.id !== "string" || !/^[a-f0-9]{32}$/.test(body.id))) {
      return NextResponse.json({ error: "Invalid terminal id" }, { status: 400 });
    }
    if (typeof body.cwd !== "string" || !body.cwd.trim()) {
      return NextResponse.json({ error: "cwd required" }, { status: 400 });
    }
    const cwd = resolve(body.cwd);
    if (!(await stat(cwd)).isDirectory()) {
      return NextResponse.json({ error: "cwd must be a directory" }, { status: 400 });
    }
    const roots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, roots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const id = createTerminal(
      cwd,
      typeof body.cols === "number" ? body.cols : 80,
      typeof body.rows === "number" ? body.rows : 24,
      body.id as string | undefined,
      body.shellId as string | undefined,
    );
    return NextResponse.json({ id, shell: getTerminalShell(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
