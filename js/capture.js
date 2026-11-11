/* =========================================================================
   capture.js – Kuva + sanelu -näkymä
   Havainnon voi kirjoittaa tai sanella (Sanele-painike). Menetelmä
   valitaan jo kuvatessa. Jokainen kuva ja teksti tallentuu samaan
   havaintoon heti, joten mitään ei menetetä, vaikka sovellus suljettaisiin.
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
      if (h.menetelma) applyMemory(h);
    }
    let saved = !isNew;

    function methodChips() {
      const list = M.MENETELMAT.filter((m) => !m.piilotettu || m.id === h.menetelma);
      return list.map((m) => '<button class="chip" data-m="' + esc(m.id) + '" aria-pressed="' + (m.id === h.menetelma) + '">' + esc(m.nimi) + "</button>").join("");
    }

    document.getElementById("app").innerHTML =
      '<div class="cam">' +
      '<div class="cam-top">' +
      '<button class="cam-round" data-c="close" aria-label="Sulje">' + icon("close") + "</button>" +
      '<button class="loc-chip" data-c="loc">' + icon("pin") + '<span class="txt" data-loc></span><span class="ch">vaihda</span></button>' +
      "</div>" +
      '<div class="viewfinder"><video autoplay playsinline muted></video><div class="flash"></div>' +
      '<div class="vf-msg" data-vfmsg>Käynnistetään kameraa…</div>' +
      '<span class="vf-count" data-count></span><div class="vf-thumbs" data-thumbs></div></div>' +
      '<div class="cam-methods"><span class="cam-lbl" data-mlbl>Menetelmä</span><div class="chips scroll" data-methods>' + methodChips() + "</div></div>" +
      '<div class="dict">' +
      '<div class="dict-h off" data-dh><span class="rec"></span><span data-dstate>Havainto</span></div>' +
      '<textarea data-text aria-label="Havainto" placeholder="Kirjoita havainto tai paina Sanele">' + esc(h.sanelu) + "</textarea>" +
      '<div class="interim" data-interim aria-live="polite"></div>' +
      "</div>" +
      '<div class="cam-bottom">' +
      '<button class="cam-side" data-c="done"><span class="c">' + icon("ok") + "</span>Valmis</button>" +
      '<button class="shutter" data-c="shot" aria-label="Ota kuva"><span></span></button>' +
      '<button class="cam-side" data-c="mic"><span class="c" data-micic>' + icon("mic") + '</span><span data-miclbl>Sanele</span></button>' +
      "</div></div>";

    const root = document.querySelector(".cam");
    const video = root.querySelector("video");
    const $ = (s) => root.querySelector(s);
    const ta = $("[data-text]");

    function applyMemory(hv) {
      M.menetelma(hv.menetelma).kentat.forEach((f) => {
        const mem = S.kohde.muisti[hv.menetelma + "." + f.k];
        if (f.muista && mem && !hv.kentat[f.k]) hv.kentat[f.k] = mem;
      });
    }

    function paintLoc() {
      const t = Model.sijaintiTeksti(h.sijainti);
      $("[data-loc]").textContent = t || "Valitse sijainti";
      $(".loc-chip").classList.toggle("missing", !h.sijainti.tilaId);
    }
    function paintMethodLabel() {
      $("[data-mlbl]").classList.toggle("missing", !h.menetelma);
      $("[data-mlbl]").textContent = h.menetelma ? "Menetelmä" : "Valitse menetelmä";
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
      $("[data-dstate]").textContent = on ? (state === "recording" ? "Äänitetään" : "Sanelu käynnissä") : (msg || "Havainto");
      root.querySelector('[data-c="mic"]').classList.toggle("mic-on", on);
      $("[data-micic]").innerHTML = on ? icon("stop") : icon("mic");
      $("[data-miclbl]").textContent = on ? "Lopeta" : "Sanele";
      if (!on) $("[data-interim]").textContent = "";
    }

    const hasContent = () => h.kuvat.length || h.sanelu.trim() || (h.aanitteet || []).length;
    const persist = UI.debounce(async () => {
      if (!hasContent()) return;
      await Model.saveHavainto(h);
      saved = true;
    }, 500);

    const dict = new Dictation({
      onFinal: (t) => {
        if (!t) return;
        let cur = ta.value.replace(/\s+$/, "");
        if (cur && !/[.!?]$/.test(cur)) cur += ".";
        let add = t.charAt(0).toUpperCase() + t.slice(1);
        if (!/[.!?]$/.test(add)) add += ".";
        ta.value = (cur ? cur + " " : "") + add;
        h.sanelu = ta.value;
        $("[data-interim]").textContent = "";
        ta.scrollTop = ta.scrollHeight;
        persist();
      },
      onInterim: (t) => { $("[data-interim]").textContent = t; },
      onState: (st, msg) => { paintMic(st, st === "error" ? null : msg); if (st === "error" && msg) toast(msg, 4000); },
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
      h.sanelu = ta.value;
      persist.flush();
      await new Promise((r) => setTimeout(r, dict.mode === "audio" ? 400 : 0));
      if (hasContent()) {
        await Model.saveHavainto(h);
        S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa };
        await Model.saveKohde();
        saved = true;
      }
      if (toCard && saved) location.hash = "#/k/" + k.id + "/h/" + h.id;
      else location.hash = "#/k/" + k.id;
    }

    ta.addEventListener("input", () => { h.sanelu = ta.value; persist(); });

    root.addEventListener("click", async (e) => {
      const mb = e.target.closest("[data-m]");
      if (mb) {
        const id = mb.dataset.m;
        if (h.menetelma === id) return;
        h.menetelma = id;
        h.vahvistettu = false;
        applyMemory(h);
        const cur = Model.kohta(h.suunnitelmaId);
        if (cur && cur.menetelma !== id) h.suunnitelmaId = null;
        root.querySelectorAll("[data-m]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === id)));
        paintMethodLabel();
        if (saved) persist();
        return;
      }
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

    paintLoc(); paintMethodLabel(); paintThumbs(); paintMic("stopped");
    UI.showSelected(root.querySelector("[data-methods]"));

    try {
      await Camera.start(video);
      $("[data-vfmsg]").classList.add("hidden");
    } catch (e) {
      $("[data-vfmsg]").innerHTML = "<div>Selaimen kameraa ei saatu käyttöön.<br>Laukaisin avaa puhelimen kamerasovelluksen.</div>";
    }

    S.cleanup = () => { dict.stop(); Camera.stop(); h.sanelu = ta.value; persist.flush(); };
  }

  window.Capture = { view };
})();
