import { NextRequest, NextResponse } from "next/server";
import { saveEvents, loadEvents, type RumEvent } from "@/lib/rum-store";
import { rateLimit } from "@/lib/rate-limit";
import { rate, type MetricKey } from "@/lib/crux";

export const runtime = "nodejs";

const LIMITS: Record<string, number> = { LCP: 60_000, INP: 30_000, CLS: 10, FCP: 60_000, TTFB: 60_000 };
const KEY: Record<string, MetricKey> = { LCP: "largest_contentful_paint", INP: "interaction_to_next_paint", CLS: "cumulative_layout_shift", FCP: "first_contentful_paint", TTFB: "experimental_time_to_first_byte" };
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };

// Solo se aceptan datos de los dominios autorizados (RUM_ALLOWED_HOSTS=dazenty.com,cliente.com)
function allowed(host: string) {
  const list = (process.env.RUM_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length === 0 ? process.env.NODE_ENV !== "production" : list.some((h) => host === h || host.endsWith("." + h));
}

export function OPTIONS() { return new NextResponse(null, { headers: cors }); }

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit("rum:" + ip, 60)) return new NextResponse(null, { status: 429, headers: cors });
  try {
    const text = await req.text();
    if (text.length > 5000) return new NextResponse(null, { status: 413, headers: cors });
    const b = JSON.parse(text);
    const page = new URL(String(b.page));
    const host = page.hostname.replace(/^www\./, "");
    if (!allowed(host)) return new NextResponse(null, { status: 403, headers: cors });
    const device = b.device === "mobile" || b.device === "tablet" ? b.device : "desktop";
    const events: RumEvent[] = (Array.isArray(b.metrics) ? b.metrics : []).slice(0, 10)
      .filter((m: any) => m && LIMITS[m.name] !== undefined && typeof m.value === "number" && m.value >= 0 && m.value <= LIMITS[m.name])
      .map((m: any) => ({ t: Date.now(), host, path: page.pathname.slice(0, 300), device, net: typeof b.net === "string" ? b.net.slice(0, 10) : null, name: m.name, value: m.value }));
    await saveEvents(events);
    return new NextResponse(null, { status: 204, headers: cors });
  } catch {
    return new NextResponse(null, { status: 400, headers: cors });
  }
}

// Resumen p75 (mismo criterio que Google) de los últimos N días
export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("site") ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const days = Math.min(90, Number(req.nextUrl.searchParams.get("days")) || 28);
  if (!host) return NextResponse.json({ error: "Falta ?site=dominio" }, { status: 400 });
  if (process.env.RUM_DASHBOARD_TOKEN && req.headers.get("authorization") !== `Bearer ${process.env.RUM_DASHBOARD_TOKEN}` && req.nextUrl.searchParams.get("token") !== process.env.RUM_DASHBOARD_TOKEN)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const events = await loadEvents(host, Date.now() - days * 86400_000);
  const summary: Record<string, Record<string, { n: number; p75: number; rating: string; good: number; ni: number; poor: number }>> = {};
  for (const device of ["mobile", "tablet", "desktop"]) {
    summary[device] = {};
    for (const name of Object.keys(LIMITS)) {
      const vals = events.filter((e) => e.device === device && e.name === name).map((e) => e.value).sort((a, b) => a - b);
      if (!vals.length) continue;
      const p75 = vals[Math.ceil(vals.length * 0.75) - 1];
      const r = vals.map((v) => rate(KEY[name], v));
      summary[device][name] = { n: vals.length, p75, rating: rate(KEY[name], p75), good: r.filter((x) => x === "good").length / vals.length, ni: r.filter((x) => x === "needs-improvement").length / vals.length, poor: r.filter((x) => x === "poor").length / vals.length };
    }
  }
  const pages = Object.entries(events.filter((e) => e.name === "LCP").reduce<Record<string, number[]>>((acc, e) => ((acc[e.path] ??= []).push(e.value), acc), {}))
    .map(([path, v]) => { v.sort((a, b) => a - b); return { path, n: v.length, lcpP75: v[Math.ceil(v.length * 0.75) - 1] }; })
    .sort((a, b) => b.n - a.n).slice(0, 20);
  return NextResponse.json({ host, days, totalEvents: events.length, summary, pages });
}
