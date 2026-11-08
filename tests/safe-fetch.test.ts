import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp, normalizeUrl, safeFetch, FetchError } from "../lib/safe-fetch.ts";

test("isPrivateIp bloquea rangos internos, de metadatos y de enlace local", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3"]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
});

test("isPrivateIp deja pasar direcciones públicas", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "100.63.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test("normalizeUrl añade https y acepta http/https en 80/443", () => {
  assert.equal(normalizeUrl("dazenty.com").toString(), "https://dazenty.com/");
  assert.equal(normalizeUrl("http://dazenty.com:80/a").protocol, "http:");
  assert.equal(normalizeUrl("  https://dazenty.com:443  ").hostname, "dazenty.com");
});

test("normalizeUrl rechaza credenciales, puertos y protocolos raros", () => {
  const code = (u: string) => { try { normalizeUrl(u); return "ok"; } catch (e) { return (e as FetchError).code; } };
  assert.equal(code(""), "empty");
  assert.equal(code("https://user:pass@dazenty.com"), "credentials");
  assert.equal(code("https://dazenty.com:8080"), "port");
  assert.equal(code("ftp://dazenty.com"), "protocol");
  assert.equal(code("file:///etc/passwd"), "protocol");
  assert.notEqual(code("javascript:alert(1)"), "ok");
});

test("safeFetch no sale a direcciones internas (SSRF)", async () => {
  for (const u of ["http://127.0.0.1", "http://localhost", "http://169.254.169.254/latest/meta-data", "http://10.0.0.1", "http://[::1]", "http://app.localhost"]) {
    await assert.rejects(() => safeFetch(u), (e: unknown) => e instanceof FetchError && e.code === "private", u);
  }
});
