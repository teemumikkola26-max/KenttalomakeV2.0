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
    KÄYT: "Käytävä", KAYT: "Käytävä", KHUONE: "Kerhohuone", NEUV: "Neuvotteluhuone", ARK: "Arkisto", SÄHKÖ: "Sähkötila", SAHKO: "Sähkötila",
    R: "Ruokailutila", RT: "Ruokailutila", OH: "Olohuone", MHH: "Makuuhuone", VAR: "Varasto", KH: "Kylpyhuone", PS: "Pesuhuone", SH: "Saunatilat"
  };
  // Yksikirjaimiset ja muut helposti sekaantuvat lyhenteet hyväksytään vain pinta-alan tai tilanumeron vierestä
  const WEAK = new Set(["K", "S", "R", "LH", "TK", "AK", "LJ", "TH", "ARK", "ULL", "KH", "PS", "SH"]);
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

  /* Tekstintunnistuksen tyypilliset sekaannukset pienissä lyhenteissä:
     CH/0H -> OH, NH2/WH2 -> MH2, IK -> TK, MHz -> MH2, MHl -> MH1.
     Palauttaa korjatun tekstin vain, jos tulos on tunnettu lyhenne. */
  const SWAP = { "0": "O", C: "O", Q: "O", D: "O", G: "O", N: "M", W: "M", I: "T", L: "T", U: "V", Y: "V", "8": "B" };
  const SWAP_NUM = Object.assign({}, SWAP, { U: "M", V: "M", H: "M" });   // numeroitu tunnus on yleensä MH1/MH2
  function fixAbbr(token) {
    let t = String(token || "").replace(/[^\p{L}\p{N}]/gu, "");
    if (!t || t.length > 5) return null;
    // Loppunumero: MHl, MH|, MHI -> MH1; MHz -> MH2
    let m = t.match(/^(\p{L}{2,4}?)([0-9lI|!zZ])$/u);
    let pre = t.toUpperCase(), suf = "";
    if (m && !ABBR[t.toUpperCase()]) { pre = m[1].toUpperCase(); suf = { l: "1", I: "1", "|": "1", "!": "1", z: "2", Z: "2" }[m[2]] || m[2]; }
    const ok = (x) => ABBR[x] && !(x.length === 1 && !suf);
    if (ok(pre)) return pre + suf !== t.toUpperCase() ? pre + suf : null;
    for (let i = 0; i < pre.length; i++) {
      const r = (suf ? SWAP_NUM : SWAP)[pre[i]];
      if (!r) continue;
      const c = pre.slice(0, i) + r + pre.slice(i + 1);
      if (ok(c)) return c + suf;
    }
    return null;
  }
  // Lyhenne ja numero: MH1 -> { abbr: MH, tunnus: MH1 }
  function splitNumbered(token) {
    const m = up(token).match(/^(\p{Lu}{1,5})(\d{1,2})$/u);
    return m && ABBR[m[1]] ? { abbr: m[1], tunnus: m[1] + m[2] } : null;
  }
  // Asuntotyyppi: 3H+K, 2H+KK, 1H+KT (OCR: 3H3K, 3HK)
  const APT_RE = /^(\d)\s?H\s?[+3t]?\s?(KK|KT|K|TK)\b/i;
  // Tunnistuksen sotkema asuntomerkintä pinta-aloineen: 3H4K73,0M2, 34K730M2
  const APT_LOOSE = /^[\dM]?[\dH]?[H+43]{0,2}K{1,2}T?\d{2,3}([,.]\d)?M?(2|²)?$/;
  const isAptText = (s) => APT_RE.test(String(s).trim()) || APT_LOOSE.test(String(s).toUpperCase().replace(/\s/g, ""));

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
  function interpret(tokens, source, opts) {
    tokens = tokens.filter((t) => t.text && t.text.trim());
    const areas = areaTokens(tokens);
    const near = (a, b, k) => Math.abs(a.x - b.x) < Math.max(a.h, b.h) * (k * 1.6) && Math.abs(a.y - b.y) < Math.max(a.h, b.h) * k;
    const isApt = (t) => isAptText(t.text);
    const hasAreaNear = (t) => areas.some((a) => near(t, a, 2.8) && !tokens.some((u) => isApt(u) && near(u, a, 1.2)));
    const roomNoNear = (t) => {
      const c = tokens.filter((u) => u !== t && ROOMNO_RE.test(u.text.trim().toUpperCase()) && !splitNumbered(u.text) && !areas.includes(u) && near(t, u, 2.2));
      c.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
      return c[0] || null;
    };

    // Kahden sanan nimet samalta riviltä ("TEKNINEN TILA")
    const used = new Set();
    const cands = [];
    tokens.forEach((t) => {
      if (used.has(t)) return;
      const nb = tokens.find((u) => u !== t && !used.has(u) && /\p{L}{2}/u.test(u.text) && (
        (Math.abs(u.y - t.y) < t.h * 0.6 && u.x > t.x && u.x - t.x < t.h * 8) ||               // samalla rivillä
        (Math.abs(u.x - t.x) < t.h * 3 && u.y > t.y && u.y - t.y < t.h * 1.9)));              // alla seuraavalla rivillä
      if (nb) {
        const two = matchName(t.text + nb.text);
        if (two && !matchName(t.text)) {
          used.add(t); used.add(nb);
          cands.push({ nimi: two, raaka: t.text + " " + nb.text, x: (t.x + nb.x) / 2, y: (t.y + nb.y) / 2, h: t.h, conf: Math.min(t.conf, nb.conf), tok: t, varma: true,
            px: t.px != null ? (t.px + nb.px) / 2 : undefined, py: t.py != null ? (t.py + nb.py) / 2 : undefined });
        }
      }
    });
    const weakLater = [];
    tokens.forEach((t) => {
      if (used.has(t) || isApt(t)) return;
      const s = t.text.trim();
      if (!/\p{L}/u.test(s) || s.length > 24) return;
      const area = hasAreaNear(t), rno = roomNoNear(t);
      let ab = matchAbbr(s), num = splitNumbered(s), fixed = null;
      if (!ab && !num && source === "ocr") {
        fixed = fixAbbr(s);
        if (fixed) { num = splitNumbered(fixed); ab = num ? null : matchAbbr(fixed); }
      }
      if (num) { ab = { nimi: ABBR[num.abbr], abbr: num.abbr, weak: false }; }
      if (ab) {
        const c = { nimi: ab.nimi, abbr: ab.abbr, raaka: s, x: t.x, y: t.y, h: t.h, conf: t.conf, tok: t, varma: true, korjattu: !!fixed, numero: num && num.tunnus, px: t.px, py: t.py };
        if (ab.weak && !area && !rno) { weakLater.push(c); return; }
        if (s.length <= 3 && s !== s.toUpperCase() && !area && !rno && !fixed) return;   // pienet kirjaimet vain pinta-alan tai numeron vieressä
        cands.push(c);
        return;
      }
      const nm = matchName(s);
      if (nm) { cands.push({ nimi: nm, raaka: s, x: t.x, y: t.y, h: t.h, conf: t.conf, tok: t, varma: true, px: t.px, py: t.py }); return; }
      // Tuntematon isokirjaiminen sana pinta-alan vieressä: ehdotus, ei valittuna
      if (area && /^[\p{Lu}][\p{Lu}-]{1,11}$/u.test(s) && !ROOMNO_RE.test(s) && !/^[IOLl1|]+$/.test(s) && !/^(KERROS|POHJA|ASUNTO|MITTAKAAVA)/.test(s)) {
        cands.push({ nimi: s.charAt(0) + s.slice(1).toLowerCase(), abbr: up(s), raaka: s, x: t.x, y: t.y, h: t.h, conf: t.conf, tok: t, varma: false, tuntematon: true, px: t.px, py: t.py });
      }
    });
    /* Lyhyet lyhenteet (K, R, TK) ilman pinta-alaa hyväksytään, kun pohjakuvassa on muuten
       selvästi tilalyhenteitä (vähintään 4 varmaa). Ne ovat silloin tilojen merkintöjä. */
    const strong = cands.filter((c) => c.abbr && !c.korjattu).length;
    if (strong >= 4) {
      // vain muiden tilojen alueelta (ei reunojen mittoja tai nimiöruutua)
      const st = cands.filter((c) => c.abbr && !c.korjattu);
      const bx = { x0: Math.min.apply(null, st.map((c) => c.x)), x1: Math.max.apply(null, st.map((c) => c.x)), y0: Math.min.apply(null, st.map((c) => c.y)), y1: Math.max.apply(null, st.map((c) => c.y)) };
      const mx = (bx.x1 - bx.x0) * 0.08, my = (bx.y1 - bx.y0) * 0.08;
      weakLater.forEach((c) => {
        if (c.x < bx.x0 - mx || c.x > bx.x1 + mx || c.y < bx.y0 - my || c.y > bx.y1 + my) return;
        if (c.raaka === c.raaka.toUpperCase() && c.raaka.replace(/[^\p{L}]/gu, "").length <= 3 && (source !== "ocr" || c.conf >= 55)) cands.push(c);
      });
    }
    // Korjattu lukema on varma vain, jos sama lyhenne löytyy pohjasta myös suoraan luettuna
    const seen = new Set(cands.filter((c) => !c.korjattu).map((c) => c.abbr));
    cands.forEach((c) => { if (c.korjattu && !seen.has(c.abbr)) c.varma = false; });
    // Tilanumerot ja varmuus
    cands.forEach((c) => {
      const rno = c.numero ? null : roomNoNear(c.tok);
      if (c.numero) c.tunnus = c.numero;
      else if (rno) c.tunnus = rno.text.trim().toUpperCase();
      if (source === "ocr" && c.conf < 45 && !hasAreaNear(c.tok) && !rno && !c.korjattu) c.varma = false;
    });

    /* Asunnot: jos pohjassa on useita asuntotyyppimerkintöjä (3H+K), tilat ryhmitellään
       lähimmän merkinnän mukaan rivin suunnassa, ja tunnukseen tulee asunnon numero. */
    let apts = tokens.filter(isApt);
    if (apts.length >= 2) {
      const sx = Math.max.apply(null, apts.map((a) => a.x)) - Math.min.apply(null, apts.map((a) => a.x));
      const sy = Math.max.apply(null, apts.map((a) => a.y)) - Math.min.apply(null, apts.map((a) => a.y));
      const ax = sx >= sy ? "x" : "y", ay = ax === "x" ? "y" : "x";
      let ord = apts.slice().sort((a, b) => a[ax] - b[ax]);
      // Sama merkintä kahdesti (esim. tyyppi ja pinta-ala erikseen): yhdistetään
      const gaps0 = ord.slice(1).map((a, i) => a[ax] - ord[i][ax]).sort((p, q) => p - q);
      const med0 = gaps0[Math.floor(gaps0.length / 2)];
      ord = ord.filter((a, i) => i === 0 || a[ax] - ord[i - 1][ax] > med0 * 0.35);
      const gaps = ord.slice(1).map((a, i) => a[ax] - ord[i][ax]).sort((p, q) => p - q);
      const step = gaps.length ? gaps[Math.floor(gaps.length / 2)] : med0;
      // Puuttuva merkintä (ei luettu): asunnot ovat tasavälein, joten väliin lisätään asunto
      const full = [];
      ord.forEach((a, i) => {
        if (i) { const prev = ord[i - 1], n = Math.round((a[ax] - prev[ax]) / step);
          for (let k = 1; k < n; k++) full.push({ [ax]: prev[ax] + (a[ax] - prev[ax]) * k / n, [ay]: prev[ay] + (a[ay] - prev[ay]) * k / n, text: "", h: a.h, virtual: true }); }
        full.push(a);
      });
      // Ja päihin, jos tiloja on selvästi viimeisen merkinnän ulkopuolella
      const lo = Math.min.apply(null, cands.map((c) => c[ax])), hi = Math.max.apply(null, cands.map((c) => c[ax]));
      while (full[0][ax] - lo > step * 0.8) full.unshift({ [ax]: full[0][ax] - step, [ay]: full[0][ay], text: "", h: full[0].h, virtual: true });
      while (hi - full[full.length - 1][ax] > step * 0.8) { const l = full[full.length - 1]; full.push({ [ax]: l[ax] + step, [ay]: l[ay], text: "", h: l.h, virtual: true }); }
      ord = full;
      // Asunnon numero: lyhyt numero merkinnän vieressä (esim. kehystetty 03)
      ord.forEach((a, i) => {
        const no = !a.virtual && tokens.find((u) => /^\D?\d{1,3}\D?$/.test(u.text.trim()) && !isApt(u) && near(a, u, 2.5));
        a._as = "As" + (no ? String(parseInt(no.text.replace(/\D/g, ""), 10)) : String(i + 1));
      });
      const ids = ord.map((a) => a._as);
      if (new Set(ids).size !== ids.length) ord.forEach((a, i) => { a._as = "As" + (i + 1); });
      /* Asunnon rajat: merkintä ei ole asunnon keskellä. Rajoja siirretään niin, että
         samannimisiä tiloja (kaksi OH:ta, kaksi MH1:tä) osuu samaan asuntoon mahdollisimman vähän. */
      const key = (c) => c.numero || c.abbr || c.nimi;
      const assign = (delta) => cands.map((c) => {
        let bi = 0;
        for (let i = 1; i < ord.length; i++) if (c[ax] >= (ord[i - 1][ax] + ord[i][ax]) / 2 + delta * step) bi = i;
        return bi;
      });
      // Kustannus: kaksoiskappaleet + saman tilan sijainnin vaihtelu suhteessa asunnon merkintään
      let bestD = 0, bestCost = Infinity;
      for (let d = -0.5; d <= 0.501; d += 0.05) {
        const as = assign(d), seen = new Set(), offs = {}; let cost = 0;
        cands.forEach((c, i) => {
          const k = as[i] + "|" + key(c); if (seen.has(k)) cost++; seen.add(k);
          (offs[key(c)] = offs[key(c)] || []).push(c[ax] - ord[as[i]][ax]);
        });
        Object.values(offs).forEach((o) => {
          if (o.length < 2) return;
          const m = o.slice().sort((p, q) => p - q)[Math.floor(o.length / 2)];
          o.forEach((v) => { cost += Math.min(1, Math.abs(v - m) / (step * 0.3)); });
        });
        if (cost < bestCost - 1e-9 || (cost === bestCost && Math.abs(d) < Math.abs(bestD))) { bestCost = cost; bestD = d; }
      }
      const as = assign(bestD);
      cands.forEach((c, i) => {
        const b = ord[as[i]];
        c._apt = as[i]; c.asunto = b._as;
        const mt = (b.text || "").trim().match(APT_RE);
        c.asuntoTyyppi = mt ? mt[0].replace(/\s/g, "").replace(/^(\d)H[3t]?/i, "$1H+").replace("++", "+").toUpperCase() : "";
      });
      /* Toistuva pohja: samanlaisissa asunnoissa sama tila on samassa kohdassa suhteessa
         asunnon merkintään. Kohdat ryhmitellään, ja kunkin kohdan enemmistö ratkaisee:
           - väärin luettu tunnus korjataan enemmistön mukaiseksi (VH luettu MH:ksi)
           - asunnosta puuttuva tila lisätään, jos kohdassa on tekstiä, jota ei saatu luettua */
      if (ord.length >= 3) {
        const asp = (opts && opts.aspect) || 1.4;              // kehyksen leveys / korkeus
        /* Asunnon kiintopiste: merkinnän keskikohta vaihtelee sen mukaan, miten teksti luettiin,
           joten kiintopiste hienosäädetään varmojen tilojen avulla (sama tila = sama siirtymä). */
        const anc = ord.map((a) => ({ x: a.x, y: a.y }));
        const med = (arr) => { const q = arr.slice().sort((u, v) => u - v); return q.length ? q[Math.floor(q.length / 2)] : 0; };
        const solid = cands.filter((c) => !c.korjattu);
        for (let it = 0; it < 3; it++) {
          const ref = {};
          solid.forEach((c) => { (ref[key(c)] = ref[key(c)] || { x: [], y: [] }); ref[key(c)].x.push(c.x - anc[c._apt].x); ref[key(c)].y.push(c.y - anc[c._apt].y); });
          Object.keys(ref).forEach((k) => { ref[k] = ref[k].x.length >= 2 ? { x: med(ref[k].x), y: med(ref[k].y) } : null; });
          anc.forEach((A, ai) => {
            const mine = solid.filter((c) => c._apt === ai && ref[key(c)]);
            if (!mine.length) return;
            A.x += med(mine.map((c) => c.x - A.x - ref[key(c)].x));
            A.y += med(mine.map((c) => c.y - A.y - ref[key(c)].y));
          });
        }
        ord.forEach((a, i) => { a.x = anc[i].x; a.y = anc[i].y; });
        const off = (c) => ({ dx: (c.x - ord[c._apt].x) * asp, dy: c.y - ord[c._apt].y });
        const clusters = [];
        cands.forEach((c) => {
          const o = off(c), tol = c.h * 2.6;
          let cl = clusters.find((k) => Math.abs(k.dx - o.dx) < tol && Math.abs(k.dy - o.dy) < tol);
          if (!cl) clusters.push(cl = { dx: o.dx, dy: o.dy, m: [] });
          cl.m.push(c);
          cl.dx = cl.m.reduce((s2, x) => s2 + off(x).dx, 0) / cl.m.length; cl.dy = cl.m.reduce((s2, x) => s2 + off(x).dy, 0) / cl.m.length;
        });
        const boxes = (opts && opts.boxes) || [], usedBox = new Set();
        clusters.forEach((cl) => {
          const cnt = {};
          cl.m.forEach((c) => { cnt[key(c)] = (cnt[key(c)] || 0) + (c.korjattu ? 0.6 : 1); });
          const top = Object.keys(cnt).sort((p2, q) => cnt[q] - cnt[p2])[0];
          const second = Object.keys(cnt).map((k) => cnt[k]).sort((p2, q) => q - p2)[1] || 0;
          if (cnt[top] < 1.5 || cnt[top] <= second) return;
          const model = cl.m.find((c) => key(c) === top && !c.korjattu) || cl.m.find((c) => key(c) === top);
          cl.m.forEach((c) => {
            if (key(c) === top) return;
            if (cnt[top] < 2) return;
            Object.assign(c, { nimi: model.nimi, abbr: model.abbr, numero: model.numero, tunnus: model.numero || c.tunnus, pohjasta: true, varma: cnt[top] >= 3 || c.varma });
            if (!model.numero && c.numero) { c.numero = null; c.tunnus = ""; }
          });
          // Puuttuvat asunnot
          const have = new Set(cl.m.map((c) => c._apt)), added = [];
          ord.forEach((A, ai) => {
            if (have.has(ai)) return;
            const tx = A.x + cl.dx / asp, ty = A.y + cl.dy;
            const bx = boxes.filter((b) => !usedBox.has(b) && Math.abs(b.x - tx) * asp < model.h * 2.6 && Math.abs(b.y - ty) < model.h * 2.6)
              .sort((p2, q) => Math.hypot(p2.x - tx, p2.y - ty) - Math.hypot(q.x - tx, q.y - ty))[0];
            if (!bx) return;
            usedBox.add(bx);
            const nc = { nimi: model.nimi, abbr: model.abbr, numero: model.numero, raaka: bx.text || "", x: bx.x, y: bx.y, h: bx.h, conf: 50, tok: bx,
              varma: cnt[top] >= 2.5, paatelty: true, px: bx.px, py: bx.py, _apt: ai, asunto: A._as, asuntoTyyppi: model.asuntoTyyppi };
            cands.push(nc); added.push(nc);
          });
          // Sama tila samassa kohdassa vähintään kolmessa asunnossa: kaikki ovat varmoja
          if (cnt[top] + added.length >= 3) cl.m.concat(added).forEach((c) => { if (key(c) === top) c.varma = true; });
          cl.m.concat(added).forEach((c) => { c._cls = cl.m.length + added.length; });
        });
      }
    }
    cands.forEach((c) => { if ((c.paatelty || c.pohjasta) && c.numero) c.tunnus = c.numero; });
    // Sama tila kahdesti samassa asunnossa: säilytetään se, joka on samassa kohdassa kuin muissa asunnoissa
    if (cands.some((c) => c._cls)) {
      const grp = {};
      cands.forEach((c) => { const k = c._apt + "|" + (c.numero || c.abbr || c.nimi); (grp[k] = grp[k] || []).push(c); });
      Object.values(grp).forEach((list) => {
        if (list.length < 2 || list.some((c) => !c.numero && /^(MH|VAR|K)$/.test(c.abbr || "") === false && false)) return;
        list.sort((a, b) => (b._cls || 0) - (a._cls || 0));
        if ((list[0]._cls || 0) >= 3) list.slice(1).filter((c) => (c._cls || 0) < 2).forEach((c) => cands.splice(cands.indexOf(c), 1));
      });
    }
    // Irralliset osumat (esim. nimiöruudun kirjain) pois, kun tiloja on paljon
    if (cands.length >= 10) {
      const nn = cands.map((c) => Math.min.apply(null, cands.filter((d) => d !== c).map((d) => Math.hypot(d.x - c.x, d.y - c.y))));
      const mnn = nn.slice().sort((u, v) => u - v)[Math.floor(nn.length / 2)];
      for (let i = cands.length - 1; i >= 0; i--) if (nn[i] > mnn * 5) cands.splice(i, 1);
    }
    // Päällekkäiset (sama nimi lähes samassa kohdassa) pois
    const out = [];
    cands.forEach((c) => {
      if (out.some((o) => o.nimi === c.nimi && Math.hypot(o.x - c.x, o.y - c.y) < c.h * 3)) return;
      out.push(c);
    });
    // Samannimisille tunnukset: MH1, MH2 (jos tilanumeroa ei ole), asunnoittain
    const byName = {};
    out.forEach((c) => { const k = (c.asunto || "") + "|" + c.nimi; (byName[k] = byName[k] || []).push(c); });
    Object.values(byName).forEach((list) => {
      if (list.length < 2) return;
      list.sort((a, b) => a.y - b.y || a.x - b.x);
      list.forEach((c, i) => { if (!c.tunnus) c.tunnus = (c.abbr || upPlain(c.nimi).slice(0, 3)) + (i + 1); });
    });
    out.forEach((c) => { if (c.asunto) c.tunnus = c.asunto + " " + (c.tunnus || c.abbr || ""); c.tunnus = (c.tunnus || "").trim(); });
    return out.map((c) => ({
      nimi: c.nimi, tunnus: c.tunnus || "", x: c.px != null ? c.px : c.x, y: c.py != null ? c.py : c.y,
      varma: c.varma !== false, tuntematon: !!c.tuntematon, raaka: c.raaka, abbr: c.abbr || "",
      asunto: c.asunto || "", asuntoTyyppi: c.asuntoTyyppi || "", korjattu: !!c.korjattu, paatelty: !!c.paatelty, pohjasta: !!c.pohjasta
    }));
  }

  /* ---------- Lähde 1: PDF:n tekstit ---------- */
  /* page: pdf.js-sivu, vp: render-viewport. Palauttaa tokenit (normalisoituna kuvan kokoon). */
  async function pdfTokens(page, vp) {
    const tc = await page.getTextContent();
    const U = window.pdfjsLib.Util;
    const items = [];
    tc.items.forEach((it) => {
      const str = (it.str || "").trim();
      if (!str) return;
      const m = U.transform(vp.transform, it.transform);
      const fh = Math.hypot(m[2], m[3]) || Math.abs(m[3]) || 10;
      const w = (it.width || str.length * 0.55) * vp.scale;
      const ang = Math.atan2(m[1], m[0]);
      const q = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;        // 0 vaaka, 3 ylöspäin, 1 alaspäin, 2 ylösalaisin
      if (Math.abs(ang - Math.round(ang / (Math.PI / 2)) * Math.PI / 2) > 0.35) return;   // vinot tekstit pois
      items.push({ str, m, fh, w, q, d: { x: Math.cos(ang), y: Math.sin(ang) } });
    });
    // Piirustuksen lukusuunta: yleisin tekstin suunta (koko piirustus voi olla kierretty)
    const cnt = [0, 0, 0, 0];
    items.forEach((t) => { if (/\p{L}{2}/u.test(t.str)) cnt[t.q]++; });
    const q = cnt.indexOf(Math.max.apply(null, cnt));
    const rot = [0, 270, 180, 90][q];
    const fwd = (px, py) => rot === 90 ? { x: 1 - py, y: px } : rot === 180 ? { x: 1 - px, y: 1 - py } : rot === 270 ? { x: py, y: 1 - px } : { x: px, y: py };
    const fH = rot % 180 ? vp.width : vp.height;
    const out = [];
    items.filter((t) => t.q === q).forEach((t) => {
      // Monen sanan rivi pilkotaan sanoiksi suhteellisesti
      const words = t.str.split(/\s+/);
      let pos = 0;
      words.forEach((wd) => {
        const i = t.str.indexOf(wd, pos); pos = i + wd.length;
        const a = t.w * ((i + wd.length / 2) / Math.max(1, t.str.length));
        const cx = t.m[4] + t.d.x * a + t.d.y * t.fh * 0.35, cy = t.m[5] + t.d.y * a - t.d.x * t.fh * 0.35;
        const px = cx / vp.width, py = cy / vp.height, f = fwd(px, py);
        out.push({ text: wd, x: f.x, y: f.y, h: t.fh / fH, conf: 100, px, py });
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


  /* ---------- Lähde 3: valokuva tai heikko skannaus ----------
     Koko sivun tekstintunnistus ei löydä pieniä tilatunnuksia viivojen seasta.
     Siksi ensin etsitään kuvasta tekstin näköiset kohdat (merkin kokoiset
     tummat alueet rivissä), ne leikataan irti, suurennetaan ja kootaan
     arkille allekkain, ja arkki luetaan kerralla. Toimii kuvan valaistuksesta
     ja koosta riippumatta, ja kiertosuunta (0/90/180/270) päätellään itse. */

  // Harmaasävy kuvasta, pidempi sivu enintään maxSide
  function grayOf(img, maxSide) {
    const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
    const W = Math.round(img.width * sc), H = Math.round(img.height * sc);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) | 0;
    return { g: out, W, H };
  }
  // Kierto myötäpäivään rot astetta (0/90/180/270)
  function rotGray(G, rot) {
    if (!rot) return G;
    const { g, W, H } = G, sw = rot % 180 !== 0;
    const W2 = sw ? H : W, H2 = sw ? W : H, o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let X, Y;
      if (rot === 90) { X = H - 1 - y; Y = x; } else if (rot === 180) { X = W - 1 - x; Y = H - 1 - y; } else { X = y; Y = W - 1 - x; }
      o[Y * W2 + X] = g[y * W + x];
    }
    return { g: o, W: W2, H: H2 };
  }
  // Kierretyn kehyksen piste (normalisoitu) -> alkuperäisen kuvan piste
  function unrot(x, y, rot) {
    if (rot === 90) return { x: y, y: 1 - x };
    if (rot === 180) return { x: 1 - x, y: 1 - y };
    if (rot === 270) return { x: 1 - y, y: x };
    return { x, y };
  }

  // Tekstin näköiset kohdat: [{x,y,w,h,n}] kuvan pikseleinä
  function textBoxes(G) {
    const { g, W, H } = G, N = W * H;
    // Paikallinen keskiarvo (integraalikuva): varjot ja epätasainen valo eivät haittaa
    const r = Math.max(15, Math.round(Math.max(W, H) / 80));
    const ii = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y * W + x]; ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + row; } }
    const ink = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const m = (ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        ink[y * W + x] = g[y * W + x] < m * 0.8 ? 1 : 0;
      }
    }
    // Yhtenäiset alueet (union-find, 8-naapuruus)
    const lab = new Int32Array(N), par = [0];
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!ink[i]) continue;
      const nb = [];
      if (x > 0 && lab[i - 1]) nb.push(lab[i - 1]);
      if (y > 0) { if (lab[i - W]) nb.push(lab[i - W]); if (x > 0 && lab[i - W - 1]) nb.push(lab[i - W - 1]); if (x < W - 1 && lab[i - W + 1]) nb.push(lab[i - W + 1]); }
      if (!nb.length) { lab[i] = par.length; par.push(par.length); continue; }
      let m = find(nb[0]);
      for (let k = 1; k < nb.length; k++) { const b = find(nb[k]); if (b !== m) { if (b < m) { par[m] = b; m = b; } else par[b] = m; } }
      lab[i] = m;
    }
    const box = new Map();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const l = lab[y * W + x]; if (!l) continue;
      const k = find(l); let b = box.get(k);
      if (!b) box.set(k, b = { x0: x, y0: y, x1: x, y1: y, a: 0 });
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; b.a++;
    }
    const comps = [];
    box.forEach((b) => { const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; comps.push({ x: b.x0, y: b.y0, w, h, a: b.a }); });
    // Tyypillinen merkin korkeus (yleisin korkeus kirjaimen muotoisista alueista)
    const hist = new Array(201).fill(0);
    comps.forEach((c) => { if (c.h >= 5 && c.h <= 200 && c.w <= c.h * 1.6 && c.w >= c.h * 0.15 && c.a <= c.w * c.h * 0.8) hist[c.h]++; });
    let hc = 0, best = 0;
    for (let h = 5; h <= 200; h++) { const v = hist[h - 1] * 0.5 + hist[h] + hist[h + 1] * 0.5; if (v > best) { best = v; hc = h; } }
    if (!hc) return { hc: 0, words: [] };
    const hmin = Math.max(4, hc * 0.55), hmax = Math.min(H / 12, hc * 4);
    const ch = comps.filter((c) => c.h >= hmin && c.h <= hmax && c.w <= c.h * 2.2 && c.a <= c.w * c.h * 0.85 && c.a >= c.w * c.h * 0.08)
      .sort((a, b) => a.x - b.x);
    // Merkit sanoiksi: sama rivi, samankokoiset, väli alle merkin korkeuden
    const used = new Uint8Array(ch.length), words = [];
    for (let i = 0; i < ch.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const wd = { x0: ch[i].x, y0: ch[i].y, x1: ch[i].x + ch[i].w, y1: ch[i].y + ch[i].h, h: ch[i].h, n: 1 };
      for (let j = i + 1; j < ch.length; j++) {
        const d = ch[j];
        if (d.x - wd.x1 > wd.h * 1.1) break;
        if (used[j]) continue;
        const ov = Math.min(wd.y1, d.y + d.h) - Math.max(wd.y0, d.y);
        const ratio = Math.max(d.h, wd.h) / Math.min(d.h, wd.h);
        if (ov >= 0.5 * Math.min(wd.y1 - wd.y0, d.h) && ratio < 1.8) {
          used[j] = 1; wd.n++;
          wd.x1 = Math.max(wd.x1, d.x + d.w); wd.y0 = Math.min(wd.y0, d.y); wd.y1 = Math.max(wd.y1, d.y + d.h); wd.h = Math.max(wd.h, d.h);
        }
      }
      const w = { x: wd.x0, y: wd.y0, w: wd.x1 - wd.x0, h: wd.y1 - wd.y0, n: wd.n };
      if (w.h <= wd.h * 1.6 && w.w <= w.h * 25) words.push(w);
    }
    return { hc, words };
  }

  // Sanat leikataan, suurennetaan noin 48 px korkuisiksi ja kootaan arkeiksi
  function sheets(G, words, flip, perSheet, th) {
    const out = [];
    for (let s = 0; s < words.length; s += perSheet) {
      const part = words.slice(s, s + perSheet);
      const crops = part.map((w) => {
        const pad = Math.round(w.h * 0.6), sc = 48 / w.h;
        const x0 = Math.max(0, w.x - pad), y0 = Math.max(0, w.y - pad), x1 = Math.min(G.W, w.x + w.w + pad), y1 = Math.min(G.H, w.y + w.h + pad);
        return { x0, y0, cw: x1 - x0, ch: y1 - y0, sc };
      });
      const RH = Math.ceil(Math.max.apply(null, crops.map((c) => c.ch * c.sc))) + 36;
      const SW = Math.min(4000, Math.ceil(Math.max.apply(null, crops.map((c) => c.cw * c.sc))) + 60);
      const c = document.createElement("canvas"); c.width = SW; c.height = RH * crops.length;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      crops.forEach((cr, i) => {
        // Leike: kontrasti venytetään, jotta harmaa tausta muuttuu valkoiseksi
        const tmp = document.createElement("canvas"); tmp.width = cr.cw; tmp.height = cr.ch;
        const tg = tmp.getContext("2d"), id = tg.createImageData(cr.cw, cr.ch);
        const vals = [];
        for (let y = 0; y < cr.ch; y++) for (let x = 0; x < cr.cw; x++) vals.push(G.g[(cr.y0 + y) * G.W + cr.x0 + x]);
        const sorted = vals.slice().sort((a, b) => a - b);
        const lo = sorted[Math.floor(sorted.length * 0.04)], hi = sorted[Math.floor(sorted.length * 0.9)];
        // th: kynnys (0..1) mustavalkoiseksi; pienellä kynnyksellä paksut, sumeat viivat ohenevat
        vals.forEach((v, k) => {
          const t = th ? (v < lo + th * (hi - lo) ? 0 : 255) : Math.max(0, Math.min(255, (v - lo) * 255 / Math.max(20, hi - lo)));
          id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = t; id.data[k * 4 + 3] = 255;
        });
        tg.putImageData(id, 0, 0);
        const dw = cr.cw * cr.sc, dh = cr.ch * cr.sc;
        g.save();
        g.translate(30 + dw / 2, i * RH + 18 + dh / 2);
        if (flip) g.rotate(Math.PI);
        g.imageSmoothingQuality = "high";
        g.drawImage(tmp, -dw / 2, -dh / 2, dw, dh);
        g.restore();
      });
      out.push({ canvas: c, RH, words: part });
    }
    return out;
  }

  async function readSheet(wk, sh) {
    const r = await wk.recognize(sh.canvas);
    const rows = sh.words.map(() => ({ t: [], c: [] }));
    (r.data.lines || []).forEach((l) => {
      const i = Math.floor(((l.bbox.y0 + l.bbox.y1) / 2) / sh.RH);
      const txt = (l.text || "").trim();
      if (rows[i] && txt) { rows[i].t.push(txt); rows[i].c.push(l.confidence); }
    });
    return rows.map((r) => ({ text: r.t.join(" "), conf: r.c.length ? Math.min.apply(null, r.c) : 0 }));
  }

  // Luettu teksti sanaston muotoon (MH1, OH, Keittiö) tai null
  function canon(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    if (splitNumbered(t)) return up(t);
    if (ABBR[up(t)]) return up(t);
    const f = fixAbbr(t);
    if (f) return f;
    const n = matchName(t);
    if (n) return n.toUpperCase();
    if (isAptText(t) || AREA_ONE_RE.test(t.replace(/\s/g, ""))) return t;
    return null;
  }
  const hits = (rows) => rows.filter((r) => canon(r.text)).length;
  async function readAll(wk, G, words, flip, th, onSheet) {
    const sh = sheets(G, words, flip, 50, th);
    let rows = [];
    for (let i = 0; i < sh.length; i++) { rows = rows.concat(await readSheet(wk, sh[i])); if (onSheet) onSheet((i + 1) / sh.length); }
    return rows;
  }

  async function photoTokens(img, progress) {
    const G0 = grayOf(img, 3200);
    const tick = (p) => progress && progress({ status: "recognizing text", progress: p });
    tick(0.02);
    // Tekstin suunta: vaaka- vai pystyrivit (enemmän monimerkkisiä sanoja)
    const tb0 = textBoxes(G0);
    const G90 = rotGray(G0, 90), tb90 = textBoxes(G90);
    const score = (tb) => tb.words.filter((w) => w.n >= 2).length;
    let base = score(tb90) > score(tb0) * 1.15 ? 90 : 0;
    let G = base ? G90 : G0, words = (base ? tb90 : tb0).words;
    if (!words.length) return { tokens: [], rot: 0 };
    tick(0.1);
    // Lukuvarmuus kasvaa, kun samaan kohtaan liittyvät sanat luetaan peräkkäin
    words.sort((a, b) => (Math.round(a.y / 40) - Math.round(b.y / 40)) || a.x - b.x);
    if (words.length > 600) words = words.slice(0, 600);
    const wk = await worker();
    await wk.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ0123456789+-,.m" });
    try {
      const PER = 50, TH = 0.5;
      // Oikein päin vai ylösalaisin: luetaan ensimmäinen arkki molemmin päin
      const first = words.slice(0, PER);
      const ra = await readAll(wk, G, first, false, TH); tick(0.18);
      const rb = await readAll(wk, G, first, true, TH); tick(0.26);
      const flip = hits(rb) > hits(ra);
      const rot = (base + (flip ? 180 : 0)) % 360;
      let rows = (flip ? rb : ra).concat(words.length > PER ? await readAll(wk, G, words.slice(PER), flip, TH, (p) => tick(0.26 + 0.3 * p)) : []);
      /* Lyhyet sanat, joita ei tunnistettu, luetaan uudelleen kolmella eri kuvankäsittelyllä
         ja tulokset äänestetään (pienet ja sumeat tunnukset: MH1 luetaan helposti WH1 tai M). */
      const redo = [];
      words.forEach((w, i) => { if (w.n <= 6 && !canon(rows[i] && rows[i].text)) redo.push(i); });
      if (redo.length) {
        const ws = redo.map((i) => words[i]);
        const variants = [];
        const ths = [null, 0.35, 0.65];
        for (let v = 0; v < ths.length; v++) variants.push(await readAll(wk, G, ws, flip, ths[v], (p) => tick(0.56 + 0.44 * (v + p) / ths.length)));
        redo.forEach((wi, k) => {
          const reads = [rows[wi]].concat(variants.map((vr) => vr[k])).filter((r) => r && r.text);
          const votes = {};
          reads.forEach((r) => { const c = canon(r.text); if (c) { votes[c] = votes[c] || { n: 0, conf: 0 }; votes[c].n++; votes[c].conf += r.conf; } });
          const bestK = Object.keys(votes).sort((a, b) => votes[b].n - votes[a].n || votes[b].conf - votes[a].conf)[0];
          if (bestK) rows[wi] = { text: bestK, conf: votes[bestK].n >= 2 ? Math.max(60, votes[bestK].conf / votes[bestK].n) : votes[bestK].conf, vote: votes[bestK].n };
        });
      }
      // Kehys: lukusuunnassa oleva kuva (ylösalaisin luettaessa koordinaatit käännetään)
      const tokens = [], boxes = [];
      words.forEach((w, i) => {
        const r = rows[i];
        let fx = (w.x + w.w / 2) / G.W, fy = (w.y + w.h / 2) / G.H;
        if (flip) { fx = 1 - fx; fy = 1 - fy; }
        const o = unrot(fx, fy, rot);
        const t = { text: r && r.text || "", conf: r ? r.conf : 0, x: fx, y: fy, h: w.h / G.H, px: o.x, py: o.y };
        if (t.text && canon(t.text)) tokens.push(t);
        else { if (t.text) tokens.push(t); if (w.n >= 1 && w.n <= 4) boxes.push(t); }
      });
      return { tokens, boxes, rot, aspect: G.W / G.H };
    } finally {
      await wk.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "" });
    }
  }

  /* Pääfunktio. opts: { pdfTokens (jos PDF:stä luettiin), image (Blob/ImageBitmap), progress(fn) } */
  async function detect(opts) {
    if (opts.pdfTokens && opts.pdfTokens.length) {
      const r = interpret(opts.pdfTokens, "pdf");
      if (r.length) return { lahde: "pdf", tilat: r };
    }
    let img = opts.image;
    if (img instanceof Blob) img = await createImageBitmap(img, { imageOrientation: "from-image" });
    // 1) Tekstikohtien haku ja luku (valokuvat, pienet tunnukset, kierretyt kuvat)
    const ph = await photoTokens(img, opts.progress);
    let best = { lahde: "ocr", tilat: interpret(ph.tokens, "ocr", { boxes: ph.boxes, aspect: ph.aspect }), kierto: ph.rot };
    // 2) Koko sivun luku (siistit skannaukset, joissa nimet ovat isoja). Tulokset yhdistetään:
    //    toisen lukutavan löytämä tila lisätään, ja puuttuva tilanumero täydennetään.
    if (best.tilat.length < 20 && !ph.rot) {
      const toks = await ocrTokens(img, opts.progress);
      const r = interpret(toks, "ocr");
      const same = (a, b) => a.nimi === b.nimi && Math.hypot(a.x - b.x, a.y - b.y) < 0.04;
      r.forEach((t) => {
        const m = best.tilat.find((b) => same(b, t));
        if (m) { if (!m.tunnus && t.tunnus) m.tunnus = t.tunnus; if (t.varma) m.varma = true; }
        else if (t.varma || !best.tilat.length) best.tilat.push(t);
      });
    }
    return best;
  }

  window.PlanRooms = { detect, interpret, pdfTokens, learn, matchAbbr, ABBR, _ocrTokens: ocrTokens, _photoTokens: photoTokens, _textBoxes: textBoxes, _grayOf: grayOf, _rotGray: rotGray, _sheets: sheets };
})();
