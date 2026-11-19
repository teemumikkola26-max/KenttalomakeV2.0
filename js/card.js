/* =========================================================================
   card.js – Havaintokortti
   Erottaa toisistaan: havainto (sanelu), mittaustulokset (vahvistettava),
   tutkijan alustava tulkinta. Tallentuu automaattisesti.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet, nro } = UI;
  const { S, Model } = App;

  function fieldHtml(f, val, fromDict, need) {
    const lbl = '<span>' + esc(f.l) + (f.u ? ' <span class="u">(' + esc(f.u) + ")</span>" : "") + (f.req ? ' <span class="req" aria-label="pakollinen">*</span>' : "") +
      (fromDict ? ' <span class="mp-tag">sanelusta</span>' : "") + "</span>";
    const nh = need ? '<span class="need-hint">Puuttuu · sano esim. ”' + esc(window.FieldFill ? FieldFill.hint(f) : "") + "”</span>" : "";
    const cls = need ? "field need" : "field";
    return fieldInner(f, val, lbl, cls, nh);
  }
  /* Valintalistaan voi aina kirjoittaa oman arvon (Muu…), paitsi arviointiasteikoissa (kyllä/ei, hyvä/huono) */
  const ARVIO = /^(Kyllä|Ei|Hyvä|Tyydyttävä|Välttävä|Huono|Otettu|Ei otettu)$/;
  const vapaa = (f) => !f.okv && !f.suljettu && !(f.o || []).every((o) => ARVIO.test(o));
  function fieldInner(f, val, lbl, cls, nh) {
    const oma = val && !(f.o || []).includes(val);
    const ph = f.ph ? ' placeholder="' + esc(f.ph) + '"' : "";
    // Monivalinta: useampi siru voi olla valittuna (arvo "M2; DG18")
    if (f.t === "multi") {
      const sel = String(val || "").split(/\s*;\s*/).filter(Boolean);
      return '<div class="' + cls + ' chipfield" style="grid-column:1/-1">' + lbl + '<div class="chips">' +
        (f.o || []).concat(sel.filter((v) => !(f.o || []).includes(v))).map((o) => '<button type="button" class="chip" data-a="multiv" data-k="' + f.k + '" data-v="' + esc(o) + '" aria-pressed="' + sel.includes(o) + '">' + esc(o) + "</button>").join("") +
        "</div>" + nh + "</div>";
    }
    // Laskettu arvo: sovellus laskee, tutkija ei kirjoita
    if (f.t === "calc") {
      return '<label class="' + cls + '">' + lbl + '<input type="text" readonly tabindex="-1" class="calc" data-fk="' + f.k + '" value="' + esc(val || "") + '" placeholder="lasketaan">' +
        '<span class="hint" style="font-size:12px">' + esc(M.kaavaSelite(f)) + "</span></label>";
    }
    if (f.t === "time") {
      return '<label class="' + cls + '">' + lbl + '<input type="time" data-fk="' + f.k + '" value="' + esc(val || "") + '">' + nh + "</label>";
    }
    // Tarkistuslistan valinta sirurivinä: yksi napautus (napautus uudelleen tyhjentää)
    if (f.t === "select" && f.ow && !f.ryhmat) {
      return '<div class="' + cls + ' chipfield" style="grid-column:1/-1">' + lbl + '<div class="chips">' +
        f.o.map((o) => '<button type="button" class="chip' + (f.okv ? (o === f.okv ? " c-ok" : " c-note") : "") + '" data-a="chipv" data-k="' + f.k + '" data-v="' + esc(o) + '" aria-pressed="' + (o === val) + '">' + esc(o) + "</button>").join("") +
        (oma ? '<button type="button" class="chip" data-a="chipv" data-k="' + f.k + '" data-v="' + esc(val) + '" aria-pressed="true">' + esc(val) + "</button>" : "") +
        (vapaa(f) ? '<button type="button" class="chip chip-muu" data-a="muuarvo" data-k="' + f.k + '">Muu…</button>' : "") +
        "</div>" + nh + "</div>";
    }
    if (f.t === "select") {
      const opt = (o) => '<option' + (o === val ? " selected" : "") + ">" + esc(o) + "</option>";
      return '<label class="' + cls + '"' + (f.ryhmat ? ' style="grid-column:1/-1"' : "") + ">" + lbl + '<select data-fk="' + f.k + '"><option value="">Valitse</option>' +
        (f.ryhmat ? f.ryhmat.map(([g, os]) => '<optgroup label="' + esc(g) + '">' + os.map(opt).join("") + "</optgroup>").join("") : f.o.map(opt).join("")) +
        (oma ? '<option selected>' + esc(val) + "</option>" : "") +
        (vapaa(f) ? '<option value="__muu__">Muu… (kirjoita)</option>' : "") + "</select>" + nh + "</label>";
    }
    if (f.t === "textarea") {
      return '<label class="' + cls + '" style="grid-column:1/-1">' + lbl + '<textarea data-fk="' + f.k + '"' + ph + ' style="min-height:72px">' + esc(val || "") + "</textarea>" + nh + "</label>";
    }
    if (f.t === "date") {
      return '<label class="' + cls + '">' + lbl + '<input type="date" data-fk="' + f.k + '" value="' + esc(val || "") + '">' + nh + '</label>';
    }
    const num = f.t === "num";
    return '<label class="' + cls + '">' + lbl + '<input type="text" ' + (num ? 'inputmode="decimal" ' : "") + 'data-fk="' + f.k + '"' + ph + ' value="' + esc(val || "") + '">' + nh + '</label>';
  }

  function hasMittaus(h) { return M.onMittauksia(h); }

  function fiNum(v, d) {
    if (v == null || isNaN(v)) return "";
    return Number(v).toFixed(d).replace(".", ",");
  }
  function num(v) { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? null : n; }

  async function view(id) {
    const k = S.kohde;
    const h = Model.havainto(id);
    if (!h) { location.hash = "#/k/" + k.id; return; }
    // Tarkistuslomake: tilasta pääteltävät tiedot (märkätilan tyyppi, asunto) valmiiksi
    if (window.FieldFill && M.menetelma(h.menetelma).lomake && FieldFill.apply(h).length) await Model.saveHavainto(h);
    await Model.ensureUrls(h.kuvat.concat(h.aanitteet || []));
    for (const f of M.menetelma(h.menetelma).kentat.filter((x) => x.t === "table")) {
      await Model.ensureUrls(M.rivit(h, f).map((r) => r._ocr && r._ocr.rajaus).filter(Boolean));
    }

    const root = document.getElementById("app");
    const save = UI.debounce(async () => { await Model.saveHavainto(h); refreshMissing(); }, 400);
    let picker = null;
    // Puutteet näytetään vasta, kun tutkija yrittää sulkea havainnon (tai on avannut sen puutelistasta)
    let naytaPuutteet = /[?&]puutteet=1/.test(location.hash);
    let lisaAuki = false;

    function selectMethod(id) {
      if (h.menetelma === id) return;
      h.menetelma = id;
      h.vahvistettu = false;
      // muistetut arvot ja oletukset (esim. pumppu, halkaisija) valmiiksi
      M.taytaMuisti(h, Model);
      if (window.FieldFill) FieldFill.apply(h);
      M.laske(h);
      const cur = Model.kohta(h.suunnitelmaId);
      if (cur && !Model.kohtaSopii(cur, h.menetelma)) { h.suunnitelmaId = null; if (h.auto) h.auto.kohta = true; }
      Auto.manual(h, "menetelma");
      Auto.autoKohta(h); Auto.autoTunnus(h);
      save(); paint();
    }

    function kohtaOptions() {
      const own = k.suunnitelma.filter((p) => Model.kohtaSopii(p, h.menetelma));
      const other = k.suunnitelma.filter((p) => !Model.kohtaSopii(p, h.menetelma));
      const opt = (p) => '<option value="' + p.id + '"' + (h.suunnitelmaId === p.id ? " selected" : "") + ">" + esc(Model.kohtaNimi(p)) + " (" + Model.kohtaMaaraTeksti(p) + ")</option>";
      return '<option value="">Valitse</option>' + own.map(opt).join("") +
        (other.length ? '<optgroup label="Muut menetelmät">' + other.map(opt).join("") + "</optgroup>" : "") +
        '<option value="ei"' + (h.suunnitelmaId === "ei" ? " selected" : "") + ">Ei suunnitelmassa</option>";
    }

    /* Sanelusta tunnistetut tiedot (menetelmä, tila, rakenneosa, tulos) */
    async function runAuto() {
      const changes = await Auto.apply(h);
      if (!changes.length) return;
      const shown = changes.filter((c) => ["menetelmä", "tulos", "tila", "rakenneosa", "rakennusosa", "kenttä", "taulukko"].includes(c.kentta));
      if (shown.length) toast("Sanelusta: " + shown.slice(0, 3).map((c) => c.arvo).join(", ") + (shown.length > 3 ? " ja " + (shown.length - 3) + " muuta" : ""), 3000);
      save(); paint();
    }

    const extraFields = new Set();
    function suggestions() {
      const m = M.menetelma(h.menetelma);
      const units = new Set(m.kentat.filter((f) => f.u).map((f) => f.u));
      return M.lukuehdotukset(h.sanelu).filter((s) => units.has(s.u));
    }

    function paint() {
      if (Auto.autoKohta(h) | Auto.autoTunnus(h)) save();
      const autoTag = (key) => h.auto && h.auto[key] === "sanelu" ? ' <span class="mp-tag">sanelusta</span>' : "";
      const m = M.menetelma(h.menetelma);
      const thumbs = h.kuvat.map((fid, i) =>
        '<button class="thumb" data-a="view" data-i="' + i + '" aria-label="Kuva ' + (i + 1) + '"><img src="' + Model.url(fid) + '" alt=""></button>').join("");
      const audio = (h.aanitteet || []).map((fid) => '<audio controls preload="none" src="' + Model.url(fid) + '" style="width:100%;margin-top:6px"></audio>').join("");
      /* Menetelmän kentät syntyvät sanelusta: näkyvissä ovat täytetyt kentät ja vähimmäistiedot.
         Puuttuva vähimmäistieto näytetään selvästi esimerkkilauseen kanssa. Muut kentät saa
         esiin napauttamalla (+ kenttä). */
      const filled = (f) => f.t === "table" ? M.rivit(h, f).length > 0 : h.kentat[f.k] != null && String(h.kentat[f.k]).trim() !== "";
      // Tarkistuslista (lomake) näyttää kaikki tilatyypin kohdat; muut menetelmät täytetyt ja vähimmäistiedot
      const vis = M.kentat(h);
      const shownF = vis.filter((f) => m.lomake || filled(f) || f.req || f.t === "calc" || extraFields.has(f.k));
      const vihje = M.vihje(h);
      const hiddenF = vis.filter((f) => !shownF.includes(f));
      const reqF = vis.filter((f) => f.req), reqOk = reqF.filter(filled).length;
      const okF = vis.filter((f) => f.okv && !filled(f));
      const mit = m.kentat.length
        ? '<div class="mit">' +
          (m.kentat.some((f) => f.k === "asunto")
            ? (M.eiAsuntoja(k)
              ? '<p class="hint" style="margin:0 0 10px">Kohteessa ei ole asuntoja, joten asuntoa ei kysytä. <button class="link" data-a="asuntoja" data-v="1">Kohteessa on asuntoja</button></p>'
              : (h.kentat.asunto ? "" : '<button class="chip" data-a="asuntoja" data-v="0" style="margin:0 0 10px">Ei asuntoja (esim. omakotitalo)</button>'))
            : "") +
          '<div class="grid2">' + shownF.map((f) => f.t === "table" ? tableHtml(f, naytaPuutteet && f.req && !filled(f)) : fieldHtml(f, h.kentat[f.k] != null ? h.kentat[f.k] : "", !!(h.auto && h.auto["k:" + f.k] === "sanelu"), naytaPuutteet && f.req && !filled(f))).join("") + "</div>" +
          (vihje ? '<p class="hint vihje" style="margin:4px 0 10px"><b>Muista:</b> ' + esc(vihje) + "</p>" : "") +
          (okF.length ? '<button class="btn btn-block" data-a="okloput" style="margin:6px 0 4px">' + icon("ok") + "Muut kohdat kunnossa (" + okF.length + ")</button>" +
            '<p class="hint" style="margin:0 0 8px">Merkitsee tyhjät tarkistuskohdat kunnossa-arvolla. Sanele tai valitse ensin puutteet.</p>' : "") +
          (m.kentat.some((f) => f.mittaus || (f.t === "table" && (f.sarakkeet || []).some((c) => c.mittaus)))
            ? '<p class="hint">Oranssi lukema: tarkista napauttamalla. Mikrofoni: luku tuli sanelusta.</p>'
            : "") +
          "</div>"
        : "";

      root.innerHTML = App.topbar({ title: nro(h) + " · " + M.menetelma(h.menetelma).lyhyt, sub: Model.sijaintiTeksti(h.sijainti) || "Sijainti puuttuu", back: "#/k/" + k.id }) +
        '<main class="view no-nav">' +
        '<div class="thumbs" style="margin-bottom:12px">' + thumbs +
        '<a class="thumb-add" href="#/k/' + k.id + "/kuvaus/" + h.id + '" aria-label="Lisää kuvia ja sanelua">' + icon("cam") + "</a></div>" +

        '<div data-missing>' + missingHtml() + "</div>" +
        (h.ristiriita ? '<div class="alert">' + icon("alert") + "<div><b>Toinen tutkija muokkasi tätä havaintoa samaan aikaan.</b> Pilvessä ollut versio on alla. Korvautunut versio (" + esc([h.ristiriita.tekija, UI.pvm(h.ristiriita.aika)].filter(Boolean).join(", ")) + "): <i>" + esc(h.ristiriita.sanelu || "–") + "</i>" +
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-sm" data-a="rr-oma">Palauta korvautunut versio</button><button class="btn btn-sm" data-a="rr-ok">Pidä nykyinen</button></div></div></div>' : "") +
        '<section class="card"><div class="card-h"><h2><span class="sec-n">1</span>Havainto</h2>' + dictBtnHtml("sanelu") + "</div>" +
        '<div class="card-b"><textarea data-t="sanelu" aria-label="Havainto" placeholder="Mitä näet ja mittaat">' + esc(h.sanelu) + "</textarea>" +
        '<div class="dict-prev" data-prev="sanelu"></div>' + audio + (window.Katselmus ? Katselmus.aiemmatTilassaHtml(h.sijainti.tilaId) : "") + "</div></section>" +

        '<section class="card"><div class="card-h"><h2><span class="sec-n">2</span>Pakolliset tiedot</h2>' +
          (reqF.length ? '<span class="meta' + (naytaPuutteet && reqOk < reqF.length ? " need-meta" : "") + '">' + reqOk + "/" + reqF.length + "</span>" : "") + "</div>" +
        '<div class="card-b">' +
        '<span class="label' + (naytaPuutteet && !h.sijainti.tilaId ? " missing" : "") + '">Sijainti</span>' +
        '<button class="btn btn-block" data-a="loc" style="justify-content:flex-start;margin-bottom:14px">' + icon("pin") + esc(Model.sijaintiTeksti(h.sijainti) || "Valitse sijainti") +
        (h.sijainti.piste ? " · merkitty pohjaan" : "") + autoTag("tila") + "</button>" +
        (m.tulosVapaa ? '<span class="label">Tulos <span class="u" style="text-transform:none;font-weight:400">(valinnainen: tulos tulee laboratoriosta)</span></span><div class="chips" style="margin-bottom:14px">'
          : '<span class="label' + (naytaPuutteet && !h.tulos ? " missing" : "") + '">Tulos <span class="req">*</span></span><div class="chips" style="margin-bottom:14px">') +
        '<button class="chip c-note" data-a="tulos" data-v="poikkeama" aria-pressed="' + (h.tulos === "poikkeama") + '">Poikkeama' + (h.tulos === "poikkeama" ? autoTag("tulos") : "") + "</button>" +
        '<button class="chip c-ok" data-a="tulos" data-v="ok" aria-pressed="' + (h.tulos === "ok") + '">Ei huomautettavaa' + (h.tulos === "ok" ? autoTag("tulos") : "") + "</button></div>" +
        '<span class="label' + (naytaPuutteet && !h.menetelma ? " missing" : "") + '">Menetelmä <span class="req">*</span></span>' +
        '<button class="btn btn-block" data-a="menetelma" style="justify-content:space-between;margin-bottom:6px"><span>' + esc(h.menetelma ? m.nimi : "Valitse menetelmä") + autoTag("menetelma") + "</span>" + icon("back", "down") + "</button>" +
        "</div>" +
        (mit ? '<div class="card-b mit-b">' + mit + "</div>" : "") +
        "</section>" +

        (h.menetelma === "avaus" ? (() => {
          const tun = h.kentat.tunnus || "", nayt = S.havainnot.filter((x) => x.menetelma === "nayte" && tun && x.kentat.avaus === tun);
          return '<section class="card"><div class="card-b">' + (nayt.length ? '<p class="hint" style="margin:0 0 8px">Näytteet tästä avauksesta: ' + esc(nayt.map((x) => (x.kentat.tunnus || nro(x)) + (x.kentat.tyyppi ? " (" + x.kentat.tyyppi + ")" : "")).join(", ")) + "</p>" : "") +
            '<button class="btn btn-block" data-a="avausnayte">' + icon("cam") + "Ota näyte tästä avauksesta</button></div></section>";
        })() : "") +
        '<details class="card vocab lisa"' + (lisaAuki ? " open" : "") + ' data-lisa><summary class="card-h"><h2><span class="sec-n">3</span>Lisätiedot</h2><span class="meta">' +
          esc([h.suunnitelmaId && h.suunnitelmaId !== "ei" ? "suunnitelma" : "", h.kaOsa ? "kuntoarvio" : "", h.tulkinta ? "tulkinta" : "", hiddenF.length ? "+" + hiddenF.length + " kenttää" : ""].filter(Boolean).join(" · ")) + "</span></summary>" +
        '<div class="card-b">' +
        (k.suunnitelma.length ? '<label class="field"><span>Tutkimussuunnitelman kohta</span><select data-a="kohta">' + kohtaOptions() + "</select></label>" : "") +
        (window.Kuntoarvio && Kuntoarvio.aktiivinen() ? '<label class="field"><span>Kuntoarvion rakennusosa' + autoTag("kaOsa") + '</span><select data-a="kaosa"><option value="">Ei liitetty</option>' +
          KAData.RYHMAT.map((r) => '<optgroup label="' + esc(r.nimi) + '">' + KAData.OSAT.filter((d) => d.r === r.id).map((d) => '<option value="' + d.id + '"' + (h.kaOsa === d.id ? " selected" : "") + ">" + esc(d.nimi) + "</option>").join("") + "</optgroup>").join("") + "</select></label>" : "") +
        (hiddenF.length ? '<span class="label">Muut kentät</span><div class="chips more-fields" style="margin-bottom:12px">' + hiddenF.map((f) => '<button class="chip" data-a="addfield" data-k="' + f.k + '">+ ' + esc(f.l) + "</button>").join("") + "</div>" : "") +
        '<div style="display:flex;justify-content:space-between;align-items:center"><span class="label">Alustava tulkinta</span>' + dictBtnHtml("tulkinta") + "</div>" +
        '<textarea data-t="tulkinta" style="min-height:72px" aria-label="Alustava tulkinta" placeholder="Tutkijan oma arvio, esim. todennäköinen syy">' + esc(h.tulkinta) + "</textarea>" +
        '<div class="dict-prev" data-prev="tulkinta"></div>' +
        '<button class="btn btn-danger btn-block" data-a="del" style="margin-top:14px">' + icon("trash") + "Poista havainto</button>" +
        "</div></details>" +
        "</main>" +
        '<div class="actionbar"><button class="btn" data-a="valmis">' + icon("ok") + "Valmis</button>" +
        '<button class="btn btn-primary wide" data-a="next">' + icon("cam") + "Seuraava havainto</button></div>";
      bindDict();
      const lisa = root.querySelector("[data-lisa]");
      if (lisa) lisa.addEventListener("toggle", () => { lisaAuki = lisa.open; });
      root.querySelectorAll("[data-gl]").forEach((el) => UI.showSelected(el));
      if (m.kentat.some((f) => f.ocr) && window.LukulaiteOcr) window.LukulaiteOcr.preload();
    }

    /* ---------- Taulukkokenttä (esim. RH-mittauspisteen lukemat) ---------- */
    const valittuRyhma = {};
    const muistiKey = (f) => h.menetelma + "." + f.k + ".ryhmat";

    function ryhmat(f) {
      const g = M.ryhmaSarake(f);
      if (!g) return [];
      const set = [];
      (S.kohde.muisti[muistiKey(f)] || []).concat(M.rivit(h, f).map((r) => r[g.k])).forEach((v) => {
        v = String(v == null ? "" : v).trim();
        if (v && !set.includes(v)) set.push(v);
      });
      return set;
    }
    function tallennaRyhmat(f, lista) {
      S.kohde.muisti[muistiKey(f)] = lista.slice(-8);
      Model.saveKohde();
    }

    // Tutkija muokkasi sanelusta tehtyä riviä: taulukko on nyt hänen, sanelu ei enää muuta sitä
    function ownTable(f) {
      M.rivit(h, f).forEach((r) => { if (r._sanelu) { delete r._sanelu; r._saneltu = true; } });
      Auto.manual(h, "t:" + f.k);
    }

    function allCols(f) { return f.sarakkeet || []; }
    function cols(f) { return allCols(f).filter((c) => c.t !== "date"); }       // ruudukon sarakkeet
    function dateCols(f) { return allCols(f).filter((c) => c.t === "date"); }  // lukupäivä rivin alle
    function gridStyle(f) { return "grid-template-columns:44px repeat(" + cols(f).length + ",minmax(0,1fr)) 44px"; }

    function rowHtml(f, row) {
      const o = row._ocr;
      const st = Meter.rowState(row);
      const map = f.ocr || {};
      const flagCol = (c) => o && st === "flagged" && o.flags && ((map.RH === c.k && o.flags.RH) || (map.T === c.k && o.flags.T) || (map.a === c.k && o.flags.a));
      const att = 'data-r="' + row.id + '" data-f="' + f.k + '"';
      let action;
      if (st === "reading") action = '<span class="tstate reading" aria-label="Luetaan">…</span>';
      else if (st === "flagged") action = '<button class="icon-btn tstate flagged" data-a="trev" ' + att + ' aria-label="Tarkista lukema">' + icon("alert") + "</button>";
      else if (st === "error" || st === "interrupted") action = '<button class="icon-btn tstate err" data-a="trev" ' + att + ' aria-label="Tunnistus epäonnistui">' + icon("alert") + "</button>";
      else if (st === "ok") action = '<button class="icon-btn tstate ok" data-a="trev" ' + att + ' aria-label="Näytä lukema">' + icon("ok") + "</button>";
      else action = '<button class="icon-btn" data-a="tdel" ' + att + ' aria-label="Poista rivi">' + icon("trash") + "</button>";
      const thumb = o && o.rajaus
        ? '<button class="rthumb" data-a="trev" ' + att + ' aria-label="Näytä kuva"><img src="' + Model.url(o.rajaus) + '" alt=""></button>'
        : row._sanelu || row._saneltu ? '<span class="rthumb dict" title="Sanelusta">' + icon("mic") + "</span>" : '<span class="rthumb empty"></span>';
      const ocrCol = (c) => map.RH === c.k || map.T === c.k || map.a === c.k;
      const dates = dateCols(f).map((c) =>
        '<label class="tdate">' + esc(c.l) + ' <input type="date" data-tf="' + f.k + '" data-tr="' + row.id + '" data-tc="' + esc(c.k) + '" value="' + esc(row[c.k] || "") + '"></label>').join("");
      return '<div class="trow-w" data-row="' + row.id + '"><div class="trow" style="' + gridStyle(f) + '">' + thumb +
        cols(f).map((c) => '<input type="text" class="tin' + (flagCol(c) ? " flag" : "") + '"' + (c.t === "num" ? ' inputmode="decimal"' : "") +
          ' data-tf="' + f.k + '" data-tr="' + row.id + '" data-tc="' + esc(c.k) + '" value="' + esc(row[c.k] == null ? "" : row[c.k]) + '"' +
          (st === "reading" && ocrCol(c) && !row[c.k] ? ' placeholder="…"' : "") +
          ' aria-label="' + esc(c.l) + '">').join("") + action + "</div>" +
        (dates ? '<div class="tdates">' + dates + "</div>" : "") + "</div>";
    }

    function summaryHtml(f) {
      const g = M.ryhmaSarake(f);
      const rows = M.rivit(h, f);
      if (!rows.length) return "";
      const mcols = cols(f).filter((c) => c.mittaus);
      const groups = {};
      rows.forEach((r) => { const key = g ? String(r[g.k] || "–") : "kaikki"; (groups[key] = groups[key] || []).push(r); });
      return Object.keys(groups).map((key) => {
        const rs = groups[key];
        const avg = mcols.map((c) => {
          const v = rs.map((r) => num(r[c.k])).filter((x) => x != null);
          const dec = Math.min(2, Math.max(1, ...rs.map((r) => ((String(r[c.k] || "").split(/[.,]/)[1]) || "").length)));
          return v.length ? c.l + " ka. " + fiNum(Math.round((v.reduce((a, b) => a + b, 0) / v.length) * Math.pow(10, dec)) / Math.pow(10, dec), dec) + (c.u ? " " + c.u : "") : "";
        }).filter(Boolean).join(", ");
        return "<div>" + (g ? "<b>" + esc(key) + (g.u ? " " + esc(g.u) : "") + "</b>: " : "") + rs.length + (rs.length === 1 ? " lukema" : " lukemaa") + (avg ? " · " + avg : "") + "</div>";
      }).join("");
    }

    function tableInner(f) {
      const g = M.ryhmaSarake(f);
      const rows = M.rivit(h, f);
      const rl = ryhmat(f);
      if (g && !valittuRyhma[f.k]) valittuRyhma[f.k] = rows.length ? String(rows[rows.length - 1][g.k] || "") : (rl[0] || "");
      const sel = valittuRyhma[f.k];
      return '<span class="label">' + esc(f.l) + (f.req ? ' <span class="req">*</span>' : "") + "</span>" +
        (g ? '<div class="chips scroll" data-gl="' + f.k + '" style="margin-bottom:10px">' +
          '<span style="align-self:center;font-size:13.5px;font-weight:700;margin-right:2px">' + esc(g.l) + ":</span>" +
          rl.map((v) => '<button class="chip" data-a="tgrp" data-f="' + f.k + '" data-v="' + esc(v) + '" aria-pressed="' + (v === sel) + '">' + esc(v) + (g.u ? " " + esc(g.u) : "") + "</button>").join("") +
          '<button class="chip" data-a="tgrpnew" data-f="' + f.k + '">+ Uusi</button></div>' : "") +
        '<div style="display:flex;gap:8px;margin-bottom:10px">' +
        (f.ocr ? '<button class="btn btn-dark" style="flex:1.4" data-a="tocr" data-f="' + f.k + '">' + icon("cam") + "Lue mittarista</button>" : "") +
        '<button class="btn" style="flex:1" data-a="tadd" data-f="' + f.k + '">' + icon("plus") + "Rivi käsin</button></div>" +
        (rows.length
          ? '<div class="trow thead" style="' + gridStyle(f) + '"><span></span>' + cols(f).map((c) => "<span>" + esc(c.l) + (c.u ? " " + esc(c.u) : "") + "</span>").join("") + "<span></span></div>" +
            '<div data-rows="' + f.k + '">' + rows.map((r) => rowHtml(f, r)).join("") + "</div>" +
            '<div class="tsum" data-tsum="' + f.k + '">' + summaryHtml(f) + "</div>"
          : '<p class="hint" style="margin:0 0 8px">' + (f.ocr ? (g ? "Valitse " + esc(g.l.toLowerCase()) + " ja kuvaa mittarin näyttö. Jokaisesta kuvasta tulee oma rivinsä. Rinnakkaiset mittaukset kuvataan samalla valinnalla." : "Kuvaa mittarin näyttö. Jokaisesta kuvasta tulee oma rivinsä.") : "Lisää rivi jokaiselle mittaukselle.") + "</p>");
    }

    function tableHtml(f, need) {
      return '<div class="tbl' + (need ? " need" : "") + '" data-tbl="' + f.k + '" style="grid-column:1/-1;margin-bottom:12px">' + tableInner(f) +
        (need ? '<span class="need-hint">Puuttuu · sano esim. ”' + esc(window.FieldFill ? FieldFill.hint(f) : "") + "” tai kuvaa mittarin näyttö</span>" : "") + "</div>";
    }

    /* Lasketut arvot (vetolujuus, näytteenottoaika) päivittyvät kirjoittaessa ilman uudelleenpiirtoa */
    function paivitaLasketut() {
      M.laske(h).forEach((key) => {
        const el = root.querySelector('[data-fk="' + key + '"]');
        if (el && el !== document.activeElement) el.value = h.kentat[key] || "";
      });
    }
    function tableField(fk) { return M.menetelma(h.menetelma).kentat.find((x) => x.k === fk && x.t === "table"); }
    async function repaintTable(f) {
      await Model.ensureUrls(M.rivit(h, f).map((r) => r._ocr && r._ocr.rajaus).filter(Boolean));
      const el = root.querySelector('[data-tbl="' + f.k + '"]');
      if (el) { el.innerHTML = tableInner(f); UI.showSelected(el.querySelector("[data-gl]")); }
      refreshMissing();
    }
    function repaintSummary(f) {
      const el = root.querySelector('[data-tsum="' + f.k + '"]');
      if (el) el.innerHTML = summaryHtml(f);
    }
    function unconfirm() {
      if (h.vahvistettu) { h.vahvistettu = false; const cb = root.querySelector('[data-a="vahv"]'); if (cb) cb.checked = false; }
    }

    /* Tunnistus valmistui taustalla: päivitetään vain kyseinen rivi, ettei kirjoitus keskeydy. */
    function onOcr(e) {
      if (e.detail.havaintoId !== h.id) return;
      M.menetelma(h.menetelma).kentat.filter((f) => f.t === "table").forEach((f) => {
        const row = M.rivit(h, f).find((r) => r.id === e.detail.rowId);
        if (!row) return;
        const el = root.querySelector('[data-row="' + row.id + '"]');
        if (!el) { repaintTable(f); return; }
        if (el.contains(document.activeElement)) {
          el.querySelectorAll("[data-tc]").forEach((inp) => { if (inp !== document.activeElement) inp.value = row[inp.dataset.tc] == null ? "" : row[inp.dataset.tc]; });
        } else {
          Model.ensureUrls([row._ocr && row._ocr.rajaus].filter(Boolean)).then(() => {
            const tmp = document.createElement("div");
            tmp.innerHTML = rowHtml(f, row);
            if (el.isConnected) el.replaceWith(tmp.firstChild);
          });
        }
        repaintSummary(f);
      });
      refreshMissing();
    }
    window.addEventListener("ks-ocr", onOcr);

    /* ---------- Sanelu: pidä pohjassa (havainto ja tulkinta) ---------- */
    function makeDict(target) {
      return new Dictation({
        onCommit: (text) => {
          h[target] = DictButton.appendText(h[target], text);
          const ta = root.querySelector('textarea[data-t="' + target + '"]');
          if (ta) ta.value = h[target];
          save();
          if (target === "sanelu") runAuto();
        },
        onPreview: (t) => { const el = root.querySelector('[data-prev="' + target + '"]'); if (el) el.textContent = t; },
        onState: (st, msg) => {
          if ((st === "error" || st === "empty") && msg) toast(msg, 4000);
          if (st === "recording" && msg) toast(msg, 3000);
          const b = binds[target]; if (b) b.paint();
        },
        onAudio: async (blob) => {
          const fid = await DB.putFile(k.id, blob, { kind: "aanite", havaintoId: h.id });
          h.aanitteet = (h.aanitteet || []).concat(fid);
          await Model.ensureUrls([fid]);
          await Model.saveHavainto(h); paint();
          toast("Äänite tallennettu havaintoon");
        }
      });
    }
    const dicts = { sanelu: makeDict("sanelu"), tulkinta: makeDict("tulkinta") };
    const binds = {};
    function dictBtnHtml(target) {
      return '<button type="button" class="dict-btn" data-dictbtn="' + target + '" aria-label="Sanele: pidä pohjassa">' + icon("mic") + '<span data-dl="' + target + '">Pidä: sanele</span></button>';
    }
    function bindDict() {
      Object.keys(dicts).forEach((t) => {
        const btn = root.querySelector('[data-dictbtn="' + t + '"]');
        if (!btn) return;
        // Vain yksi sanelu kerrallaan
        btn.addEventListener("pointerdown", () => { Object.keys(dicts).forEach((o) => { if (o !== t && dicts[o].active) dicts[o].stop(); }); }, true);
        binds[t] = DictButton.bind(btn, dicts[t], { labelEl: root.querySelector('[data-dl="' + t + '"]') });
      });
    }
    function stopDict() { Object.values(dicts).forEach((d) => d.stop()); }

    /* ---------- Puuttuvat tiedot kortin yläosassa ---------- */
    function missingHtml() {
      if (!naytaPuutteet) return "";
      const miss = Check.havaintoPuutteet(h);
      return miss.length
        ? '<div class="missing-box">' + icon("alert") + "<div><b>Puuttuu:</b> " + esc(miss.join(", ")) + "</div></div>"
        : '<div class="missing-box ok">' + icon("ok") + "<div>Pakolliset tiedot kirjattu.</div></div>";
    }
    function refreshMissing() { const el = root.querySelector("[data-missing]"); if (el) el.innerHTML = missingHtml(); }

    function viewer(i) {
      const fid = h.kuvat[i];
      const v = document.createElement("div");
      v.className = "viewer";
      v.innerHTML = '<img src="' + Model.url(fid) + '" alt="Kuva ' + (i + 1) + '">' +
        '<div class="vbar"><button class="btn" data-v="close">Sulje</button><button class="btn btn-danger" data-v="del" style="background:#fff">' + icon("trash") + "Poista kuva</button></div>";
      document.body.appendChild(v);
      v.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-v]");
        if (!b && e.target !== v) return;
        if (b && b.dataset.v === "del") {
          v.remove();
          if (!(await confirmSheet({ title: "Poistetaanko kuva?", ok: "Poista kuva", danger: true }))) return;
          h.kuvat.splice(i, 1);
          await DB.del("tiedostot", fid);
          await Model.saveHavainto(h); paint();
          return;
        }
        v.remove();
      });
    }

    /* Valinnan jälkeen: tunnus näytetyypin mukaan (MIK1, VOC1 …) ja tyyppikohtaiset kentät näkyviin */
    function asetaValinta(f, v) {
      if (!f) return;
      h.kentat[f.k] = v;
      Auto.manual(h, "k:" + f.k);
      if (f.muista) Model.muistiSet(M.muistiAvain(h, f), v);
      if (f.etuliitteet) Auto.autoTunnus(h);
      // näytetyypin omat muistetut arvot (pumppu, kenttänolla) valmiiksi
      if (M.menetelma(h.menetelma).kentat.some((x) => x.kun && x.kun.k === f.k)) M.taytaMuisti(h, Model);
      M.laske(h);
      if (window.FieldFill && f.okv) FieldFill.apply(h);
      save();
      const riippuvia = f.etuliitteet || M.menetelma(h.menetelma).kentat.some((x) => x.kun && x.kun.k === f.k);
      if (riippuvia || f.ow) paint();
    }
    async function muuArvo(f) {
      if (!f) return;
      const v = await UI.promptSheet({ title: f.l, label: "Kirjoita arvo", value: (f.o || []).includes(h.kentat[f.k]) ? "" : h.kentat[f.k] || "", required: true, ok: "Valmis" });
      if (v) asetaValinta(f, v.trim()); else paint();
    }
    root.oninput = (e) => {
      const t = e.target;
      if (t.matches("textarea[data-t]")) { h[t.dataset.t] = t.value; save(); }
      else if (t.matches("[data-tc]")) {
        const f = tableField(t.dataset.tf);
        const row = f && M.rivit(h, f).find((r) => r.id === t.dataset.tr);
        if (!row) return;
        row[t.dataset.tc] = t.value;
        if (row._sanelu) ownTable(f);
        if (row._ocr) {
          row._ocr.edited = row._ocr.edited || {};
          row._ocr.edited[t.dataset.tc] = true;
          const map = f.ocr || {};
          if (row._ocr.flags) {
            if (map.RH === t.dataset.tc) row._ocr.flags.RH = false;
            if (map.T === t.dataset.tc) row._ocr.flags.T = false;
            if (map.a === t.dataset.tc) row._ocr.flags.a = false;
          }
          t.classList.remove("flag");
        }
        const c = (f.sarakkeet || []).find((x) => x.k === t.dataset.tc);
        if (c && c.mittaus) unconfirm();
        save();
      }
      else if (t.matches("[data-fk]") && t.type !== "date") {
        if (t.tagName === "SELECT") return;                // valinta käsitellään change-tapahtumassa
        const f = M.kentta(h, t.dataset.fk);
        h.kentat[t.dataset.fk] = t.value;
        Auto.manual(h, "k:" + t.dataset.fk);
        if (t.dataset.fk === "tunnus") Auto.manual(h, "tunnus");
        if (f && f.mittaus && h.vahvistettu) { h.vahvistettu = false; const cb = root.querySelector('[data-a="vahv"]'); if (cb) cb.checked = false; }
        if (f && f.muista) Model.muistiSet(M.muistiAvain(h, f), t.value);
        if (f && f.laske) { if (t.value) Auto.manual(h, "k:" + f.k); else if (h.auto) delete h.auto["k:" + f.k]; }
        paivitaLasketut();
        save();
      }
    };
    root.onchange = (e) => {
      const t = e.target;
      if (t.matches('[data-a="kohta"]')) { h.suunnitelmaId = t.value || null; Auto.manual(h, "kohta"); save(); }
      else if (t.matches('[data-a="kaosa"]')) { h.kaOsa = t.value || null; Auto.manual(h, "kaOsa"); save(); }
      else if (t.matches('textarea[data-t="sanelu"]')) runAuto();
      else if (t.matches("[data-tc]")) {
        const f = tableField(t.dataset.tf);
        const row = f && M.rivit(h, f).find((r) => r.id === t.dataset.tr);
        // Vain yhteenveto päivitetään: rivin uudelleenpiirto veisi fokuksen seuraavasta kentästä.
        if (f && row) repaintSummary(f);
      }
      else if (t.matches("[data-fk]") && (t.tagName === "SELECT" || t.type === "date")) {
        const f = M.kentta(h, t.dataset.fk);
        if (t.value === "__muu__") { muuArvo(f); return; }
        asetaValinta(f, t.value);
      }
    };
    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || b.tagName === "SELECT" || b.type === "checkbox") return;
      const a = b.dataset.a;
      if (a === "asuntoja") {
        k.asuntoja = b.dataset.v === "1";
        if (!k.asuntoja) delete h.kentat.asunto;
        await Model.saveKohde(); save(); paint();
        UI.toast(k.asuntoja ? "Asunto kysytään tässä kohteessa" : "Asuntoa ei kysytä tässä kohteessa");
        return;
      }
            if (a === "tgrp") { valittuRyhma[b.dataset.f] = b.dataset.v; repaintTable(tableField(b.dataset.f)); return; }
      if (a === "tgrpnew") {
        const f = tableField(b.dataset.f), g = M.ryhmaSarake(f);
        const v = await UI.promptSheet({ title: "Uusi " + g.l.toLowerCase(), label: g.l + (g.u ? " (" + g.u + ")" : ""), required: true, ok: "Lisää" });
        if (!v) return;
        const val = v.replace(/\s*(mm|cm|m)$/i, "").trim();
        const l = ryhmat(f); if (!l.includes(val)) l.push(val);
        tallennaRyhmat(f, l); valittuRyhma[f.k] = val; repaintTable(f); return;
      }
      if (a === "tadd") {
        const f = tableField(b.dataset.f), g = M.ryhmaSarake(f);
        const row = { id: DB.uid("r_") };
        if (g) row[g.k] = valittuRyhma[f.k] || "";
        Meter.setDate(f, row);
        if (!Array.isArray(h.kentat[f.k])) h.kentat[f.k] = [];
        h.kentat[f.k].push(row);
        unconfirm(); save(); repaintTable(f);
        const first = root.querySelector('[data-tr="' + row.id + '"][data-tc]:not([data-tc="' + (g ? g.k : "") + '"])');
        if (first) first.focus();
        return;
      }
      if (a === "tdel") {
        const f = tableField(b.dataset.f);
        const row = M.rivit(h, f).find((r) => r.id === b.dataset.r);
        if (!row) return;
        if (row._sanelu) ownTable(f);
        await Meter.removeRow(h, f, row); unconfirm(); repaintTable(f); return;
      }
      if (a === "trev") {
        const f = tableField(b.dataset.f);
        const row = M.rivit(h, f).find((r) => r.id === b.dataset.r);
        if (row) Meter.review(h, f, row, () => { unconfirm(); save(); repaintTable(f); });
        return;
      }
      if (a === "tocr") {
        save.flush();
        const f = tableField(b.dataset.f);
        Meter.open({
          h, f, ryhma: valittuRyhma[f.k], ryhmat: ryhmat(f),
          onRow: () => repaintTable(f),
          onRyhma: (v, l) => { valittuRyhma[f.k] = v; tallennaRyhmat(f, l); },
          onClose: (v, l) => { valittuRyhma[f.k] = v; tallennaRyhmat(f, l); unconfirm(); repaintTable(f); }
        });
        return;
      }
      if (a === "rr-oma" || a === "rr-ok") {
        if (a === "rr-oma") { const o = h.ristiriita; ["sanelu", "tulkinta", "tulos", "menetelma"].forEach((x) => { h[x] = o[x]; }); h.kentat = o.kentat || {}; if (o.sijainti) h.sijainti = o.sijainti; }
        delete h.ristiriita; save(); paint(); return;
      }
      if (a === "okloput") {
        const vis = M.kentat(h).filter((f) => f.okv && (h.kentat[f.k] == null || h.kentat[f.k] === ""));
        vis.forEach((f) => { h.kentat[f.k] = f.okv; Auto.manual(h, "k:" + f.k); });
        const dev = M.kentat(h).some((f) => f.okv && h.kentat[f.k] && h.kentat[f.k] !== f.okv);
        if (!h.tulos) { h.tulos = dev ? "poikkeama" : "ok"; h.auto = h.auto || {}; h.auto.tulos = "sanelu"; }
        save(); paint(); toast(vis.length + " kohtaa merkitty kunnossa"); return;
      }
      if (a === "muuarvo") { muuArvo(M.kentta(h, b.dataset.k)); return; }
      if (a === "chipv") {
        const f = M.kentta(h, b.dataset.k);
        asetaValinta(f, h.kentat[b.dataset.k] === b.dataset.v ? "" : b.dataset.v);
        paint(); return;
      }
      if (a === "multiv") {
        const f = M.kentta(h, b.dataset.k);
        const sel = String(h.kentat[b.dataset.k] || "").split(/\s*;\s*/).filter(Boolean);
        const i = sel.indexOf(b.dataset.v);
        if (i >= 0) sel.splice(i, 1); else sel.push(b.dataset.v);
        // vaihtoehtojen järjestys säilyy
        const o = (f && f.o) || [];
        sel.sort((x, y) => (o.indexOf(x) + 1 || 99) - (o.indexOf(y) + 1 || 99));
        asetaValinta(f, sel.join("; "));
        paint(); return;
      }
      if (a === "tulos") { h.tulos = h.tulos === b.dataset.v ? null : b.dataset.v; Auto.manual(h, "tulos"); save(); paint(); }
      else if (a === "men") {
        selectMethod(b.dataset.v);
      }
      else if (false) {
        h.menetelma = b.dataset.v;
        h.vahvistettu = false;
        // muistetut arvot (esim. mittalaite) valmiiksi
        M.menetelma(h.menetelma).kentat.forEach((f) => {
          const mem = Model.muistiGet(h.menetelma + "." + f.k);
          if (f.muista && mem && !h.kentat[f.k]) h.kentat[f.k] = mem;
        });
        const cur = Model.kohta(h.suunnitelmaId);
        if (cur && !Model.kohtaSopii(cur, h.menetelma)) h.suunnitelmaId = null;
        save(); paint();
      }
      else if (a === "addfield") { extraFields.add(b.dataset.k); paint(); const el2 = root.querySelector('[data-fk="' + b.dataset.k + '"]'); if (el2) el2.focus(); }
      else if (a === "sugg") {
        const s = suggestions()[+b.dataset.i];
        const fields = M.menetelma(h.menetelma).kentat.filter((f) => f.u === s.u);
        const target = fields.find((f) => !h.kentat[f.k]) || fields[0];
        if (target) {
          h.kentat[target.k] = s.arvo.replace(".", ",");
          h.vahvistettu = false;
          save(); paint();
          toast(target.l + ": " + s.arvo.replace(".", ",") + " " + s.u + ". Tarkista arvo.");
        }
      }
      else if (a === "loc") Plan.locationSheet(h.sijainti, (s) => { h.sijainti = s; Auto.manual(h, "tila"); Auto.manual(h, "rakenneosa"); if (window.FieldFill) FieldFill.apply(h); save(); paint(); });
      else if (a === "view") viewer(+b.dataset.i);
      else if (a === "menetelma") MethodPicker.openSheet({ selected: h.menetelma, excludeHavainto: h.id, onSelect: selectMethod });
      else if (a === "valmis") {
        // Ensimmäinen painallus näyttää puutteet; toinen sulkee silti (puutteet näkyvät lähtötarkistuksessa)
        if (Check.havaintoPuutteet(h).length && !naytaPuutteet) {
          naytaPuutteet = true; paint(); window.scrollTo(0, 0);
          toast("Täydennä puuttuvat tiedot tai paina Valmis uudelleen", 3500);
          return;
        }
        save.flush();
        location.hash = "#/k/" + k.id;
      }
      else if (a === "avausnayte") {
        save.flush();
        S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa, menetelma: "nayte" };
        await Model.saveKohde();
        const p = Model.kohta(h.suunnitelmaId);
        location.hash = "#/k/" + k.id + "/kuvaus?menetelma=nayte" + (p && p.naytteet ? "&kohta=" + p.id : "") +
          (h.sijainti.tilaId ? "&tila=" + h.sijainti.tilaId : "") + (h.kentat.tunnus ? "&avaus=" + encodeURIComponent(h.kentat.tunnus) : "");
      }
      else if (a === "next") {
        save.flush();
        S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa, menetelma: h.menetelma || (S.kohde.viimeisin || {}).menetelma };
        await Model.saveKohde();
        location.hash = "#/k/" + k.id + "/kuvaus";
      }
      else if (a === "del") {
        if (!(await confirmSheet({ title: "Poistetaanko " + nro(h) + "?", text: "Havainnon kuvat ja sanelu poistetaan.", ok: "Poista havainto", danger: true }))) return;
        await Model.deleteHavainto(h);
        location.hash = "#/k/" + k.id;
      }
    };

    paint();
    if (window.Sync) Sync.kesken = h.id;     // muiden muutokset tähän havaintoon haetaan vasta, kun kortti suljetaan
    S.cleanup = () => { if (window.Sync) Sync.kesken = null; if (picker) picker.destroy(); stopDict(); save.flush(); Learn.learn(h).then(() => Model.saveHavainto(h)).catch(() => {}); window.removeEventListener("ks-ocr", onOcr); root.oninput = root.onchange = root.onclick = null; };
  }

  window.Card = { view };
})();
