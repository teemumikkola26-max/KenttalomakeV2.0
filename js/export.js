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
     varmuuskopio/data.json                  kohteen palautukseen
   ========================================================================= */
(function () {
  "use strict";
  const { toast, nro } = UI;
  const { S, Model } = App;

  const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
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
      g.fillText(nro(h.nro), x, y + 1);
    });
    return await new Promise((res) => c.toBlob(res, "image/png"));
  }

  function mittausRivit(h) {
    const m = M.menetelma(h.menetelma);
    return m.kentat.filter((f) => f.t !== "table" && h.kentat[f.k] != null && String(h.kentat[f.k]).trim() !== "")
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
        havainnot: S.havainnot.filter((h) => h.suunnitelmaId === p.id).map((h) => nro(h.nro))
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
          tunnus: nro(h.nro),
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
    "  pohjapiirrokset/ pohjapiirrokset havainto- ja tilamerkinnöin\n" +
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
    "   esitetä tutkijan toteamana; se merkitään tarvittaessa tarkistettavaksi.\n";

  async function run(keskenerainen) {
    const k = S.kohde;
    toast("Kootaan pakettia…", 6000);
    try {
      await UI.loadScript(JSZIP);
      const zip = new JSZip();
      const paths = { kuvat: {}, aanitteet: {}, lukemat: {} };
      const backupFiles = {}; // fileId -> polku

      for (const h of S.havainnot) {
        paths.kuvat[h.id] = [];
        for (let i = 0; i < h.kuvat.length; i++) {
          const f = await DB.get("tiedostot", h.kuvat[i]);
          if (!f) continue;
          const p = "kuvat/" + nro(h.nro) + "_" + (i + 1) + "." + ext(f.blob.type);
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
            const fk = r._ocr.kuva && await DB.get("tiedostot", r._ocr.kuva);
            if (fk) {
              const p = "kuvat/" + nro(h.nro) + "_lukema_" + li + "." + ext(fk.blob.type);
              zip.file(p, fk.blob); paths.lukemat[r.id] = p; backupFiles[fk.id] = p;
            }
            const fr = r._ocr.rajaus && await DB.get("tiedostot", r._ocr.rajaus);
            if (fr) {
              const p = "varmuuskopio/rajaukset/" + nro(h.nro) + "_" + li + "." + ext(fr.blob.type);
              zip.file(p, fr.blob); backupFiles[fr.id] = p;
            }
          }
        }
        paths.aanitteet[h.id] = [];
        for (let i = 0; i < (h.aanitteet || []).length; i++) {
          const f = await DB.get("tiedostot", h.aanitteet[i]);
          if (!f) continue;
          const p = "aanitteet/" + nro(h.nro) + "_" + (i + 1) + "." + ext(f.blob.type);
          zip.file(p, f.blob);
          paths.aanitteet[h.id].push(p);
          backupFiles[f.id] = p;
        }
      }
      for (const e of k.kerrokset) {
        if (!e.planId) continue;
        const f = await DB.get("tiedostot", e.planId);
        if (!f) continue;
        const base = "pohjapiirrokset/" + safe(e.nimi);
        const orig = base + "_alkuperainen." + ext(f.blob.type);
        zip.file(orig, f.blob);
        backupFiles[f.id] = orig;
        try { zip.file(base + ".png", await planWithPins(e, f.blob)); } catch (err) { console.warn(err); }
      }

      const puutteet = keskenerainen ? Check.puutteet() : [];
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
        try { await navigator.share({ files: [file], title: name }); toast("Paketti jaettu"); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
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
