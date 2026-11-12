/* =========================================================================
   methods.js – menetelmät, niiden kentät ja vakiolistat
   Menetelmät tallennetaan laitteelle (IndexedDB, asetukset/menetelmat).
   Alla olevat OLETUKSET otetaan käyttöön ensimmäisellä käynnistyskerralla
   ja kun käyttäjä palauttaa oletukset.

   Kenttä: { k: avain (pysyvä), l: otsikko,
             t: "text"|"textarea"|"num"|"date"|"select",
             u: yksikkö, o: vaihtoehdot (select),
             req: pakollinen ennen vientiä,
             mittaus: mittaustulos, vaatii vahvistuksen,
             muista: edellinen arvo ehdotetaan seuraavaan havaintoon }
   Taulukko (t: "table"): rivit tallentuvat havainnon kenttään taulukkona.
     sarakkeet: [{ k, l, t: "num"|"text"|"date", u, mittaus, ryhma, req }]
       date: lukupäivä, täyttyy automaattisesti kuvaus- tai lisäyspäivällä
       ryhma: sarake, jolla rivit ryhmitellään (esim. mittaussyvyys)
     ocr: { laite: "vaisala", RH: sarake, T: sarake, a: sarake } kameraluku mittarin näytöltä
   versio: oletusmenetelmän versio; suurempi versio korvaa laitteelle tallennetun
   Menetelmä: { id, nimi, lyhyt, kentat: [...], piilotettu: bool }
   ========================================================================= */
