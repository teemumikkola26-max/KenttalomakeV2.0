/* =========================================================================
   ui.js – yhteiset apuvälineet: kuvakkeet, escapointi, ikkunat, ilmoitukset
   ========================================================================= */
/* Sovelluksen versio: nosta yhdessä sw.js:n CACHE-version kanssa. */
window.APP_VERSION = "30";

(function () {
  "use strict";

  const P = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    cam: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    plan: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h9V3M12 12v9"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    ok: '<path d="M20 6L9 17l-5-5"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
  };

  function icon(name, extra) {
    return '<svg class="i' + (extra ? " " + extra : "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || "") + "</svg>";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let toastTimer = null;
  let toastAt = 0;
  /* Näkymän vaihtuessa vanha ilmoitus pois (ei peitä uuden näkymän painikkeita); juuri annettu ilmoitus jää */
  function hideToast(olderThan) {
    if (olderThan && Date.now() - toastAt < olderThan) return;
    const el = document.getElementById("toast"); if (el) el.classList.remove("on"); clearTimeout(toastTimer);
  }
  function toast(msg, ms) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    toastAt = Date.now();
    el.classList.add("on");
    el.classList.toggle("top", !!document.querySelector(".cam"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), ms || 2200);
  }

  /* Alhaalta nouseva ikkuna. bind(el, close) liittää tapahtumat.
     Puhelimen takaisin-ele sulkee ylimmän ikkunan (ei siirry edelliseen näkymään),
     ja näkymän vaihtuessa kaikki ikkunat suljetaan, jotta vanha ikkuna ei jää
     muuttamaan toisen näkymän tietoja. */
  const openSheets = [];
  let sheetSeq = 0, swallowPop = 0;
  function sheet(html, bind, opts) {
    opts = opts || {};
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(bg);
    const el = bg.firstChild;
    let closed = false;
    const id = ++sheetSeq, hashAtOpen = location.hash;
    try { history.pushState({ ksSheet: id }, ""); } catch (e) { /* ohita */ }
    const entry = { id, close: null };
    const close = (val, fromBack) => {
      if (closed) return;
      closed = true;
      bg.remove();
      const i = openSheets.indexOf(entry);
      if (i >= 0) openSheets.splice(i, 1);
      // Painikkeella suljettu: poistetaan ikkunan historiamerkintä, ellei näkymä vaihtunut samalla
      if (!fromBack) setTimeout(() => {
        if (location.hash === hashAtOpen && history.state && history.state.ksSheet === id) { swallowPop++; history.back(); }
      }, 0);
      if (opts.onClose) opts.onClose(val);
    };
    entry.close = close;
    openSheets.push(entry);
    bg.addEventListener("click", (e) => { if (e.target === bg && !opts.modal) close(null); });
    el.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => close(null)));
    if (bind) bind(el, close);
    const f = el.querySelector("[autofocus]");
    if (f) setTimeout(() => f.focus(), 50);
    return { el, close };
  }

  function closeAllSheets() { openSheets.slice().reverse().forEach((s) => s.close(null, true)); }
  // Rekisteröidään kaikkien skriptien jälkeen: kameraluvun oma takaisin-käsittely ehtii ensin.
  window.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("popstate", () => {
      if (swallowPop) { swallowPop--; return; }
      const top = openSheets[openSheets.length - 1];
      if (top) top.close(null, true);
    });
  });

  function confirmSheet(o) {
    return new Promise((resolve) => {
      sheet(
        "<h3>" + esc(o.title) + "</h3>" + (o.text ? "<p>" + esc(o.text) + "</p>" : "") +
        '<div class="row-btns">' +
        '<button type="button" class="btn ' + (o.danger ? "btn-dark" : "") + '" data-v="0">' + esc(o.cancel || "Peruuta") + "</button>" +
        '<button type="button" class="btn ' + (o.danger ? "btn-danger" : "btn-primary") + '" data-v="1">' + esc(o.ok || "OK") + "</button>" +
        "</div>",
        (el, close) => {
          el.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => close(b.dataset.v === "1")));
        },
        { onClose: (v) => resolve(v === true) }
      );
    });
  }

  function promptSheet(o) {
    return new Promise((resolve) => {
      sheet(
        "<h3>" + esc(o.title) + "</h3>" + (o.text ? "<p>" + esc(o.text) + "</p>" : "") +
        '<label class="field"><span>' + esc(o.label || "") + "</span>" +
        (o.multiline
          ? '<textarea autofocus data-in>' + esc(o.value || "") + "</textarea>"
          : '<input type="text" autofocus data-in value="' + esc(o.value || "") + '">') +
        "</label>" +
        '<div class="row-btns"><button type="button" class="btn" data-close>Peruuta</button>' +
        '<button type="button" class="btn btn-primary" data-ok>' + esc(o.ok || "Tallenna") + "</button></div>",
        (el, close) => {
          const inp = el.querySelector("[data-in]");
          const ok = () => {
            const v = inp.value.trim();
            if (o.required && !v) { inp.focus(); toast("Kenttä on pakollinen"); return; }
            close(v);
          };
          el.querySelector("[data-ok]").addEventListener("click", ok);
          if (!o.multiline) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
        },
        { onClose: (v) => resolve(typeof v === "string" ? v : null) }
      );
    });
  }

  function pickFile(accept, multiple, capture) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = accept;
      if (multiple) inp.multiple = true;
      if (capture) inp.setAttribute("capture", capture);
      inp.style.display = "none";
      document.body.appendChild(inp);
      inp.addEventListener("change", () => { resolve(Array.from(inp.files || [])); inp.remove(); });
      inp.click();
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement("script");
      s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error("Kirjaston lataus epäonnistui: " + src));
      document.head.appendChild(s);
    });
  }

  function debounce(fn, ms) {
    let t = null;
    const d = function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
    d.flush = () => { if (t) { clearTimeout(t); t = null; return fn(); } };
    d.cancel = () => { clearTimeout(t); t = null; };
    return d;
  }

  function pvm(ts) {
    const d = ts ? new Date(ts) : new Date();
    return d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear();
  }

  /* Vierittää vaakasuuntaisen sirulistan niin, että valittu siru näkyy (ei vieritä sivua). */
  function showSelected(container) {
    if (!container) return;
    const sel = container.querySelector('[aria-pressed="true"]');
    if (sel) container.scrollLeft = Math.max(0, sel.offsetLeft - container.offsetLeft - 16);
  }

  /* Näyttö pysyy päällä kuvauksen ja kameraluvun ajan (Wake Lock API, jos tuettu). */
  function keepAwake() {
    let lock = null, alive = true;
    const req = async () => {
      try { if (alive && "wakeLock" in navigator && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen"); }
      catch (e) { /* ei tuettu tai estetty */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", onVis);
    req();
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); try { if (lock) lock.release(); } catch (e) { /* ohita */ } };
  }

  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ohita */ } }

  /* Tekstintunnistuksen tiedostot sovelluksen omasta lib-kansiosta (ei CDN:stä) */
  function tessPaths() {
    const base = new URL("lib/", location.href).href;
    return { workerPath: base + "tesseract/worker.min.js", corePath: base + "tesseract/", langPath: base + "tessdata", gzip: true, workerBlobURL: false };
  }
  /* Havainnon tunnus kentällä: H05 tai pilvikohteessa tutkijan sarja TM-05 (raportille numeroidaan uudelleen) */
  function nro(n) {
    if (n && typeof n === "object") return n.sarja ? n.sarja + "-" + String(n.nro || "?").padStart(2, "0") : "H" + String(n.nro || "?").padStart(2, "0");
    return "H" + String(n).padStart(2, "0");
  }
  const nroLyhyt = (h) => (h.sarja ? h.sarja : "") + (h.nro || "");

  window.UI = { tessPaths, icon, esc, toast, hideToast, closeAllSheets, sheet, confirmSheet, promptSheet, pickFile, loadScript, debounce, pvm, nro, nroLyhyt, showSelected, keepAwake, buzz };
})();
