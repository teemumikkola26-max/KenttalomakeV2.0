/* =========================================================================
   learn.js – sovellus oppii, millainen kirjaus kuuluu millekin menetelmälle

   Naiivi Bayes -luokittelija, joka toimii kokonaan laitteella (ei verkkoa).
   Piirteet: sanelun sanat (taivutusmuodot yhdistetään sanan alun perusteella),
   sanojen viiden kirjaimen jaksot (suomen yhdyssanat: radonpurkki ~ purkki),
   numerot ja yksiköt sekä rakenneosa.

   Oppiminen: kun havainto valmistuu, sen sanelu ja menetelmä lisätään malliin.
     - tutkijan itse valitsema menetelmä: paino 2 (korjaus on vahva signaali)
     - automaattisesti tunnistettu tai oletus, jota ei muutettu: paino 0.5
       (pieni paino, jottei malli vahvista omia virheitään)
   Saman havainnon aiempi opetus perutaan ennen uutta, joten muokkaukset eivät
   kerrytä mallia moneen kertaan.

   Ennustaminen: vain kun avainsanat eivät tunnista menetelmää, esimerkkejä on
   riittävästi ja todennäköisyys on selvästi korkea (ks. RAJAT).
   ========================================================================= */
(function () {
  "use strict";

  const RAJAT = { minEsimerkit: 6, minMenetelmalle: 2, minTodennakoisyys: 0.85 };
  const STOP = new Set(["ja", "on", "oli", "ei", "se", "että", "kun", "tai", "myös", "sekä", "mutta", "jossa", "joka", "olla", "ovat", "siinä", "tässä", "tämä", "niin", "kuin", "noin", "vielä", "nyt", "sitten", "vähän", "hyvin", "kyllä"]);
  let model = null;   // { docs: { [menetelmaId]: paino }, words: { [menetelmaId]: { [sana]: paino } }, total: { [menetelmaId]: paino } }

  function empty() { return { docs: {}, words: {}, total: {}, versio: 1 }; }

  async function load() {
    try {
      const rec = await DB.get("asetukset", "oppi");
      model = rec && rec.malli ? rec.malli : empty();
    } catch (e) { model = empty(); }
  }
  async function save() { await DB.put("asetukset", { id: "oppi", malli: model, muokattu: Date.now() }); }

  /* Tilojen nimet eivät kerro menetelmästä: ne jätetään pois piirteistä. */
  const ROOM_STEMS = ["keitti", "kylpyh", "pesuhu", "sauna", "makuuh", "olohuo", "eteine", "eteise", "tuulik", "kodinh", "vaateh", "varast", "käytäv", "porras", "kellar", "ullakk", "autota", "ruokai", "työhuo", "luokka", "toimis", "pukuhu", "kerhoh", "kuivau", "siivou", "komero", "parvek", "terass", "makuu"];

  /* Sanelusta piirteet sanoittain: [[sanan alku, ~jakso, ~jakso...], ...] */
  function featureGroups(h) {
    const txt = String(h.sanelu || "").toLowerCase().normalize("NFC");
    const groups = [];
    (txt.match(/[\p{L}]+|\d+(?:[.,]\d+)?|%/gu) || []).forEach((w) => {
      if (/^\d/.test(w)) { groups.push(["#luku"]); return; }
      if (w === "%") { groups.push(["#pros"]); return; }
      if (w.length < 3 || STOP.has(w)) return;
      if (["mm", "cm", "pa", "rh"].includes(w)) { groups.push(["#" + w]); return; }
      if (ROOM_STEMS.some((r) => w.startsWith(r))) return;
      const g = [w.slice(0, 6)];                     // karkea vartalo: porareiästä -> porare
      // Yhdyssanojen osat: viiden kirjaimen jaksot (radonpurkki ~ purkki)
      if (w.length >= 6) for (let i = 0; i + 5 <= w.length; i++) g.push("~" + w.slice(i, i + 5));
      groups.push(g);
    });
    if (/\d\s*(mm|cm)\b/u.test(txt)) groups.push(["#syvyys"]);
    if (h.sijainti && h.sijainti.rakenneosa) groups.push(["osa:" + h.sijainti.rakenneosa]);
    // Sama sana kahdesti ei tuo lisänäyttöä
    const seen = new Set();
    return groups.filter((g) => { const k = g[0]; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function features(h) { return Array.from(new Set([].concat.apply([], featureGroups(h)))); }

  function add(id, feats, w) {
    model.docs[id] = Math.max(0, (model.docs[id] || 0) + w);
    model.words[id] = model.words[id] || {};
    feats.forEach((f) => {
      model.words[id][f] = Math.max(0, (model.words[id][f] || 0) + w);
      if (!model.words[id][f]) delete model.words[id][f];
    });
    model.total[id] = Math.max(0, (model.total[id] || 0) + w * feats.length);
    if (!model.docs[id]) { delete model.docs[id]; delete model.words[id]; delete model.total[id]; }
  }

  /* Havainto valmistui: opetetaan (tai päivitetään aiempi opetus) */
  async function learn(h) {
    if (!model) await load();
    if (!h || !h.menetelma || !(h.sanelu || "").trim()) return;
    const feats = features(h);
    if (!feats.length) return;
    const a = h.auto && h.auto.menetelma;
    const w = a ? 0.5 : 2;          // käsin valittu painaa enemmän kuin automaattinen
    const prev = h.opittu;
    if (prev && prev.m === h.menetelma && prev.w === w && prev.f.join("|") === feats.join("|")) return;
    if (prev) add(prev.m, prev.f, -prev.w);
    add(h.menetelma, feats, w);
    h.opittu = { m: h.menetelma, f: feats, w };
    await save();
  }

  /* Ennuste: { id, p } tai null */
  function predict(h) {
    if (!model) return null;
    const ids = Object.keys(model.docs).filter((id) => M.MENETELMAT.some((m) => m.id === id && !m.piilotettu));
    const N = ids.reduce((s, id) => s + model.docs[id], 0);
    if (N < RAJAT.minEsimerkit || ids.length < 2) return null;
    const groups = featureGroups(h);
    if (!groups.length) return null;
    const vocab = new Set();
    ids.forEach((id) => Object.keys(model.words[id] || {}).forEach((w) => vocab.add(w)));
    const V = vocab.size + 1;
    const knownGroups = groups.map((g) => g.filter((f) => vocab.has(f))).filter((g) => g.length);
    if (!knownGroups.length) return null;           // ei yhtään tuttua sanaa: ei arvata
    const TEMPER = (window.Learn && window.Learn._temper) || 1.0;                               // tasoitus: pieni aineisto tekee mallista muuten ylivarman
    const logp = ids.map((id) => {
      let lp = Math.log((model.docs[id] + 1) / (N + ids.length));
      const tot = model.total[id] || 0;
      const ll = (f) => Math.log(((model.words[id] || {})[f] || 0) + 0.5) - Math.log(tot + 0.5 * V);
      // Jokainen sana on yksi "ääni": sanan alku + sen jaksojen keskiarvo
      knownGroups.forEach((g) => {
        const head = g[0].startsWith("~") ? null : g[0];
        const parts = g.filter((f) => f.startsWith("~"));
        let v = 0, n = 0;
        if (head) { v += ll(head); n++; }
        if (parts.length) { v += parts.reduce((a, f) => a + ll(f), 0) / parts.length; n++; }
        lp += TEMPER * (v / n);
      });
      return { id, lp };
    });
    const mx = Math.max.apply(null, logp.map((x) => x.lp));
    const sum = logp.reduce((s, x) => s + Math.exp(x.lp - mx), 0);
    logp.forEach((x) => { x.p = Math.exp(x.lp - mx) / sum; });
    logp.sort((a, b) => b.p - a.p);
    const best = logp[0];
    if (best.p < RAJAT.minTodennakoisyys || (model.docs[best.id] || 0) < RAJAT.minMenetelmalle) return null;
    return { id: best.id, p: best.p };
  }

  function stats() {
    if (!model) return { yhteensa: 0, menetelmittain: {} };
    const per = {};
    Object.keys(model.docs).forEach((id) => { per[id] = Math.round(model.docs[id] * 10) / 10; });
    return { yhteensa: Object.values(per).reduce((a, b) => a + b, 0), menetelmittain: per };
  }

  async function reset() { model = empty(); await save(); }
  function exportModel() { return model ? JSON.parse(JSON.stringify(model)) : null; }
  /* Tuotu malli yhdistetään laskemalla painot yhteen */
  async function importModel(m) {
    if (!m || !m.docs) return;
    if (!model) await load();
    Object.keys(m.docs).forEach((id) => {
      model.docs[id] = (model.docs[id] || 0) + m.docs[id];
      model.total[id] = (model.total[id] || 0) + (m.total[id] || 0);
      model.words[id] = model.words[id] || {};
      Object.entries(m.words[id] || {}).forEach(([w, c]) => { model.words[id][w] = (model.words[id][w] || 0) + c; });
    });
    await save();
  }

  window.Learn = { load, learn, predict, stats, reset, exportModel, importModel, features, featureGroups, RAJAT };
})();
