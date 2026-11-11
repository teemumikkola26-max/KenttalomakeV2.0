/* =========================================================================
   capture.js – Kuva + sanelu -näkymä
   Kamera ja sanelu ovat yhtä aikaa päällä. Jokainen kuva ja sanelu
   tallentuu samaan havaintoon heti, joten mitään ei menetetä, vaikka
   sovellus suljettaisiin kesken.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  const { S, Model } = App;

  async function view(havaintoId, q) {
    const k = S.kohde;
    let h = havaintoId ? Model.havainto(havaintoId) : null;
    const isNew = !h;
    if (!h) {
      h = Model.newHavainto(k, { menetelma: q.menetelma, suunnitelmaId: q.kohta, tilaId: q.tila, kerrosId: q.kerros });
      if (q.tila) {
        const t = Model.tila(q.tila);
        if (t) h.sijainti.kerrosId = t.kerrosId;
        h.sijainti.rakenneosa = null;
      }
      if (q.kerros && h.sijainti.tilaId) {
        const t = Model.tila(h.sijainti.tilaId);
        if (!t || t.kerrosId !== q.kerros) { h.sijainti.tilaId = null; h.sijainti.piste = null; }
      }
    }
    let saved = !isNew;
    let interim = "";
    let shots = 0;

    document.getElementById("app").innerHTML =
      '<div class="cam">' +
      '<div class="cam-top">' +
      '<button class="cam-round" data-c="close" aria-label="Sulje">' + icon("close") + "</button>" +
      '<button class="loc-chip" data-c="loc">' + icon("pin") + '<span class="txt" data-loc></span><span class="ch">vaihda</span></button>' +
      "</div>" +
      '<div class="viewfinder"><video autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="vf-msg" data-vfmsg>Käynnistetään kameraa…</div>' +
      '<span class="vf-count" data-count></span><div class="vf-thumbs" data-thumbs></div></div>' +
      '<div class="dict" aria-live="polite"><div class="dict-h off" data-dh><span class="rec"></span><span data-dstate>Sanelu pois päältä</span></div><p data-text></p></div>' +
      '<div class="cam-bottom">' +
      '<button class="cam-side" data-c="done"><span class="c">' + icon("ok") + "</span>Valmis</button>" +
      '<button class="shutter" data-c="shot" aria-label="Ota kuva"><span></span></button>' +
      '<button class="cam-side" data-c="mic"><span class="c" data-micic>' + icon("mic") + '</span><span data-miclbl>Sanele</span></button>' +
      "</div></div>";

    const root = document.querySelector(".cam");
    const video = root.querySelector("video");
    const $ = (s) => root.querySelector(s);

    function paintLoc() {
      const t = Model.sijaintiTeksti(h.sijainti);
      $("[data-loc]").textContent = t || "Valitse sijainti";
      $(".loc-chip").classList.toggle("missing", !h.sijainti.tilaId);
    }
    function paintText() {
      const p = $("[data-text]");
      if (!h.sanelu && !interim) {
        p.className = "ph";
        p.textContent = Dictation.supported()
          ? "Kuvaile, mitä näet. Voit ottaa kuvia puhumisen aikana."
          : "Puheentunnistusta ei ole tässä selaimessa: sanelu tallentuu äänitteenä. Tekstin voi lisätä havaintokortilla.";
        return;
      }
      p.className = "";
      p.innerHTML = esc(h.sanelu) + (interim ? ' <span class="interim">' + esc(interim) + "</span>" : "");
      const box = root.querySelector(".dict");
      box.scrollTop = box.scrollHeight;
    }
    async function paintThumbs() {
      const last = h.kuvat.slice(-3);
      await Model.ensureUrls(last);
      $("[data-thumbs]").innerHTML = last.map((id) => '<img src="' + Model.url(id) + '" alt="">').join("");
      $("[data-count]").textContent = h.kuvat.length ? h.kuvat.length + (h.kuvat.length === 1 ? " kuva" : " kuvaa") + " tässä havainnossa" : "";
    }
    function paintMic(state, msg) {
      const on = state === "listening" || state === "recording";
      $("[data-dh]").classList.toggle("off", !on);
      $("[data-dstate]").textContent = on ? (state === "recording" ? "Äänitetään" : "Sanelu käynnissä") : (msg || "Sanelu pois päältä");
      root.querySelector('[data-c="mic"]').classList.toggle("mic-on", on);
      $("[data-micic]").innerHTML = on ? icon("stop") : icon("mic");
      $("[data-miclbl]").textContent = on ? "Lopeta" : "Sanele";
    }

    const persist = UI.debounce(async () => {
      if (!h.kuvat.length && !h.sanelu && !(h.aanitteet || []).length) return;
      await Model.saveHavainto(h);
      saved = true;
    }, 500);

    const dict = new Dictation({
      onFinal: (t) => {
        if (!t) return;
        h.sanelu = (h.sanelu ? h.sanelu.replace(/\s+$/, "") + " " : "") + t.charAt(0).toUpperCase() + t.slice(1);
        if (!/[.!?]$/.test(h.sanelu)) h.sanelu += ".";
        interim = "";
        paintText(); persist();
      },
      onInterim: (t) => { interim = t; paintText(); },
      onState: (st, msg) => { paintMic(st, msg); if (st === "error" && msg) toast(msg, 4000); },
      onAudio: async (blob) => {
        const id = await DB.putFile(k.id, blob, { kind: "aanite", havaintoId: h.id });
        h.aanitteet = (h.aanitteet || []).concat(id);
        await Model.saveHavainto(h); saved = true;
        toast("Äänite tallennettu");
      }
    });

    async function addPhoto(blob) {
      const id = await DB.putFile(k.id, blob, { kind: "kuva", havaintoId: h.id });
      h.kuvat.push(id);
      await Model.saveHavainto(h);
      saved = true;
      shots++;
      paintThumbs();
    }

    async function shoot() {
      if (!Camera.stream) {
        const files = await UI.pickFile("image/*", true, "environment");
        for (const f of files) await addPhoto(await Camera.shrink(f));
        return;
      }
      const fl = $(".flash");
      fl.classList.add("on");
      setTimeout(() => fl.classList.remove("on"), 60);
      try { await addPhoto(await Camera.capture(video)); }
      catch (e) { toast(e.message || "Kuvan otto epäonnistui"); }
    }

    async function finish(toCard) {
      dict.stop();
      persist.flush();
      // odotetaan mahdollinen äänitteen tallennus
      await new Promise((r) => setTimeout(r, dict.mode === "audio" ? 400 : 0));
      if (h.kuvat.length || h.sanelu || (h.aanitteet || []).length) {
        await Model.saveHavainto(h);
        S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa };
        await Model.saveKohde();
        saved = true;
      }
      if (toCard && saved) location.hash = "#/k/" + k.id + "/h/" + h.id;
      else location.hash = "#/k/" + k.id;
    }

    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-c]");
      if (!b) return;
      const c = b.dataset.c;
      if (c === "shot") shoot();
      else if (c === "mic") { if (dict.active) dict.stop(); else dict.start(); }
      else if (c === "done") finish(true);
      else if (c === "close") finish(false);
      else if (c === "loc") {
        Plan.locationSheet(h.sijainti, async (s) => {
          h.sijainti = s; paintLoc();
          if (saved) await Model.saveHavainto(h);
        });
      }
    });

    paintLoc(); paintText(); paintThumbs(); paintMic("stopped");

    try {
      await Camera.start(video);
      $("[data-vfmsg]").classList.add("hidden");
    } catch (e) {
      const m = $("[data-vfmsg]");
      m.innerHTML = "<div>Selaimen kameraa ei saatu käyttöön.<br>Laukaisin avaa puhelimen kamerasovelluksen.</div>";
    }

    // Sanelu käynnistyy heti, ellei käyttäjä ole sitä kieltänyt.
    if (localStorage.getItem("ks_autosanelu") !== "0" && dict.mode === "speech") dict.start();

    S.cleanup = () => { dict.stop(); Camera.stop(); persist.flush(); };
  }

  window.Capture = { view };
})();
