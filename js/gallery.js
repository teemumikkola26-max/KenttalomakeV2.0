/* =========================================================================
   gallery.js – puhelimen omalla kameralla otettujen kuvien liittäminen

   Jokaiselle kuvalle ehdotetaan havaintoa kuvan ottoajan perusteella:
   havainnon "aikaikkuna" on sen kirjaamisesta viimeisen sovelluksella
   otetun kuvan aikaan (+ pieni marginaali). Ottoaika luetaan kuvan
   EXIF-tiedoista (DateTimeOriginal), muuten tiedoston muokkausajasta.
   Kuvat, joille ei löydy havaintoa, voi liittää uuteen havaintoon:
   peräkkäiset (alle 90 s välein) otetut kuvat samaan.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, nro } = UI;
  const { S, Model } = App;

  const MAX_DIST = 15 * 60 * 1000;   // yli 15 min päässä olevaa havaintoa ei ehdoteta
  const MARGIN_BEFORE = 2 * 60 * 1000, MARGIN_AFTER = 3 * 60 * 1000;

  /* ---------- EXIF: DateTimeOriginal ---------- */
  async function exifTime(file) {
    try {
      const buf = await file.slice(0, 256 * 1024).arrayBuffer();
      const v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return null;
      let p = 2;
      while (p + 4 < v.byteLength) {
        const marker = v.getUint16(p), len = v.getUint16(p + 2);
        if (marker === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) {   // "Exif"
          const t = p + 10, le = v.getUint16(t) === 0x4949;
          const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
          const readIfd = (off) => {
            const n = u16(off), out = {};
            for (let i = 0; i < n; i++) {
              const e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
              if (type === 2) {
                const vo = cnt > 4 ? u32(e + 8) : e + 8;
                let s = ""; for (let k = 0; k < cnt - 1; k++) s += String.fromCharCode(v.getUint8(t + vo + k));
                out[tag] = s;
              } else if (type === 4) out[tag] = u32(e + 8);
            }
            return out;
          };
          const ifd0 = readIfd(u32(4));
          const ex = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
          const s = ex[0x9003] || ex[0x9004] || ifd0[0x0132];
          const m = s && s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
          if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
          return null;
        }
        if ((marker & 0xFF00) !== 0xFF00) break;
        p += 2 + len;
      }
    } catch (e) { /* ei EXIF-tietoja */ }
    return null;
  }

  /* ---------- Havaintojen aikaikkunat ---------- */
  async function windows() {
    const files = await DB.byKohde("tiedostot", S.kohde.id);
    const created = {};
    files.forEach((f) => { created[f.id] = f.created; });
    return S.havainnot.map((h) => {
      const ts = [h.created].concat(h.kuvat.map((id) => created[id]).filter(Boolean));
      return { h, start: Math.min.apply(null, ts) - MARGIN_BEFORE, end: Math.max.apply(null, ts) + MARGIN_AFTER };
    });
  }
  function propose(t, wins) {
    let best = null;
    wins.forEach((w) => {
      const d = t >= w.start && t <= w.end ? 0 : Math.min(Math.abs(t - w.start), Math.abs(t - w.end));
      // Ikkunan sisällä: lähin kirjaushetki ratkaisee (päällekkäiset ikkunat)
      const tie = Math.abs(t - w.h.created);
      if (d <= MAX_DIST && (!best || d < best.d || (d === best.d && tie < best.tie))) best = { id: w.h.id, d, tie };
    });
    return best ? best.id : null;
  }

  const hhmm = (t) => { const d = new Date(t); return d.getHours() + "." + String(d.getMinutes()).padStart(2, "0"); };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

  async function importPhotos(onDone) {
    const files = await UI.pickFile("image/*", true);
    if (!files.length) return;
    toast("Luetaan kuvien ottoaikoja…", 2000);
    const wins = await windows();
    await Model.ensureUrls(S.havainnot.map((h) => h.kuvat[0]).filter(Boolean));
    const photos = [];
    for (const f of files) {
      const ex = await exifTime(f);
      const t = ex || f.lastModified || Date.now();
      photos.push({ f, t, exif: !!ex, url: URL.createObjectURL(f), pick: propose(t, wins) });
    }
    photos.sort((a, b) => a.t - b.t);
    const opts = S.havainnot.slice().sort((a, b) => a.created - b.created);
    const optHtml = (p) =>
      '<option value="">Ei liitetä</option><option value="__new"' + (p.pick ? "" : " selected") + ">Uusi havainto</option>" +
      opts.map((h) => '<option value="' + h.id + '"' + (h.id === p.pick ? " selected" : "") + ">" +
        esc(nro(h.nro) + " · " + hhmm(h.created) + " · " + (Model.sijaintiTeksti(h.sijainti) || M.menetelma(h.menetelma).nimi)) + "</option>").join("");

    const cleanup = () => photos.forEach((p) => URL.revokeObjectURL(p.url));
    sheet(
      "<h3>Liitä " + photos.length + (photos.length === 1 ? " kuva" : " kuvaa") + "</h3>" +
      '<p data-sum></p>' +
      '<div class="glist">' + photos.map((p, i) =>
        '<div class="grow-row"><img src="' + p.url + '" alt="">' +
        '<div class="g-body"><div class="s">' + (p.exif ? "Otettu " : "Tallennettu ") + hhmm(p.t) + (sameDay(p.t, Date.now()) ? "" : " · " + UI.pvm(p.t)) +
        (p.pick ? ' · <span class="mp-tag">ehdotus ajan perusteella</span>' : "") + "</div>" +
        '<select data-i="' + i + '">' + optHtml(p) + "</select></div></div>").join("") + "</div>" +
      '<div class="row-btns" style="margin-top:12px"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Liitä</button></div>',
      (el, close) => {
        const sum = () => {
          const v = Array.from(el.querySelectorAll("select")).map((s) => s.value);
          const toObs = v.filter((x) => x && x !== "__new").length, nw = v.filter((x) => x === "__new").length, skip = v.filter((x) => !x).length;
          el.querySelector("[data-sum]").textContent = [toObs && toObs + " liitetään havaintoihin", nw && nw + " uuteen havaintoon", skip && skip + " ei liitetä"].filter(Boolean).join(", ") + ".";
        };
        el.addEventListener("change", sum); sum();
        el.querySelector("[data-ok]").addEventListener("click", async () => {
          const choice = Array.from(el.querySelectorAll("select")).map((s) => s.value);
          close();
          toast("Liitetään kuvia…", 4000);
          let lastNew = null, lastNewT = 0, nNew = 0, nAdd = 0;
          const touched = new Set();
          for (let i = 0; i < photos.length; i++) {
            const p = photos[i], c = choice[i];
            if (!c) continue;
            let h;
            if (c === "__new") {
              if (lastNew && p.t - lastNewT < 90 * 1000) h = lastNew;
              else {
                h = Model.newHavainto(S.kohde, {});
                h.created = p.t;
                if (M.MENETELMAT.some((m) => m.id === "aisti" && !m.piilotettu)) h.menetelma = "aisti";
                h.sijainti = { kerrosId: null, tilaId: null, rakenneosa: null, piste: null };
                lastNew = h; nNew++;
              }
              lastNewT = p.t;
            } else h = Model.havainto(c);
            if (!h) continue;
            const blob = await Camera.shrink(p.f);
            const id = await DB.putFile(S.kohde.id, blob, { kind: "kuva", havaintoId: h.id, created: p.t, lahde: "galleria" });
            h.kuvat.push(id);
            await Model.saveHavainto(h);
            touched.add(h.id); nAdd++;
          }
          cleanup();
          toast(nAdd + (nAdd === 1 ? " kuva liitetty" : " kuvaa liitetty") + (nNew ? ", " + nNew + (nNew === 1 ? " uusi havainto" : " uutta havaintoa") : ""), 3500);
          if (onDone) onDone(touched);
        });
      },
      { onClose: (v) => { if (v === null) cleanup(); } }
    );
  }

  window.Gallery = { importPhotos, exifTime, propose, windows };
})();
