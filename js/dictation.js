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

  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

  /* Kumulatiiviset ja toistuvat tulokset yhdeksi listaksi */
  function collapse(list) {
    const out = [];
    for (let t of list) {
      t = String(t || "").trim();
      if (!t) continue;
      if (out.length) {
        const a = norm(out[out.length - 1]), b = norm(t);
        if (b === a) continue;
        if (b.startsWith(a)) { out[out.length - 1] = t; continue; }   // laajennus edellisestä
        if (a.startsWith(b)) continue;                                // edellinen sisältää jo
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

    static supported() { return !!SR; }
    static available() { return !!SR || !!window.MediaRecorder; }

    start() {
      if (this.active) return;
      this.active = true;
      this.committed = []; this.finals = []; this.interim = "";
      const online = navigator.onLine !== false;
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

  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ohita */ } }

  function bind(btn, dict, o) {
    o = o || {};
    const labels = { idle: o.idle || "Pidä: sanele", holding: o.holding || "Vapauta: valmis", locked: o.locked || "Lopeta" };
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
      if (dict.active) buzz(15);
      paint();
    });
    const release = (e) => {
      if (pid === null || (e && e.pointerId !== pid)) return;
      pid = null;
      if (!dict.active) { paint(); return; }
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

  window.Dictation = Dictation;
  window.DictButton = { bind, appendText, collapse, buzz };
})();
