/* =========================================================================
   dictation.js – sanelu (Web Speech API, fi-FI) ja pidä pohjassa -painike

   Sanelukerta (session): painikkeen painalluksesta vapautukseen. Teksti
   kootaan kerran tuloksista ja annetaan käyttöön (onCommit) vasta, kun
   kerta päättyy. Näin vältetään tuplateksti:
     - Android Chrome palauttaa jatkuvassa tunnistuksessa valmiit lauseet
       kumulatiivisesti ("lattia on" -> "lattia on märkä"), ja
     - tunnistus voi päättyä hiljaisuuteen ja käynnistyä uudelleen.
   Ilman verkkoa (tai jos tunnistus ei ole käytettävissä) sanelu tallennetaan
   äänitteenä (onAudio), jotta mitään ei menetetä.
   ========================================================================= */
(function () {
  "use strict";

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  /* Puheentunnistuksen tila (config.js: puheentunnistus) */
  const OMA = window.Asetukset ? Asetukset.get("sanelu.puhe") : "oletus";   // laitekohtainen valinta voittaa
  const MODE = OMA && OMA !== "oletus" ? OMA : ((window.KS_CONFIG || {}).puheentunnistus) || "palvelin";
  let PAIKALLINEN = "tuntematon";   // available | downloadable | downloading | unavailable | ei-tukea
  /* Puhelimessa tapahtuva tunnistus on selaimissa uusi ominaisuus, ja se voi kaataa välilehden.
     Kutsun ajaksi asetetaan merkki; jos merkki on jäljellä seuraavalla käynnistyksellä, välilehti
     kaatui kesken, eikä ominaisuutta enää käytetä tällä laitteella (sanelu tallennetaan äänitteinä). */
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ohita */ } } };
  if (LS.get("ks.sr.kesken")) { LS.set("ks.sr.kaatui", LS.get("ks.sr.kesken")); LS.set("ks.sr.kesken", null); }
  const kaatui = () => !!LS.get("ks.sr.kaatui");
  async function suojattu(vaihe, fn) {
    LS.set("ks.sr.kesken", vaihe);
    try { return await fn(); } finally { setTimeout(() => LS.set("ks.sr.kesken", null), 1500); }
  }
  async function tarkistaPaikallinen() {
    if (!SR || typeof SR.available !== "function" || kaatui()) { PAIKALLINEN = "ei-tukea"; return PAIKALLINEN; }
    try { PAIKALLINEN = await suojattu("tarkistus", () => SR.available({ langs: ["fi-FI"], processLocally: true })); } catch (e) { PAIKALLINEN = "ei-tukea"; }
    return PAIKALLINEN;
  }
  // Tarkistus vasta, kun sovellus on käynnistynyt (ei käynnistyksen aikana)
  let valmisP = null;
  const valmis = () => valmisP || (valmisP = MODE === "laite" ? tarkistaPaikallinen() : Promise.resolve());
  if (MODE === "laite") setTimeout(valmis, 2500);

  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

  /* Kumulatiiviset ja toistuvat tulokset yhdeksi listaksi */
  function collapse(list) {
    const out = [];
    for (let t of list) {
      t = String(t || "").trim();
      if (!t) continue;
      if (out.length) {
        // Vertailu ilman välilyöntejä: Android voi palauttaa saman lauseen uudelleen hieman eri
        // tavoin pilkottuna ("ilmanäyte" / "ilma näyte") koko tähänastisen tekstin kanssa.
        const a = norm(out[out.length - 1]).replace(/ /g, ""), b = norm(t).replace(/ /g, "");
        if (b === a) continue;
        const alku = a.length >= 12 ? a.slice(0, Math.floor(a.length * 0.8)) : a;
        if (b.startsWith(a) || (b.length >= a.length && b.startsWith(alku))) { out[out.length - 1] = t; continue; }   // laajennus edellisestä
        if (a.startsWith(b) || a.includes(b)) continue;               // edellinen sisältää jo
      }
      out.push(t);
    }
    return out;
  }

  /* Muotoilu kenttään: iso alkukirjain ja piste, liitetään edellisen tekstin perään */
  function appendText(prev, add) {
    add = String(add || "").trim();
    if (!add) return prev || "";
    add = add.charAt(0).toUpperCase() + add.slice(1);
    if (!/[.!?]$/.test(add)) add += ".";
    let cur = String(prev || "").replace(/\s+$/, "");
    if (cur && !/[.!?:]$/.test(cur)) cur += ".";
    return (cur ? cur + " " : "") + add;
  }

  class Dictation {
    constructor(opts) {
      this.onCommit = opts.onCommit || function () {};     // (teksti) sanelukerran valmis teksti
      this.onPreview = opts.onPreview || function () {};   // (teksti) keskeneräinen esikatselu
      this.onState = opts.onState || function () {};       // (tila, viesti): listening | recording | stopped | error
      this.onAudio = opts.onAudio || function () {};       // (blob) äänite
      this.active = false;
      this.locked = false;          // napautuksella lukittu sanelu
      this.rec = null;
      this.recorder = null;
      this.finals = [];             // tämän tunnistuskierroksen valmiit tulokset
      this.committed = [];          // sanelukerran aiemmat kierrokset
      this.interim = "";
      this.mode = null;
    }

    static supported() { return !!SR && (MODE !== "laite" || PAIKALLINEN === "available"); }
    static available() { return !!SR || !!window.MediaRecorder; }

    start() {
      if (this.active) return;
      this.active = true;
      this.committed = []; this.finals = []; this.interim = "";
      const online = navigator.onLine !== false;
      // Tietosuoja: "laite" = tunnistus vain puhelimessa; jos se ei ole käytettävissä, äänite (ääni ei lähde minnekään)
      if (MODE === "laite") {
        if (SR && PAIKALLINEN === "available" && !kaatui()) { this.mode = "speech"; this._startSpeech(); }
        else if (window.MediaRecorder) { this.mode = "audio"; this._startAudio("Puheentunnistus puhelimessa ei ole käytössä: sanelu tallennetaan äänitteenä."); }
        else { this.active = false; this.onState("error", "Sanelu ei ole käytettävissä. Kirjoita teksti."); }
        return;
      }
      if (SR && online) { this.mode = "speech"; this._startSpeech(); }
      else if (window.MediaRecorder) {
        this.mode = "audio";
        this._startAudio(SR ? "Ei verkkoyhteyttä: sanelu tallennetaan äänitteenä." : "Puheentunnistusta ei ole tässä selaimessa: sanelu tallennetaan äänitteenä.");
      } else { this.active = false; this.onState("error", "Selain ei tue sanelua. Kirjoita teksti."); }
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      this.locked = false;
      if (this.mode === "speech" && this.rec) {
        try { this.rec.stop(); } catch (e) { /* ohita */ }
        // Jos tunnistus ei päätä kierrosta (onend), annetaan teksti silti käyttöön.
        const rec = this.rec;
        setTimeout(() => { if (this.rec === rec) { try { rec.abort(); } catch (e) { /* ohita */ } this._endRound(rec); } }, 1500);
      }
      if (this.mode === "audio" && this.recorder && this.recorder.state !== "inactive") { try { this.recorder.stop(); } catch (e) { /* ohita */ } }
      this.onState("stopped");
    }

    sessionText() { return collapse(this.committed.concat(this.finals)).join(" "); }

    _preview() {
      const f = this.sessionText();
      const i = this.interim.trim();
      let p = f;
      if (i) p = norm(i).startsWith(norm(f)) && f ? i : (f ? f + " " + i : i);   // Android: välitulos voi sisältää koko tekstin
      this.onPreview(p);
    }

    _endRound(rec) {
      if (this.rec !== rec) return;
      this.rec = null;
      // Kierroksen tulokset talteen
      this.committed = collapse(this.committed.concat(this.finals));
      // Keskeneräinen välitulos otetaan mukaan, jos kierros katkesi ennen lopullista tulosta.
      if (this.interim.trim()) this.committed = collapse(this.committed.concat([this.interim]));
      this.finals = []; this.interim = "";
      if (this.active) {
        // Tunnistus päättyi hiljaisuuteen, mutta painike on yhä pohjassa: uusi kierros.
        setTimeout(() => { if (this.active && this.mode === "speech") this._startSpeech(true); }, 120);
        this._preview();
      } else {
        const text = this.committed.join(" ");
        this.committed = [];
        this.onPreview("");
        if (text) this.onCommit(text);
        else { buzz([40, 60, 40]); this.onState("empty", "Sanelusta ei saatu tekstiä. Sanele uudelleen tai kirjoita."); }
      }
    }

    _startSpeech(restart) {
      const rec = new SR();
      rec.lang = "fi-FI";
      if (MODE === "laite") { rec.processLocally = true; LS.set("ks.sr.kesken", "sanelu"); setTimeout(() => LS.set("ks.sr.kesken", null), 4000); }   // ääni ei lähde puhelimesta
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        if (this.rec !== rec) return;
        const finals = [];
        let interim = "";
        // Koko tuloslista luetaan joka kerta alusta: indeksit eivät ole luotettavia Androidilla.
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finals.push(r[0].transcript);
          else interim += (interim ? " " : "") + r[0].transcript;
        }
        this.finals = collapse(finals);
        this.interim = interim;
        this._preview();
      };
      rec.onerror = (ev) => {
        if (ev.error === "no-speech" || ev.error === "aborted") return;
        if (ev.error === "network") {
          // Verkko katosi: jatketaan äänitteenä, jos painike on yhä pohjassa.
          this.rec = null;
          const text = collapse(this.committed.concat(this.finals)).join(" ");
          this.committed = []; this.finals = []; this.interim = "";
          if (text) this.onCommit(text);
          if (this.active && window.MediaRecorder) { this.mode = "audio"; this._startAudio("Ei verkkoyhteyttä: sanelu jatkuu äänitteenä."); }
          else { this.active = false; this.onState("error", "Puheentunnistus vaatii verkkoyhteyden."); }
          return;
        }
        const msg = ev.error === "not-allowed" || ev.error === "service-not-allowed"
          ? "Mikrofonin käyttö estettiin. Salli mikrofoni selaimen asetuksista."
          : ev.error === "audio-capture" ? "Mikrofonia ei löytynyt tai se on toisen sovelluksen käytössä."
          : "Sanelu keskeytyi (" + ev.error + ").";
        this.active = false; this.locked = false;
        this.onState("error", msg);
      };
      rec.onend = () => this._endRound(rec);
      this.rec = rec;
      try { rec.start(); if (!restart) this.onState("listening"); }
      catch (e) { this.rec = null; this.active = false; this.onState("error", "Sanelun käynnistys epäonnistui."); }
    }

    async _startAudio(msg) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!this.active) { stream.getTracks().forEach((t) => t.stop()); return; }
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          if (blob.size > 2000) this.onAudio(blob);
        };
        rec.start();
        this.recorder = rec;
        this.onState("recording", msg);
      } catch (e) {
        this.active = false; this.locked = false;
        this.onState("error", "Mikrofonia ei saatu käyttöön.");
      }
    }
  }

  /* -----------------------------------------------------------------------
     Pidä pohjassa -painike
       - pidä pohjassa: sanelu, vapautus lopettaa ja lisää tekstin
       - lyhyt napautus: lukitsee sanelun päälle, uusi napautus lopettaa
     bind(btn, dict, { labelEl, idle, holding, locked, onChange })
     ----------------------------------------------------------------------- */
  const TAP_MS = 350;

  function buzz(ms) { try { if (navigator.vibrate && (!window.Asetukset || Asetukset.get("sanelu.varina"))) navigator.vibrate(ms); } catch (e) { /* ohita */ } }

  function bind(btn, dict, o) {
    o = o || {};
    const napauta = window.Asetukset && Asetukset.get("sanelu.tapa") === "napauta";
    const labels = { idle: o.idle || (napauta ? "Sanele" : "Pidä: sanele"), holding: o.holding || "Vapauta: valmis", locked: o.locked || "Lopeta" };
    let downAt = 0, pid = null;

    function paint() {
      const st = !dict.active ? "idle" : dict.locked ? "locked" : "holding";
      btn.dataset.dict = st;
      btn.setAttribute("aria-pressed", String(dict.active));
      if (o.labelEl) o.labelEl.textContent = labels[st];
      if (o.onChange) o.onChange(st);
    }

    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      if (dict.active && dict.locked) { dict.stop(); buzz(10); paint(); pid = null; return; }
      pid = e.pointerId;
      try { btn.setPointerCapture(pid); } catch (err) { /* ohita */ }
      downAt = Date.now();
      dict.start();
      if (napauta) dict.locked = true;        // napautustila: päälle, seuraava napautus lopettaa
      if (dict.active) buzz(15);
      paint();
    });
    const release = (e) => {
      if (pid === null || (e && e.pointerId !== pid)) return;
      pid = null;
      if (!dict.active) { paint(); return; }
      if (napauta) { paint(); return; }
      if (Date.now() - downAt < TAP_MS) { dict.locked = true; paint(); return; }   // lyhyt napautus: lukitse
      dict.stop(); buzz(10); paint();
    };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    // Näppäimistö ja ruudunlukija: Enter/välilyönti vaihtaa päälle/pois
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (dict.active) dict.stop(); else { dict.start(); dict.locked = true; }
      paint();
    });
    paint();
    return { paint };
  }

  /* Etusivun kortti: miten sanelu käsitellään ja suomen kielipaketin lataus puhelimeen */
  Dictation.puheKortti = async function (el) {
    if (!el) return;
    await valmis();
    const esc = UI.esc;
    let t, btn = "";
    if (MODE === "laite" && kaatui()) { t = "Puhelimessa tapahtuva puheentunnistus kaatoi selaimen välilehden (" + (LS.get("ks.sr.kaatui") === "sanelu" ? "saneltaessa" : "tarkistuksessa") + "), joten se on poistettu käytöstä tällä laitteella. Sanelut tallennetaan äänitteinä; ääni ei lähde puhelimesta."; btn = '<button class="btn btn-sm" data-uudelleen style="margin-top:10px">Kokeile uudelleen</button>'; }
    else if (MODE === "palvelin") t = "Sanelun ääni lähetetään selaimen puheentunnistuspalveluun (Chrome: Google). " + (OMA === "palvelin" ? "Valittu tämän laitteen asetuksista." : "Asetus on ylläpitäjän valinta (config.js).");
    else if (PAIKALLINEN === "available") t = "Puheentunnistus tapahtuu tässä puhelimessa. Ääntä ei lähetetä mihinkään.";
    else if (PAIKALLINEN === "downloadable" || PAIKALLINEN === "downloading") { t = "Suomen puheentunnistus voidaan ladata puhelimeen. Sen jälkeen sanelu muuttuu tekstiksi puhelimessa, myös ilman verkkoa. Siihen asti sanelut tallennetaan äänitteinä."; btn = '<button class="btn btn-sm btn-primary" data-asenna style="margin-top:10px">Lataa suomen puheentunnistus</button>'; }
    else t = "Tämä selain ei tue suomen puheentunnistusta puhelimessa. Sanelut tallennetaan äänitteinä (ääni ei lähde puhelimesta), ja teksti kirjoitetaan tai litteroidaan raportoinnissa.";
    el.innerHTML = '<section class="card"><div class="card-h"><h2>Sanelu ja tietosuoja</h2></div><div class="card-b"><p style="margin:0">' + esc(t) + "</p>" + btn + "</div></section>";
    const u = el.querySelector("[data-uudelleen]");
    if (u) u.addEventListener("click", () => { LS.set("ks.sr.kaatui", null); valmisP = null; Dictation.puheKortti(el); });
    const b = el.querySelector("[data-asenna]");
    if (b) b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Ladataan…";
      try { const ok = await suojattu("lataus", () => SR.install({ langs: ["fi-FI"], processLocally: true })); await tarkistaPaikallinen(); UI.toast(ok ? "Suomen puheentunnistus on nyt puhelimessa." : "Lataus ei onnistunut.", 3500); }
      catch (e) { UI.toast("Lataus ei onnistunut: " + (e.message || e), 4000); }
      Dictation.puheKortti(el);
    });
  };
  Dictation.tila = () => ({ MODE, PAIKALLINEN });

  window.Dictation = Dictation;
  window.DictButton = { bind, appendText, collapse, buzz };
})();
