import { NextResponse } from "next/server";
import { detectTerminalShells, terminalShellInfo } from "@/lib/terminal-shells";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { shells, defaultShellId } = detectTerminalShells();
  return NextResponse.json({ shells: shells.map(terminalShellInfo), defaultShellId });
}
