/* =========================================================================
   capture.js – Kuva + sanelu -näkymä

   Tavallinen havainto kirjataan loppuun tästä näkymästä:
     kuva(t) -> sanele (pidä mikrofonia pohjassa) tai kirjoita -> menetelmä
     -> tulos -> Seuraava. Sijainti ja menetelmä säilyvät seuraavaan.
   Havaintokortille (Kortti) mennään, kun menetelmällä on täytettäviä kenttiä.
   Kaikki tallentuu heti: sovelluksen voi sulkea milloin tahansa.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, nro } = UI;
  const { S, Model } = App;

  async function view(havaintoId, q) {
    const k = S.kohde;
    let h = havaintoId ? Model.havainto(havaintoId) : null;
    let saved = !!h;

    function applyMemory(hv) {
      M.menetelma(hv.menetelma).kentat.forEach((f) => {
        const mem = Model.muistiGet(hv.menetelma + "." + f.k);
        if (f.muista && mem && !hv.kentat[f.k]) hv.kentat[f.k] = mem;
      });
    }

    function newObservation(preset) {
      const n = Model.newHavainto(k, preset || {});
      if (preset && preset.tilaId) {
        const t = Model.tila(preset.tilaId);
        if (t) n.sijainti.kerrosId = t.kerrosId;
        n.sijainti.rakenneosa = null;
      }
      if (preset && preset.kerrosId && n.sijainti.tilaId) {
        const t = Model.tila(n.sijainti.tilaId);
        if (!t || t.kerrosId !== preset.kerrosId) { n.sijainti.tilaId = null; n.sijainti.piste = null; }
      }
      // Oletus: aistinvarainen tarkastelu (yleisin havainto). Sanelu tai napautus vaihtaa sen.
      if (!n.menetelma && M.MENETELMAT.some((m) => m.id === "aisti" && !m.piilotettu)) n.menetelma = "aisti";
      if (n.menetelma) applyMemory(n);
      Auto.markCarried(n);          // edellisestä tuotu konteksti saa vaihtua sanelun mukaan
      Auto.autoKohta(n); Auto.autoTunnus(n);
      return n;
    }

    // Uusi havainto alkaa aistinvaraisesta tarkastelusta (ellei avattu tietylle suunnitelman kohdalle).
    // Seuraava-painike sen sijaan jatkaa samalla menetelmällä (esim. RH-pisteiden sarja).
    if (!h) h = newObservation({ menetelma: q.menetelma, suunnitelmaId: q.kohta, tilaId: q.tila, kerrosId: q.kerros });

    document.getElementById("app").innerHTML =
      '<div class="cam">' +
      '<div class="cam-top">' +
      '<button class="cam-round" data-c="close" aria-label="Tallenna ja sulje">' + icon("close") + "</button>" +
      '<button class="loc-chip" data-c="loc">' + icon("pin") + '<span class="txt" data-loc></span><span class="ch">vaihda</span></button>' +
      "</div>" +
      '<div class="viewfinder"><video autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="vf-msg" data-vfmsg>Käynnistetään kameraa…</div>' +
      '<span class="vf-count" data-count></span><div class="vf-thumbs" data-thumbs></div>' +
      '<div class="dict-live hidden" data-live aria-live="polite"><div class="dl-h"><span class="rec"></span><span data-lst>Sanelu</span></div><div class="dl-t" data-prev></div></div>' +
      "</div>" +
      '<div class="cam-panel">' +
      '<div class="cp-row"><span class="cam-lbl" data-mlbl>Menetelmä</span><div class="chips scroll" data-mchips></div></div>' +
      '<div class="cp-row cp-res"><div class="chips" data-tulos>' +
      '<button class="chip c-note" data-t="poikkeama">Poikkeama</button><button class="chip c-ok" data-t="ok">Ei huomautettavaa</button></div>' +
      '<button class="card-link" data-c="card"><span data-cl>Kortti</span>' + icon("back", "flip") + "</button></div>" +
      '<textarea data-text rows="2" aria-label="Havainto" placeholder="Kirjoita havainto tai pidä mikrofonia pohjassa"></textarea>' +
      "</div>" +
      '<div class="cam-bottom">' +
      '<button class="cam-side" data-c="next"><span class="c">' + icon("plus") + "</span>Seuraava</button>" +
      '<button class="shutter" data-c="shot" aria-label="Ota kuva"><span></span></button>' +
      '<button class="cam-side mic" data-mic aria-label="Sanele: pidä pohjassa"><span class="c" data-micic>' + icon("mic") + '</span><span data-miclbl>Pidä: sanele</span></button>' +
      "</div></div>";

    const root = document.querySelector(".cam");
    const video = root.querySelector("video");
    const $ = (s) => root.querySelector(s);
    const ta = $("[data-text]");

    /* ---------- Piirto ---------- */
    function paintLoc() {
      const t = Model.sijaintiTeksti(h.sijainti);
      $("[data-loc]").innerHTML = esc(t || "Valitse sijainti") + (h.auto && h.auto.tila === "sanelu" ? ' <span class="mp-tag">sanelusta</span>' : "");
      $(".loc-chip").classList.toggle("missing", !h.sijainti.tilaId);
    }
    function paintMethods() {
      const list = MethodPicker.ehdotukset(h.menetelma, h.id).slice(0, 4);
      $("[data-mchips]").innerHTML = list.map((x) =>
        '<button class="chip" data-m="' + esc(x.id) + '" aria-pressed="' + (x.id === h.menetelma) + '">' + esc(x.nimi) +
        (x.tag ? ' <span class="mp-tag">' + esc(x.tag) + "</span>" : "") + "</button>").join("") +
        '<button class="chip" data-c="more">' + (list.length ? "Muu…" : "Valitse…") + "</button>";
      $("[data-mlbl]").classList.toggle("missing", !h.menetelma);
      $("[data-mlbl]").textContent = h.menetelma ? "Menetelmä" : "Valitse menetelmä";
      UI.showSelected($("[data-mchips]"));
    }
    function paintTulos() {
      root.querySelectorAll("[data-t]").forEach((b) => {
        const on = b.dataset.t === h.tulos;
        b.setAttribute("aria-pressed", String(on));
        b.innerHTML = (b.dataset.t === "ok" ? "Ei huomautettavaa" : "Poikkeama") + (on && h.auto && h.auto.tulos === "sanelu" ? ' <span class="mp-tag">sanelusta</span>' : "");
      });
    }

    /* Sanelusta tunnistetut tiedot: menetelmä, tila, rakenneosa, tulos */
    async function runAuto() {
      const before = h.menetelma;
      const changes = await Auto.apply(h);
      if (!changes.length) return;
      if (h.menetelma !== before) applyMemory(h);
      paintLoc(); paintMethods(); paintTulos(); paintStatus();
      const shown = changes.filter((c) => ["menetelmä", "tulos", "tila", "rakenneosa"].includes(c.kentta));
      if (shown.length) toast("Sanelusta: " + shown.map((c) => c.arvo).join(", "), 2600);
      if (saved) persist();
    }
    const autoSoon = UI.debounce(runAuto, 900);
    function paintStatus() {
      const n = h.nro ? nro(h.nro) : "Uusi havainto";
      $("[data-count]").textContent = n + (h.kuvat.length ? " · " + h.kuvat.length + (h.kuvat.length === 1 ? " kuva" : " kuvaa") : "");
      // Kortti: montako pakollista tietoa puuttuu (kuva/sanelu ei lasketa, se näkyy tässä)
      const miss = Check.havaintoPuutteet(h).filter((x) => x !== "kuva tai sanelu");
      const fields = M.menetelma(h.menetelma).kentat.length;
      const warn = miss.length > 0 && hasContent();
      $("[data-cl]").innerHTML = "Kortti" + (warn ? ' <span class="cl-n" aria-label="' + miss.length + ' puuttuu">' + miss.length + "</span>" : "");
      $(".card-link").classList.toggle("warn", warn);
      $(".card-link").setAttribute("aria-label", "Avaa havaintokortti" + (warn ? ", puuttuu: " + miss.join(", ") : "") + (fields ? ", " + fields + " kenttää" : ""));
    }
    async function paintThumbs() {
      const last = h.kuvat.slice(-3);
      await Model.ensureUrls(last);
      $("[data-thumbs]").innerHTML = last.map((id) => '<img src="' + Model.url(id) + '" alt="">').join("");
      paintStatus();
    }
    function paintAll() { ta.value = h.sanelu || ""; paintLoc(); paintMethods(); paintTulos(); paintThumbs(); }

    /* ---------- Tallennus ---------- */
    const hasContent = () => h.kuvat.length || (h.sanelu || "").trim() || (h.aanitteet || []).length;
    async function saveNow() {
      if (!hasContent()) return false;
      await Model.saveHavainto(h);
      saved = true;
      return true;
    }
    const persist = UI.debounce(async () => { await saveNow(); paintStatus(); }, 500);
    function rememberContext() {
      S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa, menetelma: h.menetelma || (S.kohde.viimeisin || {}).menetelma };
      return Model.saveKohde();
    }

    /* ---------- Sanelu (pidä pohjassa) ---------- */
    const live = $("[data-live]");
    const dict = new Dictation({
      onCommit: (text) => {
        ta.value = DictButton.appendText(ta.value, text);
        h.sanelu = ta.value;
        persist();
        runAuto();
      },
      onPreview: (t) => { $("[data-prev]").textContent = t || "Puhu nyt…"; },
      onState: (st, msg) => {
        const on = st === "listening" || st === "recording";
        live.classList.toggle("hidden", !on);
        $("[data-lst]").textContent = st === "recording" ? "Äänitetään" : dict.locked ? "Sanelu (napauta mikrofonia lopettaaksesi)" : "Sanelu: vapauta kun valmis";
        if (on) $("[data-prev]").textContent = msg || "Puhu nyt…";
        if (st === "error" && msg) toast(msg, 4000);
        micBtn.paint();
      },
      onAudio: async (blob) => {
        const id = await DB.putFile(k.id, blob, { kind: "aanite", havaintoId: h.id });
        h.aanitteet = (h.aanitteet || []).concat(id);
        await saveNow(); paintStatus();
        toast("Äänite tallennettu havaintoon");
      }
    });
    const micBtn = DictButton.bind($("[data-mic]"), dict, {
      labelEl: $("[data-miclbl]"),
      onChange: (st) => {
        $("[data-micic]").innerHTML = st === "idle" ? icon("mic") : icon("stop");
        $("[data-mic]").classList.toggle("mic-on", st !== "idle");
        if (st !== "idle") $("[data-lst]").textContent = st === "locked" ? "Sanelu lukittu: napauta mikrofonia lopettaaksesi" : "Sanelu: vapauta kun valmis";
      }
    });

    /* ---------- Kuvat ---------- */
    async function addPhoto(blob) {
      const id = await DB.putFile(k.id, blob, { kind: "kuva", havaintoId: h.id });
      h.kuvat.push(id);
      await saveNow();
      paintThumbs();
    }
    // Kuvan käsittely ja tallennus kestää hetken: siirtymät odottavat, ettei kuva jää välistä.
    let pendingShots = Promise.resolve();
    function shoot() {
      pendingShots = pendingShots.then(shootNow).catch(() => {});
      return pendingShots;
    }
    async function shootNow() {
      if (!Camera.stream) {
        const files = await UI.pickFile("image/*", true, "environment");
        for (const f of files) await addPhoto(await Camera.shrink(f));
        return;
      }
      const fl = $(".flash");
      fl.classList.add("on");
      setTimeout(() => fl.classList.remove("on"), 60);
      UI.buzz(12);
      try { await addPhoto(await Camera.capture(video)); }
      catch (e) { toast(e.message || "Kuvan otto epäonnistui"); }
    }

    /* ---------- Siirtymät ---------- */
    async function flush() {
      await pendingShots;
      if (dict.active) { dict.stop(); await new Promise((r) => setTimeout(r, 700)); }   // odotetaan sanelun teksti
      h.sanelu = ta.value;
      persist.flush();
      await saveNow();
      if (saved) await rememberContext();
    }
    async function finish(toCard) {
      await flush();
      if (toCard && saved) location.hash = "#/k/" + k.id + "/h/" + h.id;
      else location.hash = "#/k/" + k.id;
    }
    async function next() {
      await flush();
      if (!saved) { toast("Ota kuva tai kirjoita havainto ensin"); return; }
      const miss = Check.havaintoPuutteet(h).filter((x) => x !== "kuva tai sanelu");
      toast(nro(h.nro) + " tallennettu" + (miss.length ? " · täydennä myöhemmin: " + miss.slice(0, 2).join(", ") + (miss.length > 2 ? "…" : "") : ""), 2600);
      // Uusi havainto samaan paikkaan samalla menetelmällä
      h = newObservation({ menetelma: h.menetelma });
      saved = false;
      paintAll();
      ta.blur();
    }

    function selectMethod(id) {
      if (h.menetelma === id) return;
      h.menetelma = id;
      h.vahvistettu = false;
      applyMemory(h);
      const cur = Model.kohta(h.suunnitelmaId);
      if (cur && cur.menetelma !== id) { h.suunnitelmaId = null; h.auto = Object.assign({}, h.auto, { kohta: true }); }
      Auto.manual(h, "menetelma");
      Auto.autoKohta(h); Auto.autoTunnus(h);
      paintMethods(); paintStatus();
      if (saved) persist();
    }

    ta.addEventListener("input", () => { h.sanelu = ta.value; persist(); autoSoon(); });

    root.addEventListener("click", async (e) => {
      const m = e.target.closest("[data-m]");
      if (m) { selectMethod(m.dataset.m); return; }
      const t = e.target.closest("[data-t]");
      if (t) { h.tulos = h.tulos === t.dataset.t ? null : t.dataset.t; Auto.manual(h, "tulos"); paintTulos(); paintStatus(); if (saved) persist(); return; }
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const c = b.dataset.c;
      if (c === "shot") shoot();
      else if (c === "next") next();
      else if (c === "card") finish(true);
      else if (c === "close") finish(false);
      else if (c === "more") MethodPicker.openSheet({ selected: h.menetelma, excludeHavainto: h.id, onSelect: selectMethod });
      else if (c === "loc") {
        Plan.locationSheet(h.sijainti, async (s) => {
          h.sijainti = s; Auto.manual(h, "tila"); Auto.manual(h, "rakenneosa"); Auto.autoKohta(h); paintLoc(); paintStatus();
          if (saved) await Model.saveHavainto(h);
        });
      }
    });

    paintAll();
    const release = UI.keepAwake();

    try {
      await Camera.start(video);
      $("[data-vfmsg]").classList.add("hidden");
    } catch (e) {
      $("[data-vfmsg]").innerHTML = "<div>Selaimen kameraa ei saatu käyttöön.<br>Laukaisin avaa puhelimen kamerasovelluksen.</div>";
    }

    S.cleanup = () => { release(); dict.stop(); Camera.stop(); h.sanelu = ta.value; persist.flush(); };
  }

  window.Capture = { view };
})();
