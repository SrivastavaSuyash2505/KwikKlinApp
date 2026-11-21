/* Kwik Klin Control — service worker (served at /control/sw.js, scope /control).
 *
 * Sirf itna ki panel phone par app ki tarah install ho, aur net jaane par
 * khaali safed page ki jagah saaf "offline" sandesh dikhe.
 *
 *   - /control/api (login, dukaanein, paisa) KABHI intercept nahi: vendor ka
 *     data na cache mein jaata hai, na purana dikhta hai.
 *   - Sirf /control page (navigation) network-first; uski aakhri copy
 *     fallback. JS/CSS ?v=<mtime> wale immutable hain, browser khud rakhta hai.
 */

const CACHE = "kk-control-v1";
const PAGE = "/control";
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kwik Klin Control</title><body style="font:16px system-ui,sans-serif;background:#f4f6fb;color:#0c1430;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center">
<div><b>No internet</b><p style="color:#55607a">Kwik Klin Control needs a connection. It will load again when you are back online.</p>
<p><a href="/control" style="color:#1f5af0;font-weight:700">Try again</a></p></div></body>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kk-control-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;      // API, assets: browser khud
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname !== PAGE) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(PAGE, copy)); }
      return res;
    }).catch(() => caches.match(PAGE).then((hit) => hit ||
      new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })))
  );
});
