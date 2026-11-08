"use client";
import { SITE, path } from "@/lib/base";

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

export function Foot() {
  return (
    <footer className="site-footer">
      <div className="site-footer__in">
        <div>
          <img src={path("/logo-dazenty.webp")} alt="Dazenty" width="56" height="56" />
          <p>Webs, software a medida y automatizaciones con IA.</p>
        </div>
        <nav aria-label="Herramientas">
          <h2>Herramientas</h2>
          <a href={path("/")}>Auditor web</a>
          <a href={path("/rum")}>Mide a tus visitantes</a>
        </nav>
        <nav aria-label="Dazenty">
          <h2>Dazenty</h2>
          <a href={SITE + "/servicios"}>Servicios</a>
          <a href={SITE + "/html/portfolio"}>Portfolio</a>
          <a href={SITE + "/#contacto"}>Contacto</a>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <a href={SITE + "/html/avisos-legales"}>Aviso legal</a>
          <a href={SITE + "/html/privacidad"}>Política de privacidad</a>
          <a href={SITE + "/html/terminos"}>Términos de uso</a>
        </nav>
      </div>
      <p className="site-footer__note">Solo se leen páginas públicas. No guardamos las URLs que analizas. © {new Date().getFullYear()} Dazenty</p>
    </footer>
  );
}
