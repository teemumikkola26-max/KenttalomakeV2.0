/* =========================================================================
   methods.js – menetelmät, niiden kentät ja vakiolistat
   Menetelmät tallennetaan laitteelle (IndexedDB, asetukset/menetelmat).
   Oletukset kootaan tiedostosta js/menetelmat-data.js (generoitu Menetelmät ja
   kalusto -taulukosta) ja tämän tiedoston käsin kirjoitetuista osista
   (märkätilakartoitus, RH-taulukot, sanelun valintasanat).

   Kenttä: { k: avain, l: otsikko,
             t: "text"|"textarea"|"num"|"date"|"select"|"table"|"time"|"multi"|"calc",
             u: yksikkö, o: vaihtoehdot (select, multi),
             req: pakollinen ennen vientiä,
             mittaus: mittaustulos, vaatii vahvistuksen,
             muista: edellinen arvo ehdotetaan seuraavaan havaintoon,
             oletus: arvo, joka täyttyy, jos muistettua arvoa ei ole (esim. halkaisija 48 mm),
             ph: esimerkki kentän sisällä (placeholder),
             kun: { k, v[] } kenttä näkyy vain, kun toisella kentällä on jokin arvoista,
             okv: tarkistuslistan kunnossa-arvo, ow: valinnan sanelusanat, sanat: kentän sanelusanat,
             koodi: tunniste (putken, pumpun tai keräimen numero) sanelusta numeroineen,
             kaava: laskettava arvo (t: "calc") tai laske: numerokenttä lasketaan muista (esim. kesto) }
     time: kellonaika (hh:mm); multi: monivalinta, arvo "M2; DG18"; calc: sovellus laskee, ei kirjoiteta.
     Samalla avaimella voi olla useita kenttiä, kun niiden kun-ehdot sulkevat toisensa
     (näytetyypin mukaan eri otsikko tai vaihtoehdot).
   Taulukko (t: "table"): rivit tallentuvat havainnon kenttään taulukkona.
     sarakkeet: [{ k, l, t: "num"|"text"|"date", u, mittaus, ryhma, req }]
     ocr: { laite: "vaisala", RH: sarake, T: sarake, a: sarake } kameraluku mittarin näytöltä
   Menetelmä: { id, nimi, lyhyt, kentat: [...], piilotettu, versio,
                taso: "kohta"|"tila"|"kohde", ali: tyypilliset alimenetelmät ("*" = kaikki) }
   versio: oletusmenetelmän versio; suurempi versio korvaa laitteelle tallennetun.
   OLETUSVERSIO: kun se kasvaa, puuttuvat uudet oletusmenetelmät lisätään aiempaan asennukseen.
   ========================================================================= */
