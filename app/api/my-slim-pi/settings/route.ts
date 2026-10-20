import { NextResponse } from "next/server";
import { readMySlimPiSettings, writeMySlimPiSettings } from "@/lib/my-slim-pi-settings";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(readMySlimPiSettings()); }
  catch (error) { return NextResponse.json({error:error instanceof Error ? error.message : String(error)}, {status:409}); }
}
export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({error:"Untrusted API request"}, {status:403});
  if (!hasJsonContentType(req)) return NextResponse.json({error:"Content-Type must be application/json"}, {status:415});
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({error:"Invalid JSON body"}, {status:400}); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1
    || typeof (body as {humanFallbackEnabled?:unknown}).humanFallbackEnabled !== "boolean") {
    return NextResponse.json({error:"humanFallbackEnabled must be the only field and a boolean"}, {status:400});
  }
  try { return NextResponse.json(await writeMySlimPiSettings((body as {humanFallbackEnabled:boolean}).humanFallbackEnabled)); }
  catch (error) { return NextResponse.json({error:error instanceof Error ? error.message : String(error)}, {status:409}); }
}
