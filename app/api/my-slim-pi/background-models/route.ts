import { NextResponse } from "next/server";
import { saveHermesModel } from "@/lib/my-slim-pi-agents";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("model" in body)) {
    return NextResponse.json({ error: "model must be the only field" }, { status: 400 });
  }
  try { return NextResponse.json({ profile: await saveHermesModel((body as { model: unknown }).model) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
}
