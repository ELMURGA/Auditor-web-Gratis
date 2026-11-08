"use client";
import { SITE, path } from "@/lib/base";
export { Foot } from "./Footer";

// Cabecera idéntica a la de dazenty.com: logo, menú en mayúsculas y "Hablemos" en salmón.
export function Bar() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a href={SITE + "/"} className="site-header__logo" aria-label="Dazenty, volver al inicio">
          <img src={path("/logo-dazenty.webp")} alt="Dazenty" width="160" height="160" />
        </a>
        <nav className="site-header__nav" aria-label="Navegación principal">
          <a href={SITE + "/#inicio"}>Inicio</a>
          <a href={SITE + "/servicios"}>Servicios</a>
          <a href={SITE + "/html/portfolio"}>Portfolio</a>
          <a href={path("/")} aria-current="page">Auditor web</a>
          <a href={SITE + "/#contacto"} className="site-header__cta">Hablemos</a>
        </nav>
        <a href={SITE + "/#contacto"} className="site-header__cta mobile-only">Hablemos</a>
      </div>
    </header>
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
