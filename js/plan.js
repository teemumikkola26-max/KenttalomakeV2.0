/* =========================================================================
   plan.js – Pohjapiirros, kerrokset, tilat ja sijainnin valinta
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, confirmSheet, promptSheet, nro } = UI;
  const { S, Model } = App;

  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const KERROSEHDOTUKSET = ["Kellari", "1. krs", "2. krs", "3. krs", "Ullakko", "Ryömintätila"];

  let currentFloor = null;
  let placingRoom = null; // tilan id, jota sijoitetaan pohjaan

  /* ---------- Pohjakuvan lisäys (kuva tai PDF) ---------- */
  async function pdfToBlob(file) {
    await UI.loadScript(PDFJS);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
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
    const scale = Math.min(4, 2200 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return await new Promise((r) => c.toBlob(r, "image/png"));
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
      let blob;
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) blob = await pdfToBlob(f);
      else blob = f.size > 4e6 ? await Camera.shrink(f) : f;
      const size = await imageSize(blob);
      const old = kerros.planId;
      kerros.planId = await DB.putFile(S.kohde.id, blob, { kind: "pohja", kerrosId: kerros.id });
      kerros.w = size.w; kerros.h = size.h;
      if (old) await DB.del("tiedostot", old);
      await Model.saveKohde();
      toast("Pohjakuva lisätty");
      App.render();
    } catch (e) {
      console.error(e);
      toast("Pohjakuvan lisäys epäonnistui: " + (e.message || e), 5000);
    }
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
    const isNew = !t;
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
            t.tunnus = tunnus; t.nimi = nimi; t.kerrosId = kid;
            if (isNew) S.kohde.tilat.push(t);
            await Model.saveKohde();
            close(t);
          });
        },
        { onClose: (v) => resolve(v || null) });
    });
  }

  function statusChip(st) {
    const d = M.TILASTATUS[st];
    return '<span class="st ' + d.cls + '">' + d.l + "</span>";
  }

  function roomActions(t) {
    const k = S.kohde;
    const st = Model.tilaStatus(t);
    const kerros = Model.kerros(t.kerrosId);
    const obs = S.havainnot.filter((h) => h.sijainti && h.sijainti.tilaId === t.id);
    sheet("<h3>" + esc(Model.tilaNimi(t)) + "</h3><p>" + statusChip(st) +
      (t.merkinta && t.merkinta.syy ? " " + esc(t.merkinta.syy) : "") + (obs.length ? " · " + obs.length + " havaintoa" : "") + "</p>" +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button class="btn btn-primary" data-a="kuva">' + icon("cam") + "Kuva + sanelu tässä tilassa</button>" +
      (!obs.length && !t.merkinta ? '<button class="btn" data-a="ok">Tarkastettu, ei huomautettavaa</button><button class="btn" data-a="eip">Ei pääsyä + syy</button>' : "") +
      (t.merkinta ? '<button class="btn" data-a="clear">Poista merkintä (' + esc(M.TILASTATUS[t.merkinta.tila].l.toLowerCase()) + ")</button>" : "") +
      (kerros && kerros.planId ? '<button class="btn" data-a="place">' + icon("pin") + (t.pos ? "Siirrä merkki pohjapiirroksessa" : "Sijoita pohjapiirrokseen") + "</button>" : "") +
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
        on("del", async () => {
          close();
          if (!(await confirmSheet({ title: "Poistetaanko tila " + Model.tilaNimi(t) + "?", ok: "Poista tila", danger: true }))) return;
          k.tilat = k.tilat.filter((x) => x.id !== t.id);
          k.suunnitelma.forEach((p) => { if (p.tilaId === t.id) p.tilaId = null; });
          await Model.saveKohde(); App.render();
        });
      });
  }

  function obsPopup(h) {
    sheet("<h3>" + nro(h.nro) + " · " + esc(Model.sijaintiTeksti(h.sijainti)) + "</h3>" +
      "<p>" + esc(M.menetelma(h.menetelma).nimi + (h.tulos ? " · " + M.TULOKSET[h.tulos] : "")) + "</p>" +
      (h.sanelu ? '<p style="color:var(--ink)">' + esc(h.sanelu.length > 220 ? h.sanelu.slice(0, 220) + "…" : h.sanelu) + "</p>" : "") +
      '<div class="row-btns"><button class="btn" data-close>Sulje</button><button class="btn btn-primary" data-o>Avaa</button></div>',
      (el, close) => el.querySelector("[data-o]").addEventListener("click", () => { close(); location.hash = "#/k/" + S.kohde.id + "/h/" + h.id; }));
  }

  /* Pohjapiirroksen merkit HTML:nä (prosentteina, skaalautuu kuvan mukana) */
  function pinsHtml(kerrosId, opts) {
    opts = opts || {};
    let out = "";
    if (!opts.noRooms) {
      S.kohde.tilat.filter((t) => t.kerrosId === kerrosId && t.pos).forEach((t) => {
        const st = M.TILASTATUS[Model.tilaStatus(t)];
        out += '<button class="pin room ' + st.cls + '" data-room="' + t.id + '" style="left:' + (t.pos.x * 100) + "%;top:" + (t.pos.y * 100) + '%" aria-label="' + esc(Model.tilaNimi(t) + ", " + st.l) + '">' + esc(t.tunnus || t.nimi) + "</button>";
      });
    }
    S.havainnot.filter((h) => h.sijainti && h.sijainti.piste && h.sijainti.kerrosId === kerrosId && h.id !== opts.except).forEach((h) => {
      const p = h.sijainti.piste;
      out += '<button class="pin ' + App.pinClass(h) + '" data-obs="' + h.id + '" style="left:' + (p.x * 100) + "%;top:" + (p.y * 100) + '%' + (opts.dim ? ";opacity:.45" : "") + '" aria-label="Havainto ' + nro(h.nro) + '">' + h.nro + "</button>";
    });
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
        (rooms.map((t) => '<button class="row" data-a="room" data-id="' + t.id + '"><div class="grow"><div class="t">' + esc(Model.tilaNimi(t)) + "</div>" +
          (t.merkinta && t.merkinta.syy ? '<div class="s">' + esc(t.merkinta.syy) + "</div>" : "") + "</div>" + statusChip(Model.tilaStatus(t)) + "</button>").join("") ||
          '<div class="empty">Ei tiloja. Lisää tilat, niin kattavuus näkyy ja lähtötarkistus muistuttaa tutkimatta jääneistä.</div>') +
        '<div class="card-b" style="padding-top:10px"><button class="btn btn-block" data-a="addRoom">' + icon("plus") + "Lisää tila</button></div></section>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        (kerros.planId ? '<button class="btn btn-sm" data-a="setPlan">' + icon("image") + "Vaihda pohjakuva</button>" : "") +
        '<button class="btn btn-sm" data-a="renameFloor">' + icon("edit") + "Nimeä kerros</button>" +
        '<button class="btn btn-sm btn-danger" data-a="delFloor">' + icon("trash") + "Poista kerros</button></div>";
    }

    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Pohjapiirros", sub: k.nimi, back: "#/k/" + k.id }) +
      '<main class="view"><div class="floor-tabs chips scroll">' + tabs + "</div>" + body + "</main>" +
      App.fab("#/k/" + k.id + "/kuvaus" + (kerros ? "?kerros=" + kerros.id : "")) + App.bottomnav("pohja");

    root.onclick = async (e) => {
      const room = e.target.closest("[data-room]");
      const obs = e.target.closest("[data-obs]");
      const planEl = e.target.closest("[data-plan]");
      if (placingRoom && planEl) {
        const t = Model.tila(placingRoom);
        if (t) { t.pos = relPos(e, planEl.querySelector("img")); await Model.saveKohde(); }
        placingRoom = null; App.render(); return;
      }
      if (room) { roomActions(Model.tila(room.dataset.room)); return; }
      if (obs) { obsPopup(Model.havainto(obs.dataset.obs)); return; }
      const b = e.target.closest("[data-a]");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "floor") { currentFloor = b.dataset.id; placingRoom = null; App.render(); }
      else if (a === "addFloor") { if (await addFloor()) App.render(); }
      else if (a === "setPlan") {
        if (kerros.planId && !(await confirmSheet({ title: "Vaihdetaanko pohjakuva?", text: "Havaintojen ja tilojen merkit säilyvät samoissa suhteellisissa kohdissa. Tarkista ne vaihdon jälkeen.", ok: "Valitse uusi kuva" }))) return;
        setPlan(kerros);
      }
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
  function locationSheet(sij, onDone) {
    const k = S.kohde;
    const s = JSON.parse(JSON.stringify(sij || {}));
    if (!s.kerrosId && k.kerrokset[0]) s.kerrosId = k.kerrokset[0].id;
    let showPlan = false;

    const ref = sheet("<div data-body></div>", null, {});
    const el = ref.el;

    async function paint() {
      const kerros = Model.kerros(s.kerrosId);
      if (kerros && kerros.planId) await Model.ensureUrls([kerros.planId]);
      const rooms = k.tilat.filter((t) => t.kerrosId === s.kerrosId);
      el.querySelector("[data-body]").innerHTML =
        "<h3>Sijainti</h3>" +
        '<div class="sect"><span class="label">Kerros</span><div class="chips">' +
        k.kerrokset.map((e) => '<button class="chip" data-k="' + e.id + '" aria-pressed="' + (e.id === s.kerrosId) + '">' + esc(e.nimi) + "</button>").join("") +
        '<button class="chip" data-a="addFloor">+ Kerros</button></div></div>' +
        (kerros ? '<div class="sect"><span class="label">Tila</span><div class="chips">' +
          rooms.map((t) => '<button class="chip" data-t="' + t.id + '" aria-pressed="' + (t.id === s.tilaId) + '">' + esc(Model.tilaNimi(t)) + "</button>").join("") +
          '<button class="chip" data-a="addRoom">+ Uusi tila</button></div></div>' : "") +
        '<div class="sect"><span class="label">Rakenneosa</span><div class="chips">' +
        M.RAKENNEOSAT.map((r) => '<button class="chip" data-r="' + esc(r) + '" aria-pressed="' + (r === s.rakenneosa) + '">' + esc(r) + "</button>").join("") + "</div></div>" +
        (kerros && kerros.planId
          ? '<div class="sect">' + (showPlan
            ? '<span class="label">Napauta kohtaa pohjapiirroksessa</span><div class="plan-wrap placing" data-plan><img src="' + Model.url(kerros.planId) + '" alt="" draggable="false">' +
              pinsHtml(kerros.id, { dim: true, except: "__none__" }) +
              (s.piste && s.piste.x != null ? '<span class="pin newpin" style="left:' + (s.piste.x * 100) + "%;top:" + (s.piste.y * 100) + '%"></span>' : "") + "</div>" +
              (s.piste ? '<button class="link" data-a="clearPt">Poista merkintä</button>' : "")
            : '<button class="btn btn-block" data-a="showPlan">' + icon("pin") + (s.piste ? "Kohta merkitty pohjapiirrokseen · muuta" : "Merkitse kohta pohjapiirrokseen") + "</button>") + "</div>"
          : "") +
        '<div class="row-btns"><button class="btn" data-a="cancel">Peruuta</button><button class="btn btn-primary" data-a="ok">Valmis</button></div>';
    }

    el.addEventListener("click", async (e) => {
      const plan = e.target.closest("[data-plan]");
      if (plan) {
        const p = relPos(e, plan.querySelector("img"));
        s.piste = { x: p.x, y: p.y };
        paint(); return;
      }
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.k) {
        if (s.kerrosId !== b.dataset.k) { s.kerrosId = b.dataset.k; s.tilaId = null; s.piste = null; }
      } else if (b.dataset.t) {
        s.tilaId = s.tilaId === b.dataset.t ? null : b.dataset.t;
      } else if (b.dataset.r) {
        s.rakenneosa = s.rakenneosa === b.dataset.r ? null : b.dataset.r;
      } else if (b.dataset.a === "addFloor") {
        el.parentNode.style.display = "none";
        const f = await addFloor();
        el.parentNode.style.display = "";
        if (f) { s.kerrosId = f.id; s.tilaId = null; s.piste = null; }
      } else if (b.dataset.a === "addRoom") {
        el.parentNode.style.display = "none";
        const t = await roomSheet(null, s.kerrosId);
        el.parentNode.style.display = "";
        if (t) s.tilaId = t.id;
      } else if (b.dataset.a === "showPlan") { showPlan = true; }
      else if (b.dataset.a === "clearPt") { s.piste = null; }
      else if (b.dataset.a === "cancel") { ref.close(); return; }
      else if (b.dataset.a === "ok") { ref.close(); onDone(s); return; }
      paint();
    });
    paint();
  }

  window.Plan = { view, locationSheet, roomActions, pinsHtml };
})();
