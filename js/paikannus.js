/* =========================================================================
   paikannus.js – tilaseuranta askelpaikannuksella (taustalla)

   Periaate (Teemu 19.11.): seuranta ei ole näkyvissä kenttätyön aikana. Se toimii
   taustalla, ja kirjauksen tilavalinnassa ehdotetaan 2–3 todennäköisintä tilaa.
   Tutkijan valitsema tila kiinnittää sijainnin (ja korjaa suunnan ja askelpituuden).

   - Askeleet: pystykiihtyvyys (painovoiman suuntaan), huippu–laakso, pituus
     Weinbergin mallilla L = K·(amax − amin)^¼.
   - Suunta: käyttöjärjestelmän orientaatio (pystyakselin ympäri, matriisierotus)
     tai gyro-integrointi, gyrolla seurattu ylös-suunta, nollapisteen korjaus paikallaan.
   - Sijainti: partikkelisuodin (2000 partikkelia: x, y, suuntapoikkeama,
     askelpituuskerroin, gyron asteikkovirhe) tilojen alueilla. Seinän läpi kulkeva
     partikkeli karsiutuu, paitsi oviaukossa. Tilat ja ovet lähtötietopaketista
     (tilat[].alue, kerros.ovet, kerros.leveysM).
   - Taskutila: puhelin näyttö alaspäin tai pystyssä kävellessä → musta näyttö,
     kosketukset estetty. Näytön pitää olla päällä (Wake Lock), koska selain ei
     lue liikeantureita näytön ollessa pimeänä.
   Kohdekohtainen: kohde.paikannus = true (vain tällä laitteella).
   Osumatarkkuus (oikea tila 1. / 2–3 ehdotus) kirjataan laitteelle pilotin arviointia varten.
   ========================================================================= */
