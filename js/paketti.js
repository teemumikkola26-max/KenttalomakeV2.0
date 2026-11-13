/* =========================================================================
   paketti.js – Clauden lähtötietopaketin tuonti

   Tutkija antaa lähtötiedot (tarjous, piirustukset, isännöitsijäntodistus …)
   Clauden Lähtötiedot-projektille. Claude palauttaa paketin (JSON, muoto
   "kuva-sanelu-lahtotiedot", versio 1). Tässä paketti:
     1. luetaan tiedostosta tai liitetystä tekstistä
     2. tarkistetaan (muoto, tunnukset, järkevät arvot)
     3. näytetään yhtenä koottuna tarkistuksena lähteineen
     4. hyväksytyt tiedot viedään paikoilleen: suunnitelma, kerrokset ja tilat,
        kuntoarvio, huomioitavaa
     5. tutkija liittää alkuperäiset tiedostot: ne tallentuvat lähtötiedoiksi
        (ZIP: lahtotiedot/), ja paketissa pohjakuviksi merkityt asetetaan kerroksille.
   Mitään ei korvata hiljaa: jo kirjattu tieto näytetään ehdotuksen vieressä.
   Kuvaus paketin muodosta: claude-projekti/lahtotietopaketti-v1.md
   ========================================================================= */
