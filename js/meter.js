/* =========================================================================
   meter.js – Mittalaitteen näytön luku kameralla taulukkoriveiksi
   Tunnistusydin: lukulaite-ocr.js (sama kuin PBM Kenttälomakkeissa).

   Kulku kentällä:
     1. Valitse syvyys (tai muu ryhmä) kameranäkymän yläosasta.
     2. Rajaa mittarin näyttö kehykseen ja paina laukaisinta.
        Jokaisesta kuvasta syntyy rivi heti; tunnistus tehdään taustalla.
     3. Vaihda syvyyttä ja jatka kuvaamista. Lopuksi Valmis.
   Epävarmat arvot merkitään oranssilla ja tarkistetaan rivin kuvasta.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, confirmSheet } = UI;
  const { S, Model } = App;

  const core = () => window.LukulaiteOcr && window.LukulaiteOcr.core;

  /* ---------- Näytön tunnistusmaskit ----------
     Näytön sävy vaihtelee valaistuksen ja kameran valkotasapainon mukaan (harmaa, sinertävä,
     kellertävä). Siksi kiinteän värisäännön sijaan käytetään ensisijaisesti kuvan keskeltä
     mitattua sävyä: kameraa osoitetaan näyttöön, joten keskellä on näytön tausta.
     Varalla: kirkas ja vähän värikylläinen alue. Palauttaa listan maskeja kokeiltavaksi. */
  function displayMasks(d, W, H) {
    const N = W * H, mx = new Uint8Array(N), cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), sat = new Float32Array(N);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) {
      const a = Math.max(d[i], d[i + 1], d[i + 2]) || 1, b = Math.min(d[i], d[i + 1], d[i + 2]);
      mx[k] = a; cr[k] = d[i] / a; cg[k] = d[i + 1] / a; cb[k] = d[i + 2] / a; sat[k] = (a - b) / a;
    }
    const med = (arr) => { const s = arr.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const masks = [];
    // a) keskeltä mitattu sävy
    const box = [];
    for (let y = Math.floor(H * 0.35); y < Math.ceil(H * 0.65); y++) for (let x = Math.floor(W * 0.35); x < Math.ceil(W * 0.65); x++) box.push(y * W + x);
    const bm = box.map((k) => mx[k]).sort((x, y) => x - y);
    const p60 = bm[Math.floor(bm.length * 0.6)];
    const ref = box.filter((k) => mx[k] >= p60);
    if (ref.length) {
      const rM = med(ref.map((k) => mx[k])), rr = med(ref.map((k) => cr[k])), rg = med(ref.map((k) => cg[k])), rb = med(ref.map((k) => cb[k]));
      const rs = 1 - Math.min(rr, rg, rb);
      if (rM >= 90 && rs < 0.75) {  // keskellä kirkas pinta; muoto ratkaisee, onko se näyttö
        const m = new Uint8Array(N);
        for (let k = 0; k < N; k++) m[k] = mx[k] >= rM * 0.62 && Math.abs(cr[k] - rr) < 0.14 && Math.abs(cg[k] - rg) < 0.14 && Math.abs(cb[k] - rb) < 0.14 ? 1 : 0;
        masks.push({ m, center: true });
      }
    }
    // b) kirkas ja vähän värikylläinen (varalla)
    const hist = new Uint32Array(256);
    for (let k = 0; k < N; k++) hist[mx[k]]++;
    const pct = (q) => { let acc = 0, v = 0; for (; v < 255; v++) { acc += hist[v]; if (acc >= N * q) break; } return v; };
    const lim = Math.max(100, (pct(0.08) + pct(0.92)) / 2);
    const m2 = new Uint8Array(N);
    for (let k = 0; k < N; k++) m2[k] = mx[k] >= lim && sat[k] < 0.3 ? 1 : 0;
    masks.push({ m: m2, center: false });
    return masks;
  }

  /* ---------- Näytön automaattinen rajaus ----------
     Mittarin tumma kehys ja värillinen runko sotkevat tunnistuksen kynnysarvon.
     Etsitään rajauksen sisältä näytön sävyinen alue (ks. displayMasks) ja luetaan vain se. */
  function lcdCrop(src) {
    const W = 220, H = Math.max(8, Math.round(src.height * W / src.width));
    const t = document.createElement("canvas"); t.width = W; t.height = H;
    const g = t.getContext("2d"); g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const run = (frac, n, thr) => {
      let best = [0, -1], s = -1;
      for (let i = 0; i <= n; i++) {
        if (i < n && frac[i] >= thr) { if (s < 0) s = i; }
        else if (s >= 0) { if (i - 1 - s > best[1] - best[0]) best = [s, i - 1]; s = -1; }
      }
      return best;
    };
    let x0 = 0, x1 = -1, y0 = 0, y1 = -1, found = false;
    for (const { m: mask } of displayMasks(d, W, H)) {
      const rows = new Float32Array(H);
      for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += mask[y * W + x]; rows[y] = c / W; }
      [y0, y1] = run(rows, H, 0.35);
      if (y1 - y0 < H * 0.2) continue;
      const cols = new Float32Array(W);
      for (let x = 0; x < W; x++) { let c = 0; for (let y = y0; y <= y1; y++) c += mask[y * W + x]; cols[x] = c / (y1 - y0 + 1); }
      [x0, x1] = run(cols, W, 0.35);
      if (x1 - x0 < W * 0.2) continue;
      found = true; break;
    }
    if (!found) return null;
    const sx = src.width / W, sy = src.height / H;
    const ix = (x1 - x0) * 0.01, iy = (y1 - y0) * 0.01;
    const rx = (x0 + ix) * sx, ry = (y0 + iy) * sy, rw = (x1 - x0 - 2 * ix) * sx, rh = (y1 - y0 - 2 * iy) * sy;
    if (rw * rh > src.width * src.height * 0.92) return null; // koko kuva on jo näyttöä
    const c = document.createElement("canvas"), sc = 1000 / rw;
    c.width = 1000; c.height = Math.max(1, Math.round(rh * sc));
    c.getContext("2d").drawImage(src, rx, ry, rw, rh, 0, 0, c.width, c.height);
    return c;
  }

  async function recognizeBest(canvas) {
    const lcd = canvas._lcd ? null : lcdCrop(canvas);
    let r = null;
    if (lcd) {
      r = await core().recognizeQuick(lcd, 6);
      if (r.values.RH != null && r.values.T != null) { r.how = "näyttö rajattu automaattisesti"; return r; }
    }
    const r2 = await core().recognizeQuick(canvas, 6);
    if (!r || (r2.values.RH != null && r2.values.T != null)) { r2.how = "koko rajaus"; return r2; }
    r.how = "näyttö rajattu automaattisesti";
    return r;
  }

  /* ---------- Tunnistusjono (jatkuu, vaikka näkymä vaihtuu) ---------- */
  const queue = [];
  let busy = false;

  function enqueue(job) { queue.push(job); pump(); }

  async function pump() {
    if (busy || !queue.length) return;
    busy = true;
    const job = queue.shift();
    const { h, f, row } = job;
    try {
      const r = await recognizeBest(job.canvas);
      applyResult(f, row, r);
    } catch (e) {
      row._ocr.state = "error";
      row._ocr.error = e && e.message ? e.message : String(e);
    }
    try {
      if (Model.havainto(h.id)) await Model.saveHavainto(h);
    } catch (e) { console.warn(e); }
    window.dispatchEvent(new CustomEvent("ks-ocr", { detail: { havaintoId: h.id, rowId: row.id } }));
    busy = false;
    pump();
  }

  function applyResult(f, row, r) {
    const map = f.ocr || {}, V = r.values, o = row._ocr, DEC = core().DEC;
    o.alt = r.alternative || null;
    o.read = { T: V.T, RH: V.RH, a: V.a };
    o.flags = {
      T: r.status.T !== "ok" || !!o.alt || V.T == null,
      RH: r.status.RH !== "ok" || !r.consistent || !!o.alt || V.RH == null,
      a: !!map.a && (r.status.a !== "ok" || V.a == null)
    };
    o.raw = (r.how ? "Tapa: " + r.how + "\n" : "") + (r.raw || "");
    o.state = "done";
    o.reviewed = false;
    o.edited = o.edited || {};
    ["RH", "T", "a"].forEach((k) => {
      const col = map[k];
      if (!col) return;
      if (o.edited[col]) { o.flags[k] = false; return; }   // käyttäjä kirjoitti arvon itse
      row[col] = V[k] == null ? "" : V[k].toFixed(DEC[k]).replace(".", ",");
    });
  }

 /* Lukupäivä: kameraluvussa kuvauspäivä, käsin lisätyssä rivissä kuluva päivä (muokattavissa). */
  function today() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function setDate(f, row) {
    (f.sarakkeet || []).filter((c) => c.t === "date").forEach((c) => { if (!row[c.k]) row[c.k] = today(); });
  }

  /* Rivin tila: "reading" | "flagged" | "error" | "ok" | "manual" */
  function rowState(row) {
    const o = row._ocr;
    if (!o) return "manual";
    if (o.state === "reading") return queue.length || busy ? "reading" : "interrupted";
    if (o.state === "error") return "error";
    if (!o.reviewed && o.flags && (o.flags.RH || o.flags.T || o.flags.a)) return "flagged";
    return "ok";
  }

  /* Puutteet lähtötarkistukseen */
  function rowIssues(h, f) {
    const rows = M.rivit(h, f);
    const out = [];
    const n = (st) => rows.filter((r) => rowState(r) === st).length;
    if (n("reading")) out.push("kameraluku kesken (" + n("reading") + ")");
    if (n("interrupted") || n("error")) out.push("kameraluku epäonnistui (" + (n("interrupted") + n("error")) + " riviä)");
    if (n("flagged")) out.push("epävarmat lukemat tarkistamatta (" + n("flagged") + ")");
    return out;
  }

  /* ---------- Näytön paikannus kamerakuvasta ----------
     Pienennetystä kuvasta etsitään näytön sävyinen (ks. displayMasks), suorakulmainen
     yhtenäinen alue, joka ei jatku kuvan reunoille (seinä, paperi).
     Kevyt: ~200 px leveä kuva, ajetaan useita kertoja sekunnissa. */
  function findDisplay(src) {
    const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    if (!sw || !sh) return null;
    const W = 200, H = Math.max(8, Math.round(sh * W / sw));
    const t = findDisplay._c || (findDisplay._c = document.createElement("canvas"));
    t.width = W; t.height = H;
    const g = t.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const N = W * H;
    const lab = new Int32Array(N), stack = new Int32Array(N);
    let best = null;
    for (const { m: mask, center } of displayMasks(d, W, H)) {
      lab.fill(0);
      let id = 0;
      for (let s0 = 0; s0 < N; s0++) {
        if (!mask[s0] || lab[s0]) continue;
        id++;
        let sp = 0, area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
        stack[sp++] = s0; lab[s0] = id;
        while (sp) {
          const k = stack[--sp], x = k % W, y = (k / W) | 0;
          area++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x > 0 && mask[k - 1] && !lab[k - 1]) { lab[k - 1] = id; stack[sp++] = k - 1; }
          if (x < W - 1 && mask[k + 1] && !lab[k + 1]) { lab[k + 1] = id; stack[sp++] = k + 1; }
          if (y > 0 && mask[k - W] && !lab[k - W]) { lab[k - W] = id; stack[sp++] = k - W; }
          if (y < H - 1 && mask[k + W] && !lab[k + W]) { lab[k + W] = id; stack[sp++] = k + W; }
        }
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        if (area < N * 0.03) continue;
        const fill = area / (bw * bh), asp = bw / bh;
        const edges = (x0 <= 1) + (y0 <= 1) + (x1 >= W - 2) + (y1 >= H - 2);
        if (fill < 0.45 || asp < 0.45 || asp > 2.4 || edges > 1) continue;
        const cx = (x0 + x1) / 2 / W - 0.5, cy = (y0 + y1) / 2 / H - 0.5;
        const score = area * fill * (1 - Math.min(0.6, Math.hypot(cx, cy))) * (center ? 1.5 : 1);
        if (!best || score > best.score) best = { score, x0, y0, x1, y1 };
      }
    }
    if (!best) return null;
    const ix = (best.x1 - best.x0) * 0.01, iy = (best.y1 - best.y0) * 0.01;
    return { x: (best.x0 + ix) / W, y: (best.y0 + iy) / H, w: (best.x1 - best.x0 + 1 - 2 * ix) / W, h: (best.y1 - best.y0 + 1 - 2 * iy) / H };
  }

  /* Rajaus normalisoidun alueen mukaan, 1000 px leveäksi. Ytimen rajaus lisää 5 %:n marginaalin,
     joten tulos tarkennetaan vielä pelkkään nestekidenäyttöön (lcdCrop), jos se löytyy. */
  function cropNorm(full, r) {
    const c = core().cropCanvas(full, full.width, full.height, { x: r.x * full.width, y: r.y * full.height, w: r.w * full.width, h: r.h * full.height });
    const l = lcdCrop(c);
    if (l) l._lcd = true;   // jo rajattu näyttöön: ei rajata uudelleen tunnistuksessa
    return l || c;
  }

  function fmtVal(v, d) { return v == null ? "–" : Number(v).toFixed(d).replace(".", ","); }

  /* ---------- Kameranäkymä ---------- */
  function open(opts) {
    // opts: { h, f, ryhma (nykyinen ryhmäarvo), ryhmat (lista), onRow, onClose, onRyhma }
    const C = core();
    if (!C) { toast("Kameraluku ei ole käytettävissä"); return; }
    window.LukulaiteOcr.preload();
    const { h, f } = opts;
    const gcol = M.ryhmaSarake(f);
    const map = f.ocr || {};
    let ryhma = opts.ryhma || "";
    let ryhmat = (opts.ryhmat || []).slice();
    let count = 0, rejects = 0;
    let alive = true;
    let det = null, detMiss = 0, stableN = 0;   // näytön paikka (normalisoitu videon koordinaatistoon)
    let live = null, liveBusy = false, lastLive = 0;

    const el = document.createElement("div");
    el.className = "cam meter";
    el.innerHTML =
      '<div class="cam-top"><button class="cam-round" data-c="close" aria-label="Sulje">' + icon("close") + "</button>" +
      '<div style="flex:1;min-width:0"><div style="font-weight:700">' + esc(f.l) + ': lue mittarista</div><div style="font-size:12.5px;color:#c9cfd8" data-hint>Tuo mittarin näyttö kuvan keskelle</div></div>' +
      '<span class="vf-count" data-n style="position:static"></span></div>' +
      (gcol ? '<div class="cam-methods" style="margin-top:0"><span class="cam-lbl" data-glbl></span><div class="chips scroll" data-groups></div></div>' : "") +
      '<div class="viewfinder" data-stage style="margin-top:10px"><video autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="meter-frame" data-frame></div><div class="det-box hidden" data-det></div>' +
      '<div class="live hidden" data-live aria-live="polite"></div>' +
      '<div class="vf-msg hidden" data-msg></div></div>' +
      '<div class="cam-bottom">' +
      '<button class="cam-side" data-c="gallery"><span class="c">' + icon("image") + "</span>Galleria</button>" +
      '<button class="shutter" data-c="shot" aria-label="Tallenna lukema"><span></span></button>' +
      '<button class="cam-side" data-c="done"><span class="c">' + icon("ok") + "</span>Valmis</button></div>";
    document.body.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const video = $("video");
    const stage = $("[data-stage]");

    function paintGroups() {
      if (!gcol) return;
      $("[data-glbl]").textContent = gcol.l + (gcol.u ? " (" + gcol.u + ")" : "");
      $("[data-glbl]").classList.toggle("missing", !ryhma);
      $("[data-groups]").innerHTML = ryhmat.map((g) => '<button class="chip" data-g="' + esc(g) + '" aria-pressed="' + (g === ryhma) + '">' + esc(g) + (gcol.u ? " " + esc(gcol.u) : "") + "</button>").join("") +
        '<button class="chip" data-c="newg">+ Uusi</button>';
      UI.showSelected($("[data-groups]"));
    }
    function paintCount() {
      $("[data-n]").textContent = count ? count + (count === 1 ? " lukema" : " lukemaa") : "";
    }

    /* Videon ja näkymän välinen muunnos (object-fit: cover) */
    function cover() {
      const st = stage.getBoundingClientRect(), vw = video.videoWidth, vh = video.videoHeight;
      const s = Math.max(st.width / vw, st.height / vh);
      return { st, vw, vh, s, ox: (st.width - vw * s) / 2, oy: (st.height - vh * s) / 2 };
    }
    function frameRegionNorm() {
      const c = cover(), fr = $("[data-frame]").getBoundingClientRect();
      return { x: (fr.left - c.st.left - c.ox) / c.s / c.vw, y: (fr.top - c.st.top - c.oy) / c.s / c.vh, w: fr.width / c.s / c.vw, h: fr.height / c.s / c.vh };
    }
    function paintDet() {
      const box = $("[data-det]");
      stage.classList.toggle("found", !!det);
      if (!det || !video.videoWidth) { box.classList.add("hidden"); return; }
      const c = cover();
      box.classList.remove("hidden");
      box.style.left = (c.ox + det.x * c.vw * c.s) + "px";
      box.style.top = (c.oy + det.y * c.vh * c.s) + "px";
      box.style.width = (det.w * c.vw * c.s) + "px";
      box.style.height = (det.h * c.vh * c.s) + "px";
      box.classList.toggle("ok", liveOk());
    }
    function liveOk() { return !!(live && live.r.consistent && live.r.values.RH != null && live.r.values.T != null && Date.now() - live.t < 2500); }
    function paintLive(msg) {
      const p = $("[data-live]");
      if (msg) { p.classList.remove("hidden", "ok"); p.innerHTML = '<span class="lmsg">' + esc(msg) + "</span>"; }
      else if (live) {
        const V = live.r.values, ok = liveOk();
        p.classList.remove("hidden");
        p.classList.toggle("ok", ok);
        p.innerHTML =
          '<span class="lv"><b>' + fmtVal(V.T, 1) + "</b> °C</span>" +
          '<span class="lv"><b>' + fmtVal(V.RH, 1) + "</b> %RH</span>" +
          (map.a ? '<span class="lv"><b>' + fmtVal(V.a, 2) + "</b> g/m³</span>" : "") +
          '<span class="lst">' + (ok ? icon("ok") + " Luenta varma" : "Luetaan… pidä paikallaan") + "</span>";
      }
      $(".shutter").classList.toggle("ready", liveOk());
      $("[data-hint]").textContent = liveOk() ? "Tallenna lukema laukaisimesta" : det ? "Näyttö löytyi" : "Tuo mittarin näyttö kuvan keskelle";
    }

    /* Näytön paikannus noin 6 kertaa sekunnissa */
    function detectLoop() {
      if (!alive) return;
      try { detectStep(); } catch (e) { console.warn("Näytön paikannus:", e); }
      setTimeout(detectLoop, 160);
    }
    function detectStep() {
      if (!document.hidden && video.videoWidth) {
        const d = findDisplay(video);
        if (d) {
          const moved = det ? Math.abs(d.x - det.x) + Math.abs(d.y - det.y) + Math.abs(d.w - det.w) + Math.abs(d.h - det.h) : 1;
          stableN = moved < 0.04 ? stableN + 1 : 0;
          det = det && moved < 0.25 ? { x: det.x * 0.5 + d.x * 0.5, y: det.y * 0.5 + d.y * 0.5, w: det.w * 0.5 + d.w * 0.5, h: det.h * 0.5 + d.h * 0.5 } : d;
          if (moved > 0.12) live = null;   // näyttö vaihtui tai puhelin liikkui
          detMiss = 0;
        } else if (++detMiss > 4) { det = null; stableN = 0; live = null; }
        paintDet();
        if (!det) paintLive(null), $("[data-live]").classList.add("hidden");
        else if (!live) paintLive(liveBusy ? "Luetaan…" : "Pidä puhelin paikallaan");
        else paintLive();
        if (det && stableN >= 2 && !liveBusy && !busy && Date.now() - lastLive > 600) liveRead();
      }
    }

    function grabFrame() {
      const full = document.createElement("canvas");
      full.width = video.videoWidth; full.height = video.videoHeight;
      full.getContext("2d").drawImage(video, 0, 0);
      return full;
    }

    /* Kevyt tekstintunnistus, kun näyttö pysyy paikallaan */
    async function liveRead() {
      liveBusy = true; lastLive = Date.now();
      try {
        const full = grabFrame();
        const region = det;
        const crop = cropNorm(full, region);
        if (C.sharpness(crop) < C.SHARP_MIN) { paintLive("Kuva epätarkka: pidä paikallaan"); return; }
        const r = await C.recognizeQuick(crop, 2);
        if (!alive) return;
        // Pidetään edellinen varma luenta, jos uusi kierros on epävarmempi samalle näytölle.
        if (!(liveOk() && !r.consistent)) live = { r, full, crop, region, t: Date.now() };
        paintLive();
        paintDet();
      } catch (e) {
        paintLive("Tunnistus ei käynnistynyt: " + (e.message || e));
      } finally { liveBusy = false; }
    }

    async function saveRow(full, crop, result, how) {
      const sharp = C.sharpness(crop);
      if (!result && sharp < C.SHARP_MIN && rejects < 2) {
        rejects++;
        toast("Kuva on epätarkka. Pidä puhelin paikallaan ja kuvaa uudelleen.", 3000);
        return;
      }
      rejects = 0;
      const blob = await new Promise((r) => full.toBlob(r, "image/jpeg", 0.85));
      const cropBlob = await new Promise((r) => crop.toBlob(r, "image/jpeg", 0.9));
      const kuva = await DB.putFile(S.kohde.id, blob, { kind: "lukema", havaintoId: h.id });
      const rajaus = await DB.putFile(S.kohde.id, cropBlob, { kind: "rajaus", havaintoId: h.id });
      const row = { id: DB.uid("r_"), _ocr: { state: "reading", kuva, rajaus, edited: {}, sharp: Math.round(sharp) } };
      if (gcol) row[gcol.k] = ryhma;
      setDate(f, row);
      if (result) { result.how = how; applyResult(f, row, result); }
      if (!Array.isArray(h.kentat[f.k])) h.kentat[f.k] = [];
      h.kentat[f.k].push(row);
      h.vahvistettu = false;
      await Model.saveHavainto(h);
      count++; paintCount();
      if (opts.onRow) opts.onRow(row);
      if (!result) enqueue({ h, f, row, canvas: crop });
      else window.dispatchEvent(new CustomEvent("ks-ocr", { detail: { havaintoId: h.id, rowId: row.id } }));
    }

    async function shot() {
      if (gcol && !ryhma) { toast("Valitse ensin " + gcol.l.toLowerCase()); return; }
      if (!video.videoWidth) { toast("Kamera ei ole valmis"); return; }
      const fl = $(".flash"); fl.classList.add("on"); setTimeout(() => fl.classList.remove("on"), 60);
      if (liveOk()) {
        // Tallennetaan juuri luettu kuva ja sen arvot: kuva ja arvot vastaavat varmasti toisiaan.
        const L = live; live = null;
        await saveRow(L.full, L.crop, L.r, "reaaliaikainen luenta, näyttö paikannettu automaattisesti");
        toast("Lukema tallennettu: RH " + fmtVal(L.r.values.RH, 1) + " %, T " + fmtVal(L.r.values.T, 1) + " °C", 2200);
        paintLive();
        return;
      }
      const full = grabFrame();
      const crop = cropNorm(full, det || frameRegionNorm());
      await saveRow(full, crop, null);
      toast("Kuva tallennettu, arvot luetaan taustalla", 2200);
    }

    async function gallery() {
      if (gcol && !ryhma) { toast("Valitse ensin " + gcol.l.toLowerCase()); return; }
      const files = await UI.pickFile("image/*", true);
      for (const file of files) {
        try {
          const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
          const full = document.createElement("canvas");
          full.width = bmp.width; full.height = bmp.height;
          full.getContext("2d").drawImage(bmp, 0, 0);
          // Näyttö paikannetaan kuvasta; jos sitä ei löydy, käytetään koko kuvaa.
          const d = findDisplay(full);
          const crop = d ? cropNorm(full, d) : C.cropCanvas(full, full.width, full.height, { x: 0, y: 0, w: full.width, h: full.height });
          rejects = 2; // ei hylätä galleriakuvaa epätarkkuuden vuoksi
          await saveRow(full, crop, null);
        } catch (e) { toast("Kuvaa ei voitu avata"); }
      }
    }

    function close() {
      alive = false;
      Camera.stop();
      el.remove();
      if (opts.onClose) opts.onClose(ryhma, ryhmat);
    }

    el.addEventListener("click", async (e) => {
      const g = e.target.closest("[data-g]");
      if (g) { ryhma = g.dataset.g; if (opts.onRyhma) opts.onRyhma(ryhma, ryhmat); paintGroups(); return; }
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const c = b.dataset.c;
      if (c === "shot") shot();
      else if (c === "gallery") gallery();
      else if (c === "done" || c === "close") close();
      else if (c === "newg") {
        const v = await UI.promptSheet({ title: "Uusi " + gcol.l.toLowerCase(), label: gcol.l + (gcol.u ? " (" + gcol.u + ")" : ""), required: true, ok: "Lisää" });
        if (!v) return;
        const val = v.replace(/\s*(mm|cm|m)$/i, "").trim();
        if (!ryhmat.includes(val)) ryhmat.push(val);
        ryhma = val;
        if (opts.onRyhma) opts.onRyhma(ryhma, ryhmat);
        paintGroups();
      }
    });

    paintGroups(); paintCount();
    Camera.start(video).then(() => detectLoop()).catch(() => {
      const m = $("[data-msg]");
      m.classList.remove("hidden");
      m.innerHTML = "<div>Kameraa ei saatu käyttöön. Valitse kuvat galleriasta.</div>";
    });
    return { close };
  }

  /* ---------- Rivin tarkistus kuvasta ---------- */
  async function review(h, f, row, onChange) {
    const o = row._ocr || {};
    const map = f.ocr || {};
    const cols = (f.sarakkeet || []).filter((c) => c.mittaus);
    await Model.ensureUrls([o.rajaus, o.kuva].filter(Boolean));
    const st = rowState(row);
    sheet(
      "<h3>Tarkista lukema</h3>" +
      (o.rajaus ? '<img src="' + Model.url(o.rajaus) + '" alt="Mittarin näyttö" style="width:100%;border-radius:8px;margin-bottom:12px;background:#000">' : "") +
      (st === "error" || st === "interrupted" ? '<div class="alert">' + icon("alert") + "<div>Tunnistus ei onnistunut" + (o.error ? ": " + esc(o.error) : "") + ". Kirjoita arvot kuvasta tai yritä uudelleen.</div></div>" : "") +
      (st === "flagged" ? '<p>Oranssilla merkityt arvot ovat epävarmoja. Vertaa kuvaan ja korjaa tarvittaessa.</p>' : "") +
      '<div class="grid2">' + cols.map((c) => {
        const flag = o.flags && ((map.RH === c.k && o.flags.RH) || (map.T === c.k && o.flags.T) || (map.a === c.k && o.flags.a));
        return '<label class="field"><span>' + esc(c.l) + (c.u ? ' <span class="u">(' + esc(c.u) + ")</span>" : "") + "</span>" +
          '<input type="text" inputmode="decimal" data-col="' + esc(c.k) + '" value="' + esc(row[c.k] || "") + '"' + (flag ? ' class="flag"' : "") + "></label>";
      }).join("") + "</div>" +
      (o.alt ? '<button class="btn btn-sm" data-alt style="margin-bottom:12px">Vaihtoehtoinen luenta: RH ' + String(o.alt.RH).replace(".", ",") + " %, T " + String(o.alt.T).replace(".", ",") + " °C</button>" : "") +
      (o.raw ? '<details style="margin-bottom:12px;font-size:13px;color:var(--muted)"><summary>Tunnistuksen tiedot</summary><pre style="white-space:pre-wrap;font-size:12px">' +
        esc("Tarkkuus: " + (o.sharp || "–") + "\n" + o.raw) + "</pre></details>" : "") +
      '<div class="row-btns"><button class="btn btn-danger" data-del>Poista rivi</button><button class="btn btn-primary" data-ok>Arvot oikein</button></div>' +
      (st === "error" || st === "interrupted" ? '<div style="margin-top:8px"><button class="btn btn-block" data-retry>Tunnista uudelleen</button></div>' : ""),
      (el, close) => {
        const alt = el.querySelector("[data-alt]");
        if (alt) alt.addEventListener("click", () => {
          if (map.RH) el.querySelector('[data-col="' + map.RH + '"]').value = String(o.alt.RH).replace(".", ",");
          if (map.T) el.querySelector('[data-col="' + map.T + '"]').value = String(o.alt.T).replace(".", ",");
          if (map.a && o.alt.a != null) el.querySelector('[data-col="' + map.a + '"]').value = Number(o.alt.a).toFixed(2).replace(".", ",");
          alt.remove();
        });
        el.querySelector("[data-ok]").addEventListener("click", async () => {
          el.querySelectorAll("[data-col]").forEach((inp) => {
            if (String(row[inp.dataset.col] || "") !== inp.value) { o.edited = o.edited || {}; o.edited[inp.dataset.col] = true; }
            row[inp.dataset.col] = inp.value.trim();
          });
          if (row._ocr) { o.reviewed = true; o.alt = null; if (o.state !== "done") o.state = "done"; o.flags = { RH: false, T: false, a: false }; }
          await Model.saveHavainto(h);
          close(); onChange();
        });
        el.querySelector("[data-del]").addEventListener("click", async () => {
          close();
          if (!(await confirmSheet({ title: "Poistetaanko rivi?", ok: "Poista rivi", danger: true }))) return;
          await removeRow(h, f, row);
          onChange();
        });
        const retry = el.querySelector("[data-retry]");
        if (retry) retry.addEventListener("click", async () => {
          const file = await DB.get("tiedostot", o.rajaus);
          if (!file) { toast("Rajauskuvaa ei löytynyt"); return; }
          const bmp = await createImageBitmap(file.blob);
          const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
          c.getContext("2d").drawImage(bmp, 0, 0);
          o.state = "reading"; o.error = null;
          await Model.saveHavainto(h);
          enqueue({ h, f, row, canvas: c });
          close(); onChange();
        });
      }
    );
  }

  async function removeRow(h, f, row) {
    const rows = M.rivit(h, f);
    h.kentat[f.k] = rows.filter((r) => r.id !== row.id);
    if (row._ocr) {
      if (row._ocr.kuva) await DB.del("tiedostot", row._ocr.kuva);
      if (row._ocr.rajaus) await DB.del("tiedostot", row._ocr.rajaus);
    }
    await Model.saveHavainto(h);
  }

  window.Meter = { open, review, rowState, rowIssues, removeRow, setDate, today, _lcdCrop: lcdCrop, _recognizeBest: recognizeBest, _findDisplay: findDisplay, _cropNorm: cropNorm };
})();
