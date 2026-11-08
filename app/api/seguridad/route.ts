import { NextRequest, NextResponse } from "next/server";
import { analyzeSecurity } from "@/lib/security";
import { FetchError } from "@/lib/safe-fetch";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit("sec:" + ip, 8)) return NextResponse.json({ error: "Demasiadas peticiones. Espera un minuto." }, { status: 429 });
  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (url.length > 2048) return NextResponse.json({ error: "URL demasiado larga." }, { status: 400 });
  try {
    return NextResponse.json(await analyzeSecurity(url), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (!(e instanceof FetchError)) console.error(e);
    return NextResponse.json({ error: e instanceof FetchError ? e.message : "Error inesperado al analizar la seguridad." }, { status: 400 });
  }
}
