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
    ["Pohjapiirustus", /pohjapiirustu|pohjakuva/i],
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

  /* ---------- Tekstin luku: PDF:n tekstikerros, muuten tekstintunnistus ---------- */
  let workerP = null;
  async function ocrCanvas(c, edistys) {
    if (!workerP) workerP = UI.loadScript(TESS).then(() => window.Tesseract.createWorker("fin", 1, UI.tessPaths())).catch((e) => { workerP = null; throw e; });
    const wk = await workerP;
    const rivit = (r) => (r.data.lines || []).map((x) => siisti(x.text)).filter((x) => x.length > 1);
    await wk.setParameters({ tessedit_pageseg_mode: "3" });
    let l = rivit(await wk.recognize(c));
    if (l.join(" ").length < 120) {            // piirustus: harva teksti
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
    let tapa = "PDF:n teksti";
    const merkkeja = lines.reduce((n, x) => n + x.text.length, 0);
    if (merkkeja < 80 * Math.min(pdf.numPages, 3)) {          // skannattu tai piirustus ilman tekstikerrosta
      tapa = "tekstintunnistus";
      const n = Math.min(pdf.numPages, 8), ocr = [];
      for (let p = 1; p <= n; p++) {
        edistys && edistys("Luetaan tekstiä, sivu " + p + "/" + n + "…");
        const page = await pdf.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(4, 3000 / Math.max(base.width, base.height)) });
        const c = document.createElement("canvas");
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        (await ocrCanvas(c)).forEach((text) => ocr.push({ text, page: p }));
      }
      if (ocr.reduce((x, y) => x + y.text.length, 0) > merkkeja) lines = ocr;
    }
    return { lines, sivuja: pdf.numPages, tapa };
  }


  /* ---------- Käyttöliittymä ---------- */
  const PERUS_NIMET = { rakennustyyppi: "Rakennustyyppi", rakennusvuosi: "Rakennusvuosi", pintaala: "Pinta-ala (m²)", huoneistoja: "Huoneistoja", perustukset: "Perustukset",
    runko: "Runko", julkisivu: "Julkisivu", vesikatto: "Vesikatto", lammitys: "Lämmitys" };
  const ka = () => App.S.kohde.kuntoarvio;
  const lista = () => (ka() && ka().lahtotiedot) || [];
  const osaNimi = (id) => { const d = Kuntoarvio.osa(id); return d ? d.nimi : id; };

  function kortti() {
    const { esc, icon } = UI;
    const l = lista();
    return '<section class="card"><div class="card-h"><h2>Lähtötiedot</h2><span class="meta">' + (l.length || "") + '</span></div><div class="card-b">' +
      (l.length ? l.map((x) => '<div class="row" style="padding:8px 0"><div class="grow"><div class="t">' + esc(x.nimi) + '</div><div class="s">' +
        esc([x.laji, x.sivuja > 1 ? x.sivuja + " sivua" : "", x.tapa, x.poimittu ? x.poimittu + " tietoa otettu" : "ei poimittuja tietoja"].filter(Boolean).join(" · ")) +
        '</div></div><button class="icon-btn" data-lahto-del="' + x.id + '" aria-label="Poista asiakirja">' + icon("trash") + "</button></div>").join("")
        : '<p class="hint" style="margin:0 0 10px">Anna isännöitsijäntodistus, yhtiöjärjestys, kunnossapitotarveselvitys, energiatodistus tai piirustukset. Sovellus poimii niistä perustiedot, tehdyt korjaukset ja rakenteet ehdotuksiksi. Teksti luetaan puhelimessa, eikä asiakirjoja lähetetä mihinkään.</p>') +
      '<button class="btn btn-block" data-lahto-add style="margin-top:8px">' + icon("upload") + "Lisää asiakirjoja (PDF tai kuva)</button>" +
      (l.length ? '<p class="hint" style="margin:8px 0 0">Asiakirjat kulkevat ZIP-paketissa kansiossa lahtotiedot/.</p>' : "") +
      "</div></section>";
  }

  /* Ehdotukset tarkistettavaksi. Valmiiksi valittuna ne, jotka eivät korvaa tutkijan omaa tietoa. */
  function ehdotukset(tulokset) {
    const a = ka(), out = [];
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
    const a = ka();
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

  function tarkista(ehd) {
    const { esc, sheet } = UI;
    return new Promise((resolve) => {
      const ryhmat = [["perus", "Perustiedot"], ["tyo", "Tehdyt kunnossapito- ja muutostyöt"], ["rak", "Rakennusosien rakenteet"]];
      let tulos = null;
      sheet("<h3>Lähtötiedoista poimittu</h3>" +
        '<p class="hint" style="margin:-4px 0 10px">Tarkista ja poista valinta virheellisiltä. Lähdeote näkyy jokaisen alla. Uusimisvuosi viedään myös rakennusosalle.</p>' +
        ryhmat.map(([t, o]) => {
          const l = ehd.map((e, i) => [e, i]).filter(([e]) => e.t === t);
          return l.length ? '<span class="label" style="display:block;margin:12px 0 4px">' + o + " (" + l.length + ")</span>" +
            l.map(([e, i]) => '<label class="ka-chk as-chk"><input type="checkbox" data-i="' + i + '"' + (e.valittu ? " checked" : "") + "><span><b>" + esc(e.otsikko) + "</b>" +
              (e.huom ? '<br><span class="as-muut" style="margin:0">' + esc(e.huom) + "</span>" : "") +
              '<br><span class="hint">' + esc((e.ote ? "”" + e.ote + "” · " : "") + e.lahde + (e.sivu > 1 ? ", s. " + e.sivu : "")) + "</span></span></label>").join("") : "";
        }).join("") +
        '<div class="row-btns" style="margin-top:14px"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Ota valitut käyttöön</button></div>',
        (el, close) => {
          el.querySelector("[data-ok]").addEventListener("click", () => {
            tulos = Array.from(el.querySelectorAll("input[data-i]:checked")).map((c) => ehd[+c.dataset.i]);
            close();
          });
        }, { onClose: () => resolve(tulos) });
    });
  }

  async function lisaa(paivita) {
    const { toast } = UI;
    const files = await UI.pickFile("application/pdf,image/*", true);
    if (!files.length) return;
    const a = ka();
    a.lahtotiedot = a.lahtotiedot || [];
    const tulokset = [], uudet = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      toast("Luetaan " + (i + 1) + "/" + files.length + ": " + f.name, 60000);
      try {
        const r = await lue(f, (t) => toast(t + " (" + f.name + ")", 60000));
        const res = poimi(r.lines);
        const teksti = r.lines.map((x) => x.text).join("\n");
        const tiedosto = await DB.putFile(App.S.kohde.id, f, { kind: "lahtotieto", nimi: f.name });
        const rivi = { id: DB.uid("l_"), tiedosto, nimi: f.name, laji: laji(f.name, teksti), sivuja: r.sivuja, tapa: r.tapa, poimittu: 0, otteet: res.otteet.slice(0, 40), merkkeja: teksti.length, aika: Date.now() };
        a.lahtotiedot.push(rivi); uudet.push(rivi);
        tulokset.push({ nimi: f.name, res });
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
      uudet.forEach((u) => { u.poimittu = valitut.filter((e) => e.lahde === u.nimi).length; });
      await App.Model.saveKohde();
      toast(n + " tietoa otettu käyttöön");
    }
    paivita();
  }

  async function poista(id, paivita) {
    const a = ka(), x = lista().find((l) => l.id === id);
    if (!x || !confirm("Poistetaanko asiakirja " + x.nimi + "? Jo käyttöön otetut tiedot säilyvät.")) return;
    a.lahtotiedot = lista().filter((l) => l !== x);
    await App.Model.saveKohde();
    try { await DB.del("tiedostot", x.tiedosto); } catch (e) { /* ohita */ }
    paivita();
  }

  window.KaLahto = { poimi, lue, laji, OSAT, MATERIAALIT, kortti, lisaa, poista, lista, ehdotukset, kayta };

})();
