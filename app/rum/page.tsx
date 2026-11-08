"use client";
import { useEffect, useState } from "react";
import { Bar, Code, Foot } from "../components/Bar";
import { path } from "@/lib/base";

type Sum = { n: number; p75: number; rating: string; good: number; ni: number; poor: number };
type Data = { host: string; days: number; totalEvents: number; summary: Record<string, Record<string, Sum>>; pages: { path: string; n: number; lcpP75: number }[] };
const DEV: [string, string][] = [["mobile", "Móvil"], ["tablet", "Tablet"], ["desktop", "Ordenador"]];
const NAMES: Record<string, string> = { LCP: "Carga del contenido principal", INP: "Respuesta a la interacción", CLS: "Estabilidad visual", FCP: "Primer contenido visible", TTFB: "Respuesta del servidor" };
const pct = (x: number) => `${Math.round(x * 100)} %`;
const fmt = (name: string, v: number) => (name === "CLS" ? v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v >= 1000 ? `${(v / 1000).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : `${Math.round(v)} ms`);

export default function Rum() {
  const [site, setSite] = useState("");
  const [origin, setOrigin] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrigin(location.origin), []);

  async function load(e: React.FormEvent) {
    e.preventDefault();
    if (!site.trim()) return;
    setErr(null); setD(null); setBusy(true);
    try {
      const res = await fetch(path(`/api/rum?site=${encodeURIComponent(site.trim())}`));
      const j = await res.json();
      if (!res.ok) setErr(j.error); else setD(j);
    } catch { setErr("No se pudieron cargar los datos."); } finally { setBusy(false); }
  }

  return (
    <>
      <Bar />
      <main>
        <h1>Mis visitantes</h1>
        <p className="sub">La velocidad que tiene cada persona que entra en tu web, aunque tenga pocas visitas para salir en los datos de Google.</p>

        <div className="two-one section">
          <section className="panel" aria-labelledby="ins-h">
            <h2 id="ins-h">Instálalo en tu web</h2>
            <p className="fix-why" style={{ marginTop: 0 }}>Pega esta línea dentro del &lt;head&gt; de cada página. Mide carga, respuesta y estabilidad al salir de la página, y lo envía aquí. Sin cookies y sin datos personales: solo la métrica, la página, el tipo de dispositivo y el tipo de red.</p>
            <div className="snippet"><Code text={`<script defer src="${origin || "https://dazenty.com"}${path("/rum.js")}"></script>`} /></div>
            <p className="meta" style={{ margin: "12px 0 0" }}>Solo se aceptan datos de los dominios autorizados en la variable RUM_ALLOWED_HOSTS.</p>
          </section>
          <section className="panel" aria-labelledby="see-h">
            <h2 id="see-h">Consulta una web</h2>
            <form onSubmit={load} style={{ display: "grid", gap: 8 }}>
              <label className="sr" htmlFor="site">Dominio</label>
              <input id="site" className="input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="dazenty.com" />
              <button className="btn" disabled={busy}>{busy ? "Cargando…" : "Ver sus visitas"}</button>
            </form>
            <p className="meta" style={{ margin: "12px 0 0" }}>Últimos 28 días.</p>
          </section>
        </div>

        {err && <div className="error-box" role="alert"><p><span className="c-error">No se pudo cargar.</span> {err}</p></div>}

        {d && (
          <section className="section" aria-labelledby="res-h">
            <header><h2 id="res-h">{d.host}</h2><span className="meta">{d.totalEvents.toLocaleString("es-ES")} mediciones en {d.days} días</span></header>
            {d.totalEvents === 0 ? <div className="panel"><p style={{ margin: 0 }}>Todavía no hay mediciones de {d.host}. Comprueba que el script está en el &lt;head&gt; y que el dominio está autorizado; los datos llegan cuando un visitante sale de la página.</p></div> : (
              <div className="devices" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 0 }}>
                {DEV.map(([k, label]) => {
                  const s = d.summary[k] ?? {};
                  const names = Object.keys(s);
                  return (
                    <div className="device" key={k}>
                      <div className="head"><h3>{label}</h3><span className="meta">{s.LCP ? `${s.LCP.n.toLocaleString("es-ES")} visitas` : ""}</span></div>
                      {names.length === 0 ? <p className="empty">Sin visitas en {label.toLowerCase()} todavía.</p> : (
                        <ul className="kv">{["LCP", "INP", "CLS", "FCP", "TTFB"].filter((n) => s[n]).map((n) => (
                          <li key={n}><span className="k"><span className={`dot ${s[n].rating}`} />{n} <span className="meta">{NAMES[n]}</span></span><span className="v">{fmt(n, s[n].p75)}</span></li>
                        ))}</ul>
                      )}
                      {s.LCP && <span className="meta">{pct(s.LCP.good)} de las visitas cargan en menos de 2,5 s</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {d.pages.length > 0 && (
              <div className="panel section">
                <header><h2>Páginas más visitadas</h2><span className="meta">Carga del contenido principal, percentil 75</span></header>
                <table className="res"><thead><tr><th>Página</th><th className="r">Visitas</th><th className="r">Carga</th></tr></thead>
                  <tbody>{d.pages.map((p) => <tr key={p.path}><td className="u"><b>{p.path}</b></td><td className="r num">{p.n.toLocaleString("es-ES")}</td><td className="r num">{fmt("LCP", p.lcpP75)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
      <Foot />
    </>
  );
}
