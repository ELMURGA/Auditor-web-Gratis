/* Dazenty RUM: mide Web Vitals de visitantes reales y los envía al panel.
   Uso: <script defer src="https://dazenty.com/auditor/rum.js"></script> */
(function () {
  var s = document.currentScript;
  var base = s && s.src ? s.src.replace(/\/rum\.js(\?.*)?$/, "") : "";
  var endpoint = base + "/api/rum";
  var queue = [];
  var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
  var conn = navigator.connection || {};
  var ua = navigator.userAgent;
  var device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua)) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
  function flush() {
    if (!queue.length) return;
    var body = JSON.stringify({ page: location.origin + location.pathname, device: device, net: conn.effectiveType || null, nav: nav ? nav.type : null, metrics: queue.splice(0) });
    if (!(navigator.sendBeacon && navigator.sendBeacon(endpoint, body))) {
      fetch(endpoint, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } });
    }
  }
  function report(m) { queue.push({ name: m.name, value: Math.round(m.value * (m.name === "CLS" ? 1000 : 1)) / (m.name === "CLS" ? 1000 : 1), rating: m.rating, id: m.id }); }
  addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  addEventListener("pagehide", flush);
  var vs = document.createElement("script");
  vs.src = base + "/web-vitals.iife.js";
  vs.onload = function () {
    var w = window.webVitals;
    w.onLCP(report); w.onINP(report); w.onCLS(report); w.onFCP(report); w.onTTFB(report);
  };
  document.head.appendChild(vs);
})();
