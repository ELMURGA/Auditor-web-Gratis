// Límite simple en memoria por IP (suficiente para una instancia; en producción usar Upstash/Redis).
const hits = new Map<string, number[]>();
export function rateLimit(ip: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(ip, arr); return false; }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}
