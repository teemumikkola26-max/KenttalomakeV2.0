/* =========================================================================
   zoom.js – pohjapiirroksen zoomaus ja siirto

   - kahden sormen nipistys zoomaa, yhden sormen veto siirtää (zoomattuna)
   - kaksoisnapautus zoomaa kohtaan / palauttaa koko kuvan
   - painikkeet: +, −, koko kuva, koko näyttö
   - hiiren rulla zoomaa (tietokone)
   Merkit pysyvät samankokoisina zoomatessa, joten tiheäkin pohja aukeaa.
   Napautus (merkki, kohdan valinta) toimii normaalisti; veto ei laukaise napautusta.
   Tila (zoomaus, kohta, koko näyttö) säilyy näkymän päivittyessä.
   ========================================================================= */
(function () {
  "use strict";
  const { icon } = UI;
  const MAXZ = 10;
  const saved = new Map();

  function attach(wrap, key, opts) {
    if (!wrap) return null;
    opts = opts || {};
    let inner = wrap.querySelector(":scope > .zinner");
    if (!inner) {
      inner = document.createElement("div");
      inner.className = "zinner";
      while (wrap.firstChild) inner.appendChild(wrap.firstChild);
      wrap.appendChild(inner);
    }
    wrap.classList.add("zoomable");
    const img = inner.querySelector("img");
    const st = Object.assign({ z: 1, x: 0, y: 0, full: false }, saved.get(key) || {});
    if (!opts.fullscreen) st.full = false;

    const ctr = document.createElement("div");
    ctr.className = "zctl";
    ctr.innerHTML =
      '<button type="button" data-z="in" aria-label="Lähennä">+</button>' +
      '<button type="button" data-z="out" aria-label="Loitonna">−</button>' +
      '<button type="button" data-z="fit" aria-label="Koko kuva">' + icon("image") + "</button>" +
      (opts.fullscreen ? '<button type="button" data-z="full" aria-label="Koko näyttö">' + icon("expand") + "</button>" : "");
    wrap.appendChild(ctr);

    const size = () => {
      const r = wrap.getBoundingClientRect();
      return { ww: wrap.clientWidth, wh: wrap.clientHeight, bw: inner.offsetWidth, bh: inner.offsetHeight, ox: inner.offsetLeft, oy: inner.offsetTop, left: r.left + wrap.clientLeft, top: r.top + wrap.clientTop };
    };
    function clamp() {
      const s = size();
      st.z = Math.max(1, Math.min(MAXZ, st.z));
      const fit = (pos, base, view, off) => {
        const len = base * st.z;
        if (len <= view) return (view - len) / 2 - off;
        return Math.min(-off, Math.max(view - len - off, pos));
      };
      st.x = fit(st.x, s.bw, s.ww, s.ox);
      st.y = fit(st.y, s.bh, s.wh, s.oy);
    }
    function apply() {
      clamp();
      inner.style.transform = "translate(" + st.x + "px," + st.y + "px) scale(" + st.z + ")";
      wrap.style.setProperty("--z", st.z);
      wrap.classList.toggle("zoomed", st.z > 1.01);
      wrap.classList.toggle("zfull", !!st.full);
      document.body.classList.toggle("zfull-open", !!st.full && document.body.contains(wrap));
      const fb = ctr.querySelector('[data-z="full"]');
      if (fb) { fb.innerHTML = icon(st.full ? "close" : "expand"); fb.setAttribute("aria-label", st.full ? "Sulje koko näyttö" : "Koko näyttö"); }
      saved.set(key, { z: st.z, x: st.x, y: st.y, full: st.full });
    }
    // Zoomaus pisteeseen (px, py ikkunan koordinaateissa)
    function zoomAt(z2, cx, cy) {
      const s = size();
      const px = cx - s.left, py = cy - s.top;
      z2 = Math.max(1, Math.min(MAXZ, z2));
      st.x = px - s.ox - (px - s.ox - st.x) * (z2 / st.z);
      st.y = py - s.oy - (py - s.oy - st.y) * (z2 / st.z);
      st.z = z2;
      apply();
    }
    const center = () => { const r = wrap.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

    ctr.addEventListener("click", (e) => {
      const b = e.target.closest("[data-z]");
      if (!b) return;
      e.stopPropagation(); e.preventDefault();
      const a = b.dataset.z, c = center();
      if (a === "in") zoomAt(st.z * 1.8, c[0], c[1]);
      else if (a === "out") zoomAt(st.z / 1.8, c[0], c[1]);
      else if (a === "fit") { st.z = 1; st.x = 0; st.y = 0; apply(); }
      else if (a === "full") { st.full = !st.full; st.z = 1; st.x = 0; st.y = 0; requestAnimationFrame(apply); apply(); }
    });

    // Kosketus ja hiiri (pointer events)
    const pts = new Map();
    let start = null, moved = false, suppressUntil = 0;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    wrap.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".zctl")) return;
      if (!pts.size) suppressUntil = 0;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y }; moved = false; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        start = { pinch: true, d: dist(a, b), z: st.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, sx: st.x, sy: st.y };
        moved = true;
      }
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (start.pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const s = size();
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const z2 = Math.max(1, Math.min(MAXZ, start.z * dist(a, b) / start.d));
        const px = start.mx - s.left, py = start.my - s.top;
        st.x = px - s.ox - (px - s.ox - start.sx) * (z2 / start.z) + (mx - start.mx);
        st.y = py - s.oy - (py - s.oy - start.sy) * (z2 / start.z) + (my - start.my);
        st.z = z2;
        apply();
        e.preventDefault();
      } else if (!start.pinch && pts.size === 1) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) > 8) moved = true;
        if (moved && st.z > 1.01) { st.x = start.sx + dx; st.y = start.sy + dy; apply(); e.preventDefault(); }
      }
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      if (moved) suppressUntil = Date.now() + 400;
      if (pts.size === 1 && start && start.pinch) {          // toinen sormi jäi: jatketaan siirtona
        const p = [...pts.values()][0];
        start = { x: p.x, y: p.y, sx: st.x, sy: st.y };
      } else if (!pts.size) start = null;
    };
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
    // Veto tai nipistys ei ole napautus
    wrap.addEventListener("click", (e) => {
      if (Date.now() < suppressUntil && !e.target.closest(".zctl")) { suppressUntil = 0; e.stopPropagation(); e.preventDefault(); }
    }, true);
    wrap.addEventListener("dblclick", (e) => {
      if (e.target.closest(".zctl,.pin")) return;
      e.preventDefault();
      if (st.z > 1.5) { st.z = 1; st.x = 0; st.y = 0; apply(); }
      else zoomAt(3, e.clientX, e.clientY);
    });
    wrap.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && st.z <= 1.01 && e.deltaY > 0) return;   // ei estetä sivun vieritystä koko kuvassa
      e.preventDefault();
      zoomAt(st.z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    }, { passive: false });

    if (img && !img.complete) img.addEventListener("load", apply, { once: true });
    apply();
    return { reset: () => { st.z = 1; st.x = 0; st.y = 0; st.full = false; apply(); }, state: st };
  }

  window.Zoom = { attach };
})();
