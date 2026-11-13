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

  /* Näytetyypit ryhmittäin (materiaali-, ilma- ja pinta/pölynäytteet) */
  const NAYTTEET = [
    ["Materiaalinäytteet", ["Mikrobi, materiaali", "VOC, materiaali (mikrokammio)", "Asbesti, materiaali", "PAH, materiaali", "PCB, materiaali", "Klooratut parafiinit, materiaali", "Ftalaatit ja TXIB, materiaali"]],
    ["Ilmanäytteet", ["Mikrobi, ilma (Andersen)", "VOC, ilma (Tenax)", "Formaldehydi, ilma", "Kloorianisolit, ilma", "PAH, ilma", "Asbesti, ilma"]],
    ["Pinta- ja pölynäytteet", ["Laskeumapöly (kuidut)", "Pölyn koostumus (geeliteippi)", "Pyyhintäpöly", "VOC, pintaemissio (FLEC)"]],
    ["Muu", ["Muu näyte"]]
  ];
  const NAYTE_ETULIITE = {
    "Mikrobi, materiaali": "MIK", "VOC, materiaali (mikrokammio)": "VOC", "Asbesti, materiaali": "AS", "PAH, materiaali": "PAH", "PCB, materiaali": "PCB",
    "Klooratut parafiinit, materiaali": "CP", "Ftalaatit ja TXIB, materiaali": "FT", "Mikrobi, ilma (Andersen)": "MIKI", "VOC, ilma (Tenax)": "VOCI",
    "Formaldehydi, ilma": "FA", "Kloorianisolit, ilma": "KA", "PAH, ilma": "PAHI", "Asbesti, ilma": "ASI", "Laskeumapöly (kuidut)": "LAS",
    "Pölyn koostumus (geeliteippi)": "GT", "Pyyhintäpöly": "PY", "VOC, pintaemissio (FLEC)": "FLEC", "Muu näyte": "N"
  };
  // Sanelusta näytetyyppi: tarkempi ilmaus ensin ("mikrobi-ilmanäyte" ennen "mikrobi")
  const NAYTE_OW = [
    ["mikrobi ilma", "Mikrobi, ilma (Andersen)"], ["mikrobi-ilma", "Mikrobi, ilma (Andersen)"], ["mikrobiilma", "Mikrobi, ilma (Andersen)"], ["andersen", "Mikrobi, ilma (Andersen)"],
    ["voc ilma", "VOC, ilma (Tenax)"], ["voc-ilma", "VOC, ilma (Tenax)"], ["tenax", "VOC, ilma (Tenax)"], ["formaldehy", "Formaldehydi, ilma"], ["kloorianisol", "Kloorianisolit, ilma"],
    ["pah ilma", "PAH, ilma"], ["pah-ilma", "PAH, ilma"], ["asbesti ilma", "Asbesti, ilma"], ["asbesti-ilma", "Asbesti, ilma"], ["asbestikuitu ilma", "Asbesti, ilma"],
    ["flec", "VOC, pintaemissio (FLEC)"], ["pintaemissio", "VOC, pintaemissio (FLEC)"], ["laskeuma", "Laskeumapöly (kuidut)"], ["kuitunäyt", "Laskeumapöly (kuidut)"],
    ["geeliteip", "Pölyn koostumus (geeliteippi)"], ["teippinäyt", "Pölyn koostumus (geeliteippi)"], ["pölyn koostum", "Pölyn koostumus (geeliteippi)"], ["pölynkoostum", "Pölyn koostumus (geeliteippi)"],
    ["pyyhintä", "Pyyhintäpöly"], ["pyyhkäis", "Pyyhintäpöly"], ["mikrokammio", "VOC, materiaali (mikrokammio)"], ["voc materiaali", "VOC, materiaali (mikrokammio)"], ["voc-materiaali", "VOC, materiaali (mikrokammio)"], ["voc", "VOC, materiaali (mikrokammio)"],
    ["asbest", "Asbesti, materiaali"], ["pah", "PAH, materiaali"], ["pcb", "PCB, materiaali"], ["parafiin", "Klooratut parafiinit, materiaali"], ["sccp", "Klooratut parafiinit, materiaali"], ["mccp", "Klooratut parafiinit, materiaali"],
    ["ftalaat", "Ftalaatit ja TXIB, materiaali"], ["txib", "Ftalaatit ja TXIB, materiaali"],
    ["mikrobi", "Mikrobi, materiaali"], ["mikrobinäyt", "Mikrobi, materiaali"], ["homenäyt", "Mikrobi, materiaali"], ["suoraviljel", "Mikrobi, materiaali"], ["mik", "Mikrobi, materiaali"]
  ];

  const OLETUKSET = [
    { id: "aisti", nimi: "Aistinvarainen tarkastelu", lyhyt: "Aistinv.", kentat: [] },
    {
      id: "pintakosteus", nimi: "Pintakosteuskartoitus", lyhyt: "Pintakost.", kentat: [
        { k: "laite", l: "Mittalaite", t: "text", req: true, muista: true },
        { k: "asteikko", l: "Asteikko / yksikkö", t: "select", o: ["Vertailuarvo", "Laitteen asteikko", "% (puu)"], muista: true },
        { k: "arvo", l: "Havaintokohdan lukema", t: "num", req: true, mittaus: true },
        { k: "vertailu", l: "Vertailukohdan lukema", t: "num", req: true, mittaus: true }
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
      /* Näytteenotto: näytetyypit laboratorion (esim. Labroc, FINAS T314) analyysien mukaan.
         Näytetyyppi päättää tyyppikohtaiset kentät ja tunnuksen etuliitteen (MIK1, VOC1, AS1 …).
         Tulos ei ole kentällä pakollinen: näytteen tulos tulee laboratoriosta. */
      id: "nayte", nimi: "Näytteenotto", lyhyt: "Näyte", versio: 2, tulosVapaa: true, kentat: [
        { k: "tyyppi", l: "Näytetyyppi", t: "select", req: true, kaikkialla: true, o: NAYTTEET.flatMap((r) => r[1]),
          ryhmat: NAYTTEET, etuliitteet: NAYTE_ETULIITE, ow: NAYTE_OW },
        { k: "tunnus", l: "Näytteen tunnus", t: "text", req: true },
        { k: "materiaali", l: "Materiaali", t: "text", req: true, kun: { k: "tyyppi", v: NAYTTEET[0][1] } },
        { k: "kohta", l: "Rakenne / näytteenottokohta", t: "text", kun: { k: "tyyppi", v: NAYTTEET[0][1] } },
        { k: "kerain", l: "Keräin / näytteenottoväline", t: "select", muista: true, kun: { k: "tyyppi", v: NAYTTEET[1][1] },
          o: ["Andersen 6-vaihe", "Andersen 1-vaihe", "Tenax-putki", "DNPH-putki", "Suodatin"] ,
          ow: [["andersen 6", "Andersen 6-vaihe"], ["kuusivaih", "Andersen 6-vaihe"], ["andersen 1", "Andersen 1-vaihe"], ["yksivaih", "Andersen 1-vaihe"], ["andersen", "Andersen 6-vaihe"], ["tenax", "Tenax-putki"], ["dnph", "DNPH-putki"], ["suodat", "Suodatin"]], kaikkialla: true },
        { k: "ilmamaara", l: "Ilmamäärä", u: "l", t: "num", kun: { k: "tyyppi", v: NAYTTEET[1][1] } },
        { k: "aika", l: "Näytteenottoaika", u: "min", t: "num", kun: { k: "tyyppi", v: NAYTTEET[1][1] } },
        { k: "ulko", l: "Ulkoilman vertailunäyte", t: "select", o: ["Otettu", "Ei otettu"], kun: { k: "tyyppi", v: ["Mikrobi, ilma (Andersen)"] },
          ow: [["ei ulko", "Ei otettu"], ["ulkoilman vertailu", "Otettu"], ["ulkoilmanäyt", "Otettu"], ["ulkoa", "Otettu"]], kaikkialla: true },
        { k: "pinta", l: "Näytteen pinta / keräyskohta", t: "text", kun: { k: "tyyppi", v: NAYTTEET[2][1] } },
        { k: "keraysaika", l: "Keräysaika", u: "vrk", t: "num", kun: { k: "tyyppi", v: ["Laskeumapöly (kuidut)"] } },
        { k: "lab", l: "Laboratorio", t: "text", muista: true }
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
    /* Märkätilakartoitus: yksi havainto = yksi märkätila (pesuhuone, sauna, erillinen WC, keittiön allaskaappi).
       Tarkistuslista: kentän "kun" näyttää kentän vain tietylle tilatyypille, "okv" on kunnossa-arvo
       (Muut kohdat kunnossa -painike), "ow" valinnan sanelusanat ja "sanat" kentän sanelusanat. */
    {
      id: "mtk", nimi: "Märkätilakartoitus", lyhyt: "Märkätila", versio: 2, lomake: true, laskenta: "asunto", sisaltaa: ["pintakosteus", "aisti"], kentat: [
        { k: "asunto", l: "Asunto", t: "text", req: true, muista: true },
        { k: "mtila", l: "Märkätila", t: "select", req: true, tilasta: true, o: ["Pesuhuone", "Sauna", "Erillinen WC", "Keittiö"],
          ow: [["pesuhuone", "Pesuhuone"], ["kylpyhuone", "Pesuhuone"], ["suihku", "Pesuhuone"], ["sauna", "Sauna"], ["löylyhuone", "Sauna"], ["erillinen wc", "Erillinen WC"], ["vessa", "Erillinen WC"], ["wc", "Erillinen WC"], ["keittiö", "Keittiö"], ["allaskaap", "Keittiö"]] },
        { k: "lattia", l: "Lattiapinnoite", t: "select", o: ["Keraaminen laatta", "Muovimatto", "Vinyylilaatta", "Klinkkeri", "Mikrosementti / pinnoite", "Epoksi- tai massalattia", "Maalattu betoni", "Muu"], kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["lattia", "lattiassa", "lattialla"], ow: [["laatt", "Keraaminen laatta"], ["laato", "Keraaminen laatta"], ["klinkkeri", "Keraaminen laatta"], ["muovimat", "Muovimatto"], ["matto", "Muovimatto"]] },
        { k: "lattia_kl", l: "Lattian kunto", t: "select", o: ["Hyvä", "Välttävä", "Huono"], kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["lattia", "lattian"], ow: [["huono", "Huono"], ["heikko", "Huono"], ["välttäv", "Välttävä"], ["kulunut", "Välttävä"], ["hyvä", "Hyvä"], ["hyvässä", "Hyvä"]] },
        { k: "seina", l: "Seinäpinnoite", t: "select", o: ["Keraaminen laatta", "Muovimatto", "Märkätilatapetti", "Märkätilalevy", "Mikrosementti / pinnoite", "Maalattu rappaus / betoni", "Lasitiili", "Puupaneeli", "Maalattu levy", "Muu"], kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["seinä", "seinät", "seinissä", "seinillä"], ow: [["laatt", "Keraaminen laatta"], ["laato", "Keraaminen laatta"], ["muovimat", "Muovimatto"], ["paneel", "Puupaneeli"], ["maalat", "Maalattu levy"]] },
        { k: "seina_kl", l: "Seinien kunto", t: "select", o: ["Hyvä", "Välttävä", "Huono"], kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["seinä", "seinät", "seinien"], ow: [["huono", "Huono"], ["heikko", "Huono"], ["välttäv", "Välttävä"], ["kulunut", "Välttävä"], ["hyvä", "Hyvä"], ["hyvässä", "Hyvä"]] },
        { k: "katto", l: "Kattopinnoite", t: "select", o: ["Puupaneeli", "Maalattu levy", "Muovipaneeli", "Metallikasetti", "Maalattu betoni", "Märkätilalevy", "Muu"], kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["katto", "katossa", "katon"], ow: [["paneel", "Puupaneeli"], ["maalat", "Maalattu levy"]] },
        { k: "katto_kl", l: "Katon kunto", t: "select", o: ["Hyvä", "Välttävä", "Huono"], kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["katto", "katon"], ow: [["huono", "Huono"], ["heikko", "Huono"], ["välttäv", "Välttävä"], ["kulunut", "Välttävä"], ["hyvä", "Hyvä"], ["hyvässä", "Hyvä"]] },
        { k: "pko_lattia", l: "Lattian pko-arvo (suurin)", t: "num", req: true, mittaus: true,
          sanat: ["lattian pko", "lattia pko", "pko lattia", "lattian pintakosteu", "lattian lukem", "allaskaapin edu", "pko arvo", "pko", "lukema"] },
        { k: "vert_lattia", l: "Lattian vertailuarvo", t: "num", req: true, mittaus: true,
          sanat: ["lattian vertailu", "vertailu lattia", "vertailuarvo", "vertailu", "kuiva alue", "kuivalla alueella"] },
        { k: "pko_seina", l: "Seinien pko-arvo (suurin)", t: "num", mittaus: true, kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["seinän pko", "seinien pko", "seinä pko", "pko seinä", "seinien lukem", "seinästä", "seiniltä"] },
        { k: "vert_seina", l: "Seinien vertailuarvo", t: "num", mittaus: true, kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["seinän vertailu", "seinien vertailu", "vertailu seinä"] },
        { k: "saumat", l: "Saumaukset", t: "select", o: ["Ei puutteita", "Rakoja / puutteita", "Tummentumaa"], okv: "Ei puutteita", kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["sauma", "saumoissa", "saumauk"], ow: [["ei puut", "Ei puutteita"], ["kunnossa", "Ei puutteita"], ["ehj", "Ei puutteita"], ["tumm", "Tummentumaa"], ["mustu", "Tummentumaa"], ["värjäy", "Tummentumaa"], ["rako", "Rakoja / puutteita"], ["raot", "Rakoja / puutteita"], ["rakoja", "Rakoja / puutteita"], ["halke", "Rakoja / puutteita"], ["irto", "Rakoja / puutteita"], ["puut", "Rakoja / puutteita"]] },
        { k: "kaadot", l: "Lattian kaadot", t: "select", o: ["Riittävät", "Vaatimattomat", "Puutteelliset"], okv: "Riittävät", kun: { k: "mtila", v: ["Pesuhuone", "Sauna", "Erillinen WC"] },
          sanat: ["kaado", "kaato", "kallistu"], ow: [["puutteelli", "Puutteelliset"], ["väärä", "Puutteelliset"], ["vastakaat", "Puutteelliset"], ["lammikoi", "Puutteelliset"], ["riittämättöm", "Puutteelliset"], ["vaatimatto", "Vaatimattomat"], ["loiv", "Vaatimattomat"], ["riittäv", "Riittävät"], ["hyvät", "Riittävät"], ["kunnossa", "Riittävät"]] },
        { k: "kynnys", l: "Tulvakynnys", t: "select", o: ["Riittävän korkea", "Liian matala", "Puuttuu"], okv: "Riittävän korkea", kun: { k: "mtila", v: ["Pesuhuone", "Erillinen WC"] },
          sanat: ["kynny", "tulvakynny"], ow: [["ei kynny", "Puuttuu"], ["ei tulvakynny", "Puuttuu"], ["puuttu", "Puuttuu"], ["ei ole", "Puuttuu"], ["matal", "Liian matala"], ["riittäv", "Riittävän korkea"], ["korkea", "Riittävän korkea"], ["kunnossa", "Riittävän korkea"]] },
        { k: "kaivo", l: "Lattiakaivo", t: "select", o: ["Ei puutteita", "Puutteita"], okv: "Ei puutteita", kun: { k: "mtila", v: ["Pesuhuone", "Erillinen WC"] },
          sanat: ["kaivo", "lattiakaivo", "kaivossa"], ow: [["ei puut", "Ei puutteita"], ["ei havaittu puut", "Ei puutteita"], ["kunnossa", "Ei puutteita"], ["puhdas", "Ei puutteita"], ["puut", "Puutteita"], ["likai", "Puutteita"], ["ruost", "Puutteita"], ["irti", "Puutteita"], ["vuo", "Puutteita"]] },
        { k: "wc", l: "WC-istuin", t: "select", o: ["Alkuperäinen, kunnossa", "Uusittu, kunnossa", "Vuotoja"], kun: { k: "mtila", v: ["Pesuhuone", "Erillinen WC"] },
          sanat: ["wc-istuin", "wc istuin", "istuin", "pönttö"], ow: [["vuo", "Vuotoja"], ["uusi", "Uusittu, kunnossa"], ["vaihdettu", "Uusittu, kunnossa"], ["alkuper", "Alkuperäinen, kunnossa"], ["vanha", "Alkuperäinen, kunnossa"]] },
        { k: "allas", l: "Allas ja hana", t: "select", o: ["Alkuperäinen, kunnossa", "Uusittu, kunnossa", "Vuotoja"], kun: { k: "mtila", v: ["Pesuhuone", "Erillinen WC"] },
          sanat: ["allas", "altaa", "pesuallas", "hana", "sekoitin"], ow: [["vuo", "Vuotoja"], ["tippu", "Vuotoja"], ["uusi", "Uusittu, kunnossa"], ["vaihdettu", "Uusittu, kunnossa"], ["alkuper", "Alkuperäinen, kunnossa"], ["vanha", "Alkuperäinen, kunnossa"]] },
        { k: "viemari", l: "Viemärikalusteet", t: "select", o: ["Ei puutteita", "Silikonisaumaus puuttuu WC-istuimen juurelta", "Kiinnitysruuvien suojatulpat puuttuvat", "Muita puutteita"], okv: "Ei puutteita", kun: { k: "mtila", v: ["Pesuhuone", "Erillinen WC"] },
          sanat: ["viemäri", "silikon", "tulpa", "suojatulp", "juure"], ow: [["ei puut", "Ei puutteita"], ["kunnossa", "Ei puutteita"], ["silikon", "Silikonisaumaus puuttuu WC-istuimen juurelta"], ["tulp", "Kiinnitysruuvien suojatulpat puuttuvat"], ["puut", "Muita puutteita"]] },
        { k: "kiinto", l: "Kiintokalusteet", t: "select", o: ["Ei vaurioita", "Vaurioita"], okv: "Ei vaurioita", kun: { k: "mtila", v: ["Pesuhuone", "Erillinen WC"] },
          sanat: ["kiintokaluste", "kaapisto", "kaapi", "peilikaap"], ow: [["ei vauri", "Ei vaurioita"], ["kunnossa", "Ei vaurioita"], ["ehj", "Ei vaurioita"], ["vauri", "Vaurioita"], ["turvon", "Vaurioita"], ["rikki", "Vaurioita"]] },
        { k: "allaskaappi", l: "Allaskaappi", t: "select", o: ["Ei puutteita", "Vesivuotojälkiä", "Putkien kannakointi puutteellinen", "Viemärin liitos epätiivis"], okv: "Ei puutteita", kun: { k: "mtila", v: ["Keittiö"] },
          sanat: ["allaskaap", "altaan alla", "tiskipöy"], ow: [["ei puut", "Ei puutteita"], ["kunnossa", "Ei puutteita"], ["kuiva", "Ei puutteita"], ["vuoto", "Vesivuotojälkiä"], ["vesivuo", "Vesivuotojälkiä"], ["kosteusvauri", "Vesivuotojälkiä"], ["kosteusjälk", "Vesivuotojälkiä"], ["kannak", "Putkien kannakointi puutteellinen"], ["heilu", "Putkien kannakointi puutteellinen"], ["epätiivi", "Viemärin liitos epätiivis"], ["liitos", "Viemärin liitos epätiivis"]] },
        { k: "kaukalo_apk", l: "Astianpesukoneen tulvakaukalo", t: "select", o: ["Kyllä", "Ei"], okv: "Kyllä", kun: { k: "mtila", v: ["Keittiö"] },
          sanat: ["astianpesukone", "apk"], ow: [["ei", "Ei"], ["puuttu", "Ei"], ["kaukalo", "Kyllä"], ["on", "Kyllä"]] },
        { k: "kaukalo_jk", l: "Jääkaapin tulvakaukalo", t: "select", o: ["Kyllä", "Ei"], okv: "Kyllä", kun: { k: "mtila", v: ["Keittiö"] },
          sanat: ["jääkaap"], ow: [["ei", "Ei"], ["puuttu", "Ei"], ["kaukalo", "Kyllä"], ["on", "Kyllä"]] },
        { k: "kaatumaeste", l: "Lieden kaatumaeste", t: "select", o: ["Kyllä", "Ei"], okv: "Kyllä", kun: { k: "mtila", v: ["Keittiö"] },
          sanat: ["kaatumaest", "kaatumaraut", "liesi", "liedes", "lieden"], ow: [["ei", "Ei"], ["puuttu", "Ei"], ["on", "Kyllä"], ["kaatumaest", "Kyllä"], ["kaatumaraut", "Kyllä"]] }
      ]
    },
    // Olosuhdeseuranta on kohteen yhteinen mittaus: mittalaitteet kirjataan Olosuhdeseuranta-näkymässä, ei havaintoina.
    { id: "seuranta", nimi: "Olosuhdeseuranta", lyhyt: "Seuranta", seuranta: true, kohdetaso: true, kentat: [] },
    // Kuntoarvio: rakennusosien kuntoluokat ja käyttöiät kirjataan Kuntoarvio-näkymässä; havainnot liitetään osiin.
    { id: "kuntoarvio", nimi: "Kuntoarvio", lyhyt: "KA", kuntoarvio: true, kohdetaso: true, kentat: [] },
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
          // Vanhat oletusnimet, joissa pilkku sekoitti puutelistan ("arvo, havaintokohta, arvo, vertailukohta")
          const RENAME = { "Arvo, havaintokohta": "Havaintokohdan lukema", "Arvo, vertailukohta": "Vertailukohdan lukema" };
          M.MENETELMAT.forEach((m) => (m.kentat || []).forEach((f) => { if (RENAME[f.l]) { f.l = RENAME[f.l]; muuttui = true; } }));
          // Uudet oletusmenetelmät (esim. olosuhdeseuranta) lisätään aiempaan asennukseen
          OLETUKSET.filter((o) => (o.kohdetaso || o.lomake) && !M.MENETELMAT.some((m) => m.id === o.id)).forEach((o) => {
            const i = M.MENETELMAT.findIndex((m) => m.id === "muu");
            M.MENETELMAT.splice(i >= 0 ? i : M.MENETELMAT.length, 0, clone(o)); muuttui = true;
          });
          if (muuttui) await M.save();
        }
      } catch (e) { console.warn("Menetelmien lataus epäonnistui", e); }
    },
    /* Havainnoille valittavat menetelmät (olosuhdeseuranta ei ole havainto) */
    havaintoMenetelmat() { return M.MENETELMAT.filter((m) => !m.piilotettu && !m.seuranta && !m.kohdetaso); },
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
    /* Kenttä näkyy, kun sen ehto täyttyy (esim. tulvakynnys vain pesuhuoneelle ja WC:lle) */
    /* Onko kohteessa asuntoja? Omakotitalossa Asunto-kenttää ei kysytä. Tutkijan valinta (kohde.asuntoja)
       voittaa; muuten päätellään kuntoarvion perustiedoista. Tuntematon = kysytään. */
    eiAsuntoja(k) {
      if (!k) return false;
      if (k.asuntoja === false) return true;
      if (k.asuntoja === true) return false;
      const pt = (k.kuntoarvio && k.kuntoarvio.perustiedot) || {};
      return String(pt.huoneistoja || "").trim() === "1" || /omakoti|pientalo|erillistalo|vapaa-ajan|mökki/i.test(pt.rakennustyyppi || "");
    },
    nakyy(h, f) {
      if (f.k === "asunto" && window.App && M.eiAsuntoja(App.S.kohde)) return false;
      return !f.kun || (f.kun.v || []).includes(h.kentat && h.kentat[f.kun.k]);
    },
    kentat(h) { return M.menetelma(h.menetelma).kentat.filter((f) => M.nakyy(h, f)); },
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
