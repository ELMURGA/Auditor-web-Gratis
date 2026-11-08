// Datos de campo REALES: Chrome UX Report (usuarios reales de Chrome, últimos 28 días).
// - Con CRUX_API_KEY: CrUX API (por URL y por origen) + CrUX History API (tendencia semanal).
// - Sin clave: usa solo el bloque de datos de campo (loadingExperience) de la API de PageSpeed,
//   que es el MISMO dataset de CrUX. Se ignora a propósito el informe de laboratorio (Lighthouse).

export type FormFactor = "PHONE" | "TABLET" | "DESKTOP" | "ALL";

export const METRICS = {
  largest_contentful_paint: { label: "LCP", name: "Carga del contenido principal", unit: "ms", good: 2500, poor: 4000, core: true },
  interaction_to_next_paint: { label: "INP", name: "Respuesta a la interacción", unit: "ms", good: 200, poor: 500, core: true },
  cumulative_layout_shift: { label: "CLS", name: "Estabilidad visual", unit: "", good: 0.1, poor: 0.25, core: true },
  first_contentful_paint: { label: "FCP", name: "Primer contenido visible", unit: "ms", good: 1800, poor: 3000, core: false },
  experimental_time_to_first_byte: { label: "TTFB", name: "Respuesta del servidor", unit: "ms", good: 800, poor: 1800, core: false },
  round_trip_time: { label: "RTT", name: "Latencia de red de los usuarios", unit: "ms", good: 75, poor: 275, core: false },
} as const;
export type MetricKey = keyof typeof METRICS;

// Nombres de las métricas en la respuesta de PageSpeed (loadingExperience)
const PSI_KEYS: Record<string, MetricKey> = {
  LARGEST_CONTENTFUL_PAINT_MS: "largest_contentful_paint",
  INTERACTION_TO_NEXT_PAINT: "interaction_to_next_paint",
  CUMULATIVE_LAYOUT_SHIFT_SCORE: "cumulative_layout_shift",
  FIRST_CONTENTFUL_PAINT_MS: "first_contentful_paint",
  EXPERIMENTAL_TIME_TO_FIRST_BYTE: "experimental_time_to_first_byte",
};

export type Rating = "good" | "needs-improvement" | "poor";
export type FieldMetric = {
  key: MetricKey;
  p75: number;
  rating: Rating;
  distribution: { good: number; ni: number; poor: number }; // 0..1
};
export type FieldRecord = {
  scope: "url" | "origin";
  formFactor: FormFactor;
  period?: { first: string; last: string };
  metrics: FieldMetric[];
  formFactors?: Record<string, number>;
  navigationTypes?: Record<string, number>;
  lcpResourceType?: Record<string, number>;
  lcpSubparts?: Record<string, number>;
  passesCwv: boolean | null; // Core Web Vitals: LCP, INP y CLS en "bueno" a p75
};
export type HistoryPoint = { date: string; p75: Partial<Record<MetricKey, number | null>> };

export function rate(key: MetricKey, v: number): Rating {
  const m = METRICS[key];
  return v <= m.good ? "good" : v > m.poor ? "poor" : "needs-improvement";
}

const fmtDate = (d?: { year: number; month: number; day: number }) =>
  d ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "";

function passes(metrics: FieldMetric[]): boolean | null {
  const core = ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"] as const;
  const found = core.map((k) => metrics.find((m) => m.key === k));
  // Igual que Google: si INP no tiene datos, se evalúa con LCP y CLS
  if (!found[0] || !found[2]) return null;
  return found.filter(Boolean).every((m) => m!.rating === "good");
}

type CruxHistogram = { start: number | string; end?: number | string; density?: number }[];

function fromCrux(record: any, scope: "url" | "origin", formFactor: FormFactor): FieldRecord {
  const metrics: FieldMetric[] = [];
  for (const key of Object.keys(METRICS) as MetricKey[]) {
    const m = record.metrics?.[key];
    if (!m?.percentiles) continue;
    const p75 = Number(m.percentiles.p75);
    const h: CruxHistogram = m.histogram ?? [];
    metrics.push({ key, p75, rating: rate(key, p75), distribution: { good: h[0]?.density ?? 0, ni: h[1]?.density ?? 0, poor: h[2]?.density ?? 0 } });
  }
  const sub: Record<string, number> = {};
  for (const k of ["largest_contentful_paint_image_time_to_first_byte", "largest_contentful_paint_image_resource_load_delay", "largest_contentful_paint_image_resource_load_duration", "largest_contentful_paint_image_element_render_delay"]) {
    const p = record.metrics?.[k]?.percentiles?.p75;
    if (p != null) sub[k.replace("largest_contentful_paint_image_", "")] = Number(p);
  }
  return {
    scope, formFactor,
    period: record.collectionPeriod ? { first: fmtDate(record.collectionPeriod.firstDate), last: fmtDate(record.collectionPeriod.lastDate) } : undefined,
    metrics,
    formFactors: record.metrics?.form_factors?.fractions,
    navigationTypes: record.metrics?.navigation_types?.fractions,
    lcpResourceType: record.metrics?.largest_contentful_paint_resource_type?.fractions,
    lcpSubparts: Object.keys(sub).length ? sub : undefined,
    passesCwv: passes(metrics),
  };
}

