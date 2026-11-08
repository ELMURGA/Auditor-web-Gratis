"use client";
import type { SecurityReport, SecCheck } from "@/lib/security";
import { Code } from "./Bar";

const GROUPS: [SecCheck["group"], string][] = [["seguridad", "Seguridad del servidor"], ["privacidad", "Privacidad y RGPD"], ["enlaces", "Enlaces"]];
const STATUS_LABEL = { ok: "Correcto", warn: "Aviso", error: "Error", info: "Información" } as const;
const CAT_ORDER = ["CMS", "Tienda", "Constructor", "Framework", "Hosting", "Analítica", "Publicidad", "Cookies", "Chat", "Librería"];

export function SecDetails({ r }: { r: SecurityReport }) {
  const tech = [...r.tech].sort((a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category));
  return (
    <>
      <div className="section" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "var(--gap)", alignItems: "start" }}>
        <section className="panel" aria-labelledby="tech-h">
          <header><h2 id="tech-h">Con qué está hecha</h2><span className="meta">{tech.length} detectados</span></header>
          {tech.length === 0 ? <p className="sub" style={{ margin: 0 }}>No se reconoce la tecnología: la web no deja huellas de un CMS o constructor conocido.</p> : (
            <ul className="kv">{tech.map((t) => <li key={t.name}><span className="k">{t.name}{t.version && <span className="meta"> {t.version}</span>}</span><span className="v meta">{t.category}</span></li>)}</ul>
          )}
        </section>
        <section className="panel" aria-labelledby="cert-h">
          <header><h2 id="cert-h">Certificado SSL</h2>{r.cert?.daysLeft != null && <span className={`pill ${r.cert.daysLeft < 7 ? "error" : r.cert.daysLeft < 21 ? "warn" : "ok"}`}>{r.cert.daysLeft} días</span>}</header>
          {r.cert ? (
            <ul className="kv">
              <li><span className="k">Emitido por</span><span className="v">{r.cert.issuer ?? "—"}</span></li>
              <li><span className="k">Caduca</span><span className="v">{r.cert.validTo ? new Date(r.cert.validTo).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—"}</span></li>
              <li><span className="k">Protocolo</span><span className="v">{r.cert.protocol ?? "—"}</span></li>
            </ul>
          ) : <p className="sub" style={{ margin: 0 }}>No se pudo leer el certificado (o la web no usa HTTPS).</p>}
        </section>
      </div>

      <section className="section panel" aria-labelledby="sec-all-h">
        <header><h2 id="sec-all-h">Los {r.checks.length} controles de seguridad, privacidad y enlaces</h2><span className="meta">{r.counts.ok} bien · {r.counts.warn} avisos · {r.counts.error} errores</span></header>
        {GROUPS.map(([g, label]) => {
          const items = r.checks.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <table className="checks" key={g}>
              <caption>{label}</caption>
              <tbody>{items.map((c) => (
                <tr key={c.id}>
                  <td><span className={`dot ${c.status}`} role="img" aria-label={STATUS_LABEL[c.status]} /></td>
                  <td className="name">{c.label}</td>
                  <td>{c.message}{c.value && <div className="val">{c.value}</div>}{c.code && c.status !== "ok" && <Code text={c.code} />}</td>
                </tr>))}</tbody>
            </table>
          );
        })}
      </section>

      <section className="section panel" aria-labelledby="links-h">
        <header><h2 id="links-h">Enlaces rotos</h2><span className="meta">{r.links.checked} comprobados de {r.links.total}</span></header>
        {r.links.broken.length === 0 ? <p className="sub" style={{ margin: 0 }}>Ninguno: los {r.links.checked} enlaces comprobados funcionan.</p> : (
          <table className="res">
            <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 90 }} /></colgroup>
            <thead><tr><th>Enlace</th><th>Tipo</th><th className="r">Respuesta</th></tr></thead>
            <tbody>{r.links.broken.map((b) => (
              <tr key={b.url}><td className="u" title={b.url}><b>{b.text || b.url}</b> <span className="meta">· {b.url}</span></td><td>{b.internal ? "Interno" : "Externo"}</td><td className="r num c-error">{b.status ?? "Sin respuesta"}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
