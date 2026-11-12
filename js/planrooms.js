/* =========================================================================
   planrooms.js – tilojen tunnistus pohjakuvasta

   Tekstilähteet:
     1. PDF, jossa on tekstiä (CAD-tulosteet): tekstit sijainteineen suoraan
        PDF:stä (pdf.js). Nopea ja lähes virheetön, ei verkkoa.
     2. Kuva tai skannattu PDF: tekstintunnistus (Tesseract, suomi, harva
        teksti -tila). Hitaampi ja epävarmempi.
   Tulkinta (yhteinen):
     - tilalyhenteet sanastolla (KT -> Keittiö, MH -> Makuuhuone ...)
     - kokonaiset tilan nimet (TOIMISTO, KEITTIÖ ...), myös pienin
       tunnistusvirhein (KEITTIO, KElTTIÖ)
     - tilanumero (101, A12, K03) tunnukseksi, kun se on nimen vieressä
     - pinta-ala (12,5 m²) vahvistaa, että teksti on tilan nimi; tuntematon
       lyhenne pinta-alan vieressä ehdotetaan valitsemattomana
   Tutkija hyväksyy tuloksen aina. Korjatut lyhenteet opitaan (localStorage).
   ========================================================================= */
(function () {
  "use strict";

  /* ---------- Sanasto ---------- */
  const ABBR = {
    MH: "Makuuhuone", OH: "Olohuone", KT: "Keittiö", K: "Keittiö", KK: "Keittokomero", RT: "Ruokailutila",
    ET: "Eteinen", TK: "Tuulikaappi", KPH: "Kylpyhuone", PH: "Pesuhuone", PESUH: "Pesuhuone", S: "Sauna", LH: "Löylyhuone",
    WC: "WC", KHH: "Kodinhoitohuone", VH: "Vaatehuone", VAR: "Varasto", AT: "Autotalli", AK: "Autokatos",
    TEKN: "Tekninen tila", TEK: "Tekninen tila", LJH: "Lämmönjakohuone", LJ: "Lämmönjakohuone", PRH: "Porrashuone", PORR: "Porrashuone",
    SK: "Siivouskomero", SIIV: "Siivous", TH: "Työhuone", PKH: "Pukuhuone", PUKU: "Pukuhuone", KUIV: "Kuivaushuone", KUH: "Kuivaushuone",
    IVKH: "IV-konehuone", IVK: "IV-konehuone", PARV: "Parveke", TERASSI: "Terassi", ULL: "Ullakko", KELL: "Kellari", AULA: "Aula",
    KÄYT: "Käytävä", KAYT: "Käytävä", KHUONE: "Kerhohuone", NEUV: "Neuvotteluhuone", ARK: "Arkisto", SÄHKÖ: "Sähkötila", SAHKO: "Sähkötila"
  };
  // Yksikirjaimiset ja muut helposti sekaantuvat lyhenteet hyväksytään vain pinta-alan tai tilanumeron vierestä
  const WEAK = new Set(["K", "S", "LH", "TK", "AK", "LJ", "TH", "ARK", "ULL"]);
  const NAMES = [
    "Makuuhuone", "Olohuone", "Keittiö", "Keittokomero", "Ruokailutila", "Eteinen", "Tuulikaappi", "Kylpyhuone", "Pesuhuone", "Sauna",
    "Löylyhuone", "Kodinhoitohuone", "Vaatehuone", "Varasto", "Autotalli", "Autokatos", "Tekninen tila", "Lämmönjakohuone", "Porrashuone",
    "Siivouskomero", "Siivous", "Työhuone", "Pukuhuone", "Kuivaushuone", "IV-konehuone", "Konehuone", "Parveke", "Terassi", "Ullakko",
    "Kellari", "Aula", "Käytävä", "Kerhohuone", "Neuvotteluhuone", "Neuvottelu", "Arkisto", "Sähkötila", "Toimisto", "Taukotila",
    "Luokka", "Luokkahuone", "Opettajainhuone", "Ruokasali", "Liikuntasali", "Sali", "Odotustila", "Vastaanotto", "Henkilökunta",
    "Jätehuone", "Kylmiö", "Wc", "Inva-wc", "Suihku", "Askarteluhuone", "Väestönsuoja", "Hissi", "Kirjasto", "Lepohuone", "Tuotantotila", "Halli"
  ];

  const LEARN_KEY = "ks_tilasanasto";
  function learned() { try { return JSON.parse(localStorage.getItem(LEARN_KEY) || "{}"); } catch (e) { return {}; } }
  function learn(token, name) {
    if (!token || !name) return;
    const t = up(token);
    if (t.length > 8 || ABBR[t] === name) return;
    const m = learned(); m[t] = name;
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(m)); } catch (e) { /* ohita */ }
  }

  const strip = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const up = (s) => String(s || "").toUpperCase().replace(/[^\p{L}\p{N}-]/gu, "");
  const upPlain = (s) => strip(up(s)).replace(/-/g, "");

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  const NAME_KEYS = NAMES.map((n) => ({ n, k: upPlain(n) }));
  function matchName(token) {
    const k = upPlain(token);
    if (k.length < 4) return null;
    let best = null;
    NAME_KEYS.forEach((x) => {
      const tol = x.k.length >= 9 ? 2 : x.k.length >= 5 ? 1 : 0;
      const d = x.k === k ? 0 : lev(k, x.k);
      if (d <= tol && (!best || d < best.d)) best = { n: x.n, d };
    });
    return best ? best.n : null;
  }
  function matchAbbr(token) {
    const t = up(token);
    const L = learned();
    if (L[t]) return { nimi: L[t], abbr: t, weak: false };
    const p = upPlain(token);
    const hit = ABBR[t] || ABBR[p];
    return hit ? { nimi: hit, abbr: t, weak: WEAK.has(t) || WEAK.has(p) } : null;
  }

  const UNIT_RE = /^m(2|²|\?|z|:)?$/i;                       // tunnistus lukee m² usein "m?"
  const AREA_ONE_RE = /^\d{1,4}([,.]\d{1,2})?m(2|²|\?|z)$/i;
  /* Pinta-alat: "12,5 m²" voi olla yksi tai kaksi sanaa */
  function areaTokens(tokens) {
    const areas = [];
    tokens.forEach((t) => {
      const s = String(t.text || "").replace(/\s/g, "");
      if (AREA_ONE_RE.test(s)) areas.push(t);
      else if (/^\d{1,4}[,.]\d{1,2}$/.test(s)) {
        const n = tokens.find((u) => u !== t && UNIT_RE.test(String(u.text).trim()) && Math.abs(u.y - t.y) < t.h * 0.8 && u.x > t.x && u.x - t.x < t.h * 6);
        if (n) areas.push(t);
      }
    });
    return areas;
  }
  const ROOMNO_RE = /^([A-ZÅÄÖ]{1,2}-?\d{1,3}[A-Z]?|\d{3}[A-Z]?)$/;

  /* ---------- Tulkinta ----------
     tokens: [{ text, x, y, h, conf }] keskipiste normalisoituna (0..1), h = tekstin korkeus (0..1) */
  function interpret(tokens, source) {
    tokens = tokens.filter((t) => t.text && t.text.trim());
    const areas = areaTokens(tokens);
    const near = (a, b, k) => Math.abs(a.x - b.x) < Math.max(a.h, b.h) * (k * 1.6) && Math.abs(a.y - b.y) < Math.max(a.h, b.h) * k;
    const hasAreaNear = (t) => areas.some((a) => near(t, a, 2.8));
    const roomNoNear = (t) => {
      const c = tokens.filter((u) => u !== t && ROOMNO_RE.test(u.text.trim().toUpperCase()) && !areas.includes(u) && near(t, u, 2.2));
      c.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
      return c[0] || null;
    };

    // Kahden sanan nimet samalta riviltä ("TEKNINEN TILA")
    const used = new Set();
    const cands = [];
    tokens.forEach((t, i) => {
      if (used.has(t)) return;
      const nb = tokens.find((u) => u !== t && !used.has(u) && /\p{L}{2}/u.test(u.text) && (
        (Math.abs(u.y - t.y) < t.h * 0.6 && u.x > t.x && u.x - t.x < t.h * 8) ||               // samalla rivillä
        (Math.abs(u.x - t.x) < t.h * 3 && u.y > t.y && u.y - t.y < t.h * 1.9)));              // alla seuraavalla rivillä
      if (nb) {
        const two = matchName(t.text + nb.text);
        if (two && !matchName(t.text)) {
          used.add(t); used.add(nb);
          cands.push({ nimi: two, raaka: t.text + " " + nb.text, x: (t.x + nb.x) / 2, y: (t.y + nb.y) / 2, h: t.h, conf: Math.min(t.conf, nb.conf), tok: t, varma: true });
          return;
        }
      }
    });
    tokens.forEach((t) => {
      if (used.has(t)) return;
      const s = t.text.trim();
      if (!/\p{L}/u.test(s) || s.length > 24) return;
      const ab = matchAbbr(s);
      const area = hasAreaNear(t), rno = roomNoNear(t);
      if (ab) {
        if (ab.weak && !area && !rno) return;
        if (s.length <= 3 && s !== s.toUpperCase() && !area && !rno) return;   // pienet kirjaimet vain pinta-alan tai numeron vieressä
        cands.push({ nimi: ab.nimi, abbr: ab.abbr, raaka: s, x: t.x, y: t.y, h: t.h, conf: t.conf, tok: t, varma: true });
        return;
      }
      const nm = matchName(s);
      if (nm) { cands.push({ nimi: nm, raaka: s, x: t.x, y: t.y, h: t.h, conf: t.conf, tok: t, varma: true }); return; }
      // Tuntematon isokirjaiminen sana pinta-alan vieressä: ehdotus, ei valittuna
      if (area && /^[\p{Lu}][\p{Lu}-]{1,11}$/u.test(s) && !ROOMNO_RE.test(s) && !/^[IOLl1|]+$/.test(s) && !/^(KERROS|POHJA|ASUNTO|MITTAKAAVA)/.test(s)) {
        cands.push({ nimi: s.charAt(0) + s.slice(1).toLowerCase(), abbr: up(s), raaka: s, x: t.x, y: t.y, h: t.h, conf: t.conf, tok: t, varma: false, tuntematon: true });
      }
    });
    // Tilanumerot ja varmuus
    cands.forEach((c) => {
      const rno = roomNoNear(c.tok);
      if (rno) c.tunnus = rno.text.trim().toUpperCase();
      if (source === "ocr" && c.conf < 55 && !hasAreaNear(c.tok) && !rno) c.varma = false;
    });
    // Päällekkäiset (sama nimi lähes samassa kohdassa) pois
    const out = [];
    cands.forEach((c) => {
      if (out.some((o) => o.nimi === c.nimi && Math.hypot(o.x - c.x, o.y - c.y) < c.h * 3)) return;
      out.push(c);
    });
    // Samannimisille tunnukset: MH1, MH2 (jos tilanumeroa ei ole)
    const byName = {};
    out.forEach((c) => { (byName[c.nimi] = byName[c.nimi] || []).push(c); });
    Object.values(byName).forEach((list) => {
      if (list.length < 2) return;
      list.sort((a, b) => a.y - b.y || a.x - b.x);
      list.forEach((c, i) => { if (!c.tunnus) c.tunnus = (c.abbr || upPlain(c.nimi).slice(0, 3)) + (i + 1); });
    });
    return out.map((c) => ({ nimi: c.nimi, tunnus: c.tunnus || "", x: c.x, y: c.y, varma: c.varma !== false, tuntematon: !!c.tuntematon, raaka: c.raaka, abbr: c.abbr || "" }));
  }

  /* ---------- Lähde 1: PDF:n tekstit ---------- */
  /* page: pdf.js-sivu, vp: render-viewport. Palauttaa tokenit (normalisoituna kuvan kokoon). */
  async function pdfTokens(page, vp) {
    const tc = await page.getTextContent();
    const U = window.pdfjsLib.Util;
    const out = [];
    tc.items.forEach((it) => {
      const str = (it.str || "").trim();
      if (!str) return;
      const m = U.transform(vp.transform, it.transform);
      const fh = Math.hypot(m[2], m[3]) || Math.abs(m[3]) || 10;
      const w = (it.width || str.length * 0.55) * vp.scale;
      const rot = Math.atan2(m[1], m[0]);
      if (Math.abs(rot) > 0.35) return;            // pystysuuntaiset tekstit (mitat) pois
      const x0 = m[4], yBase = m[5];
      // Monen sanan rivi pilkotaan sanoiksi suhteellisesti
      const words = str.split(/\s+/);
      let pos = 0;
      words.forEach((wd) => {
        const i = str.indexOf(wd, pos); pos = i + wd.length;
        const cx = x0 + w * ((i + wd.length / 2) / Math.max(1, str.length));
        out.push({ text: wd, x: cx / vp.width, y: (yBase - fh * 0.35) / vp.height, h: fh / vp.height, conf: 100 });
      });
    });
    return out;
  }

  /* ---------- Lähde 2: tekstintunnistus ---------- */
  const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  let workerP = null;
  function worker(progress) {
    if (!workerP) {
      workerP = UI.loadScript(TESS).then(() => window.Tesseract.createWorker("fin", 1, {
        logger: (m) => { if (worker.onprogress && m && m.status) worker.onprogress(m); }
      })).then(async (w) => { await w.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" }); return w; })
        .catch((e) => { workerP = null; throw e; });
    }
    worker.onprogress = progress;
    return workerP;
  }

  async function ocrTokens(img, progress) {
    // Pienet tekstit vaativat resoluutiota: pidempi sivu noin 2400–3200 px
    const W0 = img.width, H0 = img.height;
    const sc = Math.min(2, Math.max(1, 2400 / Math.max(W0, H0)), 3200 / Math.max(W0, H0));
    const c = document.createElement("canvas");
    c.width = Math.round(W0 * sc); c.height = Math.round(H0 * sc);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    // Harmaasävy ja kontrasti (skannauksen kellertävä tausta pois)
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      let v = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
      v = v > 200 ? 255 : v < 60 ? 0 : (v - 60) * 255 / 140;
      a[i] = a[i + 1] = a[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
    const wk = await worker(progress);
    const r = await wk.recognize(c);
    const toks = (r.data.words || []).map((wd) => ({
      text: wd.text, conf: wd.confidence,
      x: (wd.bbox.x0 + wd.bbox.x1) / 2 / c.width, y: (wd.bbox.y0 + wd.bbox.y1) / 2 / c.height,
      h: Math.max(1, wd.bbox.y1 - wd.bbox.y0) / c.height
    })).filter((t) => t.conf > 20);

    /* Kohdennettu uudelleenluenta: jokainen pinta-ala kuuluu tilaan. Jos sen yläpuolelta ei
       löytynyt nimeä (harvan tekstin tila ohittaa lyhyitä sanoja, kuten KT tai S), alue luetaan
       uudelleen yhden rivin tilassa suurennettuna. */
    const areas = areaTokens(toks);
    const named = (a) => toks.some((t) => /\p{L}/u.test(t.text) && !UNIT_RE.test(t.text.trim()) &&
      Math.abs(t.x - a.x) < a.h * 5 && a.y - t.y > a.h * 0.4 && a.y - t.y < a.h * 3);
    const todo = areas.filter((a) => !named(a));
    if (todo.length) {
      await wk.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖabcdefghijklmnopqrstuvwxyzåäö-" });
      try {
        for (const a of todo) {
          const hp = a.h * c.height, cx = a.x * c.width, cy = a.y * c.height;
          const bw = hp * 9, top = cy - hp * 3.1, bh = hp * 2.4;
          const sc2 = Math.min(4, 90 / hp);
          const cc = document.createElement("canvas");
          cc.width = Math.round(bw * sc2) + 40; cc.height = Math.round(bh * sc2) + 40;
          const gg = cc.getContext("2d");
          gg.fillStyle = "#fff"; gg.fillRect(0, 0, cc.width, cc.height);
          gg.drawImage(c, cx - bw / 2, top, bw, bh, 20, 20, bw * sc2, bh * sc2);
          const rr = await wk.recognize(cc);
          const words = (rr.data.words || []).filter((w) => w.confidence > 40 && /\p{L}/u.test(w.text));
          if (!words.length) continue;
          const wbest = words.sort((x, y) => y.confidence - x.confidence)[0];
          toks.push({ text: wbest.text, conf: wbest.confidence, x: a.x, y: a.y - a.h * 1.4, h: a.h * 1.1, reread: true });
        }
      } finally {
        await wk.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "" });
      }
    }
    return toks;
  }

  /* Pääfunktio. opts: { pdfTokens (jos PDF:stä luettiin), image (Blob/ImageBitmap), progress(fn) } */
  async function detect(opts) {
    if (opts.pdfTokens && opts.pdfTokens.length) {
      const r = interpret(opts.pdfTokens, "pdf");
      if (r.length) return { lahde: "pdf", tilat: r };
    }
    let img = opts.image;
    if (img instanceof Blob) img = await createImageBitmap(img);
    const toks = await ocrTokens(img, opts.progress);
    return { lahde: "ocr", tilat: interpret(toks, "ocr") };
  }

  window.PlanRooms = { detect, interpret, pdfTokens, learn, matchAbbr, ABBR, _ocrTokens: ocrTokens };
})();
