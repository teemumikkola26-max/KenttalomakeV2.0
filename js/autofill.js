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
  const stemRe = (stem) => new RegExp("(^| )" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, " \\S* ?"), "u");
  const has = (t, stem) => stemRe(stem).test(t);

  /* ---------- Menetelmät ---------- */
  const METHOD_WORDS = {
    rh: ["rh mittau", "rh mitta", "suhteellinen kosteus", "suhteellisen kostey", "porareiä", "porarei", "rakennekosteu", "viiltomittau", "rh anturi", "rh "],
    pintakosteus: ["pintakostey", "pintakosteu", "kosteudenosoitin", "pintakosteusmittar"],
    avaus: ["rakenneavau", "avaus", "avaukse", "avattiin", "avasimme", "avattu"],
    nayte: ["näyte", "näytte", "materiaalinäyte"],
    merkkiaine: ["merkkiain", "merkkikaasu", "tiiviyskoe", "tiiviysmittau"],
    lampokuvaus: ["lämpökuva", "lämpökamer", "termografi"],
    paine: ["painesuhte", "paine ero", "paine-ero", "ilmavirta", "ilmavirra"]
  };
  function detectMethod(t) {
    const hits = [];
    for (const [id, words] of Object.entries(METHOD_WORDS)) {
      if (!M.MENETELMAT.some((m) => m.id === id && !m.piilotettu)) continue;
      for (const w of words) { const i = t.search(stemRe(w.trim())); if (i >= 0) { hits.push({ id, i }); break; } }
    }
    // Itse lisätyt menetelmät nimen perusteella (esim. "Radonmittaus")
    M.MENETELMAT.forEach((m) => {
      if (m.piilotettu || METHOD_WORDS[m.id]) return;
      const n = norm(m.nimi).trim();
      if (n.length >= 5) { const i = t.indexOf(" " + n.slice(0, Math.max(5, n.length - 2))); if (i >= 0) hits.push({ id: m.id, i }); }
    });
    if (!hits.length) return null;
    hits.sort((a, b) => a.i - b.i);
    return hits[0].id;
  }

  /* ---------- Tulos ---------- */
  const OK_PHRASES = ["ei huomautettava", "ei poikkeam", "ei vaurio", "ei merkkejä", "ei viitteitä", "ei havaittu", "kunnossa", "ehjä", "ehjät", "normaali", "moitteeton", "hyväkuntoi", "hyvässä kunnossa", "tavanomai"];
  const BAD_STEMS = ["vaurio", "vaurioitu", "kosteusvaurio", "vesivaurio", "mikrobi", "home", "hilseil", "halkea", "halkeil", "irtoa", "irronnut", "irti", "kupru", "kuplii", "tummu", "värjäy", "kopo", "laho", "lahoa", "ruoste", "ruostu", "haju", "vuoto", "vuota", "märkä", "märkiä", "kostea", "kosteita", "koholla", "kohonnut", "puutteel", "rikkoutu", "rikki", "rako", "painum", "poikkeama", "korjattava", "huono", "heikko", "pullistu", "turpoa", "kastunut", "kastuu", "tippuu", "tiivistyy", "jäätyy", "vetää"];
  function detectTulos(t) {
    let bad = false, ok = false, negated = false;
    for (const p of OK_PHRASES) if (has(t, p)) { ok = true; break; }
    for (const s of BAD_STEMS) {
      const re = new RegExp("(^| )" + s, "gu");
      let m;
      while ((m = re.exec(t))) {
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
  const PART_WORDS = [
    ["ulkoseinä", "Ulkoseinä"], ["ulkoseinä", "Ulkoseinä"], ["sokkeli", "Liittymä"], ["väliseinä", "Väliseinä"],
    ["välipohja", "Välipohja"], ["yläpohja", "Yläpohja / katto"], ["katto", "Yläpohja / katto"], ["katon", "Yläpohja / katto"], ["kato", "Yläpohja / katto"],
    ["alapohja", "Alapohja / lattia"], ["lattia", "Alapohja / lattia"], ["laatta", "Alapohja / lattia"], ["maanvarai", "Alapohja / lattia"],
    ["ikkuna", "Ikkuna / ovi"], ["karmi", "Ikkuna / ovi"], ["ovi", "Ikkuna / ovi"], ["oven", "Ikkuna / ovi"], ["ovea", "Ikkuna / ovi"],
    ["lattiakaivo", "Märkätila"], ["suihku", "Märkätila"], ["vedeneriste", "Märkätila"],
    ["nurkka", "Liittymä"], ["nurkassa", "Liittymä"], ["liittymä", "Liittymä"], ["rajassa", "Liittymä"],
    ["ilmanvaihto", "IV / tekniikka"], ["venttiili", "IV / tekniikka"], ["putki", "IV / tekniikka"], ["viemäri", "IV / tekniikka"], ["patteri", "IV / tekniikka"]
  ];
  function detectPart(t) {
    // "lattian rajassa" on lattian ja seinän liittymä: lattia mainitaan ensin -> Alapohja / lattia.
    let best = null;
    for (const [stem, part] of PART_WORDS) {
      if (!M.RAKENNEOSAT.includes(part)) continue;
      const i = t.search(stemRe(stem));
      if (i >= 0 && (!best || i < best.i || (i === best.i && stem.length > best.len))) best = { i, part, len: stem.length };
    }
    return best ? best.part : null;
  }

  /* ---------- Tila ---------- */
  const ROOM_VOCAB = [
    ["keittiö", "Keittiö"], ["kylpyhuone", "Kylpyhuone"], ["kph", "Kylpyhuone"], ["pesuhuone", "Pesuhuone"], ["sauna", "Sauna"], ["löylyhuone", "Sauna"],
    ["wc", "WC"], ["vessa", "WC"], ["makuuhuone", "Makuuhuone"], ["olohuone", "Olohuone"], ["eteinen", "Eteinen"], ["eteise", "Eteinen"],
    ["tuulikaappi", "Tuulikaappi"], ["tuulikaapi", "Tuulikaappi"], ["kodinhoitohuone", "Kodinhoitohuone"], ["khh", "Kodinhoitohuone"],
    ["vaatehuone", "Vaatehuone"], ["varasto", "Varasto"], ["tekninen tila", "Tekninen tila"], ["teknise tila", "Tekninen tila"], ["teknisessä tila", "Tekninen tila"],
    ["lämmönjakohuone", "Lämmönjakohuone"], ["pannuhuone", "Pannuhuone"], ["käytävä", "Käytävä"], ["käytävä", "Käytävä"], ["porrashuone", "Porrashuone"],
    ["autotalli", "Autotalli"], ["ruokailutila", "Ruokailutila"], ["työhuone", "Työhuone"],
    ["luokkahuone", "Luokkahuone"], ["toimisto", "Toimisto"], ["aula", "Aula"], ["ryömintätila", "Ryömintätila"], ["pukuhuone", "Pukuhuone"],
    ["kerhohuone", "Kerhohuone"], ["kuivaushuone", "Kuivaushuone"], ["siivouskomero", "Siivouskomero"], ["komero", "Komero"], ["parveke", "Parveke"], ["terassi", "Terassi"]
  ];
  function detectRoom(t, kerrosId) {
    const k = S.kohde;
    // 1) Olemassa oleva tila tunnuksen tai nimen perusteella ("K03", "keittiössä")
    let best = null;
    k.tilat.forEach((r) => {
      const cands = [];
      if (r.tunnus) cands.push(norm(r.tunnus).trim().replace(/ /g, " ?"));
      if (r.nimi && r.nimi.length >= 3) cands.push(norm(r.nimi).trim().slice(0, Math.max(3, norm(r.nimi).trim().length - 1)));
      cands.forEach((c) => {
        const i = t.search(new RegExp("(^| )" + c, "u"));
        if (i >= 0 && (!best || i < best.i || (i === best.i && r.kerrosId === kerrosId))) best = { i, id: r.id };
      });
    });
    if (best) return { id: best.id };
    // 2) Yleinen tilan nimi -> uusi tila
    let v = null;
    ROOM_VOCAB.forEach(([stem, name]) => { const i = t.search(stemRe(stem)); if (i >= 0 && (!v || i < v.i)) v = { i, name }; });
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
  const TUNNUS_PREFIX = { rh: "M", avaus: "RA", nayte: "N", merkkiaine: "MAK" };
  function autoTunnus(h) {
    const m = M.menetelma(h.menetelma);
    const f = m.kentat.find((x) => x.k === "tunnus" && x.t === "text");
    if (!f || (h.kentat.tunnus && !(h.auto && h.auto.tunnus))) return false;
    const used = S.havainnot.filter((x) => x.id !== h.id && x.menetelma === h.menetelma && x.kentat && x.kentat.tunnus).map((x) => String(x.kentat.tunnus));
    let prefix = TUNNUS_PREFIX[m.id] || (m.lyhyt || "P").replace(/[^A-Za-zÅÄÖåäö]/g, "").slice(0, 3).toUpperCase() || "P";
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
  async function apply(h) {
    h.auto = h.auto || {};
    const t = norm(h.sanelu);
    const changes = [];
    const canSet = (key, cur) => !cur || h.auto[key];

    const mid = detectMethod(t);
    if (mid && canSet("menetelma", h.menetelma) && mid !== h.menetelma) {
      h.menetelma = mid; h.auto.menetelma = "sanelu"; h.vahvistettu = false;
      changes.push({ kentta: "menetelmä", arvo: M.menetelma(mid).nimi });
    }
    const tul = detectTulos(t);
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
    if (autoKohta(h)) changes.push({ kentta: "suunnitelma", arvo: h.suunnitelmaId === "ei" ? "ei suunnitelmassa" : Model.kohtaNimi(Model.kohta(h.suunnitelmaId)) });
    if (autoTunnus(h)) changes.push({ kentta: "tunnus", arvo: h.kentat.tunnus });
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

  window.Auto = { apply, manual, markCarried, autoKohta, autoTunnus, _detect: { detectMethod, detectTulos, detectPart, detectRoom, norm } };
})();
