// Almacén de mediciones RUM. Por defecto un archivo JSONL local (data/rum.jsonl).
// En Vercel el disco no persiste: para producción conecta Supabase (ver README).
import fs from "node:fs/promises";
import path from "node:path";

export type RumEvent = { t: number; host: string; path: string; device: "mobile" | "tablet" | "desktop"; net: string | null; name: string; value: number };

const FILE = path.join(process.cwd(), "data", "rum.jsonl");

export async function saveEvents(events: RumEvent[]) {
  if (!events.length) return;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rum_events`, {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(events.map((e) => ({ ...e, t: new Date(e.t).toISOString() }))),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return;
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.appendFile(FILE, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

export async function loadEvents(host: string, sinceMs: number): Promise<RumEvent[]> {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const qs = new URLSearchParams({ host: `eq.${host}`, t: `gte.${new Date(sinceMs).toISOString()}`, select: "t,host,path,device,net,name,value", limit: "100000" });
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rum_events?${qs}`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return ((await res.json()) as any[]).map((e) => ({ ...e, t: Date.parse(e.t) }));
  }
  try {
    const txt = await fs.readFile(FILE, "utf8");
    return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l) as RumEvent).filter((e) => e.host === host && e.t >= sinceMs);
  } catch {
    return [];
  }
}
