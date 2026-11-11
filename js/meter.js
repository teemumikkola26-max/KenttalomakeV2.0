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

  /* ---------- Näytön automaattinen rajaus ----------
     Mittarin tumma kehys ja värillinen runko sotkevat tunnistuksen kynnysarvon.
     Etsitään rajauksen sisältä kirkas ja harmaa (vähän värikylläinen) alue,
     joka on nestekidenäyttö, ja luetaan vain se. */
  function lcdCrop(src) {
    const W = 220, H = Math.max(8, Math.round(src.height * W / src.width));
    const t = document.createElement("canvas"); t.width = W; t.height = H;
    const g = t.getContext("2d"); g.drawImage(src, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const bright = new Float32Array(W * H), sat = new Float32Array(W * H);
    const vals = [];
    for (let i = 0, k = 0; i < d.length; i += 4, k++) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      bright[k] = mx; sat[k] = mx ? (mx - mn) / mx : 0; vals.push(mx);
    }
    vals.sort((a, b) => a - b);
    const lim = Math.max(110, vals[Math.floor(vals.length * 0.45)]);
    const mask = new Uint8Array(W * H);
    for (let k = 0; k < mask.length; k++) mask[k] = bright[k] >= lim && sat[k] < 0.3 ? 1 : 0;
    const run = (frac, n, thr) => {
      let best = [0, -1], s = -1;
      for (let i = 0; i <= n; i++) {
        if (i < n && frac[i] >= thr) { if (s < 0) s = i; }
        else if (s >= 0) { if (i - 1 - s > best[1] - best[0]) best = [s, i - 1]; s = -1; }
      }
      return best;
    };
    const rows = new Float32Array(H);
    for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += mask[y * W + x]; rows[y] = c / W; }
    const [y0, y1] = run(rows, H, 0.35);
    if (y1 - y0 < H * 0.2) return null;
    const cols = new Float32Array(W);
    for (let x = 0; x < W; x++) { let c = 0; for (let y = y0; y <= y1; y++) c += mask[y * W + x]; cols[x] = c / (y1 - y0 + 1); }
    const [x0, x1] = run(cols, W, 0.35);
    if (x1 - x0 < W * 0.2) return null;
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
    const lcd = lcdCrop(canvas);
    let r = null;
    if (lcd) {
      r = await core().recognize(lcd);
      if (r.values.RH != null && r.values.T != null) { r.how = "näyttö rajattu automaattisesti"; return r; }
    }
    const r2 = await core().recognize(canvas);
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

  /* ---------- Kameranäkymä ---------- */
  function open(opts) {
    // opts: { h, f, ryhma (nykyinen ryhmäarvo), ryhmat (lista), onRow, onClose, onRyhma }
    const C = core();
    if (!C) { toast("Kameraluku ei ole käytettävissä"); return; }
    window.LukulaiteOcr.preload();
    const { h, f } = opts;
    const gcol = M.ryhmaSarake(f);
    let ryhma = opts.ryhma || "";
    let ryhmat = (opts.ryhmat || []).slice();
    let count = 0, rejects = 0;

    const el = document.createElement("div");
    el.className = "cam meter";
    el.innerHTML =
      '<div class="cam-top"><button class="cam-round" data-c="close" aria-label="Sulje">' + icon("close") + "</button>" +
      '<div style="flex:1;min-width:0"><div style="font-weight:700">' + esc(f.l) + ': lue mittarista</div><div style="font-size:12.5px;color:#c9cfd8">Rajaa mittarin näyttö kehykseen</div></div>' +
      '<span class="vf-count" data-n style="position:static"></span></div>' +
      (gcol ? '<div class="cam-methods" style="margin-top:0"><span class="cam-lbl" data-glbl></span><div class="chips scroll" data-groups></div></div>' : "") +
      '<div class="viewfinder" data-stage style="margin-top:10px"><video autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="meter-frame" data-frame></div>' +
      '<div class="vf-msg hidden" data-msg></div></div>' +
      '<div class="cam-bottom">' +
      '<button class="cam-side" data-c="gallery"><span class="c">' + icon("image") + "</span>Galleria</button>" +
      '<button class="shutter" data-c="shot" aria-label="Kuvaa näyttö"><span></span></button>' +
      '<button class="cam-side" data-c="done"><span class="c">' + icon("ok") + "</span>Valmis</button></div>";
    document.body.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const video = $("video");

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

    function frameRegion(srcW, srcH) {
      const st = $("[data-stage]").getBoundingClientRect(), fr = $("[data-frame]").getBoundingClientRect();
      const s = Math.max(st.width / srcW, st.height / srcH);
      const ox = (st.width - srcW * s) / 2, oy = (st.height - srcH * s) / 2;
      return { x: (fr.left - st.left - ox) / s, y: (fr.top - st.top - oy) / s, w: fr.width / s, h: fr.height / s };
    }

    async function addFromCanvas(full, crop) {
      const sharp = C.sharpness(crop);
      if (sharp < C.SHARP_MIN && rejects < 2) {
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
      if (!Array.isArray(h.kentat[f.k])) h.kentat[f.k] = [];
      h.kentat[f.k].push(row);
      h.vahvistettu = false;
      await Model.saveHavainto(h);
      count++; paintCount();
      if (opts.onRow) opts.onRow(row);
      enqueue({ h, f, row, canvas: crop });
    }

    async function shot() {
      if (gcol && !ryhma) { toast("Valitse ensin " + gcol.l.toLowerCase()); return; }
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw) { toast("Kamera ei ole valmis"); return; }
      const fl = $(".flash"); fl.classList.add("on"); setTimeout(() => fl.classList.remove("on"), 60);
      const full = document.createElement("canvas");
      full.width = vw; full.height = vh;
      full.getContext("2d").drawImage(video, 0, 0);
      const crop = C.cropCanvas(full, vw, vh, frameRegion(vw, vh));
      await addFromCanvas(full, crop);
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
          // Galleriakuvasta käytetään koko kuva; näyttö etsitään automaattisesti tunnistuksessa.
          const crop = C.cropCanvas(full, full.width, full.height, { x: 0, y: 0, w: full.width, h: full.height });
          rejects = 2; // ei hylätä galleriakuvaa epätarkkuuden vuoksi
          await addFromCanvas(full, crop);
        } catch (e) { toast("Kuvaa ei voitu avata"); }
      }
    }

    function close() {
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
    Camera.start(video).catch(() => {
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

  window.Meter = { open, review, rowState, rowIssues, removeRow, setDate, today, _lcdCrop: lcdCrop, _recognizeBest: recognizeBest };
})();
