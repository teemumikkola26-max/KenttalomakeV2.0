// Tilaseurannan lokin uudelleenajo: node tools/replay.js loki.json [pohjoinen|-] [kierroksia]. Mittaa ehdotusten osumat.
// node replay.js <loki.json> [pohjoinen|-] [kierroksia]
const fs = require("fs");
const D = JSON.parse(fs.readFileSync(process.argv[2]));
const N0 = process.argv[3] && process.argv[3] !== "-" ? +process.argv[3] : undefined, KR = +process.argv[4] || 5;
let now = 0;
global.performance = { now: () => now };
Date.now = () => now;
global.window = global; global.navigator = { userAgent: D.laite };
global.document = { addEventListener() {}, createElement() { return { remove() {}, addEventListener() {} }; }, body: { appendChild() {} }, visibilityState: "visible" };
const store = {}; global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
window.DeviceMotionEvent = function () {}; window.addEventListener = () => {}; window.removeEventListener = () => {};
const E = JSON.parse(JSON.stringify(D.kerrokset[0])); if (N0 != null) E.pohjoinen = N0; delete E.pohjoinenOpittu; if (process.env.NOOVET) E.ovet = [];
const kohde = { id: "k1", paikannus: true, kerrokset: [E], tilat: E.tilat.map((t) => Object.assign({ kerrosId: E.id }, t)) };
global.App = { S: { kohde }, Model: { tila: (id) => kohde.tilat.find((t) => t.id === id) || null, kerros: (id) => kohde.kerrokset.find((e) => e.id === id), saveKohde() {} } };
eval(fs.readFileSync(process.env.PJS || __dirname + "/../js/paikannus.js", "utf8"));
const P = window.Paikannus, tun = (id) => (kohde.tilat.find((t) => t.id === id) || {}).tunnus;
(async () => {
  let t1 = 0, t3 = 0, n = 0;
  for (let kr = 0; kr < KR; kr++) {
    P.pysayta(); now = D.loki[0].t; await P.kaynnista();
    let prevT = null;
    for (const r of D.loki) {
      if (prevT != null && r.t - prevT > 600000) { P.pysayta(); now = r.t; await P.kaynnista(); }
      prevT = r.t; now = r.t;
      P.testi.SN.viimeData = now;
      if (r.l === "a") { P.testi.psi(r.psi); P.testi.kompassi(r.c); P.testi.askel(r.L); }
      else if (r.l === "k") {
        let eh = P.ehdotukset(3).map((x) => x.tila.id);
        if (process.env.MEAN && P.testi.PF.active && P.testi.malli) {
          const R = P.testi.malli.rooms, q = P.testi.PF.pisteet(10), px = q.mx, py = q.my;
          const dseg = (v) => { let m = 1e9; for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length], dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(a.x + t * dx - px, a.y + t * dy - py)); } return m; };
          const inP = (v) => { let ins = false; for (let i = 0, j = v.length - 1; i < v.length; j = i++) { const a = v[i], b = v[j]; if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) ins = !ins; } return ins; };
          eh = R.map((r) => [inP(r.v) ? 0 : dseg(r.v), r.id]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
        }
        if (process.env.SOFT && P.testi.PF.active && P.testi.malli) {
          const R = P.testi.malli.rooms, pts = P.testi.PF.pisteet(400).pts, sg = +process.env.SOFT;
          const dseg = (px, py, v) => { let m = 1e9; for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length], dx = b.x - a.x, dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(a.x + t * dx - px, a.y + t * dy - py)); } return m; };
          const inP = (v, x, y) => { let ins = false; for (let i = 0, j = v.length - 1; i < v.length; j = i++) { const a = v[i], b = v[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ins = !ins; } return ins; };
          const sc = R.map((r) => pts.reduce((acc, p) => { const d = inP(r.v, p[0], p[1]) ? 0 : dseg(p[0], p[1], r.v); return acc + Math.exp(-d * d / (2 * sg * sg)); }, 0));
          eh = sc.map((s, i) => [s, R[i].id]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
        }
        if (process.env.V && kr === 0) { const nk = P.nakyma(50); if (nk) { const sx = E.leveysM, sy = sx * E.h / E.w; const pts = nk.pts.map((p) => [p[0] * sx, p[1] * sy]);
          const mx = nk.est.x * sx, my = nk.est.y * sy, sd = Math.sqrt(pts.reduce((a, p) => a + (p[0] - mx) ** 2 + (p[1] - my) ** 2, 0) / pts.length);
          console.log("  est", mx.toFixed(1), my.toFixed(1), "hajonta", sd.toFixed(1), "K", P.testi.PF.est.K.toFixed(2), "thConf", P.testi.PF.est.thConf.toFixed(2)); } }
        if (eh.length) { n++; if (eh[0] === r.tila) t1++; if (eh.includes(r.tila)) t3++; if (process.env.V && kr === 0) console.log(tun(r.tila), "<-", eh.map(tun).join(", ")); }
        P.kiinnita(r.tila);
      }
    }
    if (process.env.V && kr === 0) console.log("opittu", JSON.stringify(E.pohjoinenOpittu));
  }
  console.log("pohjoinen", N0 ?? "ei", "· 1.:", Math.round(t1 / n * 100) + " %", "· 3 joukossa:", Math.round(t3 / n * 100) + " %", "(n=" + n + ")");
})();
