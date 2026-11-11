/* Service worker: sovellus toimii ilman verkkoa (esim. kellarissa).
   - Omat tiedostot: verkko ensin (3,5 s), muuten välimuisti.
   - CDN-kirjastot (jszip, pdf.js): välimuisti ensin, ladataan valmiiksi.
   Nosta CACHE-versiota aina, kun julkaiset muutoksia. */
const CACHE = "kuva-sanelu-v2";
const SHELL = [
  "./", "index.html", "css/app.css",
  "js/ui.js", "js/db.js", "js/methods.js", "js/dictation.js", "js/camera.js",
  "js/app.js", "js/plan.js", "js/check.js", "js/capture.js", "js/card.js", "js/export.js", "js/editor.js",
  "manifest.webmanifest", "pbm-logo.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"
];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(SHELL.concat(CDN).map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
  net.catch(() => {});
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3500))]);
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || net;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "cdnjs.cloudflare.com") { event.respondWith(cacheFirst(req)); return; }
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
});
