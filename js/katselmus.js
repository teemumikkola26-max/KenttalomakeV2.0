/* Katselmus ja aiemmat tutkimukset.
   - k.katselmus: katselmussuunnitelma, kun tutkimussuunnitelmaa ei vielä ole (Clauden paketista tai itse).
       { kysymykset: [{id, teksti, peruste, vastaus, tehty}],
         kierros:    [{id, teksti, peruste, tunnukset[], tilaIds[], tehty}],
         aineisto:   [{id, teksti, peruste, tehty}] }
   - k.aiemmat: aiempien tutkimusten tulokset, tiloihin sidottuina
       [{id, raportti, pvm, aihe, teksti, tunnukset[], tilaIds[], lahde}]
   Katselmus näkyy kohteen sivulla työlistana; aiemmat tulokset näkyvät tiloittain
   katselmuksessa ja havaintokortilla, jotta tutkija näkee kentällä, mitä tilassa on jo todettu. */
(function () {
  "use strict";
  const { S, Model } = App;
  const { esc, icon, toast } = UI;

  const LAJIT = [
    ["kysymykset", "Kysy paikan päällä", "Haastattelu: käyttäjät, huolto, kiinteistö"],
    ["kierros", "Katso kierroksella", "Aistinvarainen kierros ja olosuhteet"],
    ["aineisto", "Pyydä aineistoa", "Asiakirjat ja tiedot tutkimussuunnitelmaa varten"]
  ];

  function data(k) {
    k = k || S.kohde;
    const d = k.katselmus || { kysymykset: [], kierros: [], aineisto: [] };
    LAJIT.forEach(([l]) => { d[l] = d[l] || []; });
    return d;
  }
  function onKatselmus(k) { const d = (k || S.kohde).katselmus; return !!d && LAJIT.some(([l]) => (d[l] || []).length); }
  function edistyminen(k) {
    const d = data(k); let all = 0, done = 0;
    LAJIT.forEach(([l]) => d[l].forEach((x) => { all++; if (x.tehty) done++; }));
    return { all, done };
  }
  const tilaNimi = (t) => App.Model.tilaNimi(t);
  function havaintojaTiloissa(ids) { const s = new Set(ids || []); return S.havainnot.filter((h) => s.has(h.sijainti && h.sijainti.tilaId)).length; }

  /* Aiemmat tulokset tilalle (tai kaikki, jos tilaId puuttuu) */
  function aiemmat(tilaId) {
    const a = S.kohde.aiemmat || [];
    return tilaId ? a.filter((x) => (x.tilaIds || []).includes(tilaId)) : a;
  }
  function aiempiRivi(x) {
    return '<li><b>' + esc([x.raportti, x.pvm].filter(Boolean).join(" ")) + (x.aihe ? " · " + esc(x.aihe) : "") + ":</b> " + esc(x.teksti) + "</li>";
  }
  /* Havaintokortille: aiemmat tulokset valitussa tilassa */
  function aiemmatTilassaHtml(tilaId) {
    const a = tilaId ? aiemmat(tilaId) : [];
    if (!a.length) return "";
    return '<details class="aiemmat"><summary>' + icon("list") + "Aiemmat tutkimukset tässä tilassa (" + a.length + ")</summary><ul>" + a.map(aiempiRivi).join("") + "</ul></details>";
  }

  /* Kohteen sivulle: Aiemmat tutkimukset raporteittain (taitettu) */
  function aiemmatKorttiHtml() {
    const a = aiemmat();
    if (!a.length) return "";
    const rap = {};
    a.forEach((x) => { const r = [x.raportti, x.pvm].filter(Boolean).join(" ") || "Aiempi tutkimus"; (rap[r] = rap[r] || []).push(x); });
    return '<details class="card vocab"><summary class="card-h"><h2>Aiemmat tutkimukset</h2><span class="meta">' + Object.keys(rap).length + " raporttia · " + a.length + " tulosta</span></summary><div class=\"card-b\" style=\"padding-top:0\">" +
      Object.entries(rap).map(([r, xs]) => '<h3 class="as-ryhma">' + esc(r) + '</h3><ul class="aiemmat-l">' + xs.map((x) => {
        const tilat = (x.tilaIds || []).map((id) => Model.tila(id)).filter(Boolean).map(tilaNimi);
        return "<li>" + (x.aihe ? "<b>" + esc(x.aihe) + ":</b> " : "") + esc(x.teksti) + (tilat.length ? ' <span class="hint">(' + esc(tilat.join(", ")) + ")</span>" : (x.tunnukset || []).length ? ' <span class="hint">(' + esc(x.tunnukset.join(", ")) + ")</span>" : "") + "</li>";
      }).join("") + "</ul>").join("") + "</div></details>";
  }

  /* Kohteen sivulle: Seuraavaksi-kortti, kun katselmus on kesken eikä tutkimussuunnitelmaa ole */
  function seuraavaHtml() {
    const k = S.kohde;
    if (!onKatselmus(k)) return "";
    const e = edistyminen(k);
    if (e.done >= e.all) return "";
    const d = data(k), kesken = LAJIT.map(([l, n]) => [n, d[l].filter((x) => !x.tehty).length]).filter(([, n]) => n);
    return '<section class="next-card"><div class="nc-k">Seuraavaksi</div><div class="nc-t">Katselmus</div>' +
      '<div class="nc-s">' + esc(e.done + " / " + e.all + " tehty · " + kesken.map(([n, c]) => n.toLowerCase() + " " + c).join(", ")) + "</div>" +
      '<a class="btn nc-btn" href="#/k/' + k.id + '/katselmus">' + icon("list") + (e.done ? "Jatka" : "Aloita") + "</a></section>";
  }
  function korttiHtml() {
    const k = S.kohde;
    if (!onKatselmus(k)) return "";
    const e = edistyminen(k), d = data(k);
    return '<section class="card"><div class="card-h"><h2>Katselmus</h2><span class="meta">' + e.done + " / " + e.all + ' tehty</span><a class="link" href="#/k/' + k.id + '/katselmus">Avaa</a></div>' +
      LAJIT.map(([l, n]) => {
        const xs = d[l]; if (!xs.length) return "";
        const t = xs.filter((x) => x.tehty).length, valmis = t === xs.length;
        return '<a class="row pl-row ' + (valmis ? "valmis" : "kesken") + '" href="#/k/' + k.id + '/katselmus#' + l + '" style="text-decoration:none;color:inherit">' +
          (valmis ? '<span class="pl-m ok">' + icon("check") + "</span>" : '<span class="pl-m kesken"></span>') +
          '<div class="grow"><div class="t">' + esc(n) + "</div></div><span class=\"count\">" + t + "/" + xs.length + "</span></a>";
      }).join("") + "</section>";
  }

  /* ---------- Näkymä ---------- */
  let tallennusAjastin = null;
  function tallennaPian() {
    clearTimeout(tallennusAjastin);
    tallennusAjastin = setTimeout(() => Model.saveKohde(), 500);
  }

  async function view() {
    const k = S.kohde, d = data(k);
    k.katselmus = d;
    const kohta = (l, x) => {
      const tehty = x.tehty ? " tehty" : "";
      let lisa = "";
      if (l === "kysymykset") lisa = '<textarea class="ks-vast" data-vast="' + x.id + '" rows="2" placeholder="Vastaus (voit sanella näppäimistön mikrofonilla)">' + esc(x.vastaus || "") + "</textarea>";
      if (l === "kierros") {
        const tilat = (x.tilaIds || []).map((id) => Model.tila(id)).filter(Boolean);
        const n = havaintojaTiloissa(x.tilaIds);
        const aiem = [].concat(...tilat.map((t) => aiemmat(t.id))).filter((v, i, a) => a.indexOf(v) === i);
        lisa = (tilat.length ? '<div class="chips ks-tilat">' + tilat.map((t) =>
          '<a class="chip" href="#/k/' + k.id + "/kuvaus?tila=" + t.id + "&menetelma=aisti\">" + icon("cam") + esc(tilaNimi(t)) + "</a>").join("") + "</div>" : "") +
          ((x.tunnukset || []).length > tilat.length ? '<p class="hint" style="margin:4px 0 0">Tiloja ei löytynyt kohteelta: ' + esc(x.tunnukset.filter((u) => !tilat.some((t) => t.tunnus === u)).join(", ")) + "</p>" : "") +
          (n ? '<p class="hint" style="margin:4px 0 0">' + n + " havaintoa näissä tiloissa</p>" : "") +
          (aiem.length ? '<details class="aiemmat"><summary>Aiemmin todettu (' + aiem.length + ")</summary><ul>" + aiem.map(aiempiRivi).join("") + "</ul></details>" : "");
      }
      return '<div class="ks-kohta' + tehty + '" data-id="' + x.id + '">' +
        '<button class="ks-chk" data-tehty="' + l + ":" + x.id + '" aria-pressed="' + !!x.tehty + '" aria-label="Merkitse tehdyksi">' + icon("check") + "</button>" +
        '<div class="grow"><div class="t">' + esc(x.teksti) + "</div>" + (x.peruste ? '<div class="s">' + esc(x.peruste) + "</div>" : "") + lisa + "</div></div>";
    };
    const e = edistyminen(k);
    document.getElementById("app").innerHTML = App.topbar({ title: "Katselmus", sub: k.nimi + " · " + e.done + " / " + e.all + " tehty", back: "#/k/" + k.id }) +
      '<main class="view">' +
      (e.all ? "" : '<div class="alert info">' + icon("alert") + "<div>Katselmussuunnitelmaa ei ole. Sen saa Clauden lähtötietopaketista, kun tarjousta tai tutkimussuunnitelmaa ei vielä ole.</div></div>") +
      LAJIT.map(([l, n, s]) => d[l].length ? '<section class="card" id="' + l + '"><div class="card-h"><h2>' + esc(n) + '</h2><span class="meta">' + d[l].filter((x) => x.tehty).length + "/" + d[l].length + "</span></div>" +
        '<div class="card-b"><p class="hint" style="margin:0 0 8px">' + esc(s) + "</p>" + d[l].map((x) => kohta(l, x)).join("") + "</div></section>" : "").join("") +
      aiemmatKorttiHtml() +
      '<p class="hint" style="margin:8px 4px 0">Vastaukset ja merkinnät kulkevat viennissä raportointiin. Kun tutkimussuunnitelma on tehty, lisää menetelmät kohteen sivulta (Lisää → Muokkaa suunnitelmaa).</p>' +
      "</main>" + App.bottomnav("kohde");
    const app = document.getElementById("app"), root = app.querySelector("main");   // kuuntelijat näkymän omaan elementtiin
    root.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tehty]");
      if (!b) return;
      const [l, id] = b.dataset.tehty.split(":"), x = d[l].find((y) => y.id === id);
      if (!x) return;
      x.tehty = !x.tehty;
      b.setAttribute("aria-pressed", String(x.tehty));
      b.closest(".ks-kohta").classList.toggle("tehty", x.tehty);
      Model.saveKohde();
      const e2 = edistyminen(k), sub = app.querySelector(".tb-title .sub");
      if (sub) sub.textContent = k.nimi + " · " + e2.done + " / " + e2.all + " tehty";
    });
    root.addEventListener("input", (ev) => {
      const t = ev.target.closest("[data-vast]");
      if (!t) return;
      const x = d.kysymykset.find((y) => y.id === t.dataset.vast);
      if (!x) return;
      x.vastaus = t.value;
      if (t.value.trim() && !x.tehty) {          // vastaus kirjattu = kysytty
        x.tehty = true;
        const b = root.querySelector('[data-tehty="kysymykset:' + x.id + '"]');
        if (b) { b.setAttribute("aria-pressed", "true"); b.closest(".ks-kohta").classList.add("tehty"); }
      }
      tallennaPian();
    });
    S.cleanup = () => { clearTimeout(tallennusAjastin); Model.saveKohde(); };
    if (location.hash.indexOf("#", 1) > 0) { const el = document.getElementById(location.hash.split("#").pop()); if (el) el.scrollIntoView(); }
  }

  /* Vientiin: katselmus ja aiemmat */
  function vienti() {
    const k = S.kohde;
    const tilat = (ids) => (ids || []).map((id) => Model.tila(id)).filter(Boolean).map(tilaNimi);
    const out = {};
    if (onKatselmus(k)) {
      const d = data(k);
      out.katselmus = {
        kysymykset: d.kysymykset.map((x) => ({ kysymys: x.teksti, vastaus: x.vastaus || "", kysytty: !!x.tehty })),
        kierros: d.kierros.map((x) => ({ kohde: x.teksti, tilat: tilat(x.tilaIds), tehty: !!x.tehty })),
        aineistopyynnot: d.aineisto.map((x) => ({ pyynto: x.teksti, pyydetty: !!x.tehty }))
      };
    }
    if ((k.aiemmat || []).length) out.aiemmat_tutkimukset = k.aiemmat.map((x) => ({ raportti: x.raportti || "", pvm: x.pvm || "", aihe: x.aihe || "", tulos: x.teksti, tilat: tilat(x.tilaIds), lahde: x.lahde || undefined }));
    return out;
  }
  function vientiMd(j) {
    const L = [];
    if (j.katselmus) {
      L.push("## Katselmus", "");
      if (j.katselmus.kysymykset.length) { L.push("### Haastattelu"); j.katselmus.kysymykset.forEach((x) => L.push("- " + x.kysymys + (x.vastaus ? "\n  - Vastaus: " + x.vastaus : x.kysytty ? "" : " (ei kysytty)"))); L.push(""); }
      if (j.katselmus.kierros.length) { L.push("### Kierros"); j.katselmus.kierros.forEach((x) => L.push("- [" + (x.tehty ? "x" : " ") + "] " + x.kohde + (x.tilat.length ? " (" + x.tilat.join(", ") + ")" : ""))); L.push(""); }
      if (j.katselmus.aineistopyynnot.length) { L.push("### Aineistopyynnöt"); j.katselmus.aineistopyynnot.forEach((x) => L.push("- [" + (x.pyydetty ? "x" : " ") + "] " + x.pyynto)); L.push(""); }
    }
    if (j.aiemmat_tutkimukset) {
      L.push("## Aiemmat tutkimukset (lähtötiedot)", "");
      j.aiemmat_tutkimukset.forEach((x) => L.push("- " + [x.raportti, x.pvm].filter(Boolean).join(" ") + (x.aihe ? " · " + x.aihe : "") + ": " + x.tulos + (x.tilat.length ? " (" + x.tilat.join(", ") + ")" : "")));
      L.push("");
    }
    return L;
  }

  window.Katselmus = { LAJIT, data, onKatselmus, edistyminen, view, seuraavaHtml, korttiHtml, aiemmat, aiemmatTilassaHtml, aiemmatKorttiHtml, vienti, vientiMd };
})();
