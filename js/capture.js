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
    let prevId = null;   // edellinen havainto: pikapainike "← H05" lisäkuvia varten

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
      '<button class="loc-chip" data-c="loc">' + icon("pin") + '<span class="txt"><b data-loc></b><small data-locsub></small></span><span class="ch">vaihda</span></button>' +
      "</div>" +
      '<div class="viewfinder"><video autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="vf-msg" data-vfmsg>Käynnistetään kameraa…</div>' +
      '<div class="vf-left"><button class="vf-count" data-c="switch" aria-label="Vaihda havaintoa: lisää kuvia aiempaan havaintoon"><span data-count></span> ' + icon("back", "down") + "</button>" +
      '<button class="vf-prev hidden" data-c="prev"></button></div><div class="vf-thumbs" data-thumbs></div>' +
      // Kolme vähimmäistietoa: kuva, havainto, tila
      '<div class="vf-req" data-req><span data-rq="kuva">' + icon("cam") + "Kuva</span><span data-rq=\"hav\">" + icon("mic") + "Havainto</span>" +
      '<button data-rq="tila" data-c="loc">' + icon("pin") + "Tila</button></div>" +
      '<div class="dict-live hidden" data-live aria-live="polite"><div class="dl-h"><span class="rec"></span><span data-lst>Sanelu</span></div><div class="dl-t" data-prev></div></div>' +
      "</div>" +
      '<div class="cam-panel">' +
      '<textarea data-text rows="2" aria-label="Havainto" placeholder="Kirjoita havainto tai pidä mikrofonia pohjassa"></textarea>' +
      '<button class="cp-need hidden" data-c="need" data-need></button>' +
      '<div class="cp-meta">' +
      '<button class="meta-chip" data-c="more" aria-label="Vaihda menetelmä"><span data-mname></span>' + icon("back", "down") + "</button>" +
      '<div class="chips" data-tulos><button class="chip c-note" data-t="poikkeama">Poikkeama</button><button class="chip c-ok" data-t="ok">Ei huom.</button></div>' +
      '<button class="card-link" data-c="card"><span data-cl>Lisää</span>' + icon("back", "flip") + "</button></div>" +
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
    const SRC = { sanelu: "sanelusta", kuva: "kuvasta", opittu: "opittu" };
    function paintLoc() {
      const t = h.sijainti.tilaId && Model.tila(h.sijainti.tilaId);
      const ker = Model.kerros(h.sijainti.kerrosId);
      const src = h.auto && h.auto.tila;
      $("[data-loc]").innerHTML = t ? esc(Model.tilaNimi(t)) + (SRC[src] ? ' <span class="mp-tag">' + SRC[src] + "</span>" : src === true ? ' <span class="mp-tag">edellinen</span>' : "") : "Valitse tila";
      $("[data-locsub]").textContent = [S.kohde.kerrokset.length > 1 && ker ? ker.nimi : "", h.sijainti.rakenneosa, h.sijainti.piste ? "kohta merkitty" : ""].filter(Boolean).join(" · ");
      $(".loc-chip").classList.toggle("missing", !t);
      paintReq();
    }
    function paintMethods() {
      const m = h.menetelma ? M.menetelma(h.menetelma) : null;
      const src = h.auto && h.auto.menetelma;
      $("[data-mname]").textContent = m ? (m.lyhyt || m.nimi) : "Menetelmä";
      $(".meta-chip").classList.toggle("missing", !m);
      $(".meta-chip").classList.toggle("autoset", !!SRC[src]);
      $(".meta-chip").title = m ? m.nimi + (SRC[src] ? " (" + SRC[src] + ")" : "") : "";
    }
    function paintTulos() {
      root.querySelectorAll("[data-t]").forEach((b) => {
        const on = b.dataset.t === h.tulos;
        b.setAttribute("aria-pressed", String(on));
        b.textContent = b.dataset.t === "ok" ? "Ei huom." : "Poikkeama";
        b.classList.toggle("autoset", on && !!(h.auto && h.auto.tulos === "sanelu"));
      });
    }
    // Vähimmäistiedot näkyvät kameranäkymässä: vihreä = kunnossa
    function paintReq() {
      const ok = { kuva: h.kuvat.length > 0, hav: !!((h.sanelu || "").trim() || (h.aanitteet || []).length), tila: !!h.sijainti.tilaId };
      root.querySelectorAll("[data-rq]").forEach((x) => { x.classList.toggle("ok", ok[x.dataset.rq]); });
    }

    /* Sanelusta tunnistetut tiedot: menetelmä, tila, rakenneosa, tulos */
    async function runAuto() {
      const before = h.menetelma;
      const changes = await Auto.apply(h);
      if (!changes.length) return;
      if (h.menetelma !== before) applyMemory(h);
      paintLoc(); paintMethods(); paintTulos(); paintStatus();
      const shown = changes.filter((c) => ["menetelmä", "tulos", "tila", "rakenneosa", "kenttä", "taulukko"].includes(c.kentta));
      if (shown.length) toast("Sanelusta: " + shown.slice(0, 3).map((c) => c.arvo).join(", ") + (shown.length > 3 ? " ja " + (shown.length - 3) + " muuta" : ""), 3000);
      if (saved) persist();
    }
    const autoSoon = UI.debounce(runAuto, 900);
    function paintStatus() {
      const n = h.nro ? nro(h.nro) : "Uusi havainto";
      $("[data-count]").textContent = n + (h.kuvat.length ? " · " + h.kuvat.length + (h.kuvat.length === 1 ? " kuva" : " kuvaa") : "");
      const prev = prevId && !hasContent() && Model.havainto(prevId);
      const pb = $("[data-c=prev]");
      pb.classList.toggle("hidden", !prev);
      if (prev) pb.textContent = "← Lisää kuvia: " + nro(prev.nro);
      // Lisätiedot: vain menetelmän omat kentät (kuva, havainto, tila, menetelmä ja tulos näkyvät jo tässä)
      const miss = Check.havaintoPuutteet(h).filter((x) => !["kuva tai sanelu", "tila", "tulos", "menetelmä", "suunnitelman kohta"].includes(x));
      const fields = M.menetelma(h.menetelma).kentat.length;
      const warn = miss.length > 0 && hasContent();
      $("[data-cl]").innerHTML = (fields ? "Mittaukset" : "Lisää") + (warn ? ' <span class="cl-n" aria-label="' + miss.length + ' puuttuu">' + miss.length + "</span>" : "");
      $(".card-link").classList.toggle("warn", warn);
      $(".card-link").setAttribute("aria-label", "Avaa havaintokortti" + (warn ? ", puuttuu: " + miss.join(", ") : "") + (fields ? ", " + fields + " kenttää" : ""));
      // Menetelmän vähimmäistiedot: mitä puuttuu ja mitä sanoa
      const m = M.menetelma(h.menetelma);
      const needF = m.kentat.filter((f) => f.req && (f.t === "table" ? !M.rivit(h, f).length : h.kentat[f.k] == null || String(h.kentat[f.k]).trim() === ""));
      const nb = $("[data-need]");
      nb.classList.toggle("hidden", !(hasContent() && needF.length));
      if (hasContent() && needF.length) { const n = $("[data-cl] .cl-n"); if (n) n.remove(); }   // puute näkyy jo selkeämmin
      if (hasContent() && needF.length) {
        nb.innerHTML = icon("alert") + '<span><b>' + esc(m.lyhyt || m.nimi) + " · puuttuu: " + esc(needF.map((f) => f.l.toLowerCase()).join(", ")) + "</b>" +
          '<small>Sano esim. ”' + esc(window.FieldFill ? FieldFill.hint(needF[0]) : "") + "”</small></span>";
      }
      paintReq();
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
      roomFromPhoto(h, blob);
    }
    /* Tila kuvasta: jos kuvassa on kohteen tilan tunnus (ovikyltti, pohjakuvan numero), tila
       asetetaan siitä. Ei koske tutkijan itse valitsemaa tilaa. Luku tehdään taustalla. */
    let photoRoomQ = Promise.resolve();
    const numbered = () => S.kohde.tilat.filter((t) => /\d/.test(t.tunnus || "")).length >= 2;
    function roomFromPhoto(target, blob) {
      if (!window.PlanRooms || !numbered()) return;
      const canSet = () => !target.sijainti.tilaId || (target.auto && target.auto.tila && target.auto.tila !== "kuva");
      if (!canSet()) return;
      photoRoomQ = photoRoomQ.then(async () => {
        if (!canSet()) return;
        let r = null;
        try { r = await PlanRooms.roomFromPhoto(blob, S.kohde.tilat); } catch (e) { return; }
        if (!r || !canSet() || r.id === target.sijainti.tilaId) return;
        if (target.sijainti.kerrosId !== r.kerrosId || target.sijainti.tilaId) target.sijainti.piste = null;
        target.sijainti.tilaId = r.id; target.sijainti.kerrosId = r.kerrosId;
        target.auto = Object.assign({}, target.auto, { tila: "kuva" });
        Auto.autoKohta(target);
        await Model.saveHavainto(target);
        if (target === h) { paintLoc(); paintStatus(); }
        UI.buzz(15);
        toast("Tila kuvasta: " + Model.tilaNimi(r), 2600);
      }).catch(() => {});
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
      if (saved) {
        await rememberContext();
        await Learn.learn(h);          // havainto valmis: malli oppii sanelun ja menetelmän yhteyden
        await Model.saveHavainto(h);
      }
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
      prevId = h.id;
      h = newObservation({ menetelma: h.menetelma });
      saved = false;
      paintAll();
      ta.blur();
    }

    /* Vaihto toiseen havaintoon kesken kuvauksen (lisäkuvat aiempaan havaintoon) */
    async function switchTo(id) {
      await flush();
      const from = saved ? h.id : null;
      if (id) {
        const target = Model.havainto(id);
        if (!target) return;
        h = target; saved = true;
        prevId = from && from !== id ? from : null;
        toast("Kuvat menevät nyt havaintoon " + nro(h.nro), 2200);
      } else {
        prevId = from;
        h = newObservation({ menetelma: h.menetelma });
        saved = false;
      }
      try { history.replaceState(null, "", "#/k/" + k.id + "/kuvaus" + (saved ? "/" + h.id : "")); } catch (e) { /* ei historiaa */ }
      paintAll();
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
      else if (c === "prev") { if (prevId) switchTo(prevId); }
      else if (c === "switch") {
        await pendingShots;
        ObsList.pick({ title: "Kuvat havaintoon", tilaId: h.sijainti.tilaId, exclude: h.id, allowNew: saved,
          current: h.id, onSelect: (id) => { if (id !== h.id) switchTo(id); } });
      }
      else if (c === "card" || c === "need") finish(true);
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
