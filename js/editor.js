/* =========================================================================
   editor.js – Menetelmien muokkaus ja lisäys
   Menetelmät ovat laitekohtaisia. Ne voi jakaa kollegoille viemällä
   JSON-tiedoston ja tuomalla sen toisella laitteella.
   Havaintoihin liitettyä menetelmää ei poisteta, vaan se piilotetaan,
   jotta vanhat havainnot ja raportit säilyvät ehjinä.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, sheet, confirmSheet } = UI;
  const { S } = App;

  async function kaytto() {
    const all = await DB.all("havainnot");
    const n = {};
    all.forEach((h) => { if (h.menetelma) n[h.menetelma] = (n[h.menetelma] || 0) + 1; });
    return n;
  }

  /* ---------- Lista ---------- */
  async function viewList() {
    const n = await kaytto();
    const rows = M.MENETELMAT.map((m, i) =>
      '<div class="row" style="cursor:default">' +
      '<button class="grow" data-a="open" data-id="' + esc(m.id) + '" style="background:none;border:none;padding:0;text-align:left;cursor:pointer;min-height:44px">' +
      '<div class="t">' + esc(m.nimi) + (m.piilotettu ? ' <span class="st st-none" style="margin-left:4px">Piilotettu</span>' : "") + "</div>" +
      '<div class="s">' + m.kentat.length + (m.kentat.length === 1 ? " kenttä" : " kenttää") + " · " + (n[m.id] || 0) + " havaintoa</div></button>" +
      '<button class="icon-btn" data-a="up" data-i="' + i + '" aria-label="Siirrä ylös"' + (i === 0 ? " disabled" : "") + ">" + icon("back", "up") + "</button>" +
      '<button class="icon-btn" data-a="down" data-i="' + i + '" aria-label="Siirrä alas"' + (i === M.MENETELMAT.length - 1 ? " disabled" : "") + ">" + icon("back", "down") + "</button>" +
      "</div>").join("");

    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Menetelmät", sub: "Kentät, pakolliset tiedot ja mittaustulokset", back: App.paluu("#/") }) +
      '<main class="view no-nav">' +
      '<section class="card">' + rows + "</section>" +
      '<button class="btn btn-primary btn-block" data-a="add">' + icon("plus") + "Lisää menetelmä</button>" +
      '<section class="card" style="margin-top:16px"><div class="card-h"><h2>Sanasto</h2><span class="meta">' + Vocab.all().filter((d) => Vocab.edited(d.key)).length + " muokattua listaa</span></div><div class=\"card-b\">" +
      '<p class="hint" style="margin:0 0 10px">Sanat, joilla sanelusta tunnistetaan poikkeama, rakenneosa, tila, mittalaite ja materiaali, sekä pohjakuvien tilalyhenteet. Muokkaa ne oman tiimisi sanamuotoihin. Kunkin menetelmän tunnistussanat ovat menetelmän omalla sivulla.</p>' +
      '<a class="btn btn-sm" href="#/sanasto">' + icon("edit") + "Avaa sanasto</a></div></section>" +
      learnHtml() +
      '<section class="card" style="margin-top:16px"><div class="card-h"><h2>Jakaminen</h2></div><div class="card-b">' +
      '<p class="hint" style="margin:0 0 10px">Menetelmät tallentuvat tälle laitteelle. Jaa ne kollegoille viemällä tiedosto ja tuomalla se heidän laitteellaan. ZIP-paketti sisältää myös menetelmät.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-a="export">' + icon("download") + "Vie menetelmät</button>" +
      '<button class="btn btn-sm" data-a="import">' + icon("upload") + "Tuo menetelmät</button>" +
      '<button class="btn btn-sm" data-a="reset">Palauta oletukset</button></div></div></section>' +
      "</main>";

    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === "open") location.hash = "#/menetelmat/" + encodeURIComponent(b.dataset.id);
      else if (a === "up" || a === "down") {
        const i = +b.dataset.i, j = a === "up" ? i - 1 : i + 1;
        const L = M.MENETELMAT;
        [L[i], L[j]] = [L[j], L[i]];
        await M.save(); App.render();
      } else if (a === "add") {
        const nimi = await UI.promptSheet({ title: "Uusi menetelmä", label: "Menetelmän nimi", required: true, ok: "Lisää" });
        if (!nimi) return;
        const m = { id: DB.uid("m_"), nimi, lyhyt: nimi.slice(0, 12), kentat: [] };
        M.MENETELMAT.push(m);
        await M.save();
        location.hash = "#/menetelmat/" + m.id;
      } else if (a === "export") {
        const blob = new Blob([JSON.stringify({ muoto: "kuva-sanelu/menetelmat-1", viety: new Date().toISOString(), menetelmat: M.MENETELMAT, sanasto: Vocab.exportAll(), oppi: Learn.exportModel(), tilaoppi: window.PlanRooms ? PlanRooms.exportModel() : null }, null, 2)], { type: "application/json" });
        const el = document.createElement("a");
        el.href = URL.createObjectURL(blob);
        el.download = "menetelmat_" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(el); el.click(); el.remove();
        setTimeout(() => URL.revokeObjectURL(el.href), 20000);
      } else if (a === "import") {
        const files = await UI.pickFile(".json,application/json", false);
        if (!files.length) return;
        try {
          const data = JSON.parse(await files[0].text());
          const lista = data.menetelmat || data;
          if (!Array.isArray(lista)) throw new Error("Tiedostosta ei löytynyt menetelmiä.");
          const korvaa = await confirmSheet({ title: "Tuodaanko " + lista.length + " menetelmää?", text: "Uudet menetelmät lisätään. Valitse, korvataanko tällä laitteella jo olevat samat menetelmät tuodulla versiolla.", ok: "Korvaa samat", cancel: "Lisää vain uudet" });
          await M.yhdista(lista, korvaa);
          if (data.sanasto && Object.keys(data.sanasto).length && await confirmSheet({ title: "Tuodaanko myös sanasto?", text: "Tiedostossa on muokattu sanasto (" + Object.keys(data.sanasto).length + " listaa). Tuodut listat korvaavat tämän laitteen vastaavat listat.", ok: "Tuo sanasto", cancel: "Ei" })) {
            await Vocab.importAll(data.sanasto);
          }
          if ((data.oppi || data.tilaoppi) && await confirmSheet({ title: "Tuodaanko myös opittu malli?", text: "Tiedostossa on kollegan laitteella opittu malli (millainen sanelu kuuluu millekin menetelmälle ja mitä pohjakuvien tilalyhenteet tarkoittavat). Se yhdistetään tämän laitteen malliin.", ok: "Tuo malli", cancel: "Ei" })) {
            if (data.oppi) await Learn.importModel(data.oppi);
            if (data.tilaoppi && window.PlanRooms) PlanRooms.importModel(data.tilaoppi);
          }
          toast("Menetelmät tuotu"); App.render();
        } catch (err) { toast(err.message || "Tuonti epäonnistui", 4000); }
      } else if (a === "learnReset") {
        if (!(await confirmSheet({ title: "Nollataanko oppiminen?", text: "Sovellus unohtaa, millainen sanelu kuuluu millekin menetelmälle. Avainsanoihin perustuva tunnistus toimii edelleen.", ok: "Nollaa", danger: true }))) return;
        await Learn.reset(); toast("Oppiminen nollattu"); App.render();
      } else if (a === "roomLearnReset") {
        if (!(await confirmSheet({ title: "Nollataanko opitut tilalyhenteet?", text: "Sovellus unohtaa tarkistuksissa ja kentällä opitut tilalyhenteet. Sisäänrakennettu sanasto toimii edelleen.", ok: "Nollaa", danger: true }))) return;
        PlanRooms.resetModel(); toast("Tilalyhenteet nollattu"); App.render();
      } else if (a === "reset") {
        if (!(await confirmSheet({ title: "Palautetaanko oletusmenetelmät?", text: "Oletusmenetelmien muutokset korvataan alkuperäisillä. Itse lisätyt menetelmät säilyvät.", ok: "Palauta oletukset", danger: true }))) return;
        await M.palautaOletukset(); toast("Oletukset palautettu"); App.render();
      }
    };
    S.cleanup = () => { root.onclick = null; };
  }

  function learnHtml() {
    const st = Learn.stats();
    const rows = Object.entries(st.menetelmittain).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => "<div>" + esc(M.menetelma(id).nimi) + ": <b>" + String(n).replace(".", ",") + "</b></div>").join("");
    return '<section class="card" style="margin-top:16px"><div class="card-h"><h2>Oppiminen</h2><span class="meta">' + String(Math.round(st.yhteensa)).replace(".", ",") + " esimerkkiä</span></div><div class=\"card-b\">" +
      '<p class="hint" style="margin:0 0 10px">Sovellus oppii valmiista havainnoista, millainen sanelu kuuluu millekin menetelmälle, ja ehdottaa menetelmää, kun avainsanat eivät riitä (merkintä <i>opittu</i>). Itse valittu menetelmä painaa enemmän kuin automaattisesti tunnistettu. Ehdotuksia aletaan tehdä, kun esimerkkejä on vähintään ' + Learn.RAJAT.minEsimerkit + ".</p>" +
      (rows ? '<div style="font-size:14px;line-height:1.6;margin-bottom:10px">' + rows + "</div>" : "") +
      '<button class="btn btn-sm" data-a="learnReset">Nollaa oppiminen</button></div></section>' + roomLearnHtml();
  }
  function roomLearnHtml() {
    if (!window.PlanRooms) return "";
    const st = PlanRooms.stats(), m = PlanRooms.exportModel();
    const list = Object.entries(m.sanat).filter(([k, e]) => e.nimi && e.ok > e.ei).sort((a, b) => b[1].ok - a[1].ok).slice(0, 40)
      .map(([k, e]) => "<div><b>" + esc(k) + "</b> = " + esc(e.nimi) + ' <span class="hint" style="margin:0">(' + e.ok + " vahvistusta" + (e.ei ? ", " + e.ei + " hylkäystä" : "") + ")</span></div>").join("");
    const rej = Object.entries(m.sanat).filter(([k, e]) => e.ei >= 2 && e.ei > e.ok).map(([k]) => esc(k)).join(", ");
    return '<section class="card" style="margin-top:16px"><div class="card-h"><h2>Pohjakuvien tilalyhenteet</h2><span class="meta">' + st.merkintoja + " opittua</span></div><div class=\"card-b\">" +
      '<p class="hint" style="margin:0 0 10px">Sovellus oppii tilojen tunnistuksen tarkistuksista ja kenttäkäytöstä, mitä suunnittelijoiden lyhenteet tarkoittavat. Lyhenne, joka on vahvistettu vähintään kahdesti eikä koskaan hylätty, lisätään jatkossa ilman tarkistusta. Usein hylätty merkintä (esim. kaapin tunnus) ohitetaan.</p>' +
      (list ? '<div style="font-size:14px;line-height:1.6;margin-bottom:10px">' + list + "</div>" : "") +
      (rej ? '<p class="hint" style="margin:0 0 10px">Ohitetaan: ' + rej + "</p>" : "") +
      '<button class="btn btn-sm" data-a="roomLearnReset">Nollaa tilalyhenteet</button></div></section>';
  }

  /* ---------- Yksi menetelmä ---------- */
  async function viewMethod(id) {
    const m = M.MENETELMAT.find((x) => x.id === id);
    if (!m) { location.hash = "#/menetelmat"; return; }
    const n = (await kaytto())[m.id] || 0;
    const flags = (f) => [M.tyyppiNimi(f.t) + (f.u ? " (" + f.u + ")" : ""),
      f.t === "table" && (f.sarakkeet || []).map((c) => c.l).join(", "),
      f.ocr && "kameraluku", f.req && "pakollinen", f.mittaus && "mittaustulos", f.muista && "muistetaan"].filter(Boolean).join(" · ");
    const rows = m.kentat.map((f, i) =>
      '<div class="row" style="cursor:default">' +
      '<button class="grow" data-a="field" data-i="' + i + '" style="background:none;border:none;padding:0;text-align:left;cursor:pointer;min-height:44px">' +
      '<div class="t">' + esc(f.l) + "</div><div class=\"s\">" + esc(flags(f)) + "</div></button>" +
      '<button class="icon-btn" data-a="fup" data-i="' + i + '" aria-label="Siirrä ylös"' + (i === 0 ? " disabled" : "") + ">" + icon("back", "up") + "</button>" +
      '<button class="icon-btn" data-a="fdown" data-i="' + i + '" aria-label="Siirrä alas"' + (i === m.kentat.length - 1 ? " disabled" : "") + ">" + icon("back", "down") + "</button>" +
      "</div>").join("");

    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: m.nimi, sub: n + " havaintoa tällä laitteella", back: "#/menetelmat" }) +
      '<main class="view no-nav">' +
      '<section class="card"><div class="card-b" style="padding-top:14px">' +
      '<label class="field"><span>Nimi</span><input type="text" data-m="nimi" value="' + esc(m.nimi) + '"></label>' +
      '<label class="field" style="margin:0"><span>Lyhenne <span class="u">(havaintokortin otsikossa)</span></span><input type="text" data-m="lyhyt" value="' + esc(m.lyhyt || "") + '" maxlength="14"></label>' +
      "</div></section>" +
      '<section class="card"><div class="card-h"><h2>Sanelun tunnistus</h2>' + (Array.isArray(m.sanat) ? '<span class="meta"><b class="vb-ed">muokattu</b></span>' : "") + '</div><div class="card-b">' +
      '<label class="field"><span>Tunnistussanat <span class="u">(yksi riville)</span></span><textarea data-ms="sanat" spellcheck="false" autocapitalize="off" style="min-height:140px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px">' + esc(Auto.methodWords(m).join("\n")) + "</textarea></label>" +
      '<p class="hint" style="margin:-4px 0 10px">Kun sanelussa on jokin näistä, havainto saa tämän menetelmän. Sana on sanan alku (<b>pintakosteu</b> osuu sanaan pintakosteusmittaus). Lyhyt sana (<b>pko</b>, <b>ra1</b>) kirjoitetaan sellaisenaan.</p>' +
      '<label class="field" style="margin:0"><span>Tunnuksen etuliite <span class="u">(esim. M, RA, MIK, MAK)</span></span><input type="text" data-ms="etuliite" value="' + esc(m.etuliite || "") + '" placeholder="' + esc(Auto.TUNNUS_PREFIX[m.id] || "ei automaattista tunnusta") + '" maxlength="6" autocapitalize="characters"></label>' +
      '<p class="hint" style="margin:6px 0 0">Havainto saa juoksevan tunnuksen (MIK1, MIK2 …), kun menetelmällä on Tunnus-kenttä.</p>' +
      (Array.isArray(m.sanat) || m.etuliite ? '<button class="btn btn-sm" data-a="wordsReset" style="margin-top:10px">Palauta oletussanat</button>' : "") +
      "</div></section>" +
      '<section class="card"><div class="card-h"><h2>Kentät</h2><span class="meta">' + m.kentat.length + "</span></div>" +
      (rows || '<div class="empty">Ei kenttiä. Menetelmä kirjataan silloin pelkällä kuvalla ja sanelulla.</div>') +
      '<div class="card-b" style="padding-top:10px"><button class="btn btn-block" data-a="addField">' + icon("plus") + "Lisää kenttä</button></div></section>" +
      '<p class="hint" style="margin:0 2px 14px">Pakollinen kenttä näkyy lähtötarkistuksessa, jos se on tyhjä. Mittaustulos vaatii tutkijan vahvistuksen, ja ZIP-paketissa se on erillään muista tiedoista.</p>' +
      '<button class="btn btn-block" data-a="hide">' + (m.piilotettu ? "Palauta valittavaksi" : "Piilota valinnoista") + "</button>" +
      (n ? "" : '<div style="height:8px"></div><button class="btn btn-danger btn-block" data-a="del">' + icon("trash") + "Poista menetelmä</button>") +
      (n ? '<p class="hint">Menetelmää on käytetty havainnoissa, joten sitä ei voi poistaa. Piilotettu menetelmä ei näy valinnoissa, mutta vanhat havainnot säilyvät.</p>' : "") +
      "</main>";

    const save = UI.debounce(() => M.save(), 400);
    root.oninput = (e) => {
      const t = e.target;
      if (t.dataset.m) { m[t.dataset.m] = t.value; save(); }
      else if (t.dataset.ms === "sanat") {
        const ls = t.value.split("\n").map((x) => x.trim()).filter((x) => x && !x.startsWith("#"));
        const def = (Auto.METHOD_WORDS[m.id] || []).join("\n");
        if (ls.join("\n") === def) delete m.sanat; else m.sanat = ls;
        save();
      } else if (t.dataset.ms === "etuliite") {
        const v = t.value.trim().toUpperCase().replace(/[^A-ZÅÄÖ]/g, "");
        if (v) m.etuliite = v; else delete m.etuliite;
        save();
      }
    };
    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === "field") { if (await fieldSheet(m, m.kentat[+b.dataset.i])) App.render(); }
      else if (a === "wordsReset") { delete m.sanat; delete m.etuliite; await M.save(); App.render(); }
      else if (a === "addField") { if (await fieldSheet(m, null)) App.render(); }
      else if (a === "fup" || a === "fdown") {
        const i = +b.dataset.i, j = a === "fup" ? i - 1 : i + 1;
        [m.kentat[i], m.kentat[j]] = [m.kentat[j], m.kentat[i]];
        await M.save(); App.render();
      } else if (a === "hide") {
        if (!m.piilotettu && M.aktiiviset().length <= 1) { toast("Vähintään yksi menetelmä on oltava valittavissa"); return; }
        m.piilotettu = !m.piilotettu; await M.save(); App.render();
      } else if (a === "del") {
        if (!(await confirmSheet({ title: "Poistetaanko " + m.nimi + "?", ok: "Poista menetelmä", danger: true }))) return;
        M.MENETELMAT = M.MENETELMAT.filter((x) => x.id !== m.id);
        await M.save(); location.hash = "#/menetelmat";
      }
    };
    S.cleanup = () => { save.flush(); root.oninput = root.onclick = null; };
  }

  /* ---------- Kentän muokkaus ---------- */
  function fieldSheet(m, f) {
    const isNew = !f;
    f = f || { k: DB.uid("k_"), l: "", t: "text" };
    return new Promise((resolve) => {
      sheet(
        "<h3>" + (isNew ? "Uusi kenttä" : "Muokkaa kenttää") + "</h3>" +
        '<label class="field"><span>Otsikko</span><input type="text" data-f="l" value="' + esc(f.l) + '" autofocus></label>' +
        '<div class="grid2"><label class="field"><span>Tyyppi</span><select data-f="t">' +
        M.KENTTATYYPIT.map((t) => '<option value="' + t.v + '"' + (t.v === f.t ? " selected" : "") + ">" + esc(t.l) + "</option>").join("") + "</select></label>" +
        '<label class="field" data-show="u"><span>Yksikkö</span><input type="text" data-f="u" value="' + esc(f.u || "") + '" placeholder="esim. %, °C, mm"></label></div>' +
        '<label class="field" data-show="o"><span>Vaihtoehdot <span class="u">(yksi riville)</span></span><textarea data-f="o">' + esc((f.o || []).join("\n")) + "</textarea></label>" +
        '<div data-show="cols" class="sect"><span class="label">Sarakkeet</span><div data-cols></div>' +
        '<button class="btn btn-sm" data-addcol style="margin-top:6px">' + icon("plus") + "Lisää sarake</button>" +
        '<p class="hint">Ryhmittely: rivit ryhmitellään tämän sarakkeen mukaan, esim. mittaussyvyys. Rinnakkaiset mittaukset tehdään samalla arvolla.</p>' +
        '<div style="margin-top:12px">' + chk("ocr", "Kameraluku mittarin näytöltä", "Vaisala HM40 -sarjan näyttö (T, RH, a). Jokaisesta kuvasta syntyy rivi.", !!f.ocr) + "</div>" +
        '<div class="grid2" data-ocrmap style="margin-top:10px"><label class="field"><span>RH-sarake</span><select data-map="RH"></select></label>' +
        '<label class="field"><span>Lämpötilasarake</span><select data-map="T"></select></label>' +
        '<label class="field"><span>Absoluuttinen kosteus</span><select data-map="a"></select></label></div>' +
        '<p class="hint">Päivämääräsarake täyttyy automaattisesti kuvaus- tai lisäyspäivällä (lukupäivä).</p></div>' +
        '<div style="display:flex;flex-direction:column;gap:12px;margin:4px 0 16px">' +
        chk("req", "Pakollinen", "Lähtötarkistus muistuttaa, jos kenttä on tyhjä.", f.req) +
        '<div data-show="mittaus">' + chk("mittaus", "Mittaustulos", "Tutkija vahvistaa arvon. Viedään erillään muista tiedoista.", f.mittaus) + "</div>" +
        chk("muista", "Muista edellinen arvo", "Esim. mittalaite täyttyy valmiiksi seuraavaan havaintoon.", f.muista) +
        "</div>" +
        '<label class="field" data-show="sanat"><span>Tunnistussanat <span class="u">(pilkuin erotettuna)</span></span><input type="text" data-f="sanat" value="' + esc((f.sanat || []).join(", ")) + '" placeholder="' + esc(window.FieldFill ? FieldFill.wordsFor(Object.assign({}, f, { sanat: null })).join(", ") : "") + '" autocapitalize="off"></label>' +
        '<p class="hint" data-show="sanat" style="margin:-6px 0 14px">Sanat, joiden jälkeen sanelussa tuleva arvo kirjataan tähän kenttään (esim. <i>pko-arvo 120</i>). Tyhjänä käytetään oletuksia.</p>' +
        '<div class="row-btns">' + (isNew ? '<button class="btn" data-close>Peruuta</button>' : '<button class="btn btn-danger" data-del>Poista kenttä</button>') +
        '<button class="btn btn-primary" data-ok>Tallenna</button></div>',
        (el, close) => {
          const $ = (s) => el.querySelector(s);
          // Taulukon sarakkeiden työkopio
          let cols = JSON.parse(JSON.stringify(f.sarakkeet || [
            { k: DB.uid("c_"), l: "", t: "num" }
          ]));
          const ocrMap = Object.assign({}, f.ocr || {});
          const readCols = () => {
            el.querySelectorAll("[data-col]").forEach((r) => {
              const c = cols[+r.dataset.col];
              c.l = r.querySelector('[data-cf="l"]').value.trim();
              c.t = r.querySelector('[data-cf="t"]').value;
              c.u = r.querySelector('[data-cf="u"]').value.trim() || undefined;
              c.mittaus = (c.t === "num" && r.querySelector('[data-cf="mittaus"]').checked) || undefined;
              c.req = r.querySelector('[data-cf="req"]').checked || undefined;
              c.ryhma = r.querySelector('[data-cf="ryhma"]').checked || undefined;
            });
            el.querySelectorAll("[data-map]").forEach((sel) => { ocrMap[sel.dataset.map] = sel.value || undefined; });
          };
          const paintCols = () => {
            $("[data-cols]").innerHTML = cols.map((c, i) =>
              '<div data-col="' + i + '" style="border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px">' +
              '<div style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1fr) 44px;gap:6px;align-items:end">' +
              '<label class="field" style="margin:0"><span>Otsikko</span><input type="text" data-cf="l" value="' + esc(c.l) + '"></label>' +
              '<label class="field" style="margin:0"><span>Tyyppi</span><select data-cf="t"><option value="num"' + (c.t === "num" ? " selected" : "") + '>Numero</option><option value="text"' + (c.t === "text" ? " selected" : "") + ">Teksti</option>" + '<option value="date"' + (c.t === "date" ? " selected" : "") + ">Päivämäärä</option></select></label>" +
              '<label class="field" style="margin:0"><span>Yksikkö</span><input type="text" data-cf="u" value="' + esc(c.u || "") + '"></label>' +
              '<button class="icon-btn" data-delcol="' + i + '" aria-label="Poista sarake">' + icon("trash") + "</button></div>" +
              '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:14px">' +
              '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-cf="req"' + (c.req ? " checked" : "") + ' style="width:20px;height:20px">Pakollinen</label>' +
              '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-cf="mittaus"' + (c.mittaus ? " checked" : "") + ' style="width:20px;height:20px">Mittaustulos</label>' +
              '<label style="display:flex;gap:6px;align-items:center"><input type="radio" name="ryhma" data-cf="ryhma"' + (c.ryhma ? " checked" : "") + ' style="width:20px;height:20px">Ryhmittely</label>' +
              "</div></div>").join("");
            const nums = cols.filter((c) => c.t === "num");
            el.querySelectorAll("[data-map]").forEach((sel) => {
              const k = sel.dataset.map;
              sel.innerHTML = (k !== "RH" ? '<option value="">Ei käytössä</option>' : '<option value="">Valitse</option>') +
                nums.map((c) => '<option value="' + esc(c.k) + '"' + (ocrMap[k] === c.k ? " selected" : "") + ">" + esc(c.l || "(nimetön)") + "</option>").join("");
            });
            $("[data-ocrmap]").classList.toggle("hidden", !$('[data-c="ocr"]').checked);
          };
          el.addEventListener("click", (e) => {
            const add = e.target.closest("[data-addcol]");
            const del = e.target.closest("[data-delcol]");
            if (add) { readCols(); cols.push({ k: DB.uid("c_"), l: "", t: "num" }); paintCols(); }
            else if (del) { readCols(); if (cols.length <= 1) { toast("Taulukossa on oltava vähintään yksi sarake"); return; } cols.splice(+del.dataset.delcol, 1); paintCols(); }
          });
          el.addEventListener("change", (e) => {
            if (e.target.matches('[data-cf="l"],[data-cf="t"],[data-c="ocr"]')) { readCols(); paintCols(); }
          });

          const vis = () => {
            const t = $('[data-f="t"]').value;
            $('[data-show="u"]').classList.toggle("hidden", !(t === "num" || t === "text"));
            $('[data-show="o"]').classList.toggle("hidden", t !== "select");
            $('[data-show="mittaus"]').classList.toggle("hidden", t !== "num");
            $('[data-show="cols"]').classList.toggle("hidden", t !== "table");
            $('[data-c="muista"]').closest("label").classList.toggle("hidden", t === "table");
            el.querySelectorAll('[data-show="sanat"]').forEach((x) => x.classList.toggle("hidden", t === "table" || t === "date"));
            if (t === "table") paintCols();
          };
          $('[data-f="t"]').addEventListener("change", vis);
          vis();
          $("[data-ok]").addEventListener("click", async () => {
            const l = $('[data-f="l"]').value.trim();
            if (!l) { toast("Anna kentälle otsikko"); return; }
            const t = $('[data-f="t"]').value;
            const o = $('[data-f="o"]').value.split("\n").map((x) => x.trim()).filter(Boolean);
            if (t === "select" && o.length < 2) { toast("Valintalistassa on oltava vähintään kaksi vaihtoehtoa"); return; }
            let tableDef = null;
            if (t === "table") {
              readCols();
              if (cols.some((c) => !c.l)) { toast("Anna jokaiselle sarakkeelle otsikko"); return; }
              const useOcr = $('[data-c="ocr"]').checked;
              if (useOcr && !ocrMap.RH) { toast("Valitse kameraluvun RH-sarake"); return; }
              tableDef = { sarakkeet: cols, ocr: useOcr ? { laite: "vaisala", RH: ocrMap.RH, T: ocrMap.T || undefined, a: ocrMap.a || undefined } : undefined };
            }
            f.l = l; f.t = t;
            f.u = (t === "num" || t === "text") ? $('[data-f="u"]').value.trim() || undefined : undefined;
            f.o = t === "select" ? o : undefined;
            f.req = $('[data-c="req"]').checked || undefined;
            f.mittaus = (t === "num" && $('[data-c="mittaus"]').checked) || undefined;
            f.muista = (t !== "table" && $('[data-c="muista"]').checked) || undefined;
            f.sarakkeet = tableDef ? tableDef.sarakkeet : undefined;
            f.ocr = tableDef ? tableDef.ocr : undefined;
            const sw = $('[data-f="sanat"]').value.split(",").map((x) => x.trim()).filter(Boolean);
            f.sanat = sw.length && t !== "table" && t !== "date" ? sw : undefined;
            if (isNew) m.kentat.push(f);
            await M.save();
            close(true);
          });
          const del = $("[data-del]");
          if (del) del.addEventListener("click", async () => {
            close(false);
            if (!(await confirmSheet({ title: "Poistetaanko kenttä " + f.l + "?", text: "Kenttään jo kirjatut arvot jäävät havaintojen tietoihin, mutta niitä ei enää näytetä eikä viedä.", ok: "Poista kenttä", danger: true }))) return;
            m.kentat = m.kentat.filter((x) => x !== f);
            await M.save(); App.render();
          });
        },
        { onClose: (v) => resolve(v === true) }
      );
    });
  }

  function chk(key, label, hint, on) {
    return '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-c="' + key + '"' + (on ? " checked" : "") +
      ' style="width:22px;height:22px;flex:0 0 auto;margin-top:1px"><span><b style="font-size:15px">' + label + '</b><br><span class="hint" style="margin:0">' + hint + "</span></span></label>";
  }

  window.Editor = { viewList, viewMethod };
})();
