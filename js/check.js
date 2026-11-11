/* =========================================================================
   check.js – Lähtötarkistus
   Kokoaa puutteet tutkimussuunnitelmaa, tiloja ja havaintojen pakollisia
   tietoja vasten. Vienti avautuu, kun puutteet on tehty tai perusteltu.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, promptSheet, confirmSheet, nro } = UI;
  const { S, Model } = App;

  function tyhja(v) { return v == null || String(v).trim() === ""; }

  /* Palauttaa listan: { tyyppi, id, otsikko, selite, toiminto, toimintoTeksti } */
  function puutteet() {
    const k = S.kohde;
    if (!k) return [];
    const out = [];

    k.suunnitelma.forEach((p) => {
      if (Model.kohtaValmis(p)) return;
      const tehty = Model.kohtaTehty(p);
      out.push({
        tyyppi: "kohta", id: p.id, otsikko: Model.kohtaNimi(p),
        selite: "Suunnitelmassa " + (p.maara || 1) + ", tehty " + tehty + ".",
        toimintoTeksti: "Tee nyt"
      });
    });

    k.tilat.forEach((t) => {
      if (Model.tilaStatus(t) !== "ei_tutkittu") return;
      const kerros = Model.kerros(t.kerrosId);
      out.push({
        tyyppi: "tila", id: t.id, otsikko: "Tila " + Model.tilaNimi(t),
        selite: (kerros ? kerros.nimi + ". " : "") + "Ei havaintoja eikä merkintää.",
        toimintoTeksti: "Tarkasta"
      });
    });

    S.havainnot.forEach((h) => {
      const m = M.menetelma(h.menetelma);
      const puuttuu = havaintoPuutteet(h);
      if (!puuttuu.length) return;
      out.push({
        tyyppi: "havainto", id: h.id, otsikko: nro(h.nro) + " · " + (Model.sijaintiTeksti(h.sijainti) || m.nimi),
        selite: "Puuttuu: " + puuttuu.join(", ") + ".",
        toimintoTeksti: "Täydennä"
      });
    });
    return out;
  }

  /* Yhden havainnon puuttuvat tiedot (havaintokortti, kohdenäkymä ja lähtötarkistus) */
  function havaintoPuutteet(h) {
    const k = S.kohde;
    const m = M.menetelma(h.menetelma);
    const puuttuu = [];
    if (!h.kuvat.length && !h.sanelu && !(h.aanitteet || []).length) puuttuu.push("kuva tai sanelu");
    if (!h.sijainti || !h.sijainti.tilaId) puuttuu.push("tila");
    if (!h.menetelma) puuttuu.push("menetelmä");
    if (!h.tulos) puuttuu.push("tulos");
    m.kentat.forEach((f) => {
      if (f.t === "table") {
        const rows = M.rivit(h, f);
        if (f.req && !rows.length) { puuttuu.push(f.l.toLowerCase()); return; }
        const pcols = (f.sarakkeet || []).filter((c) => c.req && !c.ryhma);
        const vajaat = rows.filter((r) => pcols.some((c) => tyhja(r[c.k])) && Meter.rowState(r) !== "reading").length;
        if (vajaat) puuttuu.push("puuttuvia lukemia (" + vajaat + " riviä)");
        const g = M.ryhmaSarake(f);
        if (g && rows.some((r) => tyhja(r[g.k]))) puuttuu.push(g.l.toLowerCase() + " puuttuu riviltä");
        Meter.rowIssues(h, f).forEach((x) => puuttuu.push(x));
        return;
      }
      if (f.req && tyhja(h.kentat[f.k])) puuttuu.push(f.l.toLowerCase());
    });
    if (m.id === "avaus" && !h.kuvat.length) puuttuu.push("kuva avauksesta");
    if (k.suunnitelma.length && !h.suunnitelmaId) puuttuu.push("suunnitelman kohta");
    return puuttuu;
  }

  function yhteenveto(list) {
    const n = (t) => list.filter((x) => x.tyyppi === t).length;
    const parts = [];
    if (n("kohta")) parts.push(n("kohta") + " suunnitelman kohtaa tekemättä");
    if (n("tila")) parts.push(n("tila") + (n("tila") === 1 ? " tila" : " tilaa") + " tutkimatta");
    if (n("havainto")) parts.push(n("havainto") + (n("havainto") === 1 ? " havainnosta" : " havainnosta") + " puuttuu tietoja");
    return parts.join(", ") + ".";
  }

  async function view() {
    const k = S.kohde;
    const list = puutteet();
    await Model.ensureUrls(list.filter((x) => x.tyyppi === "havainto").map((x) => { const h = Model.havainto(x.id); return h && h.kuvat[0]; }).filter(Boolean));
    const cnt = { tarkastettu: 0, poikkeama: 0, ei_paasya: 0, ei_tutkittu: 0 };
    k.tilat.forEach((t) => { cnt[Model.tilaStatus(t)]++; });
    const stat = (key, bg) => '<div class="' + M.TILASTATUS[key].cls + '" style="border-radius:9px"><b>' + cnt[key] + "</b><span>" + M.TILASTATUS[key].l + "</span></div>";

    const groups = [
      ["kohta", "Tutkimussuunnitelma"],
      ["tila", "Tilat"],
      ["havainto", "Havainnot"]
    ];
    let body = "";
    groups.forEach(([t, title]) => {
      const items = list.filter((x) => x.tyyppi === t);
      if (!items.length) return;
      body += '<h2 style="font-size:15px;margin:16px 2px 8px">' + title + " (" + items.length + ")</h2>";
      items.forEach((x) => {
        const hv = t === "havainto" ? Model.havainto(x.id) : null;
        const needTulos = hv && !hv.tulos;
        const img = hv && hv.kuvat[0] ? '<img class="todo-img" src="' + Model.url(hv.kuvat[0]) + '" alt="">' : "";
        body += '<div class="todo"><div class="tt">' + img + '<div><div class="t">' + esc(x.otsikko) + '</div><div class="s">' + esc(x.selite) + "</div>" +
          (hv && hv.sanelu ? '<div class="s" style="font-style:italic;margin-top:2px">' + esc(hv.sanelu.length > 120 ? hv.sanelu.slice(0, 120) + "…" : hv.sanelu) + "</div>" : "") + "</div></div>" +
          '<div class="acts">' +
          (needTulos ? '<button class="btn btn-sm" data-a="qtulos" data-v="poikkeama" data-id="' + x.id + '">Poikkeama</button><button class="btn btn-sm" data-a="qtulos" data-v="ok" data-id="' + x.id + '">Ei huomautettavaa</button>' : "") +
          '<button class="btn btn-sm btn-dark" data-a="do" data-t="' + t + '" data-id="' + x.id + '">' + esc(x.toimintoTeksti) + "</button>" +
          (t === "kohta" ? '<button class="btn btn-sm" data-a="pois" data-id="' + x.id + '">Jätetään pois + syy</button>' : "") +
          (t === "tila" ? '<button class="btn btn-sm" data-a="eip" data-id="' + x.id + '">Ei pääsyä + syy</button>' : "") +
          "</div></div>";
      });
    });

    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Lähtötarkistus", sub: "Ennen kuin poistut kohteesta", back: "#/k/" + k.id }) +
      '<main class="view">' +
      (k.tilat.length ? '<div class="stats">' + stat("tarkastettu") + stat("poikkeama") + stat("ei_paasya") + stat("ei_tutkittu") + "</div>" : "") +
      (!k.suunnitelma.length ? '<div class="alert info">' + icon("alert") + "<div>Tutkimussuunnitelmaa ei ole kirjattu, joten tarkistus kattaa vain tilat ja havainnot.</div></div>" : "") +
      (list.length ? body : '<div class="done-ok">' + icon("ok") + "Ei puutteita. Aineisto on valmis vietäväksi.</div>") +
      '<div style="margin-top:18px"><button class="btn btn-primary btn-block" data-a="export"' + (list.length ? " disabled" : "") + ">" + icon("download") + "Vie aineisto raportointiin</button>" +
      '<p class="hint" style="text-align:center">Kuvat, sanelut ja vahvistetut tiedot jäsenneltynä ZIP-pakettina AI-työkalulle.' + (list.length ? " Avautuu, kun puutteet on tehty tai perusteltu." : "") + "</p>" +
      (list.length ? '<div style="text-align:center"><button class="link" data-a="exportAnyway">Vie keskeneräisenä</button></div>' : "") +
      "</div></main>" + App.bottomnav("lahto");

    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a, id = b.dataset.id;
      if (a === "qtulos") {
        const hv = Model.havainto(id);
        hv.tulos = b.dataset.v; Auto.manual(hv, "tulos");
        await Model.saveHavainto(hv); App.render(); return;
      }
      if (a === "do") {
        if (b.dataset.t === "kohta") App.kohtaActions(Model.kohta(id));
        else if (b.dataset.t === "tila") Plan.roomActions(Model.tila(id));
        else location.hash = "#/k/" + k.id + "/h/" + id;
      } else if (a === "pois") {
        const syy = await promptSheet({ title: "Miksi kohta jätetään pois?", label: "Syy (näkyy raportissa rajauksena)", required: true, multiline: true });
        if (syy == null) return;
        Model.kohta(id).pois = { syy, aika: Date.now() };
        await Model.saveKohde(); App.render();
      } else if (a === "eip") {
        const syy = await promptSheet({ title: "Miksi tilaan ei päässyt?", label: "Syy (näkyy raportissa rajauksena)", required: true });
        if (syy == null) return;
        Model.tila(id).merkinta = { tila: "ei_paasya", syy, aika: Date.now() };
        await Model.saveKohde(); App.render();
      } else if (a === "export") {
        await Export.run(false);
      } else if (a === "exportAnyway") {
        if (!(await confirmSheet({ title: "Viedäänkö keskeneräisenä?", text: "Avoimet puutteet (" + list.length + ") listataan pakettiin, ja AI-työkalua ohjeistetaan käsittelemään ne rajauksina tai puuttuvina tietoina.", ok: "Vie keskeneräisenä" }))) return;
        await Export.run(true);
      }
    };
    S.cleanup = () => { root.onclick = null; };
  }

  window.Check = { puutteet, havaintoPuutteet, yhteenveto, view };
})();
