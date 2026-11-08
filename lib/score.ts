// Nota de experiencia por dispositivo, calculada SOLO con datos de usuarios reales (CrUX):
// para cada Core Web Vital, % de visitas buenas (+ media puntuación las mejorables), ponderado.
import { METRICS, type FieldRecord, type MetricKey } from "./crux";
import type { Measurement, PerfCheck } from "./measure";

export type Device = "PHONE" | "TABLET" | "DESKTOP";
export const DEVICE_LABEL: Record<Device, string> = { PHONE: "Móvil", TABLET: "Tablet", DESKTOP: "Ordenador" };

const WEIGHTS: Partial<Record<MetricKey, number>> = { largest_contentful_paint: 0.35, interaction_to_next_paint: 0.3, cumulative_layout_shift: 0.25, first_contentful_paint: 0.1 };

export type DeviceScore = {
  device: Device;
  scope: "url" | "origin" | null;
  score: number | null;          // 0–100
  grade: "Excelente" | "Buena" | "Mejorable" | "Mala" | null;
  goodLoadShare: number | null;  // % de visitas con LCP bueno
  lcpP75: number | null;         // ms: el 75% ve el contenido principal antes de esto
  passesCwv: boolean | null;
  share: number | null;          // % del tráfico que viene de este dispositivo
};

export function pickRecord(records: FieldRecord[], device: Device) {
  return records.find((r) => r.scope === "url" && r.formFactor === device) ?? records.find((r) => r.scope === "origin" && r.formFactor === device) ?? null;
}

export function deviceScores(records: FieldRecord[]): DeviceScore[] {
  const all = records.find((r) => r.formFactor === "ALL");
  const shareKey: Record<Device, string> = { PHONE: "phone", TABLET: "tablet", DESKTOP: "desktop" };
  return (["PHONE", "TABLET", "DESKTOP"] as Device[]).map((device) => {
    const rec = pickRecord(records, device);
    const share = all?.formFactors?.[shareKey[device]] ?? null;
    if (!rec || !rec.metrics.length) return { device, scope: null, score: null, grade: null, goodLoadShare: null, lcpP75: null, passesCwv: null, share };
    let sum = 0, wsum = 0;
    for (const m of rec.metrics) {
      const w = WEIGHTS[m.key];
      if (!w) continue;
      sum += w * (m.distribution.good + 0.5 * m.distribution.ni);
      wsum += w;
    }
    const score = wsum ? Math.round((sum / wsum) * 100) : null;
    const lcp = rec.metrics.find((m) => m.key === "largest_contentful_paint");
    return {
      device, scope: rec.scope, score,
      // Si no supera las Core Web Vitals no puede ser "Excelente", aunque la media sea alta
      grade: score == null ? null : score >= 90 && rec.passesCwv !== false ? "Excelente" : score >= 75 ? "Buena" : score >= 50 ? "Mejorable" : "Mala",
      goodLoadShare: lcp ? lcp.distribution.good : null,
      lcpP75: lcp ? lcp.p75 : null,
      passesCwv: rec.passesCwv,
      share,
    };
  });
}

const SUBPART_FIX: Record<string, string> = {
  time_to_first_byte: "La mayor parte del retraso es el servidor: caché de página, CDN o mejor hosting.",
  resource_load_delay: "La imagen principal empieza a descargarse tarde: precárgala (<link rel=\"preload\">) o ponla en el HTML con fetchpriority=\"high\" en vez de cargarla por CSS/JS.",
  resource_load_duration: "La imagen principal tarda en descargarse: redúcela, usa WebP/AVIF y srcset para móvil.",
  element_render_delay: "La imagen ya está pero no se pinta: hay CSS/JS bloqueando o el contenido depende de JavaScript.",
};

// Comprobaciones basadas en usuarios reales, para la lista de "qué mejorar"
export function fieldChecks(records: FieldRecord[], m: Measurement): PerfCheck[] {
  const out: PerfCheck[] = [];
  for (const device of ["PHONE", "TABLET", "DESKTOP"] as Device[]) {
    const rec = pickRecord(records, device);
    if (!rec) continue;
    const dl = DEVICE_LABEL[device].toLowerCase();
    for (const metric of rec.metrics) {
      const meta = METRICS[metric.key];
      if (!meta.core && metric.key !== "first_contentful_paint") continue;
      const v = meta.unit === "ms" ? (metric.p75 >= 1000 ? `${(metric.p75 / 1000).toFixed(2)} s` : `${metric.p75} ms`) : metric.p75.toFixed(2);
      let fix: string | undefined;
      if (metric.rating !== "good") {
        if (metric.key === "largest_contentful_paint") {
          const sub = rec.lcpSubparts ? Object.entries(rec.lcpSubparts).sort((a, b) => b[1] - a[1])[0] : null;
          fix = sub ? SUBPART_FIX[sub[0]] : m.median.ttfbMs > 600 ? SUBPART_FIX.time_to_first_byte : "Optimiza la imagen o el bloque principal de la primera pantalla y quita recursos que bloquean la carga.";
        } else if (metric.key === "interaction_to_next_paint") fix = "Reduce el JavaScript (plugins, chats, píxeles) y divide tareas largas; los móviles modestos lo notan más.";
        else if (metric.key === "cumulative_layout_shift") fix = "Fija el tamaño de imágenes, banners y anuncios; evita insertar contenido encima del ya visible y usa font-display: swap.";
        else fix = "Reduce los recursos que bloquean la carga y mejora la respuesta del servidor.";
      }
      out.push({
        id: `${device}-${metric.key}`, group: "experiencia",
        label: `${meta.label} en ${dl}`,
        value: `${v} · ${Math.round(metric.distribution.good * 100)}% de visitas buenas`,
        status: metric.rating === "good" ? "ok" : metric.rating === "poor" ? "error" : "warn",
        message: `${meta.name}: el 75% de los usuarios reales en ${dl} lo tiene en ${v} o menos${rec.scope === "origin" ? " (dato de todo el sitio)" : ""}.`,
        fix,
      });
    }
  }
  return out;
}

export function techScore(checks: PerfCheck[]) {
  const w = { ok: 1, info: 1, warn: 0.5, error: 0 } as const;
  const scored = checks.filter((c) => c.status !== "info");
  return scored.length ? Math.round((scored.reduce((s, c) => s + w[c.status], 0) / scored.length) * 100) : null;
}
