import { test } from "node:test";
import assert from "node:assert/strict";
import { robotsBlocksGoogle } from "../lib/robots.ts";

const cases: [string, string, boolean][] = [
  ["bloquea todo a todos", "User-agent: *\nDisallow: /", true],
  ["otro bot bloqueado, Google no", "User-agent: *\nDisallow: /admin\n\nUser-agent: PetalBot\nDisallow: /", false],
  ["grupo compartido por varios agentes", "User-agent: GPTBot\nUser-agent: *\nDisallow: /", true],
  ["Googlebot tiene su propio grupo permitido", "User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /", false],
  ["Allow: / reabre el sitio", "User-agent: *\nDisallow: /\nAllow: /", false],
  ["Disallow vacío no bloquea", "User-agent: *\nDisallow:", false],
  ["robots.txt típico de WordPress", "# comentario\nUser-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php", false],
  ["mayúsculas y comentarios en línea", "USER-AGENT: *   # todos\nDISALLOW: /   # todo", true],
  ["archivo vacío", "", false],
];
for (const [name, txt, expected] of cases) {
  test(`robots.txt: ${name}`, () => assert.equal(robotsBlocksGoogle(txt), expected));
}
