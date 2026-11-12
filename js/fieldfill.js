/* =========================================================================
   fieldfill.js – sanelusta suoraan menetelmän kenttiin

   Tutkija sanoo esimerkiksi:
     "RH-mittaus porareiästä, Vaisala HM40, tasaantumisaika kolme vuorokautta.
      30 millissä 78 prosenttia 21,5 astetta, rinnakkainen 79 prosenttia.
      70 millissä 84 prosenttia 21,3 astetta. Huoneilma 32 prosenttia 22 astetta."
   ja kentät täyttyvät: mittalaite, tasaantumisaika 72 h, mittausrivit
   syvyyksittäin ja ympäröivät olosuhteet.

   Periaatteet (samat kuin autofill.js):
     - Arvo merkitään sanelusta tunnistetuksi (h.auto["k:" + kenttä] = "sanelu"),
       ja se näkyy kortissa merkinnällä "sanelusta". ZIP-paketti kertoo sen.
     - Tutkijan itse kirjoittamaa tai muokkaamaa arvoa ei muuteta.
     - Sanelusta tehdyt taulukon rivit (row._sanelu) luodaan uudelleen, kun
       sanelu muuttuu. Kun tutkija muokkaa tai poistaa yhdenkin niistä,
       taulukko on hänen ja sanelu ei enää muuta sitä.
     - Kentät tunnistetaan avainsanoista ja yksiköistä, joten myös itse lisätyt
       menetelmät toimivat (kentän nimi ja yksikkö riittävät).
   ========================================================================= */
