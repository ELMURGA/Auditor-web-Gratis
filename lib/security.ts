// Seguridad, tecnología y enlaces: todo medido sobre la web real.
import tls from "node:tls";
import dns from "node:dns";
import * as cheerio from "cheerio";
import { FetchError, isPrivateIp, normalizeUrl, safeFetch } from "./safe-fetch";

export type SecStatus = "ok" | "warn" | "error" | "info";
export type SecCheck = { id: string; group: "seguridad" | "privacidad" | "enlaces"; label: string; status: SecStatus; value?: string; message: string; fix?: string; code?: string };
export type Tech = { name: string; category: "CMS" | "Tienda" | "Framework" | "Constructor" | "Analítica" | "Publicidad" | "Cookies" | "Librería" | "Hosting" | "Chat"; version?: string };
export type BrokenLink = { url: string; status: number | null; internal: boolean; text: string };
export type SecurityReport = {
  finalUrl: string;
  score: number;
  counts: Record<SecStatus, number>;
  checks: SecCheck[];
  tech: Tech[];
  cert: { issuer: string | null; validTo: string | null; daysLeft: number | null; protocol: string | null } | null;
  links: { checked: number; total: number; broken: BrokenLink[] };
};

const safeLookup = ((host: string, opts: any, cb: any) => {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  dns.lookup(host, { ...opts, all: true }, (err, addrs: dns.LookupAddress[]) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return cb(new FetchError("No se pueden analizar direcciones internas.", "private"));
    if (opts?.all) cb(null, addrs); else cb(null, addrs[0].address, addrs[0].family);
  });
}) as any;

function getCert(host: string): Promise<SecurityReport["cert"]> {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port: 443, servername: host, lookup: safeLookup, timeout: 8000, rejectUnauthorized: false }, () => {
      const c = s.getPeerCertificate();
      const validTo = c?.valid_to ? new Date(c.valid_to) : null;
      resolve({
        issuer: (c?.issuer?.O as string) ?? (c?.issuer?.CN as string) ?? null,
        validTo: validTo ? validTo.toISOString() : null,
        daysLeft: validTo ? Math.floor((validTo.getTime() - Date.now()) / 86400_000) : null,
        protocol: s.getProtocol(),
      });
      s.destroy();
    });
    s.on("error", () => resolve(null));
    s.on("timeout", () => { s.destroy(); resolve(null); });
  });
}

