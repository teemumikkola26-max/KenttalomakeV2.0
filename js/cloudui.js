/* =========================================================================
   cloudui.js – kirjautuminen, tili, synkronoinnin tila ja kohteen tiimi
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet, promptSheet } = UI;
  const { S, Model } = App;

  /* Kirjautumisnäkymä: ilman kirjautumista (eikä aiempaa kirjautumista laitteella) ei pääse tietoihin */
  function loginView() {
    document.getElementById("app").innerHTML =
      '<main class="view no-nav" style="display:flex;flex-direction:column;justify-content:center;min-height:100vh;max-width:460px;margin:0 auto">' +
      '<img src="pbm-logo.png" alt="" style="width:64px;height:64px;margin:0 auto 14px;display:block">' +
      '<h1 style="text-align:center;font-size:24px;margin:0 0 6px">Kuva + sanelu</h1>' +
      '<p style="text-align:center;color:var(--muted);margin:0 0 22px">Kirjaudu organisaation Microsoft 365 -tunnuksella.</p>' +
      (Cloud.virhe ? '<div class="alert">' + icon("alert") + "<div>" + esc(Cloud.virhe) + "</div></div>" : "") +
      '<button class="btn btn-primary btn-block" data-login style="min-height:56px">Kirjaudu Microsoft-tunnuksella</button>' +
      '<p class="hint" style="text-align:center;margin-top:16px">Kohteiden tiedot näkyvät vain kohteen tiimille. Kirjaukset tallentuvat ensin puhelimeen ja siirtyvät pilveen, kun yhteys on.</p>' +
      "</main>";
    document.querySelector("[data-login]").addEventListener("click", () => {
      if (!navigator.onLine) { toast("Kirjautuminen vaatii verkkoyhteyden.", 3500); return; }
      Cloud.login().catch((e) => toast("Kirjautuminen epäonnistui: " + (e.message || e), 5000));
    });
  }
  const tarvitaanKirjautuminen = () => Cloud.enabled && !Cloud.kirjautunut && !Cloud.user();

  /* Synkronoinnin tila yhdellä rivillä */
  function tilaTeksti(st) {
    const hh = (t) => { const d = new Date(t); return d.getHours() + "." + String(d.getMinutes()).padStart(2, "0"); };
    if (st.tila === "ok") return { c: "ok", t: st.jono ? "Lähetetään " + st.jono + " muutosta…" : "Pilvessä ajan tasalla" + (st.aika ? " · " + hh(st.aika) : "") };
    if (st.tila === "kaynnissa") return { c: "ok", t: "Synkronoidaan…" };
    if (st.tila === "offline") return { c: "warn", t: "Ei verkkoa" + (st.jono ? ": " + st.jono + " muutosta odottaa lähetystä" : ". Kirjaukset tallentuvat puhelimeen.") };
    if (st.tila === "kirjaudu") return { c: "warn", t: "Kirjaudu uudelleen, niin muutokset siirtyvät pilveen" + (st.jono ? " (" + st.jono + " odottaa)" : "") };
    if (st.tila === "virhe") return { c: "warn", t: st.viesti || "Synkronointi epäonnistui" };
    return null;
  }
  function syncBarHtml(k) {
    if (!Cloud.enabled) return "";
    if (k && !k.pilvi) return '<div class="syncbar warn" data-syncbar>Kohde on vain tällä laitteella. <a href="#/k/' + k.id + '/tiedot">Siirrä pilveen</a></div>';
    const t = tilaTeksti(Sync.state);
    return '<div class="syncbar ' + (t ? t.c : "") + '" data-syncbar>' + (t ? esc(t.t) : "") + (Sync.state.tila === "kirjaudu" ? ' <button class="link" data-relogin>Kirjaudu</button>' : "") + "</div>";
  }
  Sync.onChange(() => {
    const el = document.querySelector("[data-syncbar]");
    if (!el || (S.kohde && !S.kohde.pilvi && el.textContent.indexOf("Siirrä") >= 0)) return;
    const t = tilaTeksti(Sync.state);
    el.className = "syncbar " + (t ? t.c : "");
    el.innerHTML = (t ? esc(t.t) : "") + (Sync.state.tila === "kirjaudu" ? ' <button class="link" data-relogin>Kirjaudu</button>' : "");
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-relogin]")) Cloud.login();
  });

  /* Etusivu: tili ja pilven kohteet, joita ei ole laitteella */
  function accountHtml() {
    if (!Cloud.enabled) return "";
    const u = Cloud.user();
    return '<section class="card"><div class="card-h"><h2>Tili</h2><span class="meta">' + (Cloud.kirjautunut ? "kirjautunut" : "ei yhteyttä") + '</span></div><div class="card-b">' +
      "<div><b>" + esc(u ? u.nimi || u.email : "") + "</b></div>" +
      '<div class="hint" style="margin:4px 0 10px">Kenttänumerot: <b>' + esc(u && u.sarja ? u.sarja + "-01, " + u.sarja + "-02 …" : "–") + "</b> (vain kentällä; raportille havainnot numeroidaan H01, H02 …)</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (Cloud.kirjautunut ? '<button class="btn btn-sm" data-sarja>Vaihda kirjaimet</button>' : '<button class="btn btn-sm btn-primary" data-relogin>Kirjaudu</button>') +
      '<button class="btn btn-sm" data-logout>Kirjaudu ulos</button></div>' +
      '<div data-pilvikohteet></div></div></section>';
  }
  async function bindHome(root) {
    if (!Cloud.enabled) return;
    const sb = root.querySelector("[data-sarja]");
    if (sb) sb.addEventListener("click", async () => {
      const v = await promptSheet({ title: "Kenttänumeroiden kirjaimet", text: "Kirjaimet erottavat sinun havaintosi muiden tutkijoiden havainnoista kentällä (esim. TM-05). Raportille havainnot numeroidaan juoksevasti.", label: "Kirjaimet (2–4)", value: (Cloud.user() || {}).sarja || "", required: true });
      if (!v) return;
      try { await Cloud.setSarja(v); App.render(); } catch (e) { toast("Tallennus epäonnistui: " + (e.message || e), 4000); }
    });
    root.querySelector("[data-logout]").addEventListener("click", async () => {
      const jono = (await Promise.all((await DB.all("kohteet")).filter((k) => k.pilvi).map((k) => Sync.jonossa(k.id)))).reduce((a, b) => a + b, 0);
      if (!(await confirmSheet({ title: "Kirjaudutaanko ulos?", text: (jono ? "HUOM: " + jono + " muutosta ei ole vielä pilvessä. Ne säilyvät puhelimessa, kunnes kirjaudut uudelleen ja ne lähetetään. " : "") + "Pilvikohteiden tiedot poistetaan tästä puhelimesta (lähetetyt tiedot säilyvät pilvessä).", ok: "Kirjaudu ulos", danger: true }))) return;
      await Sync.siivoa(true);
      await Cloud.logout();
      location.hash = "#/"; App.render();
    });
    const box = root.querySelector("[data-pilvikohteet]");
    try {
      const local = new Set((await DB.all("kohteet")).map((k) => k.id));
      const rows = (await Sync.pilviKohteet()).filter((r) => !local.has(r.id));
      if (!rows.length) return;
      box.innerHTML = '<span class="label" style="margin-top:14px;display:block">Tiimisi kohteet pilvessä</span>' +
        rows.map((r) => '<button class="row" data-hae="' + esc(r.id) + '" data-nimi="' + esc(r.nimi) + '" style="padding-left:0;padding-right:0"><div class="grow"><div class="t">' + esc(r.nimi || "Nimetön kohde") + '</div><div class="s">Päivitetty ' + esc(UI.pvm(r.updated_at)) + "</div></div>" + icon("download") + "</button>").join("");
      box.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-hae]");
        if (!b) return;
        b.disabled = true; toast("Haetaan kohde…", 8000);
        try { const id = await Sync.hae(b.dataset.hae, b.dataset.nimi); UI.hideToast(); location.hash = "#/k/" + id; }
        catch (err) { b.disabled = false; toast("Haku epäonnistui: " + (err.message || err), 5000); }
      });
    } catch (e) { /* ei verkkoa: ei listaa */ }
  }

  /* Kohteen tiedot: tiimi tai siirto pilveen */
  function tiimiHtml(k) {
    if (!Cloud.enabled) return "";
    if (!k.pilvi) {
      return '<section class="card"><div class="card-h"><h2>Pilvi ja tiimi</h2></div><div class="card-b">' +
        '<p style="margin:0 0 10px">Kohde on vain tällä laitteella. Pilvessä se on varmuuskopioitu ja tiimisi voi kirjata siihen samaan aikaan.</p>' +
        (Cloud.kirjautunut ? '<button class="btn btn-primary btn-block" data-pilveen>' + icon("upload") + "Siirrä kohde pilveen</button>" : '<p class="hint">Kirjaudu ensin.</p>') + "</div></section>";
    }
    return '<section class="card"><div class="card-h"><h2>Tiimi</h2></div><div class="card-b"><div data-tiimi><p class="hint" style="margin:0">Haetaan…</p></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><input type="email" data-uusijasen placeholder="etunimi.sukunimi@' + esc(((window.KS_CONFIG || {}).sallitutDomainit || ["pbm.fi"])[0]) + '" autocomplete="off" style="flex:1;min-width:0"><button class="btn btn-sm btn-primary" data-lisaa>Lisää</button></div>' +
      '<p class="hint" style="margin:8px 0 0">Vain tiimin jäsenet näkevät kohteen. Lisätty tutkija voi jatkaa kirjauksia omalla puhelimellaan.</p></div></section>';
  }
  async function bindTiimi(root, k) {
    if (!Cloud.enabled) return;
    const pb = root.querySelector("[data-pilveen]");
    if (pb) pb.addEventListener("click", async () => {
      if (!(await confirmSheet({ title: "Siirretäänkö kohde pilveen?", text: "Kohteen tiedot ja kuvat siirretään organisaation pilveen (EU). Vain kohteen tiimi näkee ne.", ok: "Siirrä" }))) return;
      await Sync.siirraPilveen(k); App.render();
    });
    const box = root.querySelector("[data-tiimi]");
    if (!box) return;
    const paint = async () => {
      if (!Cloud.kirjautunut || !navigator.onLine) { box.innerHTML = '<p class="hint" style="margin:0">Tiimi näkyy, kun yhteys on.</p>'; return; }
      try {
        const me = Cloud.user() || {};
        const t = await Sync.tiimi(k.id);
        const omistaja = t.some((x) => x.id === me.id && x.rooli === "omistaja");
        box.innerHTML = t.map((x) => '<div class="row" style="padding-left:0;padding-right:0;cursor:default"><div class="grow"><div class="t">' + esc(x.nimi || x.email) + (x.id === me.id ? " (sinä)" : "") + '</div><div class="s">' + esc([x.email, x.rooli === "omistaja" ? "omistaja" : "", x.sarja ? "kenttänumerot " + x.sarja : ""].filter(Boolean).join(" · ")) + "</div></div>" +
          ((omistaja && x.id !== me.id) || (x.id === me.id && x.rooli !== "omistaja") ? '<button class="icon-btn" data-poista="' + x.id + '" aria-label="Poista tiimistä">' + icon("trash") + "</button>" : "") + "</div>").join("");
      } catch (e) { box.innerHTML = '<p class="hint" style="margin:0">Tiimin haku epäonnistui.</p>'; }
    };
    root.querySelector("[data-lisaa]").addEventListener("click", async () => {
      const inp = root.querySelector("[data-uusijasen]");
      try { const p = await Sync.lisaaJasen(k.id, inp.value); inp.value = ""; toast((p.nimi || "Tutkija") + " lisätty tiimiin"); paint(); }
      catch (e) { toast(e.message || String(e), 5000); }
    });
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-poista]");
      if (!b) return;
      if (!(await confirmSheet({ title: "Poistetaanko tiimistä?", text: "Tutkija ei enää näe kohdetta. Hänen kirjauksensa säilyvät.", ok: "Poista", danger: true }))) return;
      try { await Sync.poistaJasen(k.id, b.dataset.poista); paint(); } catch (err) { toast(err.message || String(err), 4000); }
    });
    paint();
  }

  /* Muiden tutkijoiden muutokset näkyviin: vain yleisnäkymissä (ei kesken kirjauksen) */
  Sync.paivitaNakyma = () => {
    const h = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
    const yleis = h[0] === "k" && ["", undefined, "havainnot", "pohja", "lahto"].includes(h[2]);
    const kirjoittaa = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (yleis && !document.querySelector(".sheet") && !kirjoittaa) App.render();
  };

  window.CloudUI = { loginView, tarvitaanKirjautuminen, syncBarHtml, accountHtml, bindHome, tiimiHtml, bindTiimi };
})();