(function () {
  "use strict";

  /* ---------- Numerot puheesta ---------- */
  const ONES = { nolla: 0, yksi: 1, kaksi: 2, kolme: 3, neljä: 4, viisi: 5, kuusi: 6, seitsemän: 7, kahdeksan: 8, yhdeksän: 9 };
  const ONE_RE = "(nolla|yksi|kaksi|kolme|neljä|viisi|kuusi|seitsemän|kahdeksan|yhdeksän)";
  function wordNum(w) {
    // kaksikymmentäkolme, satakaksikymmentä, viisitoista, kymmenen
    let m, n = 0, s = w;
    if ((m = s.match(new RegExp("^" + ONE_RE + "?sataa?"))) ) { n += 100 * (m[1] ? ONES[m[1]] : 1); s = s.slice(m[0].length); }
    if ((m = s.match(new RegExp("^" + ONE_RE + "kymmentä")))) { n += 10 * ONES[m[1]]; s = s.slice(m[0].length); }
    else if ((m = s.match(new RegExp("^" + ONE_RE + "toista$")))) { n += 10 + ONES[m[1]]; s = ""; }
    else if (s.startsWith("kymmenen")) { n += 10; s = s.slice(8); }
    if (s && ONES[s] != null) { n += ONES[s]; s = ""; }
    return s ? null : (w === "nolla" ? 0 : n || null);
  }
  function prep(text) {
    let t = " " + String(text || "").toLowerCase().replace(/[–—]/g, "-") + " ";
    t = t.replace(/[a-zåäö]+/g, (w) => { const v = wordNum(w); return v != null ? String(v) : w; });
    t = t.replace(/(\d+) ?pilkku ?(\d+)/g, "$1,$2");          // "21 pilkku 5" -> 21,5
    t = t.replace(/(\d+) ?ja puoli/g, (m0, a) => a + ",5");
    t = t.replace(/\bpuoli\b/g, "0,5");
    t = t.replace(/(miinus|pakkasta) ?(\d)/g, "-$2");
    return t;
  }
  const NUM = "(-?\\d+(?:[,.]\\d+)?)";
  const toNum = (s) => s.replace(".", ",");

  /* ---------- Yksiköt ---------- */
  const UNIT_RE = {
    "%": "(?:%|prosentti[a]?|prosentin|prosentissa|rh)",
    "°C": "(?:°c|°|astetta|aste|asteen|celsiusta)",
    "mm": "(?:mm|millimetri[äa]?|millimetrin|millimetrissä|milli[äa]?|millin|millissä|milliä)",
    "cm": "(?:cm|senttimetri[äa]?|senttiä|sentin|sentissä)",
    "Pa": "(?:pa|pascali[a]?|pascalin)",
    "g/m³": "(?:g\\/m3|g\\/m³|grammaa?(?: kuutiossa| kuutiometrissä| kuutioon| per kuutio)?)",
    "h": "(?:h|tunti[a]?|tunnin|tuntia)",
    "vrk": "(?:vrk|vuorokau[a-zä]*|päivä[äa]?|päivää)",
    "m": "(?:m|metri[äa]?|metrin)"
  };

  /* ---------- Sanasto ---------- */
  const DEVICES_DEF = [
    "GANN Hydromette BL-E", "GANN BL Compact RH-T Flex", "GANN BL Compact", "Hydrotest LG3", "Protimeter Digital mini", "FLIR E75", "TSI DP-Calc", "DP-Calc", "Inficon Sensistor XRS9012", "Sensistor XRS9012", "Sensistor", "MIRAN DLS",
    "vaisala hm40", "vaisala hm42", "vaisala hm45", "vaisala hmp40s", "vaisala hmp40", "vaisala hm70", "vaisala shm40", "vaisala",
    "gann hydromette bl compact", "gann hydromette rt 600", "gann hydromette", "gann rtu 600", "gann", "hydromette",
    "tramex cme5", "tramex cme4", "tramex", "protimeter mms3", "protimeter mms2", "protimeter", "trotec t660", "trotec t610", "trotec",
    "testo 605", "testo 635", "testo 610", "testo 440", "testo 510", "testo", "flir e8", "flir e6", "flir e96", "flir t540", "flir c5", "flir",
    "hikmicro", "seek thermal", "fluke ti", "fluke", "humidcheck", "rotronic", "hioki", "kimo", "tsi", "swema", "ttm", "brennenstuhl"
  ];
  const MATERIALS_DEF = [
    "puhallusvilla", "tuulensuojavilla", "runkovilla", "harvalaudoitus", "aluskate", "pintalaatta", "kaksoislaatta", "lankkulattia", "silikoni", "mikrotiivistesauma", "saumalaasti", "kumibitumi", "solumuovi", "turve", "olkisavi",
    "mineraalivilla", "lasivilla", "kivivilla", "eristevilla", "puukuitueriste", "puukuitulevy", "huokoinen puukuitulevy", "tuulensuojalevy", "kuitulevy",
    "sahanpuru", "kutterinlastu", "purueriste", "kevytsora", "styrox", "eps", "xps", "polyuretaani", "pur", "korkki",
    "kipsilevy", "lastulevy", "vaneri", "osb", "lauta", "puu", "rakennuspaperi", "bitumihuopa", "bitumi", "kattohuopa", "muovikalvo", "höyrynsulku", "filtti",
    "betoni", "pintabetoni", "kevytbetoni", "siporex", "tiili", "harkko", "laasti", "tasoite", "pintatasoite", "rappaus", "kalkkirappaus",
    "muovimatto", "linoleum", "parketti", "laminaatti", "lautalattia", "kokolattiamatto", "korkkimatto", "laatta", "klinkkeri", "vedeneriste", "mattoliima", "liima",
    "tapetti", "maali", "kuitulevy", "hiekka", "sora", "täyttösora", "salaojasora", "maa"
  ];
  const lower = (a) => a.map((x) => String(x).toLowerCase().trim()).filter(Boolean);
  const byLen = (a) => a.slice().sort((x, y) => y.length - x.length);
  let DEVICES = [], MATERIALS = [], AINEET = [];
  const AINEET_DEF = [["typpived", "Typpivety"], ["typpivety", "Typpivety"], ["forming", "Formingkaasu"], ["helium", "Helium"], ["rikkiheksafluorid", "Rikkiheksafluoridi (SF6)"], ["sf6", "Rikkiheksafluoridi (SF6)"], ["merkkisav", "Merkkisavu"], ["savu", "Merkkisavu"]];
  Vocab.define("laitteet", { group: "Sanelu: menetelmän kentät", title: "Mittalaitteet", type: "words", defaults: DEVICES_DEF,
    help: "Laitenimet, jotka tunnistetaan sanelusta Mittalaite-kenttään. Pidempi nimi voittaa (\"gann hydromette bl-e\" ennen \"gann\")." });
  Vocab.define("materiaalit", { group: "Sanelu: menetelmän kentät", title: "Materiaalit", type: "words", defaults: MATERIALS_DEF,
    help: "Materiaalit Materiaali- ja Rakennekerrokset-kenttiin. Sana on sanan alku: \"betoni\" osuu sanaan betonilaatta." });
  Vocab.define("merkkiaineet", { group: "Sanelu: menetelmän kentät", title: "Merkkiaineet", type: "map", defaults: AINEET_DEF,
    help: "sana = merkkiaine, joka kirjataan Merkkiaine-kenttään." });
  function rebuild() {
    // Laitenimi kirjataan sanaston kirjoitusasussa (GANN Hydromette BL-E); pienillä kirjoitettu muotoillaan
    DEVICES = byLen(Vocab.list("laitteet").map((x) => String(x).trim()).filter(Boolean));
    MATERIALS = lower(Vocab.list("materiaalit"));
    AINEET = Vocab.list("merkkiaineet").map(([w, v]) => [w.toLowerCase(), v]);
  }
  rebuild();
  Vocab.onChange(rebuild);
  // Kenttäkohtaiset avainsanat (kentän tunnus -> sanat). Itse lisätyt kentät saavat sanansa nimestään.
  const FIELD_WORDS = {
    laite: ["mittalaite", "mittari", "mittarilla", "laite", "laitteella", "kamera", "kameralla", "mitattiin laitteella"],
    tasaantuminen: ["tasaantumisaika", "tasaantumis", "tasaantui", "tasaantunut", "tasaantuneet", "tasaantua", "tasaantumisen"],
    arvo: ["pko-arvo", "pko", "pintakosteusarvo", "lukema", "lukemat", "arvo", "näyttää", "näytti", "havaintokohda", "havaintokohdassa", "mittauskohda"],
    vertailu: ["vertailu", "vertailuarvo", "vertailukoh", "vertailupiste", "referenssi", "kuivalla kohdalla", "kuivassa kohdassa", "kuivan kohdan"],
    t_sisa: ["sisälämpötila", "sisälämpö", "sisällä", "sisäilma", "sisätila"],
    t_ulko: ["ulkolämpötila", "ulkolämpö", "ulkona", "ulkoilma"],
    paine: ["painesuhde", "paine-ero", "paine ero", "paineero", "alipaine", "ylipaine", "paine"],
    aine: ["merkkiaineena", "merkkiaineella", "merkkiaineeksi", "merkkikaasuna", "merkkikaasulla"],
    injektointi: ["injektointikohta", "injektoitiin", "injektointi", "syöttökohta", "syötettiin rakenteeseen"],
    materiaali: ["materiaali", "materiaalista", "materiaalina", "näytemateriaali"],
    jakso: ["jakso", "tarkastelujakso", "mittausjakso"],
    kerrokset: ["rakennekerrokset", "kerrokset", "rakenne sisältä", "sisältä ulos", "rakenteen kerrokset"]
  };
  const SELECT_WORDS = {
    tyyppi: [["mikrobi", "Mikrobi, materiaali"], ["home", "Mikrobi, materiaali"], ["kuitu", "Kuitu"], ["mineraalikuitu", "Kuitu"],
      ["asbesti", "Haitta-aine"], ["pah", "Haitta-aine"], ["pcb", "Haitta-aine"], ["lyijy", "Haitta-aine"], ["haitta-aine", "Haitta-aine"], ["voc", "VOC"], ["emissio", "VOC"]],
    tulos: [["ei merkkiainevuoto", "Ei vuotoa"], ["ei havaittu merkkiainevuoto", "Ei vuotoa"], ["merkkiainevuotoja ei", "Ei vuotoa"], ["merkkiainevuoto", "Vuotoa havaittu"], ["ei vuotoa", "Ei vuotoa"], ["vuotoa ei", "Ei vuotoa"], ["ei havaittu vuoto", "Ei vuotoa"], ["vuotoa havaittiin", "Vuotoa havaittu"], ["vuoto havaittiin", "Vuotoa havaittu"], ["vuotaa", "Vuotoa havaittu"], ["vuotoa", "Vuotoa havaittu"]],
    asteikko: [["vertailuarvo", "Vertailuarvo"], ["vertailuasteikko", "Vertailuarvo"], ["puun kosteus", "% (puu)"], ["puuprosentti", "% (puu)"], ["laitteen asteikko", "Laitteen asteikko"], ["yksikköä", "Laitteen asteikko"], ["digit", "Laitteen asteikko"]]
  };
  const AMBIENT = /(?:^|\s)(olosuhte|olosuhde|huoneilma|sisäilma|ympäröivä|ympäristö|huoneen ilma|tilan ilma|vertailuolosuh)/;

  const stemOf = (label) => String(label || "").toLowerCase().split(/[\s,/()]+/).filter((w) => w.length >= 3)[0] || "";
  // Kentän tunnistussanat: menetelmäeditorissa kentälle annetut, oletukset tai kentän nimen alku
  const wordsFor = (f) => {
    if (Array.isArray(f.sanat) && f.sanat.length) return lower(f.sanat);
    return (FIELD_WORDS[f.k] || []).concat(stemOf(f.l) && !FIELD_WORDS[f.k] ? [stemOf(f.l).slice(0, Math.max(4, stemOf(f.l).length - 2))] : []);
  };
  const wre = (w) => "(?:^|[\\s,.;:])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-zåäö-]*";

  /* Numero avainsanan jälkeen (enintään muutama sana välissä), valinnaisella yksiköllä */
  function numAfter(t, words, unit) {
    const u = unit && UNIT_RE[unit] ? "(?:\\s?(" + UNIT_RE[unit] + "|" + (unit === "h" ? UNIT_RE.vrk : "x") + "))?" : "(?:\\s?([a-zåäö%°]+))?";
    for (const w of words) {
      const re = new RegExp(wre(w) + "(?:\\s+[a-zåäö]+){0,3}?\\s+(?:on\\s+|oli\\s+|noin\\s+|n\\.\\s?)?" + NUM + u, "u");
      const m = t.match(re);
      if (m) return { v: m[1], u: m[2] || "" };
    }
    return null;
  }
  function phraseAfter(t, words, maxWords) {
    for (const w of words) {
      const re = new RegExp(wre(w) + "(?:na|lla|ksi)?\\s*(?:on|oli|:)?\\s+([^.;,\\n]{2,80})", "u");
      const m = t.match(re);
      if (m) {
        const ph = m[1].trim().split(/\s+/).slice(0, maxWords || 4).join(" ");
        if (ph && !/^\d/.test(ph)) return ph;
      }
    }
    return null;
  }
  const titleDevice = (s) => s.split(" ").map((w) => /\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  /* Tarkistuslistan valinta: haetaan lauseenosasta, jossa kentän sana on ("saumoissa rakoja",
     "kaadot riittävät", "ei tulvakynnystä"). Näin yhdessä sanelussa voi kuitata monta kohtaa. */
  function selectInClauses(f, t) {
    const ws = f.kaikkialla ? [] : wordsFor(f);       // kaikkialla: valinnan sana riittää (esim. "mikrobi-ilmanäyte")
    const clauses = String(t).split(/[.,;:!?]|\s(?:ja|sekä|mutta)\s/);
    for (const c of clauses) {
      const cc = " " + c.trim() + " ";
      if (ws.length && !ws.some((w) => new RegExp(wre(w), "u").test(cc))) continue;
      for (const [w, o] of f.ow) if ((f.o || []).includes(o) && new RegExp(wre(w), "u").test(cc)) return o;
    }
    return null;
  }
  /* Märkätilan tyyppi tilan nimestä: "KH", "Kylpyhuone", "S", "Sauna", "WC", "K" */
  const TILA_KOODIT = { ph: "Pesuhuone", kh: "Pesuhuone", pesuhuone: "Pesuhuone", kylpyhuone: "Pesuhuone", s: "Sauna", sauna: "Sauna", löylyhuone: "Sauna",
    wc: "Erillinen WC", "erillinen wc": "Erillinen WC", k: "Keittiö", kt: "Keittiö", ke: "Keittiö", keittiö: "Keittiö", keittokomero: "Keittiö", tupakeittiö: "Keittiö", avokeittiö: "Keittiö" };
  function fromRoom(f, h, Model) {
    const r = h.sijainti && h.sijainti.tilaId && Model.tila(h.sijainti.tilaId);
    if (!r) return null;
    for (const n of [r.nimi, String(r.tunnus || "").split(/\s+/).pop()]) {
      const v = TILA_KOODIT[String(n || "").toLowerCase().replace(/\d+$/, "").trim()];
      if (v && (f.o || []).includes(v)) return v;
    }
    return f.ow ? selectInClauses(Object.assign({}, f, { sanat: [] }), " " + String(r.nimi || "").toLowerCase() + " ") : null;
  }
  /* Asunnon tunnus: sanelusta ("asunto B 12", "huoneistossa 5") tai tilan tunnuksen alusta ("A1 KH") */
  function asunto(h, t, Model) {
    const m = String(t).match(/(?:^|\s)(?:asun[a-zåäö]*|huoneisto[a-zåäö]*|as\.?)\s+([a-zåäö]{0,2})\s?(\d{1,3})(?![0-9])/u);
    if (m) return (m[1] + m[2]).toUpperCase();
    const r = h.sijainti && h.sijainti.tilaId && Model.tila(h.sijainti.tilaId);
    const a = r && String(r.tunnus || "").match(/^([A-ZÅÄÖ]{1,2}\s?\d{1,3})\s+\S/u);
    return a ? a[1].replace(/\s+/g, "") : null;
  }

  /* ---------- Yksittäiset kentät ---------- */
  function scalarValue(f, t) {
    if (f.t === "num") {
      let r = numAfter(t, wordsFor(f), f.u);
      // pintakosteuden lukema ilman avainsanaa: "120 yksikköä" (vertailukohta mainitaan erikseen)
      if (!r && f.k === "arvo") { const y = t.match(new RegExp(NUM + "\\s?(?:yksikkö|digit)", "u")); if (y) r = { v: y[1], u: "" }; }
      if (!r) return null;
      let v = r.v;
      if (f.u === "h" && /^(vrk|vuorokau|päiv)/.test(r.u)) v = toNum(String(Math.round(parseFloat(v.replace(",", ".")) * 24 * 10) / 10));
      if (f.u === "mm" && /^(cm|sentti|senti)/.test(r.u)) v = toNum(String(parseFloat(v.replace(",", ".")) * 10));
      return toNum(v);
    }
    if (f.t === "select" && f.ow) return selectInClauses(f, t);
    if (f.t === "select") {
      const list = SELECT_WORDS[f.k] || (f.o || []).map((o) => [o.toLowerCase(), o]);
      for (const [w, o] of list) if ((f.o || []).includes(o) && new RegExp(wre(w), "u").test(t)) return o;
      return null;
    }
    if (f.k === "laite") {
      const D = DEVICES.find((x) => new RegExp(wre(x.toLowerCase()) + (/\d$/.test(x) ? "(?![0-9])" : ""), "u").test(t));
      if (D) {
        const d = D.toLowerCase(), own = D !== d;
        // tarkenna mallilla, jos sanelussa on laitenimen perässä malli (esim. "testo 635-2")
        const m = t.match(new RegExp(wre(d) + "(?:\\s?([a-z]{0,3}-?\\d{2,4}[a-z0-9-]*))?", "u"));
        const model = m && m[1] && !d.match(/\d/) ? " " + m[1].toUpperCase() : "";
        return ((own ? D : titleDevice(d)) + model).trim();
      }
      const ph = phraseAfter(t, wordsFor(f), 3);
      return ph ? titleDevice(ph) : null;
    }
    if (f.k === "materiaali") {
      const mm = MATERIALS.map((x) => ({ x, i: t.search(new RegExp(wre(x) + "(?![a-zåäö])", "u")) })).filter((o) => o.i >= 0).sort((a, b) => a.i - b.i || b.x.length - a.x.length)[0];
      if (mm) return mm.x.charAt(0).toUpperCase() + mm.x.slice(1);
      return phraseAfter(t, wordsFor(f), 3);
    }
    if (f.k === "aine") {
      const k = AINEET.find(([x]) => new RegExp(wre(x), "u").test(t));
      if (k) return k[1];
      return phraseAfter(t, wordsFor(f), 2);
    }
    if (f.k === "kerrokset") {
      // materiaalit järjestyksessä paksuuksineen: "muovimatto, tasoite 5 mm, betoni 80 mm"
      const found = [];
      const re = new RegExp("(?:(\\d+(?:,\\d+)?)\\s?" + UNIT_RE.mm + "\\s+)?(" + MATERIALS.slice().sort((a, b) => b.length - a.length).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")[a-zåäö]*(?:\\s+(\\d+(?:,\\d+)?)\\s?" + UNIT_RE.mm + ")?", "gu");
      let m;
      while ((m = re.exec(t))) {
        const th = m[1] || m[3];
        const name = m[2];
        if (found.length && found[found.length - 1].startsWith(name)) continue;
        found.push(name + (th ? " " + th + " mm" : ""));
      }
      if (found.length >= 2) return found.join(", ");
      return phraseAfter(t, wordsFor(f), 12);
    }
    if (f.k === "tunnus") {
      const m = t.match(/(?:mittaus)?pis[a-zäö]*\s+([a-zåäö]{1,3}\s?\d{1,3})\b|(?:avau[a-zäö]*|näyt[a-zäö]*|koe|kokeen)\s+([a-zåäö]{1,3}\s?\d{1,3})\b/u);
      const v = m && (m[1] || m[2]);
      return v && /[a-zåäö]/.test(v) ? v.replace(/\s/g, "").toUpperCase() : null;
    }
    if (f.t === "text" || f.t === "textarea") return phraseAfter(t, wordsFor(f), f.t === "textarea" ? 15 : 4);
    return null;
  }

  /* ---------- Taulukot (esim. RH-mittaukset syvyyksittäin) ---------- */
  function tableRows(f, t, ambientTable) {
    const cols = f.sarakkeet || [];
    const g = cols.find((c) => c.ryhma);
    const byUnit = {};
    cols.forEach((c) => { if (c.u && c.t === "num" && !c.ryhma) byUnit[c.u] = c; });
    if (!Object.keys(byUnit).length) return [];
    // Tapahtumat tekstissä järjestyksessä
    const ev = [];
    const push = (re, type, conv) => { let m; const r = new RegExp(re, "gu"); while ((m = r.exec(t))) ev.push({ i: m.index, type, v: conv ? conv(m) : m[1] }); };
    if (g || f.__ambSplit) {
      const gu = (g && UNIT_RE[g.u]) || UNIT_RE.mm;
      push("(?:syvyy[a-zäö]*\\s+)?" + NUM + "\\s?" + gu + "(?![a-zåäö])", "g", (m) => m[1]);
      if (!g || g.u === "mm") push(NUM + "\\s?" + UNIT_RE.cm + "(?![a-zåäö])", "g", (m) => toNum(String(parseFloat(m[1].replace(",", ".")) * 10)));
    }
    if (byUnit["%"]) {
      push(NUM + "\\s?" + UNIT_RE["%"] + "(?![a-zåäö])", "%");
      push("(?:^|\\s)(?:rh|suhteellinen kosteus|suhteellisen kosteuden)\\s+(?:on\\s+|oli\\s+)?" + NUM + "(?!\\s?(?:" + UNIT_RE["°C"] + "|" + UNIT_RE.mm + "))", "%");
    }
    if (byUnit["°C"]) {
      push(NUM + "\\s?" + UNIT_RE["°C"] + "(?![a-zåäö])", "°C");
      push("(?:^|\\s)(?:lämpötila|lämpö|t)\\s+(?:on\\s+|oli\\s+)?" + NUM + "(?!\\s?(?:" + UNIT_RE["%"] + "|" + UNIT_RE.mm + "))", "°C");
    }
    if (byUnit["g/m³"]) {
      push(NUM + "\\s?" + UNIT_RE["g/m³"] + "(?![a-zåäö])", "g/m³");
      push("(?:absoluuttinen kosteus|absoluuttista kosteutta|vesihöyrypitoisuus)\\s+(?:on\\s+|oli\\s+)?" + NUM, "g/m³");
    }
    // Olosuhteet erotetaan: olosuhdesanan ("huoneilma") jälkeiset arvot kuuluvat olosuhdetaulukkoon
    // seuraavaan syvyyteen asti
    const ambAt = [];
    { const r = new RegExp(AMBIENT.source, "gu"); let m; while ((m = r.exec(t))) ambAt.push(m.index); }
    ev.sort((a, b) => a.i - b.i);
    // sama kohta kahdesti (kaksi lauseketta osui samaan lukuun): pois
    const uniq = ev.filter((e, k) => !ev.some((o, j) => j < k && o.type === e.type && Math.abs(o.i - e.i) < 14 && o.v === e.v));
    const isAmb = (e) => {
      const a = ambAt.filter((x) => x < e.i).pop();
      if (a == null) return false;
      const d = uniq.filter((o) => o.type === "g" && o.i < e.i).map((o) => o.i).pop();
      return d == null || a > d;
    };
    const splitAmb = !!(f.__ambSplit);
    const mine = uniq.filter((e) => e.type === "g" ? !ambientTable : (splitAmb ? (ambientTable ? isAmb(e) : !isAmb(e)) : true));
    const rows = [];
    let cur = null, depth = null;
    mine.forEach((e) => {
      if (e.type === "g") { depth = e.v; cur = null; return; }
      const c = byUnit[e.type];
      if (!c) return;
      if (!cur || cur[c.k] != null) { cur = {}; if (g && depth != null) cur[g.k] = depth; rows.push(cur); }
      cur[c.k] = toNum(e.v);
    });
    return rows.filter((r) => Object.keys(byUnit).some((u) => r[byUnit[u].k] != null) && (!g || r[g.k] != null || ambientTable));
  }
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  /* ---------- Kaikki kentät ---------- */
  function apply(h) {
    const Model = (window.App && App.Model) || window.Model;
    const m = M.menetelma(h.menetelma);
    if (!m || !m.kentat.length) return [];
    const paalla = !window.Auto || Auto.enabled();
    const hasText = paalla && !!(h.sanelu || "").trim();
    // Ilman sanelua täytetään vain tilasta pääteltävät (märkätilan tyyppi, asunto)
    if (!hasText && !m.kentat.some((f) => f.tilasta || f.k === "asunto")) return [];
    const t = prep(paalla ? h.sanelu || "" : "");
    h.auto = h.auto || {};
    const changes = [];
    // Taulukot: ensimmäinen ryhmitelty taulukko saa mittausrivit, ryhmittelemätön olosuhteet
    const tables = m.kentat.filter((f) => f.t === "table");
    const main = tables.find((f) => (f.sarakkeet || []).some((c) => c.ryhma)) || tables[0];
    tables.forEach((f) => {
      const rows = M.rivit(h, f);
      const dictated = rows.filter((r) => r._sanelu);
      const own = h.auto["t:" + f.k] === "sanelu" || !dictated.length;
      if (!own) return;
      const ambient = f !== main && !(f.sarakkeet || []).some((c) => c.ryhma);
      const split = tables.length > 1;
      const parsed = tableRows(Object.assign({}, f, { __ambSplit: split }), t, ambient && split);
      const key = (r) => (f.sarakkeet || []).filter((c) => c.t !== "date").map((c) => r[c.k] == null ? "" : String(r[c.k])).join("|");
      if (dictated.map(key).join(";") === parsed.map(key).join(";")) return;
      const keep = rows.filter((r) => !r._sanelu);
      const fresh = parsed.map((r) => {
        const old = dictated.find((d) => key(d) === key(r));
        const row = Object.assign({ id: old ? old.id : DB.uid("r_"), _sanelu: true }, r);
        (f.sarakkeet || []).filter((c) => c.t === "date").forEach((c) => { row[c.k] = old && old[c.k] ? old[c.k] : today(); });
        return row;
      });
      h.kentat[f.k] = keep.concat(fresh);
      if (fresh.length) h.auto["t:" + f.k] = "sanelu"; else delete h.auto["t:" + f.k];
      if (fresh.length !== dictated.length || fresh.length) changes.push({ kentta: "taulukko", arvo: f.l + ": " + fresh.length + (fresh.length === 1 ? " lukema" : " lukemaa") });
    });
    // Yksittäiset kentät
    m.kentat.forEach((f) => {
      if (f.t === "table" || f.t === "date") return;
      if (!M.nakyy(h, f)) return;
      if (!hasText && !f.tilasta && f.k !== "asunto") return;
      const cur = h.kentat[f.k], isAuto = h.auto["k:" + f.k] === "sanelu" || (f.k === "tunnus" && h.auto.tunnus);
      if (cur && !isAuto && !(f.muista && h.auto["k:" + f.k] === "muisti")) {
        // muistettu arvo (esim. edellisen havainnon laite) saa vaihtua, jos sanelussa sanotaan toinen
        const mem = f.muista && Model.muistiGet(h.menetelma + "." + f.k);
        if (!(mem && cur === mem)) return;
      }
      let v = f.k === "asunto" ? asunto(h, t, Model) : scalarValue(f, t);
      if ((v == null || v === "") && f.tilasta) v = fromRoom(f, h, Model);
      if (v == null || v === "" || v === cur) return;
      h.kentat[f.k] = v;
      h.auto["k:" + f.k] = "sanelu";
      if (f.k === "tunnus") delete h.auto.tunnus;
      if (f.muista) Model.muistiSet(h.menetelma + "." + f.k, v);
      if (f.mittaus) h.vahvistettu = false;
      changes.push({ kentta: "kenttä", arvo: f.l + ": " + v + (f.u && f.t === "num" ? " " + f.u : "") });
    });
    // Tarkistuslistan puute (esim. saumoissa rakoja) on poikkeama, ellei tutkija ole itse valinnut tulosta
    const dev = M.kentat(h).find((f) => f.okv && h.kentat[f.k] && h.kentat[f.k] !== f.okv);
    if (dev && h.tulos !== "poikkeama" && (!h.tulos || (h.auto && h.auto.tulos))) {
      h.tulos = "poikkeama"; h.auto.tulos = "sanelu";
      changes.push({ kentta: "tulos", arvo: "Poikkeama (" + dev.l.toLowerCase() + ")" });
    }
    return changes;
  }

  /* Esimerkkilause puuttuvalle tiedolle: tutkija näkee, mitä sanoa */
  const HINTS = {
    laite: "mittalaite Vaisala HM40", tasaantuminen: "tasaantumisaika 3 vrk", mittaukset: "30 millissä 78 prosenttia 21 astetta",
    olosuhteet: "huoneilma 30 prosenttia 22 astetta", arvo: "lukema 45", vertailu: "vertailu 20", asteikko: "vertailuarvo",
    kerrokset: "kerrokset muovimatto, tasoite, betoni 80 mm", tyyppi: "mikrobinäyte", materiaali: "materiaali mineraalivilla",
    aine: "merkkiaine typpivety", injektointi: "injektointi lattian alta", tulos: "vuotoa havaittiin / ei vuotoa",
    t_sisa: "sisälämpötila 21 astetta", t_ulko: "ulkona miinus 5 astetta", paine: "paine-ero 5 pascalia", jakso: "jakso 7 vrk", tunnus: "piste M3"
  };
  function hint(f) {
    if (HINTS[f.k]) return HINTS[f.k];
    if (f.t === "select" && f.o && f.o.length) return f.o.slice(0, 2).join(" / ").toLowerCase();
    return f.l.toLowerCase() + (f.t === "num" ? " 12" + (f.u ? " " + f.u : "") : " …");
  }

  window.FieldFill = { apply, prep, tableRows, scalarValue, hint, wordsFor, FIELD_WORDS, get DEVICES() { return DEVICES; }, get MATERIALS() { return MATERIALS; } };
})();
