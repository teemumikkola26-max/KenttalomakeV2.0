/* =========================================================================
   methods.js – menetelmät, niiden kentät ja vakiolistat
   Kenttä: { k: avain, l: otsikko, t: "text"|"num"|"select", u: yksikkö,
             o: vaihtoehdot, req: pakollinen ennen vientiä,
             mittaus: true = mittaustulos, vaatii vahvistuksen }
   Muokkaa tätä tiedostoa, kun menetelmiä tai pakollisia kenttiä muutetaan.
   ========================================================================= */
(function () {
  "use strict";

  const MENETELMAT = [
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
      id: "rh", nimi: "Rakenteen RH-mittaus", lyhyt: "RH", kentat: [
        { k: "tunnus", l: "Mittauspisteen tunnus", t: "text", req: true },
        { k: "laite", l: "Mittalaite", t: "text", req: true, muista: true },
        { k: "syvyys", l: "Mittaussyvyys", u: "mm", t: "num", req: true },
        { k: "tasaantuminen", l: "Tasaantumisaika", u: "h", t: "num", req: true },
        { k: "rh", l: "Suhteellinen kosteus", u: "%", t: "num", req: true, mittaus: true },
        { k: "t", l: "Lämpötila", u: "°C", t: "num", req: true, mittaus: true },
        { k: "rh_ilma", l: "Sisäilman RH", u: "%", t: "num", mittaus: true },
        { k: "t_ilma", l: "Sisäilman lämpötila", u: "°C", t: "num", mittaus: true }
      ]
    },
    {
      id: "avaus", nimi: "Rakenneavaus", lyhyt: "RA", kentat: [
        { k: "tunnus", l: "Avauksen tunnus", t: "text", req: true },
        { k: "kerrokset", l: "Rakennekerrokset (sisältä ulos)", t: "text", req: true }
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

  const RAKENNEOSAT = [
    "Ulkoseinä", "Väliseinä", "Alapohja / lattia", "Yläpohja / katto", "Välipohja",
    "Ikkuna / ovi", "Märkätila", "Liittymä", "IV / tekniikka", "Muu"
  ];

  const TULOKSET = {
    poikkeama: "Poikkeama",
    ok: "Ei huomautettavaa"
  };

  const TILASTATUS = {
    tarkastettu: { l: "Tarkastettu", cls: "st-ok" },
    poikkeama: { l: "Poikkeama", cls: "st-note" },
    ei_paasya: { l: "Ei pääsyä", cls: "st-skip" },
    ei_tutkittu: { l: "Ei tutkittu", cls: "st-none" }
  };

  function menetelma(id) {
    return MENETELMAT.find((m) => m.id === id) || MENETELMAT[0];
  }

  /* Sanelusta tunnistetut lukuarvot. Vain ehdotuksia: käyttäjä vahvistaa. */
  function lukuehdotukset(teksti) {
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

  window.M = { MENETELMAT, RAKENNEOSAT, TULOKSET, TILASTATUS, menetelma, lukuehdotukset };
})();
