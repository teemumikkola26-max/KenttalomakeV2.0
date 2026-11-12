/* =========================================================================
   autofill.js – tiedot täyttyvät sanelusta ja kontekstista

   Tavoite: havainnon kirjaaminen vie saman ajan kuin pelkkä kuvaaminen.
   Sanelusta tunnistetaan menetelmä, tila, rakenneosa ja tulos. Lisäksi
   suunnitelman kohta ja mittauspisteen tunnus täytetään automaattisesti.

   Periaatteet:
     - Automaattinen arvo ei koskaan korvaa tutkijan itse valitsemaa arvoa.
       h.auto[kenttä] = true kertoo, että arvo on täytetty automaattisesti;
       käyttäjän valinta poistaa merkinnän.
     - Tunnistus on tarkoituksella varovainen: epäselvässä tilanteessa arvo
       jätetään tyhjäksi (lähtötarkistus muistuttaa).
     - ZIP-paketti kertoo, mitkä arvot on tunnistettu sanelusta.
   ========================================================================= */
(function () {
  "use strict";
  const { S, Model } = App;

  const norm = (s) => " " + String(s || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}%]+/gu, " ").replace(/\s+/g, " ").trim() + " ";
  // Sana, joka alkaa annetulla vartalolla (taivutusmuodot: keittiö -> keittiössä)
  /* Sanaston sana on sanan alku ("kondens" osuu sanaan "kondenssi"). Lainausmerkeissä tai
     enintään kahden kirjaimen sana ("us", "ap") on kokonainen sana. */
  const stemRe = (stem) => {
    let st = String(stem).trim(), exact = false;
    if (/^".*"$/.test(st)) { st = st.slice(1, -1); exact = true; }
    st = st.toLowerCase();
    if (st.replace(/[^a-zåäö0-9]/g, "").length <= 2) exact = true;
    return new RegExp("(^| )" + st.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, " \\S* ?") + (exact ? "(?=$|[ ,.;:!?-])" : ""), "u");
  };
  const has = (t, stem) => stemRe(stem).test(t);

  /* ---------- Menetelmät ---------- */
  const METHOD_WORDS = {
    rh: ["rh mittau", "rh mitta", "rh piste", "rh anturi", "rh ", "suhteellinen kosteus", "suhteellisen kostey", "suhteellista kosteutta", "porareiä", "porarei", "porareik",
      "rakennekosteu", "rakenteen kostey", "viiltomittau", "viiltomenetelm", "kosteusmittaukset", "rakennekosteusmittau", "putkimittau", "mittausputk", "kosteusmittaus rakenteesta", "tasaantumisaik", "mittaussyvyy", "mittauspiste", "vaisala", "hm40", "hm42"],
    pintakosteus: ["pintakostey", "pintakosteu", "pko", "pko-arvo", "pko arvo", "yksikköä", "pinta-anturi", "b55", "b50", "hydrotest", "kosteudenosoitin", "pintakosteusmittar", "kosteuskartoitu", "gann", "hydromette", "tramex", "protimeter", "pintakosteusosoitin", "vertailukoh", "vertailuarv"],
    avaus: ["rakenneavau", "rakennetyyppiselvity", "avauskoh", "avauskohda", "ra1", "ra2", "ra3", "avaus", "avaukse", "avattiin", "avasimme", "avattu", "purettiin", "tarkastusaukko", "kurkistusaukko", "kurkistusreik", "rakennekerrokse", "kerrokset sisältä"],
    nayte: ["näyte", "näytte", "mik1", "mikrobimateriaalinäyte", "voc-materiaalinäyte", "voc-ilmanäyte", "mikrobi-ilmanäyte", "ilmanäyte", "laskeumanäyte", "geeliteippinäyte", "pyyhintäpölynäyte", "pölynäyte", "pölynkoostumusnäyte", "pah-näyte", "pcb-näyte", "materiaalinäyte", "mikrobinäyte", "asbestinäyte", "haitta-ainenäyte", "näytepala", "näytteenot", "otettiin näyte", "kuitunäyte", "pah näyte", "voc näyte"],
    merkkiaine: ["merkkiain", "merkkikaasu", "merkkiainevuoto", "merkkiaineanalysaattori", "alipaineist", "sensistor", "mak1", "typpived", "tiiviyskoe", "tiiviysmittau", "tiiviystarkastelu", "injektoi", "vuotoilmaa", "ilmavuoto"],
    lampokuvaus: ["lämpökuva", "lämpökamer", "lämpösäteily", "termografi", "pintalämpötil", "lämpötilaindeksi", "flir", "hikmicro", "kylmäsilta", "kylmävuoto"],
    mtk: ["märkätilakartoitu", "märkätilatarkast", "märkätilan kunto", "märkätilojen kunto"],
    paine: ["painesuhte", "paine ero", "paine-ero", "paineero", "dp-calc", "dp calc", "paine-eromittari", "alipain", "ylipain", "ilmavirta", "ilmavirra", "ilmamäärä", "tuloilmamäär", "poistoilmamäär", "painesuhdeseuran"]
  };
  function detectMethod(t) {
    const hits = [];
    M.MENETELMAT.forEach((m) => {
      if (m.piilotettu || m.seuranta || m.kohdetaso) return;
      for (const w of methodWords(m)) { if (!w.trim()) continue; const i = t.search(stemRe(w.trim())); if (i >= 0) { hits.push({ id: m.id, i }); break; } }
    });
    // Itse lisätyt menetelmät nimen perusteella (esim. "Radonmittaus")
    M.MENETELMAT.forEach((m) => {
      if (m.piilotettu || m.seuranta || m.kohdetaso || methodWords(m).length) return;
      const n = norm(m.nimi).trim();
      if (n.length >= 5) { const i = t.indexOf(" " + n.slice(0, Math.max(5, n.length - 2))); if (i >= 0) hits.push({ id: m.id, i }); }
    });
    if (!hits.length) return null;
    hits.sort((a, b) => a.i - b.i);
    return hits[0].id;
  }

  // Menetelmän tunnistussanat: menetelmäeditorissa muokatut tai oletukset
  const methodWords = (m) => Array.isArray(m.sanat) ? m.sanat : (METHOD_WORDS[m.id] || []);

  /* ---------- Tulos ---------- */
  const OK_DEF = ["ei huomautettava", "ei poikkeam", "ei poikkeav", "ei vaurio", "ei merkkejä", "ei viitteitä", "ei havaittu", "ei todettu", "ei havaintoja", "ei kosteutta", "ei kohonnei", "ei mikrobi",
    "ei toimenpiderajan ylity", "ei havaittu puutteita", "ei viitettä", "pääosin tavanomai", "ei mikrobikasvu", "kuiva", "kunnossa", "ehjä", "ehjät", "normaali", "normaaleja", "normaalit", "moitteeton", "hyväkuntoi", "hyvässä kunnossa", "tavanomai", "kuiva", "kuivat", "kuivia", "tiivis", "tiiviit", "asianmukai", "vaatimusten mukai", "tasaantun hyvin"];
  const BAD_DEF = ["vaurio", "vaurioitu", "kosteusvaurio", "vesivaurio", "mikrobi", "home", "hilseil", "halkea", "halkeil", "irtoa", "irronnut", "irti", "kupru", "kuplii", "tummu", "värjäy", "kopo", "laho", "lahoa", "ruoste", "ruostu", "haju", "vuoto", "vuota", "märkä", "märkiä", "kostea", "kosteita", "koholla", "kohonnut", "puutteel", "rikkoutu", "rikki", "rako", "painum", "poikkeama", "korjattava", "huono", "heikko", "pullistu", "turpoa", "kastunut", "kastuu", "tippuu", "tiivistyy", "jäätyy", "vetää", "kosteusjälk", "vesijälk", "vuotojälk", "jälki", "jälkiä", "läikk", "laikk", "valum", "sammal", "levä",
    "mikrobikasvu", "homekasvu", "hometta", "homeinen", "kosteusrasit", "kondens", "huurre", "huurtee", "korroosi", "ruosteinen", "murtunut", "murtuma", "rapautu", "lohkeil", "lohkea", "haljen",
    "lahonnut", "lahovauri", "vesivahin", "vuotanut", "tummentum", "värimuuto", "kuplii", "kuplia", "irtoill", "ummehtun", "tunkkai", "maakellari", "tiivistym", "virheellin", "riittämät",
    "puuttuu", "puuttuva", "vajaa", "vanhentun", "elinkaaren", "käyttöikä", "ylittän", "läpivientivuoto", "vuotokoh", "ilmavuoto", "vuotoilma", "kylmäsilta", "kylmävuoto", "alunoin", "kuura", "kuurassa", "kasvust", "lammikoi", "vaihtokunno", "ikääntyn", "irvistä", "löysä", "kuitulähte", "epätiiv", "merkkiainevuoto", "kohollaan", "kohonne",
    "mikrobiperäi", "vaurioepäily", "vauriolaaj", "toimenpiderajan ylit", "viitearvon ylit", "kosteusvaurioindikaattori", "indikaattorimikrob", "stachybotrys", "sädesien", "aktinomykeet",
    "ilmayhtey", "sisäilmayhtey", "lievästi kohol", "hieman kohon", "painunut", "kallistus väärä", "vastakaato"];
  function detectTulos(t) {
    let bad = false, ok = false, negated = false;
    // Aina poikkeama, myös kieltomuodossa ("ei vedeneristettä")
    for (const p of Vocab.list("poikkeamaLauseet")) if (has(t, p)) return "poikkeama";
    for (const p of Vocab.list("kunnossa")) if (has(t, p)) { ok = true; break; }
    for (const s of Vocab.list("poikkeama")) {
      const re = new RegExp(stemRe(s).source, "gu");
      let m;
      while ((m = re.exec(t))) {
        // menetelmän nimi ei ole havainto: "mikrobinäyte", "kosteusmittaus", "vuotokohtien merkkiainekoe"
        const st = m.index + m[1].length, word = t.slice(st, t.indexOf(" ", st + 1) < 0 ? t.length : t.indexOf(" ", st + 1));
        if (/(näyte|näytt|analyy|mittau|kartoitu|tutkimu|koe$|kokee)/u.test(word)) continue;
        const before = t.slice(Math.max(0, m.index - 24), m.index + 1);
        const words = before.trim().split(" ").slice(-3).join(" ") + " ";
        if (/(^| )(ei|eikä|eivät|ilman|ole) /u.test(" " + words)) { negated = true; continue; }   // "ei homeen merkkejä"
        bad = true; break;
      }
      if (bad) break;
    }
    if (bad) return "poikkeama";
    if (ok || negated) return "ok";   // esim. "ei ole kosteusvaurion merkkejä"
    return null;
  }

  /* ---------- Rakenneosa ---------- */
  const PART_DEF = [
    ["ulkoseinä", "Ulkoseinä"], ["ulkoseinä", "Ulkoseinä"], ["sokkeli", "Liittymä"], ["väliseinä", "Väliseinä"],
    ["välipohja", "Välipohja"], ["yläpohja", "Yläpohja / katto"], ["katto", "Yläpohja / katto"], ["katon", "Yläpohja / katto"], ["kato", "Yläpohja / katto"],
    ["alapohja", "Alapohja / lattia"], ["lattia", "Alapohja / lattia"], ["laatta", "Alapohja / lattia"], ["maanvarai", "Alapohja / lattia"],
    ["ikkuna", "Ikkuna / ovi"], ["karmi", "Ikkuna / ovi"], ["ovi", "Ikkuna / ovi"], ["oven", "Ikkuna / ovi"], ["ovea", "Ikkuna / ovi"],
    ["lattiakaivo", "Märkätila"], ["suihku", "Märkätila"], ["vedeneriste", "Märkätila"],
    ["nurkka", "Liittymä"], ["nurkassa", "Liittymä"], ["liittymä", "Liittymä"], ["rajassa", "Liittymä"],
    ["ilmanvaihto", "IV / tekniikka"], ["venttiili", "IV / tekniikka"], ["putki", "IV / tekniikka"], ["viemäri", "IV / tekniikka"], ["patteri", "IV / tekniikka"],
    // lisää rakenneosia
    ["vesikatto", "Yläpohja / katto"], ["kattorakenne", "Yläpohja / katto"], ["räystä", "Yläpohja / katto"], ["ullakko", "Yläpohja / katto"], ["kattoikkuna", "Yläpohja / katto"], ["aluskate", "Yläpohja / katto"],
    ["lattiarakenne", "Alapohja / lattia"], ["maanvastai", "Alapohja / lattia"], ["ryömintätila", "Alapohja / lattia"], ["lattiapinnoite", "Alapohja / lattia"], ["muovimatto", "Alapohja / lattia"], ["parketti", "Alapohja / lattia"], ["pintalaatta", "Alapohja / lattia"],
    ["ulkoverhous", "Ulkoseinä"], ["julkisivu", "Ulkoseinä"], ["rappaus", "Ulkoseinä"], ["kellarinseinä", "Ulkoseinä"], ["maanvastainen seinä", "Ulkoseinä"], ["seinärunko", "Ulkoseinä"],
    ["ikkunapenk", "Ikkuna / ovi"], ["ikkunalau", "Ikkuna / ovi"], ["vesipelti", "Ikkuna / ovi"], ["kynny", "Ikkuna / ovi"], ["ulko-ovi", "Ikkuna / ovi"], ["parvekeovi", "Ikkuna / ovi"],
    ["kaivo", "Märkätila"], ["vedeneristy", "Märkätila"], ["laatoitu", "Märkätila"], ["silikonisauma", "Märkätila"], ["suihkunurk", "Märkätila"], ["kylpyamme", "Märkätila"],
    ["alaohjauspuu", "Liittymä"], ["alajuoksu", "Liittymä"], ["perusmuuri", "Liittymä"], ["sokkelin", "Liittymä"], ["läpivien", "Liittymä"], ["saumaus", "Liittymä"],
    ["us", "Ulkoseinä"], ["us-rakente", "Ulkoseinä"], ["tuulensuojavill", "Ulkoseinä"], ["runkovill", "Ulkoseinä"], ["tuuletusra", "Ulkoseinä"], ["ulkoverhou", "Ulkoseinä"],
    ["ap", "Alapohja / lattia"], ["ap-laatta", "Alapohja / lattia"], ["lattiakorotu", "Alapohja / lattia"], ["kaksoislaat", "Alapohja / lattia"], ["lankkulattia", "Alapohja / lattia"], ["puukoolau", "Alapohja / lattia"], ["alustäyttö", "Alapohja / lattia"],
    ["yp", "Yläpohja / katto"], ["puhallusvilla", "Yläpohja / katto"], ["harvalaudoitu", "Yläpohja / katto"], ["tarkastusluuk", "Yläpohja / katto"], ["alakato", "Yläpohja / katto"], ["alakatt", "Yläpohja / katto"], ["alaslaskutila", "Yläpohja / katto"],
    ["vs", "Väliseinä"], ["pielilaudoitu", "Ikkuna / ovi"], ["laude", "Märkätila"], ["lauteet", "Märkätila"], ["jakotuk", "IV / tekniikka"], ["perusmuuri", "Liittymä"],
    ["ilmanvaihtokone", "IV / tekniikka"], ["tuloilma", "IV / tekniikka"], ["poistoilma", "IV / tekniikka"], ["kanava", "IV / tekniikka"], ["lattialämmity", "IV / tekniikka"], ["vesijohto", "IV / tekniikka"], ["lämminvesivaraaja", "IV / tekniikka"], ["kiuas", "IV / tekniikka"]
  ];
  function detectPart(t) {
    // "lattian rajassa" on lattian ja seinän liittymä: lattia mainitaan ensin -> Alapohja / lattia.
    let best = null;
    for (const [stem, part] of Vocab.list("rakenneosat")) {
      if (!M.RAKENNEOSAT.includes(part)) continue;
      const i = t.search(stemRe(stem));
      if (i >= 0 && (!best || i < best.i || (i === best.i && stem.length > best.len))) best = { i, part, len: stem.length };
    }
    return best ? best.part : null;
  }

  /* ---------- Tila ---------- */
  const ROOM_DEF = [
    ["keittiö", "Keittiö"], ["kylpyhuone", "Kylpyhuone"], ["kph", "Kylpyhuone"], ["pesuhuone", "Pesuhuone"], ["sauna", "Sauna"], ["löylyhuone", "Sauna"],
    ["wc", "WC"], ["vessa", "WC"], ["makuuhuone", "Makuuhuone"], ["olohuone", "Olohuone"], ["eteinen", "Eteinen"], ["eteise", "Eteinen"],
    ["tuulikaappi", "Tuulikaappi"], ["tuulikaapi", "Tuulikaappi"], ["kodinhoitohuone", "Kodinhoitohuone"], ["khh", "Kodinhoitohuone"],
    ["vaatehuone", "Vaatehuone"], ["varasto", "Varasto"], ["tekninen tila", "Tekninen tila"], ["teknise tila", "Tekninen tila"], ["teknisessä tila", "Tekninen tila"],
    ["lämmönjakohuone", "Lämmönjakohuone"], ["pannuhuone", "Pannuhuone"], ["käytävä", "Käytävä"], ["käytävä", "Käytävä"], ["porrashuone", "Porrashuone"],
    ["autotalli", "Autotalli"], ["ruokailutila", "Ruokailutila"], ["työhuone", "Työhuone"],
    ["luokkahuone", "Luokkahuone"], ["toimisto", "Toimisto"], ["aula", "Aula"], ["ryömintätila", "Ryömintätila"], ["pukuhuone", "Pukuhuone"],
    ["kerhohuone", "Kerhohuone"], ["kuivaushuone", "Kuivaushuone"], ["siivouskomero", "Siivouskomero"], ["komero", "Komero"], ["parveke", "Parveke"], ["terassi", "Terassi"],
    ["apukeittiö", "Apukeittiö"], ["ruokakomero", "Ruokakomero"], ["keittokomero", "Keittokomero"], ["kylmiö", "Kylmiö"], ["ullakko", "Ullakko"], ["ullako", "Ullakko"], ["kellari", "Kellari"],
    ["kattilahuone", "Kattilahuone"], ["öljysäiliöhuone", "Öljysäiliöhuone"], ["väestönsuoja", "Väestönsuoja"], ["jätehuone", "Jätehuone"], ["kuisti", "Kuisti"], ["lasikuisti", "Lasikuisti"],
    ["irtaimistovarasto", "Irtaimistovarasto"], ["ulkovarasto", "Ulkovarasto"], ["puuvarasto", "Puuvarasto"], ["autokatos", "Autokatos"], ["askarteluhuone", "Askarteluhuone"],
    ["takkahuone", "Takkahuone"], ["harrastehuone", "Harrastehuone"], ["pukeutumishuone", "Pukeutumishuone"], ["lastenhuone", "Makuuhuone"], ["vierashuone", "Makuuhuone"],
    ["sähköpääkeskus", "Sähköpääkeskus"], ["sähkötila", "Sähkötila"], ["iv konehuone", "IV-konehuone"], ["iv-konehuone", "IV-konehuone"], ["konehuone", "Konehuone"], ["hissi", "Hissi"],
    ["luokka", "Luokka"], ["opettajainhuone", "Opettajainhuone"], ["liikuntasali", "Liikuntasali"], ["ruokasali", "Ruokasali"], ["neuvotteluhuone", "Neuvotteluhuone"], ["taukotila", "Taukotila"],
    ["sosiaalitila", "Sosiaalitila"], ["arkisto", "Arkisto"], ["kirjasto", "Kirjasto"], ["lepohuone", "Lepohuone"], ["vastaanotto", "Vastaanotto"], ["odotustila", "Odotustila"], ["suihkutila", "Pesuhuone"], ["inva wc", "Inva-WC"]
  ];
  function detectRoom(t, kerrosId) {
    const k = S.kohde;
    // 1) Olemassa oleva tila tunnuksen tai nimen perusteella ("K03", "keittiössä")
    let best = null;
    const esc2 = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Tunnus ensin ("A101", "a 101", "K03"): yksiselitteinen
    k.tilat.forEach((r) => {
      if (!r.tunnus || !/\d/.test(r.tunnus)) return;
      const c = esc2(norm(r.tunnus).trim().replace(/\s+/g, "")).replace(/([a-zåäö])(\d)/g, "$1 ?$2");
      const i = t.search(new RegExp("(^| )" + c + "($| |[.,])", "u"));
      if (i >= 0 && (!best || i < best.i)) best = { i, id: r.id };
    });
    if (best) return { id: best.id };
    // Nimi ("keittiössä"): vain jos nimi on yksiselitteinen (kymmenestä WC:stä ei arvata)
    const byName = {};
    k.tilat.forEach((r) => {
      if (!r.nimi || r.nimi.length < 3) return;
      const c = norm(r.nimi).trim().slice(0, Math.max(3, norm(r.nimi).trim().length - 1));
      const i = t.search(new RegExp("(^| )" + esc2(c), "u"));
      if (i >= 0) (byName[c] = byName[c] || { i, list: [] }).list.push(r);
    });
    Object.values(byName).forEach((g) => {
      let pick = g.list.length === 1 ? g.list[0] : g.list.filter((r) => r.kerrosId === kerrosId).length === 1 ? g.list.find((r) => r.kerrosId === kerrosId) : null;
      if (pick && (!best || g.i < best.i)) best = { i: g.i, id: pick.id };
      if (!pick && (!best || g.i < best.i)) best = { i: g.i, ambiguous: true };
    });
    if (best && best.id) return { id: best.id };
    if (best && best.ambiguous) return null;
    // 2) Yleinen tilan nimi -> uusi tila
    let v = null;
    Vocab.list("tilat").forEach(([stem, name]) => { const i = t.search(stemRe(stem)); if (i >= 0 && (!v || i < v.i)) v = { i, name }; });
    return v ? { create: v.name } : null;
  }

  async function ensureRoom(name, kerrosId) {
    const k = S.kohde;
    let kid = kerrosId || (k.kerrokset[0] && k.kerrokset[0].id);
    if (!kid) {
      const e = { id: DB.uid("e_"), nimi: "Kerros 1", planId: null, w: 0, h: 0 };
      k.kerrokset.push(e);
      kid = e.id;
    }
    const ex = k.tilat.find((r) => r.kerrosId === kid && norm(r.nimi).trim() === norm(name).trim());
    if (ex) return ex;
    const r = { id: DB.uid("t_"), tunnus: "", nimi: name, kerrosId: kid, pos: null, merkinta: null, auto: true };
    k.tilat.push(r);
    await Model.saveKohde();
    return r;
  }

  /* ---------- Suunnitelman kohta ---------- */
  function autoKohta(h) {
    const k = S.kohde;
    if (!h.menetelma || !k.suunnitelma.length) return false;
    if (h.suunnitelmaId && !(h.auto && h.auto.kohta)) return false;   // käyttäjä valitsi itse
    const same = k.suunnitelma.filter((p) => p.menetelma === h.menetelma && !p.pois);
    let pick = null;
    if (!same.length) pick = "ei";
    else {
      const open = same.filter((p) => Model.kohtaTehty(p) - (h.suunnitelmaId === p.id ? 1 : 0) < (p.maara || 1));
      const tilaMatch = open.find((p) => p.tilaId && p.tilaId === h.sijainti.tilaId);
      pick = (tilaMatch || open[0] || same[same.length - 1]).id;
    }
    if (pick === h.suunnitelmaId) return false;
    h.suunnitelmaId = pick;
    h.auto = Object.assign({}, h.auto, { kohta: true });
    return true;
  }

  /* ---------- Juokseva tunnus (M1 -> M2, RA1 -> RA2) ---------- */
  const TUNNUS_PREFIX = { rh: "M", avaus: "RA", nayte: "MIK", merkkiaine: "MAK" };
  function autoTunnus(h) {
    const m = M.menetelma(h.menetelma);
    const f = m.kentat.find((x) => x.k === "tunnus" && x.t === "text");
    if (!f || (h.kentat.tunnus && !(h.auto && h.auto.tunnus))) return false;
    const used = S.havainnot.filter((x) => x.id !== h.id && x.menetelma === h.menetelma && x.kentat && x.kentat.tunnus).map((x) => String(x.kentat.tunnus));
    // Näytetyypin oma etuliite (MIK, VOC, AS …) ensin; numerointi etuliitteittäin
    const tf = m.kentat.find((x) => x.etuliitteet && h.kentat[x.k]);
    const tyyppiPrefix = tf ? tf.etuliitteet[h.kentat[tf.k]] || null : null;
    if (tyyppiPrefix) {
      const re = new RegExp("^" + tyyppiPrefix + "(\\d+)$", "i");
      const mx = used.reduce((a, u) => { const q = String(u).match(re); return q ? Math.max(a, +q[1]) : a; }, 0);
      const v = tyyppiPrefix + (mx + 1);
      if (h.kentat.tunnus === v || (h.kentat.tunnus && String(h.kentat.tunnus).startsWith(tyyppiPrefix) && /^\D+\d+$/.test(h.kentat.tunnus) && String(h.kentat.tunnus).match(/^\D+/)[0] === tyyppiPrefix)) return false;
      h.kentat.tunnus = v; h.auto = Object.assign({}, h.auto, { tunnus: true }); return true;
    }
    let prefix = (m.etuliite && m.etuliite.trim().toUpperCase()) || TUNNUS_PREFIX[m.id] || (m.lyhyt || "P").replace(/[^A-Za-zÅÄÖåäö]/g, "").slice(0, 3).toUpperCase() || "P";
    let max = 0;
    used.forEach((u) => {
      const mm = u.match(/^(.*?)(\d+)\s*$/);
      if (mm) { const n = parseInt(mm[2], 10); if (n >= max) { max = n; prefix = mm[1] || prefix; } }
    });
    const val = prefix + (max + 1);
    if (h.kentat.tunnus === val) return false;
    h.kentat.tunnus = val;
    h.auto = Object.assign({}, h.auto, { tunnus: true });
    return true;
  }

  /* ---------- Kaikki yhdellä kertaa ---------- */
  /* Palauttaa listan muutoksista: [{ kentta, arvo }] */
  /* Tutkija voi ottaa sanelusta täytön pois käytöstä (Sanasto-sivu). Sanelu tallentuu silti. */
  function enabled() { try { return localStorage.getItem("ks.autofill") !== "0"; } catch (e) { return true; } }
  function setEnabled(on) { try { localStorage.setItem("ks.autofill", on ? "1" : "0"); } catch (e) { /* ohita */ } }
  async function apply(h) {
    h.auto = h.auto || {};
    if (!enabled()) return [];
    const t = norm(h.sanelu);
    const changes = [];
    const canSet = (key, cur) => !cur || h.auto[key];

    let mid = detectMethod(t);
    // Märkätilakartoitus sisältää pintakosteuden ja aistinvaraisen: "pko 45" ei vaihda menetelmää
    if (mid && h.menetelma && (M.menetelma(h.menetelma).sisaltaa || []).includes(mid)) mid = h.menetelma;
    if (mid && canSet("menetelma", h.menetelma) && mid !== h.menetelma) {
      h.menetelma = mid; h.auto.menetelma = "sanelu"; h.vahvistettu = false;
      changes.push({ kentta: "menetelmä", arvo: M.menetelma(mid).nimi });
    } else if (!mid && canSet("menetelma", h.menetelma) && window.Learn) {
      // Avainsanat eivät tunnistaneet: kokeillaan opittua mallia (vain selvät tapaukset).
      const pred = Learn.predict(h);
      if (pred && pred.id !== h.menetelma) {
        h.menetelma = pred.id; h.auto.menetelma = "opittu"; h.vahvistettu = false;
        changes.push({ kentta: "menetelmä", arvo: M.menetelma(pred.id).nimi + " (opittu)" });
      }
    }
    // Näytteenotossa tulos tulee laboratoriosta: "mikrobi" ei ole kentällä poikkeama
    const tul = h.menetelma && M.menetelma(h.menetelma).tulosVapaa ? null : detectTulos(t);
    if (tul && canSet("tulos", h.tulos) && tul !== h.tulos) {
      h.tulos = tul; h.auto.tulos = "sanelu";
      changes.push({ kentta: "tulos", arvo: M.TULOKSET[tul] });
    }
    const room = detectRoom(t, h.sijainti.kerrosId);
    if (room && canSet("tila", h.sijainti.tilaId)) {
      let r = room.id ? Model.tila(room.id) : null;
      if (!r && room.create) r = await ensureRoom(room.create, h.sijainti.kerrosId);
      if (r && r.id !== h.sijainti.tilaId) {
        if (h.sijainti.kerrosId !== r.kerrosId) h.sijainti.piste = null;
        h.sijainti.tilaId = r.id; h.sijainti.kerrosId = r.kerrosId; h.auto.tila = "sanelu";
        changes.push({ kentta: "tila", arvo: Model.tilaNimi(r) + (r.auto && room.create ? " (uusi)" : "") });
      }
    }
    const part = detectPart(t);
    // Tila vaihtui sanelussa: edellisestä havainnosta tuotu rakenneosa ei enää päde.
    if (!part && changes.some((c) => c.kentta === "tila") && h.auto.rakenneosa === true) { h.sijainti.rakenneosa = null; delete h.auto.rakenneosa; }
    if (part && canSet("rakenneosa", h.sijainti.rakenneosa) && part !== h.sijainti.rakenneosa) {
      h.sijainti.rakenneosa = part; h.auto.rakenneosa = "sanelu";
      changes.push({ kentta: "rakenneosa", arvo: part });
    }
    // Kuntoarvion rakennusosa sanelusta ("räystäskourut" -> Vesikattovarusteet)
    if (window.Kuntoarvio && Kuntoarvio.aktiivinen() && canSet("kaOsa", h.kaOsa)) {
      const ko = Kuntoarvio.tunnistaOsa(h.sanelu);
      if (ko && ko !== h.kaOsa) { h.kaOsa = ko; h.auto.kaOsa = "sanelu"; changes.push({ kentta: "rakennusosa", arvo: Kuntoarvio.osa(ko).nimi }); }
    }
    if (autoKohta(h)) changes.push({ kentta: "suunnitelma", arvo: h.suunnitelmaId === "ei" ? "ei suunnitelmassa" : Model.kohtaNimi(Model.kohta(h.suunnitelmaId)) });
    if (autoTunnus(h)) changes.push({ kentta: "tunnus", arvo: h.kentat.tunnus });
    // Menetelmän kentät sanelusta (mittalaite, lukemat, kerrokset ...)
    if (window.FieldFill && h.menetelma) FieldFill.apply(h).forEach((c) => changes.push(c));
    return changes;
  }

  /* Käyttäjä valitsi itse: merkintä pois, jolloin sanelu ei enää muuta arvoa. */
  function manual(h, key) { if (h.auto) delete h.auto[key]; }

  /* Konteksti edellisestä havainnosta (sijainti, menetelmä) on myös automaattinen arvo. */
  function markCarried(h) {
    h.auto = h.auto || {};
    if (h.menetelma) h.auto.menetelma = true;
    if (h.sijainti.tilaId) h.auto.tila = true;
    if (h.sijainti.rakenneosa) h.auto.rakenneosa = true;
  }

  /* ---------- Muokattavat sanalistat (Sanasto-sivu) ---------- */
  Vocab.define("poikkeama", { group: "Sanelu: tulos", title: "Poikkeamaa kuvaavat sanat", type: "words", defaults: BAD_DEF,
    help: "Kun sanelussa on jokin näistä, tulos on Poikkeama. Kieltomuoto kääntää tuloksen (\"ei homeen merkkejä\" = kunnossa). Sana on sanan alku: \"kondens\" osuu sanoihin kondenssi ja kondensoitunut." });
  Vocab.define("poikkeamaLauseet", { group: "Sanelu: tulos", title: "Aina poikkeama, myös kieltomuodossa", type: "words",
    defaults: ["ei vedeneriste", "ei havaittu vedeneriste", "vedeneriste puuttu", "ei tuuletusrako", "ei selkeää tuulettuvuu", "ei sulkeudu", "ei sulkeutunut", "ei reunanost", "ei kallistu", "ei tiivis"],
    help: "Puutteet, jotka ilmaistaan kieltona: \"pesuhuoneessa ei havaittu vedeneristettä\"." });
  Vocab.define("kunnossa", { group: "Sanelu: tulos", title: "Kunnossa olevaa kuvaavat", type: "words", defaults: OK_DEF,
    help: "Kun sanelussa on jokin näistä eikä poikkeamaa, tulos on Ei huomautettavaa." });
  Vocab.define("rakenneosat", { group: "Sanelu: sijainti", title: "Rakenneosat", type: "map", defaults: PART_DEF, options: () => M.RAKENNEOSAT,
    help: "sana = rakenneosa. Ensimmäisenä sanelussa mainittu ratkaisee. Lyhyet sanat (us, ap, yp) ovat kokonaisia sanoja." });
  Vocab.define("tilat", { group: "Sanelu: sijainti", title: "Tilojen nimet", type: "map", defaults: ROOM_DEF,
    help: "sana = tilan nimi. Jos kohteessa ei vielä ole tilaa, se luodaan tällä nimellä. Kohteen omat tilat ja tunnukset (A101) tunnistetaan aina." });

  window.Auto = { enabled, setEnabled, METHOD_WORDS, methodWords, TUNNUS_PREFIX, apply, manual, markCarried, autoKohta, autoTunnus, _detect: { detectMethod, detectTulos, detectPart, detectRoom, norm, stemRe } };
})();
