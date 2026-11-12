/* =========================================================================
   planimport.js – tutkimussuunnitelma tarjouksen / suunnitelman PDF:stä

   Tutkija valitsee PDF:n (tutkimussuunnitelma ja tarjous). Sovellus lukee
   tekstin laitteella (pdf.js, ei verkkopalvelua) ja ehdottaa:
     - kohteen tiedot: nimi, osoite, projektinumero (vain tyhjiin kenttiin)
     - suunnitelman kohdat: menetelmä, määrä ja tarkennus
   Ehdotukset tarkistetaan ennen lisäämistä (valinta, menetelmä, määrä).

   Tulkinta:
     - Osio alkaa otsikosta "Tutkimusten sisältö", "Esitämme … tehtäväksi",
       "Tarjous sisältää" tai "Sisältö", ja päättyy otsikkoon "Näytteenotto-
       välineet", "Tulosten toimitus", "Lähtöaineisto", "Kustannus" ym.
     - Luettelomerkityt rivit (•, o, -) ovat kohtia; sisennetyt alakohdat
       tarkentavat kohtaa (paikat, määrät). Alakohdan näytteet ovat oma kohta.
     - Ilman luetteloa teksti luetaan virkkeittäin.
     - Määrä: "4 kpl", "3–4 tilaa" (pienempi luku), alakohtien summa tai
       luettelon pituus (esim. paine-eromittauksen mittausvälit). "1 kpl / avaus"
       kerrotaan avausten määrällä.
     - "Optio" ja "tarvittaessa" / "mikäli" merkitään; optiot eivät ole oletuksena valittuina.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet } = UI;

  const PDFJS = "lib/pdf.min.js";
  const PDFJS_WORKER = "lib/pdf.worker.min.js";

  // Suunnitelmien ja tarjousten sanamuodot (sanelun sanojen lisäksi). Muokattavissa Sanasto-sivulla.
  Vocab.define("suunnitelma", { group: "Tutkimussuunnitelma (PDF)", title: "Suunnitelman sanat", type: "map",
    defaults: [
      ["kuntotarkastu", "aisti"], ["yleistarkastu", "aisti"], ["aistinvarai", "aisti"], ["silmämääräi", "aisti"],
      ["katselmu", "aisti"], ["kuntoarvi", "kuntoarvio"], ["pts-ehdotu", "kuntoarvio"], ["pitkän tähtäimen", "kuntoarvio"], ["märkätilakartoitu", "mtk"], ["märkätilojen kuntokartoitu", "mtk"], ["märkätilojen kartoitu", "mtk"], ["märkätilatarkast", "mtk"],
      ["olosuhdeseuran", "seuranta"], ["olosuhdemittau", "seuranta"], ["seurantamittau", "seuranta"], ["pitkäaikaisseuran", "seuranta"], ["olosuhteiden seuran", "seuranta"],
      ["pölyn koostum", "nayte"], ["koostumusnäyt", "nayte"], ["voc", "nayte"], ["mikrobinäyt", "nayte"], ["materiaalinäyt", "nayte"], ["asbestikartoitu", "nayte"], ["haitta-ainekartoitu", "nayte"],
      ["porareikätutkimu", "rh"], ["rakennekosteusmittau", "rh"],
      ["ilmanvaihdon toimivuu", "paine"], ["ilmavirtamittau", "paine"], ["painesuhdemittau", "paine"]
    ],
    help: "sana = menetelmä (tunnus tai nimi, esim. aisti, rh, pintakosteus, avaus, nayte, merkkiaine, lampokuvaus, paine, seuranta). Näillä ja menetelmien omilla tunnistussanoilla tarjouksen tai suunnitelman kohdat muutetaan suunnitelman kohdiksi." });

  const START = /^(tutkimusten sisältö|tutkimuksen sisältö|esitämme .{0,60}tehtäväksi|tarjous sisältää|sisältö(?![\p{L}])|tutkimusmenetelmät|suoritettavat tutkimukset)/iu;
  const END = /^(näytteenottovälineet|tulosten toimitus|lähtöaineisto|tilaajan vastuut|kustannu|hinta(?![\p{L}])|hinnat(?![\p{L}])|aikataulu|sopimusehdot|voimassaolo|vastuulauseke|laskutu)/iu;
  const BULLET = /^[•◦▪●○■□·\-–—✓§o]\s*$/;
  const BULLET_LEAD = /^([•◦▪●○■□·✓§]|o(?=\s)|[-–—](?=\s))\s*/;
  const POINTS = { seuranta: 1, nayte: 1, rh: 1, avaus: 1, merkkiaine: 1, pintakosteus: 1 };

  /* ---------- PDF -> rivit ---------- */
  async function pdfLines(file) {
    await UI.loadScript(PDFJS);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    const lines = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 30); p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const rows = [];
      tc.items.forEach((it) => {
        const s = it.str;
        if (!s || !s.trim()) return;
        const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || 10;
        let r = rows.find((q) => Math.abs(q.y - y) < Math.max(2, h * 0.35));
        if (!r) { r = { y, items: [] }; rows.push(r); }
        r.items.push({ s, x, w: it.width || 0 });
      });
      rows.sort((a, b) => b.y - a.y);
      rows.forEach((r) => {
        r.items.sort((a, b) => a.x - b.x);
        let bullet = false, x0 = r.items[0].x;
        let items = r.items;
        if (BULLET.test(items[0].s.trim()) && items.length > 1) { bullet = true; items = items.slice(1); x0 = items[0].x; }
        let text = "";
        items.forEach((it, i) => {
          const prev = items[i - 1];
          const gap = prev ? it.x - (prev.x + prev.w) : 0;
          text += (i && (gap > 1.5 || /\s$/.test(prev.s)) ? " " : "") + it.s;
        });
        text = text.replace(/\s+/g, " ").trim();
        if (!bullet && BULLET_LEAD.test(text) && text.replace(BULLET_LEAD, "").length > 2) { bullet = true; text = text.replace(BULLET_LEAD, ""); }
        lines.push({ text, x: x0, bx: r.items[0].x, page: p, bullet });
      });
    }
    return lines;
  }

  /* pdftotext -layout -tyyppinen teksti riveiksi (testit ja liitetty teksti) */
  function textLines(txt) {
    const out = [];
    String(txt).split(/\f/).forEach((pg, pi) => pg.split("\n").forEach((l) => {
      if (!l.trim()) return;
      const ind = l.match(/^\s*/)[0].length;
      let t = l.trim(), bullet = false;
      if (BULLET_LEAD.test(t) && t.replace(BULLET_LEAD, "").length > 2) { bullet = true; t = t.replace(BULLET_LEAD, ""); }
      const x = bullet ? ind + 4 : ind;
      out.push({ text: t.replace(/\s{2,}/g, " "), x: x * 5, bx: ind * 5, page: pi + 1, bullet });
    }));
    return out;
  }

  /* ---------- Apuneuvot ---------- */
  const norm = (s) => Auto._detect.norm(s);
  function methodId(v) {
    v = String(v || "").trim().toLowerCase();
    const m = M.MENETELMAT.find((x) => x.id.toLowerCase() === v) || M.MENETELMAT.find((x) => x.nimi.toLowerCase() === v || (x.lyhyt || "").toLowerCase() === v);
    return m ? m.id : null;
  }
  /* Kaikki menetelmät tekstissä esiintymisjärjestyksessä */
  function methodsIn(text) {
    const t = norm(text), re = Auto._detect.stemRe;
    const hits = new Map();
    const hit = (id, w) => {
      if (!id || !w || !w.trim()) return;
      const m = M.menetelma(id);
      if (!m || m.id !== id || (m.piilotettu && !m.seuranta && !m.kohdetaso)) return;
      const i = t.search(re(norm(w).trim()));
      if (i >= 0 && (!hits.has(id) || hits.get(id) > i)) hits.set(id, i);
    };
    Vocab.list("suunnitelma").forEach(([w, v]) => hit(methodId(v), w));
    M.MENETELMAT.forEach((m) => { if (!m.seuranta && !m.kohdetaso) Auto.methodWords(m).forEach((w) => hit(m.id, w)); });
    return Array.from(hits.entries()).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }
  const UNIT = "(?:kpl|kappaletta|tilaa|tila|tilasta|tiloista|pistettä|mittauspistettä|kohtaa|kohdasta|huoneisto\\p{L}*|asunto\\p{L}*|näytettä|avausta|reikää|porareikää|mittausta|mittausväliä)";
  const NUM_RE = new RegExp("(\\d+)(?:\\s*[–-]\\s*(\\d+))?\\s*" + UNIT + "(?![\\p{L}])", "iu");
  function countIn(text) {
    const m = String(text).match(NUM_RE);
    if (!m) return null;
    return { n: parseInt(m[1], 10), max: m[2] ? parseInt(m[2], 10) : null, per: new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(\\/|per)\\s*\\p{L}+", "iu").test(text) };
  }
  const conditional = (t) => /(^|[^\p{L}])(tarvittaessa(?! luod)|mikäli|tarpeen mukaan|harkinnan mukaan|havaintojen perusteella)(?![\p{L}])/iu.test(t);
  const clean = (t) => String(t).replace(/\s+/g, " ").replace(/^[,;:.\s]+|[,;:\s]+$/g, "").trim();
  const short = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t);

  /* Kohteen tiedot ("Kohde:", "Osoite:", "Projektinumero:") */
  function kohdeTiedot(lines) {
    const o = {};
    const get = (re) => { for (const l of lines) { const m = l.text.match(re); if (m && m[1].trim()) return clean(m[1]); } return ""; };
    o.nimi = get(/^kohde\s*:?\s+(.+)$/i);
    o.osoite = get(/^osoite\s*:?\s+(.+)$/i);
    o.projektinro = get(/^projektinumero\s*:?\s*([\w-]+)/i);
    if (o.nimi && !o.osoite) { const m = o.nimi.match(/^(.*?),\s*([^,]+)$/); if (m && /^[A-ZÅÄÖ][a-zåäö]+$/.test(m[2])) o.paikkakunta = m[2]; }
    return o;
  }

  /* ---------- Rivit -> suunnitelman kohdat ---------- */
  function parse(lines) {
    // Ylä- ja alatunnisteet: sama rivi usealla sivulla, sivunumerot
    const pages = new Map();
    lines.forEach((l) => { const k = norm(l.text); if (!pages.has(k)) pages.set(k, new Set()); pages.get(k).add(l.page); });
    const nPages = Math.max(1, ...lines.map((l) => l.page));
    const rep = Math.max(2, Math.ceil(nPages / 2));
    lines = lines.filter((l) => !(nPages > 1 && pages.get(norm(l.text)).size >= rep && !l.bullet) && !/^\d+\s*\/\s*\d+$/.test(l.text));

    let s = lines.findIndex((l) => START.test(l.text) && !/^tutkimussuunnitelma\s*(ja tarjous)?$/i.test(l.text));
    if (s < 0) s = lines.findIndex((l) => /^tutkimussuunnitelma$/i.test(l.text) && l.page > 1);
    if (s < 0) s = 0;
    let e = lines.findIndex((l, i) => i > s && END.test(l.text));
    if (e < 0) e = lines.length;
    const sec = lines.slice(s, e);

    // Lohkot: vasemman sarakkeen otsikot ("Sisältö", "Optio 1") aloittavat uuden lohkon
    const blocks = [];
    let cur = null;
    sec.forEach((l, i) => {
      let t = l.text;
      const om = t.match(/^(optio\s*\d*|lisätyö\p{L}*|vaihtoehto\s*\d*)(?![\p{L}])[:.]?\s*/iu);
      const sm = t.match(/^(sisältö|tutkimusten sisältö|tutkimuksen sisältö)(?![\p{L}])\s*:?\s*/iu);
      if (om) { cur = { optio: clean(om[1]).replace(/^./, (c) => c.toUpperCase()), lines: [] }; blocks.push(cur); t = t.slice(om[0].length); }
      else if (sm || !cur) { cur = { optio: null, lines: [] }; blocks.push(cur); if (sm) t = t.slice(sm[0].length); }
      if (i === 0 && START.test(t) && !/^tarjous sisältää/i.test(t)) t = t.replace(START, "").replace(/^[^:]*:\s*/, "");
      if (t.trim()) cur.lines.push(Object.assign({}, l, { text: t.trim() }));
    });

    const items = [];
    blocks.forEach((b) => {
      const start = items.length;
      if (b.lines.some((l) => l.bullet)) bulletItems(b, items);
      else proseItems(b, items);
      // Kokonaisuus sisältää osat: märkätilakartoitus sisältää pintakosteuden ja aistinvaraisen tarkastelun
      const own = items.slice(start);
      const sis = new Set();
      own.forEach((x) => (M.menetelma(x.menetelma).sisaltaa || []).forEach((y) => sis.add(y)));
      if (sis.size) items.splice(start, own.length, ...own.filter((x) => !sis.has(x.menetelma)));
    });
    // Sama menetelmä ja tarkennus kahdesti -> yksi kohta
    const out = [];
    items.forEach((it) => {
      const d = out.find((x) => x.menetelma === it.menetelma && x.kuvaus === it.kuvaus && x.optio === it.optio);
      if (d) d.maara = Math.max(d.maara, it.maara); else out.push(it);
    });
    return { kohde: kohdeTiedot(lines), kohdat: out, loytyi: sec.length > 0 };
  }

  /* Luettelo: kohta + sisennetyt alakohdat */
  function bulletItems(b, items) {
    const nodes = [];
    let last = null;
    // Sisennystasot: luettelomerkin vaakasijainti (pääkohdat vasemmalla, alakohdat oikealla)
    const bxs = b.lines.filter((l) => l.bullet).map((l) => l.bx);
    const minB = Math.min(...bxs), maxB = Math.max(...bxs);
    const isKid = (l) => maxB - minB > 10 && l.bx > (minB + maxB) / 2;
    b.lines.forEach((l) => {
      if (l.bullet) {
        const parent = nodes.length && isKid(l) && !nodes[nodes.length - 1].prose ? nodes[nodes.length - 1] : null;
        const n = { text: l.text, bx: l.bx, x: l.x, kids: [] };
        if (parent) parent.kids.push(n); else nodes.push(n);
        last = n;
      } else if (last && l.x >= last.x - 4) last.text += " " + l.text;          // rivitys jatkuu
      else { last = null; nodes.push({ text: l.text, bx: l.bx, x: l.x, kids: [], prose: true }); }
    });
    nodes.forEach((n) => {
      if (n.prose) { proseItems({ optio: b.optio, lines: [{ text: n.text }] }, items, true); return; }
      const own = methodsIn(n.text);
      let mid = own[0] || null;
      const kidInfo = n.kids.map((k) => ({ k, m: methodsIn(k.text), c: countIn(k.text) }));
      // Kohdalla ei omaa menetelmää: alakohta kertoo sen ("selvitetään rakenneavauksen yhteydessä")
      let viaKid = null;
      if (!mid) { viaKid = kidInfo.find((x) => x.m.length); if (viaKid) mid = viaKid.m[0]; }
      if (!mid) return;
      const c = countIn(n.text);
      // Erilliset alakohdat: näytteet (myös "1 kpl / avaus")
      const separate = mid === "nayte" ? [] : kidInfo.filter((x) => x !== viaKid && x.m.includes("nayte"));
      const details = kidInfo.filter((x) => !separate.includes(x));
      let maara = c ? c.n : null;
      if (maara == null) {
        const sum = details.reduce((a, x) => a + (x.c && !x.c.per ? x.c.n : 0), 0);
        if (sum) maara = sum;
        else if (POINTS[mid] && details.length >= 2 && details.every((x) => !x.m.length || x.m[0] === mid)) maara = details.length;
      }
      maara = maara || 1;
      const lisa = details.map((x) => clean(x.k.text)).filter(Boolean);
      const teksti = clean(n.text) + (lisa.length ? ": " + lisa.join("; ") : "");
      const yhteydessa = /yhteydessä(?![\p{L}])/iu.test(teksti) && items.some((x) => x.menetelma === mid);
      items.push({ menetelma: mid, maara, kuvaus: short(teksti, 220), optio: b.optio, ehdollinen: conditional(n.text), valittu: !b.optio && !yhteydessa,
        huom: yhteydessa ? "tehdään toisen kohdan yhteydessä" : (c && c.max ? "tarjouksessa " + c.n + "–" + c.max : "") });
      separate.forEach((x) => {
        const kc = x.c;
        const n2 = kc ? (kc.per ? kc.n * maara : kc.n) : 1;
        items.push({ menetelma: "nayte", maara: n2, kuvaus: short(clean(x.k.text), 220), optio: b.optio, ehdollinen: conditional(x.k.text), valittu: !b.optio,
          huom: kc && kc.per ? kc.n + " / " + M.menetelma(mid).nimi.toLowerCase() + " × " + maara : "" });
      });
    });
  }

  /* Kappaleteksti: virkkeittäin; lohkon ensimmäinen määrä koskee virkkeitä, joissa ei ole omaa */
  function proseItems(b, items, inList) {
    const text = b.lines.map((l) => l.text).join(" ").replace(/\s+/g, " ");
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/);
    const blockCount = countIn(text);
    // Lohkon kuvaava virke: ensimmäinen, jossa on määrä (esim. "huoneistojen (8 kpl) märkätilojen kuntokartoitus")
    const lead = sentences.find((x) => countIn(x)) || null;
    const tidy = (x) => { const t = clean(x).replace(/^(optiona\s*\d*\s*)?(tarjoamme|esitämme)(\s+tehtäväksi)?(\s+muiden tutkimusten yhteydessä)?\s*/iu, "").replace(/[.]$/, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
    const seen = new Map();
    sentences.forEach((snt) => {
      const ms = methodsIn(snt);
      if (!ms.length) return;
      const c = countIn(snt) || blockCount;
      ms.forEach((mid) => {
        if (seen.has(mid)) { const it = seen.get(mid); it.maara = Math.max(it.maara, c ? c.n : 1); return; }
        const kuv = lead && lead !== snt && !countIn(snt) ? tidy(lead) + ": " + tidy(snt).replace(/^./, (x) => x.toLowerCase()) : tidy(snt);
        const it = { menetelma: mid, maara: c ? c.n : 1, kuvaus: short(kuv, 220), optio: b.optio, ehdollinen: conditional(snt), valittu: !b.optio,
          huom: c && c.max ? "tarjouksessa " + c.n + "–" + c.max : "" };
        seen.set(mid, it); items.push(it);
      });
    });
  }

  /* ---------- Tarkistus ja lisäys ---------- */
  function review(res, fileName) {
    const k = App.S.kohde;
    const kt = res.kohde;
    const fill = ["nimi", "osoite", "projektinro"].filter((f) => kt[f] && !String(k[f] || "").trim());
    const opts = (sel) => M.MENETELMAT.filter((m) => !m.piilotettu || m.id === sel).map((m) => '<option value="' + m.id + '"' + (m.id === sel ? " selected" : "") + ">" + esc(m.nimi) + "</option>").join("");
    const row = (it, i) => '<div class="pi-row' + (it.valittu ? "" : " off") + '" data-i="' + i + '">' +
      '<label class="pi-chk"><input type="checkbox" data-pi="valittu"' + (it.valittu ? " checked" : "") + ' aria-label="Lisää suunnitelmaan"></label>' +
      '<div class="grow"><div class="pi-top"><select data-pi="menetelma">' + opts(it.menetelma) + '</select><input type="number" min="1" inputmode="numeric" data-pi="maara" value="' + it.maara + '" aria-label="Määrä"><span class="u">kpl</span></div>' +
      '<textarea data-pi="kuvaus" rows="2">' + esc(it.kuvaus) + "</textarea>" +
      '<div class="pi-tags">' + (it.optio ? '<span class="mp-tag warn">' + esc(it.optio) + ": valitse, jos tilattu</span>" : "") +
        (it.ehdollinen ? '<span class="mp-tag">tarvittaessa</span>' : "") + (it.huom ? '<span class="mp-tag">' + esc(it.huom) + "</span>" : "") + "</div></div></div>";
    const ref = sheet(
      "<h3>Suunnitelma PDF:stä</h3>" +
      '<p class="hint" style="margin:0 0 10px">' + esc(fileName) + ". Tarkista kohdat: valinta, menetelmä, määrä ja tarkennus. Luettu tälle laitteelle, tiedostoa ei lähetetty minnekään.</p>" +
      (fill.length ? '<label class="pi-kohde"><input type="checkbox" data-kt checked><span><b>Täytä kohteen tiedot</b><br>' +
        fill.map((f) => esc({ nimi: "Nimi", osoite: "Osoite", projektinro: "Projektinumero" }[f] + ": " + kt[f])).join("<br>") + "</span></label>" : "") +
      (res.kohdat.length ? '<div class="pi-list">' + res.kohdat.map(row).join("") + "</div>"
        : '<div class="alert info">' + icon("alert") + "<div>Tutkimuksia ei tunnistettu. Lisää kohdat käsin, tai lisää tarjouksenne sanamuodot Sanasto-sivun listaan <i>Suunnitelman sanat</i>.</div></div>") +
      '<div class="row-btns pi-btns"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Lisää</button></div>',
      (el, close) => {
        const paintOk = () => {
          const n = res.kohdat.filter((x) => x.valittu).length;
          el.querySelector("[data-ok]").textContent = n ? "Lisää " + n + (n === 1 ? " kohta" : " kohtaa") : (fill.length ? "Täytä tiedot" : "Lisää");
        };
        el.addEventListener("input", (e) => {
          const r = e.target.closest("[data-i]"), f = e.target.dataset.pi;
          if (!r || !f) return;
          const it = res.kohdat[+r.dataset.i];
          if (f === "valittu") { it.valittu = e.target.checked; r.classList.toggle("off", !it.valittu); paintOk(); }
          else if (f === "maara") it.maara = Math.max(1, parseInt(e.target.value, 10) || 1);
          else it[f] = e.target.value;
        });
        el.addEventListener("change", (e) => { if (e.target.dataset.pi === "menetelma") res.kohdat[+e.target.closest("[data-i]").dataset.i].menetelma = e.target.value; });
        el.querySelector("[data-ok]").addEventListener("click", async () => {
          const kc = el.querySelector("[data-kt]");
          if (kc && kc.checked) fill.forEach((f) => { k[f] = kt[f]; });
          let n = 0;
          res.kohdat.filter((x) => x.valittu).forEach((x) => {
            const kuvaus = clean(x.kuvaus);
            if (k.suunnitelma.some((p) => p.menetelma === x.menetelma && p.kuvaus === kuvaus)) return;
            k.suunnitelma.push({ id: DB.uid("p_"), menetelma: x.menetelma, kuvaus, maara: x.maara, tilaId: null, pois: null, lahde: "pdf" });
            n++;
          });
          await App.Model.saveKohde();
          close();
          toast(n ? n + (n === 1 ? " kohta lisätty suunnitelmaan" : " kohtaa lisätty suunnitelmaan") : "Kohteen tiedot päivitetty", 2600);
          App.render();
        });
        paintOk();
      }
    );
    return ref;
  }

  async function read(file) {
    toast("Luetaan suunnitelmaa…", 8000);
    try { return parse(await pdfLines(file)); } finally { UI.hideToast(); }
  }

  async function importPdf(file) {
    if (!file) { const fs = await UI.pickFile("application/pdf,.pdf", false); file = fs[0]; }
    if (!file) return;
    toast("Luetaan suunnitelmaa…", 8000);
    try {
      const res = parse(await pdfLines(file));
      UI.hideToast();
      review(res, file.name);
    } catch (e) {
      console.error(e);
      toast("PDF:n lukeminen epäonnistui: " + (e.message || e), 5000);
    }
  }

  window.PlanImport = { importPdf, read, parse, textLines, pdfLines, methodsIn, countIn, review };
})();
