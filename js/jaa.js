/* Jakokohde: Androidin Jaa-valikosta sovellukseen jaetut tiedostot.
   Service worker (sw.js) tallentaa jaetut tiedostot välimuistiin "ks-jaettu" ja avaa #/jaa.
   1) Jaa-näkymä: tutkija valitsee kohteen (uusi tai olemassa oleva) tai palauttaa varmuuskopion.
   2) Lähtötiedot-sivu (?jaettu=1) käsittelee tiedostot:
      - Clauden paketti (.zip / .json / jaettu teksti) -> tarkistusikkuna
      - PDF ja kuvat -> tutkija valitsee: tarjous, pohjakuva tai muu asiakirja (arvaus tiedostonimestä)
   Toimii vain kotinäytölle asennetussa sovelluksessa (Android, Chrome). */
(function () {
  "use strict";
  const { S, Model } = App;
  const { esc, icon, toast } = UI;
  const VALIMUISTI = "ks-jaettu";

  async function lue() {
    const out = { files: [], teksti: "" };
    if (!window.caches) return out;
    try {
      const c = await caches.open(VALIMUISTI);
      const keys = await c.keys();
      keys.sort((a, b) => a.url.localeCompare(b.url, undefined, { numeric: true }));
      for (const req of keys) {
        const r = await c.match(req);
        if (!r) continue;
        if (/\/jaettu\/teksti$/.test(req.url)) { out.teksti = await r.text(); continue; }
        const nimi = decodeURIComponent(r.headers.get("x-nimi") || "tiedosto");
        out.files.push(new File([await r.blob()], nimi, { type: r.headers.get("content-type") || "" }));
      }
    } catch (e) { console.warn(e); }
    return out;
  }
  async function tyhjenna() { try { if (window.caches) await caches.delete(VALIMUISTI); } catch (e) { /* ohita */ } }

  const onZip = (f) => /\.zip$/i.test(f.name) || /zip/.test(f.type);
  const onJson = (f) => /\.json$/i.test(f.name) || /json/.test(f.type);
  const onPaketti = (f) => onZip(f) || onJson(f);
  async function onVarmuuskopio(f) {
    if (!onZip(f)) return false;
    try {
      if (!window.JSZip) await UI.loadScript("lib/jszip.min.js");
      const z = await JSZip.loadAsync(f);
      return !!z.file("varmuuskopio/data.json");
    } catch (e) { return false; }
  }
  function laji(f) {
    if (onZip(f)) return "ZIP";
    if (onJson(f)) return "JSON";
    if (/pdf/.test(f.type) || /\.pdf$/i.test(f.name)) return "PDF";
    if (/^image\//.test(f.type)) return "Kuva";
    return "Tiedosto";
  }
  /* Arvaus tiedostonimestä: tarjous / pohjakuva / asiakirja */
  function arvaaRooli(f) {
    const n = f.name.toLowerCase();
    if (/tarjou|tutkimussuunnit|tilaus|toimeksian/.test(n)) return "tarjous";
    if (/pohja|krs|kerros|kellari|ullak|pohjakuva|pohjapiir/.test(n) && !/leikk|julkisiv|asemapiir/.test(n)) return "pohja";
    return "asiakirja";
  }

  /* ---------- Näkymä: mihin kohteeseen? ---------- */
  async function view() {
    const { files, teksti } = await lue();
    const root = document.getElementById("app");
    const paketti = teksti && teksti.indexOf(Paketti.MUOTO) >= 0;
    if (!files.length && !paketti) {
      root.innerHTML = App.topbar({ title: "Jaettu sovellukseen", back: "#/" }) +
        '<main class="view no-nav"><div class="alert info">' + icon("alert") + "<div>Jaettuja tiedostoja ei löytynyt. Jaa tiedosto uudelleen puhelimen Jaa-valikosta tai valitse se kohteen Lähtötiedot-sivulla.</div></div>" +
        '<a class="btn btn-block" href="#/">Etusivulle</a></main>';
      return;
    }
    const varmuus = [];
    for (const f of files) if (await onVarmuuskopio(f)) varmuus.push(f);
    const kohteet = (await DB.all("kohteet")).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 12);
    root.innerHTML = App.topbar({ title: "Jaettu sovellukseen", sub: (() => { const n = files.length + (paketti ? 1 : 0); return n === 1 ? "1 tiedosto" : n + " tiedostoa"; })(), back: "#/" }) +
      '<main class="view no-nav">' +
      '<section class="card"><div class="card-b">' + files.map((f) =>
        '<div class="row" style="cursor:default">' + icon(onPaketti(f) ? "download" : "image") + '<div class="grow"><div class="t">' + esc(f.name) + '</div><div class="s">' +
        esc(laji(f) + (varmuus.includes(f) ? " · kohteen varmuuskopio" : onPaketti(f) ? " · lähtötietopaketti" : "")) + "</div></div></div>").join("") +
        (paketti ? '<div class="row" style="cursor:default">' + icon("download") + '<div class="grow"><div class="t">Clauden lähtötietopaketti</div><div class="s">jaettu tekstinä</div></div></div>' : "") +
      "</div></section>" +
      (varmuus.length ? '<button class="btn btn-block" data-palauta style="margin-bottom:12px">' + icon("download") + "Palauta kohde varmuuskopiosta</button>" : "") +
      '<section class="card"><div class="card-h"><h2>Mihin kohteeseen?</h2></div>' +
        '<button class="row" data-uusi>' + icon("plus") + '<div class="grow"><div class="t">Uusi kohde</div><div class="s">Nimi täyttyy lähtötiedoista</div></div></button>' +
        kohteet.map((k) => '<button class="row" data-kohde="' + k.id + '">' + icon("list") + '<div class="grow"><div class="t">' + esc(k.nimi || "Nimetön kohde") + "</div>" +
          (k.osoite ? '<div class="s">' + esc(k.osoite) + "</div>" : "") + "</div>" + icon("back", "flip") + "</button>").join("") +
      "</section>" +
      '<button class="btn btn-block" data-peru>Peruuta</button></main>';
    const main = root.querySelector("main");
    main.addEventListener("click", async (e) => {
      if (e.target.closest("[data-peru]")) { await tyhjenna(); location.hash = "#/"; return; }
      if (e.target.closest("[data-palauta]")) {
        try { const id = await Export.restore(varmuus[0]); await tyhjenna(); toast("Kohde palautettu"); location.hash = "#/k/" + id; }
        catch (err) { toast(err.message || "Palautus epäonnistui", 4000); }
        return;
      }
      if (e.target.closest("[data-uusi]")) {
        const tutkija = (() => { try { return localStorage.getItem("ks_tutkija") || ""; } catch (err) { return ""; } })();
        const k = Model.newKohde({ nimi: "Uusi kohde " + UI.pvm(Date.now()), tutkija });
        k.nimiTilapainen = true;
        await DB.put("kohteet", k);
        DB.requestPersist();
        location.hash = "#/k/" + k.id + "/lahtotiedot?uusi=1&jaettu=1";
        return;
      }
      const b = e.target.closest("[data-kohde]");
      if (b) location.hash = "#/k/" + b.dataset.kohde + "/lahtotiedot?jaettu=1";
    });
  }

  /* ---------- Käsittely valitussa kohteessa (Lähtötiedot-sivu kutsuu) ---------- */
  function roolit(muut) {
    return new Promise((res) => {
      let tulos = null;
      const VAL = [["tarjous", "Tarjous / tutkimussuunnitelma"], ["pohja", "Pohjakuva"], ["asiakirja", "Muu asiakirja tai piirustus"]];
      UI.sheet("<h3>Mitä tiedostot ovat?</h3>" +
        '<p class="hint" style="margin:0 0 10px">Arvattu tiedostonimestä. Tarjouksesta luetaan tutkimussuunnitelma, pohjakuvat asetetaan kerroksille ja muista asiakirjoista poimitaan perustiedot.</p>' +
        muut.map((f, i) => '<label class="field"><span>' + esc(f.name) + '</span><select data-r="' + i + '">' +
          VAL.map(([v, t]) => '<option value="' + v + '"' + (arvaaRooli(f) === v ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select></label>").join("") +
        '<div class="row-btns"><button class="btn" data-close>Ohita</button><button class="btn btn-primary" data-ok>Jatka</button></div>',
        (el, close) => {
          el.querySelector("[data-ok]").addEventListener("click", () => {
            tulos = muut.map((f, i) => ({ f, r: el.querySelector('[data-r="' + i + '"]').value }));
            close(tulos);
          });
        }, { onClose: () => res(tulos) });
    });
  }

  async function kasittele(paivita) {
    const { files, teksti } = await lue();
    await tyhjenna();                                   // käsitellään vain kerran
    if (!files.length && !teksti) return;
    const paketit = files.filter(onPaketti), muut = files.filter((f) => !onPaketti(f));
    if (teksti && teksti.indexOf(Paketti.MUOTO) >= 0) await Paketti.kasittele(teksti, paivita);
    for (const f of paketit) await Paketti.tuoTiedosto(f, paivita);
    if (!muut.length) return;
    const valinnat = await roolit(muut);
    if (!valinnat) { toast("Jaetut tiedostot ohitettiin", 2500); return; }
    const pohjat = valinnat.filter((x) => x.r === "pohja").map((x) => x.f);
    const asiak = valinnat.filter((x) => x.r === "asiakirja").map((x) => x.f);
    const tarj = valinnat.filter((x) => x.r === "tarjous").map((x) => x.f);
    if (pohjat.length) await Lahtotiedot.lisaaPohjat(pohjat);
    if (asiak.length) { KaLahto.lisaa(paivita, asiak); }
    for (const f of tarj) await PlanImport.importPdf(f);
    if (paivita) paivita();
  }

  window.Jaa = { view, kasittele, lue, tyhjenna, arvaaRooli };
})();
