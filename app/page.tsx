"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SeoReport } from "@/lib/analyze";
import { DEVICE_LABEL, type DeviceScore } from "@/lib/score";
import { Bar, Code, Foot } from "./components/Bar";
import { SecDetails } from "./components/security";
import type { SecurityReport } from "@/lib/security";
import { SITE, WHATSAPP, path } from "@/lib/base";
import { Previews, SeoDetails } from "./components/seo";
import { ByDevice, Connection, Dist, PerfChecks, Resources, Weight, kb, pct, secs, type PerfResult } from "./components/perf";

// La escena 3D se carga aparte y solo en la portada: el informe no paga su peso
const Hero3D = dynamic(() => import("./components/Hero3D"), { ssr: false, loading: () => <div className="h3d" aria-hidden="true" /> });

const EXAMPLES = ["dazenty.com", "stripe.com", "elpais.com"];

type Fix = { key: string; source: "SEO" | "Velocidad" | "Seguridad" | "Privacidad" | "Enlaces"; level: 0 | 1 | 2; label: string; message: string; fix: string; code?: string };
const LEVEL = [{ cls: "alta", label: "Prioridad alta" }, { cls: "media", label: "Prioridad media" }, { cls: "baja", label: "Prioridad baja" }] as const;

function mergeFixes(seo: SeoReport | null, perf: PerfResult | null, sec: SecurityReport | null): Fix[] {
  const out: Fix[] = [];
  for (const c of seo?.checks ?? []) if (c.fix) out.push({ key: "seo-" + c.id, source: "SEO", level: c.priority === "alta" ? 0 : c.priority === "media" ? 1 : 2, label: c.label, message: c.message, fix: c.fix, code: c.code });
  for (const c of perf?.checks ?? []) if (c.fix) out.push({ key: "perf-" + c.id, source: "Velocidad", level: c.status === "error" ? 0 : c.status === "warn" ? 1 : 2, label: c.label, message: c.message, fix: c.fix });
  const SRC = { seguridad: "Seguridad", privacidad: "Privacidad", enlaces: "Enlaces" } as const;
  for (const c of sec?.checks ?? []) if (c.fix && c.status !== "ok") out.push({ key: "sec-" + c.id, source: SRC[c.group], level: c.status === "error" ? 0 : c.status === "warn" ? 1 : 2, label: c.label, message: c.message, fix: c.fix, code: c.code });
  return out.sort((a, b) => a.level - b.level);
}

async function getJson(path: string) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({ error: "Respuesta no válida del servidor." }));
  if (!res.ok) throw new Error(data.error || "No se pudo analizar.");
  return data;
}

