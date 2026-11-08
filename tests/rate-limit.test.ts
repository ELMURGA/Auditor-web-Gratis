import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../lib/rate-limit.ts";

test("deja pasar hasta el máximo y bloquea después", () => {
  const k = "t1";
  assert.deepEqual([1, 2, 3, 4].map(() => rateLimit(k, 3, 60_000)), [true, true, true, false]);
});

test("cada clave tiene su propio contador", () => {
  rateLimit("a", 1, 60_000);
  assert.equal(rateLimit("a", 1, 60_000), false);
  assert.equal(rateLimit("b", 1, 60_000), true);
});

test("la ventana se libera con el tiempo", async () => {
  assert.equal(rateLimit("w", 1, 25), true);
  assert.equal(rateLimit("w", 1, 25), false);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(rateLimit("w", 1, 25), true);
});
