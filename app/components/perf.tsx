"use client";
// Piezas del informe de velocidad (datos reales de Chrome + medición del servidor).
import { useEffect, useState } from "react";
import { METRICS, type FieldRecord, type HistoryPoint, type MetricKey } from "@/lib/crux";
import type { Measurement, PerfCheck } from "@/lib/measure";
import { DEVICE_LABEL, type DeviceScore, type Device } from "@/lib/score";

type Field = { source: string; error?: string; records: FieldRecord[]; history: Record<string, HistoryPoint[]> };
export type PerfResult = { analyzedAt: string; field: Field; devices: DeviceScore[]; checks: PerfCheck[]; counts: Record<string, number>; techScore: number | null; measurement: Measurement };

const ORDER = { error: 0, warn: 1, info: 2, ok: 3 } as const;
const GROUPS: [PerfCheck["group"], string][] = [
  ["experiencia", "Usuarios reales"], ["servidor", "Servidor y red"], ["render", "Carga y renderizado"],
  ["imagenes", "Imágenes"], ["peso", "Peso y recursos"], ["compresion", "Caché y compresión"],
];
const STATUS_LABEL = { ok: "Correcto", warn: "Aviso", error: "Error", info: "Información" } as const;

export const secs = (ms: number) => `${(ms / 1000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
export const fmt = (k: MetricKey, v: number) => (METRICS[k].unit === "ms" ? (v >= 1000 ? `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} s` : `${Math.round(v)} ms`) : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const kb = (b: number | null) => (b == null ? "—" : b >= 1e6 ? `${(b / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 2 })} MB` : `${Math.round(b / 1024).toLocaleString("es-ES")} KB`);
export const pct = (x: number) => `${Math.round(x * 100)} %`;

export function Dist({ d, label }: { d: { good: number; ni: number; poor: number }; label: string }) {
  return (
    <div className="dist" role="img" aria-label={`${label}: ${pct(d.good)} bueno, ${pct(d.ni)} mejorable, ${pct(d.poor)} malo`}>
      <span className="g" style={{ flex: d.good }} /><span className="n" style={{ flex: d.ni }} /><span className="p" style={{ flex: d.poor }} />
    </div>
  );
}

export function PerfChecks({ checks, counts }: { checks: PerfCheck[]; counts: Record<string, number> }) {
  return (
    <section className="section panel" aria-labelledby="perf-all-h">
      <header><h2 id="perf-all-h">Los {checks.length} controles de velocidad</h2><span className="meta">{counts.ok} bien · {counts.warn} avisos · {counts.error} errores</span></header>
      {GROUPS.map(([g, label]) => {
        const items = checks.filter((c) => c.group === g).sort((a, b) => ORDER[a.status] - ORDER[b.status]);
        if (!items.length) return null;
        return (
          <table className="checks" key={g}>
            <caption>{label}</caption>
            <tbody>{items.map((c) => (
              <tr key={c.id}>
                <td><span className={`dot ${c.status}`} role="img" aria-label={STATUS_LABEL[c.status]} /></td>
                <td className="name">{c.label}</td>
                <td>{c.message}{c.value && <div className="val">{c.value}</div>}</td>
              </tr>))}</tbody>
          </table>
        );
      })}
    </section>
  );
}

export function Issues({ issues }: { issues: PerfCheck[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? issues : issues.slice(0, 6);
  return (
    <>
      <ol className="fixes">
        {shown.map((c, i) => (
          <li key={c.id}>
            <span className="rank">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="fix-head"><h3>{c.label}</h3><span className={`pill ${c.status}`}>{c.status === "error" ? "Importante" : c.status === "warn" ? "Mejorable" : "Opcional"}</span></div>
              <p className="fix-why">{c.message}</p>
              <p className="fix-do">{c.fix}</p>
            </div>
          </li>
        ))}
      </ol>
      {issues.length > 6 && <button className="ghost more" onClick={() => setAll(!all)}>{all ? "Ver menos" : `Ver los ${issues.length}`}</button>}
    </>
  );
}

const PHASES: [keyof Measurement["median"], string, string][] = [
  ["dnsMs", "DNS", "#8a8a8a"], ["connectMs", "Conexión", "#b4b4b4"], ["tlsMs", "Cifrado (TLS)", "#d6d6d6"], ["ttfbMs", "Espera del servidor", "var(--brand)"], ["downloadMs", "Descarga del HTML", "#f4f4f4"],
];
export function Connection({ m }: { m: Measurement }) {
  const t = m.median;
  return (
    <section className="panel" aria-labelledby="con-h">
      <header><h2 id="con-h">La conexión</h2><span className="meta num">{t.totalMs} ms en total</span></header>
      <div className="wf" role="img" aria-label={PHASES.map(([k, l]) => `${l} ${t[k]} ms`).join(", ")}>
        {PHASES.map(([k, l, c]) => <span key={k} title={`${l}: ${t[k]} ms`} style={{ flex: Math.max(t[k], 1), background: c }} />)}
      </div>
      <ul className="kv">
        {PHASES.map(([k, l, c]) => <li key={k}><span className="k"><i className="sw" style={{ background: c }} />{l}</span><span className="v">{t[k]} ms</span></li>)}
      </ul>
      <p className="meta" style={{ margin: "10px 0 0" }}>Mediana de {m.runs.length} conexiones nuevas ({m.runs.map((x) => x.totalMs).join(", ")} ms) · {m.protocol.alpn === "h2" ? "HTTP/2" : m.protocol.alpn ?? "HTTP/1.1"}{m.server.cdn ? ` · ${m.server.cdn}` : ""}</p>
    </section>
  );
}

const TYPE_LABEL: Record<string, string> = { html: "HTML", js: "JavaScript", css: "CSS", img: "Imágenes", font: "Fuentes", video: "Vídeo", iframe: "Iframes" };
export function Weight({ m }: { m: Measurement }) {
  const rows = Object.entries(m.totals.byType).sort((a, b) => b[1].bytes - a[1].bytes);
  const max = Math.max(...rows.map(([, v]) => v.bytes), 1);
  return (
    <section className="panel" aria-labelledby="w-h">
      <header><h2 id="w-h">Lo que pesa</h2><span className="meta num">{kb(m.totals.bytes)} · {m.totals.requests} peticiones</span></header>
      <ul className="kv">
        {rows.map(([k, v]) => (
          <li key={k} style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span className="k">{TYPE_LABEL[k] ?? k} <span className="meta">{v.count}</span></span><span className="v">{kb(v.bytes)}</span></div>
            <div style={{ height: 2, marginTop: 6, background: "var(--raised)" }}><div style={{ height: 2, width: `${(v.bytes / max) * 100}%`, background: k === rows[0][0] ? "var(--text)" : "var(--faint)" }} /></div>
          </li>
        ))}
      </ul>
      {m.totals.thirdPartyBytes > 0 && <p className="meta" style={{ margin: "10px 0 0" }}>{kb(m.totals.thirdPartyBytes)} vienen de otros dominios</p>}
    </section>
  );
}

const CORE: MetricKey[] = ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"];
export function ByDevice({ r, initial }: { r: PerfResult; initial: Device }) {
  const devs = r.devices.filter((d) => d.score != null).map((d) => d.device);
  const [dev, setDev] = useState<Device>(devs.includes(initial) ? initial : devs[0]);
  const rec = r.field.records.find((x) => x.formFactor === dev && x.scope === "url") ?? r.field.records.find((x) => x.formFactor === dev && x.scope === "origin");
  const hist = r.field.history[dev];
  return (
    <section className="section panel" aria-labelledby="dev-h">
      <header><h2 id="dev-h">Cada métrica, por dispositivo</h2><span className="meta">Percentil 75: el 75 % de las visitas igual o mejor</span></header>
      <div className="tabs" role="group" aria-label="Dispositivo">
        {devs.map((d) => <button key={d} aria-pressed={d === dev} onClick={() => setDev(d)}>{DEVICE_LABEL[d]}</button>)}
      </div>
      {rec && (
        <table className="metrics">
          <thead><tr><th>Métrica</th><th className="r">Valor</th><th>Visitas</th><th className="r">Estado</th></tr></thead>
          <tbody>
            {rec.metrics.map((x) => (
              <tr key={x.key}>
                <td><div className="mname">{METRICS[x.key].label}{METRICS[x.key].core ? " · Core Web Vital" : ""}</div><div className="mdesc">{METRICS[x.key].name}</div></td>
                <td className="p75 r">{fmt(x.key, x.p75)}</td>
                <td className="distcol"><Dist d={x.distribution} label={METRICS[x.key].name} /><div className="meta" style={{ marginTop: 4 }}>{pct(x.distribution.good)} buenas · {pct(x.distribution.poor)} malas</div></td>
                <td className="r"><span className={`pill ${x.rating}`}>{x.rating === "good" ? "Bueno" : x.rating === "poor" ? "Malo" : "Mejorable"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rec?.lcpSubparts && (
        <p className="meta" style={{ marginTop: 12 }}>Desglose de la carga principal: espera del servidor {Math.round(rec.lcpSubparts.time_to_first_byte ?? 0)} ms · retraso en empezar a cargar la imagen {Math.round(rec.lcpSubparts.resource_load_delay ?? 0)} ms · descarga de la imagen {Math.round(rec.lcpSubparts.resource_load_duration ?? 0)} ms · pintado {Math.round(rec.lcpSubparts.element_render_delay ?? 0)} ms</p>
      )}
      {hist && hist.length > 2 && <Trend hist={hist} />}
    </section>
  );
}

function Trend({ hist }: { hist: HistoryPoint[] }) {
  const [k, setK] = useState<MetricKey>("largest_contentful_paint");
  const pts = hist.map((h) => ({ date: h.date, v: h.p75[k] })).filter((p): p is { date: string; v: number } => p.v != null);
  if (pts.length < 2) return null;
  const W = 1000, H = 180, L = 44, B = 22;
  const meta = METRICS[k];
  const top = Math.max(...pts.map((p) => p.v), meta.good) * 1.15;
  const step = niceStep(top / 4);
  const yMax = Math.ceil(top / step) * step;
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - 8);
  const y = (v: number) => (H - B) - (v / yMax) * (H - B - 8);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(pts.length / 6);
  const fmtTick = (v: number) => (meta.unit === "ms" ? (v >= 1000 ? `${(v / 1000).toLocaleString("es-ES")} s` : `${v} ms`) : v.toLocaleString("es-ES"));
  const last = pts[pts.length - 1], firstP = pts[0];
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <h3>Evolución semanal · {fmt(k, firstP.v)} → {fmt(k, last.v)}</h3>
        <div className="tabs" role="group" aria-label="Métrica" style={{ margin: 0 }}>
          {CORE.map((c) => <button key={c} aria-pressed={c === k} onClick={() => setK(c)}>{METRICS[c].label}</button>)}
        </div>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución de ${meta.name}: de ${fmt(k, firstP.v)} a ${fmt(k, last.v)}`}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#3a3a3a" : "#222"} strokeWidth="1" /><text x={L - 8} y={y(t) + 4} textAnchor="end">{fmtTick(t)}</text></g>)}
          <line x1={L} x2={W} y1={y(meta.good)} y2={y(meta.good)} stroke="var(--positive)" strokeDasharray="4 4" strokeWidth="1" opacity=".7" />
          <text x={W - 4} y={y(meta.good) - 6} textAnchor="end" style={{ fill: "var(--positive)" }}>Bueno hasta {fmtTick(meta.good)}</text>
          <polyline points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
          <circle cx={x(pts.length - 1)} cy={y(last.v)} r="4" fill="var(--text)" />
          {pts.map((p, i) => (i % labelEvery === 0 || i === pts.length - 1) && (i === pts.length - 1 || pts.length - 1 - i >= labelEvery / 2) ? <text key={p.date} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}>{new Date(p.date + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</text> : null)}
        </svg>
      </div>
    </div>
  );
}
function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function Resources({ m }: { m: Measurement }) {
  const [all, setAll] = useState(false);
  const rows = all ? m.resources : m.resources.slice(0, 10);
  return (
    <section className="section panel" aria-labelledby="res-h">
      <header><h2 id="res-h">Recursos de la página</h2><span className="meta">{m.resources.length} archivos, del más pesado al más ligero</span></header>
      <table className="res">
        <colgroup><col /><col className="c-type" style={{ width: 110 }} /><col style={{ width: 90 }} /><col className="c-cache" style={{ width: 210 }} /></colgroup>
        <thead><tr><th>Archivo</th><th className="h-type">Tipo</th><th className="r">Peso</th><th className="h-cache">Caché</th></tr></thead>
        <tbody>
          {rows.map((x) => {
            const u = new URL(x.url); const file = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
            return (
              <tr key={x.url}>
                <td className="u" title={x.url}><b>{decodeURIComponent(file).slice(0, 60)}</b> {x.thirdParty && <span className="meta">· {u.hostname}</span>}{x.renderBlocking && <span className="c-warn"> · bloquea la carga</span>}{x.status && x.status >= 400 && <span className="c-error"> · error {x.status}</span>}</td>
                <td className="t-type">{TYPE_LABEL[x.type] ?? x.type}</td>
                <td className="r num">{kb(x.bytes)}</td>
                <td className="u t-cache">{x.cache ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {m.resources.length > 10 && <button className="ghost more" onClick={() => setAll(!all)}>{all ? "Ver menos" : `Ver los ${m.resources.length}`}</button>}
    </section>
  );
}
