// Medición REAL desde el servidor: tiempos de red de varias peticiones de verdad
// (DNS, TCP, TLS, TTFB, descarga), peso real de la página y sus recursos,
// compresión, caché y recursos que bloquean el renderizado. Nada simulado.
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import tls, { type TLSSocket } from "node:tls";
import * as cheerio from "cheerio";
import { FetchError, isPrivateIp, normalizeUrl, safeFetch, USER_AGENT } from "./safe-fetch";

export type Timing = { dnsMs: number; connectMs: number; tlsMs: number; ttfbMs: number; downloadMs: number; totalMs: number };

// lookup que valida la IP en el momento de conectar (evita DNS rebinding)
const safeLookup: typeof dns.lookup = ((host: string, opts: any, cb: any) => {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  dns.lookup(host, { ...opts, all: true }, (err, addrs: dns.LookupAddress[]) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return cb(new FetchError("No se pueden analizar direcciones internas.", "private"));
    if (opts?.all) cb(null, addrs);
    else cb(null, addrs[0].address, addrs[0].family);
  });
}) as any;

type RawResult = { status: number; headers: http.IncomingHttpHeaders; body: Buffer; wireBytes: number; timing: Timing; alpn: string | null; tlsVersion: string | null; remoteIp: string | null };

function timedRequest(url: URL, maxBytes = 5_000_000): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let tDns = t0, tConnect = t0, tTls = t0, tFirst = t0;
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: "GET",
      lookup: safeLookup,
      agent: false, // conexión nueva en cada medición: tiempos completos y honestos
      ALPNProtocols: ["http/1.1"],
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8", "accept-encoding": "br, gzip, deflate", "accept-language": "es-ES,es;q=0.9" },
      timeout: 15_000,
    } as https.RequestOptions);
    req.on("socket", (s) => {
      s.on("lookup", () => (tDns = performance.now()));
      s.on("connect", () => (tConnect = performance.now()));
      s.on("secureConnect", () => (tTls = performance.now()));
    });
    req.on("timeout", () => req.destroy(new FetchError("La web tardó demasiado en responder.", "timeout")));
    req.on("error", (e) => { if (!(e instanceof FetchError)) console.error("[measure]", e); reject(e instanceof FetchError ? e : new FetchError("No se pudo conectar con la web.", "network")); });
    req.on("response", (res) => {
      tFirst = performance.now();
      const chunks: Buffer[] = [];
      let wire = 0;
      res.on("data", (c: Buffer) => {
        wire += c.length;
        if (wire > maxBytes) { res.destroy(); return; }
        chunks.push(c);
      });
      res.on("end", () => {
        const tEnd = performance.now();
        const raw = Buffer.concat(chunks);
        let body = raw;
        try {
          const enc = res.headers["content-encoding"];
          if (enc === "br") body = zlib.brotliDecompressSync(raw);
          else if (enc === "gzip") body = zlib.gunzipSync(raw);
          else if (enc === "deflate") body = zlib.inflateSync(raw);
        } catch { /* cuerpo truncado o raro: usamos crudo */ }
        const sock = res.socket as TLSSocket;
        if (tDns === t0) tDns = t0; // IP directa
        if (tConnect < tDns) tConnect = tDns;
        const tlsOn = url.protocol === "https:";
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
          wireBytes: wire,
          alpn: tlsOn ? (sock.alpnProtocol || null) : null,
          tlsVersion: tlsOn ? (sock.getProtocol?.() ?? null) : null,
          remoteIp: sock.remoteAddress ?? null,
          timing: {
            dnsMs: Math.round(tDns - t0),
            connectMs: Math.round(tConnect - tDns),
            tlsMs: tlsOn ? Math.round(tTls - tConnect) : 0,
            ttfbMs: Math.round(tFirst - (tlsOn ? tTls : tConnect)),
            downloadMs: Math.round(tEnd - tFirst),
            totalMs: Math.round(tEnd - t0),
          },
        });
      });
      res.on("error", () => reject(new FetchError("Conexión cortada.", "network")));
    });
    req.end();
  });
}