export default function Page() {
  const [url, setUrl] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [seo, setSeo] = useState<SeoReport | null>(null);
  const [perf, setPerf] = useState<PerfResult | null>(null);
  const [seoErr, setSeoErr] = useState<string | null>(null);
  const [perfErr, setPerfErr] = useState<string | null>(null);
  const [seoBusy, setSeoBusy] = useState(false);
  const [perfBusy, setPerfBusy] = useState(false);
  const [sec, setSec] = useState<SecurityReport | null>(null);
  const [secErr, setSecErr] = useState<string | null>(null);
  const [secBusy, setSecBusy] = useState(false);
  const run_id = useRef(0);

  function run(target: string) {
    target = target.trim();
    if (!target) return;
    const id = ++run_id.current;
    setUrl(target); setActive(target);
    setSeo(null); setPerf(null); setSec(null); setSeoErr(null); setPerfErr(null); setSecErr(null); setSeoBusy(true); setPerfBusy(true); setSecBusy(true);
    const u = new URL(location.href); u.searchParams.set("url", target); history.replaceState(null, "", u);
    window.scrollTo({ top: 0 });
    const q = encodeURIComponent(target);
    getJson(path(`/api/seo?url=${q}`)).then((d) => id === run_id.current && setSeo(d)).catch((e) => id === run_id.current && setSeoErr(e.message)).finally(() => id === run_id.current && setSeoBusy(false));
    getJson(path(`/api/seguridad?url=${q}`)).then((d) => id === run_id.current && setSec(d)).catch((e) => id === run_id.current && setSecErr(e.message)).finally(() => id === run_id.current && setSecBusy(false));
    getJson(path(`/api/rendimiento?url=${q}`)).then((d) => id === run_id.current && setPerf(d)).catch((e) => id === run_id.current && setPerfErr(e.message)).finally(() => id === run_id.current && setPerfBusy(false));
  }
  useEffect(() => { const q = new URLSearchParams(location.search).get("url"); if (q) run(q); }, []);

  const bothFailed = seoErr && perfErr && secErr;
  const showReport = active && !bothFailed;
  return (
    <>
      <Bar />
      <main>
        {!showReport && <Start url={url} setUrl={setUrl} run={run} error={bothFailed ? seoErr : null} />}
        {showReport && <Report target={active!} seo={seo} perf={perf} sec={sec} seoErr={seoErr} perfErr={perfErr} secErr={secErr} seoBusy={seoBusy} perfBusy={perfBusy} secBusy={secBusy} retry={() => run(active!)} rerun={run} />}
      </main>
      <Foot />
    </>
  );
}

function Start({ url, setUrl, run, error }: { url: string; setUrl: (s: string) => void; run: (s: string) => void; error: string | null }) {
  return (
    <section className="start">
      <div className="hero">
        <div className="hero-copy">
          <h1>Audita tu web gratis: SEO, velocidad y seguridad</h1>
          <p className="lead">Pega la dirección de una página. Ves cómo la ven Google y las redes, la velocidad real de sus visitantes en móvil, tablet y ordenador, si es segura y cumple el RGPD, y qué corregir primero. Con datos reales, no simulados.</p>
          <form className="big-form" onSubmit={(e) => { e.preventDefault(); run(url); }}>
            <label className="sr" htmlFor="u">Dirección de la página</label>
            <input id="u" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="tuweb.com" autoFocus inputMode="url" autoComplete="url" />
            <button className="btn">Auditar la web</button>
          </form>
          <div className="chips">Prueba con {EXAMPLES.map((d) => <button type="button" className="chip" key={d} onClick={() => run(d)}>{d}</button>)}</div>
          {error && <div className="error-box" role="alert"><p><span className="c-error">No se pudo analizar.</span> {error}</p>{url && <button className="ghost" onClick={() => run(url)}>Reintentar</button>}</div>}
        </div>
        <Hero3D />
      </div>

      <div className="strip facts" aria-label="Qué incluye">
        <div><div className="fig lead">60+</div><div className="label">controles de SEO, velocidad y seguridad</div></div>
        <div><div className="fig lead">28 días</div><div className="label">de visitas reales de Chrome, no simulaciones</div></div>
        <div><div className="fig lead">3</div><div className="label">dispositivos: móvil, tablet y ordenador</div></div>
        <div><div className="fig lead">0 €</div><div className="label">sin registrarte ni dejar el correo</div></div>
      </div>

      <div className="covers">
        <div className="cover"><CoverArt kind="seo" /><h2>Google y las redes</h2><p>30 controles SEO: título, descripción, canonical, robots, datos estructurados, encabezados y sitemap. Con la vista previa real en Google, LinkedIn, WhatsApp y X.</p></div>
        <div className="cover"><CoverArt kind="speed" /><h2>Velocidad real</h2><p>Los últimos 28 días de visitantes reales de Chrome, el dato que Google usa para posicionar, más una medición real de tu servidor y el peso de cada archivo. ¿Poco tráfico? <a href={path("/rum")}>Mide a tus visitantes</a>.</p></div>
        <div className="cover"><CoverArt kind="sec" /><h2>Seguridad y RGPD</h2><p>Certificado SSL, cabeceras de seguridad, versiones expuestas, contenido mixto, cookies, textos legales y consentimiento, enlaces rotos y con qué tecnología está hecha la web.</p></div>
      </div>
    </section>
  );
}