(function () {
  "use strict";
  const { S, Model } = App;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };

  /* ---------- Kerroksen malli metreinä ---------- */
  let malli = null;   // { kerrosId, rooms: [{ id, v, minx… }], doors: [{x,y}], edges, ovettomat:Set }
  function kaytettava(kerros) {
    if (!kerros || !(kerros.leveysM > 0) || !kerros.w || !kerros.h) return false;
    return S.kohde.tilat.filter((t) => t.kerrosId === kerros.id && Array.isArray(t.alue) && t.alue.length > 2).length >= 2;
  }
  function rakennaMalli(kerros) {
    const sx = kerros.leveysM, sy = kerros.leveysM * kerros.h / kerros.w;
    const rooms = S.kohde.tilat.filter((t) => t.kerrosId === kerros.id && Array.isArray(t.alue) && t.alue.length > 2).map((t) => {
      const v = t.alue.map((p) => ({ x: p.x * sx, y: p.y * sy }));
      return { id: t.id, v, minx: Math.min(...v.map((p) => p.x)), maxx: Math.max(...v.map((p) => p.x)), miny: Math.min(...v.map((p) => p.y)), maxy: Math.max(...v.map((p) => p.y)) };
    });
    const doors = (kerros.ovet || []).map((o) => ({ x: o.x * sx, y: o.y * sy, a: o.a, b: o.b }));
    // Tila ilman yhtään ovea: sen seinät ovat "pehmeitä" (ovi puuttuu todennäköisesti tunnistuksesta)
    const ovelliset = new Set(); doors.forEach((d) => { ovelliset.add(d.a); ovelliset.add(d.b); });
    const edges = [], seen = new Set();
    rooms.forEach((r) => r.v.forEach((a, i) => {
      const b = r.v[(i + 1) % r.v.length];
      const k1 = [a.x, a.y, b.x, b.y].map((n) => Math.round(n * 20)).join(), k2 = [b.x, b.y, a.x, a.y].map((n) => Math.round(n * 20)).join();
      if (seen.has(k1) || seen.has(k2)) return; seen.add(k1);
      edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, minx: Math.min(a.x, b.x), maxx: Math.max(a.x, b.x), miny: Math.min(a.y, b.y), maxy: Math.max(a.y, b.y), pehmea: !ovelliset.has(r.id) });
    }));
    malli = { kerrosId: kerros.id, rooms, doors, edges };
  }
  function inPoly(v, x, y) { let ins = false; for (let i = 0, j = v.length - 1; i < v.length; j = i++) { const a = v[i], b = v[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ins = !ins; } return ins; }
  function roomAt(x, y) {
    const R = malli.rooms;
    for (let i = 0; i < R.length; i++) { const r = R[i]; if (x >= r.minx && x <= r.maxx && y >= r.miny && y <= r.maxy && inPoly(r.v, x, y)) return i; }
    return -1;
  }
  // Seinän ylitys (muualla kuin oviaukossa): 0 = ei, 1 = kova seinä, 2 = pehmeä (ovi puuttunee)
  function crossesWall(x0, y0, x1, y1) {
    const dr2 = 0.75 * 0.75, snap = 0.35;
    const mnx = Math.min(x0, x1), mxx = Math.max(x0, x1), mny = Math.min(y0, y1), mxy = Math.max(y0, y1);
    let tulos = 0;
    for (const e of malli.edges) {
      if (e.maxx < mnx - snap || e.minx > mxx + snap || e.maxy < mny - snap || e.miny > mxy + snap) continue;
      const rx = x1 - x0, ry = y1 - y0, sx = e.bx - e.ax, sy = e.by - e.ay, den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) continue;
      const qx = e.ax - x0, qy = e.ay - y0, t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const cx = x0 + t * rx, cy = y0 + t * ry;
      if (malli.doors.some((d) => (d.x - cx) * (d.x - cx) + (d.y - cy) * (d.y - cy) < dr2)) continue;
      if (!e.pehmea) return 1;
      tulos = 2;
    }
    return tulos;
  }

  /* ---------- Partikkelisuodin (metreinä) ---------- */
  const PF = (() => {
    const N = 2000;
    const x = new Float32Array(N), y = new Float32Array(N), th = new Float32Array(N), sc = new Float32Array(N), w = new Float64Array(N), rm = new Int16Array(N), gs = new Float32Array(N);
    const nx = new Float32Array(N), ny = new Float32Array(N), nth = new Float32Array(N), nsc = new Float32Array(N), ngs = new Float32Array(N);
    let active = false, est = null, probs = [];
    function sampleIn(ri) {
      const r = malli.rooms[ri];
      for (let k = 0; k < 200; k++) { const px = r.minx + Math.random() * (r.maxx - r.minx), py = r.miny + Math.random() * (r.maxy - r.miny); if (inPoly(r.v, px, py)) return [px, py]; }
      return [(r.minx + r.maxx) / 2, (r.miny + r.maxy) / 2];
    }
    function init(ri, thMean, thSd) {
      for (let i = 0; i < N; i++) {
        const p = sampleIn(ri); x[i] = p[0]; y[i] = p[1];
        th[i] = thMean == null ? Math.random() * TAU : thMean + gauss() * thSd;
        sc[i] = 1 + gauss() * 0.08; gs[i] = 1 + gauss() * 0.03; w[i] = 1 / N; rm[i] = ri;
      }
      active = true; estimate();
    }
    function clear() { active = false; est = null; probs = []; }
    // meas: kompassista laskettu kävelysuunta pohjakuvassa (rad) tai null. Sietää magneettihäiriöt (sekamalli).
    function step(len, psi, dpsi, meas) {
      if (!active) return;
      dpsi = dpsi || 0; const adp = Math.abs(dpsi);
      const s2 = 2 * Math.pow(30 * DEG, 2);
      let sum = 0;
      for (let i = 0; i < N; i++) {
        th[i] += gauss() * 0.4 * DEG + (gs[i] - 1) * dpsi + gauss() * 0.03 * adp;
        const h = psi + th[i] + gauss() * 4 * DEG, L = len * sc[i] * (1 + gauss() * 0.06);
        const x1 = x[i] + Math.cos(h) * L, y1 = y[i] + Math.sin(h) * L, r = roomAt(x1, y1);
        let f = 1;
        if (meas != null) { let d = h - meas; d = Math.atan2(Math.sin(d), Math.cos(d)); f *= 0.25 + 0.75 * Math.exp(-d * d / s2); }
        // Tilojen ulkopuolella (seinän sisällä, nimeämätön käytävä tai porras): lievä rangaistus, ei kova.
        // Pohjakuvassa on usein tiloja ilman tunnusta; kova rangaistus kaataisi seurannan niissä.
        if (r < 0) f *= 0.15;
        else if (malli.doors.length) { const c = crossesWall(x[i], y[i], x1, y1); f *= c === 1 ? 0.01 : c === 2 ? 0.3 : 1; }
        x[i] = x1; y[i] = y1; rm[i] = r; w[i] *= f; sum += w[i];
      }
      if (sum < 1e-200) for (let i = 0; i < N; i++) { w[i] = 1 / N; th[i] += gauss() * 20 * DEG; }
      else for (let i = 0; i < N; i++) w[i] /= sum;
      resample(false); estimate();
    }
    function resample(force) {
      let s2 = 0; for (let i = 0; i < N; i++) s2 += w[i] * w[i];
      if (!force && 1 / s2 > N * 0.5) return;
      let c = w[0], j = 0; const st = 1 / N, u0 = Math.random() * st;
      for (let i = 0; i < N; i++) {
        const u = u0 + i * st; while (u > c && j < N - 1) { j++; c += w[j]; }
        nx[i] = x[j] + gauss() * 0.05; ny[i] = y[j] + gauss() * 0.05; nth[i] = th[j] + gauss() * 0.7 * DEG;
        nsc[i] = Math.min(1.4, Math.max(0.7, sc[j] + gauss() * 0.008)); ngs[i] = Math.min(1.12, Math.max(0.88, gs[j] + gauss() * 0.002));
      }
      x.set(nx); y.set(ny); th.set(nth); sc.set(nsc); gs.set(ngs);
      for (let i = 0; i < N; i++) { w[i] = 1 / N; rm[i] = roomAt(x[i], y[i]); }
    }
    function estimate() {
      probs = new Array(malli.rooms.length).fill(0);
      for (let i = 0; i < N; i++) if (rm[i] >= 0) probs[rm[i]] += w[i];
      let bi = -1, bp = 0; probs.forEach((p, i) => { if (p > bp) { bp = p; bi = i; } });
      let cs = 0, sn = 0, k = 0; for (let i = 0; i < N; i++) { cs += w[i] * Math.cos(th[i]); sn += w[i] * Math.sin(th[i]); k += w[i] * sc[i]; }
      est = { room: bi, p: bp, th: Math.atan2(sn, cs), thConf: Math.hypot(cs, sn), K: k };
    }
    function confirmRoom(ri) {
      if (!active) { init(ri, null, 0); return; }
      let sum = 0; for (let i = 0; i < N; i++) { if (rm[i] !== ri) w[i] *= 1e-4; sum += w[i]; }
      let inside = 0; for (let i = 0; i < N; i++) if (rm[i] === ri) inside += w[i] / sum;
      if (inside < 0.02) { const m = est ? est.th : null, c = est ? est.thConf : 0; init(ri, c > 0.5 ? m : null, c > 0.5 ? 35 * DEG : 0); return; }
      for (let i = 0; i < N; i++) w[i] /= sum;
      resample(true); estimate();
    }
    function spreadHeading(sd) { for (let i = 0; i < N; i++) th[i] += gauss() * sd; }
    /* Tauko (näyttö pimeänä, toinen sovellus): askeleet jäivät laskematta. Partikkelit kävelevät
       satunnaisesti seinien rajoissa sen verran kuin tauon aikana ehtisi, jotta naapuritilat tulevat mahdollisiksi. */
    function diffuse(askelia) {
      if (!active) return;
      const n = Math.min(40, Math.max(0, Math.round(askelia)));
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < n; k++) {
          const a = Math.random() * TAU, x1 = x[i] + Math.cos(a) * 0.7, y1 = y[i] + Math.sin(a) * 0.7;
          if (roomAt(x1, y1) < 0 || (malli.doors.length && crossesWall(x[i], y[i], x1, y1) === 1)) continue;
          x[i] = x1; y[i] = y1;
        }
        rm[i] = roomAt(x[i], y[i]); th[i] += gauss() * 40 * DEG;
      }
      estimate();
    }
    /* Suunta tiedetään (kompassi + pohjakuvan pohjoinen): partikkelien suuntapoikkeama sen mukaan */
    function setHeading(t, sd) { for (let i = 0; i < N; i++) th[i] = t + gauss() * sd; estimate(); }
    /* Näkymää varten: harvennettu otos partikkeleista (metreinä) ja painotettu keskipiste */
    function pisteet(m) {
      const st = Math.max(1, Math.floor(N / (m || 300))), pts = [];
      let mx = 0, my = 0; for (let i = 0; i < N; i++) { mx += w[i] * x[i]; my += w[i] * y[i]; }
      for (let i = 0; i < N; i += st) pts.push([x[i], y[i]]);
      return { pts, mx, my };
    }
    return { init, clear, step, confirmRoom, spreadHeading, diffuse, setHeading, pisteet, get active() { return active; }, get est() { return est; }, get probs() { return probs; } };
  })();

  /* ---------- Liikeanturit ---------- */
  const SN = { on: false, psi: 0, g: [0, 0, 9.81], gl: 9.81, af: 0, phase: 0, mx: -1e9, mn: 1e9, lastStep: 0, peakT: 0, K: 0.47, ampAvg: 3,
    still: 0, lastT: 0, bv: [0, 0, 0], u2: [0, 0, 1], u2ok: false, yrp: 0, psiG: 0, psiO: 0, Rp: null, osN: 0, osAt: 0, off: 0, src: null, hs: 0, hn: 0, pu: null, stillTot: 0,
    iosSign: /iPhone|iPad|iPod/.test(navigator.userAgent) ? -1 : 1, up: [0, 0, 1], askeleet: 0, viimeData: 0 };
  { const k = parseFloat(LS("ks_askelK")); if (k > 0.2 && k < 1) SN.K = k; }
  function euler2R(a, b, g) {
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    const Mx = [[cg, 0, sg], [sb * sg, cb, -sb * cg], [-cb * sg, sb, cb * cg]];
    return [[ca * Mx[0][0] - sa * Mx[1][0], ca * Mx[0][1] - sa * Mx[1][1], ca * Mx[0][2] - sa * Mx[1][2]], [sa * Mx[0][0] + ca * Mx[1][0], sa * Mx[0][1] + ca * Mx[1][1], sa * Mx[0][2] + ca * Mx[1][2]], Mx[2]];
  }
  // Suunta: käyttöjärjestelmän orientaatio, kun se on saatavilla (tarkin demossa), muuten gyro. Lähteen vaihto ei hyppää.
  function applyHeading() {
    const alive = SN.osN > 5 && Date.now() - SN.osAt < 500, src = alive ? "o" : "g", h = src === "g" ? SN.psiG : SN.psiO;
    if (src !== SN.src) { SN.off = SN.psi - h; SN.src = src; }
    SN.psi = h + SN.off;
  }
  function onOrient(e) {
    if (e.webkitCompassHeading != null && e.webkitCompassAccuracy != null && e.webkitCompassAccuracy >= 0 && e.webkitCompassAccuracy < 40) SN.comp = { c: e.webkitCompassHeading * DEG, t: Date.now() };   // iPhone
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const R = euler2R(e.alpha * DEG, e.beta * DEG, e.gamma * DEG), P = SN.Rp; SN.Rp = R;
    if (!P) return;
    const Mx = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Mx[i][j] = R[i][0] * P[j][0] + R[i][1] * P[j][1] + R[i][2] * P[j][2];
    const t = Math.acos(Math.max(-1, Math.min(1, (Mx[0][0] + Mx[1][1] + Mx[2][2] - 1) / 2))), sn = Math.sin(t), sz = 0.5 * (Mx[1][0] - Mx[0][1]);
    if (t > 0.35) return;
    SN.psiO -= sn > 1e-6 ? sz * t / sn : sz; SN.osN++; SN.osAt = Date.now();
    applyHeading();
  }
  /* Kompassi: puhelimen "eteenpäin" (yläreuna, kun puhelin on vaakatasossa; kameran suunta, kun pystyssä)
     ilmansuuntana. Kädessä se on kävelysuunta; taskussa ei käytetä. */
  function onAbs(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const R = euler2R(e.alpha * DEG, e.beta * DEG, e.gamma * DEG);
    const w1 = Math.abs(R[2][2]), w2 = Math.abs(R[2][1]);
    const fE = w1 * R[0][1] - w2 * R[0][2], fN = w1 * R[1][1] - w2 * R[1][2];
    if (Math.hypot(fE, fN) < 0.3) return;
    SN.comp = { c: Math.atan2(fE, fN), t: Date.now() };
  }
  function kompassi() {
    if (pocket || !SN.comp || Date.now() - SN.comp.t > 700) return null;
    return SN.comp.c;
  }
  /* Pohjakuvan pohjoinen (astetta myötäpäivään sivun yläreunasta): paketista tai opittu kävelyistä */
  function pohjoinen() {
    const ker = malli && Model.kerros(malli.kerrosId);
    if (!ker) return null;
    if (typeof ker.pohjoinen === "number") return ker.pohjoinen;
    const o = ker.pohjoinenOpittu;
    return o && o.tapa === "tilavalinnat" ? o.deg : null;
  }
  // Kompassisuunta pohjakuvan kulmaksi (rad, +x = oikealle, myötäpäivään positiivinen)
  function kompassiPohjaan() { const c = kompassi(), N = pohjoinen(); return c == null || N == null ? null : (-90 + N) * DEG + c; }
  /* Pohjoisen oppiminen tilavalinnoista (pilottiloki 20.11.: kompassi oli luotettava, mutta pohjoista ei tiedetty,
     joten sitä ei käytetty). Kahden tilavalinnan välinen kävely tallennetaan kompassin mukaisena siirtymävektorina.
     Pohjoinen on kulma, jolla vektorit vievät edellisen tilan keskeltä parhaiten seuraavaan tilaan. Ei riipu siitä,
     oliko seuranta oikeassa: sovitus käyttää vain tutkijan valitsemia tiloja. */
  const segAvain = (kerrosId) => "ks_pohjseg_" + (S.kohde && S.kohde.id) + "_" + kerrosId;
  function keskipiste(v) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < v.length; i++) { const p = v[i], q = v[(i + 1) % v.length], c = p.x * q.y - q.x * p.y; a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c; }
    return Math.abs(a) < 1e-9 ? { x: v[0].x, y: v[0].y } : { x: cx / (3 * a), y: cy / (3 * a) };
  }
  function etaisyysTilaan(r, x, y) {
    if (inPoly(r.v, x, y)) return 0;
    let m = 1e9;
    for (let i = 0; i < r.v.length; i++) {
      const a = r.v[i], b = r.v[(i + 1) % r.v.length], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      m = Math.min(m, Math.hypot(a.x + t * dx - x, a.y + t * dy - y));
    }
    return m;
  }
  function sovitaPohjoinen(ker) {
    let segs = []; try { segs = JSON.parse(LS(segAvain(ker.id)) || "[]"); } catch (e) { segs = []; }
    const R = malli.rooms, idx = (id) => R.findIndex((r) => r.id === id);
    const ok = segs.map((g) => ({ g, ia: idx(g.a), ib: idx(g.b) })).filter((x) => x.ia >= 0 && x.ib >= 0);
    if (ok.length < 3) return null;
    ok.forEach((x) => { x.c = keskipiste(R[x.ia].v); });
    const tulos = [];
    for (let deg = 0; deg < 360; deg += 2) {
      const ph = deg * DEG, cs = Math.cos(ph), sn = Math.sin(ph);
      let e = 0;
      ok.forEach((x) => { const px = x.c.x + cs * x.g.vx - sn * x.g.vy, py = x.c.y + sn * x.g.vx + cs * x.g.vy; e += Math.min(8, etaisyysTilaan(R[x.ib], px, py)); });
      tulos.push({ deg, e: e / ok.length });
    }
    tulos.sort((a, b) => a.e - b.e);
    const b = tulos[0], toinen = tulos.find((t) => { const d = Math.abs(t.deg - b.deg); return Math.min(d, 360 - d) > 40; });
    if (b.e > 2 || !toinen || toinen.e - b.e < 1.5) return null;
    return { deg: ((b.deg + 90) % 360 + 360) % 360, n: ok.length, virhe: +b.e.toFixed(2), tapa: "tilavalinnat" };
  }
  function tallennaSegmentti(tilaId) {
    const g = SN.seg; SN.seg = null;
    if (!g || g.a === tilaId || g.kerrosId !== malli.kerrosId || g.n < 5 || g.nc < g.n * 0.7 || Date.now() - g.t0 > 10 * 60000) return;
    let segs = []; try { segs = JSON.parse(LS(segAvain(g.kerrosId)) || "[]"); } catch (e) { segs = []; }
    segs.push({ a: g.a, b: tilaId, vx: +g.vx.toFixed(2), vy: +g.vy.toFixed(2) });
    LS(segAvain(g.kerrosId), JSON.stringify(segs.slice(-40)));
  }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity, r = e.rotationRate; if (!a || a.x == null) return;
    // Tauko (näyttö pimeänä tai sovellus taustalla): askeleita jäi laskematta
    const tauko = SN.viimeData ? (Date.now() - SN.viimeData) / 1000 : 0;
    if (tauko > 8 && malli && PF.active) { PF.diffuse(tauko * 0.6); kirjaa({ l: "tauko", s: Math.round(tauko) }); SN.pend = null; }
    SN.viimeData = Date.now();
    const t = performance.now() / 1000; let dt = SN.lastT ? t - SN.lastT : 0.016; SN.lastT = t; if (dt > 0.3 || dt <= 0) dt = 0.016;
    const ax = a.x * SN.iosSign, ay = a.y * SN.iosSign, az = a.z * SN.iosSign;
    if (!SN.u2ok) { SN.g[0] = ax; SN.g[1] = ay; SN.g[2] = az; }
    const al = 1 - Math.exp(-dt / 0.7); SN.g[0] += al * (ax - SN.g[0]); SN.g[1] += al * (ay - SN.g[1]); SN.g[2] += al * (az - SN.g[2]);
    const gl = Math.hypot(SN.g[0], SN.g[1], SN.g[2]) || 9.81; SN.gl = gl;
    const ux = SN.g[0] / gl, uy = SN.g[1] / gl, uz = SN.g[2] / gl; SN.up = [ux, uy, uz];
    const av = ax * ux + ay * uy + az * uz - gl, a2 = 1 - Math.exp(-dt / 0.04); SN.af += a2 * (av - SN.af);
    const w = (r && r.alpha != null) ? [(r.beta || 0) * DEG, (r.gamma || 0) * DEG, (r.alpha || 0) * DEG] : [0, 0, 0];
    const bv = SN.bv;
    if (t - SN.lastStep > 1.2 && Math.abs(SN.af) < 0.12 && Math.hypot(w[0] - bv[0], w[1] - bv[1], w[2] - bv[2]) < 2.5 * DEG) {
      SN.still += dt; if (SN.still > 0.5) { SN.stillTot = Math.min(2, SN.stillTot + dt); const k = Math.min(1, dt / Math.max(0.3, SN.stillTot)); for (let i = 0; i < 3; i++) bv[i] += (w[i] - bv[i]) * k; }
    } else SN.still = 0;
    const wc = [w[0] - bv[0], w[1] - bv[1], w[2] - bv[2]];
    const am = Math.hypot(ax, ay, az) || 1, u = SN.u2;
    if (!SN.u2ok) { u[0] = ax / am; u[1] = ay / am; u[2] = az / am; SN.u2ok = true; }
    else {
      const c0 = wc[1] * u[2] - wc[2] * u[1], c1 = wc[2] * u[0] - wc[0] * u[2], c2 = wc[0] * u[1] - wc[1] * u[0];
      u[0] -= c0 * dt; u[1] -= c1 * dt; u[2] -= c2 * dt;
      if (Math.abs(am - gl) < 1.5) { const k = dt / (SN.still > 0.3 ? 0.3 : 1.5); u[0] += k * (ax / am - u[0]); u[1] += k * (ay / am - u[1]); u[2] += k * (az / am - u[2]); }
      const ul = Math.hypot(u[0], u[1], u[2]) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
    }
    let yr = wc[0] * u[0] + wc[1] * u[1] + wc[2] * u[2];
    if (SN.still > 0.5 && Math.abs(yr) < 1.5 * DEG) yr = 0;
    SN.psiG -= 0.5 * (yr + SN.yrp) * dt; SN.yrp = yr;
    applyHeading();
    SN.hs += SN.psi; SN.hn++;
    detectStep(t);
    pocketLogic(t, dt);
  }
  function detectStep(t) {
    const v = SN.af, thrP = Math.max(0.45, SN.ampAvg * 0.22), thrV = -Math.max(0.35, SN.ampAvg * 0.18), hyst = Math.max(0.25, SN.ampAvg * 0.12);
    if (SN.phase === 0) {
      if (v > SN.mx) { SN.mx = v; SN.peakT = t; }
      if (SN.mx > thrP && v < SN.mx - hyst) { SN.phase = 1; SN.mn = v; }
      if (SN.mx < thrP && v < 0) SN.mx = -1e9;
    } else {
      if (v < SN.mn) SN.mn = v;
      if (SN.mn < thrV && v > SN.mn + hyst) {
        const amp = SN.mx - SN.mn, dtStep = SN.peakT - SN.lastStep;
        if (dtStep > 0.27 && amp < 25) { if (dtStep < 2) SN.ampAvg += (amp - SN.ampAvg) * 0.15; SN.lastStep = SN.peakT; onStep(amp); }
        SN.phase = 0; SN.mx = -1e9;
      }
      if (t - SN.peakT > 1.2) { SN.phase = 0; SN.mx = -1e9; }
    }
  }
  /* Askel hyväksytään vain kävelyjaksossa: yksittäinen "askel" (kyykistyminen, laukun nosto, puhelimen
     heilautus mittauksen aikana) hylätään. Ensimmäinen askel odottaa, kunnes toinen tulee 1,4 s sisällä. */
  function onStep(amp) {
    const t = performance.now() / 1000, L = SN.K * Math.pow(amp, 0.25);
    const now = SN.psi, avg = SN.hn ? SN.hs / SN.hn : now, pu = (avg + now) / 2; SN.hs = 0; SN.hn = 0;
    const st = { L, pu, meas: kompassiPohjaan(), c: kompassi(), t };
    const kavelee = SN.viimeAskel && t - SN.viimeAskel < 1.4;
    if (!kavelee) {
      if (SN.pend && t - SN.pend.t < 1.4) { kayta(SN.pend); SN.pend = null; kayta(st); }
      else SN.pend = st;                 // odottaa toista askelta
      return;
    }
    kayta(st);
  }
  function kayta(st) {
    SN.askeleet++; SN.viimeAskel = st.t;
    if (SN.seg) { SN.seg.n++; if (st.c != null) { SN.seg.vx += st.L * Math.cos(st.c); SN.seg.vy += st.L * Math.sin(st.c); SN.seg.nc++; } }
    const dps = SN.pu == null ? 0 : st.pu - SN.pu; SN.pu = st.pu;
    if (!(malli && PF.active)) return;
    PF.step(st.L, st.pu, dps, st.meas);
    kirjaa({ l: "a", L: +st.L.toFixed(3), psi: +st.pu.toFixed(3), c: st.c == null ? null : +st.c.toFixed(3), m: st.meas == null ? null : 1, tk: pocket ? 1 : 0,
      e: PF.est && PF.est.room >= 0 ? malli.rooms[PF.est.room].id : null, p: PF.est ? +PF.est.p.toFixed(2) : 0 });
  }

  /* ---------- Taskutila ---------- */
  let wake = null, pocket = false, pkT = 0, pkOutT = 0, overlay = null;
  async function requestWake() { try { if ("wakeLock" in navigator && document.visibilityState === "visible") wake = await navigator.wakeLock.request("screen"); } catch (e) { /* ei tukea */ } }
  function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* ohita */ } wake = null; }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && SN.on) requestWake(); });
  function setPocket(on) {
    if (on === pocket) return; pocket = on;
    if (on) {
      overlay = document.createElement("div");
      overlay.className = "taskutila";
      overlay.innerHTML = '<div>Taskutila · tilaseuranta jatkuu<br><small>Ota puhelin esiin ja pidä hetki kädessä</small></div>';
      ["pointerdown", "pointerup", "click", "touchstart", "touchend", "touchmove", "contextmenu"].forEach((ev) => overlay.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false }));
      document.body.appendChild(overlay);
    } else if (overlay) { overlay.remove(); overlay = null; }
    if (PF.active) PF.spreadHeading(on ? 25 * DEG : 15 * DEG);   // kantotapa vaihtui: suunta epävarmemmaksi, seinät korjaavat
  }
  function pocketLogic(t, dt) {
    const uz = SN.up[2], walking = t - SN.lastStep < 1.5;
    if (!pocket) { if (uz < 0.35 && walking) pkT += dt; else pkT = Math.max(0, pkT - dt * 2); if (pkT > 1.5) { setPocket(true); pkT = 0; } }
    else { if (uz > 0.55 && !walking) pkOutT += dt; else if (uz > 0.65) pkOutT += dt * 0.6; else pkOutT = 0; if (pkOutT > 0.7) { setPocket(false); pkOutT = 0; } }
  }

  /* ---------- Loki (pilotin arviointi ja säätö) ----------
     Askeleet, suunnat, kompassi, tauot ja tilavalinnat. Ei sanelua, kuvia eikä nimiä. Viedään tiedostona
     (kohteen Lisää → Tilaseuranta → Vie loki), jotta seuranta voidaan ajaa uudelleen ja säätää. */
  let loki = [], lokiKohde = null;
  const lokiAvain = () => "ks_paikannusloki_" + lokiKohde;
  function kirjaa(r) {
    r.t = Date.now(); loki.push(r);
    if (loki.length > 8000) loki = loki.slice(-6000);
    if (lokiKohde && (r.l !== "a" || loki.length % 25 === 0)) LS(lokiAvain(), JSON.stringify(loki));
  }
  function lataaLoki(k) { lokiKohde = k.id; try { loki = JSON.parse(LS(lokiAvain()) || "[]"); } catch (e) { loki = []; } }
  const lokiPituus = () => loki.length;
  function vieLoki() {
    const k = S.kohde;
    const kerrokset = k.kerrokset.filter((e) => kaytettava(e)).map((e) => ({ id: e.id, nimi: e.nimi, leveysM: e.leveysM, w: e.w, h: e.h, pohjoinen: e.pohjoinen, pohjoinenOpittu: e.pohjoinenOpittu, ovet: e.ovet,
      tilat: k.tilat.filter((t) => t.kerrosId === e.id && t.alue).map((t) => ({ id: t.id, tunnus: t.tunnus, alue: t.alue })) }));
    return { muoto: "kuva-sanelu-paikannusloki", versio: 1, sovellus: window.APP_VERSION, laite: navigator.userAgent, K: SN.K, osumat: osumat(), kerrokset, loki };
  }

  /* ---------- Julkinen rajapinta ---------- */
  function saatavilla(k) {
    k = k || S.kohde;
    return !!k && k.kerrokset.some((e) => kaytettava(e)) && typeof window.DeviceMotionEvent !== "undefined";
  }
  async function kaynnista() {
    if (SN.on) return true;
    try {
      const rq = [window.DeviceMotionEvent, window.DeviceOrientationEvent].filter((C) => C && typeof C.requestPermission === "function").map((C) => C.requestPermission());
      // iPhone vaatii luvan (napautuksesta). Muilla alustoilla vastaus ei estä kuuntelua: data joko tulee tai ei.
      const res = await Promise.all(rq.map((p) => p.catch(() => "denied")));
      if (SN.iosSign < 0 && res.some((p) => p !== "granted")) throw new Error("Liikeanturien lupa evättiin");
    } catch (e) { tila.virhe = e.message || String(e); return false; }
    SN.u2ok = false; SN.yrp = 0; SN.Rp = null; SN.osN = 0; SN.src = null; SN.hs = 0; SN.hn = 0; SN.still = 0; SN.pu = null; SN.lastT = 0;
    window.addEventListener("devicemotion", onMotion); window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("deviceorientationabsolute", onAbs);
    SN.on = true; tila.virhe = ""; requestWake();
    return true;
  }
  function pysayta() {
    if (!SN.on) return;
    window.removeEventListener("devicemotion", onMotion); window.removeEventListener("deviceorientation", onOrient);
    window.removeEventListener("deviceorientationabsolute", onAbs);
    SN.on = false; setPocket(false); releaseWake(); PF.clear(); malli = null;
  }
  const tila = { virhe: "" };
  /* Kohteen avaus: seuranta käyntiin, jos se on kohteessa päällä (iOS vaatii napautuksen: kaynnista() painikkeesta) */
  async function kohdeAuki(k) {
    if (!k || !k.paikannus || !saatavilla(k)) { pysayta(); return; }
    if (lokiKohde !== k.id) lataaLoki(k);
    if (malli && !k.kerrokset.some((e) => e.id === malli.kerrosId)) { PF.clear(); malli = null; }
    await kaynnista();
  }
  async function asetaPaalle(on) {
    const k = S.kohde; if (!k) return false;
    k.paikannus = !!on; await Model.saveKohde();
    if (on && lokiKohde !== k.id) lataaLoki(k);
    if (on) return kaynnista();
    pysayta(); return true;
  }

  /* Tutkija valitsi tilan: sijainti kiinnittyy siihen. Osumatarkkuus kirjataan ennen päivitystä. */
  function kiinnita(tilaId) {
    if (!SN.on || !tilaId) return;
    const t = Model.tila(tilaId); if (!t) return;
    const ker = Model.kerros(t.kerrosId);
    if (!kaytettava(ker) || !Array.isArray(t.alue)) return;
    const eh = ehdotukset(3);
    if (eh.length) {
      const i = eh.findIndex((x) => x.tila.id === tilaId);
      let o = {}; try { o = JSON.parse(LS("ks_paikannus_osumat") || "{}"); } catch (e) { o = {}; }
      o.n = (o.n || 0) + 1; if (i === 0) o.top1 = (o.top1 || 0) + 1; if (i >= 0) o.top3 = (o.top3 || 0) + 1;
      LS("ks_paikannus_osumat", JSON.stringify(o));
    }
    // Askelpituuden oppiminen: seuranta oli oikeassa tilassa varmana → partikkelien askelkerroin talteen
    const e0 = PF.est, oikein = e0 && malli && e0.room >= 0 && malli.rooms[e0.room].id === tilaId;
    if (oikein && e0.p > 0.6 && SN.askeleet - (SN.askelKiinn || 0) >= 15) { SN.K = Math.min(0.75, Math.max(0.3, SN.K * (0.7 + 0.3 * e0.K))); LS("ks_askelK", String(SN.K)); }
    SN.viimeTila = tilaId;
    kirjaa({ l: "k", tila: tilaId, eh: eh.map((x) => [x.tila.id, +x.p.toFixed(2)]), e: e0 && malli && e0.room >= 0 ? malli.rooms[e0.room].id : null });
    SN.askelKiinn = SN.askeleet;
    if (!malli || malli.kerrosId !== ker.id) { rakennaMalli(ker); PF.clear(); SN.seg = null; }
    const ri = malli.rooms.findIndex((r) => r.id === tilaId);
    if (ri < 0) return;
    // Pohjoinen tilavalinnoista (jos lähtötiedoissa ei ole)
    tallennaSegmentti(tilaId);
    const Nennen = pohjoinen();
    if (typeof ker.pohjoinen !== "number") { const o = sovitaPohjoinen(ker); if (o) ker.pohjoinenOpittu = o; }
    const uusiPohjoinen = Nennen == null && pohjoinen() != null;
    SN.seg = { a: tilaId, kerrosId: ker.id, vx: 0, vy: 0, n: 0, nc: 0, t0: Date.now() };
    const oliAktiivinen = PF.active;
    PF.confirmRoom(ri);
    // Suunta kompassista, jos pohjakuvan pohjoinen tiedetään (muuten suunta selviää seinistä kävellessä)
    const m = kompassiPohjaan();
    if (m != null && (!oliAktiivinen || uusiPohjoinen || PF.est.thConf < 0.5)) PF.setHeading(m - SN.psi, 30 * DEG);
    if (ker.pohjoinenOpittu && uusiPohjoinen) Model.saveKohde();
  }
  /* 2–3 todennäköisintä tilaa: [{ tila, p }] */
  /* Ehdotukset: seurannan todennäköisimmät tilat. Jos seuranta on epävarma, loput paikat täytetään
     viimeksi valitulla tilalla ja sen naapuritiloilla (ovien kautta): tutkija liikkuu yleensä viereiseen tilaan. */
  /* Tilojen todennäköisyydet "pehmeästi": partikkeli lasketaan myös viereisille tiloille, jos se on alle ~1 m
     päässä niistä (pohjan tila-alueiden väliin jää seinien levyisiä rakoja, ja tutkija seisoo usein oviaukossa).
     Pilottilokin uudelleenajossa 3 joukossa -osuma parani noin 53 % → 61 %. */
  function pehmeat() {
    const R = malli.rooms, q = PF.pisteet(300).pts, out = new Array(R.length).fill(0), s2 = 2 * 0.6 * 0.6;
    q.forEach((p) => {
      let sum = 0; const w = R.map((r) => { if (p[0] < r.minx - 2 || p[0] > r.maxx + 2 || p[1] < r.miny - 2 || p[1] > r.maxy + 2) return 0; const d = etaisyysTilaan(r, p[0], p[1]); const v = Math.exp(-d * d / s2); sum += v; return v; });
      if (sum > 0.01) w.forEach((v, i) => { out[i] += v / sum; });
    });
    const tot = q.length || 1;
    return out.map((v) => v / tot);
  }
  function ehdotukset(n) {
    n = n || 3;
    if (!SN.on || !malli || !PF.active || !PF.est) return [];
    const out = pehmeat().map((p, i) => ({ tila: Model.tila(malli.rooms[i].id), p })).filter((x) => x.tila && x.p >= 0.03).sort((a, b) => b.p - a.p).slice(0, n);
    const lisaa = (id, p) => { const t = Model.tila(id); if (t && out.length < n && !out.some((x) => x.tila.id === id)) out.push({ tila: t, p, naapuri: true }); };
    if (!out.length || out[0].p < 0.6) {
      const kesk = out[0] ? out[0].tila.id : null, viim = SN.viimeTila;
      [viim, kesk].filter(Boolean).forEach((id) => {
        if (id === viim) lisaa(id, 0);
        malli.doors.filter((d) => d.a === id || d.b === id).forEach((d) => lisaa(d.a === id ? d.b : d.a, 0));
      });
    }
    return out;
  }
  function osumat() { try { return JSON.parse(LS("ks_paikannus_osumat") || "{}"); } catch (e) { return {}; } }
  function tilanne() {
    const e = PF.est, t = e && malli && e.room >= 0 ? Model.tila(malli.rooms[e.room].id) : null;
    return { on: SN.on, data: Date.now() - SN.viimeData < 3000, askeleet: SN.askeleet, alussa: !PF.active, arvio: t, p: e ? e.p : 0, tasku: pocket, virhe: tila.virhe };
  }
  /* Reaaliaikainen näkymä sijainnin valintaan: partikkelit ja arvio pohjakuvan suhteellisina koordinaatteina (0–1) */
  function nakyma(m) {
    if (!SN.on || !malli || !PF.active) return null;
    const ker = Model.kerros(malli.kerrosId); if (!ker || !ker.w) return null;
    const sx = ker.leveysM, sy = ker.leveysM * ker.h / ker.w, r = PF.pisteet(m), e = PF.est;
    return { kerrosId: malli.kerrosId, pts: r.pts.map((p) => [p[0] / sx, p[1] / sy]), est: { x: r.mx / sx, y: r.my / sy },
      tila: e && e.room >= 0 ? Model.tila(malli.rooms[e.room].id) : null, p: e ? e.p : 0, askeleet: SN.askeleet, data: Date.now() - SN.viimeData < 3000 };
  }
  /* Vianetsintä kohteen Lisää-osiossa: tuleeko anturidataa, rekisteröityykö askelia, onko pohjassa ovia ja pohjoinen */
  function diagnostiikka() {
    const k = S.kohde, ker = (malli && Model.kerros(malli.kerrosId)) || (k && k.kerrokset.find((e) => kaytettava(e)));
    const alueet = ker ? k.tilat.filter((t) => t.kerrosId === ker.id && Array.isArray(t.alue) && t.alue.length > 2).length : 0;
    const N = (() => { if (!ker) return null; if (typeof ker.pohjoinen === "number") return "lähtötiedoista"; const o = ker.pohjoinenOpittu; return o && o.tapa === "tilavalinnat" ? "opittu" : null; })();
    return { data: SN.viimeData ? Date.now() - SN.viimeData < 3000 : false, askeleet: SN.askeleet, suunta: SN.src === "o" ? "orientaatio" : SN.src === "g" ? "gyro" : null,
      kompassi: !!(SN.comp && Date.now() - SN.comp.t < 3000), alueet, ovet: ker ? (ker.ovet || []).length : 0, pohjoinen: N, rivit: loki.length };
  }
  /* Testaus pöytäkoneella: askel nykyiseen suuntaan / käännös */
  const testi = { askel(m) { onStep(Math.pow((m || 0.7) / SN.K, 4)); }, psi(v) { SN.psi = v; }, kompassi(c) { SN.comp = c == null ? null : { c, t: Date.now() }; },
    tauko(s) { if (malli && PF.active) PF.diffuse(s * 0.6); }, get SN() { return SN; }, get PF() { return PF; }, kaanna(deg) { SN.psi += deg * DEG; SN.off += deg * DEG; }, tasku: setPocket, get malli() { return malli; } };

  window.Paikannus = { nakyma, diagnostiikka, vieLoki, lokiPituus, saatavilla, kaynnista, pysayta, kohdeAuki, asetaPaalle, kiinnita, ehdotukset, osumat, tilanne, testi };
})();
