/* =========================================================================
   vocab.js – muokattava sanasto

   Sanelun ja pohjakuvien tulkinnan sanalistat ovat tutkijan muokattavissa
   (Sanasto-sivu). Jokainen moduuli määrittelee listansa oletusarvoineen
   (Vocab.define), ja käyttää niitä Vocab.list-kutsulla. Muokattu lista
   tallennetaan laitteelle (asetukset/sanasto) ja korvaa oletuksen.
   Sanasto kulkee Vie menetelmät -tiedostossa, joten tiimi voi jakaa sen.

   Listatyypit:
     words  yksi sana tai sanan alku riville ("kondens" osuu sanoihin
            kondenssi, kondensoitunut)
     map    "sana = arvo" riville ("pko = pintakosteus", "MH = Makuuhuone")
   Rivi, joka alkaa #-merkillä, on kommentti.
   ========================================================================= */
(function () {
  "use strict";
  const defs = new Map();       // key -> { title, help, type, defaults, group, options }
  let user = {};                // key -> [rivit]
  const listeners = [];
  const cache = new Map();

  function define(key, d) { defs.set(key, d); cache.delete(key); }
  const clean = (lines) => lines.map((l) => String(l).trim()).filter((l) => l && !l.startsWith("#"));
  function parse(d, lines) {
    if (d.type === "map") {
      return clean(lines).map((l) => {
        const i = l.indexOf("=");
        return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null;
      }).filter((x) => x && x[0] && x[1]);
    }
    return clean(lines);
  }
  const toLines = (d, arr) => d.type === "map" ? arr.map((x) => x[0] + " = " + x[1]) : arr.slice();

  function list(key) {
    if (cache.has(key)) return cache.get(key);
    const d = defs.get(key);
    if (!d) return [];
    const v = user[key] ? parse(d, user[key]) : d.defaults.slice();
    cache.set(key, v);
    return v;
  }
  function lines(key) { const d = defs.get(key); return user[key] ? user[key].slice() : toLines(d, d.defaults); }
  function edited(key) { return !!user[key]; }
  function changed() { cache.clear(); listeners.forEach((f) => { try { f(); } catch (e) { console.warn(e); } }); }

  async function load() {
    try { const r = await DB.get("asetukset", "sanasto"); user = (r && r.listat) || {}; } catch (e) { user = {}; }
    changed();
  }
  async function save() { await DB.put("asetukset", { id: "sanasto", listat: user, muokattu: Date.now() }); }
  async function set(key, text) {
    const d = defs.get(key);
    const ls = String(text).split("\n");
    // sama kuin oletus -> ei tallenneta muokkauksena
    if (clean(ls).join("\n") === clean(toLines(d, d.defaults)).join("\n")) delete user[key];
    else user[key] = ls;
    changed(); await save();
  }
  async function reset(key) { delete user[key]; changed(); await save(); }
  function onChange(f) { listeners.push(f); }
  function all() { return Array.from(defs.entries()).map(([key, d]) => Object.assign({ key }, d)); }
  function exportAll() { return JSON.parse(JSON.stringify(user)); }
  async function importAll(x) {
    if (!x) return;
    Object.keys(x).forEach((k) => { if (Array.isArray(x[k])) user[k] = x[k].slice(); });
    changed(); await save();
  }

  window.Vocab = { define, list, lines, edited, set, reset, load, onChange, all, exportAll, importAll, parse };
})();
