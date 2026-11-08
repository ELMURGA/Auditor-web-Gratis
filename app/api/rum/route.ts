import { NextRequest, NextResponse } from "next/server";
import { saveEvents, summarize, type RumEvent } from "@/lib/rum-store";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LIMITS: Record<string, number> = { LCP: 60_000, INP: 30_000, CLS: 10, FCP: 60_000, TTFB: 60_000 };
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

// Resumen p75 (mismo criterio que Google) de los últimos N días. Con RUM_DASHBOARD_TOKEN, solo con
// cabecera "Authorization: Bearer <token>" (nunca por URL, para que no quede en registros).
export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("site") ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 28));
  if (!host || host.length > 253) return NextResponse.json({ error: "Falta el dominio." }, { status: 400 });
  const token = process.env.RUM_DASHBOARD_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "Acceso no autorizado. Introduce la clave del panel." }, { status: 401 });
  if (!rateLimit("rumq:" + (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"), 30)) return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
  try {
    return NextResponse.json(await summarize(host, days), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("rum summarize", e);
    return NextResponse.json({ error: "No se pudieron leer los datos." }, { status: 502 });
  }
}
