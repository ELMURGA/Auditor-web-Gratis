"use client";
import { useEffect, useState } from "react";
import { SITE, path } from "@/lib/base";
export { Foot } from "./Footer";

const SERVICIOS: [string, string][] = [
  ["/servicios/diseno-web", "Diseño web"],
  ["/servicios/software-a-medida", "Software a medida"],
  ["/servicios/automatizaciones-ia", "Automatizaciones e IA"],
  ["/servicios/diseno-grafico", "Branding y diseño gráfico"],
  ["/servicios/redes-sociales", "Redes sociales"],
  ["/servicios/seo-local", "SEO y Google Business"],
];

// Cabecera idéntica a la de dazenty.com: logo, menú con desplegable de Servicios, "Hablemos" y menú móvil a pantalla completa.
export function Bar() {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(false);
  const close = () => { setOpen(false); setSub(false); };

  useEffect(() => {
    document.body.classList.toggle("nav-open", open);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onResize = () => { if (window.innerWidth >= 768) close(); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => { document.body.classList.remove("nav-open"); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); };
  }, [open]);

  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <a href={SITE + "/"} className="site-header__logo" aria-label="Dazenty — volver al inicio">
            <img src={path("/logoheader-160.webp")} alt="Dazenty" width="160" height="160" />
          </a>
          <nav className="site-header__nav" aria-label="Navegación principal">
            <a href={SITE + "/#inicio"}>Inicio</a>
            <div className="nav-drop">
              <a href={SITE + "/servicios"} aria-haspopup="true">Servicios</a>
              <div className="nav-drop__panel">
                <div className="nav-drop__box">
                  {SERVICIOS.map(([h, t]) => <a key={h} href={SITE + h}>{t}</a>)}
                  <a href={SITE + "/servicios"} className="nav-drop__all"><span>Ver todos los servicios</span><span aria-hidden="true">→</span></a>
                </div>
              </div>
            </div>
            <a href={SITE + "/html/portfolio"}>Portfolio</a>
            <a href={path("/")} className="is-active" aria-current="page">Auditor web</a>
            <a href={SITE + "/#contacto"} className="site-header__cta">Hablemos</a>
          </nav>
          <button className={`nav-toggle${open ? " is-active" : ""}`} aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="mobile-nav" onClick={() => (open ? close() : setOpen(true))}>
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      <div className={`mobile-nav${open ? " is-open" : ""}`} id="mobile-nav">
        <nav className="mnav-main" aria-label="Menú móvil">
          <a href={SITE + "/#inicio"} className="mnav-link" onClick={close}>Inicio</a>
          <div className="mnav-group">
            <a href={SITE + "/servicios"} className="mnav-link" onClick={close}>Servicios</a>
            <div className="mnav-sub is-open" id="mnav-sub">
              {SERVICIOS.map(([h, t]) => <a key={h} href={SITE + h} onClick={close}>{t}</a>)}
            </div>
          </div>
          <a href={SITE + "/html/portfolio"} className="mnav-link" onClick={close}>Portfolio</a>
          <a href={path("/")} className="mnav-link" onClick={close}>Auditor web</a>
        </nav>
        <div className="mnav-foot">
          <a href={SITE + "/#contacto"} className="mobile-nav__cta" onClick={close}>Hablemos</a>
          <div className="mnav-contact">
            <a href="mailto:designerazenty@gmail.com">Email</a>
            <a href="tel:624903256">Llamar</a>
            <a href="https://www.instagram.com/dazen.ty" target="_blank" rel="noopener noreferrer">Instagram</a>
          </div>
        </div>
      </div>
    </>
  );
}

export function Code({ text }: { text: string }) {
  return (
    <div className="code">
      <div className="code-head"><span className="meta">Código para pegar</span>
        <button type="button" className="ghost" onClick={(e) => {
          const b = e.currentTarget;
          navigator.clipboard?.writeText(text).then(() => { b.textContent = "Copiado"; setTimeout(() => (b.textContent = "Copiar"), 1500); }).catch(() => {});
        }}>Copiar</button></div>
      <pre>{text}</pre>
    </div>
  );
}