(function () {
  "use strict";
  const MUOTO = "kuva-sanelu-lahtotiedot", VERSIO = 1;
  const { S, Model } = App;
  const lc = (x) => String(x == null ? "" : x).toLowerCase();
  const norm = (x) => lc(x).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const PERUS = { rakennustyyppi: "Rakennustyyppi", rakennusvuosi: "Rakennusvuosi", pintaala: "Huoneistoala / pinta-ala (m²)", huoneistoja: "Huoneistoja (kpl)",
    huoneistotyypit: "Huoneistotyypit", kerrosala: "Kerrosala (m²)", tilavuus: "Tilavuus (m³)", tontti: "Tontin pinta-ala (m²)", perustukset: "Perustukset",
    runko: "Runko", julkisivu: "Julkisivu", vesikatto: "Vesikatto ja katemateriaali", lammitys: "Lämmitys" };

  /* Arvo voi olla suoraan arvo tai { arvo, lahde, varmuus } */
  const arvo = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x.arvo : x);
  const lahdeTeksti = (x) => {
    const l = (x && x.lahde) || null;
    if (!l) return "";
    return [l.ote ? "”" + String(l.ote).slice(0, 160) + "”" : "", l.tiedosto, l.sivu ? "s. " + l.sivu : ""].filter(Boolean).join(" · ");
  };
  const epavarma = (x) => !!(x && typeof x === "object" && /epävarma|epavarma|arvio/i.test(x.varmuus || ""));

  /* ---------- Luku ja tarkistus ---------- */
  function jasenna(teksti) {
    let t = String(teksti || "").trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1];
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("Tekstistä ei löytynyt pakettia. Kopioi Clauden vastauksesta koko JSON-osa.");
    let j;
    try { j = JSON.parse(t.slice(a, b + 1)); } catch (e) { throw new Error("Paketti on katkennut tai virheellinen (" + e.message + "). Pyydä Claudea antamaan paketti uudelleen tiedostona."); }
    if (j.muoto !== MUOTO) throw new Error("Tämä ei ole lähtötietopaketti (muoto puuttuu tai on väärä).");
    if ((j.versio | 0) > VERSIO) throw new Error("Paketin versio " + j.versio + " on uudempi kuin sovellus ymmärtää. Päivitä sovellus.");
    return j;
  }

  const vuosiOk = (v) => { const n = parseInt(v, 10); return n >= 1700 && n <= new Date().getFullYear() + 1; };
  const lukuOk = (v) => v === "" || v == null || /^\d+([.,]\d+)?$/.test(String(v).replace(/\s/g, ""));

  /* Paketti -> ehdotukset koottuun tarkistukseen */
  function ehdotukset(j) {
    const k = S.kohde, out = [], varoitukset = [];
    const lisa = (e) => out.push(Object.assign({ valittu: true }, e));
    // Kohde
    const kt = j.kohde || {};
    [["nimi", "Kohteen nimi"], ["osoite", "Osoite"]].forEach(([f, nimi]) => {
      const v = String(arvo(kt[f]) || "").trim();
      if (!v || v === k[f]) return;
      lisa({ t: "kohde", ryhma: "Kohde", k: f, arvo: v, otsikko: nimi, ote: lahdeTeksti(kt[f]), huom: k[f] ? "Nykyinen: " + k[f] : "", valittu: !k[f], muokattava: true });
    });
    // Suunnitelma
    const nimiId = (m) => {
      if (!m) return null;
      if (M.MENETELMAT.some((x) => x.id === m)) return m;
      const n = norm(m), x = M.MENETELMAT.find((y) => norm(y.nimi) === n || norm(y.lyhyt) === n);
      return x ? x.id : null;
    };
    (j.suunnitelma || []).forEach((p) => {
      const id = nimiId(p.menetelma);
      if (!id) varoitukset.push("Tuntematon menetelmä ”" + p.menetelma + "”: lisätty muuna menetelmänä.");
      const maara = parseInt(p.maara, 10) || null;
      const kuvaus = String(p.kuvaus || "").trim();
      const mid = id || "muu";
      const sama = (k.suunnitelma || []).some((x) => x.menetelma === mid && norm(x.kuvaus) === norm(kuvaus) && !x.pois);
      const kuv = id ? kuvaus : [p.menetelma, kuvaus].filter(Boolean).join(": ");
      lisa({ t: "kohta", ryhma: "Tutkimussuunnitelma", menetelma: mid, maara, kuvaus: kuv, tila: p.tila || "",
        otsikko: M.menetelma(mid).nimi + (maara ? " × " + maara : "") + (kuv ? ": " + kuv : ""), ote: lahdeTeksti(p), valittu: !sama, huom: sama ? "Sama kohta on jo suunnitelmassa" : "" });
    });
    // Kerrokset ja tilat
    (j.kerrokset || []).forEach((e) => {
      const nimi = String(arvo(e.nimi) || "").trim();
      if (!nimi) return;
      const ker = (k.kerrokset || []).find((x) => norm(x.nimi) === norm(nimi));
      const tilat = (e.tilat || []).map((t) => ({ tunnus: String(t.tunnus || "").trim().toUpperCase().replace(/\s+/g, ""), nimi: String(t.nimi || "").trim(), asunto: t.asunto || "" }))
        .filter((t) => t.tunnus || t.nimi);
      const uudet = tilat.filter((t) => !(ker && k.tilat.some((x) => x.kerrosId === ker.id && ((t.tunnus && norm(x.tunnus) === norm(t.tunnus)) || (!t.tunnus && norm(x.nimi) === norm(t.nimi))))));
      lisa({ t: "kerros", ryhma: "Kerrokset ja tilat", nimi, tilat: uudet, pohjakuva: e.pohjakuva || null,
        otsikko: (ker ? nimi : "Uusi kerros: " + nimi) + (uudet.length ? " · " + uudet.length + " tilaa" : ""),
        ote: uudet.slice(0, 12).map((t) => [t.tunnus, t.nimi].filter(Boolean).join(" ")).join(", ") + (uudet.length > 12 ? " …" : "") +
          (e.pohjakuva && e.pohjakuva.tiedosto ? " · pohjakuva: " + e.pohjakuva.tiedosto : ""),
        valittu: !ker || uudet.length > 0 });
    });
    // Kuntoarvio
    const kj = j.kuntoarvio || {}, pt = kj.perustiedot || {}, a = S.kohde.kuntoarvio || { perustiedot: {}, osat: {} };
    Object.keys(pt).forEach((f) => {
      if (!PERUS[f]) { varoitukset.push("Tuntematon perustieto ”" + f + "” ohitettiin."); return; }
      let v = String(arvo(pt[f]) == null ? "" : arvo(pt[f])).trim();
      if (!v) return;
      const nyk = String(a.perustiedot[f] || "").trim();
      if (nyk === v) return;
      let huom = [epavarma(pt[f]) ? "Claude: epävarma" : "", nyk ? "Nykyinen: " + nyk : ""].filter(Boolean).join(" · ");
      if (f === "rakennusvuosi" && !vuosiOk(v)) huom = (huom ? huom + " · " : "") + "Epätavallinen vuosi, tarkista";
      if (/^(pintaala|kerrosala|tilavuus|tontti|huoneistoja)$/.test(f) && !lukuOk(v)) huom = (huom ? huom + " · " : "") + "Ei pelkkä luku, tarkista";
      lisa({ t: "perus", ryhma: "Kuntoarvion perustiedot", k: f, arvo: v, otsikko: PERUS[f], ote: lahdeTeksti(pt[f]), huom, muokattava: true,
        valittu: !nyk && !epavarma(pt[f]) && !/tarkista/.test(huom), epavarma: epavarma(pt[f]) });
    });
    (kj.korjaukset || []).forEach((w) => {
      const vuosi = String(w.vuosi || "").trim(), tyo = String(w.tyo || w.teksti || "").trim();
      if (!tyo) return;
      const rivi = (vuosi ? vuosi + " " : "") + tyo.charAt(0).toLowerCase() + tyo.slice(1);
      if (lc(a.perustiedot.korjaukset).includes(lc(rivi))) return;
      const osa = w.osa && Kuntoarvio.osa(w.osa) ? w.osa : null;
      if (w.osa && !osa) varoitukset.push("Tuntematon rakennusosa ”" + w.osa + "”: korjaus lisätään ilman osaa.");
      lisa({ t: "tyo", ryhma: "Tehdyt korjaukset", rivi, vuosi, osa, otsikko: rivi, ote: [osa ? "Osa: " + Kuntoarvio.osa(osa).nimi : "", lahdeTeksti(w)].filter(Boolean).join(" · "),
        valittu: !epavarma(w), huom: epavarma(w) ? "Claude: epävarma" : "" });
    });
    (kj.rakenteet || []).forEach((r) => {
      const d = Kuntoarvio.osa(r.osa);
      if (!d) { varoitukset.push("Tuntematon rakennusosa ”" + r.osa + "” (" + (r.nimike || "") + ") ohitettiin."); return; }
      const nimike = String(r.nimike || "").trim();
      if (!nimike) return;
      const o = a.osat[r.osa];
      if (o && (o.rakenteet || []).some((x) => norm(x.nimike) === norm(nimike))) return;
      lisa({ t: "rak", ryhma: "Rakennusosien rakenteet", osa: r.osa, nimike, vuosi: /^\d{4}$/.test(String(r.vuosi || "")) ? String(r.vuosi) : "", missa: r.missa || "",
        otsikko: d.nimi + ": " + nimike + (r.vuosi ? " (" + r.vuosi + ")" : "") + (r.missa ? " – " + r.missa : ""), ote: lahdeTeksti(r), valittu: !epavarma(r), huom: epavarma(r) ? "Claude: epävarma" : "" });
    });
    // Huomioitavaa kentälle
    (j.huomiot || []).forEach((h) => {
      const t = String(arvo(h.teksti != null ? h.teksti : h) || "").trim();
      if (!t || (k.huomiot || []).some((x) => x.teksti === t)) return;
      lisa({ t: "huomio", ryhma: "Huomioitavaa kentällä", teksti: t, otsikko: t, ote: lahdeTeksti(h) });
    });
    // Clauden omat ristiintarkistukset ja puuttuvat tiedot
    (j.tarkistukset || []).forEach((x) => { if (x && /virhe|ristiriita|ei täsmää|poikkeaa/i.test((x.tulos || "") + " " + (x.kuvaus || ""))) varoitukset.push("Claude: " + (x.kuvaus || "") + (x.tulos ? " – " + x.tulos : "")); });
    if ((j.puuttuu || []).length) varoitukset.push("Ei löytynyt aineistosta: " + j.puuttuu.join(", ") + ".");
    return { ehd: out, varoitukset };
  }

  /* ---------- Käyttöönotto ---------- */
  async function kayta(valitut) {
    const k = S.kohde;
    let n = 0;
    valitut.filter((e) => e.t === "kohde").forEach((e) => { k[e.k] = e.arvo; n++; });
    valitut.filter((e) => e.t === "kohta").forEach((e) => {
      k.suunnitelma.push({ id: DB.uid("p_"), menetelma: e.menetelma, kuvaus: [e.kuvaus, e.tila].filter(Boolean).join(", "), maara: e.maara, tilaId: null, pois: null, lahde: "claude" });
      n++;
    });
    const pohjat = [];
    valitut.filter((e) => e.t === "kerros").forEach((e) => {
      let ker = k.kerrokset.find((x) => norm(x.nimi) === norm(e.nimi));
      if (!ker) { ker = { id: DB.uid("e_"), nimi: e.nimi, planId: null }; k.kerrokset.push(ker); }
      e.tilat.forEach((t) => {
        k.tilat.push({ id: DB.uid("t_"), tunnus: t.tunnus, nimi: t.nimi || (window.PlanRooms && t.tunnus ? (PlanRooms.matchAbbr(t.tunnus.replace(/\d+[A-Z]?$/, "")) || {}).nimi || "" : ""),
          kerrosId: ker.id, pos: null, merkinta: null, asunto: t.asunto || undefined,
          tunnistus: { lahde: "paketti", raaka: [t.tunnus, t.nimi].join(" "), vahvistettu: true, aika: Date.now() } });
      });
      n += 1 + e.tilat.length;
      if (e.pohjakuva && e.pohjakuva.tiedosto) pohjat.push({ kerrosId: ker.id, tiedosto: e.pohjakuva.tiedosto, sivu: e.pohjakuva.sivu || 1 });
    });
    const kaVal = valitut.filter((e) => e.t === "perus" || e.t === "tyo" || e.t === "rak");
    if (kaVal.length) {
      n += KaLahto.kayta(kaVal.map((e) => e.t === "perus" ? e : Object.assign({}, e, { lahde: "Claude" })));
      // Rakenteiden vuodet suoraan rakenteelle (KaLahto.kayta lisää rakenteen ilman vuotta)
      valitut.filter((e) => e.t === "rak" && (e.vuosi || e.missa)).forEach((e) => {
        const o = k.kuntoarvio.osat[e.osa], r = o && o.rakenteet.slice().reverse().find((x) => x.nimike === e.nimike);
        if (r) { if (e.vuosi && !r.vuosi) r.vuosi = e.vuosi; if (e.missa && !r.missa) r.missa = e.missa; }
      });
    }
    valitut.filter((e) => e.t === "huomio").forEach((e) => { (k.huomiot = k.huomiot || []).push({ id: DB.uid("n_"), teksti: e.teksti, lahde: e.ote || "", aika: Date.now() }); n++; });
    await Model.saveKohde();
    return { n, pohjat };
  }

  /* ---------- Alkuperäiset tiedostot ---------- */
  async function liitaTiedostot(j, pohjat) {
    const { toast } = UI;
    const nimet = (j.tiedostot || []).map((t) => t.nimi).filter(Boolean);
    const ok = await new Promise((res) => {
      UI.sheet("<h3>Liitä alkuperäiset tiedostot</h3>" +
        '<p style="margin:0 0 10px">Valitse samat tiedostot, jotka annoit Claudelle. Ne kulkevat raportointiin, ja ' +
        (pohjat.length ? "<b>" + pohjat.length + " pohjakuvaa</b> asetetaan kerroksille ja tilat merkitään niihin." : "pohjakuvat voi lisätä myöhemmin Pohjapiirros-sivulla.") + "</p>" +
        (nimet.length ? '<p class="hint" style="margin:0 0 12px">Paketissa: ' + UI.esc(nimet.join(", ")) + "</p>" : "") +
        '<div class="row-btns"><button class="btn" data-close>Myöhemmin</button><button class="btn btn-primary" data-ok>Valitse tiedostot</button></div>',
      (el, close) => { el.querySelector("[data-ok]").addEventListener("click", () => { res(true); close(); }); }, { onClose: () => res(false) });
    });
    if (!ok) return 0;
    const files = await UI.pickFile("application/pdf,image/*", true);
    if (!files.length) return 0;
    const k = S.kohde;
    KaLahto.siirra(k); k.lahtotiedot = k.lahtotiedot || [];
    const sama = (a, b) => { const x = norm(String(a).replace(/\.[a-z0-9]+$/i, "")), y = norm(String(b).replace(/\.[a-z0-9]+$/i, "")); return x && y && (x === y || x.endsWith(y) || y.endsWith(x)); };
    let n = 0;
    for (const f of files) {
      if (!k.lahtotiedot.some((x) => x.nimi === f.name)) {
        const t = (j.tiedostot || []).find((x) => sama(x.nimi, f.name));
        const tiedosto = await DB.putFile(k.id, f, { kind: "lahtotieto", nimi: f.name });
        k.lahtotiedot.push({ id: DB.uid("l_"), tiedosto, nimi: f.name, laji: (t && t.laji) || KaLahto.laji(f.name, ""), kuvaus: t && t.kuvaus || "", sivuja: t && t.sivuja || null, tapa: "Claude", poimittu: 0, aika: Date.now() });
        n++;
      }
    }
    await Model.saveKohde();
    // Pohjakuvat kerroksille; tilojen tunnistus antaa paketin tiloille sijainnit
    for (const p of pohjat) {
      const f = files.find((x) => sama(x.name, p.tiedosto));
      const ker = k.kerrokset.find((e) => e.id === p.kerrosId);
      if (!f || !ker || ker.planId) continue;
      toast("Pohjakuva kerrokselle " + ker.nimi + "…", 4000);
      await Plan.asetaPohja(ker, f);
    }
    return n;
  }

  /* ---------- Tuonti ---------- */
  async function tuo(paivita) {
    const { toast } = UI;
    const teksti = await new Promise((res) => {
      let tulos = null;
      UI.sheet("<h3>Tuo lähtötietopaketti</h3>" +
        '<p style="margin:0 0 10px">Valitse Clauden antama paketti (.json) tai liitä sen teksti.</p>' +
        '<button class="btn btn-primary btn-block" data-tiedosto>' + UI.icon("upload") + "Valitse pakettitiedosto</button>" +
        '<label class="field" style="margin-top:12px"><span>tai liitä teksti</span><textarea data-teksti rows="5" placeholder="{ &quot;muoto&quot;: &quot;kuva-sanelu-lahtotiedot&quot;, … }"></textarea></label>' +
        '<div class="row-btns"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Jatka</button></div>',
      (el, close) => {
        el.querySelector("[data-tiedosto]").addEventListener("click", async () => {
          const f = await UI.pickFile(".json,application/json,text/plain", false);
          if (f.length) { tulos = await f[0].text(); close(); }
        });
        el.querySelector("[data-ok]").addEventListener("click", () => { tulos = el.querySelector("[data-teksti]").value; close(); });
      }, { onClose: () => res(tulos) });
    });
    if (!teksti || !teksti.trim()) return;
    let j;
    try { j = jasenna(teksti); } catch (e) { toast(e.message, 6000); return; }
    const { ehd, varoitukset } = ehdotukset(j);
    if (!ehd.length) { toast("Paketissa ei ollut uusia tietoja tälle kohteelle", 4000); return; }
    const valitut = await KaLahto.tarkista(ehd, {
      otsikko: "Lähtötietopaketti",
      johdanto: "Claude luki " + ((j.tiedostot || []).length || "") + " tiedostoa. Tarkista ja poista valinta virheellisiltä; lähde näkyy jokaisen alla. Valitsematta jätetyt ovat epävarmoja tai korvaisivat jo kirjatun tiedon.",
      varoitukset
    });
    if (!valitut) return;
    const { n, pohjat } = await kayta(valitut);
    toast(n + " tietoa otettu käyttöön", 3000);
    const m = await liitaTiedostot(j, pohjat);
    if (m) toast(m + " tiedostoa liitetty lähtötietoihin", 3000);
    paivita && paivita();
  }

  /* Kohteen sivulle: lähtötiedot ja huomioitavaa */
  function kohdeKortti() {
    const { esc, icon } = UI;
    const k = S.kohde, l = KaLahto.siirra(k), hu = k.huomiot || [];
    return '<section class="card"><div class="card-h"><h2>Lähtötiedot</h2><span class="meta">' + (l.length ? l.length + " tiedostoa" : "") + '</span></div><div class="card-b">' +
      (hu.length ? '<div class="alert info" style="margin:0 0 10px">' + icon("alert") + "<div><b>Huomioitavaa</b><ul style=\"margin:4px 0 0;padding-left:18px\">" +
        hu.map((h) => "<li>" + esc(h.teksti) + (h.lahde ? ' <span class="hint">(' + esc(h.lahde.replace(/^”[^”]*”\s*·\s*/, "")) + ")</span>" : "") + "</li>").join("") + "</ul></div></div>" : "") +
      (l.length ? '<p class="hint" style="margin:0 0 8px">' + esc(l.slice(0, 6).map((x) => x.nimi).join(", ") + (l.length > 6 ? " …" : "")) + "</p>"
        : '<p class="hint" style="margin:0 0 8px">Anna tarjous, piirustukset ja muut asiakirjat Clauden Lähtötiedot-projektille ja tuo sen paketti tähän. Sovellus täyttää suunnitelman, kerrokset, tilat ja kuntoarvion tiedot.</p>') +
      '<button class="btn btn-primary btn-block" data-act="paketti">' + icon("download") + "Tuo Clauden lähtötietopaketti</button>" +
      "</div></section>";
  }

  App.actions = App.actions || {};
  App.actions.paketti = () => tuo(() => App.render());

  window.Paketti = { MUOTO, VERSIO, jasenna, ehdotukset, kayta, tuo, kohdeKortti };
})();
