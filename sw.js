/* Service worker: sovellus toimii ilman verkkoa (esim. kellarissa).
   - Omat tiedostot: verkko ensin (3,5 s), muuten välimuisti.
   - Kirjastot (lib/): sovelluksen omassa repossa, ei CDN:stä. Pienet ladataan valmiiksi,
     tekstintunnistuksen moottori ja kielidata ensimmäisellä käytöllä (oma, pysyvä välimuisti).
   - Pilvi (Supabase) ja kirjautuminen eivät kulje välimuistin kautta.
   Nosta CACHE-versiota aina, kun julkaiset muutoksia. */
const CACHE = "kuva-sanelu-v29";
const LIBCACHE = "kuva-sanelu-lib-1";      // nosta, kun lib/-tiedostot päivitetään
const SHELL = [
  "./", "index.html", "css/app.css",
  "js/config.js", "js/ui.js", "js/db.js", "js/methods.js", "js/vocab.js", "js/vocabview.js", "js/dictation.js", "js/camera.js",
  "js/cloud.js", "js/app.js", "js/sync.js", "js/cloudui.js", "js/plan.js", "js/check.js", "js/seuranta.js", "js/yleiskuvat.js", "js/planimport.js", "js/kuntoarvio-data.js", "js/kuntoarvio.js",
  "js/capture.js", "js/card.js", "js/export.js", "js/editor.js", "js/lukulaite-ocr.js", "js/meter.js", "js/methodpicker.js", "js/learn.js", "js/autofill.js",
  "js/fieldfill.js", "js/planrooms.js", "js/zoom.js", "js/obslist.js", "js/gallery.js", "kameraluku-testi.html",
  "manifest.webmanifest", "pbm-logo.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"
];
const LIB = ["lib/supabase.js", "lib/jszip.min.js", "lib/pdf.min.js", "lib/pdf.worker.min.js", "lib/tesseract/tesseract.min.js", "lib/tesseract/worker.min.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))),
    caches.open(LIBCACHE).then((c) => Promise.all(LIB.map((u) => c.match(u).then((hit) => hit || c.add(u)).catch(() => {}))))
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== LIBCACHE).map((k) => caches.delete(k))))
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
  const cache = await caches.open(LIBCACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // pilvi ja kirjautuminen suoraan verkosta
  if (url.searchParams.has("code")) return;                   // kirjautumisen paluu: ei välimuistiin
  if (url.pathname.includes("/lib/")) { event.respondWith(cacheFirst(req)); return; }
  event.respondWith(networkFirst(req));
});
