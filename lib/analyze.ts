import * as cheerio from "cheerio";
import { safeFetch, FetchError } from "./safe-fetch";
import { robotsBlocksGoogle } from "./robots";

export type Status = "ok" | "warn" | "error" | "info";
export type Check = {
  id: string;
  group: "basico" | "tecnico" | "contenido" | "opengraph" | "x" | "rastreo";
  label: string;
  status: Status;
  value?: string | null;
  message: string;
  fix?: string;          // qué hacer para corregirlo
  code?: string;         // código listo para pegar (cuando aplica)
  priority?: "alta" | "media" | "baja";
};

export type SeoReport = {
  url: string;
  finalUrl: string;
  status: number;
  redirects: { url: string; status: number }[];
  fetchedAt: string;
  score: number;
  counts: Record<Status, number>;
  checks: Check[];
  preview: {
    google: { title: string; description: string; url: string; favicon: string | null };
    social: { title: string; description: string; image: string | null; site: string; domain: string };
    x: { card: string; title: string; description: string; image: string | null; domain: string };
  };
  headings: { level: number; text: string }[];
  jsonLd: { types: string[]; valid: boolean; error?: string }[];
  hreflang: { lang: string; href: string }[];
};

const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

function abs(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

async function probe(url: string | null) {
  if (!url) return null;
  try {
    const r = await safeFetch(url, { method: "GET", maxBytes: 64_000, timeoutMs: 8000 });
    return { status: r.status, type: r.headers.get("content-type") ?? "", length: Number(r.headers.get("content-length") ?? r.bytes), body: r.body };
  } catch {
    return null;
  }
}

export async function analyzeSeo(input: string): Promise<SeoReport> {
  const res = await safeFetch(input);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new FetchError(`La URL no devuelve HTML (${type || "sin tipo"}).`, "not_html");

  const $ = cheerio.load(res.body);
  const base = abs($("base[href]").attr("href"), res.finalUrl) ?? res.finalUrl;
  const finalUrl = new URL(res.finalUrl);
  const meta = (sel: string) => clean($(`meta[${sel}]`).first().attr("content"));
  const prop = (p: string) => meta(`property="${p}"`) || meta(`name="${p}"`);

  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // ---------- Respuesta ----------
  add({
    id: "http", group: "rastreo", label: "Código HTTP",
    status: res.status >= 200 && res.status < 300 ? "ok" : "error",
    value: String(res.status),
    message: res.status < 300 ? "La página responde correctamente." : "La página no devuelve 200: Google no la indexará.",
  });
  add({
    id: "redirects", group: "rastreo", label: "Redirecciones",
    status: res.hops.length <= 1 ? "ok" : res.hops.length <= 2 ? "warn" : "error",
    value: res.hops.length > 1 ? res.hops.map((h) => `${h.status} ${h.url}`).join(" → ") : "Ninguna",
    message: res.hops.length <= 1 ? "Sin redirecciones." : `${res.hops.length - 1} redirección(es) antes de llegar. Enlaza directamente a la URL final.`,
  });
  add({
    id: "https", group: "rastreo", label: "HTTPS",
    status: finalUrl.protocol === "https:" ? "ok" : "error",
    value: finalUrl.protocol.replace(":", ""),
    message: finalUrl.protocol === "https:" ? "Se sirve por HTTPS." : "La página no usa HTTPS.",
  });

  // ---------- SEO básico ----------
  const title = clean($("head title").first().text());
  add({
    id: "title", group: "basico", label: "Título (<title>)", value: title || null,
    status: !title ? "error" : title.length < 30 || title.length > 60 ? "warn" : "ok",
    message: !title ? "Falta el título. Es lo más importante para Google."
      : `${title.length} caracteres. ${title.length < 30 ? "Algo corto: aprovecha hasta ~60." : title.length > 60 ? "Google lo cortará (máx. ~60)." : "Longitud ideal (30–60)."}`,
  });
  if ($("head title").length > 1)
    add({ id: "title-dup", group: "basico", label: "Títulos duplicados", status: "warn", value: String($("head title").length), message: "Hay más de un <title>." });

  const desc = meta('name="description"');
  add({
    id: "description", group: "basico", label: "Meta description", value: desc || null,
    status: !desc ? "error" : desc.length < 70 || desc.length > 160 ? "warn" : "ok",
    message: !desc ? "Falta la descripción: Google se inventará un fragmento."
      : `${desc.length} caracteres. ${desc.length < 70 ? "Corta: apunta a 120–160." : desc.length > 160 ? "Se cortará (máx. ~160)." : "Longitud correcta."}`,
  });

  const canonicalRaw = $('link[rel="canonical"]').first().attr("href");
  const canonical = abs(canonicalRaw, base);
  const canonicalCount = $('link[rel="canonical"]').length;
  let canonStatus: Status = "ok";
  let canonMsg = "Canonical correcto y apunta a esta página.";
  if (!canonical) { canonStatus = "warn"; canonMsg = "Sin canonical. Recomendado para evitar contenido duplicado."; }
  else if (canonicalCount > 1) { canonStatus = "error"; canonMsg = "Hay varios canonical: Google los ignorará."; }
  else if (canonical.replace(/\/$/, "") !== res.finalUrl.replace(/\/$/, "")) {
    canonStatus = "warn"; canonMsg = "El canonical apunta a otra URL: esta página no se indexará como tal.";
  } else if (canonicalRaw && !/^https?:\/\//.test(canonicalRaw)) {
    canonStatus = "warn"; canonMsg = "Canonical relativo. Mejor usar URL absoluta.";
  }
  add({ id: "canonical", group: "basico", label: "Canonical", value: canonical, status: canonStatus, message: canonMsg });

  const robots = meta('name="robots"') || meta('name="googlebot"');
  const xRobots = res.headers.get("x-robots-tag") ?? "";
  const noindex = /noindex/i.test(robots) || /noindex/i.test(xRobots);
  const nofollow = /nofollow/i.test(robots) || /nofollow/i.test(xRobots);
  add({
    id: "robots", group: "basico", label: "Meta robots", value: [robots, xRobots && `X-Robots-Tag: ${xRobots}`].filter(Boolean).join(" · ") || "(no definido → index, follow)",
    status: noindex ? "error" : nofollow ? "warn" : "ok",
    message: noindex ? "¡noindex! Google NO mostrará esta página." : nofollow ? "nofollow: Google no seguirá los enlaces." : "La página es indexable.",
  });

  const viewport = meta('name="viewport"');
  add({
    id: "viewport", group: "basico", label: "Viewport", value: viewport || null,
    status: !viewport ? "error" : /width=device-width/.test(viewport) ? (/user-scalable=no|maximum-scale=1(\.0)?\b/.test(viewport) ? "warn" : "ok") : "warn",
    message: !viewport ? "Falta: la web no se adaptará al móvil." : /user-scalable=no|maximum-scale=1/.test(viewport) ? "Bloquea el zoom: malo para accesibilidad." : "Correcto para móvil.",
  });

  const lang = clean($("html").attr("lang"));
  add({ id: "lang", group: "basico", label: "Idioma (<html lang>)", value: lang || null, status: lang ? "ok" : "warn", message: lang ? "Idioma declarado." : "Declara el idioma en <html lang=\"es\">." });

  // ---------- Técnico ----------
  const charset = clean($("meta[charset]").attr("charset")) || (meta('http-equiv="Content-Type"').match(/charset=([\w-]+)/i)?.[1] ?? "") || (type.match(/charset=([\w-]+)/i)?.[1] ?? "");
  add({ id: "charset", group: "tecnico", label: "Codificación", value: charset || null, status: !charset ? "warn" : /utf-?8/i.test(charset) ? "ok" : "warn", message: !charset ? "No se declara codificación." : /utf-?8/i.test(charset) ? "UTF-8." : "Recomendado UTF-8." });

  const jsonLd: SeoReport["jsonLd"] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    try {
      const data = JSON.parse(txt);
      const types = new Set<string>();
      const walk = (n: unknown) => {
        if (Array.isArray(n)) n.forEach(walk);
        else if (n && typeof n === "object") {
          const t = (n as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.add(t);
          if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
          Object.values(n).forEach(walk);
        }
      };
      walk(data);
      jsonLd.push({ types: [...types], valid: true });
    } catch (e) {
      jsonLd.push({ types: [], valid: false, error: (e as Error).message });
    }
  });
  const invalidLd = jsonLd.filter((j) => !j.valid).length;
  add({
    id: "jsonld", group: "tecnico", label: "Datos estructurados (JSON-LD)",
    value: jsonLd.length ? jsonLd.flatMap((j) => j.types).join(", ") || "(sin @type)" : null,
    status: !jsonLd.length ? "warn" : invalidLd ? "error" : "ok",
    message: !jsonLd.length ? "Sin JSON-LD. Añade Organization/LocalBusiness/WebSite para resultados enriquecidos."
      : invalidLd ? `${invalidLd} bloque(s) JSON-LD con JSON inválido.` : `${jsonLd.length} bloque(s) válidos.`,
  });

  const favHref = $('link[rel~="icon"]').first().attr("href") ?? $('link[rel="apple-touch-icon"]').first().attr("href");
  const favicon = abs(favHref, base) ?? abs("/favicon.ico", base);
  const favProbe = await probe(favicon);
  const favOk = !!favProbe && favProbe.status < 400;
  add({ id: "favicon", group: "tecnico", label: "Favicon", value: favicon, status: favOk ? "ok" : "warn", message: favOk ? "Favicon accesible (sale en Google)." : "No se encuentra favicon." });

  const hreflang: SeoReport["hreflang"] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    hreflang.push({ lang: clean($(el).attr("hreflang")), href: abs($(el).attr("href"), base) ?? "" });
  });
  if (hreflang.length) {
    const self = hreflang.some((h) => h.href.replace(/\/$/, "") === res.finalUrl.replace(/\/$/, ""));
    add({ id: "hreflang", group: "tecnico", label: "Hreflang", value: hreflang.map((h) => h.lang).join(", "), status: self ? "ok" : "warn", message: self ? "Versiones de idioma declaradas e incluye esta página." : "Falta la autorreferencia de esta página en hreflang." });
  } else {
    add({ id: "hreflang", group: "tecnico", label: "Hreflang", value: null, status: "info", message: "Sin hreflang (solo necesario si la web tiene varios idiomas)." });
  }

  // ---------- Contenido ----------
  const headings: SeoReport["headings"] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    headings.push({ level: Number(el.tagName.slice(1)), text: clean($(el).text()).slice(0, 140) });
  });
  const h1s = headings.filter((h) => h.level === 1);
  add({
    id: "h1", group: "contenido", label: "Encabezado H1", value: h1s.map((h) => h.text).join(" | ") || null,
    status: h1s.length === 1 ? "ok" : h1s.length === 0 ? "error" : "warn",
    message: h1s.length === 1 ? "Un único H1." : h1s.length === 0 ? "Falta el H1." : `${h1s.length} H1. Lo ideal es uno solo.`,
  });
  let skipped = false;
  for (let i = 1; i < headings.length; i++) if (headings[i].level - headings[i - 1].level > 1) skipped = true;
  add({ id: "headings", group: "contenido", label: "Jerarquía de encabezados", value: `${headings.length} encabezados`, status: skipped ? "warn" : "ok", message: skipped ? "Hay saltos de nivel (p. ej. H2 → H4)." : "Jerarquía ordenada." });

  const imgs = $("img");
  const noAlt = imgs.filter((_, el) => $(el).attr("alt") === undefined).length;
  add({ id: "alt", group: "contenido", label: "Imágenes con alt", value: `${imgs.length - noAlt}/${imgs.length}`, status: noAlt === 0 ? "ok" : noAlt <= 2 ? "warn" : "error", message: noAlt === 0 ? "Todas las imágenes tienen alt." : `${noAlt} imagen(es) sin atributo alt.` });

  const $body = $("body").clone();
  $body.find("script,style,noscript,template").remove();
  const words = clean($body.text()).split(" ").filter((w) => w.length > 1).length;
  add({ id: "words", group: "contenido", label: "Texto visible", value: `${words} palabras`, status: words >= 300 ? "ok" : words >= 100 ? "warn" : "error", message: words >= 300 ? "Contenido suficiente." : words < 100 && $("#__next,#root,#app").length ? "Muy poco texto en el HTML: la web parece depender de JavaScript para pintar el contenido." : "Poco contenido de texto." });

  // ---------- Open Graph ----------
  const og = { title: prop("og:title"), description: prop("og:description"), image: abs(prop("og:image") || prop("og:image:url"), base), url: prop("og:url"), type: prop("og:type"), site: prop("og:site_name") };
  for (const [k, v, req] of [["og:title", og.title, true], ["og:description", og.description, true], ["og:url", og.url, false], ["og:type", og.type, false], ["og:site_name", og.site, false]] as const) {
    add({ id: k, group: "opengraph", label: k, value: v || null, status: v ? "ok" : req ? "error" : "warn", message: v ? "Definido." : req ? "Falta: LinkedIn/WhatsApp usarán otro texto." : "Recomendado." });
  }
  const ogImg = await probe(og.image);
  const ogW = Number(prop("og:image:width")) || null;
  const ogH = Number(prop("og:image:height")) || null;
  let ogImgStatus: Status = "ok";
  let ogImgMsg = "Imagen accesible.";
  if (!og.image) { ogImgStatus = "error"; ogImgMsg = "Sin og:image: el enlace se compartirá sin imagen."; }
  else if (!ogImg || ogImg.status >= 400) { ogImgStatus = "error"; ogImgMsg = `La imagen no carga (${ogImg?.status ?? "sin respuesta"}).`; }
  else if (!ogImg.type.startsWith("image/")) { ogImgStatus = "error"; ogImgMsg = `No es una imagen (${ogImg.type}).`; }
  else if (ogImg.length > 5_000_000) { ogImgStatus = "warn"; ogImgMsg = "Imagen muy pesada (>5 MB): algunas redes no la mostrarán."; }
  else if (ogW && ogH && (ogW < 1200 || ogH < 630)) { ogImgStatus = "warn"; ogImgMsg = `${ogW}×${ogH}: recomendado 1200×630.`; }
  else if (!ogW || !ogH) { ogImgStatus = "warn"; ogImgMsg = "Imagen accesible, pero sin og:image:width/height (recomendado 1200×630)."; }
  add({ id: "og:image", group: "opengraph", label: "og:image", value: og.image, status: ogImgStatus, message: ogImgMsg });

  // ---------- X / Twitter ----------
  const tw = { card: prop("twitter:card"), title: prop("twitter:title"), description: prop("twitter:description"), image: abs(prop("twitter:image") || prop("twitter:image:src"), base) };
  add({ id: "twitter:card", group: "x", label: "twitter:card", value: tw.card || null, status: tw.card ? "ok" : "error", message: tw.card ? (tw.card === "summary_large_image" ? "Tarjeta grande." : "Definida. Usa summary_large_image para imagen grande.") : "Falta: X mostrará un enlace sin tarjeta." });
  add({ id: "twitter:title", group: "x", label: "twitter:title", value: tw.title || null, status: tw.title ? "ok" : og.title ? "info" : "warn", message: tw.title ? "Definido." : og.title ? "Usará og:title como respaldo." : "Falta." });
  add({ id: "twitter:description", group: "x", label: "twitter:description", value: tw.description || null, status: tw.description ? "ok" : og.description ? "info" : "warn", message: tw.description ? "Definido." : og.description ? "Usará og:description como respaldo." : "Falta." });
  add({ id: "twitter:image", group: "x", label: "twitter:image", value: tw.image, status: tw.image ? "ok" : og.image ? "info" : "warn", message: tw.image ? "Definida." : og.image ? "Usará og:image como respaldo." : "Falta." });

  // ---------- Rastreo del dominio ----------
  const robotsUrl = `${finalUrl.origin}/robots.txt`;
  const robotsTxt = await probe(robotsUrl);
  const robotsOk = !!robotsTxt && robotsTxt.status < 300 && /user-agent/i.test(robotsTxt.body);
  const blocksAll = robotsOk && robotsBlocksGoogle(robotsTxt!.body);
  add({ id: "robots.txt", group: "rastreo", label: "robots.txt", value: robotsUrl, status: !robotsOk ? "warn" : blocksAll ? "error" : "ok", message: !robotsOk ? "No hay robots.txt válido." : blocksAll ? "robots.txt bloquea todo el sitio (Disallow: /)." : "Encontrado." });

  const sitemapFromRobots = robotsOk ? robotsTxt!.body.match(/^sitemap:\s*(\S+)/im)?.[1] : undefined;
  const sitemapUrl = sitemapFromRobots ?? `${finalUrl.origin}/sitemap.xml`;
  const sm = await probe(sitemapUrl);
  const smOk = !!sm && sm.status < 300 && /<(urlset|sitemapindex)/i.test(sm.body);
  add({ id: "sitemap", group: "rastreo", label: "Sitemap", value: sitemapUrl, status: smOk ? (sitemapFromRobots ? "ok" : "warn") : "warn", message: smOk ? (sitemapFromRobots ? "Sitemap válido y enlazado en robots.txt." : "Sitemap válido, pero no está en robots.txt.") : "No se encuentra sitemap XML." });

  // ---------- Cómo corregir cada fallo ----------
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const domainName = finalUrl.hostname.replace(/^www\./, "");
  const bestTitle = title || og.title || h1s[0]?.text || domainName;
  const bestDesc = desc || og.description || "";
  const descDraft = bestDesc || "Describe en 120–160 caracteres qué ofreces, para quién y una llamada a la acción.";
  const selfUrl = res.finalUrl;
  const imgForSocial = og.image || "https://" + finalUrl.host + "/og-image.jpg";
  const FIX: Record<string, (c: Check) => Pick<Check, "fix" | "code" | "priority">> = {
    http: () => ({ priority: "alta", fix: "Haz que la URL devuelva 200 OK. Si la página se ha movido, redirige con 301 a la nueva y actualiza los enlaces internos." }),
    redirects: () => ({ priority: "baja", fix: `Usa siempre la URL final (${selfUrl}) en el menú, el sitemap, el canonical y las redes. Si hay varias redirecciones encadenadas, déjalas en una sola 301.` }),
    https: () => ({ priority: "alta", fix: "Instala un certificado SSL (gratis con Let's Encrypt o Cloudflare) y redirige todo http:// a https:// con 301." }),
    title: (c) => ({ priority: c.status === "error" ? "alta" : "media",
      fix: !title ? "Añade un <title> único: palabra clave principal + marca, entre 30 y 60 caracteres." : title.length > 60 ? `Acórtalo a 60 caracteres como máximo (ahora ${title.length}). Pon lo importante al principio.` : `Alárgalo (ahora ${title.length}): añade la palabra clave principal o la ciudad y la marca.`,
      code: `<title>${esc(bestTitle.slice(0, 60))}</title>` }),
    "title-dup": () => ({ priority: "media", fix: "Deja un solo <title> en el <head>. Suele pasar cuando el tema y un plugin SEO lo añaden a la vez: desactiva uno de los dos." }),
    description: (c) => ({ priority: c.status === "error" ? "alta" : "baja",
      fix: !desc ? "Escribe una descripción única de 120–160 caracteres que invite a hacer clic." : desc.length > 160 ? `Recórtala a 160 caracteres como máximo (ahora ${desc.length}).` : `Alárgala hasta 120–160 caracteres (ahora ${desc.length}) con un beneficio y una llamada a la acción.`,
      code: `<meta name="description" content="${esc(descDraft.slice(0, 160))}">` }),
    canonical: () => ({ priority: canonicalCount > 1 ? "alta" : "media",
      fix: canonicalCount > 1 ? "Deja un único <link rel=\"canonical\">. Suele haber uno del tema y otro del plugin SEO." : canonical && canonical.replace(/\/$/, "") !== selfUrl.replace(/\/$/, "") ? "Si esta página es la principal, haz que el canonical apunte a sí misma. Si es una copia de otra, déjalo así." : "Añade un canonical absoluto que apunte a esta misma URL.",
      code: `<link rel="canonical" href="${esc(selfUrl)}">` }),
    robots: () => ({ priority: noindex ? "alta" : "media",
      fix: noindex ? "Quita el noindex si quieres que la página salga en Google (en WordPress: Ajustes → Lectura → desmarca \"Disuadir a los motores de búsqueda\", o revisa el plugin SEO). Revisa también la cabecera X-Robots-Tag del servidor." : "Quita nofollow para que Google siga los enlaces de la página.",
      code: `<meta name="robots" content="index, follow">` }),
    viewport: () => ({ priority: !viewport ? "alta" : "baja", fix: !viewport ? "Añade la etiqueta viewport para que la web se adapte al móvil (Google indexa primero la versión móvil)." : "No bloquees el zoom: quita user-scalable=no y maximum-scale=1.",
      code: `<meta name="viewport" content="width=device-width, initial-scale=1">` }),
    lang: () => ({ priority: "baja", fix: "Declara el idioma en la etiqueta <html> (ayuda a Google y a los lectores de pantalla).", code: `<html lang="es">` }),
    charset: () => ({ priority: "baja", fix: "Declara UTF-8 como primera etiqueta del <head> para evitar caracteres raros (ñ, tildes).", code: `<meta charset="utf-8">` }),
    jsonld: () => ({ priority: "media",
      fix: invalidLd ? "Corrige el JSON del bloque de datos estructurados (suele ser una coma de más o comillas sin cerrar) y valídalo en https://validator.schema.org." : "Añade datos estructurados para optar a resultados enriquecidos (logo, horario, valoraciones). Para un negocio local usa LocalBusiness; si no, Organization. Rellena tus datos reales.",
      code: invalidLd ? undefined : `<script type="application/ld+json">\n${JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: og.site || domainName, url: finalUrl.origin, logo: finalUrl.origin + "/logo.png", sameAs: ["https://www.instagram.com/TU_CUENTA"] }, null, 2)}\n</script>` }),
    favicon: () => ({ priority: "baja", fix: "Sube un favicon (mínimo 48×48, mejor 192×192 o SVG). Google lo muestra junto a tu resultado.",
      code: `<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">` }),
    hreflang: () => ({ priority: "baja", fix: "Cada versión de idioma debe incluirse a sí misma y a las demás en hreflang, más un x-default.",
      code: `<link rel="alternate" hreflang="es" href="${esc(selfUrl)}">\n<link rel="alternate" hreflang="x-default" href="${esc(selfUrl)}">` }),
    h1: () => ({ priority: h1s.length === 0 ? "alta" : "media",
      fix: h1s.length === 0 ? "Añade un único H1 con el tema principal de la página y la palabra clave." : `Deja un solo H1 (ahora hay ${h1s.length}) y convierte los demás en H2. A menudo el logo o un slider llevan H1 sin necesidad.`,
      code: h1s.length === 0 ? `<h1>${esc(bestTitle.split(/[|–-]/)[0].trim())}</h1>` : undefined }),
    headings: () => ({ priority: "baja", fix: "No saltes niveles: tras un H2 va un H3, no un H4. Si un encabezado solo es por estilo, usa CSS en lugar de cambiar el nivel." }),
    alt: () => ({ priority: noAlt > 2 ? "media" : "baja", fix: `Añade un texto alternativo descriptivo a las ${noAlt} imagen(es) que no lo tienen. Si la imagen es solo decorativa, pon alt="" vacío.`, code: `<img src="foto.jpg" alt="Describe lo que se ve en la imagen">` }),
    words: () => ({ priority: words < 100 ? "media" : "baja",
      fix: words < 100 && $("#__next,#root,#app").length ? "El contenido se pinta con JavaScript y Google puede no verlo bien. Usa renderizado en servidor o estático (SSR/SSG)." : "Añade texto útil que responda a lo que busca tu cliente: servicios, zona, preguntas frecuentes. Apunta a 300 palabras o más." }),
    "og:title": () => ({ priority: "media", fix: "Añade el título que se verá al compartir en LinkedIn, WhatsApp o Facebook.", code: `<meta property="og:title" content="${esc(bestTitle)}">` }),
    "og:description": () => ({ priority: "media", fix: "Añade la descripción que se verá al compartir.", code: `<meta property="og:description" content="${esc(descDraft.slice(0, 200))}">` }),
    "og:url": () => ({ priority: "baja", fix: "Indica la URL canónica para que los \"me gusta\" y los enlaces compartidos se agrupen en una sola.", code: `<meta property="og:url" content="${esc(selfUrl)}">` }),
    "og:type": () => ({ priority: "baja", fix: "Indica el tipo de contenido.", code: `<meta property="og:type" content="website">` }),
    "og:site_name": () => ({ priority: "baja", fix: "Indica el nombre de la marca.", code: `<meta property="og:site_name" content="${esc(domainName)}">` }),
    "og:image": () => ({ priority: !og.image || ogImgStatus === "error" ? "alta" : "baja",
      fix: !og.image ? "Crea una imagen de 1200×630 px (JPG o PNG de menos de 1 MB) con tu logo y un mensaje, y enlázala con URL absoluta." : ogImgStatus === "error" ? "La imagen no carga: revisa que la URL sea absoluta, pública y que devuelva una imagen." : "Declara el tamaño de la imagen y usa 1200×630 px.",
      code: `<meta property="og:image" content="${esc(imgForSocial)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="${esc(bestTitle)}">` }),
    "twitter:card": () => ({ priority: "media", fix: "Añade la tarjeta de X con imagen grande.", code: `<meta name="twitter:card" content="summary_large_image">` }),
    "twitter:title": () => ({ priority: "baja", fix: "Añade un título para X (si no, usa og:title).", code: `<meta name="twitter:title" content="${esc(bestTitle)}">` }),
    "twitter:description": () => ({ priority: "baja", fix: "Añade una descripción para X.", code: `<meta name="twitter:description" content="${esc(descDraft.slice(0, 200))}">` }),
    "twitter:image": () => ({ priority: "baja", fix: "Añade una imagen para X (puede ser la misma que og:image).", code: `<meta name="twitter:image" content="${esc(imgForSocial)}">` }),
    "robots.txt": () => ({ priority: blocksAll ? "alta" : "baja",
      fix: blocksAll ? "Tu robots.txt bloquea toda la web a Google. Quita \"Disallow: /\" (WordPress lo añade si la casilla de \"Disuadir a los motores de búsqueda\" está marcada)." : "Crea /robots.txt en la raíz de la web.",
      code: `User-agent: *\nAllow: /\n\nSitemap: ${finalUrl.origin}/sitemap.xml` }),
    sitemap: () => ({ priority: smOk ? "baja" : "media",
      fix: smOk ? "Añade la línea Sitemap a tu robots.txt para que los buscadores lo encuentren solos." : "Genera un sitemap XML (en WordPress lo hacen Yoast o Rank Math; en Next.js con app/sitemap.ts), súbelo y envíalo en Google Search Console.",
      code: smOk ? `Sitemap: ${sitemapUrl}` : undefined }),
  };
  for (const c of checks) {
    if (c.status === "ok" || c.status === "info") continue;
    const f = FIX[c.id]?.(c);
    if (f) Object.assign(c, f);
    c.priority ??= c.status === "error" ? "alta" : "media";
  }

  // ---------- Puntuación ----------
  const weight: Record<Status, number> = { ok: 1, info: 1, warn: 0.5, error: 0 };
  const scored = checks.filter((c) => c.status !== "info");
  const score = Math.round((scored.reduce((s, c) => s + weight[c.status], 0) / scored.length) * 100);
  const counts = { ok: 0, warn: 0, error: 0, info: 0 } as Record<Status, number>;
  checks.forEach((c) => counts[c.status]++);

  const domain = finalUrl.hostname.replace(/^www\./, "");
  return {
    url: input,
    finalUrl: res.finalUrl,
    status: res.status,
    redirects: res.hops,
    fetchedAt: new Date().toISOString(),
    score,
    counts,
    checks,
    preview: {
      google: { title: title || og.title || domain, description: desc || og.description || "", url: res.finalUrl, favicon: favOk ? favicon : null },
      social: { title: og.title || title, description: og.description || desc, image: ogImgStatus === "error" ? null : og.image, site: og.site || domain, domain },
      x: { card: tw.card || "summary", title: tw.title || og.title || title, description: tw.description || og.description || desc, image: tw.image || og.image, domain },
    },
    headings,
    jsonLd,
    hreflang,
  };
}