// Comprueba si el servidor negocia HTTP/2 (handshake TLS real con ALPN)
function probeH2(url: URL): Promise<string | null> {
  if (url.protocol !== "https:") return Promise.resolve(null);
  return new Promise((resolve) => {
    const s = tls.connect({ host: url.hostname, port: 443, servername: url.hostname, ALPNProtocols: ["h2", "http/1.1"], lookup: safeLookup as any, timeout: 8000 }, () => {
      const p = s.alpnProtocol || "http/1.1";
      s.destroy();
      resolve(p);
    });
    s.on("error", () => resolve(null));
    s.on("timeout", () => { s.destroy(); resolve(null); });
  });
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export type PerfStatus = "ok" | "warn" | "error" | "info";
export type PerfCheck = { id: string; group: "experiencia" | "servidor" | "compresion" | "peso" | "render" | "imagenes"; label: string; status: PerfStatus; value?: string; message: string; fix?: string };

export type ResourceInfo = { url: string; type: string; bytes: number | null; cache: string | null; status: number | null; renderBlocking: boolean; thirdParty: boolean; compressed: boolean | null };

export type Measurement = {
  finalUrl: string;
  serverLocation: string;
  runs: Timing[];
  median: Timing;
  protocol: { alpn: string | null; tls: string | null; ip: string | null; http3Advertised: boolean };
  server: { server: string | null; cdn: string | null; cacheStatus: string | null };
  html: { wireBytes: number; rawBytes: number; compression: string | null; cacheControl: string | null; age: string | null };
  resources: ResourceInfo[];
  totals: { requests: number; bytes: number; byType: Record<string, { count: number; bytes: number }>; thirdPartyBytes: number; unknownSize: number };
  checks: PerfCheck[];
};

function detectCdn(h: http.IncomingHttpHeaders): string | null {
  if (h["cf-ray"]) return "Cloudflare";
  if (h["x-vercel-id"]) return "Vercel";
  if (h["x-nf-request-id"]) return "Netlify";
  if (h["x-amz-cf-id"]) return "Amazon CloudFront";
  if (String(h["x-served-by"] ?? "").includes("cache-")) return "Fastly";
  if (h["x-akamai-transformed"] || String(h["server"] ?? "").includes("AkamaiGHost")) return "Akamai";
  if (h["x-github-request-id"]) return "GitHub Pages";
  if (String(h["server"] ?? "").toLowerCase().includes("hostinger") || h["platform"] === "hostinger") return "Hostinger";
  return null;
}

export async function measure(input: string, runs = 3): Promise<Measurement> {
  // Primero resolvemos redirecciones con el fetch seguro para medir la URL final
  const first = await safeFetch(input, { maxBytes: 200_000 });
  const url = normalizeUrl(first.finalUrl);
  const results: RawResult[] = [];
  for (let i = 0; i < runs; i++) results.push(await timedRequest(url));
  const last = results[results.length - 1];
  last.alpn = await probeH2(url);
  const timings = results.map((r) => r.timing);
  const med: Timing = {
    dnsMs: median(timings.map((t) => t.dnsMs)), connectMs: median(timings.map((t) => t.connectMs)),
    tlsMs: median(timings.map((t) => t.tlsMs)), ttfbMs: median(timings.map((t) => t.ttfbMs)),
    downloadMs: median(timings.map((t) => t.downloadMs)), totalMs: median(timings.map((t) => t.totalMs)),
  };
  const h = last.headers;
  const html = last.body.toString("utf8");
  const $ = cheerio.load(html);
  const host = url.hostname.replace(/^www\./, "");

  // ---------- Inventario de recursos ----------
  const found = new Map<string, Omit<ResourceInfo, "bytes" | "cache" | "status" | "compressed">>();
  const addRes = (href: string | undefined, type: string, renderBlocking = false) => {
    if (!href || href.startsWith("data:")) return;
    try {
      const u = new URL(href, url);
      if (!/^https?:$/.test(u.protocol)) return;
      const key = u.toString();
      if (!found.has(key)) found.set(key, { url: key, type, renderBlocking, thirdParty: !u.hostname.replace(/^www\./, "").endsWith(host) });
    } catch { /* ignorar */ }
  };
  $("head script[src]").each((_, el) => { const a = $(el).attr() ?? {}; addRes(a.src, "js", !("async" in a) && !("defer" in a) && a.type !== "module"); });
  $("body script[src]").each((_, el) => addRes($(el).attr("src"), "js"));
  $('link[rel="stylesheet"]').each((_, el) => { const m = $(el).attr("media"); addRes($(el).attr("href"), "css", !m || m === "all" || m === "screen"); });
  $('link[rel="preload"][as="font"], link[rel="preload"][as="style"], link[rel="preload"][as="script"]').each((_, el) => addRes($(el).attr("href"), $(el).attr("as") === "font" ? "font" : $(el).attr("as") === "style" ? "css" : "js"));
  $("img[src]").each((_, el) => addRes($(el).attr("src"), "img"));
  $("img[srcset], source[srcset]").each((_, el) => addRes(($(el).attr("srcset") ?? "").split(",")[0]?.trim().split(" ")[0], "img"));
  $("video[src], video source[src]").each((_, el) => addRes($(el).attr("src"), "video"));
  $("iframe[src]").each((_, el) => addRes($(el).attr("src"), "iframe"));

  const list = [...found.values()].slice(0, 60);
  const resources: ResourceInfo[] = [];
  const queue = [...list];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const r = queue.shift()!;
      try {
        // GET real (no HEAD: muchos servidores no dan tamaño en HEAD). Límite 15 MB por recurso.
        const res = await safeFetch(r.url, { maxBytes: 15_000_000, timeoutMs: 15_000 });
        const enc = res.headers.get("content-encoding");
        const len = Number(res.headers.get("content-length"));
        resources.push({ ...r, status: res.status, bytes: enc && len ? len : res.bytes, cache: res.headers.get("cache-control"), compressed: ["js", "css"].includes(r.type) ? !!enc : null });
      } catch {
        resources.push({ ...r, status: null, bytes: null, cache: null, compressed: null });
      }
    }
  }));

  const byType: Measurement["totals"]["byType"] = { html: { count: 1, bytes: last.wireBytes } };
  let total = last.wireBytes, third = 0, unknown = 0;
  for (const r of resources) {
    byType[r.type] ??= { count: 0, bytes: 0 };
    byType[r.type].count++;
    if (r.bytes == null) { unknown++; continue; }
    byType[r.type].bytes += r.bytes; total += r.bytes;
    if (r.thirdParty) third += r.bytes;
  }

  // ---------- Comprobaciones (estilo checklist: bien / aviso / error + cómo arreglarlo) ----------
  const checks: PerfCheck[] = [];
  const add = (c: PerfCheck) => checks.push(c);
  const enc = (h["content-encoding"] as string) ?? null;
  const kbs = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`);

  // Servidor
  add({ id: "ttfb", group: "servidor", label: "Respuesta del servidor (TTFB)", value: `${med.ttfbMs} ms`,
    status: med.ttfbMs <= 300 ? "ok" : med.ttfbMs <= 800 ? "warn" : "error",
    message: med.ttfbMs <= 300 ? "El servidor responde rápido." : `El servidor tarda ${med.ttfbMs} ms en empezar a enviar la página.`,
    fix: med.ttfbMs > 300 ? "Activa caché de página (HTML estático/ISR), usa un CDN y revisa consultas lentas a base de datos o plugins." : undefined });
  add({ id: "cdn", group: "servidor", label: "CDN", value: detectCdn(h) ?? "No detectada", status: detectCdn(h) ? "ok" : "warn",
    message: detectCdn(h) ? "La web se sirve desde una red de distribución." : "No se detecta CDN: los visitantes lejanos del servidor esperan más.",
    fix: detectCdn(h) ? undefined : "Pon la web detrás de Cloudflare (gratis) o despliega en Vercel/Netlify." });
  add({ id: "http2", group: "servidor", label: "HTTP/2", value: last.alpn ?? "—", status: last.alpn === "h2" ? "ok" : url.protocol !== "https:" ? "error" : "warn",
    message: last.alpn === "h2" ? "El servidor usa HTTP/2 (descarga recursos en paralelo)." : "El servidor no usa HTTP/2.",
    fix: last.alpn === "h2" ? undefined : "Activa HTTP/2 en el hosting o usa un CDN que lo active." });
  add({ id: "http3", group: "servidor", label: "HTTP/3", value: /h3/.test(String(h["alt-svc"] ?? "")) ? "Sí" : "No", status: /h3/.test(String(h["alt-svc"] ?? "")) ? "ok" : "info",
    message: /h3/.test(String(h["alt-svc"] ?? "")) ? "Anuncia HTTP/3 (mejor en redes móviles)." : "No anuncia HTTP/3 (opcional, ayuda en móvil)." });
  const redirects = first.hops.length - 1;
  add({ id: "redirects", group: "servidor", label: "Redirecciones", value: redirects ? first.hops.map((x) => x.status).join(" → ") : "Ninguna", status: redirects === 0 ? "ok" : redirects === 1 ? "warn" : "error",
    message: redirects === 0 ? "Se llega directamente." : `${redirects} redirección(es) antes de cargar: cada una suma una ida y vuelta.`,
    fix: redirects ? `Enlaza y anuncia directamente ${url.toString()}.` : undefined });

  // Caché y compresión
  add({ id: "html-compress", group: "compresion", label: "Compresión del HTML", value: enc ?? "ninguna", status: enc ? (enc === "br" ? "ok" : "ok") : last.body.length > 2000 ? "error" : "ok",
    message: enc ? `HTML comprimido con ${enc === "br" ? "Brotli" : enc}.` : "El HTML viaja sin comprimir.",
    fix: enc ? undefined : "Activa Brotli o Gzip en el servidor (en Apache: mod_deflate; en Nginx: gzip on)." });
  const uncompressed = resources.filter((r) => r.compressed === false && (r.bytes ?? 0) > 2000);
  add({ id: "res-compress", group: "compresion", label: "Compresión de JS/CSS", value: `${uncompressed.length} sin comprimir`, status: uncompressed.length ? "warn" : "ok",
    message: uncompressed.length ? `${uncompressed.length} archivo(s) JS/CSS se envían sin comprimir.` : "JS y CSS comprimidos.", fix: uncompressed.length ? "Activa la compresión también para text/css y application/javascript." : undefined });
  const ownStatic = resources.filter((r) => r.status && r.status < 400 && !r.thirdParty && ["js", "css", "img", "font"].includes(r.type));
  const noCache = ownStatic.filter((r) => !/max-age=\d{5,}|immutable/.test(r.cache ?? ""));
  add({ id: "cache", group: "compresion", label: "Caché de recursos", value: `${ownStatic.length - noCache.length}/${ownStatic.length} con caché larga`, status: noCache.length === 0 ? "ok" : noCache.length <= 3 ? "warn" : "error",
    message: noCache.length === 0 ? "Los recursos propios se guardan en caché del navegador." : `${noCache.length} recurso(s) propios sin caché larga: los visitantes que vuelven los descargan otra vez.`,
    fix: noCache.length ? "Sirve JS, CSS, imágenes y fuentes con Cache-Control: public, max-age=31536000, immutable (y nombres con hash)." : undefined });

  // Peso
  add({ id: "weight", group: "peso", label: "Peso total de la página", value: kbs(total), status: total <= 1_500_000 ? "ok" : total <= 3_000_000 ? "warn" : "error",
    message: total <= 1_500_000 ? "Peso razonable para móvil." : `La página pesa ${kbs(total)}: en 4G lento son varios segundos solo de descarga.`,
    fix: total > 1_500_000 ? "Reduce imágenes, vídeos y scripts de terceros; objetivo < 1,5 MB." : undefined });
  const jsBytes = byType.js?.bytes ?? 0;
  add({ id: "js", group: "peso", label: "JavaScript", value: kbs(jsBytes), status: jsBytes <= 400_000 ? "ok" : jsBytes <= 1_000_000 ? "warn" : "error",
    message: jsBytes <= 400_000 ? "Cantidad de JavaScript moderada." : `${kbs(jsBytes)} de JavaScript: en móviles de gama media empeora la respuesta (INP).`,
    fix: jsBytes > 400_000 ? "Quita librerías y plugins que no uses, carga scripts de terceros con defer o tras la interacción." : undefined });
  add({ id: "requests", group: "peso", label: "Número de peticiones", value: String(1 + resources.length), status: resources.length <= 50 ? "ok" : resources.length <= 90 ? "warn" : "error",
    message: resources.length <= 50 ? "Número de peticiones correcto." : `${1 + resources.length} peticiones.`, fix: resources.length > 50 ? "Agrupa CSS/JS, usa sprites o iconos SVG en línea y elimina recursos innecesarios." : undefined });
  const thirdHosts = new Set(resources.filter((r) => r.thirdParty).map((r) => new URL(r.url).hostname));
  add({ id: "third", group: "peso", label: "Terceros", value: `${thirdHosts.size} dominios · ${kbs(third)}`, status: thirdHosts.size <= 5 ? "ok" : thirdHosts.size <= 10 ? "warn" : "error",
    message: thirdHosts.size <= 5 ? "Pocos dominios de terceros." : `Se conecta a ${thirdHosts.size} dominios externos: cada uno exige DNS + conexión.`,
    fix: thirdHosts.size > 5 ? "Elimina widgets/píxeles que no uses y aloja tú las fuentes." : undefined });
  const broken = resources.filter((r) => r.status && r.status >= 400);
  add({ id: "broken", group: "peso", label: "Recursos rotos", value: String(broken.length), status: broken.length ? "error" : "ok",
    message: broken.length ? `${broken.length} recurso(s) dan error: ${broken.slice(0, 3).map((b) => `${b.status} ${b.url.split("/").pop()}`).join(", ")}.` : "Todos los recursos cargan.",
    fix: broken.length ? "Corrige o elimina las referencias rotas." : undefined });

  // Renderizado
  const blocking = resources.filter((r) => r.renderBlocking);
  add({ id: "blocking", group: "render", label: "Recursos que bloquean la carga", value: String(blocking.length), status: blocking.length <= 2 ? "ok" : blocking.length <= 5 ? "warn" : "error",
    message: blocking.length <= 2 ? "Pocos recursos bloquean el pintado." : `${blocking.length} CSS/JS en el <head> impiden pintar nada hasta descargarse.`,
    fix: blocking.length > 2 ? "Añade defer a los scripts, une el CSS y carga el no crítico de forma diferida." : undefined });
  const imgs = $("img");
  const imgsNoDims = imgs.filter((_, el) => !$(el).attr("width") || !$(el).attr("height")).length;
  add({ id: "img-dims", group: "render", label: "Imágenes con tamaño fijado", value: `${imgs.length - imgsNoDims}/${imgs.length}`, status: imgsNoDims === 0 ? "ok" : imgsNoDims <= 3 ? "warn" : "error",
    message: imgsNoDims === 0 ? "Todas las imágenes reservan su hueco." : `${imgsNoDims} imagen(es) sin width/height: la página "salta" al cargar (CLS).`,
    fix: imgsNoDims ? "Añade width y height (o aspect-ratio en CSS) a cada imagen." : undefined });
  const firstImg = imgs.first();
  const lazyFirst = firstImg.attr("loading") === "lazy";
  add({ id: "lcp-lazy", group: "render", label: "Imagen principal sin lazy", value: firstImg.length ? (firstImg.attr("loading") ?? "eager") : "—", status: lazyFirst ? "warn" : "ok",
    message: lazyFirst ? "La primera imagen tiene loading=\"lazy\": retrasa el contenido principal (LCP)." : "La primera imagen no se retrasa.",
    fix: lazyFirst ? "Quita loading=\"lazy\" de la imagen principal y añade fetchpriority=\"high\"." : undefined });
  const lazyCount = imgs.filter((_, el) => $(el).attr("loading") === "lazy").length;
  add({ id: "lazy", group: "render", label: "Carga diferida de imágenes", value: `${lazyCount}/${imgs.length} lazy`, status: imgs.length <= 3 || lazyCount >= imgs.length / 2 ? "ok" : "warn",
    message: imgs.length <= 3 || lazyCount >= imgs.length / 2 ? "Las imágenes fuera de pantalla se cargan cuando hacen falta." : "Muchas imágenes se descargan aunque no se vean.",
    fix: imgs.length > 3 && lazyCount < imgs.length / 2 ? "Añade loading=\"lazy\" a las imágenes por debajo de la primera pantalla." : undefined });
  const preconnects = $('link[rel="preconnect"], link[rel="dns-prefetch"]').length;
  add({ id: "preconnect", group: "render", label: "Preconexión a terceros", value: String(preconnects), status: thirdHosts.size === 0 || preconnects > 0 ? "ok" : "info",
    message: thirdHosts.size === 0 || preconnects > 0 ? "Correcto." : "No hay preconnect para los dominios externos críticos.",
    fix: thirdHosts.size > 0 && !preconnects ? "Añade <link rel=\"preconnect\"> a fuentes/CDN usados en la primera pantalla." : undefined });
  const fontsNoSwap = /@font-face(?![^}]*font-display)/i.test($("style").text());
  add({ id: "fonts", group: "render", label: "Fuentes con font-display", value: fontsNoSwap ? "Falta" : "OK", status: fontsNoSwap ? "warn" : "ok",
    message: fontsNoSwap ? "Hay fuentes sin font-display: el texto puede quedar invisible mientras cargan." : "Sin problemas detectados con las fuentes.", fix: fontsNoSwap ? "Añade font-display: swap a cada @font-face." : undefined });

  // Imágenes
  const imgRes = resources.filter((r) => r.type === "img");
  const bigImgs = imgRes.filter((r) => (r.bytes ?? 0) > 200_000);
  add({ id: "img-weight", group: "imagenes", label: "Imágenes pesadas", value: `${bigImgs.length} > 200 KB`, status: bigImgs.length === 0 ? "ok" : bigImgs.length <= 2 ? "warn" : "error",
    message: bigImgs.length === 0 ? "Ninguna imagen supera 200 KB." : `${bigImgs.length} imagen(es) pesadas (la mayor: ${kbs(Math.max(...bigImgs.map((b) => b.bytes ?? 0)))}).`,
    fix: bigImgs.length ? "Comprime y redimensiona al tamaño en que se muestran; usa WebP o AVIF." : undefined });
  const oldFormat = imgRes.filter((r) => /\.(jpe?g|png|gif)(\?|$)/i.test(r.url) && (r.bytes ?? 0) > 50_000);
  add({ id: "img-format", group: "imagenes", label: "Formatos modernos", value: `${oldFormat.length} JPG/PNG grandes`, status: oldFormat.length === 0 ? "ok" : "warn",
    message: oldFormat.length === 0 ? "Imágenes en formatos eficientes." : `${oldFormat.length} imagen(es) JPG/PNG/GIF de más de 50 KB.`, fix: oldFormat.length ? "Conviértelas a WebP/AVIF (ahorro típico 30–50%)." : undefined });

  return {
    finalUrl: url.toString(),
    serverLocation: process.env.VERCEL_REGION ? `Vercel ${process.env.VERCEL_REGION}` : "Servidor local",
    runs: timings,
    median: med,
    protocol: { alpn: last.alpn, tls: last.tlsVersion, ip: last.remoteIp, http3Advertised: /h3/.test(String(h["alt-svc"] ?? "")) },
    server: { server: (h["server"] as string) ?? null, cdn: detectCdn(h), cacheStatus: (h["cf-cache-status"] ?? h["x-vercel-cache"] ?? h["x-cache"] ?? null) as string | null },
    html: { wireBytes: last.wireBytes, rawBytes: last.body.length, compression: enc, cacheControl: (h["cache-control"] as string) ?? null, age: (h["age"] as string) ?? null },
    resources: resources.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)),
    totals: { requests: 1 + resources.length, bytes: total, byType, thirdPartyBytes: third, unknownSize: unknown },
    checks,
  };
}
