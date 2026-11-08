// Almacén de mediciones RUM.
// - Con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: tabla public.rum_events (ver supabase.sql). El resumen
//   (percentil 75 por dispositivo y métrica) lo calcula la base de datos con la función rum_summary.
// - Sin ellas (desarrollo): archivo JSONL local data/rum.jsonl.
import fs from "node:fs/promises";
import path from "node:path";
import { rate, type MetricKey } from "./crux";

export type RumEvent = { t: number; host: string; path: string; device: "mobile" | "tablet" | "desktop"; net: string | null; name: string; value: number };
export type RumStat = { n: number; p75: number; rating: string; good: number; ni: number; poor: number };
export type RumSummary = { host: string; days: number; totalEvents: number; summary: Record<string, Record<string, RumStat>>; pages: { path: string; n: number; lcpP75: number }[] };

const FILE = path.join(process.cwd(), "data", "rum.jsonl");
const KEY: Record<string, MetricKey> = { LCP: "largest_contentful_paint", INP: "interaction_to_next_paint", CLS: "cumulative_layout_shift", FCP: "first_contentful_paint", TTFB: "experimental_time_to_first_byte" };
const DEVICES = ["mobile", "tablet", "desktop"] as const;

const supabase = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
};
// La clave service_role clásica es un JWT (va también como Bearer); las claves secretas nuevas (sb_secret_...) solo en apikey.
const headers = (key: string): Record<string, string> => ({ apikey: key, "content-type": "application/json", ...(key.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}) });

export async function saveEvents(events: RumEvent[]) {
  if (!events.length) return;
  const sb = supabase();
  if (sb) {
    const res = await fetch(`${sb.url}/rest/v1/rum_events`, {
      method: "POST",
      headers: { ...headers(sb.key), prefer: "return=minimal" },
      body: JSON.stringify(events.map((e) => ({ ...e, t: new Date(e.t).toISOString() }))),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return;
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.appendFile(FILE, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

const p75of = (sorted: number[]) => sorted[Math.ceil(sorted.length * 0.75) - 1];

export async function summarize(host: string, days: number): Promise<RumSummary> {
  const since = Date.now() - days * 86400_000;
  const out: RumSummary = { host, days, totalEvents: 0, summary: { mobile: {}, tablet: {}, desktop: {} }, pages: [] };
  const sb = supabase();

  if (sb) {
    const res = await fetch(`${sb.url}/rest/v1/rpc/rum_summary`, {
      method: "POST", headers: headers(sb.key), body: JSON.stringify({ p_host: host, p_since: new Date(since).toISOString() }), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const j = await res.json();
    out.totalEvents = Number(j.totalEvents) || 0;
    for (const r of j.rows ?? []) {
      if (!KEY[r.name] || !out.summary[r.device]) continue;
      out.summary[r.device][r.name] = { n: Number(r.n), p75: Number(r.p75), rating: rate(KEY[r.name], Number(r.p75)), good: Number(r.good), ni: Number(r.ni), poor: Number(r.poor) };
    }
    out.pages = (j.pages ?? []).map((p: any) => ({ path: String(p.path), n: Number(p.n), lcpP75: Number(p.lcpP75) }));
    return out;
  }

  let events: RumEvent[] = [];
  try {
    events = (await fs.readFile(FILE, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as RumEvent).filter((e) => e.host === host && e.t >= since);
  } catch { /* sin datos todavía */ }
  out.totalEvents = events.length;
  for (const device of DEVICES) {
    for (const name of Object.keys(KEY)) {
      const vals = events.filter((e) => e.device === device && e.name === name).map((e) => e.value).sort((a, b) => a - b);
      if (!vals.length) continue;
      const p75 = p75of(vals);
      const r = vals.map((v) => rate(KEY[name], v));
      out.summary[device][name] = { n: vals.length, p75, rating: rate(KEY[name], p75), good: r.filter((x) => x === "good").length / vals.length, ni: r.filter((x) => x === "needs-improvement").length / vals.length, poor: r.filter((x) => x === "poor").length / vals.length };
    }
  }
  const byPath = events.filter((e) => e.name === "LCP").reduce<Record<string, number[]>>((acc, e) => ((acc[e.path] ??= []).push(e.value), acc), {});
  out.pages = Object.entries(byPath).map(([p, v]) => { v.sort((a, b) => a - b); return { path: p, n: v.length, lcpP75: p75of(v) }; }).sort((a, b) => b.n - a.n).slice(0, 20);
  return out;
}
