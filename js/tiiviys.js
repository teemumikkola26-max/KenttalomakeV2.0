/* =========================================================================
   tiiviys.js – tiiveysmittauksen mittauslaskuri (#/k/<kohde>/tiiviys/<havainto>)

   Mitat mitataan kohteella todellisista mitoista (Teemu 17.11.). Väliseinät eivät
   saa pienentää alaa eikä tilavuutta, joten jokaisesta kerroksesta mitataan
   ulkovaipan sisäpinnat kiertäen: seinän pituus ja kääntymissuunta kulmassa.
   Väliseinän paksuuden voi lisätä pituuteen (esim. "4,20 + 0,10").
   Sovellus piirtää muodon ja tarkistaa, että kierros sulkeutuu.

   Kierros kirjoitetaan tai sanellaan riviksi: "4,2 oikea 3,6 oikea 4,2 oikea 3,6".
   Kääntymissana: oikea / vasen (90°), tai "kulma 135". Viimeisen seinän jälkeen
   ei tarvitse kääntyä. Ilman suuntasanaa oletus on oikea (myötäpäivään).

   Tulokset (havainnon kentät): lattiapinta-ala (Σ kerrosten alat), ilmatilavuus
   (Σ ala × korkeus + osa-alueiden korjaukset) ja vaipan ala (seinät + alin lattia
   + ylin katto + porrastusten vaakapinnat). Laskelma tallentuu havaintoon
   (h.tiiviys) ja menee raportille kaavoineen.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  const { S, Model } = App;
  const fi = (n, d) => (Math.round(n * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toString().replace(".", ",");
  const luku = (s) => { const n = parseFloat(String(s == null ? "" : s).replace(",", ".")); return isNaN(n) ? null : n; };

  /* "4,2 + 0,1 oikea 3,6 vasen 2 kulma 135 5" -> [{ pituus, kaanto }] (kaanto asteina, + = oikealle) */
  function jasenna(teksti) {
    const t = window.FieldFill ? FieldFill.prep(teksti) : " " + String(teksti || "").toLowerCase() + " ";
    const tok = t.replace(/(\d)\s*\+\s*(\d)/g, "$1+$2").match(/\d+(?:[,.]\d+)?(?:\+\d+(?:[,.]\d+)?)*|oikea[a-zä]*|vasen[a-zä]*|vasemma[a-zä]*|kulma[a-zä]*|suoraan/g) || [];
    const out = []; let kulma = false;
    tok.forEach((w) => {
      if (/^\d/.test(w)) {
        if (kulma && out.length) { out[out.length - 1].kaanto = 180 - luku(w); out[out.length - 1].kulma = luku(w); kulma = false; return; }   // sisäkulma → kääntymä
        out.push({ pituus: w.split("+").reduce((s, x) => s + (luku(x) || 0), 0), kaanto: null, osat: w.split("+").length });
      } else if (!out.length) return;
      else if (/^oikea/.test(w)) out[out.length - 1].kaanto = 90;
      else if (/^vase|^vasemma/.test(w)) out[out.length - 1].kaanto = -90;
      else if (/^suoraan/.test(w)) out[out.length - 1].kaanto = 0;
      else if (/^kulma/.test(w)) kulma = true;
    });
    out.forEach((s, i) => { if (s.kaanto == null && i < out.length - 1) s.kaanto = 90; });
    return out;
  }

  /* Muoto: alku (0,0), suunta itään. Sulkeutumisvirhe ja ala (kengännauha). Pieni virhe jaetaan
     seinille pituuksien suhteessa (Bowditch), jotta ala ei vääristy. */
  function laske(seinat) {
    if (seinat.length < 3) return null;
    let x = 0, y = 0, h = 0, kierto = 0;
    const p = [{ x: 0, y: 0 }];
    seinat.forEach((s, i) => {
      x += Math.cos(h) * s.pituus; y += Math.sin(h) * s.pituus; p.push({ x, y });
      if (i < seinat.length - 1) { h += (s.kaanto || 0) * Math.PI / 180; kierto += s.kaanto || 0; }
    });
    const piiri = seinat.reduce((a, s) => a + s.pituus, 0);
    const virhe = Math.hypot(x, y);
    // Viimeinen (kirjaamaton) kääntymä takaisin alkusuuntaan; kääntymien summa pitää olla ±360°.
    // Väärin päin kirjattu kääntymä (oikea ↔ vasen) näkyy tästä, vaikka muoto sulkeutuisi melkein.
    let viimeinen = -kierto % 360; if (viimeinen > 180) viimeinen -= 360; if (viimeinen <= -180) viimeinen += 360;
    // korjaus
    let kum = 0;
    const q = p.map((pt, i) => { if (i) kum += seinat[i - 1].pituus; return { x: pt.x - x * kum / piiri, y: pt.y - y * kum / piiri }; });
    q.pop();
    let a2 = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; a2 += a.x * b.y - b.x * a.y; }
    const kulmaOk = Math.abs(Math.abs(kierto + viimeinen) - 360) < 1 && Math.abs(viimeinen) < 179;
    return { ala: Math.abs(a2) / 2, piiri, virhe, suhteellinen: virhe / piiri, pisteet: q, raaka: p, kierto, viimeinen, kulmaOk };
  }

  function data(h) {
    if (!h.tiiviys) h.tiiviys = { kerrokset: [{ id: DB.uid("tk_"), nimi: "1. krs", korkeus: "", kierros: "" }], osat: [] };
    return h.tiiviys;
  }
  function tulokset(h) {
    const d = data(h), ks = d.kerrokset.map((k) => ({ k, r: laske(jasenna(k.kierros)), kork: luku(k.korkeus) }));
    const ok = ks.filter((x) => x.r && x.kork);
    if (!ok.length) return { ks, valmis: false };
    const ala = ok.reduce((s, x) => s + x.r.ala, 0);
    let tilavuus = ok.reduce((s, x) => s + x.r.ala * x.kork, 0);
    const osat = (d.osat || []).map((o) => ({ o, ala: luku(o.ala), ero: luku(o.ero) })).filter((o) => o.ala && o.ero != null);
    osat.forEach((o) => { tilavuus += o.ala * o.ero; });
    const seinat = ok.reduce((s, x) => s + x.r.piiri * x.kork, 0);
    let vaaka = ok[0].r.ala + ok[ok.length - 1].r.ala;
    for (let i = 0; i < ok.length - 1; i++) vaaka += Math.abs(ok[i].r.ala - ok[i + 1].r.ala);
    if (ok.length === 1) vaaka = 2 * ok[0].r.ala;
    const vaippa = seinat + vaaka;
    return { ks, valmis: ok.length === ks.length, ala, tilavuus, vaippa, seinat, vaaka, osat };
  }

  function svg(r) {
    if (!r) return "";
    const P = r.raaka, xs = P.map((p) => p.x), ys = P.map((p) => p.y);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const w = Math.max(1, maxx - minx), hh = Math.max(1, maxy - miny), pad = Math.max(w, hh) * 0.08;
    const vb = [minx - pad, miny - pad, w + 2 * pad, hh + 2 * pad].map((n) => n.toFixed(2)).join(" ");
    const sw = (Math.max(w, hh) / 120).toFixed(3);
    const auki = r.virhe > 0.01;
    return '<svg class="tv-svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kierroksen muoto">' +
      '<polyline points="' + P.map((p) => p.x.toFixed(2) + "," + p.y.toFixed(2)).join(" ") + '" fill="' + (auki ? "none" : "var(--ok-bg)") + '" stroke="var(--ink)" stroke-width="' + sw + '"/>' +
      '<circle cx="0" cy="0" r="' + (sw * 3) + '" fill="var(--ok)"/>' +
      (auki ? '<line x1="' + P[P.length - 1].x.toFixed(2) + '" y1="' + P[P.length - 1].y.toFixed(2) + '" x2="0" y2="0" stroke="var(--note-line)" stroke-width="' + sw + '" stroke-dasharray="' + (sw * 4) + '"/>' : "") +
      "</svg>";
  }

  async function view(hid) {
    const k = S.kohde, h = Model.havainto(hid);
    if (!h) { location.hash = "#/k/" + k.id; return; }
    const d = data(h);
    const root = document.getElementById("app");
    const save = UI.debounce(() => Model.saveHavainto(h), 400);
    let dict = null;

    function kerrosHtml(x, i) {
      const s = jasenna(x.kierros), r = laske(s);
      const tila = !s.length ? "" : s.length < 3 ? '<p class="hint">Vähintään kolme seinää.</p>'
        : '<div class="tv-res">' + svg(r) + '<div class="tv-num">' +
          "<div><b>" + fi(r.ala, 1) + " m²</b> ala</div><div>" + fi(r.piiri, 2) + " m piiri · " + s.length + " seinää</div>" +
          '<div class="' + (r.suhteellinen > 0.01 ? "tv-bad" : "tv-ok") + '">Sulkeutumisvirhe ' + fi(r.virhe * 100, 0) + " cm" + (r.suhteellinen > 0.01 ? " – tarkista mitat tai kääntymät" : "") + "</div>" +
          (!r.kulmaOk ? '<div class="tv-bad">Kääntymät eivät tee täyttä kierrosta (' + r.kierto + "°). Tarkista oikea/vasen.</div>" : "") + "</div></div>";
      return '<section class="card" data-kid="' + x.id + '"><div class="card-h"><h2><input class="tv-nimi" data-kf="nimi" value="' + esc(x.nimi) + '" aria-label="Kerroksen nimi"></h2>' +
        (d.kerrokset.length > 1 ? '<button class="icon-btn" data-delk="' + x.id + '" aria-label="Poista kerros">' + icon("trash") + "</button>" : "") + '</div><div class="card-b">' +
        '<label class="field"><span>Kerroskorkeus (sisämitta) <span class="u">(m)</span></span><input type="text" inputmode="decimal" data-kf="korkeus" value="' + esc(x.korkeus || "") + '" placeholder="esim. 2,6"></label>' +
        '<label class="field"><span>Kierros: pituus ja kääntymä</span><textarea data-kf="kierros" style="min-height:70px" placeholder="4,20 oikea 3,60 oikea 4,20 oikea 3,60">' + esc(x.kierros || "") + "</textarea></label>" +
        '<div class="row-btns" style="margin:0 0 6px"><button class="btn btn-sm" data-mic="' + x.id + '">' + icon("mic") + '<span data-ml>Pidä: sanele</span></button>' +
          '<button class="btn btn-sm" data-lisaa="oikea">↱ oikea</button><button class="btn btn-sm" data-lisaa="vasen">↰ vasen</button></div>' +
        '<div data-tila="' + x.id + '">' + tila + "</div></div></section>";
    }
    function yhteenveto() {
      const t = tulokset(h);
      if (!t.ala) return '<p class="hint">Anna kerroskorkeus ja kierros, niin ala, tilavuus ja vaipan ala lasketaan.</p>';
      return '<div class="tv-sum"><div><b>' + fi(t.ala, 1) + " m²</b><span>lattiapinta-ala</span></div><div><b>" + fi(t.tilavuus, 1) + " m³</b><span>ilmatilavuus</span></div><div><b>" + fi(t.vaippa, 1) + " m²</b><span>vaipan ala</span></div></div>" +
        '<p class="hint" style="margin:6px 0 10px">Vaippa = seinät ' + fi(t.seinat, 1) + " m² + lattia ja katto " + fi(t.vaaka, 1) + " m²" + (t.osat.length ? ". Tilavuuteen " + t.osat.length + " osa-alueen korjaus." : ".") +
        (t.valmis ? "" : " Kaikki kerrokset eivät ole valmiita.") + "</p>" +
        '<button class="btn btn-primary btn-block" data-vie>' + icon("check") + "Vie arvot havainnon kenttiin</button>";
    }
    function paint() {
      root.innerHTML = App.topbar({ title: "Tiiveysmittauksen laskuri", sub: UI.nro(h) + (h.kentat.alue ? " · " + h.kentat.alue : ""), back: "#/k/" + k.id + "/h/" + h.id }) +
        '<main class="view no-nav">' +
        '<p class="hint" style="margin:0 0 12px">Mittaa ulkovaipan sisäpinnat kiertäen. Väliseinät eivät pienennä alaa: lisää väliseinän paksuus seinän pituuteen (esim. 4,20 + 0,10). Kirjoita tai sanele: pituus ja suunta, johon käännyt kulmassa.</p>' +
        d.kerrokset.map(kerrosHtml).join("") +
        '<button class="btn btn-block" data-addk style="margin-bottom:12px">' + icon("plus") + "Lisää kerros</button>" +
        '<section class="card"><div class="card-h"><h2>Poikkeavat korkeudet</h2><span class="meta">osa-alueet</span></div><div class="card-b">' +
          '<p class="hint" style="margin:0 0 8px">Esim. korotettu katto tai alas laskettu osa: ala ja korkeusero kerroskorkeuteen (+/−).</p>' +
          (d.osat || []).map((o) => '<div class="grid2" data-oid="' + o.id + '"><label class="field"><span>' + esc(o.nimi || "Osa-alue") + ' <span class="u">(m²)</span></span><input type="text" inputmode="decimal" data-of="ala" value="' + esc(o.ala || "") + '"></label>' +
            '<label class="field"><span>Korkeusero <span class="u">(m)</span></span><input type="text" inputmode="decimal" data-of="ero" value="' + esc(o.ero || "") + '" placeholder="esim. 1,2 tai -0,3"></label></div>').join("") +
          '<button class="btn btn-sm" data-addo>' + icon("plus") + "Lisää osa-alue</button></div></section>" +
        '<section class="card"><div class="card-h"><h2>Tulos</h2></div><div class="card-b" data-sum>' + yhteenveto() + "</div></section>" +
        "</main>";
      bindDict();
    }
    function paivita(kid) {
      const x = d.kerrokset.find((y) => y.id === kid), box = root.querySelector('[data-tila="' + kid + '"]');
      if (x && box) { const tmp = document.createElement("div"); tmp.innerHTML = kerrosHtml(x); const nb = tmp.querySelector('[data-tila="' + kid + '"]'); box.innerHTML = nb ? nb.innerHTML : ""; }
      const s = root.querySelector("[data-sum]"); if (s) s.innerHTML = yhteenveto();
    }
    function bindDict() {
      root.querySelectorAll("[data-mic]").forEach((btn) => {
        const kid = btn.dataset.mic, ta = root.querySelector('[data-kid="' + kid + '"] [data-kf="kierros"]');
        const dd = new Dictation({
          onCommit: (text) => { ta.value = DictButton.appendText(ta.value, text); d.kerrokset.find((y) => y.id === kid).kierros = ta.value; save(); paivita(kid); },
          onState: (st, msg) => { if ((st === "error" || st === "empty") && msg) toast(msg, 3000); b.paint(); },
          onAudio: () => toast("Äänitettä ei tallenneta laskuriin. Kirjoita mitat.", 3000)
        });
        const b = DictButton.bind(btn, dd, { labelEl: btn.querySelector("[data-ml]") });
        dict = dict || []; dict.push(dd);
      });
    }
    root.oninput = (e) => {
      const t = e.target, sec = t.closest("[data-kid]");
      if (t.dataset.kf && sec) { d.kerrokset.find((y) => y.id === sec.dataset.kid)[t.dataset.kf] = t.value; save(); if (t.dataset.kf !== "nimi") paivita(sec.dataset.kid); }
      const od = t.closest("[data-oid]");
      if (t.dataset.of && od) { d.osat.find((o) => o.id === od.dataset.oid)[t.dataset.of] = t.value; save(); const s = root.querySelector("[data-sum]"); if (s) s.innerHTML = yhteenveto(); }
    };
    root.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.lisaa) {
        const ta = b.closest("[data-kid]").querySelector('[data-kf="kierros"]');
        ta.value = ta.value.replace(/\s*$/, "") + " " + b.dataset.lisaa + " "; ta.focus();
        d.kerrokset.find((y) => y.id === b.closest("[data-kid]").dataset.kid).kierros = ta.value; save(); paivita(b.closest("[data-kid]").dataset.kid); return;
      }
      if (b.hasAttribute("data-addk")) { d.kerrokset.push({ id: DB.uid("tk_"), nimi: (d.kerrokset.length + 1) + ". krs", korkeus: d.kerrokset[d.kerrokset.length - 1].korkeus || "", kierros: "" }); save(); paint(); return; }
      if (b.dataset.delk) { if (!confirm("Poistetaanko kerros?")) return; d.kerrokset = d.kerrokset.filter((y) => y.id !== b.dataset.delk); save(); paint(); return; }
      if (b.hasAttribute("data-addo")) { d.osat = d.osat || []; d.osat.push({ id: DB.uid("to_"), nimi: "Osa-alue " + (d.osat.length + 1), ala: "", ero: "" }); save(); paint(); return; }
      if (b.hasAttribute("data-vie")) {
        const t = tulokset(h);
        h.kentat.lattiaala = fi(t.ala, 1); h.kentat.tilavuus = fi(t.tilavuus, 1); h.kentat.vaippa = fi(t.vaippa, 1);
        h.auto = h.auto || {}; ["lattiaala", "tilavuus", "vaippa"].forEach((x) => { h.auto["k:" + x] = "laskuri"; });
        await Model.saveHavainto(h); toast("Arvot viety havaintoon"); location.hash = "#/k/" + k.id + "/h/" + h.id;
      }
    };
    S.cleanup = () => { (dict || []).forEach((x) => x.stop()); save.flush(); root.oninput = root.onclick = null; };
    paint();
  }

  /* Vienti: laskelma raportille (mitat, kaava, sulkeutumisvirhe) */
  function vienti(h) {
    if (!h.tiiviys) return null;
    const t = tulokset(h);
    return {
      menetelma: "Ulkovaipan sisäpinnat kiertäen mitattu, väliseinät eivät pienennä alaa. Ala kengännauhakaavalla, sulkeutumisvirhe jaettu seinille pituuksien suhteessa.",
      kerrokset: t.ks.map((x) => ({ kerros: x.k.nimi, korkeus_m: x.kork, kierros: x.k.kierros, ala_m2: x.r ? +x.r.ala.toFixed(2) : null, piiri_m: x.r ? +x.r.piiri.toFixed(2) : null, sulkeutumisvirhe_cm: x.r ? Math.round(x.r.virhe * 100) : null })),
      osa_alueet: (h.tiiviys.osat || []).map((o) => ({ nimi: o.nimi, ala_m2: luku(o.ala), korkeusero_m: luku(o.ero) })),
      lattiapinta_ala_m2: t.ala ? +t.ala.toFixed(1) : null, ilmatilavuus_m3: t.tilavuus ? +t.tilavuus.toFixed(1) : null, vaipan_ala_m2: t.vaippa ? +t.vaippa.toFixed(1) : null
    };
  }

  window.Tiiviys = { view, jasenna, laske, tulokset, vienti };
})();
