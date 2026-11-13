/* =========================================================================
   kalahto.js – kuntoarvion lähtötiedot asiakirjoista

   Tutkija antaa lähtötietoasiakirjat (isännöitsijäntodistus, yhtiöjärjestys,
   kunnossapitotarveselvitys, energiatodistus, rakennusselostus, leikkaus- ja
   LVI-piirustukset) PDF:nä tai kuvana. Sovellus lukee tekstin puhelimessa
   (PDF:n tekstikerros tai tekstintunnistus; mitään ei lähetetä verkkoon) ja
   ehdottaa poimittuja tietoja:
     - perustiedot (rakennusvuosi, tyyppi, pinta-ala, huoneistot, rakenteet, lämmitys)
     - tehdyt kunnossapito- ja muutostyöt (vuosi + työ)
     - rakennusosien rakenteet ja uusimisvuodet
   Tutkija hyväksyy ehdotukset ennen tallennusta; jokaisessa näkyy lähdeote.
   Asiakirjat tallentuvat kohteelle ja kulkevat ZIP-paketin kansiossa lahtotiedot/.

   Tallennus: kuntoarvio.lahtotiedot = [{ id, tiedosto(fileId), nimi, laji, sivuja, tapa, poimittu, otteet[], aika }]
   ========================================================================= */