const CRUX = "https://chromeuxreport.googleapis.com/v1/records";

async function cruxQuery(kind: "queryRecord" | "queryHistoryRecord", body: Record<string, unknown>, key: string) {
  const res = await fetch(`${CRUX}:${kind}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null; // CrUX no tiene suficientes visitas para esta URL/origen
  if (!res.ok) throw new Error(`CrUX ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).record;
}

export async function getFieldData(pageUrl: string, origin: string) {
  const key = process.env.CRUX_API_KEY;
  if (key) return getFromCruxApi(pageUrl, origin, key);
  return getFromPsi(pageUrl);
}

async function getFromCruxApi(pageUrl: string, origin: string, key: string) {
  const ffs: FormFactor[] = ["PHONE", "TABLET", "DESKTOP"];
  const jobs = ffs.flatMap((ff) => [
    cruxQuery("queryRecord", { url: pageUrl, formFactor: ff }, key).then((r) => (r ? fromCrux(r, "url", ff) : null)),
    cruxQuery("queryRecord", { origin, formFactor: ff }, key).then((r) => (r ? fromCrux(r, "origin", ff) : null)),
  ]);
  const all = cruxQuery("queryRecord", { origin }, key).then((r) => (r ? fromCrux(r, "origin", "ALL") : null));
  const records = (await Promise.all([...jobs, all])).filter(Boolean) as FieldRecord[];

  const history: Record<string, HistoryPoint[]> = {};
  await Promise.all(ffs.map(async (ff) => {
    const r = await cruxQuery("queryHistoryRecord", { origin, formFactor: ff, collectionPeriodCount: 25 }, key).catch(() => null);
    if (!r) return;
    history[ff] = (r.collectionPeriods ?? []).map((p: any, i: number) => {
      const p75: HistoryPoint["p75"] = {};
      for (const k of Object.keys(METRICS) as MetricKey[]) {
        const v = r.metrics?.[k]?.percentilesTimeseries?.p75s?.[i];
        p75[k] = v == null ? null : Number(v);
      }
      return { date: fmtDate(p.lastDate), p75 };
    });
  }));
  return { source: "crux-api" as const, records, history };
}

async function getFromPsi(pageUrl: string) {
  const records: FieldRecord[] = [];
  await Promise.all((["PHONE", "DESKTOP"] as const).map(async (ff) => {
    const qs = new URLSearchParams({ url: pageUrl, strategy: ff === "PHONE" ? "mobile" : "desktop", category: "performance" });
    if (process.env.PSI_API_KEY) qs.set("key", process.env.PSI_API_KEY);
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(60_000) });
    if (res.status === 429) throw new Error("Google ha agotado la cuota gratuita sin clave. Configura CRUX_API_KEY en .env.local (es gratis) para tener datos de usuarios reales.");
    if (!res.ok) throw new Error(`PageSpeed API ${res.status}`);
    const j = await res.json();
    for (const [scope, le] of [["url", j.loadingExperience], ["origin", j.originLoadingExperience]] as const) {
      if (!le?.metrics || (scope === "url" && le.origin_fallback)) continue;
      const metrics: FieldMetric[] = [];
      for (const [psiKey, m] of Object.entries<any>(le.metrics)) {
        const key = PSI_KEYS[psiKey];
        if (!key) continue;
        const p75 = key === "cumulative_layout_shift" ? m.percentile / 100 : m.percentile;
        const d = m.distributions ?? [];
        metrics.push({ key, p75, rating: rate(key, p75), distribution: { good: d[0]?.proportion ?? 0, ni: d[1]?.proportion ?? 0, poor: d[2]?.proportion ?? 0 } });
      }
      records.push({ scope, formFactor: ff, metrics, passesCwv: passes(metrics) });
    }
  }));
  return { source: "psi-field" as const, records, history: {} as Record<string, HistoryPoint[]> };
}
