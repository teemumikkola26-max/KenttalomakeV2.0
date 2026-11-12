/* =========================================================================
   seuranta.js – olosuhdeseuranta (#/k/<kohde>/seuranta)

   Olosuhdeseuranta on kohteen yhteinen mittaus: mittalaitteet jätetään
   tiloihin noin kahdeksi viikoksi. Jokaisesta laitteesta kirjataan vain
     - tunnus MIR1–MIR99 (laitteen oma numero, syötetään käsin)
     - tila ja merkintä pohjakuvaan
     - kuva sijoittelusta (poishakua varten, ei raporttiin)
   Mittausdata tulee raportille mittalaitteiden pilvipalvelusta.

   Laite: { id, nro, sijainti: { kerrosId, tilaId, piste }, kuvat: [], created, updated }
   Tallennetaan kohteeseen (kohde.seuranta), joten varmuuskopio ja palautus
   toimivat kuten muillakin kohteen tiedoilla.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet } = UI;
  const { S, Model } = App;
  const PREFIX = "MIR";
  const MAXNRO = 99;

  const list = () => (S.kohde.seuranta = S.kohde.seuranta || []);
  const laite = (id) => list().find((x) => x.id === id) || null;
  const tunnus = (x) => (x && x.nro ? PREFIX + x.nro : "");
  const sorted = () => list().slice().sort((a, b) => (a.nro || 999) - (b.nro || 999) || a.created - b.created);
  const tyhja = (x) => !x.nro && !x.kuvat.length && !x.sijainti.tilaId && !x.sijainti.piste;

  /* Mitä laitteesta puuttuu (näkyy listassa ja lähtötarkistuksessa) */
  function puutteet(x) {
    const out = [];
    if (!x.nro) out.push("tunnus");
    if (!x.sijainti.tilaId) out.push("tila");
    if (!x.sijainti.piste) out.push("merkintä pohjakuvaan");
    if (!x.kuvat.length) out.push("kuva");
    return out;
  }

  /* Pohjakuvan merkit (plan.js:n pinsHtml lisää nämä) */
  function pinsHtml(kerrosId, opts) {
    opts = opts || {};
    if (!S.kohde) return "";
    return list().filter((x) => x.sijainti.piste && x.sijainti.kerrosId === kerrosId && x.id !== opts.except && x.nro).map((x) => {
      const p = x.sijainti.piste;
      return '<button class="pin mir' + (opts.sel === x.id ? " sel" : "") + '" data-mir="' + x.id + '" style="left:' + (p.x * 100) + "%;top:" + (p.y * 100) + "%" +
        (opts.dim ? ";opacity:.5" : "") + '" aria-label="Mittalaite ' + tunnus(x) + '">' + tunnus(x) + "</button>";
    }).join("");
  }

  /* Kortti kohteen etusivulle */
  function kohdeCard() {
    const k = S.kohde, all = list().filter((x) => !tyhja(x));
    const vajaat = all.filter((x) => puutteet(x).length).length;
    const inPlan = k.suunnitelma.some((p) => M.menetelma(p.menetelma).seuranta);
    if (!all.length && !inPlan) {
      return '<a class="row seur-link" href="#/k/' + k.id + '/seuranta" style="text-decoration:none;color:inherit;margin:-4px 0 12px;border-radius:12px">' +
        icon("pin") + '<div class="grow"><div class="t">Olosuhdeseuranta</div><div class="s">Mittalaitteiden sijainnit ja tunnukset</div></div>' + icon("back", "flip") + "</a>";
    }
    return '<section class="card"><div class="card-h"><h2>Olosuhdeseuranta</h2><a class="link" href="#/k/' + k.id + '/seuranta">' +
      (all.length ? all.length + " mittalaitetta" : "Avaa") + "</a></div>" +
      '<div class="card-b">' +
      (all.length ? '<div class="chips" style="margin-bottom:10px">' + sorted().filter((x) => !tyhja(x)).map((x) =>
        '<a class="chip" href="#/k/' + k.id + "/seuranta/" + x.id + '" style="text-decoration:none">' + esc(tunnus(x) || "Ei tunnusta") +
        (x.sijainti.tilaId ? ' <span class="mp-tag">' + esc(Model.tilaNimi(Model.tila(x.sijainti.tilaId))) + "</span>" : "") +
        (puutteet(x).length ? ' <span class="warn-dot" title="Tietoja puuttuu">!</span>' : "") + "</a>").join("") + "</div>" : "") +
      (vajaat ? '<p class="hint" style="margin:0 0 10px">' + vajaat + " mittalaitteelta puuttuu tietoja.</p>" : "") +
      '<a class="btn btn-sm" href="#/k/' + k.id + '/seuranta/uusi">' + icon("plus") + "Lisää mittalaite</a></div></section>";
  }

  /* ---------- Näkymä: lista ja pohjakuvat ---------- */
  async function viewList() {
    const k = S.kohde;
    S.kohde.seuranta = list().filter((x) => !tyhja(x));
    const all = sorted();
    await Model.ensureUrls(all.map((x) => x.kuvat[0]).concat(k.kerrokset.map((e) => e.planId)));
    const floors = k.kerrokset.filter((e) => e.planId && all.some((x) => x.sijainti.kerrosId === e.id && x.sijainti.piste));

    const row = (x) => {
      const t = Model.tila(x.sijainti.tilaId), e = Model.kerros(x.sijainti.kerrosId), miss = puutteet(x), u = Model.url(x.kuvat[0]);
      return '<a class="row" href="#/k/' + k.id + "/seuranta/" + x.id + '" style="text-decoration:none;color:inherit">' +
        '<span class="seur-thumb">' + (u ? '<img src="' + u + '" alt="">' : icon("cam")) + "</span>" +
        '<div class="grow"><div class="t">' + esc(tunnus(x) || "Tunnus puuttuu") + "</div>" +
        '<div class="s">' + esc([e && k.kerrokset.length > 1 ? e.nimi : "", t ? Model.tilaNimi(t) : "Tila puuttuu"].filter(Boolean).join(" · ")) + "</div>" +
        (miss.length ? '<div class="s" style="color:var(--note-line)">Puuttuu: ' + esc(miss.join(", ")) + "</div>" : "") + "</div>" +
        icon("back", "flip") + "</a>";
    };

    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Olosuhdeseuranta", sub: all.length + " mittalaitetta · " + k.nimi, back: "#/k/" + k.id }) +
      '<main class="view">' +
      floors.map((e) => '<section class="card"><div class="card-h"><h2>' + esc(e.nimi) + '</h2><span class="meta">' +
        all.filter((x) => x.sijainti.kerrosId === e.id).length + "</span></div>" +
        '<div class="card-b"><div class="plan-wrap" data-plan="' + e.id + '"><img src="' + Model.url(e.planId) + '" alt="Pohjapiirros: ' + esc(e.nimi) + '" draggable="false">' +
        pinsHtml(e.id) + "</div></div></section>").join("") +
      '<section class="card"><div class="card-h"><h2>Mittalaitteet</h2><span class="meta">' + all.length + "</span></div>" +
      (all.map(row).join("") || '<div class="empty">Ei vielä mittalaitteita. Lisää laite: tunnus, kuva sijoittelusta ja kohta pohjakuvassa.</div>') +
      "</section>" +
      '<p class="hint" style="margin:0 2px 90px">Kirjaa laitteen tunnus (' + PREFIX + "1–" + PREFIX + MAXNRO + "), tila, merkintä pohjakuvaan ja kuva sijoittelusta. Kuvat ovat poishakua varten, eivätkä ne mene raportille. Mittausdata tulee mittalaitteiden pilvipalvelusta.</p>" +
      "</main>" +
      '<a class="fab" href="#/k/' + k.id + '/seuranta/uusi">' + icon("plus") + "Lisää mittalaite</a>" + App.bottomnav("kohde");

    floors.forEach((e) => Zoom.attach(root.querySelector('[data-plan="' + e.id + '"]'), "seur:" + e.id, { fullscreen: true }));
    root.onclick = (ev) => {
      const pin = ev.target.closest("[data-mir]");
      if (pin) location.hash = "#/k/" + k.id + "/seuranta/" + pin.dataset.mir;
    };
    S.cleanup = () => { root.onclick = null; };
  }

  /* ---------- Näkymä: yksi mittalaite ----------
     Tallentuu heti (kuten havainnot). Täysin tyhjä uusi laite poistetaan, kun näkymästä poistutaan. */
  async function viewLaite(id) {
    const k = S.kohde;
    let x = id === "uusi" ? null : laite(id);
    if (!x) {
      if (id !== "uusi") { location.hash = "#/k/" + k.id + "/seuranta"; return; }
      const prev = sorted().filter((y) => y.sijainti.kerrosId).sort((a, b) => b.updated - a.updated)[0];
      x = { id: DB.uid("mir_"), nro: null, sijainti: { kerrosId: prev ? prev.sijainti.kerrosId : (k.kerrokset[0] ? k.kerrokset[0].id : null), tilaId: null, piste: null }, kuvat: [], created: Date.now(), updated: Date.now() };
      list().push(x);
      history.replaceState(null, "", "#/k/" + k.id + "/seuranta/" + x.id);
    }
    const save = async () => { x.updated = Date.now(); await Model.saveKohde(); };
    const root = document.getElementById("app");

    async function paint(focusNro) {
      const e = Model.kerros(x.sijainti.kerrosId), t = Model.tila(x.sijainti.tilaId);
      await Model.ensureUrls(x.kuvat.concat(e && e.planId ? [e.planId] : []));
      const miss = puutteet(x);
      root.innerHTML = App.topbar({ title: tunnus(x) || "Uusi mittalaite", sub: "Olosuhdeseuranta", back: "#/k/" + k.id + "/seuranta" }) +
        '<main class="view no-nav">' +
        '<section class="card"><div class="card-b" style="padding-top:14px">' +
          '<label class="field" style="margin:0"><span>Mittalaitteen tunnus</span>' +
          '<div class="mir-in"><b>' + PREFIX + '</b><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" data-nro value="' + (x.nro || "") + '" placeholder="1–' + MAXNRO + '" aria-label="Tunnuksen numero" autocomplete="off"></div></label>' +
          '<div class="hint" data-nromsg style="margin:6px 0 0"></div>' +
        "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Kuva sijoittelusta</h2><span class="meta">' + x.kuvat.length + "</span></div><div class=\"card-b\">" +
          (x.kuvat.length ? '<div class="seur-kuvat">' + x.kuvat.map((f) => '<span class="seur-kuva"><img src="' + Model.url(f) + '" alt="" data-view="' + f + '"><button class="icon-btn" data-delimg="' + f + '" aria-label="Poista kuva">' + icon("trash") + "</button></span>").join("") + "</div>" : "") +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn' + (x.kuvat.length ? "" : " btn-primary") + '" data-a="kuva">' + icon("cam") + (x.kuvat.length ? "Lisää kuva" : "Ota kuva") + "</button>" +
          '<button class="btn btn-sm" data-a="galleria">' + icon("image") + "Galleriasta</button></div>" +
          '<p class="hint" style="margin:8px 0 0">Kuva auttaa poishakijaa löytämään laitteen. Kuvat eivät mene raportille.</p>' +
        "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Sijainti</h2></div><div class="card-b">' +
          '<button class="seur-loc' + (t ? "" : " missing") + '" data-a="sijainti">' + icon("pin") + '<span class="grow" style="text-align:left"><b>' + esc(t ? Model.tilaNimi(t) : "Valitse tila ja kohta") + "</b>" +
            (e ? '<span class="sub">' + esc(e.nimi + (x.sijainti.piste ? " · merkitty pohjakuvaan" : " · kohta merkitsemättä")) + "</span>" : "") + "</span></button>" +
          (e && e.planId && x.sijainti.piste ? '<div class="plan-wrap seur-mini" data-mini><img src="' + Model.url(e.planId) + '" alt="" draggable="false">' +
            pinsHtml(e.id, { except: x.id, dim: true }) + '<span class="pin mir sel" style="left:' + (x.sijainti.piste.x * 100) + "%;top:" + (x.sijainti.piste.y * 100) + '%">' + esc(tunnus(x) || PREFIX) + "</span></div>" : "") +
        "</div></section>" +
        (miss.length ? '<div class="alert info">' + icon("alert") + "<div>Puuttuu: " + esc(miss.join(", ")) + ".</div></div>" : "") +
        '<div class="row-btns" style="margin-top:4px"><a class="btn" href="#/k/' + k.id + '/seuranta">Valmis</a>' +
          '<button class="btn btn-primary" data-a="seuraava">' + icon("plus") + "Seuraava laite</button></div>" +
        '<div style="height:12px"></div><button class="btn btn-danger btn-block" data-a="poista">' + icon("trash") + "Poista mittalaite</button>" +
        "</main>";
      const mini = root.querySelector("[data-mini]");
      if (mini) { const z = Zoom.attach(mini, "seurmini:" + x.id); if (z) z.focus(x.sijainti.piste.x, x.sijainti.piste.y, 2.5); }
      const ni = root.querySelector("[data-nro]");
      checkNro(ni.value);
      if (focusNro) setTimeout(() => ni.focus(), 50);
    }

    // Tunnus: numero 1–99, ei samaa kahdesti samassa kohteessa
    function checkNro(v) {
      const msg = root.querySelector("[data-nromsg]");
      const n = parseInt(v, 10);
      if (!v) { msg.textContent = "Laitteen oma numero, esim. 12 → " + PREFIX + "12."; msg.style.color = ""; return null; }
      if (!/^\d{1,2}$/.test(v) || n < 1 || n > MAXNRO) { msg.textContent = "Numero väliltä 1–" + MAXNRO + "."; msg.style.color = "var(--note-line)"; return false; }
      const dup = list().find((y) => y.nro === n && y.id !== x.id);
      if (dup) {
        const dt = Model.tila(dup.sijainti.tilaId);
        msg.textContent = PREFIX + n + " on jo kirjattu" + (dt ? " (" + Model.tilaNimi(dt) + ")" : "") + ". Tarkista numero.";
        msg.style.color = "var(--note-line)"; return false;
      }
      msg.textContent = ""; msg.style.color = ""; return n;
    }

    async function addPhotos(files) {
      for (const f of files) {
        const blob = await Camera.shrink(f);
        x.kuvat.push(await DB.putFile(k.id, blob, { seuranta: x.id }));
      }
      await save(); paint();
    }

    root.oninput = async (ev) => {
      const ni = ev.target.closest("[data-nro]");
      if (!ni) return;
      ni.value = ni.value.replace(/\D/g, "").slice(0, 2);
      const n = checkNro(ni.value);
      x.nro = n || null;
      root.querySelector(".tb-title h1").textContent = tunnus(x) || "Uusi mittalaite";
      await save();
    };
    root.onclick = async (ev) => {
      const del = ev.target.closest("[data-delimg]");
      if (del) {
        if (!(await confirmSheet({ title: "Poistetaanko kuva?", ok: "Poista", danger: true }))) return;
        await DB.del("tiedostot", del.dataset.delimg);
        x.kuvat = x.kuvat.filter((f) => f !== del.dataset.delimg); await save(); paint(); return;
      }
      const img = ev.target.closest("[data-view]");
      if (img) { UI.sheet('<img src="' + img.src + '" alt="" style="width:100%;border-radius:10px"><div class="row-btns"><button class="btn" data-close>Sulje</button></div>'); return; }
      const b = ev.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "kuva") addPhotos(await UI.pickFile("image/*", false, "environment"));
      else if (a === "galleria") addPhotos(await UI.pickFile("image/*", true));
      else if (a === "sijainti") {
        Plan.locationSheet(x.sijainti, async (s) => {
          x.sijainti = { kerrosId: s.kerrosId || null, tilaId: s.tilaId || null, piste: s.piste || null };
          await save(); paint();
        }, { noPart: true, title: "Mittalaitteen sijainti", mirExcept: x.id, hint: "Napauta laitteen kohtaa pohjakuvassa" });
      } else if (a === "seuraava") {
        if (x.nro == null && root.querySelector("[data-nro]").value) { toast("Tarkista tunnus ennen seuraavaa laitetta.", 2600); return; }
        location.hash = "#/k/" + k.id + "/seuranta/uusi";
      } else if (a === "poista") {
        if (!tyhja(x) && !(await confirmSheet({ title: "Poistetaanko " + (tunnus(x) || "mittalaite") + "?", text: "Laitteen kuvat ja sijainti poistetaan.", ok: "Poista", danger: true }))) return;
        for (const f of x.kuvat) await DB.del("tiedostot", f);
        S.kohde.seuranta = list().filter((y) => y.id !== x.id);
        await Model.saveKohde();
        location.hash = "#/k/" + k.id + "/seuranta";
      }
    };
    S.cleanup = () => {
      root.oninput = root.onclick = null;
      if (tyhja(x)) { S.kohde.seuranta = list().filter((y) => y.id !== x.id); Model.saveKohde(); }
    };
    await paint(!x.nro);
  }

  async function view(id) {
    if (id) await viewLaite(id); else await viewList();
  }

  window.Seuranta = { view, pinsHtml, kohdeCard, puutteet, tunnus, list, sorted, PREFIX };
})();
