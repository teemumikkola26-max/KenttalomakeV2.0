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
      const tyhja = !k[f] || (f === "nimi" && k.nimiTilapainen);      // uuden kohteen väliaikainen nimi korvataan
      lisa({ t: "kohde", ryhma: "Kohde", k: f, arvo: v, otsikko: nimi, ote: lahdeTeksti(kt[f]), huom: tyhja ? "" : "Nykyinen: " + k[f], valittu: tyhja, muokattava: true });
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
      const naytteet = mid === "avaus" ? (parseInt(p.naytteet, 10) || 0) : 0;      // näytteet rakenneavauksista samassa kohdassa
      if (p.naytteet && mid !== "avaus") varoitukset.push("Näytemäärä ohitettiin kohdasta ”" + M.menetelma(mid).nimi + "”: näytteet avauksista kuuluvat rakenneavauksen kohtaan.");
      lisa({ t: "kohta", ryhma: "Tutkimussuunnitelma", menetelma: mid, maara, naytteet, kuvaus: kuv, tila: p.tila || "",
        otsikko: M.menetelma(mid).nimi + (maara ? " × " + maara : "") + (naytteet ? " + " + naytteet + " näytettä" : "") + (kuv ? ": " + kuv : ""), ote: lahdeTeksti(p), valittu: !sama, huom: sama ? "Sama kohta on jo suunnitelmassa" : "" });
    });
    // Kerrokset ja tilat
    (j.kerrokset || []).forEach((e) => {
      const nimi = String(arvo(e.nimi) || "").trim();
      if (!nimi) return;
      const ker = (k.kerrokset || []).find((x) => norm(x.nimi) === norm(nimi));
      let hylatyt = 0;
      const sij = (t) => {                     // sijainti pohjakuvassa: x, y 0–1 näytetyn sivun vasemmasta yläkulmasta
        const v = t.sijainti || t.pos;
        if (!v || !e.pohjakuva) return null;
        const x = Number(v.x), y = Number(v.y);
        if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) { hylatyt++; return null; }
        return { x, y, varma: v.varmuus !== "arvio" };
      };
      // Tilan alue monikulmiona (0–1 kuten sijainti); virheellinen alue ohitetaan
      const alue = (t) => {
        if (!Array.isArray(t.alue) || t.alue.length < 3 || !e.pohjakuva) return null;
        const v = t.alue.map((p) => Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p.x), y: Number(p.y) });
        return v.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) ? v.map((p) => ({ x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4 })) : null;
      };
      const tilat = (e.tilat || []).map((t) => ({ tunnus: String(t.tunnus || "").trim().toUpperCase().replace(/\s+/g, ""), nimi: String(t.nimi || "").trim(), asunto: t.asunto || "", sijainti: sij(t),
        alue: alue(t), alueArvio: t.varmuus === "arvio" || (t.alue_varmuus === "arvio") }))
        .filter((t) => t.tunnus || t.nimi);
      const nt = (x) => String(x || "").trim().toUpperCase().replace(/\s+/g, "");
      const ovet = (Array.isArray(e.ovet) ? e.ovet : []).map((o) => ({ a: nt(o.a), b: nt(o.b), x: Number(o.x), y: Number(o.y) }))
        .filter((o) => o.a && o.x >= 0 && o.x <= 1 && o.y >= 0 && o.y <= 1);
      const pk = e.pohjakuva || {}, leveysM = Number(pk.leveys_m) > 0 ? Number(pk.leveys_m) : null;
      const pohjoinen = pk.pohjoinen != null && isFinite(Number(pk.pohjoinen)) && pk.pohjoinen_varmuus !== "arvio" ? ((Number(pk.pohjoinen) % 360) + 360) % 360 : null;
      const alueita = tilat.filter((t) => t.alue).length;
      if (hylatyt) varoitukset.push(nimi + ": " + hylatyt + " tilan sijainti oli virheellinen (pitää olla 0–1) ja ohitettiin.");
      const uudet = tilat.filter((t) => !(ker && k.tilat.some((x) => x.kerrosId === ker.id && ((t.tunnus && norm(x.tunnus) === norm(t.tunnus)) || (!t.tunnus && norm(x.nimi) === norm(t.nimi))))));
      lisa({ t: "kerros", ryhma: "Kerrokset ja tilat", nimi, tilat: uudet, alueet: tilat.filter((t) => t.alue), ovet, leveysM, pohjoinen, pohjakuva: e.pohjakuva || null,
        otsikko: (ker ? nimi : "Uusi kerros: " + nimi) + (uudet.length ? " · " + uudet.length + " tilaa" : ""),
        ote: uudet.slice(0, 12).map((t) => [t.tunnus, t.nimi].filter(Boolean).join(" ")).join(", ") + (uudet.length > 12 ? " …" : "") +
          (e.pohjakuva && e.pohjakuva.tiedosto ? " · pohjakuva: " + e.pohjakuva.tiedosto + (e.pohjakuva.sivu > 1 ? " s. " + e.pohjakuva.sivu : "") : "") +
          (uudet.some((t) => t.sijainti) ? " · " + uudet.filter((t) => t.sijainti).length + " merkitty pohjakuvaan" : "") +
          (alueita ? " · " + alueita + " tilan alue" + (ovet.length ? ", " + ovet.length + " ovea" : "") + (leveysM ? ", mittakaava" : "") : ""),
        valittu: !ker || uudet.length > 0 || (alueita > 0 && !(ker.leveysM && k.tilat.some((x) => x.kerrosId === ker.id && x.alue))) });
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
    // Katselmussuunnitelma (kun tarjousta / tutkimussuunnitelmaa ei vielä ole)
    const tunnukset = (x) => [].concat(x.tilat || x.tunnukset || []).map((t) => String(t || "").trim().toUpperCase().replace(/\s+/g, "")).filter(Boolean);
    const kat = j.katselmus || {}, olemassa = (window.Katselmus && k.katselmus) ? Katselmus.data(k) : null;
    [["kysymykset", "Kysy"], ["kierros", "Katso"], ["aineistopyynnot", "Pyydä"]].forEach(([l, verbi]) => {
      const laji = l === "aineistopyynnot" ? "aineisto" : l;
      (kat[l] || []).forEach((x) => {
        const t = String(arvo(x.teksti != null ? x.teksti : x) || "").trim();
        if (!t || (olemassa && olemassa[laji].some((y) => y.teksti === t))) return;
        const tu = laji === "kierros" ? tunnukset(x) : [];
        lisa({ t: "katselmus", ryhma: "Katselmus", laji, teksti: t, peruste: String(x.peruste || "").trim(), tunnukset: tu,
          otsikko: verbi + ": " + t + (tu.length ? " (" + tu.join(", ") + ")" : ""), ote: String(x.peruste || "").trim() || lahdeTeksti(x) });
      });
    });
    // Aiemmat tutkimukset: tulokset tiloihin sidottuina
    (j.aiemmat || []).forEach((x) => {
      const t = String(arvo(x.teksti != null ? x.teksti : x.tulos) || "").trim();
      if (!t || (k.aiemmat || []).some((y) => y.teksti === t && y.raportti === (x.raportti || ""))) return;
      const tu = tunnukset(x);
      lisa({ t: "aiempi", ryhma: "Aiemmat tutkimukset", raportti: String(x.raportti || ""), pvm: String(x.pvm || ""), aihe: String(x.aihe || ""), teksti: t, tunnukset: tu,
        otsikko: [x.raportti, x.pvm].filter(Boolean).join(" ") + (x.aihe ? " · " + x.aihe : "") + ": " + t + (tu.length ? " (" + tu.join(", ") + ")" : ""), ote: lahdeTeksti(x) });
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
    valitut.filter((e) => e.t === "kohde").forEach((e) => { k[e.k] = e.arvo; if (e.k === "nimi") delete k.nimiTilapainen; n++; });
    valitut.filter((e) => e.t === "kohta").forEach((e) => {
      k.suunnitelma.push(Object.assign({ id: DB.uid("p_"), menetelma: e.menetelma, kuvaus: [e.kuvaus, e.tila].filter(Boolean).join(", "), maara: e.maara, tilaId: null, pois: null, lahde: "claude" },
        e.naytteet ? { naytteet: e.naytteet } : {}));
      n++;
    });
    const pohjat = [];
    valitut.filter((e) => e.t === "kerros").forEach((e) => {
      let ker = k.kerrokset.find((x) => norm(x.nimi) === norm(e.nimi));
      if (!ker) { ker = { id: DB.uid("e_"), nimi: e.nimi, planId: null }; k.kerrokset.push(ker); }
      e.tilat.forEach((t) => {
        k.tilat.push({ id: DB.uid("t_"), tunnus: t.tunnus, nimi: t.nimi || (window.PlanRooms && t.tunnus ? (PlanRooms.matchAbbr(t.tunnus.replace(/\d+[A-Z]?$/, "")) || {}).nimi || "" : ""),
          kerrosId: ker.id, pos: t.sijainti ? { x: t.sijainti.x, y: t.sijainti.y } : null, merkinta: null, asunto: t.asunto || undefined,
          tunnistus: { lahde: "paketti", raaka: [t.tunnus, t.nimi].join(" "), vahvistettu: !t.sijainti || t.sijainti.varma, aika: Date.now() } });
      });
      n += 1 + e.tilat.length;
      // Tilojen alueet ja ovet (myös jo olemassa oleville tiloille, joilta alue puuttuu): tilan tunnistus
      // mistä kohdasta tahansa ja askelpaikannus
      const tilaT = (tun) => k.tilat.find((x) => x.kerrosId === ker.id && String(x.tunnus || "").toUpperCase().replace(/\s+/g, "") === tun);
      (e.alueet || []).forEach((a) => { const t = tilaT(a.tunnus); if (t && !t.alue) { t.alue = a.alue; if (a.alueArvio) t.alueArvio = true; n++; } });
      if ((e.ovet || []).length) ker.ovet = e.ovet.map((o) => ({ a: (tilaT(o.a) || {}).id || null, b: (tilaT(o.b) || {}).id || null, x: o.x, y: o.y })).filter((o) => o.a || o.b);
      if (e.leveysM) ker.leveysM = e.leveysM;
      if (e.pohjoinen != null) ker.pohjoinen = e.pohjoinen;      // tilaseuranta: kompassisuunta pohjakuvaan
      if (e.pohjakuva && e.pohjakuva.tiedosto) pohjat.push({ kerrosId: ker.id, tiedosto: e.pohjakuva.tiedosto, sivu: parseInt(e.pohjakuva.sivu, 10) || 1,
        valmiit: e.tilat.length > 0 && e.tilat.every((t) => t.sijainti) });
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
    // Tunnukset -> tilat (tilat on luotu yllä)
    const tilaIds = (tu) => (tu || []).map((u) => (k.tilat.find((t) => String(t.tunnus || "").toUpperCase().replace(/\s+/g, "") === u) || {}).id).filter(Boolean);
    valitut.filter((e) => e.t === "katselmus").forEach((e) => {
      const d = Katselmus.data(k); k.katselmus = d;
      d[e.laji].push({ id: DB.uid("ks_"), teksti: e.teksti, peruste: e.peruste || "", tunnukset: e.tunnukset, tilaIds: tilaIds(e.tunnukset), vastaus: "", tehty: false });
      n++;
    });
    valitut.filter((e) => e.t === "aiempi").forEach((e) => {
      (k.aiemmat = k.aiemmat || []).push({ id: DB.uid("ai_"), raportti: e.raportti, pvm: e.pvm, aihe: e.aihe, teksti: e.teksti, tunnukset: e.tunnukset, tilaIds: tilaIds(e.tunnukset), lahde: e.ote || "" });
      n++;
    });
    await Model.saveKohde();
    return { n, pohjat };
  }

  /* ---------- Alkuperäiset tiedostot ---------- */
  async function liitaTiedostot(j, pohjat, mukana) {
    const { toast } = UI;
    const nimet = (j.tiedostot || []).map((t) => t.nimi).filter(Boolean);
    let files = mukana && mukana.length ? mukana : null;
    if (!files) {
    const ok = await new Promise((res) => {
      UI.sheet("<h3>Liitä alkuperäiset tiedostot</h3>" +
        '<p style="margin:0 0 10px">Valitse samat tiedostot, jotka annoit Claudelle. Ne kulkevat raportointiin, ja ' +
        (pohjat.length ? "<b>" + pohjat.length + " pohjakuvaa</b> asetetaan kerroksille ja tilat merkitään niihin." : "pohjakuvat voi lisätä myöhemmin Pohjakuva-sivulla.") + "</p>" +
        (nimet.length ? '<p class="hint" style="margin:0 0 12px">Paketissa: ' + UI.esc(nimet.join(", ")) + "</p>" : "") +
        '<div class="row-btns"><button class="btn" data-close>Myöhemmin</button><button class="btn btn-primary" data-ok>Valitse tiedostot</button></div>',
      (el, close) => { el.querySelector("[data-ok]").addEventListener("click", () => { res(true); close(); }); }, { onClose: () => res(false) });
    });
    if (!ok) return 0;
    files = await UI.pickFile("application/pdf,image/*", true);
    if (!files.length) return 0;
    }
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
      // Claude merkitsi kaikki tilat: tunnistusta ei tarvita. Muuten tunnistus täydentää puuttuvat sijainnit.
      await Plan.asetaPohja(ker, f, { sivu: p.sivu, eiTunnistusta: p.valmiit });
    }
    return n;
  }

  /* ---------- Tuonti ---------- */
  async function tuo(paivita) {
    const { toast } = UI;
    const teksti = await new Promise((res) => {
      let tulos = null;
      UI.sheet("<h3>Tuo lähtötietopaketti</h3>" +
        '<p style="margin:0 0 10px">Valitse Clauden antama paketti (.zip tai .json) tai liitä sen teksti.</p>' +
        '<button class="btn btn-primary btn-block" data-tiedosto>' + UI.icon("upload") + "Valitse pakettitiedosto</button>" +
        '<label class="field" style="margin-top:12px"><span>tai liitä teksti</span><textarea data-teksti rows="5" placeholder="{ &quot;muoto&quot;: &quot;kuva-sanelu-lahtotiedot&quot;, … }"></textarea></label>' +
        '<div class="row-btns"><button class="btn" data-close>Peruuta</button><button class="btn btn-primary" data-ok>Jatka</button></div>',
      (el, close) => {
        el.querySelector("[data-tiedosto]").addEventListener("click", async () => {
          const f = await UI.pickFile(".json,.zip,application/json,application/zip,text/plain", false);
          if (f.length) { close(); tuoTiedosto(f[0], paivita); }
        });
        el.querySelector("[data-ok]").addEventListener("click", () => { tulos = el.querySelector("[data-teksti]").value; close(); });
      }, { onClose: () => res(tulos) });
    });
    return kasittele(teksti, paivita);
  }

  /* Pakettitiedosto: .zip (paketti.json + alkuperäiset tiedostot) tai pelkkä .json */
  async function tuoTiedosto(f, paivita) {
    const { toast } = UI;
    if (!/\.zip$/i.test(f.name) && !/zip/.test(f.type || "")) return kasittele(await f.text(), paivita);
    toast("Avataan pakettia…", 20000);
    let zip;
    try {
      if (!window.JSZip) await UI.loadScript("lib/jszip.min.js");
      zip = await JSZip.loadAsync(f);
    } catch (e) { toast("ZIP-tiedostoa ei voitu avata: " + (e.message || e), 6000); return false; }
    const kaikki = Object.values(zip.files).filter((x) => !x.dir && !/(^|\/)(__MACOSX|\.)/.test(x.name));
    const jsonit = kaikki.filter((x) => /\.json$/i.test(x.name));
    jsonit.sort((a, b) => (/paketti/i.test(b.name) ? 1 : 0) - (/paketti/i.test(a.name) ? 1 : 0));
    let teksti = null;
    for (const x of jsonit) {
      const t = await x.async("string");
      if (t.indexOf(MUOTO) >= 0) { teksti = t; break; }
    }
    if (!teksti) { toast("ZIP-paketista ei löytynyt lähtötietopakettia (paketti.json)", 6000); return false; }
    const TYYPIT = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain" };
    const mukana = [];
    for (const x of kaikki) {
      const ext = (x.name.split(".").pop() || "").toLowerCase();
      if (!TYYPIT[ext]) continue;
      mukana.push(new File([await x.async("blob")], x.name.split("/").pop(), { type: TYYPIT[ext] }));
    }
    if (UI.hideToast) UI.hideToast();
    return kasittele(teksti, paivita, mukana);
  }

  /* Paketti -> tarkistus -> käyttöönotto -> alkuperäiset tiedostot */
  async function kasittele(teksti, paivita, mukana) {
    const { toast } = UI;
    if (!teksti || !teksti.trim()) return false;
    let j;
    try { j = jasenna(teksti); } catch (e) { toast(e.message, 6000); return false; }
    const { ehd, varoitukset } = ehdotukset(j);
    if (!ehd.length) { toast("Paketissa ei ollut uusia tietoja tälle kohteelle", 4000); return false; }
    const valitut = await KaLahto.tarkista(ehd, {
      otsikko: "Lähtötietopaketti",
      johdanto: "Claude luki " + ((j.tiedostot || []).length || "") + " tiedostoa. Tarkista ja poista valinta virheellisiltä; lähde näkyy jokaisen alla. Valitsematta jätetyt ovat epävarmoja tai korvaisivat jo kirjatun tiedon.",
      varoitukset
    });
    if (!valitut) return false;
    const { n, pohjat } = await kayta(valitut);
    S.kohde.lahtoTila = Object.assign({}, S.kohde.lahtoTila, { claude: Date.now() });
    await Model.saveKohde();
    toast(n + " tietoa otettu käyttöön", 3000);
    const m = await liitaTiedostot(j, pohjat, mukana);
    if (m) toast(m + " tiedostoa liitetty lähtötietoihin", 3000);
    paivita && paivita();
    return true;
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

  window.Paketti = { MUOTO, VERSIO, jasenna, ehdotukset, kayta, tuo, tuoTiedosto, kasittele, kohdeKortti };
})();
