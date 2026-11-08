import { test } from "node:test";
import assert from "node:assert/strict";
import { rate } from "../lib/crux.ts";

// Umbrales oficiales de Core Web Vitals (web.dev): bueno <= good, mejorable <= poor, malo > poor
test("LCP: 2,5 s bueno, hasta 4 s mejorable, más de 4 s malo", () => {
  assert.equal(rate("largest_contentful_paint", 2500), "good");
  assert.equal(rate("largest_contentful_paint", 2501), "needs-improvement");
  assert.equal(rate("largest_contentful_paint", 4000), "needs-improvement");
  assert.equal(rate("largest_contentful_paint", 4001), "poor");
});
test("INP: 200 ms bueno, hasta 500 ms mejorable", () => {
  assert.equal(rate("interaction_to_next_paint", 200), "good");
  assert.equal(rate("interaction_to_next_paint", 500), "needs-improvement");
  assert.equal(rate("interaction_to_next_paint", 501), "poor");
});
test("CLS: 0,1 bueno, hasta 0,25 mejorable", () => {
  assert.equal(rate("cumulative_layout_shift", 0.1), "good");
  assert.equal(rate("cumulative_layout_shift", 0.25), "needs-improvement");
  assert.equal(rate("cumulative_layout_shift", 0.26), "poor");
});
