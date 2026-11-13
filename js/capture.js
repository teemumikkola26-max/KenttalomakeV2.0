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
    let mode = q.yk ? "yk" : "hav";   // hav = havainto, yk = yleiskuva (ei sanelua eikä havaintoa)

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
      // (Kun menetelmä valitaan itse, se kysytään pikavalinnalla eikä oletusta aseteta.)
      if (preset && preset.eiMenetelmaa && !Auto.paalla("menetelma")) n.menetelma = null;
      if (!n.menetelma && Auto.paalla("menetelma") && M.MENETELMAT.some((m) => m.id === "aisti" && !m.piilotettu)) n.menetelma = "aisti";
      if (n.menetelma) applyMemory(n);
      Auto.markCarried(n);          // edellisestä tuotu konteksti saa vaihtua sanelun mukaan
      if (preset && preset.kaCarry && n.kaOsa) n.auto.kaOsa = true;     // kuntoarvion osa jatkuu, sanelu voi vaihtaa
      Auto.autoKohta(n); Auto.autoTunnus(n);
      return n;
    }

    // Uusi havainto alkaa aistinvaraisesta tarkastelusta (ellei avattu tietylle suunnitelman kohdalle).
    // Seuraava-painike sen sijaan jatkaa samalla menetelmällä (esim. RH-pisteiden sarja).
    if (!h) h = newObservation({ menetelma: q.menetelma, suunnitelmaId: q.kohta, tilaId: q.tila, kerrosId: q.kerros, kaOsa: q.kaosa });

    document.getElementById("app").innerHTML =
      '<div class="cam">' +
      '<div class="cam-top">' +
      '<button class="cam-round" data-c="close" aria-label="Tallenna ja sulje">' + icon("close") + "</button>" +
      '<button class="loc-chip" data-c="loc">' + icon("pin") + '<span class="txt"><b data-loc></b><small data-locsub></small></span><span class="ch">vaihda</span></button>' +
      '<button class="cam-round" data-c="ohje" aria-label="Ohje">?</button>' +
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
      '<div class="cam-mode" role="tablist"><button role="tab" data-mode="hav">Havainto</button><button role="tab" data-mode="yk">Yleiskuva</button></div>' +
      '<p class="yk-info hidden" data-ykinfo>Yleiskuva tallentuu heti kohteen yleiskuviin valitun tilan kanssa. Ei sanelua eikä havaintoa.</p>' +
      '<textarea data-text rows="2" aria-label="Havainto" placeholder="Kirjoita havainto tai pidä mikrofonia pohjassa"></textarea>' +
      '<button class="cp-need hidden" data-c="need" data-need></button>' +
      '<div class="cp-meta">' +
      '<button class="meta-chip" data-c="more" aria-label="Vaihda menetelmä"><span data-mname></span>' + icon("back", "down") + "</button>" +
      '<div class="chips" data-tulos><button class="chip c-note" data-t="poikkeama">Poikkeama</button><button class="chip c-ok" data-t="ok">Ei huom.</button></div>' +
      '<button class="card-link" data-c="card"><span data-cl>Kortti</span>' + icon("back", "flip") + "</button></div>" +
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
      const vapaa = h.menetelma && M.menetelma(h.menetelma).tulosVapaa;   // esim. näyte: tulos tulee laboratoriosta
      $("[data-tulos]").classList.toggle("hidden", !!vapaa);
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
      const shown = changes.filter((c) => ["menetelmä", "tulos", "tila", "rakenneosa", "rakennusosa", "kenttä", "taulukko"].includes(c.kentta));
      if (shown.length) toast("Sanelusta: " + shown.slice(0, 3).map((c) => c.arvo).join(", ") + (shown.length > 3 ? " ja " + (shown.length - 3) + " muuta" : ""), 3000);
      if (saved) persist();
    }
    const autoSoon = UI.debounce(runAuto, 900);
    let autoP = Promise.resolve();
    let alive = true;   // näkymä auki; myöhässä tuleva sanelu tallentuu silti havaintoon
    function paintStatus() {
      if (mode === "yk") { paintReq(); return; }
      const n = h.nro ? nro(h) : "Uusi havainto";
      $("[data-count]").textContent = n + (h.kuvat.length ? " · " + h.kuvat.length + (h.kuvat.length === 1 ? " kuva" : " kuvaa") : "");
      const prev = prevId && !hasContent() && Model.havainto(prevId);
      const pb = $("[data-c=prev]");
      pb.classList.toggle("hidden", !prev);
      if (prev) pb.textContent = "← Lisää kuvia: " + nro(prev);
      // Lisätiedot: vain menetelmän omat kentät (kuva, havainto, tila, menetelmä ja tulos näkyvät jo tässä)
      const miss = Check.havaintoPuutteet(h).filter((x) => !["kuva tai sanelu", "tila", "tulos", "menetelmä", "suunnitelman kohta"].includes(x));
      const fields = M.menetelma(h.menetelma).kentat.length;
      const warn = miss.length > 0 && hasContent();
      $("[data-cl]").innerHTML = "Kortti" + (warn ? ' <span class="cl-n" aria-label="' + miss.length + ' puuttuu">' + miss.length + "</span>" : "");
      $(".card-link").classList.toggle("warn", warn);
      $(".card-link").setAttribute("aria-label", "Avaa havaintokortti" + (warn ? ", puuttuu: " + miss.join(", ") : "") + (fields ? ", " + fields + " kenttää" : ""));
      // Menetelmän vähimmäistiedot: mitä puuttuu ja mitä sanoa
      const m = M.menetelma(h.menetelma);
      const needF = M.kentat(h).filter((f) => f.req && (f.t === "table" ? !M.rivit(h, f).length : h.kentat[f.k] == null || String(h.kentat[f.k]).trim() === ""));
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
      if (mode === "yk") return paintYk();
      const last = h.kuvat.slice(-3);
      await Model.ensureUrls(last);
      $("[data-thumbs]").innerHTML = last.map((id) => '<img src="' + Model.url(id) + '" alt="">').join("");
      paintStatus();
    }
    function paintAll() { ta.value = h.sanelu || ""; paintLoc(); paintMethods(); paintTulos(); paintThumbs(); paintMode(); }
    /* Tila: Havainto / Yleiskuva */
    function paintMode() {
      const yk = mode === "yk";
      root.classList.toggle("mode-yk", yk);
      root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
      $("[data-ykinfo]").classList.toggle("hidden", !yk);
      if (yk) paintYk(); else paintThumbs0();
    }
    async function paintYk() {
      const l = (S.kohde.yleiskuvat || []);
      const last = l.slice(-3).map((y) => y.kuva);
      await Model.ensureUrls(last);
      $("[data-thumbs]").innerHTML = last.map((id) => '<img src="' + Model.url(id) + '" alt="">').join("");
      $("[data-count]").textContent = "Yleiskuvat · " + l.length;
      $("[data-c=prev]").classList.add("hidden");
    }
    function paintThumbs0() { if (mode === "hav") paintThumbs(); }
    async function setMode(m) {
      if (m === mode) return;
      if (m === "yk") { await flush(); if (saved) { prevId = h.id; h = newObservation({ menetelma: h.menetelma, kaOsa: h.kaOsa, kaCarry: true, tilaId: h.sijainti.tilaId, kerrosId: h.sijainti.kerrosId }); saved = false; syncUrl(); } }
      mode = m;
      try { history.replaceState(null, "", "#/k/" + k.id + "/kuvaus" + (saved ? "/" + h.id : "") + (mode === "yk" ? "?yk=1" : "")); } catch (e) { /* ei historiaa */ }
      paintAll();
    }

    /* ---------- Tallennus ---------- */
    const hasContent = () => h.kuvat.length || (h.sanelu || "").trim() || (h.aanitteet || []).length;
    async function saveNow() {
      if (!hasContent()) return false;
      await Model.saveHavainto(h);
      saved = true;
      syncUrl();
      return true;
    }
    // Osoite kertoo kirjattavan havainnon: takaisin havaintokortilta palaa samaan havaintoon.
    // (Ei, kun ikkuna on auki: sen historiamerkintää ei korvata.)
    function syncUrl() {
      if (window.Sync && alive) Sync.kesken = h.id;
      const want = "#/k/" + k.id + "/kuvaus" + (saved ? "/" + h.id : "");
      if (!alive || location.hash === want || (history.state && history.state.ksSheet)) return;
      try { history.replaceState(null, "", want); } catch (e) { /* ei historiaa */ }
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
        autoP = runAuto();
      },
      onPreview: (t) => { $("[data-prev]").textContent = t || "Puhu nyt…"; },
      onState: (st, msg) => {
        const on = st === "listening" || st === "recording";
        live.classList.toggle("hidden", !on);
        $("[data-lst]").textContent = st === "recording" ? "Äänitetään" : dict.locked ? "Sanelu (napauta mikrofonia lopettaaksesi)" : "Sanelu: vapauta kun valmis";
        if (on) $("[data-prev]").textContent = msg || "Puhu nyt…";
        if ((st === "error" || st === "empty") && msg) toast(msg, 4000);
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
    async function addYleiskuva(blob) {
      await Yleiskuvat.lisaa(blob, h.sijainti);
      paintYk();
    }
    function shoot() {
      pendingShots = pendingShots.then(shootNow).catch(() => {});
      return pendingShots;
    }
    async function shootNow() {
      if (!Camera.stream) {
        const files = await UI.pickFile("image/*", true, "environment");
        for (const f of files) await (mode === "yk" ? addYleiskuva : addPhoto)(await Camera.shrink(f));
        return;
      }
      const fl = $(".flash");
      fl.classList.add("on");
      setTimeout(() => fl.classList.remove("on"), 60);
      UI.buzz(12);
      try { await (mode === "yk" ? addYleiskuva : addPhoto)(await Camera.capture(video)); }
      catch (e) { toast(e.message || "Kuvan otto epäonnistui"); }
    }

    /* ---------- Siirtymät ---------- */
    async function flush() {
      await pendingShots;
      // Odotetaan sanelun teksti (tunnistus antaa sen pienellä viiveellä lopetuksen jälkeen)
      if (dict.active) dict.stop();
      for (let i = 0; i < 40 && dict.rec; i++) await new Promise((r) => setTimeout(r, 50));
      h.sanelu = ta.value;
      // Tunnistus valmiiksi ennen siirtymää: kirjoitettu tai juuri saneltu teksti täyttää kentät aina
      autoSoon.cancel();
      try { await autoP; await runAuto(); } catch (e) { console.warn(e); }
      persist.cancel();
      await saveNow();
      if (saved) {
        await rememberContext();
        await Learn.learn(h);          // havainto valmis: malli oppii sanelun ja menetelmän yhteyden
        await Model.saveHavainto(h);
      }
    }
    async function finish(toCard) {
      await flush();
      // Kortti avautuu myös tyhjälle havainnolle: tiedot voi täyttää kortilla
      if (toCard && !saved) { await Model.saveHavainto(h); saved = true; await rememberContext(); }
      if (toCard && saved) location.hash = "#/k/" + k.id + "/h/" + h.id;
      else location.hash = "#/k/" + k.id;
    }
    async function next() {
      await flush();
      if (!saved) { toast("Ota kuva tai kirjoita havainto ensin"); return; }
      const miss = Check.havaintoPuutteet(h).filter((x) => x !== "kuva tai sanelu");
      toast(nro(h) + " tallennettu" + (miss.length ? " · täydennä myöhemmin: " + miss.slice(0, 2).join(", ") + (miss.length > 2 ? "…" : "") : ""), 2600);
      // Uusi havainto samaan paikkaan samalla menetelmällä
      prevId = h.id;
      h = newObservation(Asetukset.get("pv.sama") ? { menetelma: h.menetelma, kaOsa: h.kaOsa, kaCarry: true } : { kaOsa: h.kaOsa, kaCarry: true, eiMenetelmaa: true });
      saved = false;
      syncUrl();
      paintAll();
      ta.blur();
      if (Asetukset.get("pv.milloin") === "aina") pikavalinta(false);
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
        toast("Kuvat menevät nyt havaintoon " + nro(h), 2200);
      } else {
        prevId = from;
        h = newObservation({ menetelma: h.menetelma, kaOsa: h.kaOsa, kaCarry: true });
        saved = false;
      }
      try { history.replaceState(null, "", "#/k/" + k.id + "/kuvaus" + (saved ? "/" + h.id : "")); } catch (e) { /* ei historiaa */ }
      paintAll();
    }

    function selectMethod(id, vahvista) {
      if (h.menetelma === id) { if (vahvista) { Auto.manual(h, "menetelma"); if (S.kohde) S.kohde.viimeisin = Object.assign({}, S.kohde.viimeisin || {}, { menetelma: id }); } return; }
      if (vahvista && S.kohde) S.kohde.viimeisin = Object.assign({}, S.kohde.viimeisin || {}, { menetelma: id });
      h.menetelma = id;
      h.vahvistettu = false;
      applyMemory(h);
      const cur = Model.kohta(h.suunnitelmaId);
      if (cur && cur.menetelma !== id) { h.suunnitelmaId = null; h.auto = Object.assign({}, h.auto, { kohta: true }); }
      Auto.manual(h, "menetelma");
      Auto.autoKohta(h); Auto.autoTunnus(h);
      if (window.FieldFill) FieldFill.apply(h);
      paintMethods(); paintTulos(); paintStatus();
      if (saved) persist();
    }

    ta.addEventListener("input", () => { h.sanelu = ta.value; persist(); autoSoon(); });

    root.addEventListener("click", async (e) => {
      const md = e.target.closest("[data-mode]");
      if (md) { setMode(md.dataset.mode); return; }
      const m = e.target.closest("[data-m]");
      if (m) { selectMethod(m.dataset.m); return; }
      const t = e.target.closest("[data-t]");
      if (t) { h.tulos = h.tulos === t.dataset.t ? null : t.dataset.t; Auto.manual(h, "tulos"); paintTulos(); paintStatus(); if (saved) persist(); return; }
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const c = b.dataset.c;
      if (mode === "yk" && (c === "next" || c === "card" || c === "need" || c === "switch" || c === "prev" || c === "more")) return;
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
      else if (c === "ohje") naytaOhje(true);
      else if (c === "more") MethodPicker.openSheet({ selected: h.menetelma, excludeHavainto: h.id, onSelect: selectMethod });
      else if (c === "loc") {
        Plan.locationSheet(h.sijainti, async (s) => {
          h.sijainti = s; Auto.manual(h, "tila"); Auto.manual(h, "rakenneosa"); Auto.autoKohta(h);
          if (window.FieldFill) FieldFill.apply(h);          // esim. märkätilan tyyppi ja asunto tilasta
          paintLoc(); paintStatus();
          if (saved) await Model.saveHavainto(h);
        });
      }
    });

    paintAll();
    const release = Asetukset.get("kamera.valve") ? UI.keepAwake() : () => {};
    naytaOhje();
    // Uusi havainto: pikavalinta, jos menetelmä (tai tila) valitaan itse. Ei, kun jatketaan
    // olemassa olevaa havaintoa tai kuvaus avattiin tietylle suunnitelman kohdalle.
    if (mode === "hav" && !saved && !q.menetelma && !q.kohta && !q.kaosa && Asetukset.get("pv.milloin") !== "ei") pikavalinta(true);

    /* Pikavalinta: tila (jos valitaan itse) ja menetelmä yhdellä näytöllä. Menetelmän napautus sulkee.
       Molemmissa on hakukenttä: kirjoitus rajaa listaa, ja jos osumaa ei ole, sama kenttä lisää uuden. */
    function pikavalinta(alku) {
      const pvT = Asetukset.get("pv.tila");
      const kysyM = !Auto.paalla("menetelma"), kysyT = !Auto.paalla("tila") && pvT !== "ei" && (pvT === "aina" || !h.sijainti.tilaId);
      if (!kysyM && !kysyT) return;
      const vanha = root.querySelector(".qp"); if (vanha) vanha.remove();
      const g = document.createElement("div");
      g.className = "qp";
      const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
      // Edellinen tila = viimeksi tallennetun havainnon tila
      const edell = (S.havainnot || []).slice().sort((a, b) => b.updated - a.updated).map((x) => x.sijainti && x.sijainti.tilaId).find(Boolean) || null;
      const viimeisetTilat = () => {
        const ids = [];
        if (edell) ids.push(edell);
        if (h.sijainti.tilaId && !ids.includes(h.sijainti.tilaId)) ids.push(h.sijainti.tilaId);
        (S.havainnot || []).slice().sort((a, b) => b.updated - a.updated).forEach((x) => { const t = x.sijainti && x.sijainti.tilaId; if (t && !ids.includes(t)) ids.push(t); });
        return ids.slice(0, 6).map((id) => Model.tila(id)).filter(Boolean);
      };
      g.innerHTML = '<div class="qp-box">' +
        (kysyT ? '<div class="qp-h">Tila</div>' +
          '<div class="qp-find"><input type="search" data-qts placeholder="Hae tai lisää tila, esim. VH2 tai Varasto" autocomplete="off" enterkeyhint="done"></div>' +
          '<div class="qp-chips" data-qtl></div>' : "") +
        (kysyM ? '<div class="qp-h">' + (alku ? "Mitä kirjaat?" : "Seuraavan havainnon menetelmä") + "</div>" +
          '<div class="qp-find"><input type="search" data-qms placeholder="Hae tai lisää menetelmä" autocomplete="off" enterkeyhint="done"></div>' +
          '<div data-qml></div>' : '<button class="btn btn-primary" data-qok style="width:100%;margin-top:12px">Valmis</button>') +
        '<button class="qp-skip" data-qskip>' + (kysyM ? "Valitse myöhemmin" : "Ohita") + "</button></div>";
      const tIn = g.querySelector("[data-qts]"), mIn = g.querySelector("[data-qms]");

      function paintT() {
        if (!kysyT) return;
        const q = norm(tIn.value);
        let l, lisaa = "";
        if (q) {
          const kaikki = S.kohde.tilat.filter((t) => norm(Model.tilaNimi(t)).includes(q) || norm(t.tunnus) === q);
          // Nykyisen kerroksen tilat ensin
          l = kaikki.sort((a, b) => (a.kerrosId === h.sijainti.kerrosId ? 0 : 1) - (b.kerrosId === h.sijainti.kerrosId ? 0 : 1)).slice(0, 8);
          if (!kaikki.some((t) => norm(Model.tilaNimi(t)) === q || norm(t.tunnus) === q)) lisaa = '<button class="qp-chip qp-add" data-qtnew>+ Lisää tila ”' + esc(tIn.value.trim()) + "”</button>";
        } else l = viimeisetTilat();
        g.querySelector("[data-qtl]").innerHTML =
          l.map((t) => '<button class="qp-chip" data-qt="' + t.id + '" aria-pressed="' + (t.id === h.sijainti.tilaId) + '">' + esc(Model.tilaNimi(t)) +
            (!q && t.id === edell ? " <small>edellinen</small>" : "") + "</button>").join("") + lisaa +
          (q ? "" : '<button class="qp-chip qp-more" data-qt="__muu">Pohjakuvasta…</button>') +
          (q && !l.length && !lisaa ? '<span class="qp-none">Ei osumia</span>' : "");
      }
      function paintM() {
        if (!kysyM) return;
        const q = norm(mIn.value);
        const all = M.havaintoMenetelmat();
        let html;
        if (q) {
          const hits = all.filter((m) => norm(m.nimi).includes(q) || norm(m.lyhyt).includes(q) || (m.sanat || []).some((w) => norm(w).includes(q)));
          const exact = all.some((m) => norm(m.nimi) === q);
          html = '<div class="qp-grid qp-small">' + hits.map((m) => '<button class="qp-m" data-qm="' + esc(m.id) + '">' + esc(m.nimi) + "</button>").join("") +
            (exact ? "" : '<button class="qp-m qp-more" data-qmnew>+ Lisää menetelmä ”' + esc(mIn.value.trim()) + "”</button>") + "</div>";
        } else {
          const sugg = Asetukset.get("pv.suunnitelma") ? MethodPicker.ehdotukset(h.menetelma, h.id) : [];
          const muut = all.filter((m) => !sugg.some((x) => x.id === m.id));
          html = (sugg.length ? '<div class="qp-grid">' +
            sugg.map((x, i) => '<button class="qp-m' + (i === 0 && x.id === h.menetelma ? " qp-first" : "") + '" data-qm="' + esc(x.id) + '">' + esc(x.nimi) +
              (x.id === h.menetelma && !alku ? "<small>sama kuin edellä</small>" : x.tag ? "<small>" + esc(x.tag) + "</small>" : "") + "</button>").join("") + "</div>" : "") +
            (muut.length && sugg.length ? '<div class="qp-h">Muut menetelmät</div>' : "") +
            '<div class="qp-grid qp-small">' + muut.map((m) => '<button class="qp-m" data-qm="' + esc(m.id) + '">' + esc(m.nimi) + "</button>").join("") +
            '<button class="qp-m qp-yk" data-qyk>' + icon("image") + "Yleiskuva<small>ei havaintoa</small></button></div>";
        }
        g.querySelector("[data-qml]").innerHTML = html;
      }
      paintT(); paintM();
      root.appendChild(g);
      const sulje = () => { g.remove(); paintAll(); };
      function asetaTila(t) {
        h.sijainti.tilaId = t.id; h.sijainti.kerrosId = t.kerrosId; h.sijainti.piste = null;
        Auto.manual(h, "tila"); Auto.autoKohta(h); if (window.FieldFill) FieldFill.apply(h);
        paintLoc(); paintStatus();
        if (tIn) { tIn.value = ""; tIn.blur(); }
        if (!kysyM) { sulje(); return; }
        paintT();
      }
      async function uusiTila() {
        const t = await Plan.luoTila(tIn.value, h.sijainti.kerrosId, null);
        if (t) { toast("Tila lisätty: " + Model.tilaNimi(t)); asetaTila(t); }
      }
      async function uusiMenetelma() {
        const m = await MethodPicker.luo(mIn.value);
        if (m) { toast("Menetelmä lisätty. Kenttiä voi lisätä Menetelmät-sivulla.", 3000); selectMethod(m.id, true); sulje(); }
      }
      if (tIn) {
        tIn.addEventListener("input", paintT);
        tIn.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const eka = g.querySelector("[data-qtl] [data-qt]:not([data-qt='__muu'])");
          if (norm(tIn.value) && eka) asetaTila(Model.tila(eka.dataset.qt)); else if (norm(tIn.value)) uusiTila();
        });
      }
      if (mIn) {
        mIn.addEventListener("input", paintM);
        mIn.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const eka = g.querySelector("[data-qml] [data-qm]");
          if (norm(mIn.value) && eka) { selectMethod(eka.dataset.qm, true); sulje(); } else if (norm(mIn.value)) uusiMenetelma();
        });
      }
      g.addEventListener("click", (e) => {
        if (e.target.closest("[data-qtnew]")) { uusiTila(); return; }
        if (e.target.closest("[data-qmnew]")) { uusiMenetelma(); return; }
        if (e.target.closest("[data-qyk]")) { g.remove(); setMode("yk"); return; }
        const tb = e.target.closest("[data-qt]");
        if (tb) {
          if (tb.dataset.qt === "__muu") {
            Plan.locationSheet(h.sijainti, (sij) => { h.sijainti = sij; Auto.manual(h, "tila"); Auto.autoKohta(h); paintLoc(); paintStatus(); paintT(); if (!kysyM && h.sijainti.tilaId) sulje(); });
            return;
          }
          const t = Model.tila(tb.dataset.qt);
          if (t) asetaTila(t);
          return;
        }
        const mb = e.target.closest("[data-qm]");
        if (mb) { selectMethod(mb.dataset.qm, true); sulje(); return; }
        if (e.target.closest("[data-qskip],[data-qok]")) sulje();
      });
    }

    /* Ensikäytön ohje: näytetään kerran, ohjeen saa uudelleen ?-painikkeesta */
    function naytaOhje(force) {
      let nahty = false;
      try { nahty = localStorage.getItem("ks.ohje.kuvaus") === "1"; } catch (e) { /* ohita */ }
      if (nahty && !force) return;
      const g = document.createElement("div");
      g.className = "cam-guide";
      g.innerHTML = '<div class="cg-box"><h3>Näin kirjaat havainnon</h3><ol>' +
        "<li><b>Valitse menetelmä ja tila</b> pikavalinnasta. Tilan voi vaihtaa yläreunasta.</li>" +
        "<li><b>Ota kuva</b> laukaisimesta. Kuvia voi ottaa useita.</li>" +
        "<li><b>Pidä mikrofonia pohjassa</b> ja kerro havainto. Vapauta, kun olet valmis.</li>" +
        "<li><b>Seuraava</b> tallentaa ja aloittaa uuden havainnon samassa tilassa.</li>" +
        "<li><b>Kortti</b> avaa kaikki tiedot ja mittauskentät. Sen voi avata myös ilman kuvaa.</li>" +
        "<li><b>Yleiskuva</b>-välilehdellä otat kuvia ilman havaintoa (julkisivut, tilat).</li></ol>" +
        '<p class="hint" style="color:#ddd;margin:0 0 14px">Kaikki tallentuu heti. Sen, mitä sanelusta täytetään, voi valita Sanasto-sivulla.</p>' +
        '<button class="btn btn-primary" data-ok>Selvä</button></div>';
      root.appendChild(g);
      g.querySelector("[data-ok]").addEventListener("click", () => { try { localStorage.setItem("ks.ohje.kuvaus", "1"); } catch (e) { /* ohita */ } g.remove(); });
    }

    try {
      await Camera.start(video);
      $("[data-vfmsg]").classList.add("hidden");
    } catch (e) {
      $("[data-vfmsg]").innerHTML = "<div>Selaimen kameraa ei saatu käyttöön.<br>Laukaisin avaa puhelimen kamerasovelluksen.</div>";
    }

    S.cleanup = () => { alive = false; if (window.Sync) Sync.kesken = null; release(); dict.stop(); Camera.stop(); h.sanelu = ta.value; persist.flush(); };
  }

  window.Capture = { view };
})();
