/* =========================================================================
   app.js – tila, malli, reititys ja perusnäkymät (kohteet, kohde, tiedot,
   tutkimussuunnitelma). Muut näkymät: capture.js, card.js, plan.js,
   check.js. Vienti: export.js.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, confirmSheet, promptSheet, pvm, nro } = UI;

  /* ---------------- Tila ---------------- */
  const S = {
    kohde: null,
    havainnot: [],
    urls: new Map(),   // tiedoston id -> objectURL
    cleanup: null      // näkymän purkufunktio (kamera, sanelu)
  };

  const app = () => document.getElementById("app");

  /* ---------------- Malli ---------------- */
  const Model = {
    newKohde(o) {
      return {
        id: DB.uid("k_"), created: Date.now(), updated: Date.now(),
        nimi: o.nimi || "", osoite: "", projektinro: "", tutkija: o.tutkija || "",
        pvm: new Date().toISOString().slice(0, 10),
        kerrokset: [], tilat: [], suunnitelma: [],
        muisti: {}, viimeisin: null, seuraavaNro: 1
      };
    },
    newHavainto(kohde, preset) {
      preset = preset || {};
      const last = kohde.viimeisin || {};
      return {
        id: DB.uid("h_"), kohdeId: kohde.id, nro: null, created: Date.now(), updated: Date.now(),
        kuvat: [], aanitteet: [], sanelu: "", tulkinta: "",
        tulos: null, menetelma: preset.menetelma || null, kentat: {}, vahvistettu: false,
        sijainti: {
          kerrosId: preset.kerrosId || last.kerrosId || null,
          tilaId: preset.tilaId || last.tilaId || null,
          rakenneosa: preset.rakenneosa != null ? preset.rakenneosa : (last.rakenneosa || null),
          piste: null
        },
        suunnitelmaId: preset.suunnitelmaId || null
      };
    },
    async saveKohde() {
      S.kohde.updated = Date.now();
      await DB.put("kohteet", S.kohde);
    },
    async saveHavainto(h) {
      if (!h.nro) {
        h.nro = S.kohde.seuraavaNro || 1;
        S.kohde.seuraavaNro = h.nro + 1;
        await Model.saveKohde();
      }
      h.updated = Date.now();
      // Mittausarvot ovat vahvistettuja, kun yhtään kameralukua ei ole kesken, epäonnistunut
      // tai tarkistamatta. Itse kirjoitetut arvot ovat tutkijan omia, eikä niitä tarvitse kuitata.
      if (window.Meter) {
        const open = M.menetelma(h.menetelma).kentat.filter((f) => f.t === "table")
          .some((f) => M.rivit(h, f).some((r) => ["reading", "flagged", "error", "interrupted"].includes(Meter.rowState(r))));
        h.vahvistettu = !open;
      }
      await DB.put("havainnot", h);
      const i = S.havainnot.findIndex((x) => x.id === h.id);
      if (i >= 0) S.havainnot[i] = h; else S.havainnot.push(h);
      // Pohjakuvasta tunnistettu tila vahvistuu, kun se on havainnon sijaintina (tutkija on paikalla ja näkee nimen)
      const tt = h.sijainti && h.sijainti.tilaId && Model.tila(h.sijainti.tilaId);
      if (tt && window.Plan && Plan.confirmRoom(tt, "havainto")) await Model.saveKohde();
      S.havainnot.sort((a, b) => a.nro - b.nro);
    },
    async deleteHavainto(h) {
      for (const f of h.kuvat.concat(h.aanitteet || [])) await DB.del("tiedostot", f);
      for (const v of Object.values(h.kentat || {})) {
        if (!Array.isArray(v)) continue;
        for (const r of v) if (r && r._ocr) { if (r._ocr.kuva) await DB.del("tiedostot", r._ocr.kuva); if (r._ocr.rajaus) await DB.del("tiedostot", r._ocr.rajaus); }
      }
      await DB.del("havainnot", h.id);
      S.havainnot = S.havainnot.filter((x) => x.id !== h.id);
    },
    /* Muistetut arvot (esim. mittalaite): ensin tämä kohde, sitten tämä laite (edelliset kohteet). */
    muistiGet(key) {
      const v = S.kohde && S.kohde.muisti ? S.kohde.muisti[key] : null;
      if (v) return v;
      try { return localStorage.getItem("ks_muisti_" + key) || null; } catch (e) { return null; }
    },
    muistiSet(key, val) {
      if (S.kohde) { S.kohde.muisti[key] = val; Model.saveKohde(); }
      try { if (val) localStorage.setItem("ks_muisti_" + key, val); } catch (e) { /* ohita */ }
    },
    kerros(id) { return S.kohde.kerrokset.find((k) => k.id === id) || null; },
    tila(id) { return S.kohde.tilat.find((t) => t.id === id) || null; },
    kohta(id) { return S.kohde.suunnitelma.find((p) => p.id === id) || null; },
    havainto(id) { return S.havainnot.find((h) => h.id === id) || null; },

    tilaNimi(t) { return t ? [t.tunnus, t.nimi].filter(Boolean).join(" ") : ""; },

    sijaintiTeksti(s) {
      if (!s) return "";
      const k = Model.kerros(s.kerrosId), t = Model.tila(s.tilaId);
      return [k && k.nimi, Model.tilaNimi(t), s.rakenneosa].filter(Boolean).join(" · ");
    },

    tilaStatus(t) {
      const obs = S.havainnot.filter((h) => h.sijainti && h.sijainti.tilaId === t.id);
      if (obs.some((h) => h.tulos === "poikkeama")) return "poikkeama";
      if (obs.length || (t.merkinta && t.merkinta.tila === "tarkastettu")) return "tarkastettu";
      if (t.merkinta && t.merkinta.tila === "ei_paasya") return "ei_paasya";
      return "ei_tutkittu";
    },

    kohtaTehty(p) {
      // Olosuhdeseurannassa tehty = kirjatut mittalaitteet
      if (M.menetelma(p.menetelma).seuranta) return (S.kohde.seuranta || []).filter((x) => x.nro).length;
      return S.havainnot.filter((h) => h.suunnitelmaId === p.id).length;
    },
    kohtaValmis(p) { return !!p.pois || Model.kohtaTehty(p) >= (p.maara || 1); },

    kohtaNimi(p) {
      const m = M.menetelma(p.menetelma);
      return m.nimi + (p.kuvaus ? ": " + p.kuvaus : "");
    },

    edistyminen() {
      const all = S.kohde.suunnitelma.length;
      const done = S.kohde.suunnitelma.filter(Model.kohtaValmis).length;
      return { all, done };
    },

    url(fileId) {
      if (!fileId) return "";
      return S.urls.get(fileId) || "";
    },
    async ensureUrls(ids) {
      const need = ids.filter((id) => id && !S.urls.has(id));
      for (const id of need) {
        const f = await DB.get("tiedostot", id);
        if (f && f.blob) S.urls.set(id, URL.createObjectURL(f.blob));
      }
    },
    resetUrls() {
      S.urls.forEach((u) => URL.revokeObjectURL(u));
      S.urls.clear();
    }
  };

  async function loadKohde(id) {
    if (S.kohde && S.kohde.id === id) return true;
    const k = await DB.get("kohteet", id);
    if (!k) return false;
    Model.resetUrls();
    S.kohde = k;
    S.havainnot = (await DB.byKohde("havainnot", id)).sort((a, b) => a.nro - b.nro);
    return true;
  }

  /* ---------------- Yhteiset osat ---------------- */
  function topbar(o) {
    return '<header class="topbar">' +
      (o.back ? '<a class="tb-back" href="' + o.back + '" aria-label="Takaisin">' + icon("back") + "</a>"
              : '<img class="tb-logo" src="pbm-logo.png" alt="">') +
      '<div class="tb-title"><h1>' + esc(o.title) + "</h1>" + (o.sub ? '<span class="sub">' + esc(o.sub) + "</span>" : "") + "</div>" +
      (o.right || "") + "</header>";
  }

  function bottomnav(active) {
    const k = S.kohde.id;
    const n = window.Check ? Check.puutteet().length : 0;
    const a = (key, href, ic, label, badge) =>
      '<a href="' + href + '"' + (active === key ? ' aria-current="page"' : "") + ">" + icon(ic) + label +
      (badge ? '<span class="badge">' + badge + "</span>" : "") + "</a>";
    return '<nav class="bottomnav">' +
      a("kohde", "#/k/" + k, "home", "Kohde") +
      a("pohja", "#/k/" + k + "/pohja", "plan", "Pohjapiirros") +
      a("lahto", "#/k/" + k + "/lahto", "check", "Lähtötarkistus", n || "") +
      "</nav>";
  }

  function fab(href) {
    return '<a class="fab" href="' + href + '">' + icon("cam") + "Kuva + sanelu</a>";
  }

  function pinClass(h) {
    return h.tulos === "poikkeama" ? "p-note" : h.tulos === "ok" ? "p-ok" : "p-n";
  }

  /* ---------------- Näkymä: kohteet ---------------- */
  async function viewHome() {
    S.kohde = null;
    Model.resetUrls();
    const kohteet = (await DB.all("kohteet")).sort((a, b) => b.updated - a.updated);
    const est = await DB.usage();
    let rows = "";
    for (const k of kohteet) {
      const hav = await DB.byKohde("havainnot", k.id);
      rows += '<a class="row" href="#/k/' + k.id + '" style="text-decoration:none;color:inherit"><div class="grow"><div class="t">' + esc(k.nimi || "Nimetön kohde") +
        '</div><div class="s">' + esc([k.osoite, k.pvm ? UI.pvm(k.pvm) : "", hav.length + " havaintoa"].filter(Boolean).join(" · ")) + "</div></div>" + icon("back", "flip") + "</a>";
    }
    app().innerHTML = topbar({ title: "Kuva + sanelu", sub: "Kenttähavainnot kuvina ja saneluina" }) +
      '<main class="view no-nav">' +
      (Dictation.supported() ? "" : '<div class="alert info">' + icon("alert") + "<div>Tämä selain ei tue puheentunnistusta. Sanelut tallennetaan äänitteinä, ja tekstin voi kirjoittaa tai sanella näppäimistön mikrofonilla.</div></div>") +
      '<section class="card"><div class="card-h"><h2>Kohteet</h2><span class="meta">' + kohteet.length + "</span></div>" +
      (rows || '<div class="empty">Ei vielä kohteita. Aloita lisäämällä kohde.</div>') + "</section>" +
      '<button class="btn btn-primary btn-block" data-act="newKohde">' + icon("plus") + "Uusi kohde</button>" +
      '<div style="height:10px"></div><button class="btn btn-block" data-act="restore">' + icon("upload") + "Palauta varmuuskopio (ZIP)</button>" +
      '<div style="height:10px"></div><a class="btn btn-block" href="#/menetelmat">' + icon("list") + "Menetelmät</a>" +
      '<div style="height:10px"></div><a class="btn btn-block" href="#/sanasto">' + icon("edit") + "Sanasto</a>" +
      '<p class="hint">Tiedot tallentuvat vain tälle laitteelle. Vie kohde ZIP-pakettina raportointia ja varmuuskopiota varten.' +
      (est && est.usage ? " Käytössä " + (est.usage / 1048576).toFixed(0) + " Mt." : "") + "</p>" +
      '<p class="hint" style="text-align:center;margin-top:18px">Versio ' + esc(window.APP_VERSION) + ' · <a href="kameraluku-testi.html">Kameraluvun testi</a></p>' +
      "</main>";
  }

  /* ---------------- Näkymä: kohde ---------------- */
  async function viewKohde() {
    const k = S.kohde;
    const pr = Model.edistyminen();
    const recent = S.havainnot.slice().sort((a, b) => b.updated - a.updated).slice(0, 8);
    await Model.ensureUrls(recent.map((h) => h.kuvat[0]));

    let plan = "";
    for (const p of k.suunnitelma) {
      const tehty = Model.kohtaTehty(p), maara = p.maara || 1;
      const pct = p.pois ? 100 : Math.min(100, Math.round((tehty / maara) * 100));
      plan += '<button class="row" data-act="kohtaMenu" data-id="' + p.id + '"><div class="grow"><div class="t">' + esc(M.menetelma(p.menetelma).nimi) + "</div>" +
        (p.kuvaus || p.pois ? '<div class="s">' + esc(p.pois ? "Jätetään pois: " + p.pois.syy : p.kuvaus) + "</div>" : "") + "</div>" +
        '<span class="minibar' + (Model.kohtaValmis(p) ? " full" : "") + '"><span style="width:' + pct + '%"></span></span>' +
        '<span class="count">' + (p.pois ? "–" : tehty + "/" + maara) + "</span></button>";
    }

    let rec = "";
    for (const h of recent) {
      const u = Model.url(h.kuvat[0]);
      rec += '<button class="item" data-act="openH" data-id="' + h.id + '"><span class="thumb">' +
        (u ? '<img src="' + u + '" alt="">' : "") + '<span class="dot" style="background:var(--pin-' + (h.tulos === "poikkeama" ? "note" : h.tulos === "ok" ? "ok" : "neutral") + ')"></span>' +
        '<span class="no">' + nro(h.nro) + "</span>" +
        (Check.havaintoPuutteet(h).length ? '<span class="warn" title="Tietoja puuttuu">!</span>' : "") + "</span>" +
        esc(Model.sijaintiTeksti(h.sijainti) || "Sijainti puuttuu") + "</button>";
    }

    const puutteet = Check.puutteet();
    app().innerHTML = topbar({
      title: k.nimi || "Nimetön kohde", sub: [k.osoite, k.pvm ? pvm(k.pvm) : ""].filter(Boolean).join(" · "), back: "#/",
      right: '<a class="tb-act" href="#/k/' + k.id + '/tiedot" style="text-decoration:none;color:inherit">Tiedot</a>'
    }) +
      (pr.all ? '<div class="progress"><span class="bar"><span style="width:' + Math.round((pr.done / pr.all) * 100) + '%"></span></span>' + pr.done + " / " + pr.all + "</div>" : "") +
      '<main class="view">' +
      '<section class="card"><div class="card-h"><h2>Tutkimussuunnitelma</h2><a class="link" href="#/k/' + k.id + '/suunnitelma">Muokkaa</a></div>' +
      (plan || '<div class="empty">Lisää suunnitelman kohdat, niin näet kentällä mitä on tehty ja mitä puuttuu.<br><br><a class="btn btn-sm" href="#/k/' + k.id + '/suunnitelma">' + icon("plus") + "Lisää kohdat</a></div>") +
      "</section>" +
      Seuranta.kohdeCard() +
      '<section class="card"><div class="card-h"><h2>Viimeisimmät havainnot</h2>' +
      (S.havainnot.length ? '<a class="link" href="#/k/' + k.id + '/havainnot">Kaikki ' + S.havainnot.length + "</a>" : "") + "</div>" +
      '<div class="card-b">' + (rec ? '<div class="recent">' + rec + "</div>" : '<div class="empty" style="padding:6px 0 4px">Ei vielä havaintoja.</div>') + "</div></section>" +
      (puutteet.length ? '<a class="alert" href="#/k/' + k.id + '/lahto" style="text-decoration:none">' + icon("alert") + "<div>" + esc(Check.yhteenveto(puutteet)) + "</div></a>" : "") +
      "</main>" + fab("#/k/" + k.id + "/kuvaus") + bottomnav("kohde");
  }

  /* ---------------- Näkymä: kaikki havainnot ----------------
     Haku (tunnus, tila, menetelmä, sanelu), ryhmittely tiloittain ja
     kamerapainike jokaisella rivillä: lisäkuvat aiempaan havaintoon. */
  let hvState = { q: "", f: "kaikki" };
  async function viewHavainnot() {
    const k = S.kohde;
    await Model.ensureUrls(S.havainnot.map((h) => h.kuvat[0]));
    const nMiss = S.havainnot.filter((h) => Check.havaintoPuutteet(h).length).length;
    app().innerHTML = topbar({ title: "Havainnot", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view"><div class="hv-tools"><label class="mp-search">' + icon("list") +
      '<input type="search" data-hq value="' + esc(hvState.q) + '" placeholder="Hae: H05, M3, keittiö, lattia…" aria-label="Hae havaintoja" autocomplete="off"></label></div>' +
      '<div class="hv-filter chips"><button class="chip" data-hf="kaikki">Kaikki ' + S.havainnot.length + '</button>' +
      '<button class="chip" data-hf="puute">Puutteelliset ' + nMiss + '</button><button class="chip" data-hf="tilat">Tiloittain</button>' +
      '<button class="chip" data-act="galleria">' + icon("image") + "Liitä kuvia galleriasta</button></div>" +
      '<section class="card"><div class="card-b" data-hlist></div></section></main>' +
      fab("#/k/" + k.id + "/kuvaus") + bottomnav("kohde");
    const listEl = app().querySelector("[data-hlist]"), q = app().querySelector("[data-hq]");
    const paint = () => {
      app().querySelectorAll("[data-hf]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hf === hvState.f)));
      let list = S.havainnot.slice();
      if (hvState.f === "puute") list = list.filter((h) => Check.havaintoPuutteet(h).length);
      list = ObsList.filter(list, hvState.q);
      let html = "";
      if (hvState.f === "tilat") {
        const groups = new Map();
        list.forEach((h) => { const id = (h.sijainti && h.sijainti.tilaId) || ""; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(h); });
        const keys = Array.from(groups.keys()).sort((a, b) => (a ? Model.tilaNimi(Model.tila(a)) : "\uffff").localeCompare(b ? Model.tilaNimi(Model.tila(b)) : "\uffff", "fi", { numeric: true }));
        keys.forEach((id) => {
          const t = id && Model.tila(id);
          html += '<div class="ohead">' + esc(t ? Model.tilaNimi(t) : "Ei tilaa") + " · " + groups.get(id).length + "</div>";
          html += groups.get(id).map((h) => ObsList.rowHtml(h, { camera: true })).join("");
        });
      } else html = list.slice().reverse().map((h) => ObsList.rowHtml(h, { camera: true })).join("");
      listEl.innerHTML = html ? '<div class="olist" style="max-height:none">' + html + "</div>" : '<div class="empty">' + (S.havainnot.length ? "Ei osumia." : "Ei havaintoja.") + "</div>";
    };
    q.addEventListener("input", () => { hvState.q = q.value; paint(); });
    app().querySelectorAll("[data-hf]").forEach((b) => b.addEventListener("click", () => { hvState.f = b.dataset.hf; paint(); }));
    listEl.addEventListener("click", (e) => {
      const cam = e.target.closest("[data-ocam]");
      if (cam) { location.hash = "#/k/" + k.id + "/kuvaus/" + cam.dataset.ocam; return; }
      const o = e.target.closest("[data-oid]");
      if (o) location.hash = "#/k/" + k.id + "/h/" + o.dataset.oid;
    });
    paint();
  }

  /* ---------------- Näkymä: kohteen tiedot ---------------- */
  function viewTiedot() {
    const k = S.kohde;
    const f = (key, label, type) => '<label class="field"><span>' + label + '</span><input type="' + (type || "text") + '" data-k="' + key + '" value="' + esc(k[key]) + '"></label>';
    app().innerHTML = topbar({ title: "Kohteen tiedot", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view no-nav"><section class="card"><div class="card-b" style="padding-top:14px">' +
      f("nimi", "Kohteen nimi") + f("osoite", "Osoite") + f("projektinro", "Projektinumero") + f("tutkija", "Tutkija") + f("pvm", "Tutkimuspäivä", "date") +
      '<p class="hint">Jos aineisto käytetään julkaistavassa työssä, anonymisoi kohteen nimi ja osoite ennen vientiä.</p>' +
      "</div></section>" +
      '<section class="card"><div class="card-h"><h2>Vienti ja varmuuskopio</h2></div><div class="card-b">' +
      '<button class="btn btn-block" data-act="export">' + icon("download") + "Vie ZIP-paketti</button>" +
      '<p class="hint">Paketti sisältää kuvat, sanelut, jäsennellyt tiedot ja pohjapiirrokset merkintöineen. Samalla paketilla kohteen voi palauttaa toiselle laitteelle.</p>' +
      "</div></section>" +
      '<button class="btn btn-danger btn-block" data-act="deleteKohde">' + icon("trash") + "Poista kohde tältä laitteelta</button>" +
      "</main>";
    const save = UI.debounce(() => Model.saveKohde(), 400);
    app().querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener("input", () => { k[inp.dataset.k] = inp.value; save(); }));
  }

  /* ---------------- Näkymä: tutkimussuunnitelma ---------------- */
  function viewSuunnitelma() {
    const k = S.kohde;
    let rows = "";
    k.suunnitelma.forEach((p, i) => {
      rows += '<div class="row" style="cursor:default"><div class="grow"><div class="t">' + esc(M.menetelma(p.menetelma).nimi) + (p.maara > 1 ? " × " + p.maara : "") + "</div>" +
        '<div class="s">' + esc([p.kuvaus, Model.tilaNimi(Model.tila(p.tilaId))].filter(Boolean).join(" · ") || "–") + "</div></div>" +
        '<button class="icon-btn" data-act="editKohta" data-id="' + p.id + '" aria-label="Muokkaa">' + icon("edit") + "</button>" +
        '<button class="icon-btn" data-act="delKohta" data-id="' + p.id + '" aria-label="Poista">' + icon("trash") + "</button></div>";
    });
    app().innerHTML = topbar({ title: "Tutkimussuunnitelma", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view no-nav"><section class="card">' + (rows || '<div class="empty">Ei kohtia.</div>') + "</section>" +
      '<button class="btn btn-primary btn-block" data-act="addKohta">' + icon("plus") + "Lisää kohta</button>" +
      '<p class="hint">Kirjaa suunnitelman tutkimukset menetelmittäin. Määrä tarkoittaa esimerkiksi mittauspisteiden tai avausten lukumäärää. Havainto liitetään kohtaan havaintokortilla.</p></main>';
  }

  function kohtaSheet(p) {
    const isNew = !p;
    p = p || { id: DB.uid("p_"), menetelma: "aisti", kuvaus: "", maara: 1, tilaId: null, pois: null };
    const opts = M.MENETELMAT.filter((m) => !m.piilotettu || m.id === p.menetelma).map((m) => '<option value="' + m.id + '"' + (m.id === p.menetelma ? " selected" : "") + ">" + esc(m.nimi) + "</option>").join("");
    sheet(
      "<h3>" + (isNew ? "Uusi suunnitelman kohta" : "Muokkaa kohtaa") + "</h3>" +
      '<label class="field"><span>Menetelmä</span><select data-f="menetelma">' + opts + "</select></label>" +
      '<label class="field"><span>Tarkennus ja sijainti</span><input type="text" data-f="kuvaus" value="' + esc(p.kuvaus) + '" placeholder="esim. kellarin ulkoseinät"></label>' +
      '<label class="field"><span>Määrä</span><input type="number" min="1" inputmode="numeric" data-f="maara" value="' + (p.maara || 1) + '"></label>' +
      '<div class="row-btns">' + (isNew ? '<button class="btn" data-more>Lisää ja lisää seuraava</button>' : '<button class="btn" data-close>Peruuta</button>') +
      '<button class="btn btn-primary" data-ok>Tallenna</button></div>',
      (el, close) => {
        const read = () => {
          p.menetelma = el.querySelector('[data-f="menetelma"]').value;
          p.kuvaus = el.querySelector('[data-f="kuvaus"]').value.trim();
          p.maara = Math.max(1, parseInt(el.querySelector('[data-f="maara"]').value, 10) || 1);
        };
        const commit = async () => {
          read();
          if (isNew) S.kohde.suunnitelma.push(p);
          await Model.saveKohde();
        };
        el.querySelector("[data-ok]").addEventListener("click", async () => { await commit(); close(); render(); });
        const more = el.querySelector("[data-more]");
        if (more) more.addEventListener("click", async () => {
          await commit(); close(); toast("Kohta lisätty"); render();
          setTimeout(() => kohtaSheet(null), 60);
        });
      }
    );
  }

  /* ---------------- Toiminnot (klikit) ---------------- */
  const A = {
    async newKohde() {
      sheet(
        "<h3>Uusi kohde</h3>" +
        '<label class="field"><span>Kohteen nimi</span><input type="text" data-f="nimi" autofocus></label>' +
        '<label class="field"><span>Tutkija</span><input type="text" data-f="tutkija" value="' + esc(localStorage.getItem("ks_tutkija") || "") + '"></label>' +
        '<div class="row-btns"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Luo kohde</button></div>',
        (el, close) => {
          el.querySelector("[data-ok]").addEventListener("click", async () => {
            const nimi = el.querySelector('[data-f="nimi"]').value.trim();
            const tutkija = el.querySelector('[data-f="tutkija"]').value.trim();
            if (!nimi) { toast("Anna kohteelle nimi"); return; }
            try { localStorage.setItem("ks_tutkija", tutkija); } catch (e) { /* ohita */ }
            const k = Model.newKohde({ nimi, tutkija });
            await DB.put("kohteet", k);
            DB.requestPersist();
            close();
            location.hash = "#/k/" + k.id;
          });
        }
      );
    },
    async restore() {
      const files = await UI.pickFile(".zip,application/zip", false);
      if (!files.length) return;
      try {
        const id = await Export.restore(files[0]);
        toast("Kohde palautettu");
        location.hash = "#/k/" + id;
      } catch (e) { toast(e.message || "Palautus epäonnistui", 4000); }
    },
    openH(el) { location.hash = "#/k/" + S.kohde.id + "/h/" + el.dataset.id; },
    galleria() { Gallery.importPhotos(() => render()); },
    addKohta() { kohtaSheet(null); },
    editKohta(el) { kohtaSheet(Model.kohta(el.dataset.id)); },
    async delKohta(el) {
      const p = Model.kohta(el.dataset.id);
      if (!(await confirmSheet({ title: "Poistetaanko kohta?", text: Model.kohtaNimi(p) + ". Kohtaan liitetyt havainnot säilyvät.", ok: "Poista kohta", danger: true }))) return;
      S.kohde.suunnitelma = S.kohde.suunnitelma.filter((x) => x.id !== p.id);
      S.havainnot.forEach((h) => { if (h.suunnitelmaId === p.id) { h.suunnitelmaId = null; DB.put("havainnot", h); } });
      await Model.saveKohde(); render();
    },
    kohtaMenu(el) { App.kohtaActions(Model.kohta(el.dataset.id)); },
    async export() { await Export.run(false); },
    async deleteKohde() {
      if (!(await confirmSheet({ title: "Poistetaanko kohde?", text: "Kaikki kohteen havainnot, kuvat ja sanelut poistetaan tältä laitteelta. Vie ZIP-paketti ensin, jos tarvitset aineistoa.", ok: "Poista kohde", danger: true }))) return;
      if (!(await confirmSheet({ title: "Vahvista poisto", text: "Poistoa ei voi perua.", ok: "Poista lopullisesti", danger: true }))) return;
      await DB.deleteKohde(S.kohde.id);
      S.kohde = null;
      location.hash = "#/";
    }
  };

  /* Suunnitelman kohdan toiminnot (kohdenäkymä ja lähtötarkistus) */
  function kohtaActions(p) {
    const k = S.kohde;
    const linked = S.havainnot.filter((h) => h.suunnitelmaId === p.id);
    const seur = M.menetelma(p.menetelma).seuranta;
    sheet(
      "<h3>" + esc(Model.kohtaNimi(p)) + "</h3>" +
      "<p>" + (p.pois ? "Jätetään pois: " + esc(p.pois.syy) : "Tehty " + Model.kohtaTehty(p) + " / " + (p.maara || 1)) + "</p>" +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      (seur ? '<button class="btn btn-primary" data-a="seur">' + icon("pin") + "Olosuhdeseuranta: mittalaitteet</button>"
            : '<button class="btn btn-primary" data-a="kuva">' + icon("cam") + "Kuva + sanelu tähän kohtaan</button>") +
      linked.map((h) => '<button class="btn" data-h="' + h.id + '">' + nro(h.nro) + " · " + esc(Model.sijaintiTeksti(h.sijainti) || "Sijainti puuttuu") + "</button>").join("") +
      (p.pois ? '<button class="btn" data-a="palauta">Palauta tehtäväksi</button>' : '<button class="btn" data-a="pois">Jätetään pois + syy</button>') +
      '<button class="btn" data-close>Sulje</button></div>',
      (el, close) => {
        const kv = el.querySelector('[data-a="kuva"]');
        if (kv) kv.addEventListener("click", () => {
          close(); location.hash = "#/k/" + k.id + "/kuvaus?menetelma=" + p.menetelma + "&kohta=" + p.id;
        });
        const sv = el.querySelector('[data-a="seur"]');
        if (sv) sv.addEventListener("click", () => { close(); location.hash = "#/k/" + k.id + "/seuranta"; });
        el.querySelectorAll("[data-h]").forEach((b) => b.addEventListener("click", () => { close(); location.hash = "#/k/" + k.id + "/h/" + b.dataset.h; }));
        const pois = el.querySelector('[data-a="pois"]');
        if (pois) pois.addEventListener("click", async () => {
          close();
          const syy = await promptSheet({ title: "Miksi kohta jätetään pois?", label: "Syy (näkyy raportissa rajauksena)", required: true, multiline: true });
          if (syy == null) return;
          p.pois = { syy, aika: Date.now() };
          await Model.saveKohde(); render();
        });
        const pal = el.querySelector('[data-a="palauta"]');
        if (pal) pal.addEventListener("click", async () => { p.pois = null; await Model.saveKohde(); close(); render(); });
      }
    );
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !app().contains(el)) return;
    const fn = A[el.dataset.act] || (App.actions && App.actions[el.dataset.act]);
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  /* ---------------- Reititys ---------------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const q = {};
    (qs || "").split("&").filter(Boolean).forEach((kv) => { const [a, b] = kv.split("="); q[decodeURIComponent(a)] = decodeURIComponent(b || ""); });
    return { parts, q };
  }

  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    const t = document.getElementById("toast");
    if (t && /virhe|ei löytynyt|keskeytyi|estettiin|vaatii/i.test(t.textContent)) t.classList.remove("on");
    if (S.cleanup) { try { S.cleanup(); } catch (e) { /* ohita */ } S.cleanup = null; }
    const { parts, q } = parseHash();
    try {
      if (parts[0] === "sanasto") { await VocabView.view(); return; }
      if (parts[0] === "menetelmat") {
        if (parts[1]) await Editor.viewMethod(decodeURIComponent(parts[1])); else await Editor.viewList();
        return;
      }
      if (parts[0] !== "k" || !parts[1]) { await viewHome(); return; }
      const ok = await loadKohde(parts[1]);
      if (seq !== renderSeq) return;
      if (!ok) { location.hash = "#/"; return; }
      const sub = parts[2] || "";
      window.scrollTo(0, 0);
      if (sub === "") await viewKohde();
      else if (sub === "tiedot") viewTiedot();
      else if (sub === "suunnitelma") viewSuunnitelma();
      else if (sub === "havainnot") await viewHavainnot();
      else if (sub === "kuvaus") await Capture.view(parts[3] || null, q);
      else if (sub === "h") await Card.view(parts[3]);
      else if (sub === "pohja") await Plan.view(q);
      else if (sub === "lahto") await Check.view();
      else if (sub === "seuranta") await Seuranta.view(parts[3] || null);
      else await viewKohde();
    } catch (err) {
      console.error(err);
      app().innerHTML = topbar({ title: "Virhe", back: "#/" }) + '<main class="view no-nav"><div class="alert">' + icon("alert") + "<div>" + esc(err.message || String(err)) + "</div></div></main>";
    }
  }

  /* Paluuosoite menetelmäeditorista: näkymä, josta editoriin tultiin. */
  let paluuHash = null;
  function paluu(oletus) { return paluuHash || oletus; }

  const App = { S, Model, render, topbar, bottomnav, fab, pinClass, kohtaActions, paluu, actions: {} };
  window.App = App;

  window.addEventListener("hashchange", (e) => {
    const from = (e.oldURL || "").split("#")[1] || "/";
    const asetus = (h) => /^\/?(menetelmat|sanasto)/.test(h);
    if (/^#\/(menetelmat|sanasto)/.test(location.hash) && !asetus(from)) paluuHash = "#" + from;
    render();
  });
  window.addEventListener("DOMContentLoaded", async () => {
    await M.load();
    await Learn.load();
    await Vocab.load();
    render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // Tarkistetaan päivitys myös, kun sovellus palaa näkyviin (esim. kotinäytöltä avattuna).
        document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch(() => {});
      // Kun uusi versio otetaan käyttöön, ladataan sivu uudelleen. Kesken olevaa kuvausta tai
      // kirjausta ei keskeytetä: lataus tehdään vasta, kun käyttäjä palaa etusivulle tai kohteeseen.
      let pending = false;
      const safe = () => { const h = location.hash.replace(/^#\/?/, ""); return h === "" || /^k\/[^/]+$/.test(h); };
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController) return; // ensimmäinen asennus, ei vanhaa versiota
        if (safe() && !document.querySelector(".cam")) location.reload();
        else { pending = true; UI.toast("Uusi versio ladattu. Se otetaan käyttöön, kun palaat kohteeseen.", 4000); }
      });
      window.addEventListener("hashchange", () => { if (pending && safe()) location.reload(); });
    }
  });
})();
