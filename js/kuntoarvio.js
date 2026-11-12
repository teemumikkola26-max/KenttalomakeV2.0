/* =========================================================================
   kuntoarvio.js – kuntoarvio (#/k/<kohde>/kuntoarvio[/<osa>])

   Kohteen tason arvio rakennusosittain (raporttipohjan järjestys):
     - kuntoluokka 1–5 (tai "ei koske kohdetta")
     - rakenne / materiaali käyttöikätaulukosta ja rakennus- tai uusimisvuosi
       -> tekninen käyttöikä, milloin saavutetaan, tarkastusväli, kunnossapito
     - tarkistuslista (muistilista arvioijalle, erityisesti LVIA ja sähkö)
     - merkinnät: välittömästi korjattava, lisätutkimus, asiantuntija-arvio
     - huomiot ja toimenpide-ehdotus (sanelu)
     - havainnot (kuva + sanelu) liitetään osaan
   Perustiedot ja rajaukset ovat näkymän alussa. PTS-ehdokkaat lasketaan:
   käyttöikä saavutetaan PTS-jakson aikana tai kuntoluokka 1–2.

   Tallennus: kohde.kuntoarvio = { perustiedot, rajaukset, ptsVuodet, osat: { id: {...} } }
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  const { S, Model } = App;
  const D = window.KAData;
  const VUOSI = () => new Date().getFullYear();

  /* ---------- Käyttöikätaulukko (muokattava Sanasto-sivulla) ---------- */
  Vocab.define("kayttoiat", { group: "Kuntoarvio", title: "Käyttöiät", type: "words",
    defaults: D.KAYTTOIAT.map((r) => r.join(" | ")),
    help: "osa | nimike | tekninen käyttöikä v | tarkastusväli v | kunnossapitojakso v | lähde. Osa on rakennusosan tunnus (esim. vesikatteet, ikkunat, vesijohdot). Käyttöikä voi olla luku, väli (25-40), \"50 tai yli\" tai \"saavutettu\". Täydennä esim. KH 90-00403:sta ja merkitse lähde." });
  let rivit = [];
  function rebuild() {
    rivit = Vocab.list("kayttoiat").map((l) => {
      const c = l.split("|").map((x) => x.trim());
      return c.length >= 3 && c[0] && c[1] ? { osa: c[0], nimike: c[1], ika: c[2] || "", tv: c[3] || "", kp: c[4] || "", lahde: c[5] || "" } : null;
    }).filter(Boolean);
  }
  rebuild();
  Vocab.onChange(rebuild);
  const rivi = (osa, nimike) => rivit.find((r) => r.osa === osa && r.nimike === nimike) || null;

  /* ---------- Malli ---------- */
  const osa = (id) => D.OSAT.find((o) => o.id === id) || null;
  const ryhma = (id) => D.RYHMAT.find((r) => r.id === id);
  function ka() {
    const k = S.kohde;
    if (!k.kuntoarvio) k.kuntoarvio = { perustiedot: {}, rajaukset: "", ptsVuodet: 10, osat: {} };
    return k.kuntoarvio;
  }
  const aktiivinen = () => !!(S.kohde && (S.kohde.kuntoarvio || S.kohde.suunnitelma.some((p) => M.menetelma(p.menetelma).kuntoarvio)));
  const tila = (id) => ka().osat[id] || (ka().osat[id] = { kl: null, ei: false, nimike: "", vuosi: "", tark: [], huom: "", valiton: false, lisatutk: false, asiantuntija: false });
  const arvioitu = (o) => !!(o && (o.kl || o.ei));
  function edistyminen() {
    const a = ka();
    const n = D.OSAT.filter((o) => arvioitu(a.osat[o.id])).length;
    return { n, all: D.OSAT.length };
  }

  /* Käyttöikä: "40", "25-40", "50 tai yli", "saavutettu" */
  function laskelma(id) {
    const o = ka().osat[id];
    if (!o || !o.nimike) return null;
    const r = rivi(id, o.nimike);
    if (!r) return null;
    const v = parseInt(o.vuosi || ka().perustiedot.rakennusvuosi, 10);
    const out = { r, vuosi: isNaN(v) ? null : v };
    if (/saavutettu/i.test(r.ika)) { out.saavutettu = true; out.txt = "Tekninen käyttöikä saavutettu (" + r.lahde + ")"; out.pts = true; return out; }
    const m = r.ika.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
    if (!m) return out;
    const a = +m[1], b = m[2] ? +m[2] : null;
    out.ika = b ? a + "–" + b : (/yli/i.test(r.ika) ? a + " tai yli" : String(a));
    if (out.vuosi) {
      out.y1 = out.vuosi + a; out.y2 = b ? out.vuosi + b : null;
      out.jaljella = out.y1 - VUOSI();
      out.pts = out.y1 <= VUOSI() + (ka().ptsVuodet || 10);
      out.txt = "Tekninen käyttöikä " + out.ika + " v → " + (out.y1 <= VUOSI() ? "saavutettu " : "saavutetaan ") + out.y1 + (out.y2 ? "–" + out.y2 : "") +
        (out.jaljella > 0 ? " (jäljellä " + out.jaljella + (out.y2 ? "–" + (out.y2 - VUOSI()) : "") + " v)" : "");
    } else out.txt = "Tekninen käyttöikä " + out.ika + " v. Anna rakennus- tai uusimisvuosi, niin vuosi lasketaan.";
    return out;
  }
  function ptsEhdokkaat() {
    const a = ka(), out = [];
    D.OSAT.forEach((d) => {
      const o = a.osat[d.id];
      if (!o || o.ei) return;
      const l = laskelma(d.id);
      if ((l && l.pts) || (o.kl && o.kl <= 2)) out.push({ d, o, l, y: l && l.y1 ? l.y1 : (o.kl === 1 ? VUOSI() + 1 : VUOSI() + 3) });
    });
    return out.sort((x, y) => x.y - y.y);
  }

  /* Märkätilakartoituksen yhteenveto osaan "Huoneistojen märkätilat" */
  function martilaYhteenveto() {
    const hs = S.havainnot.filter((h) => h.menetelma === "mtk");
    if (!hs.length) return null;
    const asunnot = new Set(hs.map((h) => String(h.kentat.asunto || "").toUpperCase()).filter(Boolean));
    const m = M.menetelma("mtk");
    const puutteet = {};
    let huono = 0, vuoto = 0;
    hs.forEach((h) => {
      m.kentat.filter((f) => M.nakyy(h, f)).forEach((f) => {
        const v = h.kentat[f.k];
        if (!v) return;
        if (f.okv && v !== f.okv) puutteet[f.l + ": " + v] = (puutteet[f.l + ": " + v] || 0) + 1;
        if (v === "Huono") huono++;
        if (/vuoto/i.test(v)) vuoto++;
      });
    });
    const pko = hs.map((h) => parseFloat(String(h.kentat.pko_lattia || "").replace(",", "."))).filter((x) => !isNaN(x));
    const ehdotus = vuoto || huono ? 2 : Object.keys(puutteet).length ? 3 : 4;
    return { n: hs.length, asunnot: asunnot.size, puutteet, pkoMax: pko.length ? Math.max(...pko) : null, ehdotus,
      peruste: vuoto || huono ? "vuotoja tai huonokuntoisia pintoja" : Object.keys(puutteet).length ? "yksittäisiä puutteita" : "ei puutteita" };
  }

  /* Sanelusta rakennusosa (esim. "räystäskourut" -> Vesikattovarusteet) */
  function tunnistaOsa(text) {
    const t = Auto._detect.norm(text), re = Auto._detect.stemRe;
    let best = null;
    D.OSAT.forEach((d) => (d.sanat || []).forEach((w) => {
      const i = t.search(re(w));
      if (i >= 0 && (!best || i < best.i || (i === best.i && w.length > best.n))) best = { id: d.id, i, n: w.length };   // tarkempi sana voittaa
    }));
    return best ? best.id : null;
  }

  /* ---------- Etusivun kortti ---------- */
  function kohdeCard() {
    const k = S.kohde;
    if (!aktiivinen()) return "";
    const p = edistyminen();
    return '<section class="card"><div class="card-h"><h2>Kuntoarvio</h2><a class="link" href="#/k/' + k.id + '/kuntoarvio">' + p.n + " / " + p.all + " osaa</a></div>" +
      '<div class="card-b"><span class="bar" style="display:block;height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin-bottom:10px"><span style="display:block;height:100%;width:' + Math.round(p.n / p.all * 100) + '%;background:var(--ok)"></span></span>' +
      '<a class="btn btn-sm" href="#/k/' + k.id + '/kuntoarvio">' + icon("list") + "Avaa kuntoarvio</a></div></section>";
  }

  /* ---------- Näkymä: yleiskuva ---------- */
  const klBadge = (o) => !o ? '<span class="ka-kl none">Arvioimatta</span>'
    : o.ei ? '<span class="ka-kl ei">Ei koske</span>'
    : o.kl ? '<span class="ka-kl k' + o.kl + '">' + o.kl + " " + esc(D.KUNTOLUOKAT.find((x) => x.k === o.kl).l) + "</span>"
    : '<span class="ka-kl none">Arvioimatta</span>';

  const PERUS = [
    ["rakennustyyppi", "Rakennustyyppi", "esim. rivitalo"], ["rakennusvuosi", "Rakennusvuosi", "esim. 1978"], ["pintaala", "Pinta-ala (m²)", ""],
    ["huoneistoja", "Huoneistoja (kpl)", ""], ["perustukset", "Perustukset", ""], ["runko", "Runko", ""], ["julkisivu", "Julkisivu", ""],
    ["vesikatto", "Vesikatto ja katemateriaali", ""], ["lammitys", "Lämmitys", "esim. kaukolämpö, vesikiertoiset patterit"]
  ];

  async function viewMain() {
    const k = S.kohde, a = ka();
    const p = edistyminen();
    const pts = ptsEhdokkaat();
    const lisat = D.OSAT.filter((d) => a.osat[d.id] && (a.osat[d.id].lisatutk || a.osat[d.id].asiantuntija));
    const valit = D.OSAT.filter((d) => a.osat[d.id] && a.osat[d.id].valiton);
    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Kuntoarvio", sub: p.n + " / " + p.all + " rakennusosaa arvioitu · " + k.nimi, back: "#/k/" + k.id }) +
      '<main class="view">' +
      '<details class="card vocab" ' + (a.perustiedot.rakennusvuosi ? "" : "open") + '><summary class="card-h"><h2>Perustiedot ja rajaukset</h2><span class="meta">' + esc(a.perustiedot.rakennusvuosi || "") + '</span></summary><div class="card-b">' +
        '<div class="grid2">' + PERUS.map(([f, l, ph]) => '<label class="field"><span>' + l + '</span><input type="text" data-pt="' + f + '" value="' + esc(a.perustiedot[f] || "") + '" placeholder="' + esc(ph) + '"' + (f === "rakennusvuosi" || f === "huoneistoja" || f === "pintaala" ? ' inputmode="numeric"' : "") + "></label>").join("") + "</div>" +
        '<label class="field"><span>Tehdyt kunnossapito- ja muutostyöt</span><textarea data-pt="korjaukset" placeholder="Yksi työ riville, esim. 2015 vesikaton uusiminen">' + esc(a.perustiedot.korjaukset || "") + "</textarea></label>" +
        '<label class="field"><span>Rajaukset</span><textarea data-ka="rajaukset" placeholder="esim. Asunnoista tarkastettiin 20 %. Vesikatetta ei voitu tarkastaa lumipeitteen vuoksi.">' + esc(a.rajaukset || "") + "</textarea></label>" +
        '<label class="field" style="margin:0"><span>PTS-jakso (v)</span><input type="text" inputmode="numeric" data-ka="ptsVuodet" value="' + (a.ptsVuodet || 10) + '" style="max-width:90px"></label>' +
      "</div></details>" +
      D.RYHMAT.map((r) => {
        const os = D.OSAT.filter((d) => d.r === r.id);
        const n = os.filter((d) => arvioitu(a.osat[d.id])).length;
        return '<section class="card"><div class="card-h"><h2>' + esc(r.nimi) + '</h2><span class="meta">' + n + "/" + os.length + "</span></div>" +
          (r.laji !== "rakenne" ? '<p class="hint" style="margin:8px 16px 0">Pintapuolinen arvio rakennusteknisenä. Tarkistuslista auttaa huomaamaan tärkeimmät asiat; merkitse tarvittaessa asiantuntija-arvio.</p>' : "") +
          os.map((d) => {
            const o = a.osat[d.id], l = o && !o.ei ? laskelma(d.id) : null;
            const tags = o ? [o.valiton && "välitön korjaus", o.lisatutk && "lisätutkimus", o.asiantuntija && "asiantuntija-arvio"].filter(Boolean) : [];
            const nh = S.havainnot.filter((h) => h.kaOsa === d.id).length;
            return '<a class="row" href="#/k/' + k.id + "/kuntoarvio/" + d.id + '" style="text-decoration:none;color:inherit"><div class="grow"><div class="t">' + esc(d.nimi) + (d.koodi ? ' <span class="mp-tag">' + esc(d.koodi) + "</span>" : "") + "</div>" +
              (l && l.txt ? '<div class="s' + (l.pts ? " ka-pts" : "") + '">' + esc(l.txt) + "</div>" : "") +
              (tags.length || nh ? '<div class="s">' + esc([nh ? nh + (nh === 1 ? " havainto" : " havaintoa") : ""].concat(tags).filter(Boolean).join(" · ")) + "</div>" : "") +
              "</div>" + klBadge(o) + "</a>";
          }).join("") + "</section>";
      }).join("") +
      '<section class="card"><div class="card-h"><h2>PTS-ehdokkaat</h2><span class="meta">' + pts.length + "</span></div>" +
        (pts.length ? pts.map((x) => '<a class="row" href="#/k/' + k.id + "/kuntoarvio/" + x.d.id + '" style="text-decoration:none;color:inherit"><div class="grow"><div class="t">' + esc(x.d.nimi) + "</div><div class=\"s\">" +
          esc([x.l && x.l.txt, x.o.kl && x.o.kl <= 2 ? "kuntoluokka " + x.o.kl : ""].filter(Boolean).join(" · ")) + '</div></div><span class="count">' + x.y + "</span></a>").join("")
          : '<div class="empty">Käyttöikä ei täyty PTS-jaksolla eikä yhtään osaa ole arvioitu kuntoluokkaan 1–2.</div>') + "</section>" +
      (valit.length || lisat.length ? '<section class="card"><div class="card-h"><h2>Välittömät korjaukset ja lisätutkimukset</h2></div><div class="card-b">' +
        (valit.length ? "<p><b>Välittömästi korjattavat:</b> " + esc(valit.map((d) => d.nimi).join(", ")) + "</p>" : "") +
        (lisat.length ? "<p><b>Lisätutkimukset / asiantuntija-arvio:</b> " + esc(lisat.map((d) => d.nimi).join(", ")) + "</p>" : "") + "</div></section>" : "") +
      '<p class="hint" style="margin:0 2px 90px">Käyttöiät: ' + esc(Array.from(new Set(rivit.map((r) => r.lahde).filter(Boolean))).join(", ")) + '. Taulukkoa voi täydentää <a href="#/sanasto">Sanasto</a>-sivulla (Käyttöiät).</p>' +
      "</main>" + App.fab("#/k/" + k.id + "/kuvaus") + App.bottomnav("kohde");

    const save = UI.debounce(() => Model.saveKohde(), 400);
    root.oninput = (e) => {
      const t = e.target;
      if (t.dataset.pt) { a.perustiedot[t.dataset.pt] = t.value; save(); }
      else if (t.dataset.ka === "rajaukset") { a.rajaukset = t.value; save(); }
      else if (t.dataset.ka === "ptsVuodet") { const n = parseInt(t.value, 10); if (n > 0) { a.ptsVuodet = n; save(); } }
    };
    S.cleanup = () => { save.flush(); root.oninput = null; };
  }

  /* ---------- Näkymä: rakennusosa ---------- */
  async function viewOsa(id) {
    const k = S.kohde, d = osa(id);
    if (!d) { location.hash = "#/k/" + k.id + "/kuntoarvio"; return; }
    const a = ka(), o = tila(id), r = ryhma(d.r);
    const save = UI.debounce(() => Model.saveKohde(), 400);
    const root = document.getElementById("app");
    let dict = null;

    async function paint() {
      const hs = S.havainnot.filter((h) => h.kaOsa === id);
      await Model.ensureUrls(hs.map((h) => h.kuvat[0]));
      const opts = rivit.filter((x) => x.osa === id);
      const l = laskelma(id);
      const mt = d.martilat ? martilaYhteenveto() : null;
      const idx = D.OSAT.indexOf(d);
      const next = D.OSAT.slice(idx + 1).concat(D.OSAT.slice(0, idx)).find((x) => !arvioitu(a.osat[x.id]));
      const klSel = D.KUNTOLUOKAT.find((x) => x.k === o.kl);
      root.innerHTML = App.topbar({ title: d.nimi, sub: [d.koodi, r.nimi].filter(Boolean).join(" · "), back: "#/k/" + k.id + "/kuntoarvio" }) +
        '<main class="view no-nav">' +
        '<section class="card"><div class="card-h"><h2>Tarkista</h2><span class="meta">' + (o.tark || []).length + "/" + d.t.length + '</span></div><div class="card-b ka-tark">' +
          d.t.map((x, i) => '<label class="ka-chk"><input type="checkbox" data-tark="' + i + '"' + ((o.tark || []).includes(i) ? " checked" : "") + "><span>" + esc(x) + "</span></label>").join("") +
          (r.laji !== "rakenne" ? '<p class="hint" style="margin:8px 0 0">Arvio on pintapuolinen. Jos jokin kohta jää epäselväksi, merkitse asiantuntija-arvio alempana.</p>' : "") +
        "</div></section>" +
        (mt ? '<section class="card"><div class="card-h"><h2>Märkätilakartoitus</h2><span class="meta">' + mt.n + " tilaa · " + mt.asunnot + ' asuntoa</span></div><div class="card-b">' +
          (Object.keys(mt.puutteet).length ? "<ul class=\"ka-ul\">" + Object.entries(mt.puutteet).map(([x, n]) => "<li>" + esc(x) + " (" + n + ")</li>").join("") + "</ul>" : "<p>Ei puutteita tarkistuskohdissa.</p>") +
          (mt.pkoMax != null ? "<p>Suurin lattian pko-arvo: " + String(mt.pkoMax).replace(".", ",") + "</p>" : "") +
          '<p class="hint" style="margin:6px 0 0">Kuntoluokan ehdotus kartoituksesta: <b>' + mt.ehdotus + "</b> (" + esc(mt.peruste) + "). Ehdotus on apuna; kuntoluokan ratkaisee arvioija.</p></div></section>" : "") +
        '<section class="card"><div class="card-h"><h2>Kuntoluokka</h2></div><div class="card-b">' +
          '<div class="chips ka-kls">' + D.KUNTOLUOKAT.map((x) => '<button class="chip ka-k' + x.k + '" data-kl="' + x.k + '" aria-pressed="' + (o.kl === x.k && !o.ei) + '"><b>' + x.k + "</b> " + esc(x.l) + "</button>").join("") +
            '<button class="chip" data-kl="ei" aria-pressed="' + !!o.ei + '">Ei koske kohdetta</button></div>' +
          (klSel && !o.ei ? '<p class="hint" style="margin:8px 0 0">' + esc(klSel.s) + "</p>" : "") +
        "</div></section>" +
        (o.ei ? "" : '<section class="card"><div class="card-h"><h2>Rakenne ja käyttöikä</h2></div><div class="card-b">' +
          '<label class="field"><span>Rakenne / materiaali</span><select data-f="nimike"><option value="">' + (opts.length ? "Valitse" : "Ei taulukossa (lisää Sanasto-sivulla)") + "</option>" +
            opts.map((x) => '<option' + (x.nimike === o.nimike ? " selected" : "") + ">" + esc(x.nimike) + "</option>").join("") + "</select></label>" +
          '<label class="field"><span>Rakennus- tai uusimisvuosi</span><input type="text" inputmode="numeric" maxlength="4" data-f="vuosi" value="' + esc(o.vuosi || "") + '" placeholder="' + esc(a.perustiedot.rakennusvuosi ? a.perustiedot.rakennusvuosi + " (rakennusvuosi)" : "esim. 1985") + '"></label>' +
          (l ? '<div class="ka-calc' + (l.pts ? " pts" : "") + '"><b>' + esc(l.txt || "") + "</b>" +
            (l.r.tv || l.r.kp ? "<br>" + esc([l.r.tv && "Tarkastusväli " + l.r.tv + (/kk/.test(l.r.tv) ? "" : " v"), l.r.kp && "Kunnossapitojakso " + l.r.kp + (/^\d/.test(l.r.kp) ? " v" : "")].filter(Boolean).join(" · ")) : "") +
            '<br><span class="hint">Lähde: ' + esc(l.r.lahde || "–") + (l.pts ? " · PTS-ehdokas" : "") + "</span></div>" : "") +
        "</div></section>") +
        '<section class="card"><div class="card-h"><h2>Huomiot ja toimenpide-ehdotus</h2><button class="btn btn-sm" data-mic>' + icon("mic") + '<span data-ml>Pidä: sanele</span></button></div><div class="card-b">' +
          '<textarea data-f="huom" style="min-height:96px" placeholder="esim. Räystäskouruissa vuotoja liitoksissa. Kourut suositellaan uusittavaksi 1–3 vuoden kuluessa.">' + esc(o.huom || "") + "</textarea>" +
          '<div class="dict-prev" data-prev></div>' +
          '<div class="chips" style="margin-top:10px"><button class="chip c-note" data-flag="valiton" aria-pressed="' + !!o.valiton + '">Välittömästi korjattava</button>' +
          '<button class="chip" data-flag="lisatutk" aria-pressed="' + !!o.lisatutk + '">Lisätutkimus</button>' +
          (r.laji !== "rakenne" ? '<button class="chip" data-flag="asiantuntija" aria-pressed="' + !!o.asiantuntija + '">Asiantuntija-arvio suositeltava</button>' : "") + "</div>" +
        "</div></section>" +
        '<section class="card"><div class="card-h"><h2>Havainnot</h2><span class="meta">' + hs.length + '</span></div><div class="card-b">' +
          (hs.length ? '<div class="recent">' + hs.map((h) => '<a class="item" href="#/k/' + k.id + "/h/" + h.id + '" style="text-decoration:none;color:inherit"><span class="thumb">' + (Model.url(h.kuvat[0]) ? '<img src="' + Model.url(h.kuvat[0]) + '" alt="">' : "") + '<span class="no">' + UI.nro(h.nro) + "</span></span>" + esc(Model.sijaintiTeksti(h.sijainti) || "") + "</a>").join("") + "</div>" : "") +
          '<a class="btn btn-block" href="#/k/' + k.id + "/kuvaus?kaosa=" + id + '">' + icon("cam") + "Kuva + sanelu tähän osaan</a>" +
        "</div></section>" +
        '<div class="row-btns"><a class="btn" href="#/k/' + k.id + '/kuntoarvio">Yleiskuva</a>' +
          (next ? '<a class="btn btn-primary" href="#/k/' + k.id + "/kuntoarvio/" + next.id + '">Seuraava: ' + esc(next.nimi) + "</a>" : '<a class="btn btn-primary" href="#/k/' + k.id + '/kuntoarvio">Kaikki arvioitu</a>') + "</div>" +
        "</main>";
      bindDict();
    }

    function bindDict() {
      const btn = root.querySelector("[data-mic]"), ta = root.querySelector('[data-f="huom"]');
      if (dict) dict.stop();
      dict = new Dictation({
        onCommit: (text) => { ta.value = DictButton.appendText(ta.value, text); o.huom = ta.value; save(); },
        onPreview: (t) => { const p = root.querySelector("[data-prev]"); if (p) p.textContent = t; },
        onState: (st, msg) => { if ((st === "error" || st === "empty" || st === "recording") && msg) toast(msg, 3500); b.paint(); },
        onAudio: () => toast("Äänitettä ei tallenneta kuntoarvioon. Kirjoita huomio tai käytä Kuva + sanelu -kirjausta.", 4000)
      });
      const b = DictButton.bind(btn, dict, { labelEl: root.querySelector("[data-ml]") });
    }

    root.oninput = (e) => {
      const t = e.target;
      if (t.dataset.f === "huom") { o.huom = t.value; save(); }
      else if (t.dataset.f === "vuosi") { o.vuosi = t.value.replace(/\D/g, "").slice(0, 4); if (o.vuosi.length === 4 || !o.vuosi) { save(); paintCalc(); } }
    };
    const paintCalc = UI.debounce(() => { const y = window.scrollY; paint().then(() => { window.scrollTo(0, y); const v = root.querySelector('[data-f="vuosi"]'); if (v) { v.focus(); v.setSelectionRange(v.value.length, v.value.length); } }); }, 300);
    root.onchange = (e) => {
      const t = e.target;
      if (t.dataset.f === "nimike") { o.nimike = t.value; save(); const y = window.scrollY; paint().then(() => window.scrollTo(0, y)); }
      else if (t.dataset.tark != null) {
        const i = +t.dataset.tark;
        o.tark = (o.tark || []).filter((x) => x !== i).concat(t.checked ? [i] : []);
        save();
        const m = root.querySelector(".card-h .meta"); if (m) m.textContent = o.tark.length + "/" + d.t.length;
      }
    };
    root.onclick = (e) => {
      const b = e.target.closest("[data-kl],[data-flag]");
      if (!b) return;
      if (b.dataset.kl) {
        if (b.dataset.kl === "ei") { o.ei = !o.ei; if (o.ei) o.kl = null; }
        else { const v = +b.dataset.kl; o.kl = o.kl === v ? null : v; o.ei = false; }
      } else o[b.dataset.flag] = !o[b.dataset.flag];
      save();
      const y = window.scrollY; paint().then(() => window.scrollTo(0, y));
    };
    S.cleanup = () => { if (dict) dict.stop(); save.flush(); root.oninput = root.onchange = root.onclick = null; };
    await paint();
  }

  async function view(id) { ka(); if (id) await viewOsa(id); else await viewMain(); }

  /* Lähtötarkistus: arvioimatta jääneet osat yhtenä kohtana */
  function puutteet() {
    if (!S.kohde || !aktiivinen()) return [];
    const p = edistyminen();
    if (p.n >= p.all) return [];
    const miss = D.OSAT.filter((d) => !arvioitu(ka().osat[d.id]));
    return [{ tyyppi: "kuntoarvio", id: "ka", otsikko: "Kuntoarvio: " + miss.length + " rakennusosaa arvioimatta",
      selite: miss.slice(0, 4).map((d) => d.nimi).join(", ") + (miss.length > 4 ? " …" : "") + ". Merkitse kuntoluokka tai \"Ei koske kohdetta\".", toimintoTeksti: "Avaa" }];
  }

  /* Vienti: rakennusosat raporttipohjan järjestyksessä */
  function vienti() {
    if (!S.kohde || !S.kohde.kuntoarvio) return null;
    const a = ka();
    return {
      selite: "Kuntoarvio rakennusosittain (raporttipohjan järjestys). Kuntoluokka on arvioijan arvio; käyttöikälaskelma on sovelluksen laskema taulukon ja vuosiluvun perusteella.",
      kuntoluokat: D.KUNTOLUOKAT.map((x) => x.k + " = " + x.s),
      perustiedot: a.perustiedot, rajaukset: a.rajaukset || "", pts_jakso_v: a.ptsVuodet || 10,
      osat: D.OSAT.map((d) => {
        const o = a.osat[d.id] || {}, l = o.ei ? null : laskelma(d.id);
        return {
          ryhma: ryhma(d.r).nimi, koodi: d.koodi, osa: d.nimi,
          kuntoluokka: o.ei ? "ei koske kohdetta" : (o.kl || null),
          kuntoluokka_selite: o.kl ? D.KUNTOLUOKAT.find((x) => x.k === o.kl).s : null,
          rakenne: o.nimike || null, vuosi: o.vuosi || (a.perustiedot.rakennusvuosi ? a.perustiedot.rakennusvuosi + " (rakennusvuosi)" : null),
          kayttoika_laskettu: l && l.txt ? l.txt : null, tarkastusvali: l ? l.r.tv || null : null, kunnossapitojakso: l ? l.r.kp || null : null, kayttoian_lahde: l ? l.r.lahde || null : null,
          pts_ehdokas: !!((l && l.pts) || (o.kl && o.kl <= 2)),
          valittomasti_korjattava: !!o.valiton, lisatutkimus: !!o.lisatutk, asiantuntija_arvio_suositeltava: !!o.asiantuntija,
          huomiot: o.huom || "",
          tarkistettu: (o.tark || []).map((i) => d.t[i]),
          havainnot: S.havainnot.filter((h) => h.kaOsa === d.id).map((h) => UI.nro(h.nro))
        };
      }),
      martilat: martilaYhteenveto()
    };
  }

  window.Kuntoarvio = { view, kohdeCard, puutteet, vienti, tunnistaOsa, aktiivinen, laskelma, osa, OSAT: D.OSAT, edistyminen };
})();
