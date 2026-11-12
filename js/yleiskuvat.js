/* =========================================================================
   yleiskuvat.js – kohteen yleiskuvat

   Yleiskuva on kuva ilman sanelua tai havaintoa (julkisivut, tilat, piha …).
   Ne otetaan kameranäkymässä Yleiskuva-tilassa: jokainen laukaisu tallentuu
   heti nykyisen tilan kanssa. Raporttipaketissa kansio yleiskuvat/.
   Tallennus: kohde.yleiskuvat = [{ id, kuva, sijainti: {kerrosId, tilaId}, created, kuvateksti }]
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet } = UI;
  const { S, Model } = App;

  const lista = () => (S.kohde && S.kohde.yleiskuvat) || [];

  async function lisaa(blob, sijainti) {
    const k = S.kohde;
    const kuva = await DB.putFile(k.id, blob, { kind: "yleiskuva" });
    k.yleiskuvat = k.yleiskuvat || [];
    const y = { id: DB.uid("y_"), kuva, sijainti: { kerrosId: (sijainti && sijainti.kerrosId) || null, tilaId: (sijainti && sijainti.tilaId) || null }, created: Date.now(), kuvateksti: "" };
    k.yleiskuvat.push(y);
    await Model.saveKohde();
    return y;
  }

  /* Raportin järjestys: kerros, tila, ottoaika. Tunnus YK01 … */
  function jarjestetty() {
    const k = S.kohde;
    const ki = (id) => k.kerrokset.findIndex((e) => e.id === id);
    const ti = (id) => k.tilat.findIndex((t) => t.id === id);
    return lista().slice().sort((a, b) => ki(a.sijainti.kerrosId) - ki(b.sijainti.kerrosId) || (a.sijainti.tilaId ? 0 : 1) - (b.sijainti.tilaId ? 0 : 1) || ti(a.sijainti.tilaId) - ti(b.sijainti.tilaId) || a.created - b.created);
  }
  const tunnus = (i) => "YK" + String(i + 1).padStart(2, "0");

  function kohdeCard() {
    const k = S.kohde, n = lista().length;
    return '<a class="row seur-link" href="#/k/' + k.id + '/yleiskuvat" style="text-decoration:none;color:inherit;margin:-4px 0 12px;border-radius:12px">' +
      icon("image") + '<div class="grow"><div class="t">Yleiskuvat' + (n ? " (" + n + ")" : "") + '</div><div class="s">' +
      (n ? "Kuvat ilman havaintoa raporttia varten" : "Julkisivut, tilat ja piha ilman sanelua") + "</div></div>" + icon("back", "flip") + "</a>";
  }

  async function view() {
    const k = S.kohde;
    const l = jarjestetty();
    await Model.ensureUrls(l.map((y) => y.kuva));
    const root = document.getElementById("app");
    const ryhmat = [];
    l.forEach((y, i) => {
      const t = y.sijainti.tilaId && Model.tila(y.sijainti.tilaId);
      const nimi = t ? Model.tilaNimi(t) : "Tila ei tiedossa";
      let g = ryhmat[ryhmat.length - 1];
      if (!g || g.nimi !== nimi) ryhmat.push(g = { nimi, kuvat: [] });
      g.kuvat.push({ y, i });
    });
    root.innerHTML = App.topbar({ title: "Yleiskuvat", sub: l.length + " kuvaa · " + k.nimi, back: "#/k/" + k.id }) +
      '<main class="view">' +
      '<a class="btn btn-primary btn-block" href="#/k/' + k.id + '/kuvaus?yk=1" style="margin-bottom:14px">' + icon("cam") + "Ota yleiskuvia</a>" +
      (l.length ? ryhmat.map((g) => '<section class="card"><div class="card-h"><h2>' + esc(g.nimi) + '</h2><span class="meta">' + g.kuvat.length + "</span></div>" +
        '<div class="card-b yk-grid">' + g.kuvat.map(({ y, i }) => '<button class="yk-item" data-y="' + y.id + '"><img src="' + Model.url(y.kuva) + '" alt=""><span class="no">' + tunnus(i) + "</span>" +
          (y.kuvateksti ? '<span class="yk-cap">' + esc(y.kuvateksti) + "</span>" : "") + "</button>").join("") + "</div></section>").join("")
        : '<section class="card"><div class="empty">Ei vielä yleiskuvia. Yleiskuvat ovat kuvia ilman havaintoa, esim. julkisivut ja tilojen yleisnäkymät. Ne tulevat raporttipakettiin omaan kansioonsa.</div></section>') +
      "</main>" + App.fab("#/k/" + k.id + "/kuvaus?yk=1") + App.bottomnav("kohde");
    root.onclick = (e) => {
      const b = e.target.closest("[data-y]");
      if (b) muokkaa(b.dataset.y);
    };
    S.cleanup = () => { root.onclick = null; };
  }

  function muokkaa(id) {
    const y = lista().find((x) => x.id === id);
    if (!y) return;
    const t = () => { const tt = y.sijainti.tilaId && Model.tila(y.sijainti.tilaId); return tt ? Model.tilaNimi(tt) : "Valitse tila"; };
    sheet('<img src="' + Model.url(y.kuva) + '" alt="" style="width:100%;border-radius:12px;max-height:46vh;object-fit:contain;background:#000">' +
      '<button class="row" data-tila style="margin:10px 0">' + icon("pin") + '<div class="grow"><div class="t" data-tn>' + esc(t()) + '</div></div><span class="link">vaihda</span></button>' +
      '<label class="field"><span>Kuvateksti (valinnainen)</span><input type="text" data-cap value="' + esc(y.kuvateksti || "") + '" placeholder="esim. Julkisivu etelään"></label>' +
      '<div class="row-btns"><button class="btn" data-del>' + icon("trash") + "Poista</button><button class=\"btn btn-primary\" data-close>Valmis</button></div>",
    (el, close) => {
      const cap = el.querySelector("[data-cap]");
      cap.addEventListener("input", () => { y.kuvateksti = cap.value.trim(); });
      el.querySelector("[data-tila]").addEventListener("click", () => {
        Plan.locationSheet({ kerrosId: y.sijainti.kerrosId, tilaId: y.sijainti.tilaId, rakenneosa: null, piste: null }, async (s) => {
          y.sijainti = { kerrosId: s.kerrosId || null, tilaId: s.tilaId || null };
          await Model.saveKohde();
          el.querySelector("[data-tn]").textContent = t();
        });
      });
      el.querySelector("[data-del]").addEventListener("click", async () => {
        if (!confirm("Poistetaanko yleiskuva?")) return;
        S.kohde.yleiskuvat = lista().filter((x) => x !== y);
        await Model.saveKohde();
        try { await DB.del("tiedostot", y.kuva); } catch (e) { /* ohita */ }
        close();
      });
    }, { onClose: async () => { await Model.saveKohde(); if (/\/yleiskuvat$/.test(location.hash)) view(); } });
  }

  window.Yleiskuvat = { lisaa, lista, jarjestetty, tunnus, kohdeCard, view };
})();
