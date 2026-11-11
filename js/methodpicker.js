/* =========================================================================
   methodpicker.js – Menetelmän valinta: ehdotukset + haku + uusi menetelmä
   Ehdotukset: valittu, edellinen ja tutkimussuunnitelman tekemättömät menetelmät.
   Haku ei välitä isoista kirjaimista eikä ääkkösistä ("lampo" -> Lämpökuvaus) ja
   löytää myös lyhenteellä ("RA"). Jos osumaa ei ole, hausta voi lisätä uuden menetelmän.
   Käyttö: MethodPicker.mount(el, { selected, excludeHavainto, dark, onSelect(id) })
   ========================================================================= */
(function () {
  "use strict";
  const { esc, toast } = UI;
  const { S, Model } = App;

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const SEARCH = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

  /* Edellinen menetelmä tässä kohteessa (ei nykyistä havaintoa) */
  function edellinen(excludeId) {
    const k = S.kohde;
    if (k && k.viimeisin && k.viimeisin.menetelma) return k.viimeisin.menetelma;
    const hs = (S.havainnot || []).filter((h) => h.id !== excludeId && h.menetelma).sort((a, b) => b.updated - a.updated);
    return hs.length ? hs[0].menetelma : null;
  }

  /* Tutkimussuunnitelman tekemättömät menetelmät: { id, tehty, maara } järjestyksessä */
  function suunnitelmasta() {
    const k = S.kohde;
    if (!k) return [];
    const out = [];
    k.suunnitelma.forEach((p) => {
      if (Model.kohtaValmis(p)) return;
      let o = out.find((x) => x.id === p.menetelma);
      if (!o) { o = { id: p.menetelma, tehty: 0, maara: 0 }; out.push(o); }
      o.tehty += Math.min(Model.kohtaTehty(p), p.maara || 1);
      o.maara += p.maara || 1;
    });
    return out;
  }

  function mount(el, opts) {
    let selected = opts.selected || null;
    let open = false;

    el.classList.add("mpick");
    if (opts.dark) el.classList.add("dark");
    el.innerHTML =
      '<div class="chips scroll" data-mp-sugg></div>' +
      '<label class="mp-search">' + SEARCH +
      '<input type="search" enterkeyhint="done" autocomplete="off" placeholder="Hae tai lisää menetelmä" aria-label="Hae menetelmää"></label>' +
      '<div class="mp-list hidden" role="listbox"></div>';
    const sugg = el.querySelector("[data-mp-sugg]");
    const input = el.querySelector("input");
    const list = el.querySelector(".mp-list");

    function suggestions() {
      const out = [];
      const add = (id, tag) => {
        const ex = id && out.find((x) => x.id === id);
        if (ex) { if (tag) ex.tag = ex.tag ? ex.tag + " · " + tag : tag; return; }
        if (!id) return;
        const m = M.MENETELMAT.find((x) => x.id === id);
        if (!m || (m.piilotettu && id !== selected)) return;
        out.push({ id, nimi: m.nimi, tag });
      };
      add(selected, null);
      const prev = edellinen(opts.excludeHavainto);
      if (prev !== selected) add(prev, "edellinen");
      suunnitelmasta().forEach((p) => add(p.id, p.tehty + "/" + p.maara));
      return out.slice(0, 6);
    }

    function paintSugg() {
      const s = suggestions();
      sugg.innerHTML = s.map((x) =>
        '<button type="button" class="chip" data-mp="' + esc(x.id) + '" aria-pressed="' + (x.id === selected) + '">' + esc(x.nimi) +
        (x.tag ? ' <span class="mp-tag">' + esc(x.tag) + "</span>" : "") + "</button>").join("");
      sugg.classList.toggle("hidden", !s.length);
      UI.showSelected(sugg);
    }

    function paintList() {
      const q = norm(input.value);
      const all = M.MENETELMAT.filter((m) => !m.piilotettu);
      // Ensisijaisesti sanan alusta (nimi tai lyhenne), muuten mistä kohtaa tahansa nimeä.
      const wordStart = (m) => norm(m.nimi).split(/[\s/,()-]+/).some((w) => w.startsWith(q)) || norm(m.lyhyt).startsWith(q);
      let hits = all;
      if (q) {
        hits = all.filter(wordStart);
        if (!hits.length) hits = all.filter((m) => norm(m.nimi).includes(q));
        hits.sort((a, b) => (norm(b.nimi).startsWith(q) ? 1 : 0) - (norm(a.nimi).startsWith(q) ? 1 : 0));
      }
      const exact = q && all.some((m) => norm(m.nimi) === q);
      list.innerHTML =
        hits.map((m) => '<button type="button" class="mp-row" role="option" data-mp="' + esc(m.id) + '" aria-selected="' + (m.id === selected) + '">' +
          esc(m.nimi) + (m.kentat.length ? ' <span class="mp-sub">' + m.kentat.length + (m.kentat.length === 1 ? " kenttä" : " kenttää") + "</span>" : "") + "</button>").join("") +
        (q && !exact && !hits.length ? '<button type="button" class="mp-row mp-new" data-mp-new>+ Lisää uusi menetelmä: <b>' + esc(input.value.trim()) + "</b></button>" : "") +
        (!hits.length && !q ? '<div class="mp-sub" style="padding:10px">Ei menetelmiä.</div>' : "");
      list.classList.toggle("hidden", !open);
    }

    function choose(id) {
      selected = id;
      input.value = "";
      open = false;
      input.blur();
      paintSugg(); paintList();
      if (S.kohde) {
        S.kohde.viimeisin = Object.assign({}, S.kohde.viimeisin || {}, { menetelma: id });
        Model.saveKohde();
      }
      opts.onSelect(id);
    }

    async function createNew() {
      const raw = input.value.trim();
      if (!raw) return;
      const nimi = raw.charAt(0).toUpperCase() + raw.slice(1);
      const m = { id: DB.uid("m_"), nimi, lyhyt: nimi.slice(0, 12), kentat: [] };
      M.MENETELMAT.push(m);
      await M.save();
      toast("Uusi menetelmä lisätty. Kenttiä voi lisätä Menetelmät-sivulla.", 3500);
      choose(m.id);
    }

    el.addEventListener("click", (e) => {
      const nb = e.target.closest("[data-mp-new]");
      if (nb) { e.preventDefault(); createNew(); return; }
      const b = e.target.closest("[data-mp]");
      if (b) { e.preventDefault(); e.stopPropagation(); if (b.dataset.mp !== selected || open) choose(b.dataset.mp); }
    });
    input.addEventListener("focus", () => { open = true; paintList(); });
    input.addEventListener("input", () => { open = true; paintList(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = list.querySelector("[data-mp]");
        const q = norm(input.value);
        if (first && q) choose(first.dataset.mp);
        else if (q) createNew();
      } else if (e.key === "Escape") { open = false; input.value = ""; input.blur(); paintList(); }
    });
    // Lista suljetaan, kun napautetaan muualle (pointerdown ennen blur-tapahtumaa).
    const outside = (e) => { if (open && !el.contains(e.target)) { open = false; input.value = ""; paintList(); } };
    document.addEventListener("pointerdown", outside, true);

    paintSugg(); paintList();
    return {
      set(id) { selected = id; paintSugg(); paintList(); },
      destroy() { document.removeEventListener("pointerdown", outside, true); }
    };
  }

  window.MethodPicker = { mount };
})();