(function () {
  "use strict";
  const PDFJS = "lib/pdf.min.js", PDFJS_WORKER = "lib/pdf.worker.min.js", TESS = "lib/tesseract/tesseract.min.js";
  const lc = (s) => String(s || "").toLowerCase();
  const siisti = (s) => String(s || "").replace(/\s+/g, " ").replace(/^[\s:;,.\-–]+|[\s:;,\-–]+$/g, "").trim();
  const iso = (s) => { s = siisti(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  /* ---------- Asiakirjan laji tiedostonimestä ja sisällöstä ---------- */
  const LAJIT = [
    ["Isännöitsijäntodistus", /isännöitsijä\w*todistu/i],
    ["Yhtiöjärjestys", /yhtiöjärjesty/i],
    ["Kunnossapitotarveselvitys / PTS", /kunnossapitotarveselvity|kunnossapitosuunnitel|\bpts\b|pitkän tähtäimen/i],
    ["Energiatodistus", /energiatodistu/i],
    ["Rakennusselostus / rakennustapaselostus", /rakennu\w*selostu|rakennustapaselostu/i],
    ["Leikkauspiirustus", /leikkau/i],
    ["LVI-piirustus", /\blvi\b|ilmanvaihto\w*piirustu|vesi- ja viemäri|\bkvv\b|\biv[- ]/i],
    ["Sähköpiirustus", /sähkö\w*(piirustu|suunnitel)|nousujohtokaavio/i],
    ["Pohjapiirustus", /pohjapiirustu|pohjakuva|(^|[_\s-])pohja([_\s.-]|$)/i],
    ["Julkisivupiirustus", /julkisivu\w*piirustu|julkisivut/i],
    ["Asemapiirros", /asemapiir/i]
  ];
  function laji(nimi, teksti) {
    for (const [l, re] of LAJIT) if (re.test(nimi)) return l;
    const alku = teksti.slice(0, 3000);
    for (const [l, re] of LAJIT) if (re.test(alku)) return l;
    return "Muu asiakirja";
  }

  /* ---------- Poiminta ---------- */
  const TYYPIT = [["asuinkerrostalo", "Asuinkerrostalo"], ["pienkerrostalo", "Pienkerrostalo"], ["kerrostalo", "Kerrostalo"], ["rivitalo", "Rivitalo"], ["luhtitalo", "Luhtitalo"],
    ["paritalo", "Paritalo"], ["omakotitalo", "Omakotitalo"], ["erillistalo", "Erillistalo"], ["päiväkoti", "Päiväkoti"], ["koulu", "Koulurakennus"], ["liikerakennu", "Liikerakennus"], ["toimistorakennu", "Toimistorakennus"]];
  const LAMMITYS = [["kaukoläm", "Kaukolämpö"], ["maaläm", "Maalämpö"], ["ilma-vesiläm", "Ilma-vesilämpöpumppu"], ["poistoilmaläm", "Poistoilmalämpöpumppu"], ["öljyläm", "Öljylämmitys"],
    ["sähköläm", "Sähkölämmitys"], ["suora sähkö", "Sähkölämmitys"], ["pelletti", "Pellettilämmitys"]];
  // Selväsanaiset kentät: "Perustukset: teräsbetoni" (isännöitsijäntodistus, energiatodistus, rakennusselostus)
  const KENTAT = [
    ["perustukset", /^(perustu\w*|perustamistapa)\s*[:\-–]\s*(.{3,90})$/i],
    ["runko", /^(runko\w*|kantav\w* rakente\w*|kantava runko|rakennusaine|pääasiallinen rakennusaine)\s*[:\-–]\s*(.{3,90})$/i],
    ["julkisivu", /^(julkisivu\w*|julkisivumateriaali|ulkoverhou\w*|ulkoseinä\w*)\s*[:\-–]\s*(.{3,90})$/i],
    ["vesikatto", /^(vesikat\w*|kate\w*|katemateriaali|kattomuoto|katto\w*)\s*[:\-–]\s*(.{3,90})$/i],
    ["lammitys", /^(lämmity\w*|lämmitysjärjestelmä|lämmitysmuoto|lämmönlähde|lämmitystapa)\s*[:\-–]\s*(.{3,90})$/i],
    ["rakennustyyppi", /^(rakennustyyppi|talotyyppi|rakennuksen tyyppi|käyttötarkoitus)\s*[:\-–]\s*(.{3,60})$/i]
  ];
  const TYO = /uusi|uusin|uusit|modernis|parann|eristä|eristy|tiivist|korja|sanee|remont|pinnoit|maalau|maalat|vaihd|vaihto|asenn|asennus|perusparan|kunnost|sukit|tarkast|huollet|säädet|tasapainot|rakennet|lisät|lisäy|muutet|muutos|päällyst|puhdist|nuohou|kuvau|huuhtel/i;
  // Työn kuvaus -> rakennusosa
  const OSAT = [
    ["vesikatteet", /vesikat|katteen|huopakat|kermikat|peltikat|katon uusi|kattoremont|katon korja|katon pinnoit|katon maalau/i],
    ["vesikattovarusteet", /räystäskouru|syöksytorv|lumieste|kattosil|kattotikk|kattoturva/i],
    ["ikkunat", /ikkun/i], ["ulkoovet", /ulko-?ov|parvekeov|porrashuoneen ov|ala-?ov/i], ["parvekkeet", /parvek/i],
    ["ulkoseinat", /julkisiv|rappau|elementtisaum|saumau|ulkoseinä|ulkoverhou|sokkel/i],
    ["vesijohdot", /putkiremont|linjasaneer|käyttövesi|vesijoh|lämminvesi|linjasäätöventt|vesimittar/i],
    ["viemarit", /viemär|sukitu|pohjaviemär|sadevesiviemär|viemärikuvau|viemärihuuhtel/i],
    ["kuivatus", /salaoj|sadevesij|sadevesikaiv|kuivatu|routasuoj/i],
    ["lammonlahde", /lämmönvaih|lämmönjakokesk|lämmönjakohuone|kaukolämpölait|maalämp|lämpöpump|öljykattil|öljysäiliö/i],
    ["lammonjakelu", /patteriventt|patterive|termostaat|lämmitysverkosto|perussäät|tasapainotu|patteri/i],
    ["ilmanvaihto", /ilmanvaih|iv-kone|huippuimur|ilmastoin|iv-kanav|poistoilma|lto/i],
    ["hissit", /hissi/i], ["sahkojakelu", /sähkökesk|sähkönous|nousujoh|pääkesk|sähköpääkesk|ryhmäkesk|sähköistyk|sähköjärjestel/i],
    ["tele", /antenni|valokuitu|laajakaista|kaapeli-?tv|tietoliiken|yleiskaapeloin/i], ["valaistus", /valaisim|valaistu|led-/i],
    ["paallysteet", /asfalt|piha-?alue|pihakiveys|päällyst/i], ["aluevarusteet", /leikkivälin|leikkialue|pihavarust|jätekatos|pyöräkatos|autokatos|aita/i],
    ["martilat", /kylpyhuone|märkätil|pesuhuone|vedeneristy|saunaosasto|sauna/i], ["palo", /palovaroit|palo-ov|savunpoist|alkusammut|poistumistie/i],
    ["alapohjat", /alapohj|ryömintätil/i], ["perustukset", /perustu/i], ["raystaat", /räystä/i], ["tulisijat", /hormi|savupiip|tulisij|nuohou/i],
    ["lattiat", /lattiapinnoit|lattiapäällyst|porrashuone\w* (lattia|maalau)/i], ["seinatkatot", /porrashuone\w* maalau|sisämaalau/i]
  ];
  // Rakenne- ja materiaalisanat -> osa ja nimike (käyttöikätaulukon / materiaalilistan nimi)
  const MATERIAALIT = [
    ["vesikatteet", /bitumikermi|kumibitumi|kermikat/i, "Bitumikermikate"], ["vesikatteet", /konesaum|saumapelti/i, "Konesaumattu peltikate"],
    ["vesikatteet", /profiilipelti|muotopelti|peltikat/i, "Profiilipeltikate"], ["vesikatteet", /betonitiili|tiilikat|kattotiil/i, "Tiilikate, betoni"], ["vesikatteet", /huopakat|palahuop|kattohuop/i, "Huopakate"],
    ["lammonlahde", /kaukoläm/i, "Kaukolämpö"], ["lammonlahde", /maaläm/i, "Maalämpö"], ["lammonlahde", /öljyläm|öljykattil/i, "Öljylämmitys"],
    ["ilmanvaihto", /painovoimai/i, "Painovoimainen IV"], ["ilmanvaihto", /koneelli\w* poisto/i, "Koneellinen poisto"], ["ilmanvaihto", /lämmöntalteenot|\blto\b|koneelli\w* tulo/i, "Koneellinen tulo ja poisto LTO"],
    ["viemarit", /valurauta/i, "Valurautaviemäri"], ["viemarit", /muoviviemär|pvc-?viemär|pp-?viemär|hst-?viemär/i, "Muoviviemäri"],
    ["vesijohdot", /kupariput|käyttövesi\w* kupar|\bcu[- ]?put/i, "Kupariputket"], ["vesijohdot", /pex|komposiittiput/i, "Muoviputket (PEX)"], ["vesijohdot", /galvanoi|sinkit\w* teräs/i, "Galvanoidut teräsputket"],
    ["ikkunat", /\bmse\b|kolmilasi/i, "Puuikkuna MSE"], ["ikkunat", /puu-?alumiini-?ikkun/i, "Puu-alumiini-ikkuna MSE"],
    ["ulkoseinat", /tiiliverhou|puhtaaksimuurat|julkisivutiil/i, "Tiiliverhous"], ["ulkoseinat", /pesubetoni/i, "Pesubetoni"], ["ulkoseinat", /betonielement|sandwich/i, "Betonielementti"],
    ["ulkoseinat", /rapattu|rappau|kolmikerrosrappau|ohutrappau/i, "Rappaus"], ["ulkoseinat", /puuverhou|lautaverhou|ulkoverhouslau/i, "Puuverhous"],
    ["alapohjat", /maanvarai/i, "Maanvarainen betonilaatta"], ["alapohjat", /ryömintätil|tuulettuva alapohj/i, "Ryömintätilainen alapohja"],
    ["runko", /ontelolaat/i, "Betonilaatta, ontelolaatta"], ["lammonjakelu", /vesikiertoi\w* patteri/i, "Vesikiertoiset patterit"], ["lammonjakelu", /vesikiertoi\w* lattialäm/i, "Lattialämmitys, vesikiertoinen"]
  ];
  // Piirustusten materiaalimerkinnät otteiksi (esim. "MINERAALIVILLA 150", "TIILI 85")
  const MERKINTA = /(betoni|teräsbetoni|tiili|kalkkihiekka|kevytbetoni|siporex|mineraalivilla|lasivilla|kivivilla|eps|xps|styrox|polyuretaani|puukuitu|selluvilla|kipsilevy|lastulevy|vaneri|tuulensuoja|höyrynsulku|ilmansulku|bitumi|kermi|sora|sepeli|salaoja|routaeriste|tuuletusväli|koolau|rappaus|muovimatto|parketti|laatta)\w*\s*(\d{1,3}(?:[.,]\d)?)\s*(mm)?\b/i;

  /* lines = [{ text, page }]. Palauttaa { perus: {k: {arvo, ote, sivu}}, tyot: [{vuosi, teksti, osa, sivu}], rakenteet: [{osa, nimike, ote, sivu}], otteet: [] } */
  function poimi(lines) {
    const out = { perus: {}, tyot: [], rakenteet: [], otteet: [] };
    const aseta = (k, arvo, l, paino) => {
      arvo = siisti(arvo);
      if (!arvo) return;
      const ed = out.perus[k];
      if (!ed || (paino || 1) > ed.paino) out.perus[k] = { arvo, ote: l.text.slice(0, 140), sivu: l.page, paino: paino || 1 };
    };
    const nyt = new Date().getFullYear();
    lines.forEach((l, i) => {
      const t = l.text, tl = lc(t);
      // Arvo voi olla seuraavalla rivillä ("Rakennusvuosi" / "1978")
      const seur = lines[i + 1] && lines[i + 1].page === l.page ? lines[i + 1].text : "";
      // Pelkkä otsikko rivillä: arvo luetaan seuraavalta riviltä, ja ote näyttää molemmat
      const otsikko = !/\d/.test(t) && !/:\s*\S/.test(t) && t.length < 45 && /\d/.test(seur);
      const jatko = otsikko ? t + " " + seur : t;
      const lj = otsikko ? { text: jatko, page: l.page } : l;
      let m;
      if ((m = t.match(/(rakennusvuosi|valmistumisvuosi|käyttöönottovuosi|valmistunut|rakennettu|rakentamisvuosi)\D{0,25}((?:18|19|20)\d{2})\b/i)) && +m[2] <= nyt) aseta("rakennusvuosi", m[2], l, /vuosi/i.test(m[1]) ? 3 : 2);
      else if (/^(rakennusvuosi|valmistumisvuosi|käyttöönottovuosi)\s*:?$/i.test(t) && (m = seur.match(/^((?:18|19|20)\d{2})\b/))) aseta("rakennusvuosi", m[1], l, 3);
      if ((m = jatko.match(/(asuinhuoneisto\w*|huoneisto\w*|asunto\w*)\s*(?:lukumäärä|määrä|yhteensä|lkm|kpl)?\s*[:\-–]?\s*(\d{1,3})\s*(kpl)?(?!\s*[.,]?\d*\s*m)/i)) && +m[2] > 0 && +m[2] < 600 && /lukumäärä|määrä|lkm|kpl|huoneistoja|asuntoja|asuinhuoneistoja/i.test(m[0])) aseta("huoneistoja", m[2], lj, /asuin/i.test(m[1]) ? 3 : 2);
      else if ((m = t.match(/\b(\d{1,3})\s*(asuinhuoneisto|asuntoa|huoneistoa)/i)) && +m[1] > 0) aseta("huoneistoja", m[1], l, 2);
      if ((m = jatko.match(/(huoneistoala|asuinpinta-ala|asuinala|kokonaisala|kerrosala|lämmitetty nettoala|pinta-ala)\D{0,30}?(\d{1,3}(?:[  ]\d{3})*(?:[.,]\d+)?)\s*(?:h-?)?m\s?[2²]/i))) {
        const paino = /huoneistoala|asuin/i.test(m[1]) ? 4 : /kerrosala/i.test(m[1]) ? 3 : /nettoala/i.test(m[1]) ? 2 : 1;
        aseta("pintaala", m[2].replace(/[  ]/g, "").replace(",", ".") + (paino < 4 ? " (" + lc(m[1]) + ")" : ""), lj, paino);
      }
      for (const [k, re] of KENTAT) if ((m = t.match(re))) aseta(k, iso(m[2]), l, 3);
      if (!out.perus.rakennustyyppi || out.perus.rakennustyyppi.paino < 2) { const ty = TYYPIT.find(([w]) => tl.includes(w)); if (ty) aseta("rakennustyyppi", ty[1], l, 1); }
      if (!out.perus.lammitys || out.perus.lammitys.paino < 2) { const la = LAMMITYS.find(([w]) => tl.includes(w)); if (la) aseta("lammitys", la[1], l, 1); }

      // Tehdyt työt: "2015 vesikaton uusiminen", "Vesikatto uusittu 2015", "2008–2009 julkisivujen saumaus"
      let vuosi = null, teksti = null;
      if ((m = t.match(/^(?:v\.?\s*)?((?:19|20)\d{2})(\s*[-–]\s*(?:(?:19|20)\d{2}|\d{2}))?\s*[:\-–.]?\s+(.{5,140})$/)) && TYO.test(m[3])) { vuosi = m[1] + (m[2] ? m[2].replace(/\s/g, "") : ""); teksti = m[3]; }
      else if ((m = t.match(/^(.{5,110}?)\s*(?:v\.|vuonna|vuosina|,)?\s*\(?((?:19|20)\d{2})(\s*[-–]\s*(?:(?:19|20)\d{2}|\d{2}))?\)?\.?$/)) && TYO.test(m[1]) && !/rakennusvuosi|valmistu|rakennettu|päivätty|päiväys/i.test(m[1])) { vuosi = m[2] + (m[3] ? m[3].replace(/\s/g, "") : ""); teksti = m[1]; }
      if (vuosi && +vuosi.slice(0, 4) <= nyt) {
        teksti = siisti(teksti);
        const osa = (OSAT.find(([, re]) => re.test(teksti)) || [])[0] || null;
        if (!out.tyot.some((x) => x.vuosi === vuosi && lc(x.teksti) === lc(teksti))) out.tyot.push({ vuosi, teksti, osa, sivu: l.page });
      }
      // Rakenteet ja materiaalit
      MATERIAALIT.forEach(([osa, re, nimike]) => { if (re.test(t) && !out.rakenteet.some((r) => r.osa === osa && r.nimike === nimike)) out.rakenteet.push({ osa, nimike, ote: t.slice(0, 140), sivu: l.page }); });
      if (MERKINTA.test(t) && t.length < 90 && out.otteet.length < 60 && !out.otteet.includes(siisti(t))) out.otteet.push(siisti(t));
    });
    Object.values(out.perus).forEach((p) => { delete p.paino; });
    out.tyot.sort((a, b) => a.vuosi.localeCompare(b.vuosi));
    return out;
  }

  /* ---------- Piirustukset: nimiö, paljoustiedot, huoneistotyypit ---------- */
  // CAD-fonttien viivattu nolla (Ø) luetaan usein 8:ksi tai 9:ksi; numerot ovat siksi aina tarkistettavia.
  const luku = (x) => { x = String(x || "").replace(/[ \u00a0]/g, "").replace(/[Øø]/g, "0").replace(",", "."); return /^\d+(\.\d+)?$/.test(x) ? x : null; };
  const TOIMENPITEET = [["uudisrakennu", "uudisrakennus"], ["saneeraus", "saneeraus"], ["peruskorjau", "peruskorjaus"], ["perusparannu", "perusparannus"],
    ["laajennu", "laajennus"], ["muutostyö", "muutostyö"], ["korjaus", "korjaus"], ["lisärakennu", "lisärakennus"], ["käyttötarkoituksen muutos", "käyttötarkoituksen muutos"]];
  const PIIRUSTUSLAJIT = [["pääpiirustu", "pääpiirustus"], ["työpiirustu", "työpiirustus"], ["rakennuslupapiirustu", "rakennuslupapiirustus"], ["toteutuspiirustu", "toteutuspiirustus"], ["luonnos", "luonnos"]];
  const SISALLOT = [["asemapiir", "asemapiirros"], ["leikkau", "leikkaus"], ["julkisiv", "julkisivut"], ["pohja", "pohja"], ["detalj", "detaljit"], ["rakennetyyp", "rakennetyypit"]];
  function poimiPiirustus(lines, taulut, nimi) {
    const kaikki = lines.map((l) => l.text).concat(taulut.flatMap((t) => t.rivit));
    const nimio = taulut.filter((t) => t.tyyppi === "nimio").flatMap((t) => t.rivit);
    const lahde = nimio.length ? nimio.concat(kaikki) : kaikki;      // nimiön rivit ensin, sitten muu teksti
    const ll = lc(lahde.join(" \n "));
    const p = {};
    const eka = (lista, teksti) => { const x = lista.find(([w]) => teksti.includes(w)); return x ? x[1] : null; };
    p.toimenpide = eka(TOIMENPITEET, ll);
    p.laji = eka(PIIRUSTUSLAJIT, ll);
    p.sisalto = eka(SISALLOT, ll) || eka(SISALLOT, lc(nimi));
    // Päiväys: 31-08-1993, 31.8.1993; OCR voi sotkea päivän ja kuukauden, vuosi on luotettavin
    const yht = lahde.join(" ");
    const pv = yht.match(/\b(\d{1,2})\s?[-.]\s?(\d{1,2})\s?[-.]\s?((?:19|20)\d{2})\b/) || yht.match(/\b\d{1,2}\s?[-.]\s?\d{0,2}\s?[-.]?\s?((?:19[4-9]|20[0-4])\d)\b/) ||
      yht.match(/(?:^|\s)((?:19[4-9]|20[0-4])\d)(?=\s|$)/);
    if (pv) {
      if (pv.length >= 4 && +pv[1] >= 1 && +pv[1] <= 31 && +pv[2] >= 1 && +pv[2] <= 12) p.paivays = +pv[1] + "." + +pv[2] + "." + pv[3];
      p.vuosi = pv.length >= 4 ? pv[3] : pv[1];
    }
    const nro = lahde.join(" ").match(/\b(ARK|RAK|LVI|IV|KVV|SÄH|S|R|A)?\s*(\d{3,5}\s?-\s?\d{1,3}[A-Z]?)\b/);
    if (nro) p.numero = ((nro[1] || "") + " " + nro[2].replace(/\s/g, "")).trim();
    // Suunnittelija: "ARKKITEHTUURITOIMISTO" + seuraavan rivin yritysnimi (ei kohteen asunto-osakeyhtiö)
    const yritys = (t) => /\b(oy|ky|ab|oyj)\b/i.test(t) && !/asunto\s?-?\s?oy|kiinteistö\s?-?\s?oy|asunto\s?d?y\b|viranomais/i.test(t);
    const puhd = (t) => siisti(t.replace(/\b(ARK|RAK|LVI|AR\w{0,3}K)\b.*$/i, "").replace(/\s\d{3,}.*$/, "").replace(/^\W*\p{L}{1,2}\s+(?=\p{Lu}{4})/u, ""));
    const ti = lahde.findIndex((t) => /(arkkitehti|insinööri|suunnittelu|rakennuttaja)\w*toimisto/i.test(t));
    let su = null;
    if (ti >= 0) {
      const t = lahde[ti];
      su = yritys(t) ? t : [t].concat(lahde.slice(ti + 1, ti + 4).filter(yritys).slice(0, 1)).join(" ");
    } else su = lahde.find(yritys) || null;
    if (su && puhd(su).replace(/\b(oy|ky|ab|oyj)\b/gi, "").trim().length < 5) su = null;
    if (su) p.suunnittelija = puhd(su).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/\bOy\b/i, "Oy").replace(/\s?-\s?/g, "-").replace(/\boy$/i, "Oy");

    // Paljoustiedot (asemapiirroksen taulukko): arvot ehdotuksiksi kuvan kanssa
    const arvot = [];
    taulut.filter((t) => t.tyyppi === "taulukko").forEach((t) => {
      const teksti = t.rivit.join("\n");
      const hae = (k, re, nimi2) => {
        const m = teksti.match(re);
        const v = m ? luku(m[m.length - 1]) : null;
        arvot.push({ k, nimi: nimi2, arvo: v || "", ote: m ? siisti(m[0]) : "", kuva: t.kuva, sivu: t.page });
      };
      hae("tontti", /tontin\s*pinta-?\s?ala\D{0,12}(\d[\d ]{1,6}[,.]?\d?)/i, "Tontin pinta-ala (m²)");
      hae("kerrosala", /kerrosala(?:\s+vanha|\s+uusi|\s+yht\w*)?\D{0,8}(\d[\d ]{1,5}[,.]?\d?)/i, "Kerrosala (m²)");
      hae("pintaala", /huone\s?istoala(?:\s+vanha|\s+uusi|\s+yht\w*)?\D{0,8}(\d[\d ]{1,5}[,.]?\d?)/i, "Huoneistoala (m²)");
      hae("tilavuus", /tilavuus\D{0,8}(\d[\d ]{1,6}[,.]?\d?)/i, "Tilavuus (m³)");
      const jak = t.rivit.filter((r) => /kpl|\d\s?h\s?[+*:]\s?k/i.test(r) && !/jakauma/i.test(r));
      if (jak.length) arvot.push({ k: "huoneistotyypit", nimi: "Huoneistojakauma", arvo: "", ote: jak.slice(0, 4).join(" / "), kuva: t.kuva, sivu: t.page });
    });
    // Huoneistotyypit pohjapiirustuksen merkinnöistä (esim. "2H+K+S 60,0 m²"); lukumäärä ei ole luotettava
    const tyypit = {};
    kaikki.forEach((t) => {
      const m = t.match(/\b([1-7])\s?H\s?[:+*.,]\s?(K|KK|KT|TK)\s?(?:[:+*.,]\s?([S5]|SAUNA|PH|KHH|VAR|AK|P|PARV)\w*)?\s+(\d{2,3}[.,]\d|\d{3})\b/i);
      if (!m) return;
      const tyyppi = m[1] + "H+" + m[2].toUpperCase() + (m[3] ? "+" + m[3].toUpperCase().replace("5", "S") : "");
      let a = m[4].replace(",", ".");
      if (/^\d{3}$/.test(a)) a = a.slice(0, 2) + "." + a.slice(2);
      (tyypit[tyyppi] = tyypit[tyyppi] || []).push(a);
    });
    const tyyppiLista = Object.keys(tyypit).sort().map((ty) => {
      const l = tyypit[ty], laskut = {};
      l.forEach((a) => { laskut[a] = (laskut[a] || 0) + 1; });
      // Yleisin luettu ala; desimaali on piirustuksissa lähes aina 0 (viivattu nolla luetaan 8:ksi tai 9:ksi)
      let ala = Object.keys(laskut).sort((x, y) => laskut[y] - laskut[x])[0];
      ala = ala.replace(/\.[89]$/, ".0");
      return ty + " " + ala.replace(".", ",") + " m²";
    });
    return { piirustus: p, arvot, tyypit: tyyppiLista };
  }
  /* "3H+K 80,0 m²" ja "3H+K+S 80,0 m²" ovat sama tyyppi: pidetään tarkempi */
  function yhdistaTyypit(l) {
    const ala = (t) => t.replace(/^\S+\s*/, ""), tyyp = (t) => t.split(" ")[0];
    return l.filter((t) => !l.some((u) => u !== t && ala(u) === ala(t) && tyyp(u).startsWith(tyyp(t) + "+")))
      .sort((a, b) => tyyp(b).localeCompare(tyyp(a)));
  }

  /* ---------- Tekstin luku: PDF:n tekstikerros, muuten tekstintunnistus ---------- */
  let workerP = null;
  async function ocrCanvas(c, edistys, psm, sijainnit) {
    if (!workerP) workerP = UI.loadScript(TESS).then(() => window.Tesseract.createWorker("fin", 1, UI.tessPaths())).catch((e) => { workerP = null; throw e; });
    const wk = await workerP;
    // Rivi mukaan vain, jos siinä on luotettavasti tunnistettuja sanoja (piirustusten viivat tuottavat roskaa)
    const rivit = (r) => (r.data.lines || []).map((x) => {
      const ws = (x.words || []).filter((w) => w.confidence >= (window.KS_OCR_CONF || 40) && /[\p{L}\d]{2,}/u.test(w.text));
      const text = siisti(ws.length ? ws.map((w) => w.text).join(" ") : "");
      return sijainnit ? { text, b: x.bbox } : text;
    }).filter((x) => { const t = sijainnit ? x.text : x; return t.length > 1 && /[\p{L}]{2,}|\d{2,}/u.test(t); });
    if (psm) { await wk.setParameters({ tessedit_pageseg_mode: psm }); return rivit(await wk.recognize(c)); }
    await wk.setParameters({ tessedit_pageseg_mode: "3" });
    let l = rivit(await wk.recognize(c));
    if (l.join(" ").length < 120) {            // harva teksti
      await wk.setParameters({ tessedit_pageseg_mode: "11" });
      const l2 = rivit(await wk.recognize(c));
      if (l2.join(" ").length > l.join(" ").length) l = l2;
    }
    if (edistys) edistys();
    return l;
  }
  function kuvaCanvas(img, maxSivu) {
    const sc = Math.min(1, maxSivu / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  async function renderAlue(page, scale, x, y, w, h) {
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -x, -y] }).promise;
    return c;
  }
  async function ocrSivu(page, base, edistys) {
    edistys && edistys();
    const sc = Math.min(4, 3000 / Math.max(base.width, base.height));
    return ocrCanvas(await renderAlue(page, sc, 0, 0, Math.round(base.width * sc), Math.round(base.height * sc)));
  }
  /* Piirustus: pieni teksti hajallaan isolla arkilla. Luetaan noin 300 dpi:n tarkkuudella
     paloina (pala kerrallaan muistiin) ja harvan tekstin tilassa. Tyhjät palat ohitetaan. */
  const PALA = 1800, LIMIT = 260;      // limitys > piirustuksen tekstirivin pituus, ettei teksti katkea palojen väliin
  async function ocrPiirustus(page, base, edistys) {
    const sc = (window.KS_OCR_DPI || 400) / 72;
    const W = Math.round(base.width * sc), H = Math.round(base.height * sc);
    const nx = Math.ceil(W / PALA), ny = Math.ceil(H / PALA), m = nx * ny, out = [];
    let i = 0;
    for (let yy = 0; yy < ny; yy++) for (let xx = 0; xx < nx; xx++) {
      i++;
      edistys && edistys(i, m);
      const x = Math.max(0, xx * PALA - LIMIT), y = Math.max(0, yy * PALA - LIMIT);
      const w = Math.min(W - x, PALA + 2 * LIMIT), h = Math.min(H - y, PALA + 2 * LIMIT);
      const c = await renderAlue(page, sc, x, y, w, h);
      if (musteOsuus(c) < 0.004) { c.width = c.height = 0; continue; }
      (await ocrCanvas(c, null, "11", true)).forEach((r) => {
        const cx = x + (r.b.x0 + r.b.x1) / 2, cy = y + (r.b.y0 + r.b.y1) / 2;
        // Limitysalueella sama teksti samassa kohdassa vain kerran; sama teksti eri kohdassa on eri merkintä
        if (out.some((o) => o.text === r.text && Math.abs(o.cx - cx) < 60 && Math.abs(o.cy - cy) < 40)) return;
        out.push({ text: r.text, cx, cy, x0: x + r.b.x0, y0: y + r.b.y0 });
      });
      c.width = c.height = 0;
    }
    out.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    // Taulukot luetaan uudelleen kokonaisina riveinä: nimiö ja paljoustiedot (pinta-alat, huoneistojakauma).
    // Harvan tekstin tila pilkkoo sarakkeet erillisiksi riveiksi, jolloin arvo irtoaa otsikostaan.
    const mm = sc * 72 / 25.4, lisa = [];
    const ankkurit = [
      ["nimio", /RAKENNUSTOIMENPIDE|PIIRUSTUSLAJI/i, -6, -14, 190, 75],
      ["taulukko", /P[AÄ]{2}TUNNUSTIEDOT|PALJOUSTIEDOT|LASKELMA|HUONEISTOJAKAUMA|MITOITUS|TONTINPINTA-?ALA/i, -6, -4, 135, 100]
    ];
    const tehdyt = [], taulut = [];
    for (const [tyyppi, re, dx, dy, ww, hh] of ankkurit) {
      for (const o of out.filter((x) => re.test(x.text.replace(/\s+/g, "")))) {
        const x = Math.max(0, Math.round(o.x0 + dx * mm)), y = Math.max(0, Math.round(o.y0 + dy * mm));
        if (tehdyt.some((t) => Math.abs(t[0] - x) < 30 * mm && Math.abs(t[1] - y) < 30 * mm)) continue;
        tehdyt.push([x, y]);
        const w = Math.min(W - x, Math.round(ww * mm)), h = Math.min(H - y, Math.round(hh * mm));
        if (w < 50 || h < 50) continue;
        edistys && edistys(m, m);
        const k = (window.KS_OCR_TAULU || 600) / 72 / sc;      // taulukko tarkemmin: numerot ratkaisevat
        const c = await renderAlue(page, sc * k, Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k));
        const rivit = await ocrCanvas(c, null, "6");
        rivit.forEach((t) => lisa.push(t));
        // Taulukon kuva tarkistusta varten: tutkija näkee alkuperäisen ja korjaa luetun arvon
        let kuva = null;
        if (tyyppi === "taulukko") {
          // Rajataan tekstin ympärille, ettei tyhjä paperi pienennä lukuja
          const b = musteRaja(c), pad = 30;
          const bx = Math.max(0, b.x0 - pad), by = Math.max(0, b.y0 - pad), bw = Math.min(c.width - bx, b.x1 - b.x0 + 2 * pad), bh = Math.min(c.height - by, b.y1 - b.y0 + 2 * pad);
          const ks = Math.min(1, 1400 / bw), k2 = document.createElement("canvas");
          k2.width = Math.round(bw * ks); k2.height = Math.round(bh * ks);
          k2.getContext("2d").drawImage(c, bx, by, bw, bh, 0, 0, k2.width, k2.height);
          kuva = k2.toDataURL("image/jpeg", 0.7); k2.width = k2.height = 0;
        }
        taulut.push({ tyyppi, rivit, kuva });
        c.width = c.height = 0;
      }
    }
    return { rivit: out.map((o) => o.text), taulut };
  }
  /* Tekstin rajaus: rivit ja sarakkeet, joilla on mustetta (pitkät viivat, kuten taitteet, ohitetaan) */
  function musteRaja(c) {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height, st = 3;
    const rivi = new Array(H).fill(0), sar = new Array(W).fill(0);
    for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) { const k = (y * W + x) * 4; if (d[k] + d[k + 1] + d[k + 2] < 300) { rivi[y]++; sar[x]++; } }
    const rOk = (y) => rivi[y] > 0 && rivi[y] < (W / st) * 0.3, sOk = (x) => sar[x] > 0 && sar[x] < (H / st) * 0.3;
    let y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1;
    while (y0 < H && !rOk(y0)) y0++;
    while (y1 > y0 && !rOk(y1)) y1--;
    while (x0 < W && !sOk(x0)) x0++;
    while (x1 > x0 && !sOk(x1)) x1--;
    return y1 > y0 && x1 > x0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: W, y1: H };
  }
  function musteOsuus(c) {
    const s = 4, g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, tot = 0;
    for (let y = 0; y < c.height; y += s) for (let x = 0; x < c.width; x += s) { const k = (y * c.width + x) * 4; tot++; if (d[k] + d[k + 1] + d[k + 2] < 300) n++; }
    return tot ? n / tot : 0;
  }

  async function lue(file, edistys) {
    const onPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!onPdf) {
      const bm = await createImageBitmap(file);
      edistys && edistys("Luetaan kuvan tekstiä…");
      const l = await ocrCanvas(kuvaCanvas(bm, 3000));
      return { lines: l.map((text) => ({ text, page: 1 })), sivuja: 1, tapa: "tekstintunnistus" };
    }
    await UI.loadScript(PDFJS);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    let lines = (await PlanImport.pdfLines(file)).map((x) => ({ text: x.text, page: x.page }));
    const taulut = [];
    let piirustus = false;
    let tapa = "PDF:n teksti";
    const merkkeja = lines.reduce((n, x) => n + x.text.length, 0);
    if (merkkeja < 80 * Math.min(pdf.numPages, 3)) {          // skannattu tai piirustus ilman tekstikerrosta
      tapa = "tekstintunnistus";
      const n = Math.min(pdf.numPages, 8), ocr = [];
      for (let p = 1; p <= n; p++) {
        const page = await pdf.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const iso = Math.max(base.width, base.height) > 900;     // A3 tai suurempi: piirustus
        let rivit;
        if (iso) {
          const r = await ocrPiirustus(page, base, (i, m) => edistys && edistys("Luetaan piirustusta" + (n > 1 ? ", sivu " + p + "/" + n : "") + ": osa " + i + "/" + m + "…"));
          rivit = r.rivit;
          r.taulut.forEach((t) => taulut.push(Object.assign({ page: p }, t)));
          piirustus = true;
        } else rivit = await ocrSivu(page, base, () => edistys && edistys("Luetaan tekstiä, sivu " + p + "/" + n + "…"));
        rivit.forEach((text) => ocr.push({ text, page: p }));
      }
      if (ocr.reduce((x, y) => x + y.text.length, 0) > merkkeja) lines = ocr;
    }
    if (!piirustus && pdf.numPages === 1) { const v = (await pdf.getPage(1)).getViewport({ scale: 1 }); piirustus = Math.max(v.width, v.height) > 900; }
    return { lines, sivuja: pdf.numPages, tapa, taulut, piirustus };
  }


  /* ---------- Käyttöliittymä ---------- */
  const PERUS_NIMET = { rakennustyyppi: "Rakennustyyppi", rakennusvuosi: "Rakennusvuosi", pintaala: "Pinta-ala (m²)", huoneistoja: "Huoneistoja", huoneistotyypit: "Huoneistotyypit",
    kerrosala: "Kerrosala (m²)", tilavuus: "Tilavuus (m³)", tontti: "Tontin pinta-ala (m²)", perustukset: "Perustukset",
    runko: "Runko", julkisivu: "Julkisivu", vesikatto: "Vesikatto", lammitys: "Lämmitys" };
  const KORJAUSTOIMENPIDE = /saneeraus|peruskorjaus|perusparannus|korjaus|laajennus|muutostyö|lisärakennus|käyttötarkoituksen muutos/;
  const LAJI_MON = { "pääpiirustus": "pääpiirustukset", "työpiirustus": "työpiirustukset", "rakennuslupapiirustus": "rakennuslupapiirustukset", "toteutuspiirustus": "toteutuspiirustukset", luonnos: "luonnokset" };
  function metaTeksti(x) {
    const p = x.piirustus;
    if (!p) return null;
    return [p.laji && p.laji.charAt(0).toUpperCase() + p.laji.slice(1), p.sisalto, p.paivays || p.vuosi, p.numero, p.toimenpide].filter(Boolean).join(" · ");
  }
  /* Kuntoarvion tiedot; jos kohteessa ei vielä ole kuntoarviota, luodaan vasta kun tietoja otetaan käyttöön */
  const TYHJA_KA = () => ({ perustiedot: {}, rajaukset: "", ptsVuodet: 10, osat: {} });
  const ka = () => App.S.kohde.kuntoarvio || TYHJA_KA();
  const kaLuo = () => App.S.kohde.kuntoarvio || (App.S.kohde.kuntoarvio = TYHJA_KA());
  /* Lähtötietoasiakirjat ovat kohteen tasolla (versioon 32 asti kuntoarviossa: siirretään) */
  function siirra(k) {
    k = k || App.S.kohde;
    if (k && k.kuntoarvio && Array.isArray(k.kuntoarvio.lahtotiedot)) {
      k.lahtotiedot = (k.lahtotiedot || []).concat(k.kuntoarvio.lahtotiedot.filter((x) => !(k.lahtotiedot || []).some((y) => y.id === x.id)));
      delete k.kuntoarvio.lahtotiedot;
    }
    return (k && k.lahtotiedot) || [];
  }
  const lista = () => siirra();
  const osaNimi = (id) => { const d = Kuntoarvio.osa(id); return d ? d.nimi : id; };

  function kortti() {
    const { esc, icon } = UI;
    const l = lista();
    return '<section class="card"><div class="card-h"><h2>Lähtötiedot</h2><span class="meta">' + (l.length || "") + '</span></div><div class="card-b">' +
      (l.length ? l.map((x) => '<div class="row" style="padding:8px 0"><div class="grow"><div class="t">' + esc(x.nimi) + '</div><div class="s">' +
        esc(metaTeksti(x) || [x.laji, x.sivuja > 1 ? x.sivuja + " sivua" : "", x.tapa].filter(Boolean).join(" · ")) +
        (x.poimittu ? " · " + x.poimittu + " tietoa otettu" : "") +
        '</div></div><button class="icon-btn" data-lahto-del="' + x.id + '" aria-label="Poista asiakirja">' + icon("trash") + "</button></div>").join("")
        : '<p class="hint" style="margin:0 0 10px">Suositus: anna tarjous, piirustukset ja muut asiakirjat Clauden Lähtötiedot-projektille ja tuo sen paketti tähän. Sovellus täyttää suunnitelman, kerrokset ja tilat sekä kuntoarvion tiedot, ja tarkistat ne ennen käyttöönottoa. Asiakirjat voi myös lukea suoraan puhelimessa (hitaampi ja epätarkempi).</p>') +
      '<button class="btn btn-primary btn-block" data-act="paketti" style="margin-top:8px">' + icon("download") + "Tuo Clauden lähtötietopaketti</button>" +
      '<button class="btn btn-block" data-lahto-add style="margin-top:8px">' + icon("upload") + "Lisää asiakirjoja (PDF tai kuva)</button>" +
      (l.length ? '<p class="hint" style="margin:8px 0 0">Asiakirjat kulkevat ZIP-paketissa kansiossa lahtotiedot/.</p>' : "") +
      "</div></section>";
  }

  /* Ehdotukset tarkistettavaksi. Valmiiksi valittuna ne, jotka eivät korvaa tutkijan omaa tietoa. */
  function ehdotukset(tulokset) {
    const a = ka(), out = [];
    // Piirustukset: nimiöstä korjaushistoria (esim. 1993 saneeraus) tai rakennusvuosi, kerran koko sarjalle
    // Sarja = sama toimenpide ja vuosi. Piirustus, jonka vuotta ei saatu luettua, liitetään saman toimenpiteen
    // sarjaan, jos sellaisia on yksi. Suunnittelijaksi yleisin luettu nimi (tekstintunnistus vaihtelee).
    const sarjat = {};
    const pit = tulokset.filter((x) => x.pi && x.pi.piirustus.toimenpide);
    pit.filter((x) => x.pi.piirustus.vuosi).forEach(({ nimi, pi }) => {
      const p = pi.piirustus, avain = p.vuosi + "|" + p.toimenpide;
      (sarjat[avain] = sarjat[avain] || { p: { vuosi: p.vuosi, toimenpide: p.toimenpide, paivays: p.paivays }, nimet: [], lajit: [], su: [] });
    });
    pit.forEach(({ nimi, pi }) => {
      const p = pi.piirustus;
      let avain = p.vuosi ? p.vuosi + "|" + p.toimenpide : null;
      if (!avain) { const k = Object.keys(sarjat).filter((x) => x.endsWith("|" + p.toimenpide)); if (k.length === 1) avain = k[0]; }
      if (!avain) return;
      const sr = sarjat[avain];
      sr.nimet.push(nimi);
      if (p.laji && !sr.lajit.includes(p.laji)) sr.lajit.push(p.laji);
      if (p.suunnittelija) sr.su.push(p.suunnittelija);
      if (!sr.p.paivays && p.paivays) sr.p.paivays = p.paivays;
    });
    Object.values(sarjat).forEach((sr) => {
      const lk = {};
      sr.su.forEach((x) => { lk[x] = (lk[x] || 0) + 1; });
      sr.p.suunnittelija = Object.keys(lk).sort((a, b) => lk[b] - lk[a])[0] || null;
    });
    Object.values(sarjat).forEach(({ p, nimet, lajit }) => {
      const lahde = nimet.length > 1 ? nimet.length + " piirustusta" : nimet[0];
      if (KORJAUSTOIMENPIDE.test(p.toimenpide)) {
        const rivi = p.vuosi + " " + p.toimenpide + " (" + [lajit.map((l) => LAJI_MON[l] || l).join(", "), p.suunnittelija].filter(Boolean).join(", ") + ")";
        if (String(a.perustiedot.korjaukset || "").toLowerCase().includes(p.vuosi + " " + p.toimenpide)) return;
        out.push({ t: "tyo", rivi, vuosi: p.vuosi, osa: null, otsikko: rivi, ote: "Piirustusten nimiö (" + p.toimenpide + ", " + p.vuosi + ")", lahde, nimet, valittu: true });
      } else if (/uudisrakennu/.test(p.toimenpide) && !a.perustiedot.rakennusvuosi) {
        out.push({ t: "perus", k: "rakennusvuosi", arvo: p.vuosi, otsikko: "Rakennusvuosi: " + p.vuosi, ote: "Uudisrakennuksen piirustusten päiväys " + (p.paivays || p.vuosi) + "; valmistumisvuosi voi olla myöhempi", lahde, nimet, valittu: true, muokattava: true });
      }
    });
    tulokset.filter((x) => x.pi).forEach(({ nimi, pi }) => {
      pi.arvot.forEach((v) => {
        const ed = out.find((e) => e.t === "perus" && e.k === v.k && e.tarkista);
        if (ed) { if (!ed.arvo && v.arvo) Object.assign(ed, { arvo: v.arvo, ote: "Luettu: " + v.ote, kuva: v.kuva }); return; }
        if (v.k === "huoneistotyypit" && tulokset.some((x) => x.pi && x.pi.tyypit.length)) return;
        out.push({ t: "perus", k: v.k, arvo: v.arvo, otsikko: v.nimi, ote: v.ote ? "Luettu: " + v.ote : "Arvoa ei saatu luettua", lahde: nimi, sivu: v.sivu, kuva: v.kuva,
          huom: a.perustiedot[v.k] ? "Nykyinen: " + a.perustiedot[v.k] : "", valittu: false, muokattava: true, tarkista: true });
      });
    });
    const tyypit = yhdistaTyypit(Array.from(new Set(tulokset.filter((x) => x.pi).flatMap((x) => x.pi.tyypit))));
    if (tyypit.length && !a.perustiedot.huoneistotyypit) {
      const lahteet = tulokset.filter((x) => x.pi && x.pi.tyypit.length).map((x) => x.nimi);
      out.push({ t: "perus", k: "huoneistotyypit", arvo: tyypit.join(", "), otsikko: "Huoneistotyypit", ote: "Pohjapiirustusten huoneistomerkinnät (tekstintunnistus)", lahde: lahteet.length > 1 ? lahteet.length + " piirustusta" : lahteet[0], nimet: lahteet, valittu: true, muokattava: true });
    }
    tulokset.forEach(({ nimi, res }) => {
      Object.keys(res.perus).forEach((k) => {
        const v = res.perus[k], nyk = String(a.perustiedot[k] || "").trim();
        if (nyk === v.arvo || out.some((e) => e.t === "perus" && e.k === k && e.arvo === v.arvo)) return;
        out.push({ t: "perus", k, arvo: v.arvo, otsikko: PERUS_NIMET[k] + ": " + v.arvo, ote: v.ote, lahde: nimi, sivu: v.sivu,
          huom: nyk ? "Korvaa nykyisen: " + nyk : "", valittu: !nyk && !out.some((e) => e.t === "perus" && e.k === k) });
      });
      res.tyot.forEach((w) => {
        const rivi = w.vuosi + " " + w.teksti.charAt(0).toLowerCase() + w.teksti.slice(1);
        if (String(a.perustiedot.korjaukset || "").toLowerCase().includes(rivi.toLowerCase()) || out.some((e) => e.t === "tyo" && e.rivi === rivi)) return;
        out.push({ t: "tyo", rivi, vuosi: w.vuosi, osa: w.osa, otsikko: rivi, ote: w.osa ? "Rakennusosa: " + osaNimi(w.osa) : "", lahde: nimi, sivu: w.sivu, valittu: true });
      });
      res.rakenteet.forEach((r) => {
        const o = a.osat[r.osa];
        if ((o && (o.rakenteet || []).some((x) => x.nimike === r.nimike)) || out.some((e) => e.t === "rak" && e.osa === r.osa && e.nimike === r.nimike)) return;
        out.push({ t: "rak", osa: r.osa, nimike: r.nimike, otsikko: osaNimi(r.osa) + ": " + r.nimike, ote: r.ote, lahde: nimi, sivu: r.sivu, valittu: true });
      });
    });
    return out;
  }

  function kayta(valitut) {
    const a = kaLuo();
    let n = 0;
    const osaTila = (id) => { const o = a.osat[id] || (a.osat[id] = { kl: null, ei: false, rakenteet: [], tark: [], huom: "", valiton: false, lisatutk: false, asiantuntija: false }); if (!Array.isArray(o.rakenteet)) o.rakenteet = []; return o; };
    valitut.filter((e) => e.t === "perus").forEach((e) => { a.perustiedot[e.k] = e.arvo; n++; });
    const tyot = valitut.filter((e) => e.t === "tyo");
    if (tyot.length) {
      const vanhat = String(a.perustiedot.korjaukset || "").split("\n").map((x) => x.trim()).filter(Boolean);
      a.perustiedot.korjaukset = vanhat.concat(tyot.map((e) => e.rivi)).sort((x, y) => (parseInt(x, 10) || 0) - (parseInt(y, 10) || 0)).join("\n");
      n += tyot.length;
    }
    valitut.filter((e) => e.t === "rak").forEach((e) => { osaTila(e.osa).rakenteet.push({ id: DB.uid("r_"), nimike: e.nimike, vuosi: "", ika: "", missa: "", lahde: e.lahde }); n++; });
    // Uusimisvuosi rakennusosalle: viimeisin työ. Täytetään rakenteelle, jolla ei vielä ole vuotta;
    // jos rakennetta ei ole, luodaan rivi, johon tutkija valitsee materiaalin.
    tyot.filter((e) => e.osa && /uusi|uusin|uusit|vaihd|vaihto|asenn|rakennet|sukit|modernis/i.test(e.rivi)).forEach((e) => {
      const o = osaTila(e.osa), v = e.vuosi.replace(/^.*[-–]/, "").replace(/^(\d{2})$/, e.vuosi.slice(0, 2) + "$1");
      const tyhja = o.rakenteet.find((x) => !x.vuosi);
      if (tyhja) { tyhja.vuosi = v; tyhja.missa = tyhja.missa || e.rivi; }
      else if (!o.rakenteet.some((x) => x.vuosi === v)) o.rakenteet.push({ id: DB.uid("r_"), nimike: "", vuosi: v, ika: "", missa: e.rivi, lahde: e.lahde });
    });
    return n;
  }

  /* Koottu tarkistus. Ryhmä: e.ryhma (paketti) tai tyypin mukaan (asiakirjojen luku puhelimessa). */
  function tarkista(ehd, o) {
    o = o || {};
    const { esc, sheet } = UI;
    return new Promise((resolve) => {
      const TYYPIT = { perus: "Perustiedot", tyo: "Tehdyt kunnossapito- ja muutostyöt", rak: "Rakennusosien rakenteet" };
      ehd.forEach((e) => { if (!e.ryhma) e.ryhma = TYYPIT[e.t] || "Muut"; });
      const ryhmat = Array.from(new Set(ehd.map((e) => e.ryhma))).map((r) => [r, r]);
      let tulos = null;
      const nahdyt = [];
      const n = ehd.filter((e) => e.valittu).length;
      sheet("<h3>" + esc(o.otsikko || "Lähtötiedoista poimittu") + "</h3>" +
        '<p class="hint" style="margin:-4px 0 10px">' + esc(o.johdanto || "Tarkista ja poista valinta virheellisiltä. Lähdeote näkyy jokaisen alla. Uusimisvuosi viedään myös rakennusosalle.") + "</p>" +
        ((o.varoitukset || []).length ? '<div class="alert warn" style="margin:0 0 10px">' + UI.icon("alert") + "<div>" + o.varoitukset.map(esc).join("<br>") + "</div></div>" : "") +
        '<p class="hint" style="margin:0 0 6px"><b>' + n + " / " + ehd.length + "</b> valittu valmiiksi.</p>" +
        ryhmat.map(([t, o]) => {
          const l = ehd.map((e, i) => [e, i]).filter(([e]) => e.ryhma === t);
          return l.length ? '<span class="label" style="display:block;margin:12px 0 4px">' + o + " (" + l.length + ")</span>" +
            l.map(([e, i]) => {
              // Taulukon kuva kerran ennen ensimmäistä siitä luettua arvoa
              const kuva = e.kuva && !nahdyt.includes(e.kuva) ? (nahdyt.push(e.kuva), '<div class="lt-kuva"><img src="' + e.kuva + '" alt="Piirustuksen taulukko"><span class="hint">Alkuperäinen ' + esc(e.lahde) + '. Napauta kuvaa suurentaaksesi. Tarkista luvut ja korjaa kenttiin.</span></div>') : "";
              return kuva + '<label class="ka-chk as-chk"><input type="checkbox" data-i="' + i + '"' + (e.valittu ? " checked" : "") + "><span><b>" + esc(e.muokattava ? e.otsikko.replace(/:.*$/, "") : e.otsikko) + "</b>" +
                (e.muokattava ? '<input type="text" class="lt-arvo" data-arvo="' + i + '" value="' + esc(e.arvo || "") + '" placeholder="' + (e.tarkista ? "lue kuvasta" : "") + '">' : "") +
                (e.huom ? '<br><span class="as-muut" style="margin:0">' + esc(e.huom) + "</span>" : "") +
                (e.lahde == null ? (e.ote ? '<br><span class="hint">' + esc(e.ote) + "</span>" : "")
                  : '<br><span class="hint">' + esc((e.ote ? (e.muokattava ? e.ote : "”" + e.ote + "”") + " · " : "") + e.lahde + (e.sivu > 1 ? ", s. " + e.sivu : "")) + "</span>") + "</span></label>";
            }).join("") : "";
        }).join("") +
        '<div class="row-btns" style="margin-top:14px"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Ota valitut käyttöön</button></div>',
        (el, close) => {
          el.querySelectorAll(".lt-kuva img").forEach((im) => im.addEventListener("click", () => im.parentNode.classList.toggle("iso")));
          // Arvon muokkaus valitsee rivin; tyhjä arvo ei mene käyttöön
          el.querySelectorAll("[data-arvo]").forEach((inp) => {
            inp.addEventListener("input", () => { const c = el.querySelector('input[data-i="' + inp.dataset.arvo + '"]'); if (c) c.checked = !!inp.value.trim(); });
          });
          el.querySelector("[data-ok]").addEventListener("click", () => {
            tulos = Array.from(el.querySelectorAll("input[data-i]:checked")).map((c) => {
              const e = ehd[+c.dataset.i], inp = el.querySelector('[data-arvo="' + c.dataset.i + '"]');
              return inp ? Object.assign({}, e, { arvo: inp.value.trim() }) : e;
            }).filter((e) => e.t !== "perus" || e.arvo);
            close();
          });
        }, { onClose: () => resolve(tulos) });
    });
  }

  async function lisaa(paivita) {
    const { toast } = UI;
    const files = await UI.pickFile("application/pdf,image/*", true);
    if (!files.length) return;
    const k = App.S.kohde;
    siirra(k); k.lahtotiedot = k.lahtotiedot || [];
    const tulokset = [], uudet = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      toast("Luetaan " + (i + 1) + "/" + files.length + ": " + f.name, 60000);
      try {
        const r = await lue(f, (t) => toast(t + " (" + f.name + ")", 60000));
        const res = poimi(r.lines);
        const teksti = r.lines.map((x) => x.text).join("\n");
        const pi = r.piirustus || /piirustu|piirros/i.test(laji(f.name, teksti)) ? poimiPiirustus(r.lines, r.taulut || [], f.name) : null;
        const tiedosto = await DB.putFile(App.S.kohde.id, f, { kind: "lahtotieto", nimi: f.name });
        const rivi = { id: DB.uid("l_"), tiedosto, nimi: f.name, laji: laji(f.name, teksti), sivuja: r.sivuja, tapa: r.tapa, poimittu: 0, otteet: res.otteet.slice(0, 40), merkkeja: teksti.length, aika: Date.now(),
          piirustus: pi ? pi.piirustus : undefined, tyypit: pi && pi.tyypit.length ? pi.tyypit : undefined };
        if (pi && pi.piirustus.sisalto) { const L = { asemapiirros: "Asemapiirros", leikkaus: "Leikkauspiirustus", julkisivut: "Julkisivupiirustus", pohja: "Pohjapiirustus" }[pi.piirustus.sisalto]; if (L) rivi.laji = L; }
        k.lahtotiedot.push(rivi); uudet.push(rivi);
        tulokset.push({ nimi: f.name, res, pi });
      } catch (e) {
        console.warn("Lähtötieto", e);
        toast("Asiakirjaa ei voitu lukea: " + f.name, 4000);
      }
    }
    UI.hideToast && UI.hideToast();
    await App.Model.saveKohde();
    const ehd = ehdotukset(tulokset);
    if (!ehd.length) { toast(uudet.length ? "Asiakirjat tallennettu. Poimittavia tietoja ei löytynyt; asiakirjat kulkevat silti raportointiin." : "Ei luettavia asiakirjoja", 5000); paivita(); return; }
    const valitut = await tarkista(ehd);
    if (valitut && valitut.length) {
      const n = kayta(valitut);
      uudet.forEach((u) => { u.poimittu = valitut.filter((e) => e.lahde === u.nimi || (e.nimet || []).includes(u.nimi)).length; });
      await App.Model.saveKohde();
      toast(n + " tietoa otettu käyttöön");
    }
    paivita();
  }

  async function poista(id, paivita) {
    const k = App.S.kohde, x = lista().find((l) => l.id === id);
    if (!x || !confirm("Poistetaanko asiakirja " + x.nimi + "? Jo käyttöön otetut tiedot säilyvät.")) return;
    k.lahtotiedot = lista().filter((l) => l !== x);
    await App.Model.saveKohde();
    try { await DB.del("tiedostot", x.tiedosto); } catch (e) { /* ohita */ }
    paivita();
  }

  window.KaLahto = { siirra, kaLuo, tarkista, poimi, poimiPiirustus, lue, laji, OSAT, MATERIAALIT, kortti, lisaa, poista, lista, ehdotukset, kayta };

})();
