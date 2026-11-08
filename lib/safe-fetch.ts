// Fetch seguro para URLs que introduce el usuario.
// Bloquea IPs privadas/locales (anti-SSRF), sigue redirecciones a mano
// (revalidando cada salto), limita tiempo y tamaño de respuesta.
import { lookup } from "node:dns/promises";
import net from "node:net";

export class FetchError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export const USER_AGENT =
  "Mozilla/5.0 (compatible; DazentyAnalyzer/1.0; +https://dazenty.com)";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fc") || v6.startsWith("fd") ||
    v6.startsWith("fe8") || v6.startsWith("fe9") ||
    v6.startsWith("fea") || v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

export function normalizeUrl(input: string): URL {
  let raw = (input || "").trim();
  if (!raw) throw new FetchError("Escribe una URL.", "empty");
  // Un esquema que no sea http(s) (ftp://, file://...) se rechaza en vez de anteponerle https://
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw))
    throw new FetchError("Solo se admiten URLs http/https.", "protocol");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("La URL no es válida.", "invalid");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new FetchError("Solo se admiten URLs http/https.", "protocol");
  if (url.username || url.password)
    throw new FetchError("La URL no puede llevar credenciales.", "credentials");
  if (url.port && !["80", "443"].includes(url.port))
    throw new FetchError("Solo se admiten los puertos 80 y 443.", "port");
  return url;
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    throw new FetchError("No se pueden analizar direcciones internas.", "private");
  let addrs: { address: string }[];
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    throw new FetchError(`No se encuentra el dominio ${host}.`, "dns");
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address)))
    throw new FetchError("No se pueden analizar direcciones internas.", "private");
}

export type Hop = { url: string; status: number };

export type SafeResponse = {
  finalUrl: string;
  status: number;
  headers: Headers;
  body: string;
  bytes: number;
  hops: Hop[];
  timing: { totalMs: number; ttfbMs: number; downloadMs: number };
};

async function readLimited(res: Response, maxBytes: number) {
  if (!res.body) return { buf: new Uint8Array(), bytes: 0 };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return { buf, bytes: total };
}

export async function safeFetch(
  input: string | URL,
  opts: { method?: "GET" | "HEAD"; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; readBody?: boolean } = {}
): Promise<SafeResponse> {
  const { method = "GET", maxBytes = 3_000_000, timeoutMs = 12_000, maxRedirects = 6, readBody = true } = opts;
  let url = typeof input === "string" ? normalizeUrl(input) : input;
  const hops: Hop[] = [];
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let i = 0; i <= maxRedirects; i++) {
      await assertPublicHost(url);
      const t0 = performance.now();
      const res = await fetch(url, {
        method,
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "es-ES,es;q=0.9,en;q=0.8",
          "accept-encoding": "gzip, deflate, br",
        },
      });
      const ttfb = performance.now() - t0;
      hops.push({ url: url.toString(), status: res.status });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel();
        url = normalizeUrl(new URL(loc, url).toString());
        continue;
      }
      const t1 = performance.now();
      const { buf, bytes } = readBody && method === "GET" ? await readLimited(res, maxBytes) : { buf: new Uint8Array(), bytes: 0 };
      if (!readBody || method !== "GET") await res.body?.cancel().catch(() => {});
      const end = performance.now();
      return {
        finalUrl: url.toString(),
        status: res.status,
        headers: res.headers,
        body: new TextDecoder("utf-8").decode(buf),
        bytes,
        hops,
        timing: { totalMs: Math.round(end - started), ttfbMs: Math.round(ttfb), downloadMs: Math.round(end - t1) },
      };
    }
    throw new FetchError("Demasiadas redirecciones.", "redirects");
  } catch (e) {
    if (e instanceof FetchError) throw e;
    if ((e as Error).name === "AbortError") throw new FetchError("La web tardó demasiado en responder.", "timeout");
    throw new FetchError("No se pudo conectar con la web.", "network");
  } finally {
    clearTimeout(timer);
  }
}