(function () {
  "use strict";

  const OLETUKSET = [
    { id: "aisti", nimi: "Aistinvarainen tarkastelu", lyhyt: "Aistinv.", kentat: [] },
    {
      id: "pintakosteus", nimi: "Pintakosteuskartoitus", lyhyt: "Pintakost.", kentat: [
        { k: "laite", l: "Mittalaite", t: "text", req: true, muista: true },
        { k: "asteikko", l: "Asteikko / yksikkö", t: "select", o: ["Vertailuarvo", "Laitteen asteikko", "% (puu)"], muista: true },
        { k: "arvo", l: "Arvo, havaintokohta", t: "num", req: true, mittaus: true },
        { k: "vertailu", l: "Arvo, vertailukohta", t: "num", req: true, mittaus: true }
      ]
    },
    {
      id: "rh", nimi: "Rakenteen RH-mittaus", lyhyt: "RH", versio: 3, kentat: [
        { k: "tunnus", l: "Mittauspisteen tunnus", t: "text", req: true },
        { k: "laite", l: "Mittalaite", t: "text", req: true, muista: true },
        { k: "tasaantuminen", l: "Tasaantumisaika", u: "h", t: "num", req: true, muista: true },
        {
          k: "mittaukset", l: "Mittaukset", t: "table", req: true,
          sarakkeet: [
            { k: "syvyys", l: "Syvyys", u: "mm", t: "num", ryhma: true, req: true },
            { k: "rh", l: "RH", u: "%", t: "num", mittaus: true, req: true },
            { k: "t", l: "T", u: "°C", t: "num", mittaus: true, req: true },
            { k: "a", l: "a", u: "g/m³", t: "num", mittaus: true },
            { k: "pvm", l: "Lukupäivä", t: "date", req: true }
          ],
          ocr: { laite: "vaisala", RH: "rh", T: "t", a: "a" }
        },
        {
          k: "olosuhteet", l: "Ympäröivät olosuhteet", t: "table",
          sarakkeet: [
            { k: "rh", l: "RH", u: "%", t: "num", mittaus: true, req: true },
            { k: "t", l: "T", u: "°C", t: "num", mittaus: true, req: true },
            { k: "a", l: "a", u: "g/m³", t: "num", mittaus: true },
            { k: "pvm", l: "Lukupäivä", t: "date", req: true }
          ],
          ocr: { laite: "vaisala", RH: "rh", T: "t", a: "a" }
        }
      ]
    },
    {
      id: "avaus", nimi: "Rakenneavaus", lyhyt: "RA", kentat: [
        { k: "tunnus", l: "Avauksen tunnus", t: "text", req: true },
        { k: "kerrokset", l: "Rakennekerrokset (sisältä ulos)", t: "textarea", req: true }
      ]
    },
    {
      id: "nayte", nimi: "Materiaalinäyte", lyhyt: "Näyte", kentat: [
        { k: "tunnus", l: "Näytteen tunnus", t: "text", req: true },
        { k: "tyyppi", l: "Näytteen tyyppi", t: "select", o: ["Mikrobi, materiaali", "Kuitu", "Haitta-aine", "VOC", "Muu"], req: true },
        { k: "materiaali", l: "Materiaali", t: "text", req: true }
      ]
    },
    {
      id: "merkkiaine", nimi: "Merkkiainekoe", lyhyt: "MAK", kentat: [
        { k: "tunnus", l: "Kokeen tunnus", t: "text", req: true },
        { k: "aine", l: "Merkkiaine", t: "text", req: true, muista: true },
        { k: "laite", l: "Mittalaite", t: "text", muista: true },
        { k: "injektointi", l: "Injektointikohta", t: "text", req: true },
        { k: "paine", l: "Painesuhde", u: "Pa", t: "num", mittaus: true },
        { k: "tulos", l: "Tulos", t: "select", o: ["Vuotoa havaittu", "Ei vuotoa"], req: true }
      ]
    },
    {
      id: "lampokuvaus", nimi: "Lämpökuvaus", lyhyt: "LK", kentat: [
        { k: "laite", l: "Kamera / malli", t: "text", req: true, muista: true },
        { k: "t_sisa", l: "Sisälämpötila", u: "°C", t: "num", req: true, mittaus: true },
        { k: "t_ulko", l: "Ulkolämpötila", u: "°C", t: "num", req: true, mittaus: true },
        { k: "paine", l: "Painesuhde", u: "Pa", t: "num", mittaus: true }
      ]
    },
    {
      id: "paine", nimi: "IV / painesuhdemittaus", lyhyt: "IV", kentat: [
        { k: "laite", l: "Mittalaite", t: "text", req: true, muista: true },
        { k: "paine", l: "Painesuhde", u: "Pa", t: "num", req: true, mittaus: true },
        { k: "jakso", l: "Tarkastelujakso", t: "text" }
      ]
    },
    { id: "muu", nimi: "Muu menetelmä", lyhyt: "Muu", kentat: [
      { k: "nimi", l: "Menetelmän nimi", t: "text", req: true }
    ] }
  ];

  const KENTTATYYPIT = [
    { v: "text", l: "Teksti (lyhyt)" },
    { v: "textarea", l: "Teksti (pitkä)" },
    { v: "num", l: "Numero" },
    { v: "date", l: "Päivämäärä" },
    { v: "select", l: "Valintalista" },
    { v: "table", l: "Taulukko (useita mittauksia)" }
  ];

  const RAKENNEOSAT = [
    "Ulkoseinä", "Väliseinä", "Alapohja / lattia", "Yläpohja / katto", "Välipohja",
    "Ikkuna / ovi", "Märkätila", "Liittymä", "IV / tekniikka", "Muu"
  ];

  const TULOKSET = { poikkeama: "Poikkeama", ok: "Ei huomautettavaa" };

  const TILASTATUS = {
    tarkastettu: { l: "Tarkastettu", cls: "st-ok" },
    poikkeama: { l: "Poikkeama", cls: "st-note" },
    ei_paasya: { l: "Ei pääsyä", cls: "st-skip" },
    ei_tutkittu: { l: "Ei tutkittu", cls: "st-none" }
  };

  const VALITSEMATTA = { id: null, nimi: "Menetelmä valitsematta", lyhyt: "Ei menetelmää", kentat: [] };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const M = {
    MENETELMAT: clone(OLETUKSET),
    KENTTATYYPIT, RAKENNEOSAT, TULOKSET, TILASTATUS,

    async load() {
      try {
        const rec = await DB.get("asetukset", "menetelmat");
        if (rec && Array.isArray(rec.lista) && rec.lista.length) {
          M.MENETELMAT = rec.lista;
          // Päivitys: oletusmenetelmä, jonka versio on vanhempi kuin koodissa, korvataan uudella
          // (esim. RH-mittaus: absoluuttinen kosteus, lukupäivä ja ympäröivät olosuhteet).
          let muuttui = false;
          OLETUKSET.filter((o) => o.versio).forEach((o) => {
            const i = M.MENETELMAT.findIndex((m) => m.id === o.id);
            if (i >= 0 && (M.MENETELMAT[i].versio || 0) < o.versio) {
              // tutkijan omat tunnistussanat säilyvät päivityksessä
              const vanha = M.MENETELMAT[i], uusi = clone(o);
              ["sanat", "etuliite"].forEach((k) => { if (vanha[k] != null) uusi[k] = vanha[k]; });
              uusi.kentat.forEach((f) => { const v = (vanha.kentat || []).find((x) => x.k === f.k); if (v && v.sanat) f.sanat = v.sanat; });
              M.MENETELMAT[i] = uusi; muuttui = true;
            }
          });
          if (muuttui) await M.save();
        }
      } catch (e) { console.warn("Menetelmien lataus epäonnistui", e); }
    },
    async save() {
      await DB.put("asetukset", { id: "menetelmat", lista: M.MENETELMAT, muokattu: Date.now() });
    },
    async palautaOletukset() {
      // Oletukset palautetaan, mutta omat menetelmät säilyvät (havainnot voivat viitata niihin).
      const omat = M.MENETELMAT.filter((m) => !OLETUKSET.some((o) => o.id === m.id));
      M.MENETELMAT = clone(OLETUKSET).concat(omat);
      await M.save();
    },
    /* Yhdistää tuodut menetelmät: tuntemattomat lisätään, samannimiset id:t korvataan. */
    async yhdista(lista, korvaa) {
      (lista || []).forEach((m) => {
        if (!m || !m.id || !m.nimi || !Array.isArray(m.kentat)) return;
        const i = M.MENETELMAT.findIndex((x) => x.id === m.id);
        if (i < 0) M.MENETELMAT.push(m);
        else if (korvaa) M.MENETELMAT[i] = m;
      });
      await M.save();
    },

    aktiiviset() { return M.MENETELMAT.filter((m) => !m.piilotettu); },
    menetelma(id) {
      if (!id) return VALITSEMATTA;
      return M.MENETELMAT.find((m) => m.id === id) || { id, nimi: "Tuntematon menetelmä", lyhyt: "?", kentat: [] };
    },
    /* Onko havainnossa mittausarvoja (myös taulukoissa)? */
    onMittauksia(h) {
      const tyhja = (v) => v == null || String(v).trim() === "";
      return M.menetelma(h.menetelma).kentat.some((f) => {
        if (f.t === "table") {
          const rivit = Array.isArray(h.kentat[f.k]) ? h.kentat[f.k] : [];
          return rivit.some((r) => (f.sarakkeet || []).some((c) => c.mittaus && !tyhja(r[c.k])));
        }
        return f.mittaus && !tyhja(h.kentat[f.k]);
      });
    },
    rivit(h, f) { return Array.isArray(h.kentat[f.k]) ? h.kentat[f.k] : []; },
    ryhmaSarake(f) { return (f.sarakkeet || []).find((c) => c.ryhma) || null; },
    tyyppiNimi(t) { const x = KENTTATYYPIT.find((k) => k.v === t); return x ? x.l : t; },

    /* Sanelusta tunnistetut lukuarvot. Vain ehdotuksia: käyttäjä vahvistaa. */
    lukuehdotukset(teksti) {
      if (!teksti) return [];
      const out = [];
      const re = /(-?\d+(?:[,.]\d+)?)\s*(%|prosenttia|prosentti|°\s?c|astetta|aste|pascalia|pa\b|mm\b|millimetriä|milliä|tuntia|tunti|h\b)/gi;
      let m;
      while ((m = re.exec(teksti))) {
        const raw = m[2].toLowerCase().replace(/\s/g, "");
        let u = null;
        if (raw === "%" || raw.startsWith("prosent")) u = "%";
        else if (raw === "°c" || raw.startsWith("aste")) u = "°C";
        else if (raw.startsWith("pa")) u = "Pa";
        else if (raw === "mm" || raw.startsWith("millim") || raw === "milliä") u = "mm";
        else if (raw === "h" || raw.startsWith("tunti")) u = "h";
        if (u) out.push({ arvo: m[1].replace(",", "."), u, teksti: m[0] });
      }
      return out;
    }
  };

  window.M = M;
})();
