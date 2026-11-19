/* =========================================================================
   kalusto.js – Kalusto mukaan

   Pakkauslista kohteelle ennen kenttäkäyntiä: yleiskalusto, tutkimus-
   suunnitelman menetelmien kalusto ja näytetyyppien kalusto (Labrocin
   näytteenotto-ohjeiden mukaan). Lähde: Menetelmät ja kalusto -taulukko
   (js/menetelmat-data.js). Sama varuste näytetään vain kerran.

   Näytetyypit päätellään suunnitelman kohtien kuvauksista ("2 × VOC-ilmanäyte")
   ja jo otetuista näytteistä; tutkija voi lisätä tyyppejä ja menetelmiä.
   Tallennus: kohde.kalusto = { pakattu: { nimi: true }, tyypit: [], menetelmat: [], piilota: bool }
   Vain tällä laitteella (pakkaus on tutkijan oma), ei pilveen eikä raporttipakettiin.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast } = UI;
  const { S, Model } = App;

  const tila = () => { const k = S.kohde; k.kalusto = k.kalusto || { pakattu: {}, tyypit: [], menetelmat: [] }; return k.kalusto; };

  /* Suunnitelman menetelmät (pois jätetyt ohitetaan) ja tutkijan lisäämät */
  function menetelmat() {
    const k = S.kohde, t = tila(), ids = [];
    k.suunnitelma.filter((p) => !p.pois).forEach((p) => { if (!ids.includes(p.menetelma)) ids.push(p.menetelma); if (p.naytteet && !ids.includes("nayte")) ids.push("nayte"); });
    (t.menetelmat || []).forEach((id) => { if (!ids.includes(id)) ids.push(id); });
    return ids.filter((id) => M.MENETELMAT.some((m) => m.id === id));
  }
  /* Näytetyypit: suunnitelman kuvauksista, otetuista näytteistä ja tutkijan lisäämät */
  function naytetyypit() {
    const k = S.kohde, t = tila(), out = [];
    const add = (x) => { if (x && M.naytetiedot(x) && !out.includes(x)) out.push(x); };
    k.suunnitelma.filter((p) => !p.pois && (p.menetelma === "nayte" || p.naytteet)).forEach((p) => M.naytetyypitTekstista([p.kuvaus, p.otsikko, p.teksti].filter(Boolean).join(" ")).forEach(add));
    S.havainnot.filter((h) => h.menetelma === "nayte").forEach((h) => add(h.kentat && h.kentat.tyyppi));
    (t.tyypit || []).forEach(add);
    return out;
  }

  /* Ryhmät: [{ otsikko, alaotsikko, rivit: [{ n, aina }] }], sama varuste vain ensimmäisessä ryhmässä */
  function ryhmat() {
    const nahty = new Set(), out = [];
    const ryhma = (otsikko, alaotsikko, rivit, poistettava) => {
      const r = rivit.filter((x) => { const key = x.n.toLowerCase(); if (nahty.has(key)) return false; nahty.add(key); return true; });
      if (r.length) out.push({ otsikko, alaotsikko, rivit: r, poistettava });
    };
    ryhma("Yleiskalusto", "Jokainen käynti", M.kalusto("yleis"));
    const t = tila();
    menetelmat().forEach((id) => ryhma(M.menetelma(id).nimi, "", M.kalusto(id), (t.menetelmat || []).includes(id) ? { m: id } : null));
    naytetyypit().forEach((x) => {
      const d = M.naytetiedot(x);
      const kn = d.kn && /^Kyllä/.test(d.kn) ? "Kenttänolla: " + d.kn.replace(/^Kyllä,?\s*/, "") : "";
      ryhma(x, [d.ohje ? "Labroc " + d.ohje : "", kn].filter(Boolean).join(" · "), (d.kalusto || []).map((n) => ({ n: n.charAt(0).toUpperCase() + n.slice(1), aina: true })), (t.tyypit || []).includes(x) ? { t: x } : null);
    });
    return out;
  }

  function laske() {
    const p = tila().pakattu || {};
    const all = ryhmat().flatMap((g) => g.rivit.filter((r) => r.aina));
    return { n: all.filter((r) => p[r.n]).length, all: all.length };
  }

  /* Rivi kohteen sivulle: näkyvissä ennen ensimmäistä havaintoa, sen jälkeen Lisää-kohdassa */
  function riviHtml() {
    const k = S.kohde;
    if (!k.suunnitelma.length && !(tila().menetelmat || []).length) return "";
    const e = laske();
    return '<a class="row seur-link" href="#/k/' + k.id + '/kalusto" style="text-decoration:none;color:inherit;margin:-4px 0 12px;border-radius:12px">' +
      icon("check") + '<div class="grow"><div class="t">Kalusto mukaan</div><div class="s">' +
      (e.n ? e.n + " / " + e.all + " pakattu" : e.all + " varustetta suunnitelman mukaan") + "</div></div>" + icon("back", "flip") + "</a>";
  }

  async function view() {
    const k = S.kohde, t = tila();
    const root = document.getElementById("app");
    const tallenna = UI.debounce(() => Model.saveKohde(), 300);

    function paint() {
      const p = t.pakattu || {}, gs = ryhmat(), e = laske();
      const mVal = M.MENETELMAT.filter((m) => !m.piilotettu && M.kalusto(m.id).length && !menetelmat().includes(m.id));
      const tVal = M.NAYTETYYPIT.map(([g, os]) => [g, os.filter((x) => (M.naytetiedot(x).kalusto || []).length && !naytetyypit().includes(x))]).filter(([, os]) => os.length);
      const rivi = (r) => '<label class="ka-chk"><input type="checkbox" data-n="' + esc(r.n) + '"' + (p[r.n] ? " checked" : "") + "><span>" + esc(r.n) +
        (r.aina ? "" : ' <span class="hint" style="font-size:12.5px">tarvittaessa</span>') + "</span></label>";
      const piilota = !!t.piilota;
      root.innerHTML = App.topbar({ title: "Kalusto mukaan", sub: e.n + " / " + e.all + " pakattu · " + (k.nimi || "Nimetön kohde"), back: "#/k/" + k.id }) +
        '<main class="view no-nav">' +
        '<p class="hint" style="margin:0 0 12px">Lista on koottu tutkimussuunnitelman menetelmistä ja näytetyypeistä. Rasti kun varuste on pakattu. Rastit jäävät vain tähän puhelimeen.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
          '<button class="chip" data-a="piilota" aria-pressed="' + piilota + '">Piilota pakatut</button>' +
          (e.n ? '<button class="chip" data-a="nollaa">Tyhjennä rastit</button>' : "") + "</div>" +
        gs.map((g) => {
          const rr = g.rivit.filter((r) => !(piilota && p[r.n]));
          const valmis = g.rivit.filter((r) => r.aina).every((r) => p[r.n]);
          return '<section class="card"><div class="card-h"><h2>' + esc(g.otsikko) + "</h2>" +
            '<span class="meta">' + (valmis ? icon("ok") : g.rivit.filter((r) => p[r.n]).length + " / " + g.rivit.length) + "</span>" +
            (g.poistettava ? '<button class="link" data-a="poista" data-m="' + esc(g.poistettava.m || "") + '" data-t="' + esc(g.poistettava.t || "") + '">Poista</button>' : "") + "</div>" +
            '<div class="card-b">' + (g.alaotsikko ? '<p class="hint" style="margin:0 0 4px">' + esc(g.alaotsikko) + "</p>" : "") +
            (rr.length ? rr.map(rivi).join("") : '<p class="hint" style="margin:6px 0">Kaikki pakattu.</p>') + "</div></section>";
        }).join("") +
        '<section class="card"><div class="card-h"><h2>Lisää listaan</h2></div><div class="card-b">' +
          (tVal.length ? '<label class="field"><span>Näytetyyppi</span><select data-a="lisaatyyppi"><option value="">Valitse näytetyyppi</option>' +
            tVal.map(([g, os]) => '<optgroup label="' + esc(g) + '">' + os.map((x) => "<option>" + esc(x) + "</option>").join("") + "</optgroup>").join("") + "</select></label>" : "") +
          (mVal.length ? '<label class="field"><span>Menetelmä, jota ei ole suunnitelmassa</span><select data-a="lisaamenetelma"><option value="">Valitse menetelmä</option>' +
            mVal.map((m) => '<option value="' + esc(m.id) + '">' + esc(m.nimi) + "</option>").join("") + "</select></label>" : "") +
        "</div></section>" +
        "</main>";
    }

    root.onchange = (e) => {
      const el = e.target;
      if (el.matches("input[data-n]")) {
        t.pakattu = t.pakattu || {};
        if (el.checked) t.pakattu[el.dataset.n] = true; else delete t.pakattu[el.dataset.n];
        tallenna();
        if (t.piilota) setTimeout(paint, 250); else { const e2 = laske(); const sub = root.querySelector(".tb-title .sub"); if (sub) sub.textContent = e2.n + " / " + e2.all + " pakattu · " + (k.nimi || "Nimetön kohde"); }
        return;
      }
      if (el.matches('[data-a="lisaatyyppi"]') && el.value) { t.tyypit = (t.tyypit || []).concat([el.value]); tallenna(); paint(); toast(el.value + " lisätty"); }
      if (el.matches('[data-a="lisaamenetelma"]') && el.value) { t.menetelmat = (t.menetelmat || []).concat([el.value]); tallenna(); paint(); }
    };
    root.onclick = (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || b.tagName === "SELECT") return;
      if (b.dataset.a === "piilota") { t.piilota = !t.piilota; tallenna(); paint(); }
      else if (b.dataset.a === "nollaa") { t.pakattu = {}; tallenna(); paint(); toast("Rastit tyhjennetty"); }
      else if (b.dataset.a === "poista") {
        if (b.dataset.m) t.menetelmat = (t.menetelmat || []).filter((x) => x !== b.dataset.m);
        if (b.dataset.t) t.tyypit = (t.tyypit || []).filter((x) => x !== b.dataset.t);
        tallenna(); paint();
      }
    };
    paint();
  }

  window.Kalusto = { view, riviHtml, ryhmat, laske, naytetyypit, menetelmat };
})();
