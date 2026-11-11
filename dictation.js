/* =========================================================================
   dictation.js – sanelu puheentunnistuksella (Web Speech API, fi-FI)
   Jos selain ei tue puheentunnistusta, sanelu tallennetaan äänitteenä
   (MediaRecorder), jotta mitään ei menetetä. Äänite viedään ZIP-pakettiin.
   ========================================================================= */
(function () {
  "use strict";

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  class Dictation {
    constructor(opts) {
      this.onFinal = opts.onFinal || function () {};     // (teksti) valmis lause
      this.onInterim = opts.onInterim || function () {}; // (teksti) keskeneräinen
      this.onState = opts.onState || function () {};     // (tila, viesti)
      this.onAudio = opts.onAudio || function () {};     // (blob) äänite
      this.active = false;
      this.mode = SR ? "speech" : (window.MediaRecorder ? "audio" : "none");
      this.rec = null;
      this.recorder = null;
      this.chunks = [];
      this.startedAt = 0;
      this.errorCount = 0;
    }

    static supported() { return !!SR; }

    start() {
      if (this.active) return;
      this.active = true;
      this.startedAt = Date.now();
      this.errorCount = 0;
      if (this.mode === "speech") this._startSpeech();
      else if (this.mode === "audio") this._startAudio();
      else { this.active = false; this.onState("error", "Selain ei tue sanelua. Kirjoita teksti tai käytä näppäimistön sanelua."); }
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      if (this.rec) { try { this.rec.stop(); } catch (e) { /* ohita */ } }
      if (this.recorder && this.recorder.state !== "inactive") { try { this.recorder.stop(); } catch (e) { /* ohita */ } }
      this.onState("stopped");
    }

    _startSpeech() {
      const rec = new SR();
      rec.lang = "fi-FI";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) this.onFinal(r[0].transcript.trim());
          else interim += r[0].transcript;
        }
        this.onInterim(interim.trim());
      };
      rec.onerror = (ev) => {
        if (ev.error === "no-speech" || ev.error === "aborted") return;
        this.errorCount++;
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          this.active = false;
          this.onState("error", "Mikrofonin käyttö estettiin. Salli mikrofoni selaimen asetuksista.");
        } else if (ev.error === "audio-capture") {
          this.active = false;
          this.onState("error", "Mikrofonia ei löytynyt tai se on toisen sovelluksen käytössä.");
        } else if (ev.error === "network") {
          this.active = false;
          this.onState("error", "Puheentunnistus vaatii verkkoyhteyden tässä selaimessa. Kirjoita teksti tai yritä uudelleen.");
        } else if (this.errorCount > 3) {
          this.active = false;
          this.onState("error", "Sanelu keskeytyi (" + ev.error + ").");
        }
      };
      // Android Chrome lopettaa tunnistuksen hiljaisuuden jälkeen: jatketaan niin kauan kuin sanelu on päällä.
      rec.onend = () => {
        this.onInterim("");
        if (this.active) {
          setTimeout(() => { if (this.active) { try { rec.start(); } catch (e) { /* jo käynnissä */ } } }, 150);
        }
      };
      this.rec = rec;
      try { rec.start(); this.onState("listening"); }
      catch (e) { this.active = false; this.onState("error", "Sanelun käynnistys epäonnistui."); }
    }

    async _startAudio() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        this.chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
          if (blob.size) this.onAudio(blob);
        };
        rec.start();
        this.recorder = rec;
        this.onState("recording", "Puheentunnistusta ei ole tässä selaimessa: sanelu tallennetaan äänitteenä.");
      } catch (e) {
        this.active = false;
        this.onState("error", "Mikrofonia ei saatu käyttöön.");
      }
    }
  }

  window.Dictation = Dictation;
})();