// Ilustraciones planas de cada bloque, dibujadas en código con los colores de la marca
function CoverArt({ kind }: { kind: "seo" | "speed" | "sec" }) {
  return (
    <svg className="cover-art" viewBox="0 0 320 130" aria-hidden="true">
      {kind === "seo" && (<>
        <rect x="20" y="16" width="190" height="98" rx="10" fill="#fff" />
        <circle cx="38" cy="34" r="8" fill="#e8e8e8" /><rect x="52" y="27" width="70" height="6" rx="3" fill="#bdbdbd" /><rect x="52" y="37" width="46" height="5" rx="2.5" fill="#d6d6d6" />
        <rect x="32" y="54" width="150" height="9" rx="4.5" fill="#d97762" />
        <rect x="32" y="72" width="164" height="6" rx="3" fill="#cfcfcf" /><rect x="32" y="84" width="140" height="6" rx="3" fill="#cfcfcf" /><rect x="32" y="96" width="90" height="6" rx="3" fill="#e2e2e2" />
        <rect x="226" y="22" width="74" height="52" rx="8" fill="#262626" /><rect x="226" y="22" width="74" height="30" rx="8" fill="#d97762" />
        <rect x="234" y="60" width="44" height="5" rx="2.5" fill="#555" />
        <circle cx="272" cy="100" r="16" fill="#3fc07a" /><path d="M264 100l6 6 11-12" fill="none" stroke="#050505" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      </>)}
      {kind === "speed" && (<>
        {[["Móvil", 68, 0x0, "#3fc07a"], ["Tablet", 52, 1, "#f2b33d"], ["PC", 90, 2, "#3fc07a"]].map(([l, hgt, i, c]) => {
          const x = 54 + (i as number) * 96, hh = hgt as number;
          return (<g key={l as string}>
            <rect x={x} y={22} width="44" height="78" rx="8" fill="#262626" />
            <rect x={x} y={22 + 78 - hh * 0.86} width="44" height={hh * 0.86} rx="8" fill={c as string} />
            <text x={x + 22} y="118" textAnchor="middle" fontSize="11" fill="#b4b4b4" fontFamily="Inter, sans-serif">{l as string}</text>
          </g>);
        })}
        <path d="M20 28h16M20 62h16M20 96h16" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
      </>)}
      {kind === "sec" && (<>
        <path d="M160 12l58 20v34c0 30-24 50-58 60-34-10-58-30-58-60V32z" fill="#262626" stroke="#d97762" strokeWidth="3" strokeLinejoin="round" />
        <rect x="140" y="62" width="40" height="30" rx="6" fill="#d97762" />
        <path d="M148 62v-9a12 12 0 0 1 24 0v9" fill="none" stroke="#d97762" strokeWidth="5" strokeLinecap="round" />
        <circle cx="160" cy="76" r="4.5" fill="#050505" />
        <rect x="244" y="28" width="56" height="8" rx="4" fill="#3fc07a" /><rect x="244" y="46" width="44" height="8" rx="4" fill="#f2b33d" /><rect x="244" y="64" width="50" height="8" rx="4" fill="#3fc07a" />
        <rect x="20" y="28" width="56" height="8" rx="4" fill="#3fc07a" /><rect x="20" y="46" width="40" height="8" rx="4" fill="#3fc07a" /><rect x="20" y="64" width="50" height="8" rx="4" fill="#ef6b7f" />
      </>)}
    </svg>
  );
}

