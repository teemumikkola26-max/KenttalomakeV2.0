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

    function applyMemory(hv) { M.taytaMuisti(hv, Model); M.laske(hv); }

    const periytyva = new WeakMap();   // havainto -> edellisen havainnon tila ja menetelmä
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
      // Tila ei siirry uudelle menetelmälle: edellisen havainnon tila säilyy vain, kun menetelmä on sama
      // (esim. RH-pisteiden sarja Seuraava-painikkeella). Jos menetelmä valitaan vasta pikavalinnassa,
      // tila palautetaan, kun valitaan sama menetelmä kuin edellä.
      if (n.sijainti.tilaId && !(preset && preset.tilaId)) {
        const edM = (k.viimeisin || {}).menetelma || null;
        const peri = { tilaId: n.sijainti.tilaId, rakenneosa: n.sijainti.rakenneosa, menetelma: edM };
        if (!n.menetelma || n.menetelma !== edM) { n.sijainti.tilaId = null; n.sijainti.rakenneosa = null; n.sijainti.piste = null; }
        if (edM) periytyva.set(n, peri);
      }
      Auto.markCarried(n);          // edellisestä tuotu konteksti saa vaihtua sanelun mukaan
      if (preset && preset.kaCarry && n.kaOsa) n.auto.kaOsa = true;     // kuntoarvion osa jatkuu, sanelu voi vaihtaa
      if (preset && preset.kaCarry && n.akkOsa) n.auto.akkOsa = true;   // kuntotarkastuksen osio samoin
      Auto.autoKohta(n); Auto.autoTunnus(n);
      return n;
    }

    // Uusi havainto alkaa aistinvaraisesta tarkastelusta (ellei avattu tietylle suunnitelman kohdalle).
    // Seuraava-painike sen sijaan jatkaa samalla menetelmällä (esim. RH-pisteiden sarja).
    if (!h) {
      h = newObservation({ menetelma: q.menetelma, suunnitelmaId: q.kohta, tilaId: q.tila, kerrosId: q.kerros, kaOsa: q.kaosa, akkOsa: q.akkosa });
      if (q.avaus && h.menetelma === "nayte") h.kentat.avaus = q.avaus;      // näyte rakenneavauksesta
      // Alimenetelmä: koko sijainti (myös pohjakuvan piste ja rakenneosa) toiselta havainnolta
      const emo = q.emo && Model.havainto(q.emo);
      if (emo) { h.emo = emo.id; h.sijainti = JSON.parse(JSON.stringify(emo.sijainti)); if (!h.suunnitelmaId && emo.kaOsa) h.kaOsa = emo.kaOsa; }
    }
    if (!saved) ehdotaTila();

    document.getElementById("app").innerHTML =
      '<div class="cam">' +
      '<div class="cam-top">' +
      '<button class="cam-round" data-c="close" aria-label="Tallenna ja sulje">' + icon("close") + "</button>" +
      '<button class="loc-chip" data-c="loc">' + icon("pin") + '<span class="txt"><b data-loc></b><small data-locsub></small></span><span class="ch">Vaihda</span></button>' +
      '<button class="cam-round" data-c="ohje" aria-label="Ohje">?</button>' +
      "</div>" +
      '<div class="viewfinder"><video autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="vf-msg" data-vfmsg>Käynnistetään kameraa…</div>' +
      '<div class="vf-left"><div class="vf-count"><span data-count></span></div>' +
      '<button class="vf-prev hidden" data-c="prev"></button></div><div class="vf-thumbs" data-thumbs></div>' +
      // Menetelmä yhtenä merkkinä kuvan päällä: napautus avaa pikavalinnan
      '<button class="vf-method meta-chip" data-c="more" aria-label="Vaihda menetelmä"><span data-mname></span>' + icon("back", "down") + "</button>" +
      '<div class="dict-live hidden" data-live aria-live="polite"><div class="dl-h"><span class="rec"></span><span data-lst>Sanelu</span></div><div class="dl-t" data-prev></div></div>' +
      "</div>" +
      '<div class="cam-panel">' +
      '<div class="cam-mode" role="tablist"><button role="tab" data-mode="hav">' + icon("cam") + 'Havainto</button><button role="tab" data-mode="yk">' + icon("image") + "Yleiskuva</button></div>" +
      '<p class="yk-info hidden" data-ykinfo>Yleiskuva tallentuu heti kohteen yleiskuviin valitun tilan kanssa. Ei sanelua eikä havaintoa.</p>' +
      '<textarea data-text rows="2" aria-label="Havainto" placeholder="Kirjoita havainto tai pidä mikrofonia pohjassa"></textarea>' +
      '<button class="cp-need hidden" data-c="need" data-need></button>' +
      '<div class="cp-meta">' +
      '<button class="card-link" data-c="card"><span data-cl>Täydennä tiedot</span>' + icon("back", "flip") + "</button></div>" +
      "</div>" +
      '<div class="cam-bottom">' +
      '<button class="cam-side" data-c="next"><span class="c">' + icon("plus") + "</span>Seuraava havainto</button>" +
      '<button class="shutter" data-c="shot" aria-label="Ota kuva"><span></span></button>' +
      '<button class="cam-side mic" data-mic aria-label="Sanele: pidä pohjassa"><span class="c" data-micic>' + icon("mic") + '</span><span data-miclbl>Pidä: sanele</span></button>' +
      "</div></div>";

    const root = document.querySelector(".cam");
    const video = root.querySelector("video");
    const $ = (s) => root.querySelector(s);
    const ta = $("[data-text]");

    /* ---------- Piirto ---------- */
    const SRC = { sanelu: "sanelusta", kuva: "kuvasta", opittu: "opittu", seuranta: "ehdotus" };
    /* Tilaseurannan todennäköisin tila valmiiksi, kun tilaa ei ole valittu. Merkitään ehdotukseksi
       (auto.tila = "seuranta"): se päivittyy liikkuessa, kunnes tutkija valitsee tilan tai ottaa kuvan.
       Ehdotus ei kiinnitä seurantaa; vain tutkijan oma valinta kiinnittää. */
    function ehdotaTila() {
      if (!window.Paikannus) return false;
      const a = h.auto && h.auto.tila;
      if (h.sijainti.tilaId && a !== "seuranta") return false;
      if (a === "seuranta" && mode === "hav" && h.kuvat.length) return false;
      const e = Paikannus.ehdotukset(1)[0];
      if (!e || e.tila.id === h.sijainti.tilaId) return false;
      h.sijainti.tilaId = e.tila.id; h.sijainti.kerrosId = e.tila.kerrosId; h.sijainti.piste = null;
      h.auto = h.auto || {}; h.auto.tila = "seuranta";
      Auto.autoKohta(h);
      return true;
    }
    /* Kuva otettiin ehdotetussa tilassa eikä tilaa vaihdettu: ehdotus hyväksytty, seuranta kiinnittyy siihen.
       Merkintä "hyvaksytty": ehdotus-merkki poistuu, mutta sanelussa sanottu tila voi vielä korjata sen. */
    function hyvaksyEhdotus() {
      if (!(h.auto && h.auto.tila === "seuranta" && h.sijainti.tilaId)) return;
      if (window.Paikannus) Paikannus.kiinnita(h.sijainti.tilaId);
      h.auto.tila = "hyvaksytty"; h.kiinnitetty = h.sijainti.tilaId;
      paintLoc();
    }
    function paintLoc() {
      const t = h.sijainti.tilaId && Model.tila(h.sijainti.tilaId);
      const ker = Model.kerros(h.sijainti.kerrosId);
      const src = h.auto && h.auto.tila;
      $("[data-loc]").innerHTML = t ? esc(Model.tilaNimi(t)) + (SRC[src] ? ' <span class="mp-tag">' + SRC[src] + "</span>" : src === true ? ' <span class="mp-tag">edellinen</span>' : "") : "Valitse tila";
      $("[data-locsub]").textContent = [S.kohde.kerrokset.length > 1 && ker ? ker.nimi : "", h.sijainti.rakenneosa, h.sijainti.piste ? "kohta merkitty" : ""].filter(Boolean).join(" · ");
      $(".loc-chip").classList.toggle("missing", !t);
      paintEhd();
      paintReq();
    }
    function paintEhd() { /* v46: seurannan ehdotus näkyy vain yläreunan tilapainikkeessa */ }
    function paintMethods() {
      const m = h.menetelma ? M.menetelma(h.menetelma) : null;
      const src = h.auto && h.auto.menetelma;
      // Suunnitelman eteneminen merkissä, esim. "RH · 3/6"
      const p = m && (h.suunnitelmaId ? Model.kohta(h.suunnitelmaId) : S.kohde.suunnitelma.find((x) => x.menetelma === h.menetelma && !x.pois));
      const nayteAvauksessa = p && p.menetelma === "avaus" && h.menetelma === "nayte";
      $("[data-mname]").textContent = m ? m.nimi + (nayteAvauksessa ? " · " + Model.kohtaNaytteet(p) + "/" + p.naytteet : p && p.maara > 1 ? " · " + Model.kohtaTehty(p) + "/" + p.maara : "") : "Valitse menetelmä";
      $(".meta-chip").classList.toggle("missing", !m);
      $(".meta-chip").classList.toggle("autoset", !!SRC[src]);
      $(".meta-chip").title = m ? m.nimi + (SRC[src] ? " (" + SRC[src] + ")" : "") : "";
    }
    function paintTulos() { /* tulos valitaan havaintokortissa tai sanelusta (v46: ei painikkeita kamerassa) */ }
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
      // Havainnon numero ja kuvamäärä vasta, kun havainnossa on jotain (ei "Uusi havainto" -valikkoa tyhjänä)
      const n = h.nro ? nro(h) : "";
      $("[data-count]").textContent = [n, h.kuvat.length ? h.kuvat.length + (h.kuvat.length === 1 ? " kuva" : " kuvaa") : ""].filter(Boolean).join(" · ");
      $(".vf-count").classList.toggle("hidden", !$("[data-count]").textContent);
      const prev = prevId && !hasContent() && Model.havainto(prevId);
      const pb = $("[data-c=prev]");
      pb.classList.toggle("hidden", !prev);
      if (prev) pb.textContent = "← Lisää kuvia: " + nro(prev);
      // Lisätiedot: vain menetelmän omat kentät (kuva, havainto, tila, menetelmä ja tulos näkyvät jo tässä)
      const miss = Check.havaintoPuutteet(h).filter((x) => !["kuva tai sanelu", "tila", "tulos", "menetelmä", "suunnitelman kohta"].includes(x));
      const fields = M.menetelma(h.menetelma).kentat.length;
      const warn = miss.length > 0 && hasContent();
      $("[data-cl]").innerHTML = "Täydennä tiedot" + (warn ? ' <span class="cl-n" aria-label="' + miss.length + ' puuttuu">' + miss.length + "</span>" : "");
      $(".card-link").classList.toggle("warn", warn);
      $(".card-link").setAttribute("aria-label", "Avaa havaintokortti" + (warn ? ", puuttuu: " + miss.join(", ") : "") + (fields ? ", " + fields + " kenttää" : ""));
      // Menetelmän vähimmäistiedot: mitä puuttuu ja mitä sanoa
      const m = M.menetelma(h.menetelma);
      const needF = M.kentat(h).filter((f) => f.req && (f.t === "table" ? !M.rivit(h, f).length : h.kentat[f.k] == null || String(h.kentat[f.k]).trim() === ""));
      const nb = $("[data-need]");
      nb.classList.toggle("hidden", !(hasContent() && needF.length));
      if (hasContent() && needF.length) { const n = $("[data-cl] .cl-n"); if (n) n.remove(); }   // puute näkyy jo selkeämmin
      if (hasContent() && needF.length) {
        nb.innerHTML = icon("alert") + '<span><b>' + esc(m.nimi) + " · puuttuu: " + esc(needF.map((f) => f.l.toLowerCase()).join(", ")) + "</b>" +
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
      if (m === "yk") { await flush(); if (saved) { prevId = h.id; h = newObservation({ menetelma: h.menetelma, kaOsa: h.kaOsa, akkOsa: h.akkOsa, kaCarry: true, tilaId: h.sijainti.tilaId, kerrosId: h.sijainti.kerrosId }); saved = false; syncUrl(); } }
      mode = m;
      ehdotaTila();
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
      hyvaksyEhdotus();
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
      // Yleiskuvissa tila seuraa edelleen liikkumista: ehdotus kiinnittää seurannan, mutta jää ehdotukseksi
      if (window.Paikannus && h.auto && h.auto.tila === "seuranta" && h.sijainti.tilaId) Paikannus.kiinnita(h.sijainti.tilaId);
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
      h = newObservation(Asetukset.get("pv.sama") ? { menetelma: h.menetelma, kaOsa: h.kaOsa, akkOsa: h.akkOsa, kaCarry: true } : { kaOsa: h.kaOsa, akkOsa: h.akkOsa, kaCarry: true, eiMenetelmaa: true });
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
        h = newObservation({ menetelma: h.menetelma, kaOsa: h.kaOsa, akkOsa: h.akkOsa, kaCarry: true });
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
      const peri = periytyva.get(h);
      if (peri) {
        if (id === peri.menetelma && !h.sijainti.tilaId) {            // sama menetelmä kuin edellä: tila jatkuu
          h.sijainti.tilaId = peri.tilaId; h.sijainti.rakenneosa = peri.rakenneosa;
          h.auto = Object.assign({}, h.auto, { tila: true }); if (peri.rakenneosa) h.auto.rakenneosa = true;
        } else if (id !== peri.menetelma && h.sijainti.tilaId === peri.tilaId && h.auto && h.auto.tila === true) {   // vaihtui: periytynyt tila pois
          h.sijainti.tilaId = null; h.sijainti.rakenneosa = null; h.sijainti.piste = null;
          delete h.auto.tila; delete h.auto.rakenneosa;
        }
        if (typeof paintLoc === "function") paintLoc();
      }
      applyMemory(h);
      const cur = Model.kohta(h.suunnitelmaId);
      if (cur && !Model.kohtaSopii(cur, id)) { h.suunnitelmaId = null; h.auto = Object.assign({}, h.auto, { kohta: true }); }
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
      const eh = e.target.closest("[data-ehdt]");
      if (eh) {
        const t = Model.tila(eh.dataset.ehdt); if (!t) return;
        Paikannus.kiinnita(t.id);
        h.sijainti.tilaId = t.id; h.sijainti.kerrosId = t.kerrosId; h.sijainti.piste = null;
        Auto.manual(h, "tila"); Auto.autoKohta(h); if (window.FieldFill) FieldFill.apply(h);
        paintLoc(); paintStatus(); if (saved) persist();
        return;
      }
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
      else if (c === "more") pikavalinta(false, true);
      else if (c === "loc") {
        Plan.locationSheet(h.sijainti, async (s) => {
          h.sijainti = s; Auto.manual(h, "tila"); Auto.manual(h, "rakenneosa"); Auto.autoKohta(h);
          if (window.FieldFill) FieldFill.apply(h);          // esim. märkätilan tyyppi ja asunto tilasta
          paintLoc(); paintStatus();
          if (saved) await Model.saveHavainto(h);
        }, { ehdotus: !!(h.auto && h.auto.tila === "seuranta"), noPart: true, title: "Valitse tila" });
      }
    });

    paintAll();
    const release = Asetukset.get("kamera.valve") ? UI.keepAwake() : () => {};
    naytaOhje();
    // Uusi havainto: pikavalinta, jos menetelmä (tai tila) valitaan itse. Ei, kun jatketaan
    // olemassa olevaa havaintoa tai kuvaus avattiin tietylle suunnitelman kohdalle.
    if (mode === "hav" && !saved && !q.menetelma && !q.kohta && !q.kaosa && !q.akkosa && Asetukset.get("pv.milloin") !== "ei") pikavalinta(true);

    /* Pikavalinta: tila (jos valitaan itse) ja menetelmä yhdellä näytöllä. Menetelmän napautus sulkee.
       Molemmissa on hakukenttä: kirjoitus rajaa listaa, ja jos osumaa ei ole, sama kenttä lisää uuden. */
    function pikavalinta(alku, pakota) {
      const pvT = Asetukset.get("pv.tila");
      const kysyM = !Auto.paalla("menetelma") || !!pakota, kysyT = !Auto.paalla("tila") && pvT !== "ei" && (pvT === "aina" || !h.sijainti.tilaId || (h.auto && h.auto.tila === "seuranta"));
      if (!kysyM && !kysyT) return;
      const vanha = root.querySelector(".qp"); if (vanha) vanha.remove();
      const g = document.createElement("div");
      g.className = "qp";
      const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
      /* Yksinkertainen pikavalinta: ensin Havainto / Yleiskuva, sitten tila (2–4 ehdotusta) ja menetelmä
         (suunnitelman kohdat). Haku ja kaikki vaihtoehdot avautuvat vasta "Hae…"-painikkeesta. */
      let tHaku = false, mHaku = false;
      g.innerHTML = '<div class="qp-box">' +
        (alku && !pakota ? '<div class="qp-tyyppi"><button class="on" data-qhav>' + icon("cam") + '<span>Havainto<small>kuva ja sanelu</small></span></button>' +
          '<button data-qyk>' + icon("image") + '<span>Yleiskuva<small>pelkkä kuva, ei sanelua</small></span></button></div>' : "") +
        (kysyT ? '<div data-sec="t"><div class="qp-h">Tila</div><div class="qp-trow" data-qtl></div></div>' : "") +
        (kysyM ? '<div data-sec="m"><div class="qp-h">' + (pakota ? "Vaihda menetelmä" : "Mitä kirjaat?") + '</div><div class="qp-find" data-qmf hidden><input type="search" data-qms placeholder="Menetelmän nimi, esim. RH tai näyte" autocomplete="off" enterkeyhint="done"></div>' +
          '<div data-qml></div></div>' : '<button class="btn btn-primary" data-qok style="width:100%;margin-top:12px">Valmis</button>') +
        '<button class="qp-skip" data-qskip>' + (kysyM ? "Valitse myöhemmin" : "Ohita") + "</button></div>";
      const tIn = g.querySelector("[data-qts]"), mIn = g.querySelector("[data-qms]");

      /* Tila yhtenä rivinä: seurannan ehdotus (tai valittu tila) ja Vaihda. Vaihda avaa sijainnin valinnan
         (haku, pohjakuva ja seurannan piste, viimeksi käytetyt). Ehdotus hyväksytään ottamalla kuva. */
      function paintT() {
        if (!kysyT) return;
        const t = h.sijainti.tilaId && Model.tila(h.sijainti.tilaId), ehdotus = t && h.auto && h.auto.tila === "seuranta";
        g.querySelector("[data-qtl]").innerHTML =
          '<span class="qp-tnimi' + (t ? "" : " tyhja") + '">' + icon("pin") + (t ? esc(Model.tilaNimi(t)) + (ehdotus ? " <small>ehdotus</small>" : "") : "Ei valittu") + "</span>" +
          '<button class="qp-vaihda" data-qtvaihda>' + (t ? "Vaihda" : "Valitse tila") + "</button>";
      }
      function paintM() {
        if (!kysyM) return;
        const q = norm(mIn.value);
        const all = M.havaintoMenetelmat();
        let html;
        if (mHaku) {
          const hits = q ? all.filter((m) => norm(m.nimi).includes(q) || norm(m.lyhyt).includes(q) || (m.sanat || []).some((w) => norm(w).includes(q))) : all;
          const exact = all.some((m) => norm(m.nimi) === q);
          html = '<div class="qp-grid qp-small">' + hits.map((m) => '<button class="qp-m" data-qm="' + esc(m.id) + '">' + esc(m.nimi) + "</button>").join("") +
            (q && !exact ? '<button class="qp-m qp-more" data-qmnew>+ Uusi menetelmä ”' + esc(mIn.value.trim()) + "”</button>" : "") + "</div>";
        } else {
          // Suunnitelman kohdat ja edellinen menetelmä; aistinvarainen aina mukana. Muut haun takana.
          let sugg = Asetukset.get("pv.suunnitelma") ? MethodPicker.ehdotukset(h.menetelma, h.id).slice(0, 5) : [];
          if (!sugg.some((x) => x.id === "aisti") && all.some((m) => m.id === "aisti")) sugg = sugg.concat([{ id: "aisti", nimi: M.menetelma("aisti").nimi }]);
          html = '<div class="qp-grid">' +
            sugg.map((x, i) => '<button class="qp-m' + (i === 0 && x.id === h.menetelma ? " qp-first" : "") + '" data-qm="' + esc(x.id) + '">' + esc(x.nimi) +
              (x.id === h.menetelma && !alku ? "<small>sama kuin edellä</small>" : x.tag ? "<small>" + esc(x.tag) + "</small>" : "") + "</button>").join("") +
            '<button class="qp-m qp-more" data-qmhaku>' + icon("list") + " Muu menetelmä…</button></div>";
        }
        g.querySelector("[data-qml]").innerHTML = html;
      }
      paintT(); paintM();
      root.appendChild(g);
      /* Haku: laatikko nousee ylös ja muut osiot piiloon, jotta näppäimistö ei peitä tuloksia */
      const vv = window.visualViewport;
      const sovita = () => { if (vv) g.style.setProperty("--qp-vh", Math.max(200, vv.height - 12) + "px"); };
      function hakuTila(osio) {
        g.classList.add("qp-typing"); g.dataset.haku = osio; sovita();
        if (vv) vv.addEventListener("resize", sovita);
      }
      function hakuPois() { g.classList.remove("qp-typing"); delete g.dataset.haku; if (vv) vv.removeEventListener("resize", sovita); }
      const sulje = () => { hakuPois(); g.remove(); paintAll(); };
      function asetaTila(t) {
        if (window.Paikannus) Paikannus.kiinnita(t.id);
        h.sijainti.tilaId = t.id; h.sijainti.kerrosId = t.kerrosId; h.sijainti.piste = null;
        Auto.manual(h, "tila"); Auto.autoKohta(h); if (window.FieldFill) FieldFill.apply(h);
        paintLoc(); paintStatus();
        if (tIn) { tIn.value = ""; tIn.blur(); }
        hakuPois(); tHaku = false; const tf = g.querySelector("[data-qtf]"); if (tf) tf.hidden = true;
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
        tIn.addEventListener("focus", () => hakuTila("t"));
        tIn.addEventListener("input", paintT);
        tIn.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const eka = g.querySelector("[data-qtl] [data-qt]:not([data-qt='__muu'])");
          if (norm(tIn.value) && eka) asetaTila(Model.tila(eka.dataset.qt)); else if (norm(tIn.value)) uusiTila();
        });
      }
      if (mIn) {
        mIn.addEventListener("focus", () => hakuTila("m"));
        mIn.addEventListener("input", paintM);
        mIn.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const eka = g.querySelector("[data-qml] [data-qm]");
          if (norm(mIn.value) && eka) { selectMethod(eka.dataset.qm, true); sulje(); } else if (norm(mIn.value)) uusiMenetelma();
        });
      }
      g.addEventListener("click", (e) => {
        // Napautus laatikon ulkopuolelle (kameranäkymään) = Valitse myöhemmin
        if (e.target === g) { sulje(); return; }
        if (e.target.closest("[data-qtnew]")) { uusiTila(); return; }
        if (e.target.closest("[data-qmnew]")) { uusiMenetelma(); return; }
        if (e.target.closest("[data-qyk]")) { g.remove(); setMode("yk"); return; }
        if (e.target.closest("[data-qhav]")) return;
        if (e.target.closest("[data-qtvaihda]")) {
          Plan.locationSheet(h.sijainti, (sij) => {
            h.sijainti = sij; Auto.manual(h, "tila"); Auto.autoKohta(h); if (window.FieldFill) FieldFill.apply(h);
            paintLoc(); paintStatus(); paintT(); if (!kysyM && h.sijainti.tilaId) sulje();
          }, { ehdotus: !!(h.auto && h.auto.tila === "seuranta"), noPart: true, title: "Valitse tila" });
          return;
        }
        if (e.target.closest("[data-qmhaku]")) { mHaku = true; g.querySelector("[data-qmf]").hidden = false; paintM(); mIn.focus(); return; }
        const tb = e.target.closest("[data-qt]");
        if (tb) {
          if (tb.dataset.qt === "__muu") {
            Plan.locationSheet(h.sijainti, (sij) => { h.sijainti = sij; Auto.manual(h, "tila"); Auto.autoKohta(h); paintLoc(); paintStatus(); paintT(); if (!kysyM && h.sijainti.tilaId) sulje(); },
              { ehdotus: !!(h.auto && h.auto.tila === "seuranta") });
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
        "<li><b>Valitse menetelmä ja tila</b> pikavalinnasta. Tilan voi vaihtaa yläreunasta ja menetelmän kuvan päältä.</li>" +
        "<li><b>Ota kuva</b> laukaisimesta. Kuvia voi ottaa useita.</li>" +
        "<li><b>Pidä mikrofonia pohjassa</b> ja kerro havainto. Vapauta, kun olet valmis.</li>" +
        "<li><b>Seuraava</b> tallentaa ja aloittaa uuden havainnon samassa tilassa.</li>" +
        "<li><b>Täydennä tiedot</b> avaa havainnon kaikki tiedot ja mittauskentät. Sen voi avata myös ilman kuvaa.</li>" +
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

    const ehdAjastin = setInterval(() => {
      if (!alive || document.visibilityState !== "visible") return;
      if (ehdotaTila()) { paintLoc(); paintStatus(); } else paintEhd();
    }, 2000);
    S.cleanup = () => { clearInterval(ehdAjastin); alive = false; if (window.Sync) Sync.kesken = null; release(); dict.stop(); Camera.stop(); h.sanelu = ta.value; persist.flush(); };
  }

  window.Capture = { view };
})();
