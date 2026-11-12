/* =========================================================================
   plan.js – Pohjapiirros, kerrokset, tilat ja sijainnin valinta
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, confirmSheet, promptSheet, nro } = UI;
  const { S, Model } = App;

  const PDFJS = "lib/pdf.min.js";
  const PDFJS_WORKER = "lib/pdf.worker.min.js";
  const KERROSEHDOTUKSET = ["Kellari", "1. krs", "2. krs", "3. krs", "Ullakko", "Ryömintätila"];

  let currentFloor = null;
  let placingRoom = null; // tilan id, jota sijoitetaan pohjaan

  /* ---------- Pohjakuvan lisäys (kuva tai PDF) ---------- */
  async function pdfToBlob(file) {
    await UI.loadScript(PDFJS);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    let pageNo = 1;
    if (pdf.numPages > 1) {
      pageNo = await new Promise((resolve) => {
        const n = Math.min(pdf.numPages, 30);
        let btns = "";
        for (let i = 1; i <= n; i++) btns += '<button class="chip" data-p="' + i + '">Sivu ' + i + "</button>";
        sheet("<h3>Mikä sivu on tämän kerroksen pohjapiirros?</h3><div class=\"chips\">" + btns + "</div>",
          (el, close) => el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => close(+b.dataset.p))),
          { onClose: (v) => resolve(v || 1) });
      });
    }
    const page = await pdf.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(6, 3200 / Math.max(base.width, base.height));   // pienetkin tekstit luettaviksi
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    let tokens = [];
    try { if (window.PlanRooms) tokens = await PlanRooms.pdfTokens(page, vp); } catch (e) { console.warn("PDF-teksti", e); }
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    return { blob, tokens };
  }

  async function imageSize(blob) {
    const bmp = await createImageBitmap(blob);
    const s = { w: bmp.width, h: bmp.height };
    if (bmp.close) bmp.close();
    return s;
  }

  async function setPlan(kerros) {
    const files = await UI.pickFile("image/*,application/pdf", false);
    if (!files.length) return;
    const f = files[0];
    toast("Käsitellään pohjakuvaa…", 4000);
    try {
      let blob, tokens = [];
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) ({ blob, tokens } = await pdfToBlob(f));
      else blob = await Camera.shrink(f, 4096);   // pohjakuvassa pienet tekstit: tarkkuutta enemmän kuin havaintokuvissa
      const size = await imageSize(blob);
      const old = kerros.planId;
      kerros.planId = await DB.putFile(S.kohde.id, blob, { kind: "pohja", kerrosId: kerros.id });
      kerros.w = size.w; kerros.h = size.h;
      kerros.planTexts = tokens.length ? tokens : null;
      if (old) await DB.del("tiedostot", old);
      await Model.saveKohde();
      toast("Pohjakuva lisätty");
      App.render();
      detectRooms(kerros, blob, false, f.type && f.type.startsWith("image/") ? f : null);
    } catch (e) {
      console.error(e);
      toast("Pohjakuvan lisäys epäonnistui: " + (e.message || e), 5000);
    }
  }

  /* ---------- Tilojen tunnistus pohjakuvasta ---------- */
  const normName = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  let detecting = false;

  async function detectRooms(kerros, blob, manual, original) {
    if (!window.PlanRooms || detecting || !kerros.planId) return;
    detecting = true;
    try {
      if (!blob) { const f = await DB.get("tiedostot", kerros.planId); blob = f && f.blob; }
      if (!blob) return;
      const hasText = kerros.planTexts && kerros.planTexts.length;
      toast(hasText ? "Tunnistetaan tiloja…" : "Luetaan tilojen nimiä kuvasta…", 60000);
      const res = await PlanRooms.detect({
        pdfTokens: kerros.planTexts, image: original || blob,
        progress: (p) => {
          const v = typeof p === "number" ? p : p && typeof p.progress === "number" ? p.progress : null;
          if (v != null) toast("Luetaan tilojen nimiä kuvasta… " + Math.round(v * 100) + " %", 60000);
        }
      });
      if (!res.tilat.length) { toast(manual ? "Pohjakuvasta ei löytynyt tilojen nimiä. Lisää tilat käsin." : "Tilojen nimiä ei tunnistettu – lisää tilat käsin", 4000); return; }
      const te = document.getElementById("toast"); if (te) te.classList.remove("on");
      await reviewRooms(kerros, res);
    } catch (e) {
      console.error(e);
      toast("Tilojen tunnistus epäonnistui: " + (e.message || e), 5000);
    } finally { detecting = false; }
  }

  /* ---------- Tunnistettujen tilojen lisäys ----------
     Varmat tunnistukset lisätään suoraan. Tarkistettavaksi näytetään vain epävarmat, ja
     kustakin näytetään pohjakuvan kohta, josta nimi luettiin: vertailu on silmäyksen asia.
     Suoraan lisätyt tilat ovat "tunnistettuja" siihen asti, kunnes ne vahvistuvat käytössä:
     kun tila valitaan havainnon sijainniksi tai sitä muokataan, tutkija on nähnyt sen nimen. */
  async function loadImg(url) { const im = new Image(); im.src = url; await im.decode(); return im; }
  function cropCanvas(img, r, kierto, W, H) {
    const outW = 132, outH = 52;
    const th = Math.max(6, (r.h || 0.01) * (kierto % 180 ? img.naturalWidth : img.naturalHeight));
    const cw = th * 7, ch = cw * outH / outW;
    const sw = kierto % 180 ? ch : cw, sh = kierto % 180 ? cw : ch;
    const cx = r.x * img.naturalWidth, cy = r.y * img.naturalHeight;
    const c = document.createElement("canvas"); c.width = outW * 2; c.height = outH * 2;
    c.className = "rv-crop";
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.translate(c.width / 2, c.height / 2); g.rotate((kierto || 0) * Math.PI / 180); g.scale(c.width / cw, c.width / cw);
    g.drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh, -sw / 2, -sh / 2, sw, sh);
    return c;
  }

  function addRooms(kerros, list, lahde) {
    const existing = S.kohde.tilat.filter((t) => t.kerrosId === kerros.id);
    let nNew = 0, nUpd = 0;
    list.forEach((r) => {
      const nimi = (r.nimi || "").trim(), tunnus = (r.tunnus || "").trim();
      if (!nimi && !tunnus) return;
      const tunnistus = { lahde, raaka: r.raaka || "", avain: r.avain || "", vahvistettu: !!r.tarkistettu, aika: Date.now() };
      const pos = { x: r.x, y: r.y };
      const old = r.olemassa && existing.includes(r.olemassa) ? r.olemassa : null;
      if (old) {
        old.pos = pos; if (!old.tunnus && tunnus) old.tunnus = tunnus; if (nimi && !(old.tunnistus && old.tunnistus.vahvistettu && old.nimi)) old.nimi = nimi;
        if (!old.tunnistus) old.tunnistus = Object.assign(tunnistus, { vahvistettu: true });   // tutkijan itse luoma tila
        nUpd++;
      } else {
        S.kohde.tilat.push({ id: DB.uid("t_"), tunnus, nimi, kerrosId: kerros.id, pos, merkinta: null, tunnistus });
        nNew++;
      }
    });
    return { nNew, nUpd };
  }

  // Sama tunnus kahdesti (esim. MH2 luettu kahdesti): molemmat tarkistukseen
  function merkitseKaksoset(rows) {
    const tun = {};
    rows.forEach((r) => { const t = normName(r.tunnus || ""); if (t) (tun[t] = tun[t] || []).push(r); });
    Object.values(tun).forEach((l) => { if (l.length > 1) l.forEach((r) => { r.varma = false; r.syy = "tunnus " + r.tunnus + " löytyi " + l.length + " kertaa – korjaa tai hylkää ylimääräinen"; }); });
  }

  async function reviewRooms(kerros, res) {
    await Model.ensureUrls([kerros.planId]);
    const existing = S.kohde.tilat.filter((t) => t.kerrosId === kerros.id);
    const match = (c) => existing.find((t) => (c.tunnus && normName(t.tunnus) === normName(c.tunnus)) ||
      (!t.tunnus && !c.tunnus && normName(t.nimi) === normName(c.nimi)) ||
      (!c.tunnus && normName(t.nimi) === normName(c.nimi) && !existing.some((o) => o !== t && normName(o.nimi) === normName(c.nimi))));
    const sorted = res.tilat.slice().sort((a, b) => (a.asunto || "").localeCompare(b.asunto || "", "fi", { numeric: true }) || (a.tunnus || "").localeCompare(b.tunnus || "", "fi", { numeric: true }));
    const rows = sorted.map((c, i) => Object.assign({}, c, { i, olemassa: match(c) }));
    merkitseKaksoset(rows);
    const auto = rows.filter((r) => r.varma), check = rows.filter((r) => !r.varma);
    const lahde = res.lahde === "pdf" ? "pohjakuva (PDF:n teksti)" : "pohjakuva (tekstintunnistus)";

    // Ei epävarmoja: lisätään suoraan
    if (!check.length) {
      const n = addRooms(kerros, auto, lahde);
      await Model.saveKohde();
      App.render();
      toast(roomsMsg(n) + " pohjakuvasta. Nimet vahvistuvat, kun käytät tiloja kentällä.", 4500);
      return;
    }

    let img = null;
    try { img = await loadImg(Model.url(kerros.planId)); } catch (e) { img = null; }
    const rowHtml = (r, on) =>
      '<div class="rvrow2' + (on === true ? " on" : on === false ? " off" : "") + '" data-ri="' + r.i + '">' +
      '<div class="rv-img" data-crop="' + r.i + '"></div>' +
      '<div class="rv-fields"><div class="rv-inp"><input type="text" data-t value="' + esc(r.tunnus) + '" placeholder="Tunnus" aria-label="Tunnus" class="rv-tun">' +
      '<input type="text" data-n value="' + esc(r.nimi) + '" aria-label="Nimi"></div>' +
      '<div class="rv-info">' + esc(r.olemassa ? "päivittää: " + Model.tilaNimi(r.olemassa) : r.syy || (r.paatelty ? "päätelty muista samanlaisista asunnoista" : r.raaka ? "luettu: " + r.raaka : "")) + "</div></div>" +
      '<div class="rv-yn"><button class="rv-y" data-y aria-label="Tila, lisätään">' + icon("ok") + '</button><button class="rv-x" data-x aria-label="Ei tila">' + icon("close") + "</button></div></div>";
    const state = {};                         // i -> true (lisätään) / false (ei)
    auto.forEach((r) => { state[r.i] = true; });
    check.forEach((r) => { state[r.i] = r.paatelty || r.pohjasta ? true : undefined; });

    sheet(
      "<h3>" + rows.length + " tilaa tunnistettu · " + esc(kerros.nimi) + "</h3>" +
      '<p><b>' + auto.length + "</b> lisätään suoraan. Tarkista <b>" + check.length + "</b> epävarmaa: onko kuvassa tilan nimi, ja onko se luettu oikein?</p>" +
      (res.kierto ? '<p class="hint">Piirustus on kuvassa kiertyneenä (' + res.kierto + "°). Leikkeet näytetään oikein päin.</p>" : "") +
      '<div class="rvlist2" data-check>' + check.map((r) => rowHtml(r, state[r.i])).join("") + "</div>" +
      '<button class="link" data-showall style="margin:10px 0 2px">Näytä myös suoraan lisättävät (' + auto.length + ")</button>" +
      '<div class="rvlist2 hidden" data-auto></div>' +
      '<div class="row-btns" style="margin-top:12px"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok></button></div>',
      (el, close) => {
        const okBtn = el.querySelector("[data-ok]");
        const paintCrops = (root) => {
          if (!img) return;
          root.querySelectorAll("[data-crop]:empty").forEach((d) => d.appendChild(cropCanvas(img, rows[+d.dataset.crop], res.kierto || 0)));
        };
        const count = () => {
          const n = rows.filter((r) => state[r.i] === true).length, open = check.filter((r) => state[r.i] === undefined).length;
          okBtn.textContent = "Lisää " + n + " tilaa";
          okBtn.title = open ? open + " epävarmaa ratkaisematta: niitä ei lisätä" : "";
        };
        el.addEventListener("click", (e) => {
          const row = e.target.closest("[data-ri]");
          if (!row) return;
          const i = +row.dataset.ri;
          if (e.target.closest("[data-y]")) state[i] = true;
          else if (e.target.closest("[data-x]")) state[i] = false;
          else return;
          row.classList.toggle("on", state[i] === true); row.classList.toggle("off", state[i] === false);
          count();
        });
        el.addEventListener("input", (e) => {
          const row = e.target.closest("[data-ri]");
          if (row && e.target.matches("[data-n],[data-t]") && e.target.value.trim()) { state[+row.dataset.ri] = true; row.classList.add("on"); row.classList.remove("off"); count(); }
        });
        el.querySelector("[data-showall]").addEventListener("click", (e) => {
          const box = el.querySelector("[data-auto]");
          if (!box.innerHTML) { box.innerHTML = auto.map((r) => rowHtml(r, true)).join(""); paintCrops(box); }
          box.classList.toggle("hidden");
          e.target.textContent = box.classList.contains("hidden") ? "Näytä myös suoraan lisättävät (" + auto.length + ")" : "Piilota suoraan lisättävät";
        });
        paintCrops(el.querySelector("[data-check]"));
        count();
        okBtn.addEventListener("click", async () => {
          const add = [];
          rows.forEach((r) => {
            const row = el.querySelector('[data-ri="' + r.i + '"]');
            const nimi = row ? row.querySelector("[data-n]").value.trim() : r.nimi;
            const tunnus = row ? row.querySelector("[data-t]").value.trim() : r.tunnus;
            const shown = !!row, decided = state[r.i];
            const changed = nimi !== r.nimi;
            // Oppiminen: vain tutkijan nähtävillä olleista päätöksistä
            if (shown && r.avain) {
              if (decided === false) PlanRooms.reject(r.avain);
              else if (decided === true && changed && nimi) PlanRooms.learn(r.avain, nimi);
              else if (decided === true && !r.varma) PlanRooms.confirm(r.avain, nimi);
            }
            if (decided === true) add.push(Object.assign({}, r, { nimi, tunnus, tarkistettu: shown && (!r.varma || changed) }));
          });
          const n = addRooms(kerros, add, lahde);
          await Model.saveKohde();
          close(true);
          toast(roomsMsg(n) + ". Nimet vahvistuvat, kun käytät tiloja kentällä.", 4000);
          App.render();
        });
      }
    );
  }
  const roomsMsg = (n) => [n.nNew && n.nNew + " tilaa lisätty", n.nUpd && n.nUpd + " päivitetty"].filter(Boolean).join(", ") || "Ei muutoksia";

  /* Tunnistettu tila vahvistuu: tutkija valitsi sen, nimesi sen tai kuittasi sen */
  function confirmRoom(t, how) {
    if (!t || !t.tunnistus || t.tunnistus.vahvistettu) return false;
    t.tunnistus.vahvistettu = true; t.tunnistus.vahvistus = how; t.tunnistus.vahvistettuAika = Date.now();
    if (window.PlanRooms && t.tunnistus.avain) PlanRooms.confirm(t.tunnistus.avain, t.nimi);
    return true;
  }

  /* "Mikä tila tämä on?" – pohjakuvan kohta, jossa ei ole tunnistettua tilaa.
     Yleisimmät tilat yhdellä napautuksella, oma nimi tai lyhenne (VH2 -> Vaatehuone) tai lähin tila. */
  const YLEISET_TILAT = ["Olohuone", "Keittiö", "Makuuhuone", "Kylpyhuone", "Pesuhuone", "Sauna", "WC", "Eteinen", "Tuulikaappi", "Kodinhoitohuone", "Vaatehuone", "Varasto", "Tekninen tila", "Käytävä", "Porrashuone", "Toimisto", "Luokka", "Kellari", "Ullakko"];
  function kysyTila(p, kerrosId, lahimmat) {
    return new Promise((resolve) => {
      let done = false;
      sheet("<h3>Mikä tila tämä on?</h3>" +
        '<p class="hint" style="margin:-4px 0 10px">Kohdassa ei ole tunnistettua tilaa. Tila lisätään pohjakuvaan tähän kohtaan.</p>' +
        '<div class="chips" style="margin-bottom:12px">' + YLEISET_TILAT.map((n) => '<button class="chip" data-n="' + esc(n) + '">' + esc(n) + "</button>").join("") + "</div>" +
        '<div style="display:flex;gap:8px"><input type="text" data-oma placeholder="Oma nimi tai tunnus, esim. VH2 tai A12 Luokka" autocomplete="off" style="flex:1;min-width:0"><button class="btn btn-primary" data-lisaa>Lisää</button></div>' +
        (lahimmat.length ? '<span class="label" style="margin-top:14px;display:block">Vai onko se jokin näistä?</span><div class="chips">' +
          lahimmat.map((t) => '<button class="chip" data-t="' + t.id + '">' + esc(Model.tilaNimi(t)) + "</button>").join("") + "</div>" : "") +
        '<div class="row-btns" style="margin-top:14px"><button class="btn" data-close>Vain kohta, tila myöhemmin</button></div>',
        (el, close) => {
          const luo = async (txt) => {
            txt = String(txt || "").trim();
            if (!txt) return;
            // "VH2", "A12 Luokka", "Luokka": tunnus ja nimi erikseen; lyhenne avataan sanaston mukaan
            let tunnus = "", nimi = txt;
            const m = txt.match(/^([A-ZÅÄÖa-zåäö]{1,4}\s?\d{1,4}[a-zA-Z]?)(?:\s+(.+))?$/);
            if (m) {
              tunnus = m[1].toUpperCase().replace(/\s+/g, "");
              const ab = window.PlanRooms ? PlanRooms.matchAbbr(tunnus.replace(/\d+[A-Z]?$/, "")) : null;
              nimi = m[2] ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : (ab && ab.nimi) || "";
            } else if (window.PlanRooms) {
              const ab = PlanRooms.matchAbbr(txt.toUpperCase());
              if (ab && ab.nimi) { tunnus = txt.toUpperCase(); nimi = ab.nimi; }
              else nimi = txt.charAt(0).toUpperCase() + txt.slice(1);
            }
            const t = { id: DB.uid("t_"), tunnus, nimi, kerrosId, pos: { x: p.x, y: p.y }, merkinta: null,
              tunnistus: { lahde: "kasin", raaka: txt, vahvistettu: true, vahvistus: "lisatty", aika: Date.now() } };
            S.kohde.tilat.push(t);
            await Model.saveKohde();
            done = true; close(); resolve(t);
          };
          el.addEventListener("click", (e) => {
            const b = e.target.closest("button");
            if (!b) return;
            if (b.dataset.n) luo(b.dataset.n);
            else if (b.dataset.t) { done = true; close(); resolve(Model.tila(b.dataset.t)); }
            else if (b.dataset.lisaa != null) luo(el.querySelector("[data-oma]").value);
          });
          el.querySelector("[data-oma]").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); luo(e.target.value); } });
        },
        { onClose: () => { if (!done) resolve(null); } }
      );
    });
  }

  async function addFloor() {
    return new Promise((resolve) => {
      sheet("<h3>Uusi kerros</h3><div class=\"chips\" style=\"margin-bottom:14px\">" +
        KERROSEHDOTUKSET.map((n) => '<button class="chip" data-n="' + esc(n) + '">' + esc(n) + "</button>").join("") + "</div>" +
        '<label class="field"><span>Tai oma nimi</span><input type="text" data-in></label>' +
        '<div class="row-btns"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Lisää</button></div>',
        (el, close) => {
          const done = async (nimi) => {
            if (!nimi) { toast("Anna kerrokselle nimi"); return; }
            const k = { id: DB.uid("e_"), nimi, planId: null, w: 0, h: 0 };
            S.kohde.kerrokset.push(k);
            await Model.saveKohde();
            currentFloor = k.id;
            close(k);
          };
          el.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => done(b.dataset.n)));
          el.querySelector("[data-ok]").addEventListener("click", () => done(el.querySelector("[data-in]").value.trim()));
        },
        { onClose: (v) => resolve(v || null) });
    });
  }

  async function roomSheet(t, kerrosId) {
    const isNew = !t || !!t.__new;
    if (t && t.__new) delete t.__new;
    return new Promise((resolve) => {
      t = t || { id: DB.uid("t_"), tunnus: "", nimi: "", kerrosId: kerrosId, pos: null, merkinta: null };
      sheet("<h3>" + (isNew ? "Uusi tila" : "Muokkaa tilaa") + "</h3>" +
        '<div class="grid2" style="grid-template-columns:1fr 2fr"><label class="field"><span>Tunnus</span><input type="text" data-f="tunnus" value="' + esc(t.tunnus) + '" placeholder="K03" autofocus></label>' +
        '<label class="field"><span>Nimi</span><input type="text" data-f="nimi" value="' + esc(t.nimi) + '" placeholder="Varasto"></label></div>' +
        '<label class="field"><span>Kerros</span><select data-f="kerros">' + S.kohde.kerrokset.map((e) => '<option value="' + e.id + '"' + (e.id === t.kerrosId ? " selected" : "") + ">" + esc(e.nimi) + "</option>").join("") + "</select></label>" +
        '<div class="row-btns"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Tallenna</button></div>',
        (el, close) => {
          el.querySelector("[data-ok]").addEventListener("click", async () => {
            const tunnus = el.querySelector('[data-f="tunnus"]').value.trim();
            const nimi = el.querySelector('[data-f="nimi"]').value.trim();
            if (!tunnus && !nimi) { toast("Anna tunnus tai nimi"); return; }
            const kid = el.querySelector('[data-f="kerros"]').value;
            if (kid !== t.kerrosId) t.pos = null;
            if (!isNew && t.tunnistus && nimi && nimi !== t.nimi && t.tunnistus.avain && window.PlanRooms) PlanRooms.learn(t.tunnistus.avain, nimi);
            if (!isNew && t.tunnistus && !t.tunnistus.vahvistettu) { t.tunnistus.vahvistettu = true; t.tunnistus.vahvistus = "muokattu"; t.tunnistus.vahvistettuAika = Date.now(); }
            t.tunnus = tunnus; t.nimi = nimi; t.kerrosId = kid;
            if (isNew) S.kohde.tilat.push(t);
            await Model.saveKohde();
            close(t);
          });
        },
        { onClose: (v) => resolve(v || null) });
    });
  }

  // Pohjakuvasta tunnistetun asunnon tunnus tilan tunnuksen alussa: "As3 MH1" -> "As3"
  const aptOf = (t) => { const m = String(t.tunnus || "").match(/^(\S+)\s+\S/); return m && t.tunnistus ? m[1] : ""; };

  function statusChip(st) {
    const d = M.TILASTATUS[st];
    return '<span class="st ' + d.cls + '">' + d.l + "</span>";
  }

  function roomActions(t) {
    const k = S.kohde;
    const st = Model.tilaStatus(t);
    const kerros = Model.kerros(t.kerrosId);
    const obs = S.havainnot.filter((h) => h.sijainti && h.sijainti.tilaId === t.id);
    const unconf = t.tunnistus && !t.tunnistus.vahvistettu;
    sheet("<h3>" + esc(Model.tilaNimi(t)) + "</h3>" +
      (unconf ? '<p class="hint" style="margin-top:-4px">Tunnistettu pohjakuvasta' + (t.tunnistus.raaka ? " (luettu: " + esc(t.tunnistus.raaka) + ")" : "") + ", nimeä ei ole vielä vahvistettu.</p>" : "") +
      "<p>" + statusChip(st) +
      (t.merkinta && t.merkinta.syy ? " " + esc(t.merkinta.syy) : "") + (obs.length ? " · " + obs.length + " havaintoa" : "") + "</p>" +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button class="btn btn-primary" data-a="kuva">' + icon("cam") + "Kuva + sanelu tässä tilassa</button>" +
      (!obs.length && !t.merkinta ? '<button class="btn" data-a="ok">Tarkastettu, ei huomautettavaa</button><button class="btn" data-a="eip">Ei pääsyä + syy</button>' : "") +
      (t.merkinta ? '<button class="btn" data-a="clear">Poista merkintä (' + esc(M.TILASTATUS[t.merkinta.tila].l.toLowerCase()) + ")</button>" : "") +
      (kerros && kerros.planId ? '<button class="btn" data-a="place">' + icon("pin") + (t.pos ? "Siirrä merkki pohjapiirroksessa" : "Sijoita pohjapiirrokseen") + "</button>" : "") +
      (unconf ? '<button class="btn" data-a="conf">' + icon("ok") + "Nimi on oikein</button>" : "") +
      (aptOf(t) ? '<button class="btn" data-a="apt">' + icon("edit") + "Vaihda asunnon tunnus (" + esc(aptOf(t)) + ")</button>" : "") +
      '<button class="btn" data-a="edit">' + icon("edit") + "Muokkaa</button>" +
      (!obs.length ? '<button class="btn btn-danger" data-a="del">' + icon("trash") + "Poista tila</button>" : "") +
      "</div>",
      (el, close) => {
        const on = (a, fn) => { const b = el.querySelector('[data-a="' + a + '"]'); if (b) b.addEventListener("click", fn); };
        on("kuva", () => { close(); location.hash = "#/k/" + k.id + "/kuvaus?tila=" + t.id; });
        on("ok", async () => { t.merkinta = { tila: "tarkastettu", aika: Date.now() }; await Model.saveKohde(); close(); App.render(); });
        on("eip", async () => {
          close();
          const syy = await promptSheet({ title: "Miksi tilaan ei päässyt?", label: "Syy (näkyy raportissa rajauksena)", required: true });
          if (syy == null) return;
          t.merkinta = { tila: "ei_paasya", syy, aika: Date.now() };
          await Model.saveKohde(); App.render();
        });
        on("clear", async () => { t.merkinta = null; await Model.saveKohde(); close(); App.render(); });
        on("place", () => {
          close(); placingRoom = t.id; currentFloor = t.kerrosId;
          if (location.hash.indexOf("/pohja") < 0) location.hash = "#/k/" + k.id + "/pohja"; else App.render();
          toast("Napauta tilan kohtaa pohjapiirroksessa", 3000);
        });
        on("edit", async () => { close(); await roomSheet(t); App.render(); });
        on("apt", async () => {
          close();
          const old = aptOf(t);
          const nw = await promptSheet({ title: "Asunnon tunnus", label: "Kaikkien " + old + "-alkuisten tilojen tunnus vaihtuu (esim. C12)", value: old, required: true });
          if (!nw || nw === old) return;
          k.tilat.filter((x) => x.kerrosId === t.kerrosId && aptOf(x) === old).forEach((x) => { x.tunnus = nw + x.tunnus.slice(old.length); });
          await Model.saveKohde(); App.render(); toast("Asunnon tunnus vaihdettu");
        });
        on("conf", async () => { confirmRoom(t, "kuitattu"); await Model.saveKohde(); close(); App.render(); toast("Vahvistettu"); });
        on("del", async () => {
          close();
          if (!(await confirmSheet({ title: "Poistetaanko tila " + Model.tilaNimi(t) + "?", ok: "Poista tila", danger: true }))) return;
          if (t.tunnistus && !t.tunnistus.vahvistettu && t.tunnistus.avain && window.PlanRooms) PlanRooms.reject(t.tunnistus.avain);   // väärä tunnistus
          k.tilat = k.tilat.filter((x) => x.id !== t.id);
          k.suunnitelma.forEach((p) => { if (p.tilaId === t.id) p.tilaId = null; });
          await Model.saveKohde(); App.render();
        });
      });
  }

  function obsPopup(h) {
    sheet("<h3>" + nro(h) + " · " + esc(Model.sijaintiTeksti(h.sijainti)) + "</h3>" +
      "<p>" + esc(M.menetelma(h.menetelma).nimi + (h.tulos ? " · " + M.TULOKSET[h.tulos] : "")) + "</p>" +
      (h.sanelu ? '<p style="color:var(--ink)">' + esc(h.sanelu.length > 220 ? h.sanelu.slice(0, 220) + "…" : h.sanelu) + "</p>" : "") +
      '<div class="row-btns"><button class="btn" data-c>' + icon("cam") + 'Lisää kuva</button><button class="btn btn-primary" data-o>Avaa</button></div>',
      (el, close) => {
        el.querySelector("[data-o]").addEventListener("click", () => { close(); location.hash = "#/k/" + S.kohde.id + "/h/" + h.id; });
        el.querySelector("[data-c]").addEventListener("click", () => { close(); location.hash = "#/k/" + S.kohde.id + "/kuvaus/" + h.id; });
      });
  }

  /* Pohjapiirroksen merkit HTML:nä (prosentteina, skaalautuu kuvan mukana) */
  function pinsHtml(kerrosId, opts) {
    opts = opts || {};
    let out = "";
    if (!opts.noRooms) {
      const fr = S.kohde.tilat.filter((t) => t.kerrosId === kerrosId && t.pos), many = fr.length > 20;
      fr.forEach((t) => {
        const lbl = aptOf(t) ? t.tunnus.slice(aptOf(t).length).trim() : (t.tunnus || t.nimi);
        const st = M.TILASTATUS[Model.tilaStatus(t)];
        out += '<button class="pin room ' + st.cls + (many ? " sm" : "") + (opts.sel === t.id ? " sel" : "") + (t.tunnistus && !t.tunnistus.vahvistettu ? " unconf" : "") + '" data-room="' + t.id + '" style="left:' + (t.pos.x * 100) + "%;top:" + (t.pos.y * 100) + '%" aria-label="' + esc(Model.tilaNimi(t) + ", " + st.l) + '">' + esc(lbl) + "</button>";
      });
    }
    S.havainnot.filter((h) => h.sijainti && h.sijainti.piste && h.sijainti.kerrosId === kerrosId && h.id !== opts.except).forEach((h) => {
      const p = h.sijainti.piste;
      out += '<button class="pin ' + App.pinClass(h) + '" data-obs="' + h.id + '" style="left:' + (p.x * 100) + "%;top:" + (p.y * 100) + '%' + (opts.dim ? ";opacity:.45" : "") + '" aria-label="Havainto ' + nro(h) + '">' + UI.nroLyhyt(h) + "</button>";
    });
    // olosuhdeseurannan mittalaitteet
    if (window.Seuranta && !opts.noMir) out += Seuranta.pinsHtml(kerrosId, { dim: opts.dim, except: opts.mirExcept });
    return out;
  }

  function relPos(e, img) {
    const r = img.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  /* ---------- Näkymä ---------- */
  async function view() {
    const k = S.kohde;
    if (!currentFloor || !Model.kerros(currentFloor)) currentFloor = k.kerrokset[0] ? k.kerrokset[0].id : null;
    const kerros = Model.kerros(currentFloor);
    if (kerros && kerros.planId) await Model.ensureUrls([kerros.planId]);

    const tabs = k.kerrokset.map((e) => '<button class="chip" data-a="floor" data-id="' + e.id + '" aria-pressed="' + (e.id === currentFloor) + '">' + esc(e.nimi) + "</button>").join("") +
      '<button class="chip" data-a="addFloor">' + "+ Kerros</button>";

    let body = "";
    if (!kerros) {
      body = '<section class="card"><div class="empty">Lisää ensin kerros, esimerkiksi Kellari tai 1. krs. Kerrokseen voi liittää pohjakuvan (kuva tai PDF) ja tilat.<br><br>' +
        '<button class="btn btn-primary" data-a="addFloor">' + icon("plus") + "Lisää kerros</button></div></section>";
    } else {
      const rooms = k.tilat.filter((t) => t.kerrosId === kerros.id);
      body =
        (kerros.planId
          ? '<div class="plan-wrap' + (placingRoom ? " placing" : "") + '" data-plan><img src="' + Model.url(kerros.planId) + '" alt="Pohjapiirros: ' + esc(kerros.nimi) + '" draggable="false">' + pinsHtml(kerros.id) + "</div>" +
            (placingRoom ? '<div class="alert" style="margin-top:10px">' + icon("pin") + "<div>Napauta tilan " + esc(Model.tilaNimi(Model.tila(placingRoom))) + ' kohtaa. <button class="link" data-a="cancelPlace">Peruuta</button></div></div>' : "")
          : '<section class="card"><div class="empty">Ei pohjakuvaa.<br><br><button class="btn" data-a="setPlan">' + icon("image") + "Lisää pohjakuva (kuva tai PDF)</button></div></section>") +
        '<div class="legend">' + Object.keys(M.TILASTATUS).map((s) => '<div><span class="st ' + M.TILASTATUS[s].cls + '" style="width:22px;height:16px;padding:0;border-radius:3px"></span>' + M.TILASTATUS[s].l + "</div>").join("") + "</div>" +
        '<section class="card"><div class="card-h"><h2>Tilat · ' + esc(kerros.nimi) + '</h2><span class="meta">' + rooms.length + "</span></div>" +
        (rooms.some((t) => t.tunnistus && !t.tunnistus.vahvistettu) ? '<div class="card-b hint" style="padding-top:8px;margin:0">Katkoviivalla merkityt tilat on tunnistettu pohjakuvasta. Ne vahvistuvat, kun valitset tilan havainnon sijainniksi, muokkaat sitä tai kuittaat nimen. Vahvistamattomia: ' + rooms.filter((t) => t.tunnistus && !t.tunnistus.vahvistettu).length + ".</div>" : "") +
        (rooms.map((t) => '<button class="row" data-a="room" data-id="' + t.id + '"><div class="grow"><div class="t">' + esc(Model.tilaNimi(t)) + (t.tunnistus && !t.tunnistus.vahvistettu ? ' <span class="mp-tag">tunnistettu</span>' : "") + "</div>" +
          (t.merkinta && t.merkinta.syy ? '<div class="s">' + esc(t.merkinta.syy) + "</div>" : "") + "</div>" + statusChip(Model.tilaStatus(t)) + "</button>").join("") ||
          '<div class="empty">Ei tiloja. Lisää tilat, niin kattavuus näkyy ja lähtötarkistus muistuttaa tutkimatta jääneistä.</div>') +
        '<div class="card-b" style="padding-top:10px"><button class="btn btn-block" data-a="addRoom">' + icon("plus") + "Lisää tila</button></div></section>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        (kerros.planId ? '<button class="btn btn-sm" data-a="detect">' + icon("list") + "Tunnista tilat pohjakuvasta</button>" : "") +
        (kerros.planId ? '<button class="btn btn-sm" data-a="setPlan">' + icon("image") + "Vaihda pohjakuva</button>" : "") +
        '<button class="btn btn-sm" data-a="renameFloor">' + icon("edit") + "Nimeä kerros</button>" +
        '<button class="btn btn-sm btn-danger" data-a="delFloor">' + icon("trash") + "Poista kerros</button></div>";
    }

    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Pohjapiirros", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view"><div class="floor-tabs chips scroll">' + tabs + "</div>" + body + "</main>" +
      App.fab("#/k/" + k.id + "/kuvaus" + (kerros ? "?kerros=" + kerros.id : "")) + App.bottomnav("pohja");

    if (kerros && kerros.planId) Zoom.attach(root.querySelector("[data-plan]"), "plan:" + kerros.id, { fullscreen: true });

    root.onclick = async (e) => {
      const room = e.target.closest("[data-room]");
      const obs = e.target.closest("[data-obs]");
      const mir = e.target.closest("[data-mir]");
      const planEl = e.target.closest("[data-plan]");
      if (placingRoom && planEl) {
        const t = Model.tila(placingRoom);
        if (t) { t.pos = relPos(e, planEl.querySelector("img")); await Model.saveKohde(); }
        placingRoom = null; App.render(); return;
      }
      if (room) { roomActions(Model.tila(room.dataset.room)); return; }
      if (obs) { obsPopup(Model.havainto(obs.dataset.obs)); return; }
      if (mir) { location.hash = "#/k/" + k.id + "/seuranta/" + mir.dataset.mir; return; }
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "floor") { currentFloor = b.dataset.id; placingRoom = null; App.render(); }
      else if (a === "addFloor") { if (await addFloor()) App.render(); }
      else if (a === "setPlan") {
        if (kerros.planId && !(await confirmSheet({ title: "Vaihdetaanko pohjakuva?", text: "Havaintojen ja tilojen merkit säilyvät samoissa suhteellisissa kohdissa. Tarkista ne vaihdon jälkeen.", ok: "Valitse uusi kuva" }))) return;
        setPlan(kerros);
      }
      else if (a === "detect") detectRooms(kerros, null, true);
      else if (a === "addRoom") { const t = await roomSheet(null, kerros.id); if (t) { App.render(); if (kerros.planId) { placingRoom = t.id; App.render(); toast("Napauta tilan kohtaa pohjapiirroksessa, tai peruuta", 3000); } } }
      else if (a === "room") roomActions(Model.tila(b.dataset.id));
      else if (a === "cancelPlace") { placingRoom = null; App.render(); }
      else if (a === "renameFloor") {
        const n = await promptSheet({ title: "Kerroksen nimi", value: kerros.nimi, required: true });
        if (n) { kerros.nimi = n; await Model.saveKohde(); App.render(); }
      }
      else if (a === "delFloor") {
        const used = S.havainnot.some((h) => h.sijainti && h.sijainti.kerrosId === kerros.id) || k.tilat.some((t) => t.kerrosId === kerros.id);
        if (used) { toast("Kerroksessa on tiloja tai havaintoja. Siirrä tai poista ne ensin.", 4000); return; }
        if (!(await confirmSheet({ title: "Poistetaanko " + kerros.nimi + "?", ok: "Poista kerros", danger: true }))) return;
        if (kerros.planId) await DB.del("tiedostot", kerros.planId);
        k.kerrokset = k.kerrokset.filter((x) => x.id !== kerros.id);
        currentFloor = null; await Model.saveKohde(); App.render();
      }
    };
    S.cleanup = () => { root.onclick = null; };
  }

  /* ---------- Sijainnin valinta (kamera ja havaintokortti) ---------- */
  /* ---------- Sijainnin valinta ----------
     Nopein tapa ensin: viimeksi käytetyt tilat ja haku (tunnus tai nimi), sitten pohjapiirros
     (tilan merkin napautus valitsee tilan ja kohdan). Rakenneosa on valinnainen. */
  const normS = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function searchRooms(q, limit) {
    const words = normS(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    S.kohde.tilat.forEach((t) => {
      const tun = normS(t.tunnus), nim = normS(t.nimi), ker = normS((Model.kerros(t.kerrosId) || {}).nimi);
      const hay = tun + " " + tun.replace(/\s+/g, "") + " " + nim + " " + ker;
      if (!words.every((w) => hay.includes(w))) return;
      const w0 = words[0];
      const score = (tun === w0 || tun.replace(/\s+/g, "") === w0 ? 0 : tun.startsWith(w0) ? 1 : nim.startsWith(w0) ? 2 : 3);
      hits.push({ t, score });
    });
    hits.sort((a, b) => a.score - b.score || (a.t.tunnus || a.t.nimi).localeCompare(b.t.tunnus || b.t.nimi, "fi", { numeric: true }));
    return hits.slice(0, limit || 8).map((x) => x.t);
  }
  function recentRooms(n) {
    const seen = new Set(), out = [];
    S.havainnot.slice().sort((a, b) => b.updated - a.updated).forEach((h) => {
      const id = h.sijainti && h.sijainti.tilaId;
      if (id && !seen.has(id) && Model.tila(id)) { seen.add(id); out.push(Model.tila(id)); }
    });
    return out.slice(0, n || 6);
  }

  /* opts: noPart (ei rakenneosaa), title, hint, mirExcept (mittalaite, jonka vanha merkki piilotetaan) */
  function locationSheet(sij, onDone, opts) {
    opts = opts || {};
    const k = S.kohde;
    const s = JSON.parse(JSON.stringify(sij || {}));
    if (!s.kerrosId && k.kerrokset[0]) s.kerrosId = k.kerrokset[0].id;
    let showAll = false, query = "", zoomApi = null, focusNext = !!s.tilaId;

    const ref = sheet("<div data-body></div>", null, {});
    const el = ref.el;
    const roomChip = (t) => '<button class="chip" data-t="' + t.id + '" aria-pressed="' + (t.id === s.tilaId) + '">' + esc(Model.tilaNimi(t)) +
      (t.kerrosId !== s.kerrosId && k.kerrokset.length > 1 ? ' <span class="mp-tag">' + esc((Model.kerros(t.kerrosId) || {}).nimi || "") + "</span>" : "") + "</button>";

    function paintResults() {
      const box = el.querySelector("[data-res]");
      if (!box) return;
      if (!query.trim()) { box.innerHTML = ""; return; }
      const res = searchRooms(query, 8);
      box.innerHTML = '<div class="chips" style="margin-top:8px">' + res.map(roomChip).join("") +
        '<button class="chip" data-a="addRoom">+ Uusi tila' + (res.length ? "" : " “" + esc(query.trim()) + "”") + "</button></div>";
    }

    async function paint() {
      const kerros = Model.kerros(s.kerrosId);
      if (kerros && kerros.planId) await Model.ensureUrls([kerros.planId]);
      const rooms = k.tilat.filter((t) => t.kerrosId === s.kerrosId);
      const cur = s.tilaId && Model.tila(s.tilaId);
      const recent = recentRooms(6).filter((t) => !cur || t.id !== cur.id);
      const many = rooms.length > 15;
      el.querySelector("[data-body]").innerHTML =
        '<div class="loc-head"><h3 style="margin:0">' + esc(opts.title || "Sijainti") + '</h3><span class="loc-cur' + (cur ? "" : " missing") + '">' + icon("pin") +
          esc(cur ? Model.tilaNimi(cur) : "Tila valitsematta") + "</span></div>" +
        '<label class="mp-search" style="margin:10px 0 0">' + icon("list") +
          '<input type="search" data-q value="' + esc(query) + '" placeholder="Hae tila: A101, wc, keittiö…" aria-label="Hae tila" autocomplete="off"></label>' +
        '<div data-res></div>' +
        (recent.length ? '<div class="sect"><span class="label">Viimeksi käytetyt</span><div class="chips">' + recent.map(roomChip).join("") + "</div></div>" : "") +
        (k.kerrokset.length > 1 || !k.kerrokset.length ? '<div class="sect"><span class="label">Kerros</span><div class="chips">' +
          k.kerrokset.map((e) => '<button class="chip" data-k="' + e.id + '" aria-pressed="' + (e.id === s.kerrosId) + '">' + esc(e.nimi) + "</button>").join("") +
          '<button class="chip" data-a="addFloor">+ Kerros</button></div></div>' : "") +
        (kerros && kerros.planId
          ? '<div class="sect"><span class="label">' + esc(opts.hint || "Napauta tilaa tai kohtaa pohjapiirroksessa") + '</span><div class="plan-wrap placing" data-plan><img src="' + Model.url(kerros.planId) + '" alt="" draggable="false">' +
              pinsHtml(kerros.id, { dim: true, except: "__none__", sel: s.tilaId, mirExcept: opts.mirExcept }) +
              (s.piste && s.piste.x != null ? '<span class="pin newpin" style="left:' + (s.piste.x * 100) + "%;top:" + (s.piste.y * 100) + '%"></span>' : "") + "</div>" +
              (s.piste ? '<button class="link" data-a="clearPt">Poista kohta</button>' : "") + "</div>"
          : "") +
        (kerros && (!many || showAll || !kerros.planId)
          ? '<div class="sect"><span class="label">Tilat · ' + esc(kerros.nimi) + "</span><div class=\"chips\">" +
            (many && !showAll ? "" : rooms.map(roomChip).join("")) +
            (many && !showAll ? '<button class="chip" data-a="all">Näytä kaikki ' + rooms.length + " tilaa</button>" : "") +
            '<button class="chip" data-a="addRoom">+ Uusi tila</button></div></div>'
          : kerros ? '<button class="link" data-a="all" style="margin-top:6px">Näytä kaikki ' + rooms.length + " tilaa listana</button>" : "") +
        (opts.noPart ? "" : '<div class="sect"><span class="label">Rakenneosa (valinnainen)</span><div class="chips">' +
          M.RAKENNEOSAT.map((r) => '<button class="chip" data-r="' + esc(r) + '" aria-pressed="' + (r === s.rakenneosa) + '">' + esc(r) + "</button>").join("") + "</div></div>") +
        '<div class="row-btns"><button class="btn" data-a="cancel">Peruuta</button><button class="btn btn-primary" data-a="ok">Valmis</button></div>';
      paintResults();
      const qi = el.querySelector("[data-q]");
      qi.addEventListener("input", () => { query = qi.value; paintResults(); });
      zoomApi = kerros && kerros.planId ? Zoom.attach(el.querySelector("[data-plan]"), "loc:" + kerros.id) : null;
      if (zoomApi && focusNext && cur && cur.pos && cur.kerrosId === s.kerrosId) zoomApi.focus(cur.pos.x, cur.pos.y, 3);
      focusNext = false;
    }

    el.addEventListener("click", async (e) => {
      if (e.target.closest(".zctl")) return;
      const plan = e.target.closest("[data-plan]");
      if (plan) {
        const p = relPos(e, plan.querySelector("img"));
        s.piste = { x: p.x, y: p.y };
        // Tilan merkin napautus valitsee tilan; muuten lähin tilamerkki, jos tila on vielä valitsematta
        const rp = e.target.closest("[data-room]");
        if (rp) s.tilaId = rp.dataset.room;
        else {
          const kk = Model.kerros(s.kerrosId), near = k.tilat.filter((t) => t.kerrosId === s.kerrosId && t.pos)
            .map((t) => ({ t, d: Math.hypot(t.pos.x - p.x, (t.pos.y - p.y) * ((kk && kk.h && kk.w) ? kk.h / kk.w : 1)) })).sort((a, b) => a.d - b.d);
          if (near[0] && near[0].d < 0.04 && !s.tilaId) s.tilaId = near[0].t.id;
          else if (!s.tilaId) {
            // Kohta tunnistamattomassa tilassa tai merkintöjen ulkopuolella: kysytään heti, mikä tila on
            paint();
            el.parentNode.style.display = "none";
            const t = await kysyTila(p, s.kerrosId, near.slice(0, 4).map((x) => x.t));
            el.parentNode.style.display = "";
            if (t) s.tilaId = t.id;
          }
        }
        paint(); return;
      }
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.k) {
        if (s.kerrosId !== b.dataset.k) { s.kerrosId = b.dataset.k; s.tilaId = null; s.piste = null; }
      } else if (b.dataset.t) {
        const t = Model.tila(b.dataset.t);
        if (s.tilaId === t.id) { s.tilaId = null; }
        else {
          if (t.kerrosId !== s.kerrosId) { s.kerrosId = t.kerrosId; s.piste = null; }
          s.tilaId = t.id; focusNext = true; query = "";
        }
      } else if (b.dataset.r) {
        s.rakenneosa = s.rakenneosa === b.dataset.r ? null : b.dataset.r;
      } else if (b.dataset.a === "addFloor") {
        el.parentNode.style.display = "none";
        const f = await addFloor();
        el.parentNode.style.display = "";
        if (f) { s.kerrosId = f.id; s.tilaId = null; s.piste = null; }
      } else if (b.dataset.a === "addRoom") {
        el.parentNode.style.display = "none";
        const t = await roomSheet(query.trim() && !searchRooms(query, 1).length ? { id: DB.uid("t_"), tunnus: "", nimi: query.trim().charAt(0).toUpperCase() + query.trim().slice(1), kerrosId: s.kerrosId, pos: null, merkinta: null, __new: true } : null, s.kerrosId);
        el.parentNode.style.display = "";
        if (t) { s.tilaId = t.id; query = ""; }
      } else if (b.dataset.a === "all") { showAll = true; }
      else if (b.dataset.a === "clearPt") { s.piste = null; }
      else if (b.dataset.a === "cancel") { ref.close(); return; }
      else if (b.dataset.a === "ok") { ref.close(); onDone(s); return; }
      paint();
    });
    paint();
  }

  window.Plan = { view, locationSheet, kysyTila, searchRooms, recentRooms, roomActions, pinsHtml, detectRooms, reviewRooms, confirmRoom };
})();
