import { NextRequest, NextResponse } from "next/server";
import { analyzeSeo } from "@/lib/analyze";
import { FetchError } from "@/lib/safe-fetch";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit("seo:" + ip, 10)) return NextResponse.json({ error: "Demasiadas peticiones. Espera un minuto." }, { status: 429 });
  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (url.length > 2048) return NextResponse.json({ error: "URL demasiado larga." }, { status: 400 });
  try {
    const report = await analyzeSeo(url);
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const msg = e instanceof FetchError ? e.message : "Error inesperado al analizar la página.";
    if (!(e instanceof FetchError)) console.error(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