function Report({ target, seo, perf, sec, seoErr, perfErr, secErr, seoBusy, perfBusy, secBusy, retry, rerun }: { target: string; seo: SeoReport | null; perf: PerfResult | null; sec: SecurityReport | null; seoErr: string | null; perfErr: string | null; secErr: string | null; seoBusy: boolean; perfBusy: boolean; secBusy: boolean; retry: () => void; rerun: (u: string) => void }) {
  const [tab, setTab] = useState<"seo" | "vel" | "sec">("seo");
  const finalUrl = seo?.finalUrl ?? perf?.measurement.finalUrl ?? target;
  const host = finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const fixes = mergeFixes(seo, perf, sec);
  const top = fixes[0];
  const period = perf?.field.records.find((x) => x.period)?.period;
  const fdate = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const worst = perf ? [...perf.devices].filter((d) => d.score != null).sort((a, b) => a.score! - b.score!)[0] : undefined;
  const loadingAny = seoBusy || perfBusy || secBusy;
  const pick = (t: "seo" | "vel" | "sec") => {
    setTab(t);
    const bar = document.querySelector(".report-tabs") as HTMLElement | null;
    if (bar && window.scrollY > bar.offsetTop - 60) window.scrollTo({ top: bar.offsetTop - 56 });
  };

  return (
    <>
      <div className="title-row">
        <div style={{ minWidth: 0 }}>
          <h1 className="clamp1" title={finalUrl}>{host}</h1>
          <p className="meta" style={{ marginTop: 4 }}>
            {seo ? `HTTP ${seo.status} · analizada ${new Date(seo.fetchedAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Analizando…"}
            {period ? ` · usuarios reales del ${fdate(period.first)} al ${fdate(period.last)}` : perf ? " · sin datos de usuarios reales en Chrome" : ""}
          </p>
          <p className="finding" aria-live="polite">
            {top ? <>Lo primero: <b>{top.label}</b>. {top.message}</> : loadingAny ? <>Leyendo la página y midiendo su velocidad…</> : <>Todo en orden: no hay nada que corregir.</>}
            {worst && worst.lcpP75 != null && <> En {DEVICE_LABEL[worst.device].toLowerCase()}, el 75 % de las visitas ve el contenido en {secs(worst.lcpP75)} o menos.</>}
          </p>
        </div>
        <div className="title-actions">
          <form className="again" role="search" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("u"); if (v) rerun(String(v)); }}>
            <label className="sr" htmlFor="again-u">Analizar otra página</label>
            <input id="again-u" name="u" className="input" placeholder="Analizar otra web" />
            <button className="ghost" disabled={loadingAny}>Analizar</button>
          </form>
          <div className="title-buttons">
            <button className="ghost" onClick={(e) => { const b = e.currentTarget; navigator.clipboard?.writeText(location.href).then(() => { b.textContent = "Enlace copiado"; setTimeout(() => (b.textContent = "Copiar enlace"), 1600); }).catch(() => {}); }}>Copiar enlace</button>
            <button className="ghost" disabled={loadingAny} onClick={() => window.print()} title={loadingAny ? "Espera a que termine el análisis" : undefined}>Descargar PDF</button>
          </div>
        </div>
      </div>

      <div className="summary" aria-label="Resumen">
        <SeoCard seo={seo} busy={seoBusy} err={seoErr} />
        <SecCard sec={sec} busy={secBusy} err={secErr} />
        {perf ? (perf.devices.every((d) => d.score == null) ? <NoFieldCard perf={perf} /> : perf.devices.map((d) => <DeviceCard key={d.device} d={d} perf={perf} />)) : ["PHONE", "TABLET", "DESKTOP"].map((k) => <PendingCard key={k} title={DEVICE_LABEL[k as "PHONE"]} busy={perfBusy} err={perfErr} />)}
        {perf ? <ServerCard perf={perf} /> : <PendingCard title="Servidor" busy={perfBusy} err={perfErr} />}
      </div>

      <div className="two-one section">
        <section className="panel" aria-labelledby="fix-h">
          <header><h2 id="fix-h">Qué corregir primero</h2><span className="meta">{fixes.length} {fixes.length === 1 ? "cambio" : "cambios"}, por importancia</span></header>
          {fixes.length === 0 && !loadingAny ? <p className="sub" style={{ margin: 0 }}>Nada pendiente. Todo en orden.</p> : <FixList fixes={fixes} />}
          {(perfBusy || secBusy) && <p className="wait" style={{ marginTop: 14 }}><span className="spin" />{perfBusy ? "Midiendo la velocidad" : "Revisando seguridad y enlaces"}: sus mejoras aparecerán aquí en unos segundos.</p>}
          {(seoErr || perfErr || secErr) && <div className="error-box" style={{ background: "var(--raised)" }}><p><span className="c-error">{seoErr ? "No se pudo hacer el análisis SEO." : perfErr ? "No se pudo medir la velocidad." : "No se pudo revisar la seguridad."}</span> {seoErr ?? perfErr ?? secErr}</p><button className="ghost" onClick={retry}>Reintentar</button></div>}
        </section>
        <aside className="panel sticky-rail" aria-labelledby="prev-h">
          <h2 id="prev-h">Así se ve al buscar y compartir</h2>
          {seo ? <Previews r={seo} /> : seoBusy ? <div className="stack"><div className="skel" style={{ height: 120 }} /><div className="skel" style={{ height: 220 }} /></div> : <p className="sub">Sin datos.</p>}
        </aside>
      </div>

      {!loadingAny && fixes.length > 0 && <Cta host={host} fixes={fixes.length} />}

      <div className="report-tabs" role="tablist" aria-label="Detalle del informe">
        <button role="tab" id="t-seo" aria-controls="p-seo" aria-selected={tab === "seo"} onClick={() => pick("seo")}>SEO{seo && <span className="src">{seo.score}/100</span>}</button>
        <button role="tab" id="t-vel" aria-controls="p-vel" aria-selected={tab === "vel"} onClick={() => pick("vel")}>Velocidad{perfBusy ? <span className="spin" /> : perf?.techScore != null && <span className="src">{perf.techScore}/100</span>}</button>
        <button role="tab" id="t-sec" aria-controls="p-sec" aria-selected={tab === "sec"} onClick={() => pick("sec")}>Seguridad y enlaces{secBusy ? <span className="spin" /> : sec && <span className="src">{sec.score}/100</span>}</button>
      </div>
      <div className="tab-body" role="tabpanel" id="p-seo" aria-labelledby="t-seo" hidden={tab !== "seo"}>
        <h2 className="print-only">SEO</h2>
        {seo ? <SeoDetails r={seo} /> : <p className="wait section">{seoBusy ? <><span className="spin" />Analizando…</> : seoErr}</p>}
      </div>
      <div className="tab-body" role="tabpanel" id="p-vel" aria-labelledby="t-vel" hidden={tab !== "vel"}>
        <h2 className="print-only">Velocidad</h2>
        {perf ? (
          <>
            <div className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--gap)", alignItems: "start" }}>
              <Connection m={perf.measurement} />
              <Weight m={perf.measurement} />
            </div>
            {perf.devices.some((d) => d.score != null) && <ByDevice r={perf} initial={worst?.device ?? "PHONE"} />}
            <PerfChecks checks={perf.checks} counts={perf.counts} />
            <Resources m={perf.measurement} />
          </>
        ) : <p className="wait section">{perfBusy ? <><span className="spin" />Midiendo la velocidad real… tarda unos 20 segundos.</> : perfErr}</p>}
      </div>
      <div className="tab-body" role="tabpanel" id="p-sec" aria-labelledby="t-sec" hidden={tab !== "sec"}>
        <h2 className="print-only">Seguridad y enlaces</h2>
        {sec ? <SecDetails r={sec} /> : <p className="wait section">{secBusy ? <><span className="spin" />Revisando seguridad, certificado y enlaces…</> : secErr}</p>}
      </div>
    </>
  );
}

function FixList({ fixes }: { fixes: Fix[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? fixes : fixes.slice(0, 8);
  return (
    <>
      <ol className="fixes">
        {shown.map((c, i) => (
          <li key={c.key}>
            <span className="rank">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="fix-head"><h3>{c.label}</h3><span className={`pill ${LEVEL[c.level].cls}`}>{LEVEL[c.level].label}</span><span className="src">{c.source}</span></div>
              <p className="fix-why">{c.message}</p>
              <p className="fix-do">{c.fix}</p>
              {c.code && <Code text={c.code} />}
            </div>
          </li>
        ))}
      </ol>
      {fixes.length > 8 && <button className="ghost more" onClick={() => setAll(!all)}>{all ? "Ver menos" : `Ver los ${fixes.length}`}</button>}
    </>
  );
}

const tone = (s: number) => (s >= 75 ? "good" : s >= 50 ? "needs-improvement" : "poor");

function SeoCard({ seo, busy, err }: { seo: SeoReport | null; busy: boolean; err: string | null }) {
  if (!seo) return <PendingCard title="SEO" busy={busy} err={err} />;
  return (
    <section className="device" aria-label="Nota SEO">
      <div className="head"><h2>SEO</h2><span className="meta">Google y redes</span></div>
      <div><span className={`fig lead ${tone(seo.score)}`}>{seo.score}</span><span className="meta"> /100</span></div>
      <p><b className="num">{seo.counts.error}</b> errores · <b className="num">{seo.counts.warn}</b> avisos</p>
      <span className="meta">{seo.counts.ok} de {seo.checks.length} controles bien</span>
    </section>
  );
}

function DeviceCard({ d, perf }: { d: DeviceScore; perf: PerfResult }) {
  const rec = perf.field.records.find((x) => x.formFactor === d.device && x.scope === d.scope);
  const lcp = rec?.metrics.find((x) => x.key === "largest_contentful_paint");
  return (
    <section className="device" aria-label={DEVICE_LABEL[d.device]}>
      <div className="head"><h2>{DEVICE_LABEL[d.device]}</h2>{d.share != null && <span className="meta">{pct(d.share)} del tráfico</span>}</div>
      {d.score == null ? (<>
        <div className="fig lead" style={{ color: "var(--faint)" }}>—</div>
        <p className="empty">{d.share === 0 ? "Google no registra visitas en este dispositivo." : <>Sin visitas suficientes en Chrome. <a href={path("/rum")}>Mídelo tú</a></>}</p>
      </>) : (<>
        <div><span className={`fig lead ${tone(d.score)}`}>{d.score}</span><span className="meta"> /100 · </span><span className="grade">{d.grade}</span></div>
        {d.lcpP75 != null && <p>El 75 % ve el contenido en <b className="num">{secs(d.lcpP75)}</b> o menos</p>}
        {lcp && <Dist d={lcp.distribution} label="Visitas según tiempo de carga" />}
        {lcp && <div className="dist-legend"><span><i className="sw" style={{ background: "var(--positive)" }} />{pct(lcp.distribution.good)} rápidas</span><span><i className="sw" style={{ background: "var(--negative)" }} />{pct(lcp.distribution.poor)} lentas</span></div>}
        {d.passesCwv != null && <span className={`pill ${d.passesCwv ? "pass" : "fail"}`} style={{ alignSelf: "start" }}>{d.passesCwv ? "Supera Core Web Vitals" : "No supera Core Web Vitals"}</span>}
      </>)}
    </section>
  );
}

function ServerCard({ perf }: { perf: PerfResult }) {
  const m = perf.measurement;
  return (
    <section className="device" aria-label="Servidor y código">
      <div className="head"><h2>Servidor</h2><span className="meta">medido ahora</span></div>
      <div><span className={`fig lead ${tone(perf.techScore ?? 0)}`}>{perf.techScore ?? "—"}</span><span className="meta"> /100</span></div>
      <p>Responde en <b className="num">{m.median.ttfbMs} ms</b>, la página pesa <b className="num">{kb(m.totals.bytes)}</b></p>
      <span className="meta">{m.server.cdn ?? "Sin CDN"} · {m.protocol.alpn === "h2" ? "HTTP/2" : "HTTP/1.1"}</span>
    </section>
  );
}

function PendingCard({ title, busy, err }: { title: string; busy: boolean; err: string | null }) {
  return (
    <section className="device" aria-label={title} aria-busy={busy}>
      <div className="head"><h2>{title}</h2></div>
      {busy ? (<><div className="skel" style={{ width: 80, height: 34 }} /><div className="skel" style={{ width: "100%", height: 8 }} /><span className="meta">Midiendo…</span></>) : <p className="empty">{err ? "No disponible" : "—"}</p>}
    </section>
  );
}

// Sin datos de Google en ningún dispositivo: una tarjeta en lugar de tres vacías
function NoFieldCard({ perf }: { perf: PerfResult }) {
  return (
    <section className="device nofield" aria-label="Usuarios reales">
      <div className="head"><h2>Móvil, tablet y ordenador</h2><span className="meta">usuarios reales</span></div>
      <p>{perf.field.source === "error" ? <>No se pudieron leer los datos de Chrome: {perf.field.error}</> : <>Google todavía no tiene visitas suficientes de esta web en Chrome para publicar su velocidad real. Es normal en webs pequeñas o nuevas.</>}</p>
      <p><a href={path("/rum")} style={{ color: "var(--text)" }}>Mide a tus propios visitantes</a> con una línea de código, o mira abajo la medición real de tu servidor.</p>
    </section>
  );
}

function SecCard({ sec, busy, err }: { sec: SecurityReport | null; busy: boolean; err: string | null }) {
  if (!sec) return <PendingCard title="Seguridad" busy={busy} err={err} />;
  const broken = sec.links.broken.length;
  return (
    <section className="device" aria-label="Seguridad">
      <div className="head"><h2>Seguridad</h2><span className="meta">servidor y RGPD</span></div>
      <div><span className={`fig lead ${tone(sec.score)}`}>{sec.score}</span><span className="meta"> /100</span></div>
      <p><b className="num">{sec.counts.error}</b> errores · <b className="num">{sec.counts.warn}</b> avisos</p>
      <span className="meta">{sec.cert?.daysLeft != null ? `SSL ${sec.cert.daysLeft} días · ` : ""}{broken ? `${broken} enlace${broken > 1 ? "s" : ""} roto${broken > 1 ? "s" : ""}` : "Sin enlaces rotos"}</span>
    </section>
  );
}

// Llamada a la acción de Dazenty: el informe lleva a quien puede arreglarlo
function Cta({ host, fixes }: { host: string; fixes: number }) {
  const msg = `Hola, he auditado ${host} con el auditor de Dazenty y salen ${fixes} cosas por corregir. ¿Me ayudáis a arreglarlas?`;
  return (
    <section className="cta section" aria-labelledby="cta-h">
      <div>
        <h2 id="cta-h">¿Te lo arreglamos?</h2>
        <p>En Dazenty corregimos estos {fixes} puntos por ti: SEO, velocidad y seguridad, con el informe como guía. Cuéntanos tu web y te damos presupuesto sin compromiso.</p>
      </div>
      <div className="cta-actions">
        {WHATSAPP && <a className="btn" href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">Escríbenos por WhatsApp</a>}
        <a className={WHATSAPP ? "ghost" : "btn"} href={SITE + "/#contacto"}>{WHATSAPP ? "Formulario de contacto" : "Pide presupuesto"}</a>
      </div>
    </section>
  );
}
