"use client";
import type { SeoReport, Check } from "@/lib/analyze";

const GROUPS: [Check["group"], string][] = [
  ["basico", "SEO básico"], ["tecnico", "Técnico"], ["contenido", "Contenido"],
  ["opengraph", "Open Graph · LinkedIn, Facebook, WhatsApp"], ["x", "Tarjeta de X"], ["rastreo", "Rastreo e indexación"],
];
const STATUS_LABEL = { ok: "Correcto", warn: "Aviso", error: "Error", info: "Información" } as const;

export function Previews({ r }: { r: SeoReport }) {
  const p = r.preview;
  const path = (() => { try { const u = new URL(p.google.url); return (u.host + u.pathname).replace(/\/$/, "").split("/").join(" › "); } catch { return p.google.url; } })();
  const bg = (src: string | null) => (src ? { backgroundImage: `url("${src.replace(/"/g, "%22")}")` } : undefined);
  return (
    <>
      <div className="preview">
        <div className="label">Google</div>
        <div className="serp" data-ui>
          <div className="site">
            <span className="fav">{p.google.favicon ? <img src={p.google.favicon} alt="" /> : null}</span>
            <span style={{ minWidth: 0 }}><div className="name clamp1">{p.social.site}</div><div className="crumb">{path}</div></span>
          </div>
          <div className="t clamp2">{p.google.title.length > 60 ? p.google.title.slice(0, 58) + "…" : p.google.title}</div>
          <div className="d clamp2">{p.google.description || "Google elegirá un fragmento del texto de la página."}</div>
        </div>
      </div>
      <div className="preview">
        <div className="label">LinkedIn, Facebook y WhatsApp</div>
        <div className="card-social" data-ui>
          <div className="img" style={bg(p.social.image)} role={p.social.image ? "img" : undefined} aria-label={p.social.image ? "Imagen para compartir" : undefined}>{!p.social.image && "Sin imagen"}</div>
          <div className="txt"><div className="dom">{p.social.domain.toUpperCase()}</div><div className="tt clamp2">{p.social.title}</div></div>
        </div>
      </div>
      <div className="preview">
        <div className="label">X</div>
        <div data-ui>
          <div className="card-x">
            <div className="img" style={bg(p.x.image)} role={p.x.image ? "img" : undefined} aria-label={p.x.image ? "Imagen de la tarjeta" : undefined}>{!p.x.image && "Sin imagen"}</div>
            <div className="cap">{p.x.title}</div>
          </div>
          <div className="meta" style={{ marginTop: 6 }}>De {p.x.domain}</div>
        </div>
      </div>
    </>
  );
}

export function SeoDetails({ r }: { r: SeoReport }) {
  return (
    <>
      <section className="section panel" aria-labelledby="seo-all-h">
        <header><h2 id="seo-all-h">Los {r.checks.length} controles SEO</h2><span className="meta">{r.counts.ok} bien · {r.counts.warn} avisos · {r.counts.error} errores</span></header>
        {GROUPS.map(([g, label]) => {
          const items = r.checks.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <table className="checks" key={g}>
              <caption>{label}</caption>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td><span className={`dot ${c.status}`} role="img" aria-label={STATUS_LABEL[c.status]} /></td>
                    <td className="name">{c.label}</td>
                    <td>{c.message}{c.value && <div className="val">{c.value}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </section>

      {r.headings.length > 0 && (
        <section className="section panel" aria-labelledby="h-h">
          <header><h2 id="h-h">Estructura de encabezados</h2><span className="meta">{r.headings.length} encabezados{r.headings.length > 40 && " · se muestran 40"}</span></header>
          <ol className="outline">{r.headings.slice(0, 40).map((h, i) => <li key={i} style={{ paddingLeft: (h.level - 1) * 12 }}><b>H{h.level}</b><span className="clamp1">{h.text || "(vacío)"}</span></li>)}</ol>
        </section>
      )}
    </>
  );
}
