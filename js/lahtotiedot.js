/* =========================================================================
   lahtotiedot.js – Lähtötiedot-vaihe (#/k/<id>/lahtotiedot)

   Yksi paikka kaikille lähtötiedoille. Kaikki tavat näkyvät kerralla:
     - Clauden lähtötietopaketti (suositus)            #/k/<id>/lahtotiedot/claude
     - Tarjous tai tutkimussuunnitelma (PDF, puhelin)   PlanImport.importPdf
     - Pohjakuvat kerroksittain                         #/k/<id>/lahtotiedot/pohjat
     - Asiakirjat ja piirustukset (puhelin, taustalla)  KaLahto.lisaa
     - Syötä itse                                       #/k/<id>/lahtotiedot/itse
     - Projektikansio (tulossa)
   Uusi kohde avautuu tähän. Tapoja voi yhdistää ja palata myöhemmin.
   Tehdyt tavat merkitään kohteelle: kohde.lahtoTila = { claude, tarjous, pohjat, asiakirjat, itse }.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  const { S, Model } = App;
  const app = () => document.getElementById("app");
  const base = () => "#/k/" + S.kohde.id + "/lahtotiedot";
  const merkitse = async (avain) => { S.kohde.lahtoTila = Object.assign({}, S.kohde.lahtoTila, { [avain]: Date.now() }); await Model.saveKohde(); };

  /* ---------- L0: valitse tapa ---------- */
  function kortti(o) {
    const tehty = o.tehty ? '<span class="lt-tehty">' + icon("check") + esc(o.tehty) + "</span>" : "";
    const sis = '<span class="lt-ik">' + icon(o.ikoni) + '</span><span class="lt-tx"><span class="lt-t">' + esc(o.nimi) + "</span>" +
      '<span class="lt-s">' + esc(o.kuvaus) + "</span>" + tehty + "</span>" + (o.disabled ? "" : icon("back", "flip"));
    if (o.disabled) return '<div class="lt-kortti disabled">' + sis + "</div>";
    return o.href ? '<a class="lt-kortti" href="' + o.href + '">' + sis + "</a>" : '<button class="lt-kortti" data-lt="' + o.act + '">' + sis + "</button>";
  }

  async function view(sub, q) {
    if (sub === "claude") return viewClaude();
    if (sub === "pohjat") return viewPohjat();
    if (sub === "itse") return viewItse();
    const k = S.kohde, t = k.lahtoTila || {};
    const uusi = q && q.uusi;
    const plans = k.kerrokset.filter((e) => e.planId).length;
    const docs = KaLahto.siirra(k).length;
    app().innerHTML = App.topbar({ title: "Lähtötiedot", sub: uusi ? "Uusi kohde · valitse, miten tuot tiedot" : k.nimi, back: "#/k/" + k.id }) +
      '<main class="view no-nav">' + KaLahto.tilaHtml() +
      '<a class="lt-kortti suositus" href="' + base() + '/claude">' +
        '<span class="lt-ik">' + icon("download") + '</span><span class="lt-tx"><span class="lt-t">Clauden lähtötietopaketti <span class="lt-badge">Suositus</span></span>' +
        '<span class="lt-s">Kaikki aineisto kerralla · tarkin</span>' +
        '<span class="lt-chips"><span>Suunnitelma</span><span>Kerrokset ja tilat</span><span>Pohjakuvat</span><span>Kuntoarvio</span><span>Huomioitavaa</span></span>' +
        (t.claude ? '<span class="lt-tehty">' + icon("check") + "Tuotu " + UI.pvm(t.claude) + "</span>" : "") + "</span>" + icon("back", "flip") + "</a>" +
      '<div class="lt-otsikko">Lue puhelimessa · toimii ilman verkkoa</div>' +
      kortti({ act: "tarjous", ikoni: "list", nimi: "Tarjous tai tutkimussuunnitelma", kuvaus: "PDF → tutkimussuunnitelma · sekunteja", tehty: t.tarjous ? "Luettu " + UI.pvm(t.tarjous) : "" }) +
      kortti({ href: base() + "/pohjat", ikoni: "plan", nimi: "Pohjakuvat", kuvaus: "PDF tai kuva → kerrokset ja tilat · alle minuutti / kerros", tehty: plans ? plans + " / " + k.kerrokset.length + " kerroksella pohjakuva" : "" }) +
      kortti({ act: "asiakirjat", ikoni: "upload", nimi: "Asiakirjat ja piirustukset", kuvaus: "Isännöitsijäntodistus, leikkaukset … → kuntoarvio · minuutteja", tehty: docs ? docs + " tiedostoa" : "" }) +
      '<div class="lt-otsikko">Ilman asiakirjoja</div>' +
      kortti({ href: base() + "/itse", ikoni: "edit", nimi: "Syötä itse", kuvaus: "Nimi, tutkimukset ja kerrokset valitsemalla", tehty: t.itse ? "Tallennettu " + UI.pvm(t.itse) : "" }) +
      kortti({ disabled: true, ikoni: "image", nimi: "Projektikansio (Teams / SharePoint)", kuvaus: "Tulossa" }) +
      (docs ? '<details class="card vocab" style="margin-top:14px"><summary class="card-h"><h2>Liitetyt tiedostot</h2><span class="meta">' + docs + "</span></summary><div class=\"card-b\">" +
        KaLahto.siirra(k).map((x) => '<div class="row" style="padding:8px 0"><div class="grow"><div class="t">' + esc(x.nimi) + '</div><div class="s">' + esc(x.laji || "") + "</div></div>" +
          '<button class="icon-btn" data-lahto-del="' + x.id + '" aria-label="Poista tiedosto">' + icon("trash") + "</button></div>").join("") +
        '<p class="hint">Tiedostot kulkevat ZIP-paketissa kansiossa lahtotiedot/.</p></div></details>' : "") +
      '<p class="hint" style="text-align:center;margin:16px 8px 6px">Tapoja voi yhdistää, esim. Clauden paketti nyt ja pohjakuvat myöhemmin. Tänne pääsee kohteen sivulta milloin tahansa.</p>' +
      '<a class="btn btn-block" href="#/k/' + k.id + '" style="margin-top:6px">' + (uusi ? "Aloita ilman lähtötietoja" : "Valmis") + "</a>" +
      "</main>";
    const paivita = () => { if (/\/lahtotiedot($|\?)/.test(location.hash)) view(null, q); };
    app().onclick = async (e) => {
      const b = e.target.closest("[data-lt]");
      if (b && b.dataset.lt === "tarjous") { await PlanImport.importPdf(); return; }
      if (b && b.dataset.lt === "asiakirjat") { KaLahto.lisaa(paivita); paivita(); return; }
      const d = e.target.closest("[data-lahto-del]");
      if (d) KaLahto.poista(d.dataset.lahtoDel, paivita);
    };
    const kuuntele = () => paivita();
    document.addEventListener("ks-lahto", kuuntele);
    S.cleanup = () => { app().onclick = null; document.removeEventListener("ks-lahto", kuuntele); };
    // Jaa-valikosta tulleet tiedostot: käsitellään kerran (merkintä pois osoitteesta)
    if (q && q.jaettu && window.Jaa) {
      history.replaceState(null, "", location.hash.replace(/[?&]jaettu=1/, "").replace(/\?$/, ""));
      Jaa.kasittele(paivita);
    }
  }

  /* ---------- L1: Clauden paketti ---------- */
  function viewClaude() {
    const k = S.kohde;
    let tab = "tiedosto";
    app().innerHTML = App.topbar({ title: "Clauden lähtötietopaketti", sub: "Lähtötiedot", back: base() }) +
      '<main class="view no-nav">' +
      '<section class="card"><div class="card-h"><h2>1 · Tee paketti Claudessa</h2></div><div class="card-b"><ol class="start-steps">' +
        "<li>Avaa Claudessa projekti <b>Lähtötiedot</b> ja aloita uusi keskustelu.</li>" +
        "<li>Lisää kaikki kohteen asiakirjat: tarjous, piirustukset, isännöitsijäntodistus …</li>" +
        "<li>Claude antaa ZIP-paketin <i>lahtotiedot-….zip</i> (paketti ja tiedostot) tai pelkän .json-tiedoston.</li></ol></div></section>" +
      '<section class="card"><div class="card-h"><h2>2 · Tuo paketti</h2></div><div class="card-b">' +
        '<div class="seg lt-tabs" role="tablist"><button role="tab" data-tab="tiedosto" aria-selected="true">Tiedosto</button><button role="tab" data-tab="teksti" aria-selected="false">Liitä teksti</button></div>' +
        '<div data-pane="tiedosto"><button class="btn btn-block lt-drop" data-tiedosto>' + icon("upload") + "Valitse paketti (.zip tai .json)</button></div>" +
        '<div data-pane="teksti" class="hidden"><label class="field"><span>Paketin teksti</span><textarea data-teksti rows="6" placeholder="Kopioi Clauden vastaus kokonaan ja liitä tähän"></textarea></label>' +
        '<button class="btn btn-primary btn-block" data-jatka>Jatka</button></div>' +
      "</div></section>" +
      '<p class="hint">Seuraavaksi näet kaikki poimitut tiedot lähteineen ja hyväksyt ne. Lopuksi liität alkuperäiset tiedostot, jolloin pohjakuvat asettuvat kerroksille.</p>' +
      "</main>";
    const el = app();
    const valmis = () => { location.hash = "#/k/" + k.id; };
    el.onclick = async (e) => {
      const t = e.target.closest("[data-tab]");
      if (t) {
        tab = t.dataset.tab;
        el.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.tab === tab)));
        el.querySelectorAll("[data-pane]").forEach((x) => x.classList.toggle("hidden", x.dataset.pane !== tab));
        return;
      }
      if (e.target.closest("[data-tiedosto]")) {
        const f = await UI.pickFile(".json,.zip,application/json,application/zip,text/plain", false);
        if (f.length && await Paketti.tuoTiedosto(f[0])) valmis();
        return;
      }
      if (e.target.closest("[data-jatka]")) {
        const v = el.querySelector("[data-teksti]").value;
        if (!v.trim()) { toast("Liitä ensin paketin teksti"); return; }
        if (await Paketti.kasittele(v)) valmis();
      }
    };
    S.cleanup = () => { el.onclick = null; };
  }

  /* ---------- L3: pohjakuvat kerroksittain ---------- */
  // Kerros tiedoston nimestä: "Pohja_1krs", "2. kerros", "kellari", "1.-KERROS"
  function arvaaKerros(nimi) {
    const n = nimi.toLowerCase().replace(/[_\-]+/g, " ");
    if (/kellari|kjk|maanalai/.test(n)) return "Kellari";
    if (/ullakko|vintti/.test(n)) return "Ullakko";
    let m = n.match(/(\d)\s*\.?\s*(krs|kerros)/) || n.match(/kerros\s*(\d)/);
    if (m) return m[1] + ". krs";
    return null;
  }
  function viewPohjat() {
    const k = S.kohde;
    const rivit = k.kerrokset.map((e) => {
      const n = k.tilat.filter((t) => t.kerrosId === e.id).length, pos = k.tilat.filter((t) => t.kerrosId === e.id && t.pos).length;
      return '<div class="row" style="padding:10px 0"><span class="lt-ik">' + icon("plan") + '</span><div class="grow"><div class="t">' + esc(e.nimi) + '</div><div class="s">' +
        esc((e.planId ? "Pohjakuva lisätty" : "Ei pohjakuvaa") + " · " + n + " tilaa" + (n && e.planId ? ", " + pos + " merkitty" : "")) + "</div></div>" +
        (e.planId ? '<a class="btn btn-sm" href="#/k/' + k.id + "/pohja?kerros=" + e.id + '">Avaa</a>' : '<button class="btn btn-sm" data-yksi="' + e.id + '">Lisää</button>') + "</div>";
    }).join("");
    app().innerHTML = App.topbar({ title: "Pohjakuvat", sub: "Yksi kuva tai PDF-sivu per kerros", back: base() }) +
      '<main class="view no-nav">' +
      '<section class="card"><div class="card-h"><h2>Kerrokset</h2><span class="meta">' + k.kerrokset.length + "</span></div><div class=\"card-b\">" + (rivit || '<p class="hint" style="margin:0">Ei vielä kerroksia. Kerrokset luodaan pohjakuvia lisättäessä tiedostonimen perusteella.</p>') + "</div></section>" +
      '<button class="btn btn-primary btn-block" data-monta>' + icon("upload") + "Lisää pohjakuvia (voit valita useita)</button>" +
      '<p class="hint">Kerros arvataan tiedoston nimestä (esim. ”Pohja_2krs”, ”kellari”), ja voit vaihtaa sen ennen lisäystä. Tilat tunnistetaan jokaisesta kuvasta, ja tarkistat ne. Paperisesta pohjasta voi ottaa myös valokuvan.</p>' +
      '<a class="btn btn-block" href="' + base() + '" style="margin-top:10px">Valmis</a>' +
      "</main>";
    const el = app();
    el.onclick = async (e) => {
      const y = e.target.closest("[data-yksi]");
      if (y) {
        const ker = k.kerrokset.find((x) => x.id === y.dataset.yksi);
        const fs = await UI.pickFile("image/*,application/pdf", false);
        if (fs.length && ker) { await Plan.asetaPohja(ker, fs[0]); await merkitse("pohjat"); }
        if (/\/lahtotiedot\/pohjat/.test(location.hash)) viewPohjat();
        return;
      }
      if (e.target.closest("[data-monta]")) {
        const fs = await UI.pickFile("image/*,application/pdf", true);
        if (!fs.length) return;
        if (await lisaaPohjat(fs)) { location.hash = base() + "/pohjat"; viewPohjat(); }
      }
    };
    S.cleanup = () => { el.onclick = null; };
  }
  /* Useita pohjakuvia: kerros arvataan tiedostonimestä ja tutkija vahvistaa (myös jaetut tiedostot) */
  async function lisaaPohjat(fs) {
    const k = S.kohde;
    const valinnat = await kerrosValinta(fs);
    if (!valinnat) return false;
    for (const v of valinnat) {
      let ker = k.kerrokset.find((x) => x.nimi.toLowerCase() === v.kerros.toLowerCase());
      if (!ker) { ker = { id: DB.uid("e_"), nimi: v.kerros, planId: null }; k.kerrokset.push(ker); await Model.saveKohde(); }
      UI.toast("Pohjakuva: " + ker.nimi, 3000);
      await Plan.asetaPohja(ker, v.file);
    }
    await merkitse("pohjat");
    return true;
  }

  function kerrosValinta(files) {
    const k = S.kohde;
    const vapaat = k.kerrokset.filter((e) => !e.planId).map((e) => e.nimi);
    const nimet = Array.from(new Set(k.kerrokset.map((e) => e.nimi).concat(["Kellari", "1. krs", "2. krs", "3. krs", "Ullakko"])));
    const oletus = files.map((f, i) => arvaaKerros(f.name) || vapaat[i] || (i + 1) + ". krs");
    return new Promise((res) => {
      let tulos = null;
      UI.sheet("<h3>Mille kerrokselle?</h3>" +
        files.map((f, i) => '<label class="field"><span>' + esc(f.name) + '</span><select data-k="' + i + '">' +
          Array.from(new Set(nimet.concat([oletus[i]]))).map((n) => '<option' + (n === oletus[i] ? " selected" : "") + ">" + esc(n) + "</option>").join("") +
          '<option value="__uusi">Muu kerros…</option></select></label>').join("") +
        '<div class="row-btns"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Lisää ' + files.length + (files.length === 1 ? " pohjakuva" : " pohjakuvaa") + "</button></div>",
      (el, close) => {
        el.addEventListener("change", async (e) => {
          const s = e.target.closest("select[data-k]");
          if (!s || s.value !== "__uusi") return;
          const v = await UI.promptSheet({ title: "Kerroksen nimi", placeholder: "esim. 4. krs, Pohjakerros" });
          if (v && v.trim()) { const o = document.createElement("option"); o.textContent = v.trim(); s.insertBefore(o, s.lastElementChild); s.value = v.trim(); }
          else s.value = oletus[+s.dataset.k];
        });
        el.querySelector("[data-ok]").addEventListener("click", () => {
          tulos = files.map((f, i) => ({ file: f, kerros: el.querySelector('select[data-k="' + i + '"]').value }));
          close();
        });
      }, { onClose: () => res(tulos) });
    });
  }

  /* ---------- L5: syötä itse ---------- */
  function viewItse() {
    const k = S.kohde;
    const kaikki = M.MENETELMAT.filter((m) => !m.piilotettu && m.id !== "muu");
    const olemassa = new Set(k.suunnitelma.filter((p) => !p.pois).map((p) => p.menetelma));
    const valitut = new Set();
    const kerrokset = k.kerrokset.map((e) => e.nimi);
    const uudetKerrokset = [];
    const paint = () => {
      app().querySelector("[data-met]").innerHTML = kaikki.map((m) => {
        const on = olemassa.has(m.id) || valitut.has(m.id);
        return '<button class="chip" data-m="' + m.id + '" aria-pressed="' + on + '"' + (olemassa.has(m.id) ? " disabled" : "") + ">" + esc(m.nimi) + "</button>";
      }).join("");
      app().querySelector("[data-ker]").innerHTML = kerrokset.concat(uudetKerrokset).map((n) => '<span class="chip" aria-pressed="true">' + esc(n) + "</span>").join("") +
        '<button class="chip lt-lisaa" data-uusiker>+ Lisää kerros</button>';
      app().querySelector("[data-maara]").textContent = (olemassa.size + valitut.size) + " valittu" + (olemassa.size ? " (harmaat ovat jo suunnitelmassa)" : "");
    };
    app().innerHTML = App.topbar({ title: "Syötä itse", sub: "Kaiken voi täydentää myöhemmin", back: base() }) +
      '<main class="view no-nav">' +
      '<section class="card"><div class="card-b" style="padding-top:14px">' +
        '<label class="field"><span>Kohteen nimi</span><input type="text" data-f="nimi" value="' + esc(k.nimiTilapainen ? "" : k.nimi || "") + '" placeholder="esim. As Oy Esimerkki"></label>' +
        '<label class="field"><span>Osoite</span><input type="text" data-f="osoite" value="' + esc(k.osoite || "") + '" placeholder="Katu, postinumero, kunta"></label></div></section>' +
      '<section class="card"><div class="card-h"><h2>Tutkimukset</h2><span class="meta" data-maara></span></div><div class="card-b"><div class="chips" data-met></div>' +
        '<p class="hint">Määrät ja tarkennukset voi lisätä suunnitelmassa.</p></div></section>' +
      '<section class="card"><div class="card-h"><h2>Kerrokset</h2></div><div class="card-b"><div class="chips" data-ker></div></div></section>' +
      '<button class="btn btn-primary btn-block" data-tallenna>Tallenna</button>' +
      "</main>";
    paint();
    const el = app();
    el.onclick = async (e) => {
      const m = e.target.closest("[data-m]");
      if (m && !m.disabled) { valitut.has(m.dataset.m) ? valitut.delete(m.dataset.m) : valitut.add(m.dataset.m); paint(); return; }
      if (e.target.closest("[data-uusiker]")) {
        const v = await UI.promptSheet({ title: "Uusi kerros", placeholder: "esim. 2. krs, Kellari" });
        if (v && v.trim() && !kerrokset.concat(uudetKerrokset).some((x) => x.toLowerCase() === v.trim().toLowerCase())) { uudetKerrokset.push(v.trim()); paint(); }
        return;
      }
      if (e.target.closest("[data-tallenna]")) {
        const nimi = el.querySelector('[data-f="nimi"]').value.trim(), osoite = el.querySelector('[data-f="osoite"]').value.trim();
        if (nimi) { k.nimi = nimi; delete k.nimiTilapainen; }
        k.osoite = osoite;
        valitut.forEach((id) => k.suunnitelma.push({ id: DB.uid("p_"), menetelma: id, kuvaus: "", maara: 1, tilaId: null, pois: null, lahde: "kasin" }));
        uudetKerrokset.forEach((n) => k.kerrokset.push({ id: DB.uid("e_"), nimi: n, planId: null }));
        k.lahtoTila = Object.assign({}, k.lahtoTila, { itse: Date.now() });
        await Model.saveKohde();
        toast("Tallennettu" + (valitut.size ? ": " + valitut.size + " tutkimusta suunnitelmaan" : ""), 2500);
        location.hash = "#/k/" + k.id;
      }
    };
    S.cleanup = () => { el.onclick = null; };
  }

  window.Lahtotiedot = { view, arvaaKerros, lisaaPohjat };
})();
