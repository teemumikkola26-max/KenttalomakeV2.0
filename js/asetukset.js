/* =========================================================================
   asetukset.js – laitekohtaiset asetukset (testivaihe)

   Kaikki säädettävät toiminnot yhdessä paikassa. Tallennus localStorageen
   (ks.asetukset). Asetukset voi kopioida JSON-tekstinä ja liittää toiseen
   puhelimeen, ja niistä voidaan myöhemmin tehdä sovelluksen oletukset.
   ========================================================================= */
(function () {
  "use strict";
  const KEY = "ks.asetukset";

  /* t: "bool" tai "valinta" (o = [[arvo, teksti], …]). Ryhmä = otsikko asetussivulla. */
  const SCHEMA = [
    { ryhma: "Täytetään sanelusta", ohje: "Valitse, mitkä tiedot sovellus päättelee sanelusta. Muut valitset itse. Sanelu tallentuu aina tekstinä, ja itse tehdyistä valinnoista kertyy aineistoa tunnistuksen parantamiseen." },
    { k: "af.menetelma", t: "bool", d: false, nimi: "Menetelmä", ohje: "Pois: menetelmä valitaan pikavalinnasta." },
    { k: "af.ennuste", t: "bool", d: true, nimi: "Menetelmä opitusta mallista", ohje: "Kun avainsanat eivät tunnista menetelmää, käytetään aiemmista kirjauksista opittua mallia. Vain, jos Menetelmä on päällä." },
    { k: "af.tila", t: "bool", d: true, nimi: "Tila", ohje: "Pois: tila valitaan itse." },
    { k: "af.rakenneosa", t: "bool", d: true, nimi: "Rakenneosa (lattia, seinä, katto …)" },
    { k: "af.tulos", t: "bool", d: true, nimi: "Tulos (poikkeama / ei huom.)" },
    { k: "af.kentat", t: "bool", d: true, nimi: "Mittausarvot ja kentät", ohje: "Lukemat, mittalaite, materiaali, näytetyyppi jne." },
    { k: "af.kaosa", t: "bool", d: true, nimi: "Kuntoarvion rakennusosa" },
    { k: "af.tunnus", t: "bool", d: true, nimi: "Tunnusten numerointi (MIK1, RH2 …)", ohje: "Pois: tunnus kirjoitetaan itse." },

    { ryhma: "Pikavalinta", ohje: "Ikkuna uuden havainnon alussa. Näkyy, kun menetelmä tai tila valitaan itse." },
    { k: "pv.milloin", t: "valinta", d: "aina", nimi: "Milloin pikavalinta avautuu", o: [["aina", "Jokaiselle uudelle havainnolle"], ["alussa", "Vain kun kuvaus avataan"], ["ei", "Ei koskaan (valinta paneelista)"]] },
    { k: "pv.tila", t: "valinta", d: "aina", nimi: "Tila pikavalinnassa", o: [["aina", "Aina, kun tila valitaan itse (edellinen valmiina)"], ["auto", "Vain kun tila puuttuu"], ["ei", "Ei koskaan"]] },
    { k: "pv.suunnitelma", t: "bool", d: true, nimi: "Suunnitelman menetelmät isoina painikkeina", ohje: "Tekemättömät menetelmät ja edellinen ylimpänä." },
    { k: "pv.sama", t: "bool", d: true, nimi: "Seuraava jatkaa samalla menetelmällä", ohje: "Uusi havainto saa edellisen menetelmän valmiiksi; pikavalinnassa se on ylimpänä." },

    { ryhma: "Sanelu" },
    { k: "sanelu.tapa", t: "valinta", d: "pida", nimi: "Mikrofonipainike", o: [["pida", "Pidä pohjassa (lyhyt napautus lukitsee)"], ["napauta", "Napauta: päälle / pois"]] },
    { k: "sanelu.puhe", t: "valinta", d: "oletus", nimi: "Puheentunnistus", o: [["oletus", "Ylläpitäjän asetus (config.js)"], ["palvelin", "Selaimen palvelu (ääni verkkoon)"], ["laite", "Vain puhelimessa (ääni ei lähde)"]], ohje: "Muutos tulee voimaan, kun sovellus avataan uudelleen." },
    { k: "sanelu.varina", t: "bool", d: true, nimi: "Värinä sanelun alkaessa ja päättyessä" },

    { ryhma: "Kamera" },
    { k: "kamera.koko", t: "valinta", d: "2048", nimi: "Kuvan koko (pidempi sivu)", o: [["1600", "1600 px (pienet tiedostot)"], ["2048", "2048 px"], ["3000", "3000 px (tarkka, isot tiedostot)"]] },
    { k: "kamera.laatu", t: "valinta", d: "0.85", nimi: "JPEG-laatu", o: [["0.75", "75 %"], ["0.85", "85 %"], ["0.92", "92 %"]] },
    { k: "kamera.valve", t: "bool", d: true, nimi: "Näyttö pysyy päällä kuvatessa" },

    { ryhma: "Tarkistus ja pohjakuva" },
    { k: "tark.tulos", t: "bool", d: true, nimi: "Tulos on pakollinen", ohje: "Pois: puuttuva tulos ei näy lähtötarkistuksessa puutteena." },
    { k: "pohja.tilat", t: "valinta", d: "varmat", nimi: "Pohjakuvasta tunnistetut tilat", o: [["varmat", "Varmat lisätään suoraan, epävarmat tarkistetaan"], ["kaikki", "Kaikki tarkistetaan ennen lisäystä"]] }
  ];
  const DEF = {};
  SCHEMA.forEach((s) => { if (s.k) DEF[s.k] = s.d; });

  function lue() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { o = {}; }
    // Siirto versiosta 29 (ks.af) ja 27 (ks.autofill)
    try {
      const af = JSON.parse(localStorage.getItem("ks.af") || "null");
      if (af) {
        Object.keys(af).forEach((k) => { if (!("af." + k in o)) o["af." + k] = af[k]; });
        if ("tila" in af && !("af.rakenneosa" in o)) o["af.rakenneosa"] = af.tila;
        localStorage.removeItem("ks.af"); kirjoita(o);
      } else if (localStorage.getItem("ks.autofill") === "0") {
        Object.keys(DEF).filter((k) => k.startsWith("af.")).forEach((k) => { o[k] = false; });
        localStorage.removeItem("ks.autofill"); kirjoita(o);
      }
    } catch (e) { /* ohita */ }
    return o;
  }
  function kirjoita(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ohita */ } }

  function get(k) {
    const o = lue();
    return k in o ? o[k] : DEF[k];
  }
  function set(k, v) { const o = lue(); if (v === DEF[k]) delete o[k]; else o[k] = v; kirjoita(o); }
  function kaikki() { const o = lue(), out = {}; Object.keys(DEF).forEach((k) => { out[k] = k in o ? o[k] : DEF[k]; }); return out; }
  /* Vain oletuksesta poikkeavat: helppo lähettää ja verrata */
  function muutetut() { const a = kaikki(), out = {}; Object.keys(a).forEach((k) => { if (a[k] !== DEF[k]) out[k] = a[k]; }); return out; }
  function palauta() { try { localStorage.removeItem(KEY); } catch (e) { /* ohita */ } }
  function tuo(json) {
    const o = typeof json === "string" ? JSON.parse(json) : json;
    const puhdas = {};
    Object.keys(o || {}).forEach((k) => {
      const s = SCHEMA.find((x) => x.k === k);
      if (!s) return;
      if (s.t === "bool" && typeof o[k] === "boolean") puhdas[k] = o[k];
      if (s.t === "valinta" && s.o.some((x) => x[0] === String(o[k]))) puhdas[k] = String(o[k]);
    });
    kirjoita(puhdas);
    return Object.keys(puhdas).length;
  }


  /* ---------- Asetukset-sivu (#/asetukset) ---------- */
  async function view() {
    const { esc, icon, toast } = UI;
    const root = document.getElementById("app");
    const muutettu = (k) => get(k) !== DEF[k];
    const rivi = (x) => {
      const mk = muutettu(x.k) ? ' <span class="as-muut">muutettu</span>' : "";
      if (x.t === "bool") return '<label class="ka-chk as-chk"><input type="checkbox" data-as="' + x.k + '"' + (get(x.k) ? " checked" : "") + "><span><b>" + esc(x.nimi) + "</b>" + mk + (x.ohje ? '<br><span class="hint">' + esc(x.ohje) + "</span>" : "") + "</span></label>";
      return '<div class="as-val"><div class="as-n"><b>' + esc(x.nimi) + "</b>" + mk + (x.ohje ? '<br><span class="hint">' + esc(x.ohje) + "</span>" : "") + '</div><div class="seg as-seg">' +
        x.o.map((o) => '<button data-as="' + x.k + '" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(get(x.k)) === o[0]) + '">' + esc(o[1]) + "</button>").join("") + "</div></div>";
    };
    let html = "", auki = false;
    SCHEMA.forEach((x) => {
      if (x.ryhma) { if (auki) html += "</div></section>"; html += '<section class="card"><div class="card-h"><h2>' + esc(x.ryhma) + '</h2></div><div class="card-b">' + (x.ohje ? '<p class="hint" style="margin:0 0 8px">' + esc(x.ohje) + "</p>" : ""); auki = true; }
      else html += rivi(x);
    });
    if (auki) html += "</div></section>";
    const n = Object.keys(muutetut()).length;
    root.innerHTML = App.topbar({ title: "Asetukset", sub: "Tämä puhelin" + (n ? " · " + n + " muutettu" : " · oletukset"), back: App.paluu("#/") }) +
      '<main class="view no-nav">' + html +
      '<section class="card"><div class="card-h"><h2>Ohjeet ja asetusten siirto</h2></div><div class="card-b">' +
      '<button class="btn btn-block" data-a="ohje">' + icon("cam") + "Näytä kameranäkymän ohje uudelleen</button><div style=\"height:10px\"></div>" +
      '<button class="btn btn-block" data-a="kopioi">' + icon("list") + "Kopioi asetukset (teksti)</button><div style=\"height:10px\"></div>" +
      '<button class="btn btn-block" data-a="liita">' + icon("upload") + "Liitä asetukset</button><div style=\"height:10px\"></div>" +
      '<button class="btn btn-block" data-a="palauta">' + icon("back") + "Palauta oletukset</button>" +
      '<p class="hint">Kopioitu teksti sisältää vain oletuksesta muutetut asetukset. Sen voi liittää toiseen puhelimeen tai lähettää, jotta parhaista valinnoista tehdään sovelluksen oletukset.</p>' +
      "</div></section></main>";
    const paivita = () => { const y = window.scrollY; view().then(() => window.scrollTo(0, y)); };
    root.onchange = (e) => { const c = e.target.closest("input[data-as]"); if (c) { set(c.dataset.as, c.checked); paivita(); } };
    root.onclick = async (e) => {
      const b = e.target.closest("button[data-as]");
      if (b) { set(b.dataset.as, b.dataset.v); paivita(); return; }
      const a = e.target.closest("[data-a]");
      if (!a) return;
      if (a.dataset.a === "ohje") { try { localStorage.removeItem("ks.ohje.kuvaus"); } catch (x) { /* ohita */ } toast("Ohje näytetään, kun avaat kuvauksen"); }
      if (a.dataset.a === "kopioi") {
        const txt = JSON.stringify({ kuvaSanelu: window.APP_VERSION || "", asetukset: muutetut() }, null, 1);
        try { await navigator.clipboard.writeText(txt); toast("Asetukset kopioitu leikepöydälle"); }
        catch (x) { await UI.promptSheet({ title: "Kopioi asetukset", value: txt, multiline: true, ok: "Sulje" }); }
      }
      if (a.dataset.a === "liita") {
        const v = await UI.promptSheet({ title: "Liitä asetukset", text: "Liitä kopioitu teksti.", multiline: true, ok: "Ota käyttöön" });
        if (!v) return;
        try { const o = JSON.parse(v); const m = tuo(o.asetukset || o); toast(m + " asetusta otettu käyttöön"); paivita(); }
        catch (x) { toast("Teksti ei ole kelvollinen asetusteksti"); }
      }
      if (a.dataset.a === "palauta") {
        if (!confirm("Palautetaanko kaikki asetukset oletuksiin?")) return;
        palauta(); toast("Oletukset palautettu"); paivita();
      }
    };
    App.S.cleanup = () => { root.onchange = root.onclick = null; };
  }

  window.Asetukset = { SCHEMA, DEF, get, set, kaikki, muutetut, palauta, tuo, view };
})();
