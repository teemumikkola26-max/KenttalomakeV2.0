/* =========================================================================
   export.js – ZIP-vienti AI-työkalulle ja varmuuskopion palautus
   Paketin rakenne:
     LUE_MINUT.txt        ohje AI-työkalulle ja lukijalle
     havainnot.md         havainnot luettavassa muodossa
     havainnot.json       samat tiedot jäsenneltynä
     kuvat/H01_1.jpg …
     aanitteet/H01_1.webm …
     pohjapiirrokset/<kerros>.png            merkinnöin
     pohjapiirrokset/<kerros>_alkuperainen.* ilman merkintöjä
     lahtotiedot/isannoitsijantodistus.pdf …  kuntoarvion lähtötietoasiakirjat alkuperäisinä
     yleiskuvat/YK01_OH1.jpg …                yleiskuvat (ei havaintoa, tila nimessä)
     varmuuskopio/seuranta/MIR12_1.jpg       mittalaitteiden sijoittelukuvat (poishakua varten, ei raporttiin)
     varmuuskopio/data.json                  kohteen palautukseen
   ========================================================================= */
(function () {
  "use strict";
  const { toast, nro } = UI;
  const { S, Model } = App;

  const JSZIP = "lib/jszip.min.js";
  const FORMAT = "kuva-sanelu/1";

  function safe(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "kohde";
  }
  function ext(type) {
    if (/png/.test(type)) return "png";
    if (/jpe?g/.test(type)) return "jpg";
    if (/webp/.test(type)) return "webp";
    if (/webm/.test(type)) return "webm";
    if (/mp4|aac|m4a/.test(type)) return "m4a";
    if (/ogg/.test(type)) return "ogg";
    return "bin";
  }
  /* Raportin numerointi: havainnot juoksevasti H01, H02 … kirjausjärjestyksessä. Kentän tutkijakohtaiset
     sarjat (TM-05) jäävät vain varmuuskopioon, eivät raportille. */
  /* Tiedosto laitteelta tai pilvestä (toisen tutkijan kuva). Puuttuvat lasketaan. */
  let puuttuvat = 0;
  async function getFile(id) {
    let f = await DB.get("tiedostot", id);
    if (!f && S.kohde.pilvi && window.Sync) f = await Sync.haeTiedosto(S.kohde.id, id).catch(() => null);
    if (!f) puuttuvat++;
    return f;
  }
  let RN = (h) => nro(h.nro);
  function raporttiNumerot() {
    const map = new Map();
    S.havainnot.slice().sort((a, b) => (a.created || 0) - (b.created || 0)).forEach((h, i) => map.set(h.id, nro(i + 1)));
    RN = (h) => map.get(h.id) || nro(h.nro);
  }
  function fmtNum(v) { const s = String(v); return /^-?\d+(\.\d+)?$/.test(s) ? s.replace(".", ",") : s; }

  /* Pohjapiirros merkintöineen kuvaksi */
  async function planWithPins(kerros, blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0);
    const r = Math.max(14, Math.round(Math.max(c.width, c.height) / 90));
    g.textAlign = "center"; g.textBaseline = "middle";
    // tilat
    S.kohde.tilat.filter((t) => t.kerrosId === kerros.id && t.pos).forEach((t) => {
      const st = Model.tilaStatus(t);
      const col = { tarkastettu: ["#e6f0ea", "#2f6f4e"], poikkeama: ["#f7e9dc", "#a15a1e"], ei_paasya: ["#eeece5", "#7a7566"], ei_tutkittu: ["#ffffff", "#8c8676"] }[st];
      const label = (t.tunnus || t.nimi) + " · " + M.TILASTATUS[st].l;
      g.font = "600 " + Math.round(r * 0.95) + "px sans-serif";
      const w = g.measureText(label).width + r;
      const x = t.pos.x * c.width, y = t.pos.y * c.height;
      g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = Math.max(2, r / 6);
      if (st === "ei_tutkittu") g.setLineDash([r / 2, r / 3]); else g.setLineDash([]);
      g.beginPath(); g.rect(x - w / 2, y - r * 0.8, w, r * 1.6); g.fill(); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#1c2430"; g.fillText(label, x, y);
    });
    // havainnot
    S.havainnot.filter((h) => h.sijainti && h.sijainti.piste && h.sijainti.kerrosId === kerros.id).forEach((h) => {
      const x = h.sijainti.piste.x * c.width, y = h.sijainti.piste.y * c.height;
      g.fillStyle = h.tulos === "poikkeama" ? "#a15a1e" : h.tulos === "ok" ? "#2f6f4e" : "#33455c";
      g.strokeStyle = "#fff"; g.lineWidth = Math.max(2, r / 5);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#fff"; g.font = "700 " + Math.round(r * 0.95) + "px sans-serif";
      g.fillText(RN(h), x, y + 1);
    });
    // olosuhdeseurannan mittalaitteet (neliö + tunnus)
    (S.kohde.seuranta || []).filter((x) => x.nro && x.sijainti.piste && x.sijainti.kerrosId === kerros.id).forEach((x) => {
      const lbl = Seuranta.tunnus(x);
      g.font = "700 " + Math.round(r * 0.95) + "px sans-serif";
      const w = g.measureText(lbl).width + r * 0.9;
      const px = x.sijainti.piste.x * c.width, py = x.sijainti.piste.y * c.height;
      g.fillStyle = "#1f5f8b"; g.strokeStyle = "#fff"; g.lineWidth = Math.max(2, r / 5); g.setLineDash([]);
      g.beginPath(); g.rect(px - w / 2, py - r * 0.85, w, r * 1.7); g.fill(); g.stroke();
      g.fillStyle = "#fff"; g.fillText(lbl, px, py + 1);
    });
    return await new Promise((res) => c.toBlob(res, "image/png"));
  }

  function seurantaJson() {
    const all = Seuranta.sorted().filter((x) => x.nro || x.sijainti.tilaId || x.kuvat.length);
    if (!all.length) return null;
    return {
      selite: "Olosuhdeseurannan mittalaitteiden sijainnit. Mittausdata saadaan mittalaitteiden pilvipalvelusta.",
      mittalaitteet: all.map((x) => {
        const e = Model.kerros(x.sijainti.kerrosId), t = Model.tila(x.sijainti.tilaId);
        return { tunnus: Seuranta.tunnus(x) || null, kerros: e ? e.nimi : null, tila: t ? Model.tilaNimi(t) : null,
          pohjapiirros: x.sijainti.piste ? { x_pros: Math.round(x.sijainti.piste.x * 1000) / 10, y_pros: Math.round(x.sijainti.piste.y * 1000) / 10 } : null };
      })
    };
  }

  function mittausRivit(h) {
    const m = M.menetelma(h.menetelma);
    return m.kentat.filter((f) => f.t !== "table" && M.nakyy(h, f) && h.kentat[f.k] != null && String(h.kentat[f.k]).trim() !== "")
      .map((f) => ({ kentta: f.l, arvo: String(h.kentat[f.k]).trim(), yksikko: f.u || "", mittaus: !!f.mittaus }));
  }

  function num(v) { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? null : n; }

  /* Taulukkokentät (esim. RH-mittauspisteen lukemat syvyyksittäin) */
  function taulukot(h, paths) {
    const m = M.menetelma(h.menetelma);
    return m.kentat.filter((f) => f.t === "table").map((f) => {
      const cols = f.sarakkeet || [];
      const g = M.ryhmaSarake(f);
      const rows = M.rivit(h, f);
      const rivit = rows.map((r) => {
        const o = {};
        cols.forEach((c) => { o[c.l + (c.u ? " (" + c.u + ")" : "")] = r[c.k] == null ? "" : (c.t === "date" && r[c.k] ? UI.pvm(r[c.k]) : String(r[c.k])); });
        o.lahde = r._ocr ? "kameraluku" + (r._ocr.edited && Object.keys(r._ocr.edited).length ? ", korjattu käsin" : "") : r._sanelu ? "sanelu" : r._saneltu ? "sanelu, tarkistettu käsin" : "käsin";
        if (r._ocr) o.tarkistettu = Meter.rowState(r) === "ok";
        if (paths.lukemat[r.id]) o.kuva = paths.lukemat[r.id];
        return o;
      });
      const groups = {};
      rows.forEach((r) => { const key = g ? String(r[g.k] || "") : ""; (groups[key] = groups[key] || []).push(r); });
      const yhteenveto = Object.keys(groups).map((key) => {
        const y = { lukemia: groups[key].length };
        if (g) y[g.l + (g.u ? " (" + g.u + ")" : "")] = key;
        const pv = cols.filter((c) => c.t === "date");
        pv.forEach((c) => {
          const d = Array.from(new Set(groups[key].map((r) => r[c.k]).filter(Boolean))).sort();
          if (d.length) y[c.l] = d.map((x) => UI.pvm(x)).join(", ");
        });
        cols.filter((c) => c.mittaus).forEach((c) => {
          const v = groups[key].map((r) => num(r[c.k])).filter((x) => x != null);
          if (v.length) {
            const dec = Math.min(2, Math.max(1, ...groups[key].map((r) => ((String(r[c.k] || "").split(/[.,]/)[1]) || "").length)));
            const p10 = Math.pow(10, dec);
            y[c.l + " keskiarvo" + (c.u ? " (" + c.u + ")" : "")] = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * p10) / p10;
            y[c.l + " vaihteluväli" + (c.u ? " (" + c.u + ")" : "")] = [Math.min.apply(null, v), Math.max.apply(null, v)];
          }
        });
        return y;
      });
      return { kentta: f.l, sarakkeet: cols.map((c) => c.l + (c.u ? " (" + c.u + ")" : "")), rivit, yhteenveto_laskettu: yhteenveto };
    });
  }

  function buildJson(paths, puutteet, keskenerainen) {
    const k = S.kohde;
    return {
      muoto: FORMAT,
      viety: new Date().toISOString(),
      keskenerainen: !!keskenerainen,
      kohde: { nimi: k.nimi, osoite: k.osoite, projektinumero: k.projektinro, tutkija: k.tutkija, tutkimuspaiva: k.pvm },
      tutkimussuunnitelma: k.suunnitelma.map((p) => ({
        menetelma: M.menetelma(p.menetelma).nimi, tarkennus: p.kuvaus, maara: p.maara || 1,
        tehty: Model.kohtaTehty(p), jatetaan_pois: p.pois ? p.pois.syy : null,
        havainnot: S.havainnot.filter((h) => h.suunnitelmaId === p.id).map((h) => RN(h))
      })),
      tilat: k.tilat.map((t) => {
        const e = Model.kerros(t.kerrosId);
        return { tunnus: t.tunnus, nimi: t.nimi, kerros: e ? e.nimi : "", tila: M.TILASTATUS[Model.tilaStatus(t)].l, syy: t.merkinta && t.merkinta.syy ? t.merkinta.syy : null,
          nimen_lahde: t.tunnistus ? t.tunnistus.lahde : "tutkija",
          nimi_vahvistettu: t.tunnistus ? !!t.tunnistus.vahvistettu : true };
      }),
      havainnot: S.havainnot.map((h) => {
        const e = Model.kerros(h.sijainti.kerrosId), t = Model.tila(h.sijainti.tilaId), p = Model.kohta(h.suunnitelmaId);
        const rivit = mittausRivit(h);
        return {
          tunnus: RN(h),
          kuntoarvion_osa: h.kaOsa && window.Kuntoarvio && Kuntoarvio.osa(h.kaOsa) ? Kuntoarvio.osa(h.kaOsa).nimi : null,
          sijainti: { kerros: e ? e.nimi : null, tila: t ? Model.tilaNimi(t) : null, rakenneosa: h.sijainti.rakenneosa || null,
            pohjapiirros: h.sijainti.piste ? { x_pros: Math.round(h.sijainti.piste.x * 1000) / 10, y_pros: Math.round(h.sijainti.piste.y * 1000) / 10 } : null },
          menetelma: M.menetelma(h.menetelma).nimi,
          tulos: h.tulos ? M.TULOKSET[h.tulos] : null,
          suunnitelman_kohta: h.suunnitelmaId === "ei" ? "Ei suunnitelmassa" : (p ? Model.kohtaNimi(p) : null),
          havainto_sanelu: h.sanelu || "",
          tiedot: rivit.filter((r) => !r.mittaus).map((r) => ({ kentta: r.kentta, arvo: r.arvo, yksikko: r.yksikko })),
          mittaustulokset: rivit.filter((r) => r.mittaus).map((r) => ({ kentta: r.kentta, arvo: r.arvo, yksikko: r.yksikko })),
          mittaustaulukot: taulukot(h, paths),
          tunnistettu_sanelusta: Object.keys(h.auto || {}).filter((x) => h.auto[x] === "sanelu" || h.auto[x] === "opittu" || h.auto[x] === "kuva")
            .map((x) => {
              const f = /^[kt]:/.test(x) ? M.menetelma(h.menetelma).kentat.find((y) => y.k === x.slice(2)) : null;
              const nm = f ? f.l + (x[0] === "t" ? " (rivit)" : "") : x;
              return nm + (h.auto[x] === "opittu" ? " (opittu malli)" : h.auto[x] === "kuva" ? " (kuvasta)" : "");
            }),
          mittaustulokset_vahvistettu: !!h.vahvistettu,
          tutkijan_alustava_tulkinta: h.tulkinta || "",
          kuvat: paths.kuvat[h.id] || [],
          aanitteet: paths.aanitteet[h.id] || [],
          kirjattu: new Date(h.created).toISOString()
        };
      }),
      olosuhdeseuranta: seurantaJson(),
      yleiskuvat: (paths.yleiskuvat || []).length ? paths.yleiskuvat : null,
      kuntoarvio: window.Kuntoarvio ? Kuntoarvio.vienti(RN, paths.lahto) : null,
      avoimet_puutteet: puutteet.map((x) => x.otsikko + ": " + x.selite)
    };
  }

  function buildMd(j) {
    const L = [];
    const k = j.kohde;
    L.push("# Kenttähavainnot: " + (k.nimi || "kohde"));
    L.push("");
    L.push("- Osoite: " + (k.osoite || "–"));
    L.push("- Projektinumero: " + (k.projektinumero || "–"));
    L.push("- Tutkija: " + (k.tutkija || "–"));
    L.push("- Tutkimuspäivä: " + (k.tutkimuspaiva ? UI.pvm(k.tutkimuspaiva) : "–"));
    L.push("- Viety: " + UI.pvm(j.viety) + (j.keskenerainen ? " (KESKENERÄINEN: katso avoimet puutteet)" : ""));
    L.push("");
    if (j.tutkimussuunnitelma.length) {
      L.push("## Tutkimussuunnitelman toteutuminen");
      L.push("");
      j.tutkimussuunnitelma.forEach((p) => {
        L.push("- " + p.menetelma + (p.tarkennus ? ": " + p.tarkennus : "") + ". " +
          (p.jatetaan_pois ? "Jätetty pois, syy: " + p.jatetaan_pois : "Tehty " + p.tehty + " / " + p.maara + (p.havainnot.length ? " (" + p.havainnot.join(", ") + ")" : "")));
      });
      L.push("");
    }
    if (j.tilat.length) {
      L.push("## Tilat ja tutkimuksen kattavuus");
      L.push("");
      j.tilat.forEach((t) => L.push("- " + [t.kerros, [t.tunnus, t.nimi].filter(Boolean).join(" ")].filter(Boolean).join(" / ") + ": " + t.tila + (t.syy ? " (syy: " + t.syy + ")" : "") + (t.nimi_vahvistettu ? "" : " (nimi luettu pohjakuvasta, vahvistamatta)")));
      L.push("");
    }
    L.push("## Havainnot");
    L.push("");
    j.havainnot.forEach((h) => {
      const s = h.sijainti;
      L.push("### " + h.tunnus + " · " + ([s.kerros, s.tila, s.rakenneosa].filter(Boolean).join(" · ") || "sijainti puuttuu"));
      L.push("");
      L.push("- Menetelmä: " + h.menetelma);
      L.push("- Tulos: " + (h.tulos || "ei valittu"));
      if (h.suunnitelman_kohta) L.push("- Suunnitelman kohta: " + h.suunnitelman_kohta);
      if (h.tunnistettu_sanelusta && h.tunnistettu_sanelusta.length) L.push("- Sovellus tunnisti sanelusta (tutkija ei muuttanut): " + h.tunnistettu_sanelusta.join(", "));
      if (s.pohjapiirros) L.push("- Pohjapiirroksessa: " + s.kerros + ", merkki " + h.tunnus);
      if (h.kuvat.length) L.push("- Kuvat: " + h.kuvat.join(", "));
      if (h.aanitteet.length) L.push("- Äänitteet: " + h.aanitteet.join(", "));
      h.tiedot.forEach((r) => L.push("- " + r.kentta + ": " + fmtNum(r.arvo) + (r.yksikko ? " " + r.yksikko : "")));
      L.push("");
      L.push("**Havainto (tutkijan sanelu):** " + (h.havainto_sanelu || "–"));
      L.push("");
      const taul = (h.mittaustaulukot || []).filter((t) => t.rivit.length);
      if (h.mittaustulokset.length || taul.length) {
        L.push("**Mittaustulokset (" + (h.mittaustulokset_vahvistettu ? "vahvistettu" : "EI VAHVISTETTU, älä käytä raportissa ilman tarkistusta") + "):**");
        L.push("");
        h.mittaustulokset.forEach((r) => L.push("- " + r.kentta + ": " + fmtNum(r.arvo) + (r.yksikko ? " " + r.yksikko : "")));
        if (h.mittaustulokset.length) L.push("");
        taul.forEach((t) => {
          L.push(t.kentta + ":");
          L.push("");
          L.push("| " + t.sarakkeet.join(" | ") + " | Lähde | Kuva |");
          L.push("|" + t.sarakkeet.map(() => "---").join("|") + "|---|---|");
          t.rivit.forEach((r) => L.push("| " + t.sarakkeet.map((c) => fmtNum(r[c] || "")).join(" | ") + " | " + r.lahde + (r.tarkistettu === false ? ", TARKISTAMATTA" : "") + " | " + (r.kuva || "") + " |"));
          L.push("");
          L.push("Laskettu yhteenveto (sovelluksen laskema, ei mittaustulos):");
          L.push("");
          t.yhteenveto_laskettu.forEach((y) => L.push("- " + Object.keys(y).map((kk) => kk + ": " + (Array.isArray(y[kk]) ? y[kk].map(fmtNum).join("–") : fmtNum(y[kk]))).join(", ")));
          L.push("");
        });
      }
      L.push("**Tutkijan alustava tulkinta:** " + (h.tutkijan_alustava_tulkinta || "–"));
      L.push("");
    });
    if (j.kuntoarvio) {
      const ka = j.kuntoarvio, pt = ka.perustiedot || {};
      L.push("## Kuntoarvio");
      L.push("");
      L.push("Kuntoluokat: " + ka.kuntoluokat.join("; ") + ".");
      L.push("");
      const PT = { rakennustyyppi: "Rakennustyyppi", rakennusvuosi: "Rakennusvuosi", pintaala: "Pinta-ala (m²)", huoneistoja: "Huoneistoja", huoneistotyypit: "Huoneistotyypit", kerrosala: "Kerrosala (m²)", tilavuus: "Tilavuus (m³)", tontti: "Tontin pinta-ala (m²)", perustukset: "Perustukset", runko: "Runko", julkisivu: "Julkisivu", vesikatto: "Vesikatto ja katemateriaali", lammitys: "Lämmitys", korjaukset: "Tehdyt kunnossapito- ja muutostyöt" };
      Object.keys(PT).forEach((x) => { if (pt[x]) L.push("- " + PT[x] + ": " + String(pt[x]).replace(/\n+/g, "; ")); });
      if (ka.rajaukset) L.push("- Rajaukset: " + ka.rajaukset.replace(/\n+/g, "; "));
      L.push("");
      if ((ka.lahtotiedot || []).length) {
        L.push("### Lähtötietoasiakirjat");
        L.push("");
        ka.lahtotiedot.forEach((x) => {
          const pp = x.piirustus || {};
          L.push("- " + x.tiedosto + " (" + [x.laji, pp.laji, pp.toimenpide, pp.paivays || pp.vuosi, pp.numero, pp.suunnittelija, x.sivuja > 1 ? x.sivuja + " sivua" : ""].filter(Boolean).join(", ") + ")");
          if (x.materiaalimerkinnat) L.push("  - Piirustuksesta luettuja merkintöjä (tekstintunnistus, tarkista piirustuksesta): " + x.materiaalimerkinnat.join("; "));
        });
        L.push("");
      }
      let ryh = "";
      ka.osat.forEach((o) => {
        if (o.ryhma !== ryh) { ryh = o.ryhma; L.push("### " + ryh); L.push(""); }
        if (o.kuntoluokka == null && !o.huomiot && !o.havainnot.length && !(o.rakenteet || []).length) { L.push("- " + o.osa + (o.koodi ? " (" + o.koodi + ")" : "") + ": ei arvioitu"); return; }
        L.push("- **" + o.osa + (o.koodi ? " (" + o.koodi + ")" : "") + "**: kuntoluokka " + (o.kuntoluokka == null ? "–" : o.kuntoluokka) +
          (o.pts_ehdokas ? "; PTS-ehdokas" : "") + (o.valittomasti_korjattava ? "; VÄLITTÖMÄSTI KORJATTAVA" : "") +
          (o.lisatutkimus ? "; lisätutkimus" : "") + (o.asiantuntija_arvio_suositeltava ? "; asiantuntija-arvio suositeltava" : "") +
          (o.havainnot.length ? "; havainnot " + o.havainnot.join(", ") : ""));
        (o.rakenteet || []).forEach((r) => L.push("  - Rakenne: " + r.rakenne + (r.missa ? " (" + r.missa + ")" : "") + (r.vuosi ? "; vuosi " + r.vuosi : "") +
          (r.kayttoika_laskettu ? "; " + r.kayttoika_laskettu + " (laskettu, lähde " + (r.kayttoian_lahde || "–") + ")" : "") +
          (r.tarkastusvali ? "; tarkastusväli " + r.tarkastusvali : "") + (r.kunnossapitojakso ? "; kunnossapitojakso " + r.kunnossapitojakso : "")));
        if (o.huomiot) L.push("  - Arvioijan huomiot: " + o.huomiot);
      });
      L.push("");
    }
    if (j.yleiskuvat) {
      L.push("## Yleiskuvat");
      L.push("");
      L.push("Kuvat ilman havaintoa (kansio yleiskuvat/). Tila on tutkijan kuvaushetkellä valitsema.");
      L.push("");
      L.push("| Kuva | Kerros | Tila | Kuvateksti |");
      L.push("|---|---|---|---|");
      j.yleiskuvat.forEach((y) => L.push("| " + y.tunnus + " | " + (y.kerros || "–") + " | " + (y.tila || "–") + " | " + (y.kuvateksti || "") + " |"));
      L.push("");
    }
    if (j.olosuhdeseuranta) {
      L.push("## Olosuhdeseuranta: mittalaitteiden sijainnit");
      L.push("");
      L.push("Mittausdata saadaan mittalaitteiden pilvipalvelusta. Sijainnit on merkitty pohjapiirroksiin laitteen tunnuksella.");
      L.push("");
      L.push("| Tunnus | Kerros | Tila |");
      L.push("|---|---|---|");
      j.olosuhdeseuranta.mittalaitteet.forEach((x) => L.push("| " + (x.tunnus || "–") + " | " + (x.kerros || "–") + " | " + (x.tila || "–") + " |"));
      L.push("");
    }
    if (j.avoimet_puutteet.length) {
      L.push("## Avoimet puutteet viennin hetkellä");
      L.push("");
      j.avoimet_puutteet.forEach((x) => L.push("- " + x));
      L.push("");
    }
    return L.join("\n");
  }

  const LUE_MINUT =
    "KENTTÄHAVAINNOT – OHJE AINEISTON KÄYTTÖÖN\n" +
    "==========================================\n\n" +
    "Aineisto on koottu kentällä Kuva + sanelu -sovelluksella. Tiedostot:\n" +
    "  havainnot.md     havainnot luettavassa muodossa\n" +
    "  havainnot.json   samat tiedot jäsenneltynä\n" +
    "  kuvat/           kuvat, nimetty havainnon tunnuksella (H01_1.jpg);\n" +
    "                   mittarin näytön kuvat H01_lukema_1.jpg\n" +
    "  aanitteet/       sanelut äänitteinä, jos puheentunnistus ei ollut käytössä\n" +
    "  pohjapiirrokset/ pohjapiirrokset havainto-, tila- ja mittalaitemerkinnöin\n" +
    "  varmuuskopio/    sovelluksen omat tiedot palautusta varten\n\n" +
    "OHJE RAPORTIN LAATIJALLE (MYÖS AI-TYÖKALU)\n\n" +
    "1. Mittausarvoina käytetään vain kohdan \"Mittaustulokset (vahvistettu)\" arvoja.\n" +
    "   Mittausarvoja ei päätellä kuvista eikä sanelusta. Vahvistamattomat arvot\n" +
    "   merkitään tarkistettaviksi.\n" +
    "2. Erota raportissa toisistaan havainto, mittaustulos, tulkinta ja suositus.\n" +
    "   \"Havainto (tutkijan sanelu)\" on havainto. \"Tutkijan alustava tulkinta\" on\n" +
    "   tutkijan oma arvio, ja se esitetään tulkintana, ei havaintona.\n" +
    "3. Tilat, joiden tila on \"Ei tutkittu\" tai \"Ei pääsyä\", ja pois jätetyt\n" +
    "   suunnitelman kohdat kirjataan raporttiin rajauksina syineen. Niistä ei\n" +
    "   esitetä kuntoa koskevia päätelmiä.\n" +
    "4. Jos jokin tieto puuttuu, se merkitään puuttuvaksi. Puuttuvaa tietoa ei\n" +
    "   täydennetä oletuksilla.\n" +
    "5. Mittaustaulukon rivit ovat yksittäisiä lukemia (esim. rinnakkaiset\n" +
    "   mittaukset samalta syvyydeltä). Kameraluvulla saadut arvot on tunnistettu\n" +
    "   mittarin näytöltä; rivit, joita ei ole tarkistettu, merkitään\n" +
    "   tarkistettaviksi. \"Laskettu yhteenveto\" on sovelluksen laskema apuluku.\n" +
    "6. \"Sovellus tunnisti sanelusta\" -merkityt tiedot (esim. tulos, tila) on\n" +
    "   päätelty tutkijan sanelusta eikä tutkija ole muuttanut niitä. Tarkista\n" +
    "   ne sanelua vasten, jos ne vaikuttavat johtopäätöksiin.\n" +
    "7. Johtopäätökset ja korjaussuositukset tarkistaa ja hyväksyy raportin\n" +
    "   allekirjoittava tutkija.\n" +
    "8. Tilojen nimet on osin luettu pohjakuvasta automaattisesti. Nimi on\n" +
    "   vahvistettu (nimi_vahvistettu), kun tutkija on käyttänyt tilaa havainnon\n" +
    "   sijaintina, muokannut tai kuitannut sen. Vahvistamattoman tilan nimeä ei\n" +
    "   esitetä tutkijan toteamana; se merkitään tarvittaessa tarkistettavaksi.\n" +
    "9. Olosuhdeseurannasta paketissa ovat vain mittalaitteiden tunnukset ja\n" +
    "   sijainnit (tila ja merkintä pohjapiirroksessa). Mittausdata saadaan\n" +
    "   mittalaitteiden pilvipalvelusta. Laitteiden sijoittelukuvat ovat vain\n" +
    "   poishakua varten (varmuuskopio/seuranta/), eikä niitä käytetä raportissa.\n" +
    "10. Kuntoarvion kuntoluokka (1–5) on arvioijan arvio. Käyttöikälaskelma on\n" +
    "   sovelluksen laskema käyttöikätaulukosta ja rakennus- tai uusimisvuodesta;\n" +
    "   lähde on merkitty. PTS-ehdokkaat ovat ehdotuksia PTS-taulukkoon, eivät\n" +
    "   päätöksiä. LVIA- ja sähköosat on arvioitu pintapuolisesti rakennusteknisenä;\n" +
    "   kohdat, joissa asiantuntija-arvio on suositeltava, esitetään lisätutkimuksina.\n" +
    "12. Kuntoarvion lähtötiedot (kansio lahtotiedot/) ovat tilaajan toimittamia asiakirjoja.\n" +
    "   Sovellus on poiminut niistä perustietoja ja korjaushistoriaa tutkijan hyväksymänä.\n" +
    "   Lue asiakirjat kokonaan ja käytä niitä raportin lähtötietoina; merkitse lähde.\n" +
    "11. Yleiskuvat (kansio yleiskuvat/) ovat kuvia ilman havaintoa tai sanelua, esim.\n" +
    "   julkisivut ja tilojen yleisnäkymät. Niistä ei tehdä havaintoja eikä\n" +
    "   johtopäätöksiä; ne liitetään raporttiin kohteen kuvaukseen.\n";

  /* Viennin ajankohta: etusivu muistuttaa, jos kohteessa on vientiä uudempia muutoksia (puhelimen
     katoaminen tai rikkoutuminen ei vie kenttäpäivän työtä) */
  async function merkitseViety() {
    S.kohde.viety = Date.now();
    await Model.saveKohde();
  }

  async function run(keskenerainen) {
    const k = S.kohde;
    toast("Kootaan pakettia…", 6000);
    // Pilvikohde: muiden tutkijoiden viimeisimmät kirjaukset mukaan ennen vientiä
    if (S.kohde.pilvi && window.Sync && Cloud.kirjautunut && navigator.onLine) { try { await Sync.syncKohde(S.kohde.id); } catch (e) { console.warn(e); } }
    raporttiNumerot();
    puuttuvat = 0;
    try {
      await UI.loadScript(JSZIP);
      const zip = new JSZip();
      const paths = { kuvat: {}, aanitteet: {}, lukemat: {} };
      const backupFiles = {}; // fileId -> polku

      for (const h of S.havainnot) {
        paths.kuvat[h.id] = [];
        for (let i = 0; i < h.kuvat.length; i++) {
          const f = await getFile(h.kuvat[i]);
          if (!f) continue;
          const p = "kuvat/" + RN(h) + "_" + (i + 1) + "." + ext(f.blob.type);
          zip.file(p, f.blob);
          paths.kuvat[h.id].push(p);
          backupFiles[f.id] = p;
        }
        // Mittarin näytön kuvat (taulukkorivit)
        let li = 0;
        for (const f of M.menetelma(h.menetelma).kentat.filter((x) => x.t === "table")) {
          for (const r of M.rivit(h, f)) {
            if (!r._ocr) continue;
            li++;
            const fk = r._ocr.kuva && await getFile(r._ocr.kuva);
            if (fk) {
              const p = "kuvat/" + RN(h) + "_lukema_" + li + "." + ext(fk.blob.type);
              zip.file(p, fk.blob); paths.lukemat[r.id] = p; backupFiles[fk.id] = p;
            }
            const fr = r._ocr.rajaus && await getFile(r._ocr.rajaus);
            if (fr) {
              const p = "varmuuskopio/rajaukset/" + RN(h) + "_" + li + "." + ext(fr.blob.type);
              zip.file(p, fr.blob); backupFiles[fr.id] = p;
            }
          }
        }
        paths.aanitteet[h.id] = [];
        for (let i = 0; i < (h.aanitteet || []).length; i++) {
          const f = await getFile(h.aanitteet[i]);
          if (!f) continue;
          const p = "aanitteet/" + RN(h) + "_" + (i + 1) + "." + ext(f.blob.type);
          zip.file(p, f.blob);
          paths.aanitteet[h.id].push(p);
          backupFiles[f.id] = p;
        }
      }
      // Mittalaitteiden sijoittelukuvat: vain varmuuskopioon (ei raportin kuviin)
      for (const x of (k.seuranta || [])) {
        for (let i = 0; i < x.kuvat.length; i++) {
          const f = await getFile(x.kuvat[i]);
          if (!f) continue;
          const p = "varmuuskopio/seuranta/" + (Seuranta.tunnus(x) || "laite_" + x.id.slice(-4)) + "_" + (i + 1) + "." + ext(f.blob.type);
          zip.file(p, f.blob); backupFiles[f.id] = p;
        }
      }
      // Kuntoarvion lähtötietoasiakirjat: kansio lahtotiedot/ alkuperäisinä tiedostoina
      paths.lahto = {};
      for (const x of ((k.kuntoarvio && k.kuntoarvio.lahtotiedot) || [])) {
        const f = await getFile(x.tiedosto);
        if (!f) continue;
        const p = "lahtotiedot/" + safe(x.nimi.replace(/\.[a-z0-9]+$/i, "")) + "." + ((x.nimi.match(/\.([a-z0-9]+)$/i) || [])[1] || ext(f.blob.type)).toLowerCase();
        zip.file(p, f.blob); backupFiles[f.id] = p; paths.lahto[x.id] = p;
      }
      // Yleiskuvat: kansio yleiskuvat/, järjestys kerros – tila – ottoaika
      paths.yleiskuvat = [];
      if (window.Yleiskuvat) {
        const yl = Yleiskuvat.jarjestetty();
        for (let i = 0; i < yl.length; i++) {
          const y = yl[i], f = await getFile(y.kuva);
          if (!f) continue;
          const t = y.sijainti.tilaId && Model.tila(y.sijainti.tilaId), ker = Model.kerros(y.sijainti.kerrosId);
          const p = "yleiskuvat/" + Yleiskuvat.tunnus(i) + (t ? "_" + safe(t.tunnus || t.nimi) : "") + "." + ext(f.blob.type);
          zip.file(p, f.blob); backupFiles[f.id] = p;
          paths.yleiskuvat.push({ tunnus: Yleiskuvat.tunnus(i), tiedosto: p, kerros: ker ? ker.nimi : null, tila: t ? Model.tilaNimi(t) : null, kuvateksti: y.kuvateksti || "", otettu: new Date(y.created).toISOString() });
        }
      }
      for (const e of k.kerrokset) {
        if (!e.planId) continue;
        const f = await getFile(e.planId);
        if (!f) continue;
        const base = "pohjapiirrokset/" + safe(e.nimi);
        const orig = base + "_alkuperainen." + ext(f.blob.type);
        zip.file(orig, f.blob);
        backupFiles[f.id] = orig;
        try { zip.file(base + ".png", await planWithPins(e, f.blob)); } catch (err) { console.warn(err); }
      }

      // Puutelistan otsikoissa raportin numero (H01), ei kentän tutkijakohtaista sarjaa (TM-05)
      const puutteet = (keskenerainen ? Check.puutteet() : []).map((x) => {
        const h = x.tyyppi === "havainto" && Model.havainto(x.id);
        return h ? Object.assign({}, x, { otsikko: x.otsikko.replace(nro(h), RN(h)) }) : x;
      });
      if (puuttuvat) puutteet.push({ otsikko: "Tiedostoja puuttuu", selite: puuttuvat + " kuvaa tai äänitettä ei saatu (ei verkkoyhteyttä). Vie paketti uudelleen verkossa." });
      const j = buildJson(paths, puutteet, keskenerainen);
      zip.file("havainnot.json", JSON.stringify(j, null, 2));
      zip.file("havainnot.md", buildMd(j));
      zip.file("LUE_MINUT.txt", LUE_MINUT);
      const kaytetyt = new Set(S.havainnot.map((h) => h.menetelma).concat(k.suunnitelma.map((p) => p.menetelma)));
      zip.file("varmuuskopio/data.json", JSON.stringify({ muoto: FORMAT, kohde: k, havainnot: S.havainnot, tiedostot: backupFiles,
        menetelmat: M.MENETELMAT.filter((m) => kaytetyt.has(m.id)) }));

      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const name = safe(k.nimi) + "_" + (k.pvm || new Date().toISOString().slice(0, 10)) + ".zip";
      const file = new File([blob], name, { type: "application/zip" });

      // Puhelimessa jakovalikko (esim. sähköposti, Teams, Tiedostot), muuten lataus.
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        try { await navigator.share({ files: [file], title: name }); await merkitseViety(); toast("Paketti jaettu"); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      await merkitseViety();
      toast("Paketti ladattu: " + name, 3500);
    } catch (e) {
      console.error(e);
      toast("Vienti epäonnistui: " + (e.message || e), 5000);
    }
  }

  async function restore(file) {
    await UI.loadScript(JSZIP);
    const zip = await JSZip.loadAsync(file);
    const dataFile = zip.file("varmuuskopio/data.json");
    if (!dataFile) throw new Error("Paketista puuttuu varmuuskopio/data.json. Valitse tällä sovelluksella viety paketti.");
    const data = JSON.parse(await dataFile.async("string"));
    if (!data.kohde || data.muoto !== FORMAT) throw new Error("Paketin muotoa ei tunnisteta.");
    const k = data.kohde;
    const exists = await DB.get("kohteet", k.id);
    if (exists) {
      const ok = await UI.confirmSheet({ title: "Kohde on jo tällä laitteella", text: "Korvataanko laitteella oleva " + (exists.nimi || "kohde") + " paketin tiedoilla? Laitteen omat muutokset menetetään.", ok: "Korvaa", danger: true });
      if (!ok) throw new Error("Palautus peruttu.");
      await DB.deleteKohde(k.id);
    }
    const mime = (p) => ({ jpg: "image/jpeg", png: "image/png", webp: "image/webp", webm: "audio/webm", m4a: "audio/mp4", ogg: "audio/ogg" }[p.split(".").pop()] || "application/octet-stream");
    for (const [fid, p] of Object.entries(data.tiedostot || {})) {
      const zf = zip.file(p);
      if (!zf) continue;
      const buf = await zf.async("arraybuffer");
      await DB.put("tiedostot", { id: fid, kohdeId: k.id, blob: new Blob([buf], { type: mime(p) }), type: mime(p), created: Date.now() });
    }
    for (const h of data.havainnot || []) await DB.put("havainnot", h);
    // Paketin menetelmät, joita tällä laitteella ei ole, lisätään (olemassa olevia ei korvata).
    if (Array.isArray(data.menetelmat)) await M.yhdista(data.menetelmat, false);
    await DB.put("kohteet", k);
    S.kohde = null;
    return k.id;
  }

  window.Export = { run, restore };
})();