(function () {
  "use strict";

  const D = window.MENETELMA_DATA || { menetelmat: [], naytetyypit: [], naytekentat: { yhteiset: [], tyyppikohtaiset: [] }, kalusto: {} };
  const OLETUSVERSIO = 41;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------- Näytetyypit (Labrocin näytteenotto-ohjeiden mukaan) ---------- */
  const NAYTETIEDOT = {};
  D.naytetyypit.forEach((t) => { NAYTETIEDOT[t.nimi] = t; });
  NAYTETIEDOT["Muu näyte"] = { nimi: "Muu näyte", ryhma: "Muu", kn: "", muistutus: "", kalusto: [] };
  const NAYTTEET = [];
  D.naytetyypit.concat([NAYTETIEDOT["Muu näyte"]]).forEach((t) => {
    let g = NAYTTEET.find((r) => r[0] === t.ryhma);
    if (!g) NAYTTEET.push(g = [t.ryhma, []]);
    g[1].push(t.nimi);
  });
  // Tunnuksen etuliite näytetyypin mukaan (AS1, VOCI1, MIK1 …)
  const NAYTE_ETULIITE = {
    "Asbesti, materiaali": "AS", "Asbesti, ilma": "ASI", "PAH, materiaali": "PAH", "PCB, materiaali": "PCB",
    "POP-yhdisteet / klooratut parafiinit, materiaali": "CP", "Ftalaatit ja TXIB, materiaali": "FT", "Raskasmetallit / lyijy, materiaali": "PB",
    "Laskeumapöly, mineraalikuidut (geeliteippi)": "LAS", "Kanavapöly, mineraalikuidut (geeliteippi)": "KAN", "Pölykertymä (geeliteippi, mittauslaite)": "PK",
    "Pölynkoostumus (pyyhintä)": "PY", "Kvartsi, ilma (alveolijae)": "KV", "Pölyn määrä, IOM-keräin": "IOM",
    "Mikrobi, materiaali": "MIK", "Mikrobi, ilma (6-vaihekeräin)": "MIKI", "Mikrobi, ilma qPCR (Button-keräin)": "BUT", "Mikrobi, pinta (viljely)": "MIKP",
    "Mikrobi, pinta qPCR": "QP", "Mikrobi, laskeumapöly": "MIKL", "VOC, ilma (Tenax)": "VOCI", "VOC, materiaali": "VOC", "VOC, pintaemissio (FLEC)": "FLEC",
    "Formaldehydi, ilma (DNPH / Sep-Pak)": "FA", "Formaldehydi, materiaali": "FAM", "Kloorianisolit, ilma (Tenax)": "KA", "Kloorianisolit, materiaali": "KAM",
    "PAH, ilma (OVS-XAD-2)": "PAHI", "Isosyanaatit, ilma (EHS-NCO)": "NCO", "Betoni, ohuthie (ja karbonatisoituminen)": "BOH", "Betoni, kloridipitoisuus": "BKL",
    "Betoni, puristus- tai vetolujuus": "BLU", "Purkumateriaali (betoni- / tiilimurske)": "PUR", "Muu näyte": "N"
  };
  // Versiota 40 vanhemmat näytetyyppien nimet: havainnot muunnetaan uusiin nimiin kohdetta avattaessa
  const NAYTE_VANHAT = {
    "VOC, materiaali (mikrokammio)": "VOC, materiaali", "Klooratut parafiinit, materiaali": "POP-yhdisteet / klooratut parafiinit, materiaali",
    "Mikrobi, ilma (Andersen)": "Mikrobi, ilma (6-vaihekeräin)", "Formaldehydi, ilma": "Formaldehydi, ilma (DNPH / Sep-Pak)",
    "Kloorianisolit, ilma": "Kloorianisolit, ilma (Tenax)", "PAH, ilma": "PAH, ilma (OVS-XAD-2)", "Laskeumapöly (kuidut)": "Laskeumapöly, mineraalikuidut (geeliteippi)",
    "Pölyn koostumus (geeliteippi)": "Pölykertymä (geeliteippi, mittauslaite)", "Pyyhintäpöly": "Pölynkoostumus (pyyhintä)"
  };
  // Sanelusta näytetyyppi: tarkempi ilmaus ensin ("mikrobi-ilmanäyte" ennen "mikrobi")
  const NAYTE_OW = [
    ["button", "Mikrobi, ilma qPCR (Button-keräin)"], ["qpcr ilma", "Mikrobi, ilma qPCR (Button-keräin)"], ["pinta qpcr", "Mikrobi, pinta qPCR"], ["qpcr", "Mikrobi, pinta qPCR"],
    ["mikrobi ilma", "Mikrobi, ilma (6-vaihekeräin)"], ["mikrobi-ilma", "Mikrobi, ilma (6-vaihekeräin)"], ["mikrobiilma", "Mikrobi, ilma (6-vaihekeräin)"], ["andersen", "Mikrobi, ilma (6-vaihekeräin)"], ["kuusivaih", "Mikrobi, ilma (6-vaihekeräin)"], ["6-vaih", "Mikrobi, ilma (6-vaihekeräin)"],
    ["mikrobi pinta", "Mikrobi, pinta (viljely)"], ["mikrobipinta", "Mikrobi, pinta (viljely)"], ["sivelynäyt", "Mikrobi, pinta (viljely)"], ["sivelyn", "Mikrobi, pinta (viljely)"], ["mikrobi laskeuma", "Mikrobi, laskeumapöly"], ["mikrobilaskeuma", "Mikrobi, laskeumapöly"],
    ["voc ilma", "VOC, ilma (Tenax)"], ["voc-ilma", "VOC, ilma (Tenax)"], ["vociilma", "VOC, ilma (Tenax)"], ["kloorianisoli ilma", "Kloorianisolit, ilma (Tenax)"], ["kloorianisoli-ilma", "Kloorianisolit, ilma (Tenax)"], ["kloorianisolimateriaal", "Kloorianisolit, materiaali"], ["kloorianisolit materiaal", "Kloorianisolit, materiaali"], ["kloorianisol", "Kloorianisolit, ilma (Tenax)"], ["tenax", "VOC, ilma (Tenax)"],
    ["formaldehydi materiaal", "Formaldehydi, materiaali"], ["formaldehydimateriaal", "Formaldehydi, materiaali"], ["formaldehy", "Formaldehydi, ilma (DNPH / Sep-Pak)"], ["dnph", "Formaldehydi, ilma (DNPH / Sep-Pak)"],
    ["pah ilma", "PAH, ilma (OVS-XAD-2)"], ["pah-ilma", "PAH, ilma (OVS-XAD-2)"], ["isosyanaat", "Isosyanaatit, ilma (EHS-NCO)"], ["asbesti ilma", "Asbesti, ilma"], ["asbesti-ilma", "Asbesti, ilma"], ["asbestikuitu ilma", "Asbesti, ilma"],
    ["kvartsi", "Kvartsi, ilma (alveolijae)"], ["alveoli", "Kvartsi, ilma (alveolijae)"], ["iom", "Pölyn määrä, IOM-keräin"], ["pölyn määr", "Pölyn määrä, IOM-keräin"],
    ["flec", "VOC, pintaemissio (FLEC)"], ["pintaemissio", "VOC, pintaemissio (FLEC)"], ["kanavapöly", "Kanavapöly, mineraalikuidut (geeliteippi)"], ["kanavasta", "Kanavapöly, mineraalikuidut (geeliteippi)"],
    ["laskeuma", "Laskeumapöly, mineraalikuidut (geeliteippi)"], ["kuitunäyt", "Laskeumapöly, mineraalikuidut (geeliteippi)"], ["pölykertym", "Pölykertymä (geeliteippi, mittauslaite)"], ["pölypeitto", "Pölykertymä (geeliteippi, mittauslaite)"], ["geeliteip", "Pölykertymä (geeliteippi, mittauslaite)"],
    ["pyyhintä", "Pölynkoostumus (pyyhintä)"], ["pyyhkäis", "Pölynkoostumus (pyyhintä)"], ["pölyn koostum", "Pölynkoostumus (pyyhintä)"], ["pölynkoostum", "Pölynkoostumus (pyyhintä)"],
    ["mikrokammio", "VOC, materiaali"], ["voc materiaali", "VOC, materiaali"], ["voc-materiaali", "VOC, materiaali"], ["voc", "VOC, materiaali"],
    ["ohuthie", "Betoni, ohuthie (ja karbonatisoituminen)"], ["karbonati", "Betoni, ohuthie (ja karbonatisoituminen)"], ["kloridi", "Betoni, kloridipitoisuus"], ["puristuslujuu", "Betoni, puristus- tai vetolujuus"], ["porakappale", "Betoni, puristus- tai vetolujuus"],
    ["purkumateriaal", "Purkumateriaali (betoni- / tiilimurske)"], ["murske", "Purkumateriaali (betoni- / tiilimurske)"],
    ["asbest", "Asbesti, materiaali"], ["pah", "PAH, materiaali"], ["pcb", "PCB, materiaali"], ["parafiin", "POP-yhdisteet / klooratut parafiinit, materiaali"], ["sccp", "POP-yhdisteet / klooratut parafiinit, materiaali"], ["mccp", "POP-yhdisteet / klooratut parafiinit, materiaali"], ["pop-yhdist", "POP-yhdisteet / klooratut parafiinit, materiaali"],
    ["ftalaat", "Ftalaatit ja TXIB, materiaali"], ["txib", "Ftalaatit ja TXIB, materiaali"], ["lyijy", "Raskasmetallit / lyijy, materiaali"], ["raskasmetall", "Raskasmetallit / lyijy, materiaali"],
    ["mikrobi", "Mikrobi, materiaali"], ["mikrobinäyt", "Mikrobi, materiaali"], ["homenäyt", "Mikrobi, materiaali"], ["suoraviljel", "Mikrobi, materiaali"], ["mik", "Mikrobi, materiaali"]
  ];

  /* ---------- Käsin kirjoitetut osat ---------- */
  const RH_TAULUKOT = {
    mittaukset: {
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
    olosuhteet: {
      k: "olosuhteet", l: "Ympäröivät olosuhteet", t: "table",
      sarakkeet: [
        { k: "rh", l: "RH", u: "%", t: "num", mittaus: true, req: true },
        { k: "t", l: "T", u: "°C", t: "num", mittaus: true, req: true },
        { k: "a", l: "a", u: "g/m³", t: "num", mittaus: true },
        { k: "pvm", l: "Lukupäivä", t: "date", req: true }
      ],
      ocr: { laite: "vaisala", RH: "rh", T: "t", a: "a" }
    }
  };

  /* Märkätilakartoitus: yksi havainto = yksi märkätila (pesuhuone, sauna, erillinen WC, keittiön allaskaappi).
     Tarkistuslista: kentän "kun" näyttää kentän vain tietylle tilatyypille, "okv" on kunnossa-arvo
     (Muut kohdat kunnossa -painike), "ow" valinnan sanelusanat ja "sanat" kentän sanelusanat. */
  const MTK_KENTAT = [
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
  ];

  /* Menetelmäkohtaiset lisätiedot, joita taulukossa ei ole */
  const VERSIOT = { pintakosteus: 2, rh: 4, nayte: 4, merkkiaine: 2, lampokuvaus: 2, paine: 2, mtk: 2, asuntokauppa: 2 };
  const MENETELMA_LISA = {
    nayte: { tulosVapaa: true },
    mtk: { lomake: true, laskenta: "asunto", sisaltaa: ["pintakosteus", "aisti"] },
    seuranta: { seuranta: true, kohdetaso: true },
    kuntoarvio: { kuntoarvio: true, kohdetaso: true },
    asuntokauppa: { akk: true, kohdetaso: true },
    vss: { lomake: true }
  };
  const TARKISTUS_OW = [["korjaustarv", "Korjaustarve"], ["korjattava", "Korjaustarve"], ["korjausta", "Korjaustarve"], ["vika", "Korjaustarve"], ["rikki", "Korjaustarve"],
    ["puuttu", "Puuttuu"], ["ei ole", "Puuttuu"], ["ei koske", "Ei koske"], ["ei sovellu", "Ei koske"], ["kunnossa", "Kunnossa"], ["toimii", "Kunnossa"]];
  const KOODI = (sanat) => ({ koodi: true, sanat });
  const AIKA_ALKU = ["aloitusaika", "aloitettiin", "aloitus", "alkoi", "käynnistettiin", "käynnisty", "alku"];
  const AIKA_LOPPU = ["lopetusaika", "lopetettiin", "lopetus", "loppui", "päättyi", "pysäytettiin", "pysäytys", "loppu"];
  /* Kenttäkohtaiset lisätiedot: sanelusanat (sanat), valintojen sanelusanat (ow) ja muut */
  const KENTTA_LISA = {
    "rh.tapa": { ow: [["porarei", "Porareikä"], ["näytepal", "Näytepala"]], kaikkialla: true },
    "rh.rakenne": { sanat: ["rakenne", "rakenteena", "rakenne mittauspisteen"] },
    "merkkiaine.luokka": { kaikkialla: true, ow: [["ei merkkiainevuoto", "Ei vuotoa"], ["ei vuoto", "Ei vuotoa"], ["vuotoa ei", "Ei vuotoa"], ["pistemäi", "Pistemäinen ilmavuoto"], ["vähäi", "Vähäinen ilmavuoto"], ["merkittäv", "Merkittävä ilmavuoto"]] },
    "lampokuvaus.vaihe": { kaikkialla: true, ow: [["alipaineist", "Alipaineistettuna"], ["normaali", "Normaali käyttötilanne"], ["käyttötilan", "Normaali käyttötilanne"]] },
    "lampokuvaus.rh": { sanat: ["suhteellinen kosteus", "kosteus", "rh"] },
    "ilmamaara.laite": { kaikkialla: true, ow: [["paine-eromit", "Paine-eromittari"], ["paine-erolla", "Paine-eromittari"], ["siipipyör", "Siipipyöräanemometri"], ["anemometr", "Siipipyöräanemometri"]] },
    "ilmamaara.suunta": { kaikkialla: true, ow: [["tuloilma", "Tulo"], ["poistoilma", "Poisto"], ["tulo", "Tulo"], ["poisto", "Poisto"]] },
    "ilmamaara.mitattu": { sanat: ["mitattu", "ilmamäärä", "mittasi", "mitattiin"] },
    "ilmamaara.suunniteltu": { sanat: ["suunniteltu", "suunnitteluarvo", "mitoitus"] },
    "tiiviys.q50": { sanat: ["q50", "ilmanvuotoluku"] }, "tiiviys.n50": { sanat: ["n50", "ilmanvaihtuvuus"] },
    "tiiviys.lattiaala": { sanat: ["lattiapinta-ala", "lattiapinta", "lattia-ala", "pinta-ala"] }, "tiiviys.vaippa": { sanat: ["vaipan ala", "vaippa", "vaipan"] }, "tiiviys.tilavuus": { sanat: ["ilmatilavuus", "tilavuus"] },
    "sisailma.t": { sanat: ["lämpötila", "lämpöä"] }, "sisailma.rh": { sanat: ["suhteellinen kosteus", "kosteus", "rh"] }, "sisailma.co2": { sanat: ["hiilidioksidi", "co2"] },
    "puukosteus.arvo": { sanat: ["kosteuspitoisuus", "puun kosteus", "lukema", "kosteus"] },
    "kalvopaksuus.mitattu": { sanat: ["mitattu", "kalvopaksuus", "paksuus"] }, "kalvopaksuus.vaatimus": { sanat: ["vaatimus", "valmistajan vaatimus"] },
    "viilto.tasaantuminen": { sanat: ["tasaantumisaika", "tasaantui", "tasaantumis"] }, "viilto.rh": { sanat: ["suhteellinen kosteus", "kosteus", "rh"] }, "viilto.t": { sanat: ["lämpötila", "lämpöä"] },
    "hetkkost.kohta": { kaikkialla: true, ow: [["eristeta", "Eristetaso"], ["eristetila", "Eristetaso"], ["eristee", "Eristetaso"], ["porarei", "Porareikä"]] },
    "hetkkost.rh": { sanat: ["suhteellinen kosteus", "kosteus", "rh"] }, "hetkkost.t": { sanat: ["lämpötila", "lämpöä"] },
    "melu.laeq": { sanat: ["laeq", "äänitaso", "melutaso"] }, "melu.kesto": { sanat: ["kesto", "mittausaika", "kesti"] },
    "melu.tausta": { kaikkialla: true, ow: [["ei voitu analysoi", "Ei voitu analysoida"], ["taustamelu analysoi", "Analysoitu"]] },
    "radon_purkki.purkki": KOODI(["radonpurk", "purkki", "purkin"]),
    "radon_jatkuva.max": { sanat: ["korkein", "huippu", "maksimi"] }, "radon_jatkuva.ka": { sanat: ["keskiarvo", "keskimäärin"] },
    "vss.putoaminen": { sanat: ["putoamisaika", "paineen putoamis", "putosi"] }, "vss.paine": { sanat: ["koepaine", "paine"] },
    "vss.tiivis": { kaikkialla: true, ow: [["ei tiivis", "Ei"], ["epätiivis", "Ei"], ["vuotaa", "Ei"], ["tiivis", "Kyllä"]] },
    "vetokoe.halkaisija": { sanat: ["halkaisija", "halkaisijaltaan"] }, "vetokoe.kuorma": { sanat: ["murtokuorma", "kuorma", "murtui kuormalla"] },
    "vetokoe.lujuus": { kaava: "vetolujuus" },
    "vetokoe.murtotapa": { kaikkialla: true, ow: [["adheesio", "Adheesiomurtuma"], ["koheesio", "Koheesiomurtuma"], ["liimauks", "Osittain liimauksesta"], ["liimasta", "Osittain liimauksesta"]] },
    "pid.kohta": { kaikkialla: true, ow: [["huoneilma", "Huoneilma"], ["porarei", "Porareikä"], ["rako", "Pinta tai rako"], ["pinnasta", "Pinta tai rako"]] },
    "pid.lukema": { sanat: ["lukema", "pid", "näytti"] }, "pid.tausta": { sanat: ["taustataso", "tausta", "huoneilma"] },
    "savukoe.tarkoitus": { kaikkialla: true, ow: [["vaihtuvuu", "Ilman vaihtuvuus"], ["leviä", "Ilman leviäminen"], ["epätiiv", "Epätiiveyskohdat"], ["vuotokoh", "Epätiiveyskohdat"]] }
  };
  const NAYTE_LISA = {
    putki: KOODI(["näyteputk", "putken numero", "putki"]), kn: KOODI(["kenttänolla", "nollaputk", "nollakeräi", "kn"]), pumppu: KOODI(["pumppu", "pumpun", "pumpulla"]),
    kerain: KOODI(["keräimen numero", "keräin", "keräimen"]), putki_sis: KOODI(["sisääntuloputk"]), putket: KOODI(["näytteenottoputk", "putket"]), putket_tuul: KOODI(["tuuletuksen putk", "tuuletusputk"]),
    pumput: KOODI(["pumppujen koodit", "pumput"]), alku: { sanat: AIKA_ALKU }, loppu: { sanat: AIKA_LOPPU }, kesto: { laske: "kesto", sanat: ["näytteenottoaika", "kesto", "kesti", "run time"] },
    ilmamaara: { sanat: ["ilmamäärä", "näytteen koko", "litraa"] }, virtaus: { sanat: ["virtaus", "virtausnopeus"] },
    alusta: { ow: [["m2", "M2"], ["dg18", "DG18"], ["dg 18", "DG18"], ["thg", "THG"]], kaikkialla: true },
    suodatin: { ow: [["25 mm", "Ø 25 mm"], ["25 millin", "Ø 25 mm"], ["37 mm", "Ø 37 mm"], ["37 millin", "Ø 37 mm"]], kaikkialla: true },
    ulko: { ow: [["ei ulko", "Ei otettu"], ["ulkoilman vertailu", "Otettu"], ["ulkoilmanäyt", "Otettu"], ["ulkoa", "Otettu"]], kaikkialla: true },
    laji: { ow: [["nollanäyt", "Nollanäyte"]], kaikkialla: true }
  };
  const lisaa = (f, l) => (l ? Object.assign(f, clone(l)) : f);

  function naytekentat() {
    const y = D.naytekentat.yhteiset, tyyppi = y.find((f) => f.k === "tyyppi") || { k: "tyyppi", l: "Näytetyyppi", t: "select", req: true };
    const out = [Object.assign({}, tyyppi, { t: "select", o: NAYTTEET.flatMap((r) => r[1]), ryhmat: NAYTTEET, etuliitteet: NAYTE_ETULIITE, ow: NAYTE_OW, kaikkialla: true })];
    const tunnus = y.find((f) => f.k === "tunnus"); if (tunnus) out.push(clone(tunnus));
    D.naytekentat.tyyppikohtaiset.forEach((f) => {
      const g = lisaa(clone(f), NAYTE_LISA[f.k]);
      // Muu näyte: materiaali, rakenne ja avaus kuten materiaalinäytteissä
      if (["materiaali", "rakenne", "avaus"].includes(g.k) && g.kun.v.includes("Mikrobi, materiaali")) g.kun.v.push("Muu näyte");
      out.push(g);
    });
    y.filter((f) => f.k !== "tunnus" && f.k !== "tyyppi").forEach((f) => out.push(clone(f)));
    return out;
  }
  const stemWords = (l) => String(l).toLowerCase().split(/[\s/,()–-]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(4, w.length - 2)));

  /* Tarkistuslistan rivin sanelusanat otsikosta: vaihtoehdot ("Sulkuteltta/huone", "Ovet ja luukut") erikseen,
     kaksi ensimmäistä sanaa yhdessä ("ylipainemitta&nestemää": Ylipainemittari ≠ Ylipainemittarin nestemäärä) */
  const tarkistusSanat = (l) => {
    const alts = String(l).replace(/\([^)]*\)/g, " ").split(/\/| ja /).map((a) => stemWords(a).slice(0, 2).join("&")).filter(Boolean);
    // lyhyt yksittäinen sana (huone, vesi, toiminta) ei yksin riitä
    const keep = alts.filter((w, i) => w.includes("&") || w.length >= (i === 0 ? 5 : 7));
    return keep.length ? keep : alts.slice(0, 1);
  };
  const OLETUKSET = D.menetelmat.map((d) => {
    const m = { id: d.id, nimi: d.nimi, lyhyt: d.lyhyt, taso: d.taso, ali: d.ali.slice(), kentat: [] };
    if (VERSIOT[d.id]) m.versio = VERSIOT[d.id];
    Object.assign(m, clone(MENETELMA_LISA[d.id] || {}));
    if (d.id === "mtk") m.kentat = clone(MTK_KENTAT);
    else if (d.id === "nayte") m.kentat = naytekentat();
    else m.kentat = d.kentat.map((f) => {
      if (f.taulukko) return clone(RH_TAULUKOT[f.k]);
      const g = lisaa(clone(f), KENTTA_LISA[d.id + "." + f.k]);
      if (g.tarkistus) { g.ow = TARKISTUS_OW; g.sanat = tarkistusSanat(g.l); delete g.tarkistus; }
      return g;
    }).filter(Boolean);
    return m;
  });
  // Muu menetelmä viimeiseksi
  const iMuu = OLETUKSET.findIndex((m) => m.id === "muu");
  if (iMuu >= 0) OLETUKSET.push(OLETUKSET.splice(iMuu, 1)[0]);
  const OLETUS = (id) => OLETUKSET.find((m) => m.id === id);

  const KENTTATYYPIT = [
    { v: "text", l: "Teksti (lyhyt)" },
    { v: "textarea", l: "Teksti (pitkä)" },
    { v: "num", l: "Numero" },
    { v: "date", l: "Päivämäärä" },
    { v: "select", l: "Valintalista" },
    { v: "multi", l: "Monivalinta" },
    { v: "time", l: "Kellonaika" },
    { v: "table", l: "Taulukko (useita mittauksia)" }
  ];
  /* Laskettavat arvot. Palauttaa merkkijonon (pilkku desimaalina) tai null. */
  const lukuArvo = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".").replace(/\s/g, "")); return isNaN(n) ? null : n; };
  const fi = (n, d) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toString().replace(".", ",");
  const minuutit = (s) => { const m = String(s || "").match(/^(\d{1,2})[:.](\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
  const KAAVAT = {
    // Vetolujuus MPa = murtokuorma N / (π · d² / 4) mm²
    vetolujuus: { selite: "murtokuorma / (π · halkaisija² / 4)", laske: (v) => { const F = lukuArvo(v.kuorma), d = lukuArvo(v.halkaisija); return F != null && d ? fi(F / (Math.PI * d * d / 4), 2) : null; } },
    // Näytteenottoaika minuutteina aloitus- ja lopetusajasta (yli keskiyön kulkeva aika huomioidaan)
    kesto: { selite: "lopetusaika − aloitusaika", laske: (v) => { const a = minuutit(v.alku), b = minuutit(v.loppu); return a == null || b == null ? null : String(b >= a ? b - a : b + 1440 - a); } }
  };

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
              ["sanat", "etuliite", "piilotettu"].forEach((k) => { if (vanha[k] != null) uusi[k] = vanha[k]; });
              uusi.kentat.forEach((f) => { const v = (vanha.kentat || []).find((x) => x.k === f.k); if (v && v.sanat) f.sanat = v.sanat; });
              M.MENETELMAT[i] = uusi; muuttui = true;
            }
          });
          // Vanhat oletusnimet, joissa pilkku sekoitti puutelistan ("arvo, havaintokohta, arvo, vertailukohta")
          const RENAME = { "Arvo, havaintokohta": "Havaintokohdan lukema", "Arvo, vertailukohta": "Vertailukohdan lukema" };
          M.MENETELMAT.forEach((m) => (m.kentat || []).forEach((f) => { if (RENAME[f.l]) { f.l = RENAME[f.l]; muuttui = true; } }));
          // Uudet oletusmenetelmät lisätään aiempaan asennukseen: kohdetason ja lomakkeet aina,
          // muut kerran, kun oletusversio kasvaa (tutkijan poistama menetelmä ei palaa myöhemmin)
          const uudet = (rec.oletusversio || 0) < OLETUSVERSIO;
          OLETUKSET.filter((o) => (uudet || o.kohdetaso || o.lomake) && !M.MENETELMAT.some((m) => m.id === o.id)).forEach((o) => {
            const i = M.MENETELMAT.findIndex((m) => m.id === "muu");
            M.MENETELMAT.splice(i >= 0 ? i : M.MENETELMAT.length, 0, clone(o)); muuttui = true;
          });
          if (muuttui || uudet) await M.save();
        }
      } catch (e) { console.warn("Menetelmien lataus epäonnistui", e); }
    },
    /* Havainnoille valittavat menetelmät (olosuhdeseuranta ei ole havainto) */
    havaintoMenetelmat() { return M.MENETELMAT.filter((m) => !m.piilotettu && !m.seuranta && !m.kohdetaso); },
    async save() {
      await DB.put("asetukset", { id: "menetelmat", lista: M.MENETELMAT, muokattu: Date.now(), oletusversio: OLETUSVERSIO });
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
    kentat(h) {
      const vis = M.menetelma(h.menetelma).kentat.filter((f) => M.nakyy(h, f));
      // Näytteen kentät näytetyypin omassa järjestyksessä (tyyppi ja tunnus ensin, yhteiset lopussa)
      const t = h.menetelma === "nayte" && h.kentat && NAYTETIEDOT[h.kentat.tyyppi];
      if (!t || !(t.kentat || []).length) return vis;
      const pos = (f) => { const i = t.kentat.indexOf(f.k); return f.k === "tyyppi" ? -2 : f.k === "tunnus" ? -1 : i < 0 || !(f.kun && f.kun.k === "tyyppi") ? 999 : i; };
      return vis.map((f, i) => [f, i]).sort((a, b) => pos(a[0]) - pos(b[0]) || a[1] - b[1]).map((x) => x[0]);
    },
    /* Kenttä avaimella: näkyvä ensin (samalla avaimella voi olla näytetyypin mukaan eri kenttiä) */
    kentta(h, k) { const all = M.menetelma(h.menetelma).kentat.filter((f) => f.k === k); return all.find((f) => M.nakyy(h, f)) || all[0] || null; },
    /* Muistin avain: näytetyypin omat kentät muistetaan tyypeittäin (VOC-ilmanäytteen kenttänollaputki
       ei siirry formaldehydinäytteelle). Pumppu ja laboratorio ovat yhteisiä. */
    muistiAvain(h, f) {
      const tyyppi = f.kun && f.kun.k === "tyyppi" && !["pumppu", "lab"].includes(f.k) && h.kentat && h.kentat.tyyppi;
      return h.menetelma + "." + (tyyppi ? tyyppi + "." : "") + f.k;
    },
    /* Muistetut arvot ja oletukset (esim. halkaisija 48 mm) näkyviin tyhjiin kenttiin */
    taytaMuisti(h, Model) {
      let n = 0;
      M.kentat(h).forEach((f) => {
        if (!f.muista && f.oletus == null) return;
        if (h.kentat[f.k] != null && h.kentat[f.k] !== "") return;
        const v = (f.muista && Model && Model.muistiGet(M.muistiAvain(h, f))) || f.oletus;
        if (v != null && v !== "") { h.kentat[f.k] = v; h.auto = h.auto || {}; h.auto["k:" + f.k] = "muisti"; n++; }
      });
      return n;
    },
    /* Lasketut arvot (vetolujuus, näytteenottoaika). Palauttaa muuttuneet kentät.
       Numerokenttä (laske) täytetään vain, jos tutkija ei ole kirjoittanut sitä itse. */
    laske(h) {
      const muuttui = [];
      M.kentat(h).forEach((f) => {
        const kaava = KAAVAT[f.kaava || f.laske];
        if (!kaava) return;
        if (f.t !== "calc" && h.kentat[f.k] && !(h.auto && h.auto["k:" + f.k] === "laskettu")) return;
        const v = kaava.laske(h.kentat) || (f.t === "calc" ? "" : null);
        if (v == null || v === (h.kentat[f.k] || "")) return;
        h.kentat[f.k] = v;
        if (f.t !== "calc") { h.auto = h.auto || {}; h.auto["k:" + f.k] = "laskettu"; }
        muuttui.push(f.k);
      });
      return muuttui;
    },
    kaavaSelite(f) { const k = KAAVAT[f.kaava || f.laske]; return k ? k.selite : ""; },
    /* Vinkki kentällä: näytetyypin muistutus ja kenttänolla. Ei täytettävää. */
    vihje(h) {
      if (h.menetelma !== "nayte" || !h.kentat || !h.kentat.tyyppi) return "";
      const t = NAYTETIEDOT[h.kentat.tyyppi];
      if (!t) return "";
      const kn = t.kn && /^Kyllä/.test(t.kn) ? "Kenttänolla: " + (t.kn.replace(/^Kyllä,?\s*/, "") || "kyllä") + "." : "";
      return [t.muistutus, kn].filter(Boolean).join(" ");
    },
    naytetiedot(tyyppi) { return NAYTETIEDOT[tyyppi] || null; },
    NAYTETYYPIT: NAYTTEET,
    /* Näytetyypit tekstistä (esim. suunnitelman kohta "2 kpl VOC-ilmanäyte") */
    naytetyypitTekstista(teksti) {
      let t = " " + String(teksti || "").toLowerCase().replace(/[^a-zåäö0-9-]+/g, " ") + " ";
      const out = [];
      NAYTE_OW.forEach(([w, v]) => {
        const re = new RegExp("(^| )" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-zåäö-]*", "u");
        if (re.test(t)) { if (!out.includes(v)) out.push(v); t = t.replace(re, " "); }
      });
      return out;
    },
    /* Menetelmän taso ja tyypilliset alimenetelmät oletuksista (myös laitteelle tallennetulle) */
    taso(m) { const o = m && OLETUS(m.id); return (m && m.taso) || (o && o.taso) || "kohta"; },
    alimenetelmat(m) { const o = m && OLETUS(m.id); return (m && m.ali) || (o && o.ali) || []; },
    /* Kalusto: { n: nimi, aina: bool } menetelmittäin ja näytetyypeittäin */
    kalusto(id) { return (D.kalusto[id] || []).slice(); },
    /* Vanhat tallenteet uusiin nimiin (näytetyypit, merkkiainekokeen tulos). Palauttaa true, jos muuttui. */
    muunnaVanha(h) {
      if (!h || !h.kentat) return false;
      let ok = false;
      if (h.menetelma === "nayte" && NAYTE_VANHAT[h.kentat.tyyppi]) { h.kentat.tyyppi = NAYTE_VANHAT[h.kentat.tyyppi]; ok = true; }
      if (h.menetelma === "merkkiaine" && h.kentat.tulos === "Ei vuotoa" && !h.kentat.luokka) { h.kentat.luokka = "Ei vuotoa"; ok = true; }
      return ok;
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