const SIGNS: [RegExp, Tech["name"], Tech["category"], ((html: string) => string | undefined)?][] = [
  [/wp-content|wp-includes/i, "WordPress", "CMS", (h) => h.match(/<meta name="generator" content="WordPress ([\d.]+)/i)?.[1]],
  [/woocommerce/i, "WooCommerce", "Tienda"],
  [/elementor/i, "Elementor", "Constructor"],
  [/cdn\.shopify\.com|Shopify\.theme/i, "Shopify", "Tienda"],
  [/static\.wixstatic\.com|wix\.com/i, "Wix", "Constructor"],
  [/squarespace\.com|static1\.squarespace/i, "Squarespace", "Constructor"],
  [/webflow\.com|data-wf-page/i, "Webflow", "Constructor"],
  [/framerusercontent\.com|framer\.com\/m\//i, "Framer", "Constructor"],
  [/zyrosite|hostinger/i, "Hostinger Website Builder", "Constructor"],
  [/prestashop/i, "PrestaShop", "Tienda"],
  [/Joomla!/i, "Joomla", "CMS"],
  [/__NEXT_DATA__|\/_next\/static/i, "Next.js", "Framework"],
  [/__NUXT__|\/_nuxt\//i, "Nuxt", "Framework"],
  [/astro-island|\/_astro\//i, "Astro", "Framework"],
  [/___gatsby/i, "Gatsby", "Framework"],
  [/jquery[.-]?([\d.]+)?(\.min)?\.js/i, "jQuery", "Librería", (h) => h.match(/jquery[.-]([\d]+\.[\d.]+)(\.min)?\.js/i)?.[1]],
  [/cdn\.tailwindcss\.com|tailwind/i, "Tailwind CSS", "Librería"],
  [/bootstrap(\.min)?\.(css|js)/i, "Bootstrap", "Librería"],
  [/googletagmanager\.com\/gtag\/js|gtag\(/i, "Google Analytics", "Analítica"],
  [/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i, "Google Tag Manager", "Analítica"],
  [/connect\.facebook\.net\/.*fbevents\.js|fbq\(/i, "Píxel de Meta", "Publicidad"],
  [/analytics\.tiktok\.com/i, "Píxel de TikTok", "Publicidad"],
  [/static\.hotjar\.com|hotjar/i, "Hotjar", "Analítica"],
  [/clarity\.ms/i, "Microsoft Clarity", "Analítica"],
  [/plausible\.io/i, "Plausible", "Analítica"],
  [/_vercel\/insights|vercel-analytics|va\.vercel-scripts/i, "Vercel Analytics", "Analítica"],
  [/cookiebot/i, "Cookiebot", "Cookies"],
  [/cookieyes|cookie-law-info/i, "CookieYes", "Cookies"],
  [/complianz/i, "Complianz", "Cookies"],
  [/onetrust|cookielaw\.org/i, "OneTrust", "Cookies"],
  [/iubenda/i, "iubenda", "Cookies"],
  [/klaro|cookieconsent|cookie-consent|osano/i, "Banner de cookies", "Cookies"],
  [/embed\.tawk\.to|client\.crisp\.chat|widget\.intercom\.io|code\.tidio\.co/i, "Chat en vivo", "Chat"],
  [/href="https:\/\/(wa\.me|api\.whatsapp\.com)\//i, "Botón de WhatsApp", "Chat"],
];

function detectTech(html: string, headers: Headers): Tech[] {
  const out: Tech[] = [];
  const seen = new Set<string>();
  for (const [re, name, category, ver] of SIGNS) {
    if (re.test(html) && !seen.has(name)) { seen.add(name); out.push({ name, category, version: ver?.(html) }); }
  }
  const server = headers.get("server") ?? "";
  const host = headers.get("x-vercel-id") ? "Vercel" : headers.get("cf-ray") ? "Cloudflare" : headers.get("x-nf-request-id") ? "Netlify" : /hostinger/i.test(server + (headers.get("platform") ?? "")) ? "Hostinger" : headers.get("x-github-request-id") ? "GitHub Pages" : /litespeed/i.test(server) ? "LiteSpeed" : /nginx/i.test(server) ? "Nginx" : /apache/i.test(server) ? "Apache" : null;
  if (host) out.push({ name: host, category: "Hosting" });
  const powered = headers.get("x-powered-by");
  if (powered && !seen.has(powered)) out.push({ name: powered, category: "Framework" });
  return out;
}

async function checkLinks($: cheerio.CheerioAPI, base: URL): Promise<SecurityReport["links"]> {
  const map = new Map<string, { internal: boolean; text: string }>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || /^(#|mailto:|tel:|javascript:|whatsapp:|sms:)/i.test(href)) return;
    try {
      const u = new URL(href, base);
      if (!/^https?:$/.test(u.protocol)) return;
      u.hash = "";
      const key = u.toString();
      if (key === base.toString()) return;
      if (!map.has(key)) map.set(key, { internal: u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, ""), text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 60) });
    } catch { /* href inválido */ }
  });
  // Internos primero, máximo 40 enlaces comprobados
  const all = [...map.entries()].sort((a, b) => Number(b[1].internal) - Number(a[1].internal));
  const list = all.slice(0, 40);
  const broken: BrokenLink[] = [];
  const queue = [...list];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const [url, info] = queue.shift()!;
      try {
        const r = await safeFetch(url, { maxBytes: 20_000, timeoutMs: 10_000 });
        // 401/403/429: la web existe pero bloquea robots; no se cuenta como roto
        if (r.status >= 400 && ![401, 403, 405, 429, 999].includes(r.status)) broken.push({ url, status: r.status, internal: info.internal, text: info.text });
      } catch (e) {
        const code = e instanceof FetchError ? e.code : "network";
        if (code === "dns" || code === "network") broken.push({ url, status: null, internal: info.internal, text: info.text });
      }
    }
  }));
  return { checked: list.length, total: map.size, broken };
}

export async function analyzeSecurity(input: string): Promise<SecurityReport> {
  const res = await safeFetch(input, { maxBytes: 2_000_000 });
  const url = normalizeUrl(res.finalUrl);
  const h = res.headers;
  const $ = cheerio.load(res.body);
  const checks: SecCheck[] = [];
  const add = (c: SecCheck) => checks.push(c);
  const https = url.protocol === "https:";

  const [cert, httpRedirect, links] = await Promise.all([
    https ? getCert(url.hostname) : Promise.resolve(null),
    (async () => {
      try {
        const r = await safeFetch(`http://${url.host}${url.pathname}`, { maxBytes: 10_000, timeoutMs: 8000 });
        return r.finalUrl.startsWith("https://");
      } catch { return null; }
    })(),
    checkLinks($, url),
  ]);

  // ---------- Seguridad ----------
  add({ id: "https", group: "seguridad", label: "HTTPS", value: https ? "Sí" : "No", status: https ? "ok" : "error",
    message: https ? "La conexión va cifrada." : "La web no usa HTTPS: el navegador la marca como \"No segura\".",
    fix: https ? undefined : "Activa un certificado SSL (gratis con Let's Encrypt o Cloudflare) y redirige todo a https://." });
  if (httpRedirect !== null) add({ id: "http-redirect", group: "seguridad", label: "Redirección de http a https", value: httpRedirect ? "Sí" : "No", status: httpRedirect ? "ok" : "error",
    message: httpRedirect ? "Quien entra por http:// acaba en la versión segura." : "La versión http:// no redirige a https://.",
    fix: httpRedirect ? undefined : "Añade una redirección 301 de http:// a https:// en el servidor o en el panel del hosting." });
  if (cert) {
    const d = cert.daysLeft ?? 0;
    add({ id: "cert", group: "seguridad", label: "Certificado SSL", value: `${cert.issuer ?? "—"} · caduca en ${d} días · ${cert.protocol ?? ""}`, status: d < 7 ? "error" : d < 21 ? "warn" : "ok",
      message: d < 0 ? "El certificado está caducado." : d < 21 ? `El certificado caduca en ${d} días.` : `Certificado válido ${d} días más.`,
      fix: d < 21 ? "Renueva el certificado o activa la renovación automática en el hosting." : undefined });
    if (cert.protocol && /TLSv1(\.0|\.1)?$/.test(cert.protocol)) add({ id: "tls", group: "seguridad", label: "Versión de TLS", value: cert.protocol, status: "error", message: "Usa una versión de TLS antigua e insegura.", fix: "Activa TLS 1.2 y 1.3 y desactiva TLS 1.0/1.1." });
  }
  const hsts = h.get("strict-transport-security") ?? "";
  const hstsAge = Number(hsts.match(/max-age=(\d+)/)?.[1] ?? 0);
  if (https) add({ id: "hsts", group: "seguridad", label: "HSTS", value: hsts || "No", status: hstsAge >= 15552000 ? "ok" : hsts ? "warn" : "warn",
    message: hstsAge >= 15552000 ? "El navegador recordará usar siempre HTTPS." : hsts ? "HSTS con duración corta." : "Falta HSTS: un atacante en la misma wifi podría forzar la versión sin cifrar.",
    fix: hstsAge >= 15552000 ? undefined : "Envía la cabecera Strict-Transport-Security.", code: hstsAge >= 15552000 ? undefined : "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload" });
  const csp = h.get("content-security-policy") ?? "";
  add({ id: "csp", group: "seguridad", label: "Política de seguridad de contenido (CSP)", value: csp ? csp.slice(0, 120) + (csp.length > 120 ? "…" : "") : "No", status: csp ? (/unsafe-inline/.test(csp) && /script-src[^;]*unsafe-inline/.test(csp) ? "warn" : "ok") : "warn",
    message: csp ? (/script-src[^;]*unsafe-inline/.test(csp) ? "Hay CSP, pero permite scripts en línea (unsafe-inline)." : "La web limita de dónde se cargan scripts y estilos.") : "Sin CSP: si alguien consigue inyectar un script (XSS), nada lo frena.",
    fix: csp && !/script-src[^;]*unsafe-inline/.test(csp) ? undefined : "Define una Content-Security-Policy con los dominios que usas de verdad. Empieza en modo Report-Only para no romper nada.",
    code: csp ? undefined : `Content-Security-Policy-Report-Only: default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'` });
  const xfo = h.get("x-frame-options");
  const fa = /frame-ancestors/.test(csp);
  add({ id: "clickjacking", group: "seguridad", label: "Protección contra clickjacking", value: xfo ?? (fa ? "CSP frame-ancestors" : "No"), status: xfo || fa ? "ok" : "warn",
    message: xfo || fa ? "Otras webs no pueden meter la tuya en un iframe para engañar al usuario." : "Cualquier web puede incrustar la tuya en un iframe invisible.",
    fix: xfo || fa ? undefined : "Envía X-Frame-Options o frame-ancestors en la CSP.", code: xfo || fa ? undefined : "X-Frame-Options: SAMEORIGIN" });
  const xcto = h.get("x-content-type-options");
  add({ id: "nosniff", group: "seguridad", label: "X-Content-Type-Options", value: xcto ?? "No", status: /nosniff/i.test(xcto ?? "") ? "ok" : "warn",
    message: /nosniff/i.test(xcto ?? "") ? "Correcto." : "El navegador puede interpretar archivos como un tipo distinto al real.", fix: /nosniff/i.test(xcto ?? "") ? undefined : "Añade la cabecera.", code: /nosniff/i.test(xcto ?? "") ? undefined : "X-Content-Type-Options: nosniff" });
  const rp = h.get("referrer-policy");
  add({ id: "referrer", group: "seguridad", label: "Referrer-Policy", value: rp ?? "No", status: rp ? "ok" : "info",
    message: rp ? "Controla qué información de la URL se comparte con otras webs." : "Sin Referrer-Policy (el navegador usa su valor por defecto).", fix: rp ? undefined : "Recomendado.", code: rp ? undefined : "Referrer-Policy: strict-origin-when-cross-origin" });
  const pp = h.get("permissions-policy");
  add({ id: "permissions", group: "seguridad", label: "Permissions-Policy", value: pp ? pp.slice(0, 80) : "No", status: pp ? "ok" : "info",
    message: pp ? "Limita el acceso a cámara, micrófono, ubicación…" : "Sin Permissions-Policy (opcional).", fix: pp ? undefined : "Recomendado si no usas cámara, micro ni ubicación.", code: pp ? undefined : "Permissions-Policy: camera=(), microphone=(), geolocation=()" });
  const leaks = [h.get("x-powered-by"), /\d/.test(h.get("server") ?? "") ? h.get("server") : null].filter(Boolean) as string[];
  add({ id: "leak", group: "seguridad", label: "Versiones expuestas", value: leaks.join(" · ") || "Ninguna", status: leaks.length ? "warn" : "ok",
    message: leaks.length ? `El servidor anuncia qué software y versión usa (${leaks.join(", ")}): facilita buscar fallos conocidos.` : "El servidor no anuncia versiones.",
    fix: leaks.length ? "Oculta X-Powered-By y la versión en la cabecera Server (en PHP: expose_php = Off; en Next.js: poweredByHeader: false)." : undefined });
  const wpVer = $('meta[name="generator"]').attr("content");
  if (wpVer && /\d/.test(wpVer)) add({ id: "generator", group: "seguridad", label: "Versión del CMS visible", value: wpVer, status: "warn", message: `La página publica su versión: ${wpVer}.`, fix: "Quita la etiqueta meta generator (en WordPress lo hacen la mayoría de plugins de seguridad)." });
  const mixed = new Set<string>();
  if (https) $('script[src^="http:"], link[rel="stylesheet"][href^="http:"], img[src^="http:"], iframe[src^="http:"], video[src^="http:"], source[src^="http:"]').each((_, el) => { mixed.add($(el).attr("src") ?? $(el).attr("href") ?? ""); });
  if (https) add({ id: "mixed", group: "seguridad", label: "Contenido mixto", value: mixed.size ? [...mixed].slice(0, 2).join(" · ") : "Ninguno", status: mixed.size ? "error" : "ok",
    message: mixed.size ? `${mixed.size} recurso(s) se cargan por http:// dentro de una página https: el navegador los bloquea o avisa.` : "Todos los recursos van por HTTPS.",
    fix: mixed.size ? "Cambia esas direcciones a https:// (en WordPress, con Better Search Replace sobre la base de datos)." : undefined });
  const cookies = (h as any).getSetCookie?.() as string[] | undefined ?? (h.get("set-cookie") ? [h.get("set-cookie")!] : []);
  if (cookies.length) {
    const bad = cookies.filter((c) => !/;\s*secure/i.test(c) || !/;\s*httponly/i.test(c));
    add({ id: "cookies", group: "seguridad", label: "Cookies seguras", value: `${cookies.length - bad.length}/${cookies.length} con Secure y HttpOnly`, status: bad.length ? "warn" : "ok",
      message: bad.length ? `${bad.length} cookie(s) sin Secure o HttpOnly: pueden viajar sin cifrar o leerse desde JavaScript.` : "Las cookies del servidor van protegidas.",
      fix: bad.length ? "Marca las cookies con Secure; HttpOnly; SameSite=Lax." : undefined });
  }
  const sectxt = await safeFetch(`${url.origin}/.well-known/security.txt`, { maxBytes: 10_000, timeoutMs: 6000 }).catch(() => null);
  add({ id: "securitytxt", group: "seguridad", label: "security.txt", value: sectxt && sectxt.status < 300 && /contact:/i.test(sectxt.body) ? "Sí" : "No", status: sectxt && sectxt.status < 300 && /contact:/i.test(sectxt.body) ? "ok" : "info",
    message: sectxt && sectxt.status < 300 && /contact:/i.test(sectxt.body) ? "Hay un contacto para avisar de fallos de seguridad." : "Sin /.well-known/security.txt (opcional): un sitio donde avisarte de un fallo.",
    code: sectxt && sectxt.status < 300 ? undefined : `Contact: mailto:seguridad@${url.hostname.replace(/^www\./, "")}\nExpires: ${new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10)}T00:00:00.000Z\nPreferred-Languages: es, en` });

  // ---------- Privacidad (RGPD / LSSI) ----------
  const tech = detectTech(res.body, h);
  const trackers = tech.filter((t) => t.category === "Analítica" && !["Plausible", "Vercel Analytics"].includes(t.name) || t.category === "Publicidad");
  const consent = tech.some((t) => t.category === "Cookies");
  add({ id: "consent", group: "privacidad", label: "Banner de cookies", value: consent ? tech.filter((t) => t.category === "Cookies").map((t) => t.name).join(", ") : "No detectado", status: trackers.length && !consent ? "error" : consent ? "ok" : "info",
    message: trackers.length && !consent ? `Usa ${trackers.map((t) => t.name).join(", ")} y no se detecta herramienta de consentimiento: en España hay que pedir permiso antes de cargarlos.` : consent ? "Hay una herramienta de consentimiento de cookies." : "No se detectan cookies de seguimiento de terceros.",
    fix: trackers.length && !consent ? "Instala un gestor de consentimiento (Cookiebot, CookieYes, Complianz) y bloquea la analítica y los píxeles hasta que el usuario acepte." : undefined });
  const texts = $("a").map((_, el) => $(el).text().toLowerCase()).get().join(" | ");
  const legal = { aviso: /aviso legal|legal notice/.test(texts), privacidad: /privacidad|privacy/.test(texts), cookies: /cookies/.test(texts) };
  const missing = Object.entries(legal).filter(([, v]) => !v).map(([k]) => ({ aviso: "aviso legal", privacidad: "política de privacidad", cookies: "política de cookies" } as Record<string, string>)[k]);
  add({ id: "legal", group: "privacidad", label: "Textos legales enlazados", value: missing.length ? `Falta: ${missing.join(", ")}` : "Aviso legal, privacidad y cookies", status: missing.length ? "warn" : "ok",
    message: missing.length ? `En el HTML de la página no hay enlace a: ${missing.join(", ")}. La LSSI y el RGPD los exigen en webs de empresa.` : "La página enlaza los tres textos legales.",
    fix: missing.length ? "Añade en el pie de página los enlaces a aviso legal, política de privacidad y política de cookies." : undefined });
  const forms = $("form").length;
  if (forms) {
    const hasCheck = $('form input[type="checkbox"]').length > 0 || /acepto|privacidad/i.test($("form").text());
    add({ id: "forms", group: "privacidad", label: "Consentimiento en formularios", value: `${forms} formulario(s)`, status: hasCheck ? "ok" : "warn",
      message: hasCheck ? "Los formularios piden aceptar la política de privacidad." : "Hay formularios sin casilla de aceptación de la política de privacidad.",
      fix: hasCheck ? undefined : "Añade una casilla obligatoria \"He leído y acepto la política de privacidad\" con enlace, sin marcar por defecto." });
  }

  // ---------- Enlaces ----------
  const bi = links.broken.filter((b) => b.internal).length;
  const be = links.broken.length - bi;
  add({ id: "broken-internal", group: "enlaces", label: "Enlaces internos rotos", value: `${bi} de ${links.broken.length + (links.checked - links.broken.length)} comprobados`, status: bi === 0 ? "ok" : bi <= 2 ? "warn" : "error",
    message: bi === 0 ? "Los enlaces a tus propias páginas funcionan." : `${bi} enlace(s) a tu propia web dan error: el usuario y Google llegan a una página rota.`,
    fix: bi ? "Corrige la dirección o redirige con 301 la página que ya no existe." : undefined });
  add({ id: "broken-external", group: "enlaces", label: "Enlaces externos rotos", value: String(be), status: be === 0 ? "ok" : "warn",
    message: be === 0 ? "Los enlaces a otras webs funcionan." : `${be} enlace(s) a otras webs ya no funcionan.`, fix: be ? "Actualiza o quita esos enlaces." : undefined });
  if (links.total > links.checked) add({ id: "links-limit", group: "enlaces", label: "Enlaces comprobados", value: `${links.checked} de ${links.total}`, status: "info", message: `La página tiene ${links.total} enlaces; se comprueban los ${links.checked} primeros (internos primero).` });

  const w = { ok: 1, info: 1, warn: 0.5, error: 0 } as const;
  const scored = checks.filter((c) => c.status !== "info");
  const score = Math.round((scored.reduce((s, c) => s + w[c.status], 0) / scored.length) * 100);
  const counts = { ok: 0, warn: 0, error: 0, info: 0 } as Record<SecStatus, number>;
  checks.forEach((c) => counts[c.status]++);
  return { finalUrl: url.toString(), score, counts, checks, tech, cert, links };
}
