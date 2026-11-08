import { NextRequest, NextResponse } from "next/server";
import { getFieldData } from "@/lib/crux";
import { measure } from "@/lib/measure";
import { deviceScores, fieldChecks, techScore } from "@/lib/score";
import { FetchError, normalizeUrl } from "@/lib/safe-fetch";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit("perf:" + ip, 6)) return NextResponse.json({ error: "Demasiadas peticiones. Espera un minuto." }, { status: 429 });
  const input = req.nextUrl.searchParams.get("url") ?? "";
  if (input.length > 2048) return NextResponse.json({ error: "URL demasiado larga." }, { status: 400 });
  try {
    const m = await measure(input);
    const u = normalizeUrl(m.finalUrl);
    const field = await getFieldData(u.toString(), u.origin).catch((e) => ({ source: "error" as const, error: (e as Error).message, records: [], history: {} }));
    const checks = [...fieldChecks(field.records, m), ...m.checks];
    const counts = { ok: 0, warn: 0, error: 0, info: 0 };
    checks.forEach((c) => counts[c.status]++);
    return NextResponse.json({ url: input, analyzedAt: new Date().toISOString(), field, devices: deviceScores(field.records), checks, counts, techScore: techScore(m.checks), measurement: m }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const msg = e instanceof FetchError ? e.message : "Error inesperado al analizar la página.";
    if (!(e instanceof FetchError)) console.error(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
