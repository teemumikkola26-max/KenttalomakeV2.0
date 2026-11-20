/* =========================================================================
   akk.js – asuntokaupan kuntotarkastus (#/k/<kohde>/akk[/<osio>])

   Kevyt kenttänäkymä (Teemu 17.11.): oletuksena kaikki kunnossa, tutkija
   kirjaa vain poikkeamat kuvalla ja sanelulla. Ei pakollisia kenttiä.
     - Osio kuitataan yhdellä napautuksella ("Ei huomautettavaa").
     - "Ei voitu tarkastaa" koko osiolle yhdellä napautuksella; syy siruista.
     - Tarkastuslistan rivi muuttuu vain poikkeuksena (Huomautettavaa /
       Ei voitu tarkastaa / Ei koske); tyhjä = ei huomautettavaa.
     - Rakennetiedot esitäytetään lähtötiedoista (kuntoarvion perustiedot ja
       rakenteet), eikä niitä tarvitse avata.
     - Vinkit lähtötiedoista eivät ole kenttiä.
   Rakenne: Menetelmät ja kalusto -taulukon Kuntotarkastus-välilehti (PBM:n
   raporttipohja, RT 103996), js/menetelmat-data.js -> MENETELMA_DATA.akk.

   Tallennus: kohde.akk = { tiedot: {k: arvo}, osiot: { id: { kayty, ei, eiKoske,
     rivit: {i: arvo}, syy, kunto, toimenpide, kentat: {k: arvo}, rakenne } } }
   Havainnot liitetään osioon kentällä havainto.akkOsa.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  const { S, Model } = App;
  const D = (window.MENETELMA_DATA && MENETELMA_DATA.akk) || { yleiset: [], osiot: [], sarake: [], kunto: [], toimenpide: [] };
  const OK = D.sarake[0] || "Ei huomautettavaa", HUOM = D.sarake[1] || "Huomautettavaa", EIVOI = D.sarake[2] || "Ei voitu tarkastaa", EIKOSKE = D.sarake[3] || "Ei koske";
  const SYYT = ["Lumipeite", "Ei pääsyä", "Tavaraa edessä", "Kiinteät verhoukset", "Turvallisuussyy", "Pimeys"];

  /* Sanelusta osio: sanan alku riittää. Tarkempi sana voittaa (esim. "vesikaton läpivienti" -> vesikatto). */
  const SANAT = {
    rakennuksen_vierusta_salaoja: ["salaoj", "sadevesi", "syöksytor", "kourukaiv", "maanpin", "pihan kallist", "vierust", "tarkastuskaiv", "kasvillisuu"],
    perustukset_ja_sokkelit: ["sokkel", "perustu", "perusmuur", "anturan", "valesokkel"],
    alapohja: ["alapohj", "ryömintätil", "rossipohj", "kapillaarikatk", "maanvarai"],
    ulkoseinat_ja_julkisivut: ["ulkoseinä", "julkisiv", "ulkoverhou", "verhoila", "räystäslaud", "pielilist", "rappau"],
    katokset_parvekkeet_terassit: ["katok", "parveke", "terass", "kuisti", "kaite"],
    ikkunat: ["ikkun", "umpiolas", "ikkunapelli"],
    ovet: ["ulko-ov", "ulko-oven", "ulko-ove", "kynnyspelli", "parvekeov", "terassiov"],
    ylapohja_ja_ullakko: ["yläpohj", "ullako", "ullakk", "aluskat", "kattotuol", "kattoristik"],
    valipohja_ja_valiseinat: ["välipohj", "väliseinä"],
    vesikatto_raystaat_ja_varust: ["vesikat", "katte", "kattee", "räystä", "räystäskour", "lumieste", "kattosil", "kattotikk", "piipun pelli"],
    tulisijat: ["tulisij", "takka", "takan", "hormi", "kiuas", "kiukaa", "nuohou", "leivinuun"],
    sisatilat: ["sisäti", "olohuonee", "makuuhuonee", "keittiö", "eteise", "kiintokalust", "sisäilm"],
    muut_tilat: ["tekninen til", "teknisessä til", "kattilahuon", "autotall", "öljysäiliöhuon", "varasto"],
    markatilat: ["märkätil", "kylpyhuon", "pesuhuon", "suihku", "sauna", "lattiakaiv", "kph", "wc"],
    ilmanvaihtojarjestelma: ["ilmanvaih", "iv-kon", "poistoventtiil", "tuloventtiil", "korvausilm", "liesituulet", "suodatin"],
    lammitysjarjestelma: ["lämmity", "lämmönjako", "patter", "kattila", "maalämp", "kaukoläm", "lämpöpump", "lattialämmity", "öljysäiliö"],
    vesi_ja_viemarijarjestelma: ["viemär", "vesijoh", "käyttövesi", "käyttöveden", "hana", "hanoj", "vesikalust", "astianpesukon", "pyykinpesukon", "vesimittar"],
    sahkojarjestelma: ["sähkö", "pistorasi", "sähkökeskus", "valaisi", "johdot", "kytkin"]
  };

  /* ---------- Malli ---------- */
  const osio = (id) => D.osiot.find((o) => o.id === id) || null;
  // Käynnissä, kun se on suunnitelmassa tai tutkija on kuitannut osion (pelkkä näkymän avaus ei riitä)
  const aktiivinen = () => !!(S.kohde && (S.kohde.suunnitelma.some((p) => p.menetelma === "asuntokauppa" && !p.pois) ||
    (S.kohde.akk && Object.values(S.kohde.akk.osiot || {}).some((o) => o && (o.kayty || o.ei || o.eiKoske)))));
  function akk() {
    const k = S.kohde;
    if (!k.akk) k.akk = { tiedot: {}, osiot: {} };
    return k.akk;
  }
  const tila = (id) => akk().osiot[id] || (akk().osiot[id] = { kayty: false, ei: false, eiKoske: false, rivit: {}, syy: "", kunto: "", toimenpide: "", kentat: {}, rakenne: null });
  const hav = (id) => S.havainnot.filter((h) => h.akkOsa === id);
  const huomautettavat = (o) => Object.values((o && o.rivit) || {}).filter((v) => v === HUOM).length;
  const eiVoitu = (o) => !!o && (o.ei || Object.values(o.rivit || {}).includes(EIVOI));
  const kayty = (id) => { const o = akk().osiot[id]; return !!(o && (o.kayty || o.ei || o.eiKoske)) || hav(id).length > 0; };
  function edistyminen() { const n = D.osiot.filter((o) => kayty(o.id)).length; return { n, all: D.osiot.length }; }

  /* Lähtötiedot: kuntoarvion perustiedot ja rakenteet (Clauden paketti tai kuntoarvion tuonti) */
  const PERUS_MAP = { rakentamisvuosi: "rakennusvuosi", kayttotarkoitus: "rakennustyyppi", pinta_ala: "pintaala", perustamistapa: "perustukset",
    paaasiallinen_runkomateriaal: "runko", vesikatto_ja_katemateriaali: "vesikatto", lammitysjarjestelma: "lammitys", historiatiedot_peruskorjauks: "korjaukset",
    tehdyt_korjaus_ja_muutostyot: "korjaukset" };
  const RAK_MAP = { alapohjarakenteet: ["alapohjat"], valiseinat: ["tilanjako"], markatilat: ["martilat"], vesikatto_ja_katemateriaali: ["vesikatteet"],
    ilmanvaihtojarjestelma: ["ilmanvaihto"], lammitysjarjestelma: ["lammonlahde", "lammonjakelu"], vesi_ja_viemarijarjestelma: ["vesijohdot", "viemarit"],
    sahkojarjestelmat: ["sahkojakelu"], tulisijat: ["tulisijat"], perustamistapa: ["perustukset"], paaasiallinen_runkomateriaal: ["runko"], valipohja: ["runko"] };
  // Osion "Rakenne / järjestelmä" -teksti lähtötiedoista
  const OSIO_RAK = { perustukset_ja_sokkelit: ["perustukset"], alapohja: ["alapohjat"], ulkoseinat_ja_julkisivut: ["ulkoseinat", "runko"], ikkunat: ["ikkunat"], ovet: ["ulkoovet"],
    katokset_parvekkeet_terassit: ["parvekkeet", "katokset"], ylapohja_ja_ullakko: ["vesikattorakenteet"], valipohja_ja_valiseinat: ["tilanjako"], vesikatto_raystaat_ja_varust: ["vesikatteet", "raystaat", "vesikattovarusteet"],
    tulisijat: ["tulisijat"], sisatilat: ["lattiat", "seinatkatot", "kiintokalusteet"], markatilat: ["martilat"], ilmanvaihtojarjestelma: ["ilmanvaihto"],
    lammitysjarjestelma: ["lammonlahde", "lammonjakelu"], vesi_ja_viemarijarjestelma: ["vesijohdot", "viemarit", "vesikalusteet"], sahkojarjestelma: ["sahkojakelu"], rakennuksen_vierusta_salaoja: ["kuivatus"] };
  const OSIO_PERUS = { perustukset_ja_sokkelit: "perustukset", ulkoseinat_ja_julkisivut: "julkisivu", vesikatto_raystaat_ja_varust: "vesikatto", lammitysjarjestelma: "lammitys" };
  function lahto() { const ka = S.kohde.kuntoarvio || {}; return { pt: ka.perustiedot || {}, osat: ka.osat || {} }; }
  function rakenteet(osat) {
    const { osat: o } = lahto();
    return osat.flatMap((id) => ((o[id] && o[id].rakenteet) || []).map((r) => [r.nimike, r.vuosi ? "(" + r.vuosi + ")" : "", r.missa ? "– " + r.missa : ""].filter(Boolean).join(" "))).filter(Boolean);
  }
  function lahtoArvo(k) {
    const { pt } = lahto();
    const p = PERUS_MAP[k] && pt[PERUS_MAP[k]];
    const r = RAK_MAP[k] ? rakenteet(RAK_MAP[k]).join("; ") : "";
    return [p, r && !String(p || "").includes(r) ? r : ""].filter(Boolean).join("; ");
  }
  const tieto = (k) => { const a = akk().tiedot; return a[k] != null ? a[k] : lahtoArvo(k); };
  function osioRakenne(id) {
    const o = akk().osiot[id];
    if (o && o.rakenne != null) return o.rakenne;
    const { pt } = lahto();
    return [OSIO_PERUS[id] && pt[OSIO_PERUS[id]]].concat(rakenteet(OSIO_RAK[id] || [])).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join("; ");
  }
  const vuosi = () => { const v = parseInt(String(tieto("rakentamisvuosi") || "").match(/\d{4}/) || "", 10); return isNaN(v) ? null : v; };

  /* Vinkit lähtötiedoista: eivät ole kenttiä eivätkä mene raportille sellaisenaan. */
  function vinkit(id) {
    const v = vuosi(), txt = (id ? osioRakenne(id) : Object.values(lahto().pt).join(" ")).toLowerCase(), out = [];
    const kaikki = (D.osiot.map((o) => osioRakenne(o.id)).join(" ") + " " + Object.values(lahto().pt).join(" ")).toLowerCase();
    if (!id && v && v < 1994) out.push("Rakennettu " + v + ": asbestikartoitus tarvitaan ennen korjaustöitä (rakentaminen aloitettu ennen vuotta 1994). Mainitse raportin kohdassa 2.5.");
    if ((!id || id === "perustukset_ja_sokkelit" || id === "ulkoseinat_ja_julkisivut") && /valesokkel/.test(kaikki)) out.push("Lähtötiedoissa mainitaan valesokkeli: riskirakenne. Tarkista puurungon alaosan korkeusasema ja kosteusjäljet.");
    if ((!id || id === "alapohja") && /ryömintä|rossipohj/.test(kaikki)) out.push("Ryömintätilainen alapohja: tarkista tuuletus, maapohja ja orgaaninen aines, jos tilaan pääsee.");
    if ((!id || id === "vesikatto_raystaat_ja_varust" || id === "ylapohja_ja_ullakko") && /tasakat|loiva|bitumikermi|huopakat/.test(kaikki)) out.push("Tasakatto tai loiva katto: tarkista kattokaivot, ylösnostot ja vuotojäljet yläpohjassa.");
    if ((!id || id === "markatilat") && /muovimatto|märkätilatapetti/.test(kaikki)) out.push("Märkätilassa muovimatto tai -tapetti: tarkista saumat, läpiviennit ja lattiakaivon liitos.");
    if ((!id || id === "vesi_ja_viemarijarjestelma") && /valurauta/.test(kaikki)) out.push("Valurautaviemäri: tarkista näkyvät osat ja mahdolliset lyijytiivisteet (haitta-aine, kohta 2.5).");
    if ((!id || id === "lammitysjarjestelma") && /öljy/.test(kaikki)) out.push("Öljylämmitys: tarkista öljysäiliön näkyvät osat ja säiliötilan tuuletus.");
    if (id && txt && /maanvara/.test(txt) && id === "alapohja") out.push("Maanvarainen laatta: pintakosteuskartoitus lattioiden reunoilta ja märkätiloista.");
    return out;
  }

  function tunnistaOsio(text) {
    const t = Auto._detect.norm(text), re = Auto._detect.stemRe;
    let best = null;
    Object.entries(SANAT).forEach(([id, ws]) => ws.forEach((w) => {
      const i = t.search(re(w));
      if (i >= 0 && (!best || i < best.i || (i === best.i && w.length > best.n))) best = { id, i, n: w.length };
    }));
    return best && osio(best.id) ? best.id : null;
  }
  /* Toimenpide-ehdotus osion havaintojen sanelusta (tutkija vahvistaa napautuksella) */
  function toimenpideEhdotus(id) {
    const t = hav(id).map((h) => (h.sanelu || "") + " " + (h.tulkinta || "")).join(" ").toLowerCase(), out = [];
    if (/lisätutki|tarkempi tutki|kuntotutki/.test(t)) out.push("Lisätutkimus");
    if (/uusi(ttava|minen|taan|a )|uusittava/.test(t)) out.push("Uusiminen");
    if (/korja(ttava|us|ta)/.test(t)) out.push("Korjaus");
    if (/huol(lettava|to|letaan)|puhdist|nuohot/.test(t)) out.push("Huolto");
    if (/varaut|elinkaaren loppu|käyttöikä.*täynn/.test(t)) out.push("Varautuminen");
    return out.filter((x) => D.toimenpide.includes(x));
  }

  /* ---------- Kohteen sivun kortti ---------- */
  function kohdeCard() {
    if (!aktiivinen()) return "";
    const e = edistyminen(), k = S.kohde;
    return '<a class="row seur-link" href="#/k/' + k.id + '/akk" style="text-decoration:none;color:inherit;margin:-4px 0 12px;border-radius:12px">' + icon("list") +
      '<div class="grow"><div class="t">Asuntokaupan kuntotarkastus</div><div class="s">' + e.n + " / " + e.all + " osiota käyty</div></div>" + icon("back", "flip") + "</a>";
  }

  /* ---------- Näkymä: kaikki osiot ---------- */
  function osioTila(d) {
    const o = akk().osiot[d.id], hs = hav(d.id), n = huomautettavat(o), poik = hs.filter((h) => h.tulos === "poikkeama").length;
    if (o && o.eiKoske) return { cls: "ei", txt: "Ei koske" };
    if (o && o.ei) return { cls: "warn", txt: EIVOI + (o.syy ? ": " + o.syy : "") };
    const osat = [n ? n + " huomautettavaa" : "", poik ? poik + " poikkeamaa" : "", hs.length ? hs.length + (hs.length === 1 ? " havainto" : " havaintoa") : "", eiVoitu(o) ? "osin ei voitu tarkastaa" : ""].filter(Boolean);
    if (osat.length) return { cls: n || poik ? "note" : "ok", txt: osat.join(" · ") };
    return kayty(d.id) ? { cls: "ok", txt: OK } : { cls: "", txt: "" };
  }

  function yleisetHtml() {
    const a = akk(), grp = {};
    D.yleiset.filter((f) => f.t !== "auto" && f.k !== "tutkimuspaiva" && f.k !== "rajaukset_ja_epavarmuustekij").forEach((f) => { (grp[f.ryhma] = grp[f.ryhma] || []).push(f); });
    const kentta = (f) => {
      const v = tieto(f.k), oma = a.tiedot[f.k] != null, lt = !oma && v;
      if (f.t === "multi" || f.t === "select") {
        const sel = String(v || "").split(/\s*;\s*/).filter(Boolean);
        return '<div class="field chipfield" style="grid-column:1/-1"><span>' + esc(f.l) + '</span><div class="chips">' +
          f.o.map((o) => '<button type="button" class="chip" data-yt="' + f.k + '" data-v="' + esc(o) + '" data-multi="' + (f.t === "multi") + '" aria-pressed="' + sel.includes(o) + '">' + esc(o) + "</button>").join("") + "</div></div>";
      }
      const tag = lt ? ' <span class="auto-tag">lähtötiedoista</span>' : "";
      if (f.t === "textarea") return '<label class="field" style="grid-column:1/-1"><span>' + esc(f.l) + tag + '</span><textarea data-yf="' + f.k + '" placeholder="' + esc(f.ohje || "") + '">' + esc(v || "") + "</textarea></label>";
      return '<label class="field"><span>' + esc(f.l) + tag + '</span><input type="text"' + (f.t === "num" ? ' inputmode="decimal"' : "") + ' data-yf="' + f.k + '" value="' + esc(v || "") + '" placeholder="' + esc(f.ohje || "") + '"></label>';
    };
    const tayt = D.yleiset.filter((f) => f.ryhma === "Tiedot rakennuksesta" && tieto(f.k)).length, kaikki = D.yleiset.filter((f) => f.ryhma === "Tiedot rakennuksesta").length;
    return '<details class="card vocab"><summary class="card-h"><h2>Yleistiedot ja rakennuksen tiedot</h2><span class="meta">' + tayt + " / " + kaikki + " lähtötiedoista</span></summary><div class=\"card-b\">" +
      '<p class="hint" style="margin:0 0 8px">Esitäytetty lähtötiedoista. Ei pakollisia kenttiä: korjaa vain, jos kohteella näkyy toisin.</p>' +
      Object.entries(grp).map(([g, fs]) => '<h3 class="akk-h3">' + esc(g) + '</h3><div class="grid2">' + fs.map(kentta).join("") + "</div>").join("") +
      "</div></details>";
  }

  async function viewMain() {
    const k = S.kohde, a = akk(), e = edistyminen(), vs = vinkit(null);
    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Kuntotarkastus", sub: e.n + " / " + e.all + " osiota käyty · " + (k.nimi || ""), back: "#/k/" + k.id }) +
      '<main class="view">' +
      (vs.length ? '<div class="alert info">' + icon("alert") + "<div><b>Vinkit lähtötiedoista</b><br>" + vs.map(esc).join("<br>") + "</div></div>" : "") +
      '<section class="card"><div class="card-h"><h2>Osiot</h2><span class="meta">' + e.n + " / " + e.all + "</span></div>" +
      '<p class="hint" style="margin:4px 16px 6px">Kuvaa ja sanele vain poikkeamat. Napauta ✓, kun osio on katsottu eikä huomautettavaa ole.</p>' +
      D.osiot.map((d) => {
        const st = osioTila(d), on = kayty(d.id);
        return '<div class="row akk-row"><a class="grow" href="#/k/' + k.id + "/akk/" + d.id + '" style="text-decoration:none;color:inherit"><div class="t">' + esc(d.nimi) + ' <span class="mp-tag">' + esc(d.luku) + "</span></div>" +
          (st.txt ? '<div class="s akk-st ' + st.cls + '">' + esc(st.txt) + "</div>" : "") + "</a>" +
          '<button class="akk-ok" data-kuittaa="' + d.id + '" aria-pressed="' + on + '" aria-label="' + (on ? "Käyty" : "Kuittaa: ei huomautettavaa") + '">' + icon("check") + "</button></div>";
      }).join("") + "</section>" +
      yleisetHtml() +
      '<p class="hint" style="margin:0 2px 90px">Kamera-painike: sanelusta tunnistetaan osio (esim. ”räystäskouru vuotaa” → vesikatto). Raportin kohdan 1.8 rajaukset kootaan Ei voitu tarkastaa -merkinnöistä.</p>' +
      "</main>" + App.fab("#/k/" + k.id + "/kuvaus") + App.bottomnav("kohde");

    const save = UI.debounce(() => Model.saveKohde(), 400);
    root.oninput = (ev) => {
      const t = ev.target;
      if (t.dataset.yf) { a.tiedot[t.dataset.yf] = t.value; save(); }
    };
    root.onclick = (ev) => {
      const q = ev.target.closest("[data-kuittaa]");
      if (q) {
        const o = tila(q.dataset.kuittaa);
        if (o.kayty || o.ei || o.eiKoske) { o.kayty = false; o.ei = false; o.eiKoske = false; }   // peruutus
        else o.kayty = true;
        save(); const y = window.scrollY; viewMain().then(() => window.scrollTo(0, y)); return;
      }
      const c = ev.target.closest("[data-yt]");
      if (c) {
        const f = c.dataset.yt, v = c.dataset.v, multi = c.dataset.multi === "true";
        let sel = String(tieto(f) || "").split(/\s*;\s*/).filter(Boolean);
        if (multi) { sel = sel.includes(v) ? sel.filter((x) => x !== v) : sel.concat([v]); if (v === "Ei havaittu" && sel.includes(v)) sel = [v]; else sel = sel.filter((x) => x !== "Ei havaittu" || v === "Ei havaittu"); }
        else sel = sel[0] === v ? [] : [v];
        a.tiedot[f] = sel.join("; ");
        save(); c.closest(".chips").querySelectorAll("[data-yt]").forEach((b) => b.setAttribute("aria-pressed", sel.includes(b.dataset.v)));
      }
    };
    S.cleanup = () => { save.flush(); root.oninput = root.onclick = null; };
  }

  /* ---------- Näkymä: osio ---------- */
  async function viewOsio(id) {
    const k = S.kohde, d = osio(id);
    if (!d) { location.hash = "#/k/" + k.id + "/akk"; return; }
    const o = tila(id);
    const save = UI.debounce(() => Model.saveKohde(), 300);
    const root = document.getElementById("app");

    async function paint() {
      const hs = hav(id);
      await Model.ensureUrls(hs.map((h) => h.kuvat[0]));
      const idx = D.osiot.indexOf(d), next = D.osiot.slice(idx + 1).concat(D.osiot.slice(0, idx)).find((x) => !kayty(x.id));
      const vs = vinkit(id), ehd = o.toimenpide ? [] : toimenpideEhdotus(id), tp = String(o.toimenpide || "").split(/\s*;\s*/).filter(Boolean);
      const rak = osioRakenne(id);
      const rivi = (x, i) => {
        const v = o.ei ? EIVOI : o.eiKoske ? EIKOSKE : (o.rivit[i] || "");
        return '<div class="akk-r' + (v ? " on" : "") + '"><span class="akk-rl">' + esc(x) + "</span><span class=\"akk-rc\">" +
          [[HUOM, "!"], [EIVOI, "?"], [EIKOSKE, "–"]].map(([val, s]) => '<button class="akk-c" data-rivi="' + i + '" data-v="' + esc(val) + '" aria-pressed="' + (v === val) + '" title="' + esc(val) + '" aria-label="' + esc(x + ": " + val) + '">' + s + "</button>").join("") + "</span></div>";
      };
      const kenttaHtml = (f) => {
        const v = o.kentat[f.k] || "";
        if (f.t === "select" || f.t === "multi") {
          const sel = String(v).split(/\s*;\s*/).filter(Boolean);
          return '<div class="field chipfield"><span>' + esc(f.l) + '</span><div class="chips">' + f.o.map((x) => '<button type="button" class="chip" data-ok="' + f.k + '" data-v="' + esc(x) + '" data-multi="' + (f.t === "multi") + '" aria-pressed="' + sel.includes(x) + '">' + esc(x) + "</button>").join("") + "</div></div>";
        }
        return '<label class="field"><span>' + esc(f.l) + (f.u ? ' <span class="u">(' + esc(f.u) + ")</span>" : "") + '</span><input type="text"' + (f.t === "num" ? ' inputmode="decimal"' : "") + ' data-of="' + f.k + '" value="' + esc(v) + '"></label>';
      };
      root.innerHTML = App.topbar({ title: d.nimi, sub: d.luku + " · Kuntotarkastus", back: "#/k/" + k.id + "/akk" }) +
        '<main class="view no-nav">' +
        '<a class="btn btn-primary btn-block" href="#/k/' + k.id + "/kuvaus?akkosa=" + id + '" style="margin-bottom:12px">' + icon("cam") + "Kuva + sanelu tähän osioon</a>" +
        (hs.length ? '<section class="card"><div class="card-h"><h2>Havainnot</h2><span class="meta">' + hs.length + '</span></div><div class="card-b"><div class="recent">' +
          hs.map((h) => '<a class="item" href="#/k/' + k.id + "/h/" + h.id + '" style="text-decoration:none;color:inherit"><span class="thumb">' + (Model.url(h.kuvat[0]) ? '<img src="' + Model.url(h.kuvat[0]) + '" alt="">' : "") + '<span class="no">' + UI.nro(h) + "</span></span>" + esc((h.sanelu || "").slice(0, 40) || M.menetelma(h.menetelma).nimi) + "</a>").join("") +
          "</div></div></section>" : "") +
        (vs.length ? '<div class="alert info">' + icon("alert") + "<div>" + vs.map(esc).join("<br>") + "</div></div>" : "") +
        '<section class="card"><div class="card-h"><h2>Tarkastettavat</h2><span class="meta">tyhjä = ' + esc(OK.toLowerCase()) + '</span></div><div class="card-b">' +
          '<div class="chips" style="margin-bottom:8px"><button class="chip" data-koko="ei" aria-pressed="' + !!o.ei + '">Koko osio: ' + esc(EIVOI.toLowerCase()) + '</button><button class="chip" data-koko="eiKoske" aria-pressed="' + !!o.eiKoske + '">Ei koske kohdetta</button></div>' +
          d.rivit.map(rivi).join("") +
          '<p class="hint" style="margin:8px 0 0">! huomautettavaa · ? ei voitu tarkastaa · – ei koske</p>' +
          (eiVoitu(o) ? '<div class="field" style="margin-top:10px"><span>Miksi ei voitu tarkastaa</span><div class="chips">' + SYYT.map((x) => '<button class="chip" data-syy="' + esc(x) + '" aria-pressed="' + String(o.syy || "").split(/\s*;\s*/).includes(x) + '">' + esc(x) + "</button>").join("") +
            '</div><input type="text" data-osyy value="' + esc(o.syy || "") + '" placeholder="esim. ullakolle ei ollut kulkua" style="margin-top:6px"></div>' : "") +
        "</div></section>" +
        (d.ali.length ? '<section class="card"><div class="card-b"><span class="label">Alimenetelmät</span><div class="chips">' +
          d.ali.map((m) => '<a class="chip" href="#/k/' + k.id + "/kuvaus?akkosa=" + id + "&menetelma=" + m + '" style="text-decoration:none">' + icon("cam") + " " + esc(M.menetelma(m).nimi) + "</a>").join("") + "</div></div></section>" : "") +
        '<section class="card"><div class="card-h"><h2>Kunto ja toimenpide</h2><span class="meta">valinnainen</span></div><div class="card-b">' +
          '<div class="chips">' + D.kunto.map((x) => '<button class="chip" data-kunto="' + esc(x) + '" aria-pressed="' + (o.kunto === x) + '">' + esc(x) + "</button>").join("") + "</div>" +
          '<div class="chips" style="margin-top:8px">' + D.toimenpide.map((x) => '<button class="chip' + (ehd.includes(x) ? " ehd" : "") + '" data-tp="' + esc(x) + '" aria-pressed="' + tp.includes(x) + '">' + esc(x) + (ehd.includes(x) ? " ?" : "") + "</button>").join("") + "</div>" +
          (ehd.length ? '<p class="hint" style="margin:6px 0 0">? = ehdotus havaintojen sanelusta. Napauta vahvistaaksesi.</p>' : (!tp.length && !huomautettavat(o) && !hs.some((h) => h.tulos === "poikkeama") ? '<p class="hint" style="margin:6px 0 0">Ei valintaa = ei toimenpiteitä.</p>' : "")) +
        "</div></section>" +
        '<details class="card vocab"><summary class="card-h"><h2>Rakenne ja tiedot</h2><span class="meta">' + esc(rak ? "lähtötiedoista" : (d.kentat.length ? "valinnainen" : "")) + '</span></summary><div class="card-b">' +
          '<label class="field"><span>Rakenne / järjestelmä' + (o.rakenne == null && rak ? ' <span class="auto-tag">lähtötiedoista</span>' : "") + '</span><textarea data-orak placeholder="Tarkista tai korjaa, jos näkyy toisin">' + esc(rak) + "</textarea></label>" +
          d.kentat.map(kenttaHtml).join("") +
        "</div></details>" +
        '<div class="row-btns"><a class="btn" href="#/k/' + k.id + '/akk">Kaikki osiot</a>' +
          (next ? '<a class="btn btn-primary" data-seur href="#/k/' + k.id + "/akk/" + next.id + '">Seuraava: ' + esc(next.nimi) + "</a>" : '<a class="btn btn-primary" data-seur href="#/k/' + k.id + '/akk">Valmis</a>') + "</div>" +
        "</main>";
    }

    const repaint = () => { const y = window.scrollY; return paint().then(() => window.scrollTo(0, y)); };
    root.oninput = (e) => {
      const t = e.target;
      if (t.dataset.of) { o.kentat[t.dataset.of] = t.value; o.kayty = true; save(); }
      else if (t.hasAttribute("data-orak")) { o.rakenne = t.value; save(); }
      else if (t.hasAttribute("data-osyy")) { o.syy = t.value; save(); }
    };
    root.onclick = (e) => {
      if (e.target.closest("[data-seur]")) { o.kayty = true; save.flush(); return; }
      const b = e.target.closest("[data-rivi],[data-koko],[data-syy],[data-kunto],[data-tp],[data-ok]");
      if (!b) return;
      o.kayty = true;
      if (b.dataset.rivi != null) {
        if (o.ei || o.eiKoske) { o.ei = false; o.eiKoske = false; }
        const i = b.dataset.rivi; o.rivit[i] = o.rivit[i] === b.dataset.v ? "" : b.dataset.v; if (!o.rivit[i]) delete o.rivit[i];
      } else if (b.dataset.koko) { const f = b.dataset.koko; o[f] = !o[f]; if (o[f]) { o[f === "ei" ? "eiKoske" : "ei"] = false; } }
      else if (b.dataset.syy) { let s = String(o.syy || "").split(/\s*;\s*/).filter(Boolean); s = s.includes(b.dataset.syy) ? s.filter((x) => x !== b.dataset.syy) : s.concat([b.dataset.syy]); o.syy = s.join("; "); }
      else if (b.dataset.kunto) o.kunto = o.kunto === b.dataset.kunto ? "" : b.dataset.kunto;
      else if (b.dataset.tp) {
        let s = String(o.toimenpide || "").split(/\s*;\s*/).filter(Boolean);
        s = s.includes(b.dataset.tp) ? s.filter((x) => x !== b.dataset.tp) : s.concat([b.dataset.tp]);
        if (b.dataset.tp === D.toimenpide[0] && s.includes(b.dataset.tp)) s = [b.dataset.tp]; else s = s.filter((x) => x !== D.toimenpide[0] || b.dataset.tp === D.toimenpide[0]);
        o.toimenpide = D.toimenpide.filter((x) => s.includes(x)).join("; ");
      } else if (b.dataset.ok) {
        const f = d.kentat.find((x) => x.k === b.dataset.ok);
        let s = String(o.kentat[f.k] || "").split(/\s*;\s*/).filter(Boolean);
        s = f.t === "multi" ? (s.includes(b.dataset.v) ? s.filter((x) => x !== b.dataset.v) : s.concat([b.dataset.v])) : (s[0] === b.dataset.v ? [] : [b.dataset.v]);
        o.kentat[f.k] = f.o.filter((x) => s.includes(x)).join("; ");
      }
      save(); repaint();
    };
    S.cleanup = () => { save.flush(); root.oninput = root.onclick = null; };
    await paint();
  }

  async function view(id) { akk(); if (id) await viewOsio(id); else await viewMain(); }

  /* Lähtötarkistus: katsomatta jääneet osiot yhtenä kohtana */
  function puutteet() {
    if (!S.kohde || !aktiivinen()) return [];
    const miss = D.osiot.filter((d) => !kayty(d.id));
    if (!miss.length) return [];
    return [{ tyyppi: "akk", id: "akk", otsikko: "Kuntotarkastus: " + miss.length + " osiota kuittaamatta",
      selite: miss.slice(0, 4).map((d) => d.nimi).join(", ") + (miss.length > 4 ? " …" : "") + ". Kuittaa ✓ (ei huomautettavaa), merkitse Ei voitu tarkastaa tai Ei koske.", toimintoTeksti: "Avaa" }];
  }

  /* Vienti raportointiin: raporttipohjan luvut. Oletus kunnossa näkyy selvästi, jotta AI ei päättele puuttuvasta. */
  function vienti(rn) {
    rn = rn || UI.nro;
    if (!S.kohde || !aktiivinen()) return null;
    const a = akk();
    const rajaukset = [];
    const osiot = D.osiot.map((d) => {
      const o = a.osiot[d.id] || {}, hs = hav(d.id);
      const rivit = d.rivit.map((x, i) => ({ kohta: x, tila: o.ei ? EIVOI : o.eiKoske ? EIKOSKE : (o.rivit && o.rivit[i]) || (kayty(d.id) ? OK : "ei kuitattu") }));
      const eiv = rivit.filter((r) => r.tila === EIVOI).map((r) => r.kohta);
      if (eiv.length) rajaukset.push(d.luku + " " + d.nimi + ": " + (o.ei ? "koko osio" : eiv.join(", ")) + (o.syy ? " (" + o.syy + ")" : ""));
      return {
        luku: d.luku, osio: d.nimi, kayty: kayty(d.id), ei_koske_kohdetta: !!o.eiKoske,
        rakenne: osioRakenne(d.id) || null, rakenne_lahde: o.rakenne != null ? "tutkija" : (osioRakenne(d.id) ? "lähtötiedot" : null),
        tarkastuslista: rivit,
        huomautettavaa: rivit.filter((r) => r.tila === HUOM).map((r) => r.kohta),
        ei_voitu_tarkastaa: eiv, syy: o.syy || null,
        kunto: o.kunto || null,
        toimenpide: o.toimenpide || (huomautettavat(o) || hs.some((h) => h.tulos === "poikkeama") ? "ei valittu" : D.toimenpide[0]),
        tiedot: d.kentat.filter((f) => o.kentat && o.kentat[f.k]).map((f) => ({ kentta: f.l, arvo: o.kentat[f.k], yksikko: f.u || null })),
        havainnot: hs.map((h) => rn(h))
      };
    });
    return {
      selite: "Asuntokaupan kuntotarkastus (PBM:n raporttipohja, RT 103996). Oletus on ei huomautettavaa: tarkastuslistan kohta, jota tutkija ei muuttanut, on katsottu eikä siinä ollut huomautettavaa, jos osio on kuitattu (kayty). Poikkeamat ovat havainnoissa (kuva + sanelu). Rakennetiedot ovat lähtötiedoista, ellei rakenne_lahde ole tutkija.",
      tiedot: D.yleiset.filter((f) => f.t !== "auto" && tieto(f.k)).map((f) => ({ luku: f.luku, kentta: f.l, arvo: tieto(f.k), lahde: a.tiedot[f.k] != null ? "tutkija" : "lähtötiedot" })),
      rajaukset_1_8: rajaukset,
      vinkit_lahtotiedoista: vinkit(null),
      osiot
    };
  }
  function vientiMd(j) {
    if (!j) return [];
    const L = ["## Asuntokaupan kuntotarkastus", ""];
    j.tiedot.forEach((t) => L.push("- " + t.luku + " " + t.kentta + ": " + t.arvo + (t.lahde === "lähtötiedot" ? " (lähtötiedoista)" : "")));
    if (j.rajaukset_1_8.length) { L.push("", "Rajaukset (1.8):"); j.rajaukset_1_8.forEach((r) => L.push("- " + r)); }
    L.push("");
    j.osiot.forEach((o) => {
      L.push("### " + o.luku + " " + o.osio);
      if (o.ei_koske_kohdetta) { L.push("- Ei koske kohdetta", ""); return; }
      if (o.rakenne) L.push("- Rakenne: " + o.rakenne + (o.rakenne_lahde === "lähtötiedot" ? " (lähtötiedoista)" : ""));
      L.push("- " + (o.kayty ? (o.huomautettavaa.length ? "Huomautettavaa: " + o.huomautettavaa.join(", ") : "Ei huomautettavaa tarkastuslistan kohdissa") : "Osiota ei kuitattu"));
      if (o.ei_voitu_tarkastaa.length) L.push("- Ei voitu tarkastaa: " + o.ei_voitu_tarkastaa.join(", ") + (o.syy ? " (" + o.syy + ")" : ""));
      if (o.kunto) L.push("- Kunto: " + o.kunto);
      L.push("- Toimenpide: " + o.toimenpide);
      o.tiedot.forEach((t) => L.push("- " + t.kentta + ": " + t.arvo + (t.yksikko ? " " + t.yksikko : "")));
      if (o.havainnot.length) L.push("- Havainnot: " + o.havainnot.join(", "));
      L.push("");
    });
    return L;
  }

  window.AKK = { view, kohdeCard, puutteet, vienti, vientiMd, tunnistaOsio, aktiivinen, osio, edistyminen, OSIOT: D.osiot };
})();
