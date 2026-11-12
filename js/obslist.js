/* =========================================================================
   obslist.js – havaintojen haku ja valinta

   Haku kohdistuu tunnukseen (H05), mittauspisteen tunnukseen (M3),
   sijaintiin, menetelmään, tulokseen ja saneluun. Kaikkien hakusanojen on
   löydyttävä ("keittiö lattia"). Isot kirjaimet ja ääkköset eivät haittaa.
   Järjestys: nykyisen tilan havainnot ensin, sitten viimeksi muokatut.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, sheet, nro } = UI;
  const { S, Model } = App;

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function haystack(h) {
    return norm([
      nro(h), "h" + h.nro, UI.nroLyhyt(h), h.kentat && h.kentat.tunnus,
      Model.sijaintiTeksti(h.sijainti), M.menetelma(h.menetelma).nimi, M.menetelma(h.menetelma).lyhyt,
      h.tulos ? M.TULOKSET[h.tulos] : "", h.sanelu, h.tulkinta
    ].filter(Boolean).join(" "));
  }

  function filter(list, q) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    return list.filter((h) => {
      const hs = haystack(h);
      return words.every((w) => hs.includes(w) || (/^h?0*\d+$/.test(w) && String(h.nro) === w.replace(/^h0*/, "")));
    });
  }

  function sorted(tilaId, exclude) {
    return S.havainnot.filter((h) => h.id !== exclude).slice().sort((a, b) => {
      const ta = tilaId && a.sijainti && a.sijainti.tilaId === tilaId ? 1 : 0;
      const tb = tilaId && b.sijainti && b.sijainti.tilaId === tilaId ? 1 : 0;
      return tb - ta || b.updated - a.updated;
    });
  }

  /* Yksi rivi: kuva, tunnus, sijainti, menetelmä ja sanelun alku */
  function rowHtml(h, opts) {
    opts = opts || {};
    const u = Model.url(h.kuvat[0]);
    const miss = window.Check ? Check.havaintoPuutteet(h).length : 0;
    const snip = (h.sanelu || "").trim();
    return '<div class="orow">' +
      '<button class="orow-main" data-oid="' + h.id + '">' +
      '<span class="thumb" style="width:56px;height:56px;flex:0 0 auto">' + (u ? '<img src="' + u + '" alt="">' : '<span class="nophoto">' + icon("cam") + "</span>") +
      (h.kuvat.length > 1 ? '<span class="no">' + h.kuvat.length + "</span>" : "") + (miss ? '<span class="warn">!</span>' : "") + "</span>" +
      '<span class="grow"><span class="t">' + nro(h) + (h.kentat && h.kentat.tunnus ? " · " + esc(h.kentat.tunnus) : "") + " · " + esc(Model.sijaintiTeksti(h.sijainti) || "Sijainti puuttuu") + "</span>" +
      '<span class="s">' + esc(M.menetelma(h.menetelma).nimi + (h.tulos ? " · " + M.TULOKSET[h.tulos] : "")) + "</span>" +
      '<span class="s snip">' + esc(snip ? (snip.length > 90 ? snip.slice(0, 90) + "…" : snip) : "Ei sanelua") + "</span></span></button>" +
      (opts.camera ? '<button class="icon-btn" data-ocam="' + h.id + '" aria-label="Lisää kuvia havaintoon ' + nro(h) + '">' + icon("cam") + "</button>" : "") +
      "</div>";
  }

  /* Valintaikkuna: Lisää aiempaan havaintoon */
  async function pick(opts) {
    await Model.ensureUrls(S.havainnot.map((h) => h.kuvat[0]).filter(Boolean));
    const base = sorted(opts.tilaId, opts.exclude);
    const t = opts.tilaId && Model.tila(opts.tilaId);
    sheet(
      "<h3>" + esc(opts.title || "Lisää aiempaan havaintoon") + "</h3>" +
      '<label class="mp-search" style="margin-bottom:10px">' + icon("list") +
      '<input type="search" data-q placeholder="Hae: H05, M3, keittiö, lattia…" aria-label="Hae havaintoa" autocomplete="off"></label>' +
      (opts.allowNew ? '<button class="btn btn-block" data-new style="margin-bottom:10px">' + icon("plus") + "Uusi havainto</button>" : "") +
      '<div class="olist" data-list></div>',
      (el, close) => {
        const list = el.querySelector("[data-list]"), q = el.querySelector("[data-q]");
        const paint = () => {
          const items = filter(base, q.value);
          let html = "", shownHead = false;
          items.forEach((h, i) => {
            const same = t && h.sijainti && h.sijainti.tilaId === t.id;
            if (i === 0 && same) html += '<div class="ohead">' + esc(Model.tilaNimi(t)) + "</div>";
            if (!same && !shownHead && t && !q.value) { html += '<div class="ohead">Muut</div>'; shownHead = true; }
            html += rowHtml(h);
          });
          list.innerHTML = html || '<div class="empty">Ei osumia.</div>';
        };
        q.addEventListener("input", paint);
        list.addEventListener("click", (e) => { const b = e.target.closest("[data-oid]"); if (b) { close(); opts.onSelect(b.dataset.oid); } });
        const nb = el.querySelector("[data-new]");
        if (nb) nb.addEventListener("click", () => { close(); opts.onSelect(null); });
        paint();
      }
    );
  }

  window.ObsList = { filter, sorted, rowHtml, pick, haystack };
})();
