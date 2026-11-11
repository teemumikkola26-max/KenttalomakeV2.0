/* =========================================================================
   card.js – Havaintokortti
   Erottaa toisistaan: havainto (sanelu), mittaustulokset (vahvistettava),
   tutkijan alustava tulkinta. Tallentuu automaattisesti.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet, nro } = UI;
  const { S, Model } = App;

  function fieldHtml(f, val) {
    const lbl = '<span>' + esc(f.l) + (f.u ? ' <span class="u">(' + esc(f.u) + ")</span>" : "") + (f.req ? ' <span class="req" aria-label="pakollinen">*</span>' : "") + "</span>";
    if (f.t === "select") {
      return '<label class="field">' + lbl + '<select data-fk="' + f.k + '"><option value="">Valitse</option>' +
        f.o.map((o) => '<option' + (o === val ? " selected" : "") + ">" + esc(o) + "</option>").join("") + "</select></label>";
    }
    if (f.t === "textarea") {
      return '<label class="field" style="grid-column:1/-1">' + lbl + '<textarea data-fk="' + f.k + '" style="min-height:72px">' + esc(val || "") + "</textarea></label>";
    }
    if (f.t === "date") {
      return '<label class="field">' + lbl + '<input type="date" data-fk="' + f.k + '" value="' + esc(val || "") + '"></label>';
    }
    const num = f.t === "num";
    return '<label class="field">' + lbl + '<input type="text" ' + (num ? 'inputmode="decimal" ' : "") + 'data-fk="' + f.k + '" value="' + esc(val || "") + '"></label>';
  }

  function hasMittaus(h) {
    const m = M.menetelma(h.menetelma);
    return m.kentat.some((f) => f.mittaus && h.kentat[f.k] !== undefined && String(h.kentat[f.k]).trim() !== "");
  }

  async function view(id) {
    const k = S.kohde;
    const h = Model.havainto(id);
    if (!h) { location.hash = "#/k/" + k.id; return; }
    await Model.ensureUrls(h.kuvat.concat(h.aanitteet || []));

    const root = document.getElementById("app");
    const save = UI.debounce(() => Model.saveHavainto(h), 400);
    let dict = null, dictTarget = null;

    function kohtaOptions() {
      const own = k.suunnitelma.filter((p) => p.menetelma === h.menetelma);
      const other = k.suunnitelma.filter((p) => p.menetelma !== h.menetelma);
      const opt = (p) => '<option value="' + p.id + '"' + (h.suunnitelmaId === p.id ? " selected" : "") + ">" + esc(Model.kohtaNimi(p)) + " (" + Model.kohtaTehty(p) + "/" + (p.maara || 1) + ")</option>";
      return '<option value="">Valitse</option>' + own.map(opt).join("") +
        (other.length ? '<optgroup label="Muut menetelmät">' + other.map(opt).join("") + "</optgroup>" : "") +
        '<option value="ei"' + (h.suunnitelmaId === "ei" ? " selected" : "") + ">Ei suunnitelmassa</option>";
    }

    function autoKohta() {
      if (h.suunnitelmaId) return;
      const open = k.suunnitelma.filter((p) => p.menetelma === h.menetelma && !Model.kohtaValmis(p));
      if (open.length === 1) h.suunnitelmaId = open[0].id;
    }

    function suggestions() {
      const m = M.menetelma(h.menetelma);
      const units = new Set(m.kentat.filter((f) => f.u).map((f) => f.u));
      return M.lukuehdotukset(h.sanelu).filter((s) => units.has(s.u));
    }

    function paint() {
      const before = h.suunnitelmaId;
      autoKohta();
      if (before !== h.suunnitelmaId) save();
      const m = M.menetelma(h.menetelma);
      const thumbs = h.kuvat.map((fid, i) =>
        '<button class="thumb" data-a="view" data-i="' + i + '" aria-label="Kuva ' + (i + 1) + '"><img src="' + Model.url(fid) + '" alt=""></button>').join("");
      const audio = (h.aanitteet || []).map((fid) => '<audio controls preload="none" src="' + Model.url(fid) + '" style="width:100%;margin-top:6px"></audio>').join("");
      const sug = suggestions();
      const mit = m.kentat.length
        ? '<section class="card"><div class="card-h"><h2>' + esc(m.nimi) + '</h2></div><div class="card-b">' +
          (sug.length ? '<span class="label">Sanelusta tunnistettu</span><div class="chips" style="margin-bottom:12px">' +
            sug.map((s, i) => '<button class="chip sugg" data-a="sugg" data-i="' + i + '">' + esc(s.arvo.replace(".", ",") + " " + s.u) + "</button>").join("") + "</div>" : "") +
          '<div class="grid2">' + m.kentat.map((f) => fieldHtml(f, h.kentat[f.k] != null ? h.kentat[f.k] : "")).join("") + "</div>" +
          (m.kentat.some((f) => f.mittaus)
            ? '<label style="display:flex;gap:10px;align-items:flex-start;font-size:14.5px;font-weight:600;margin-top:4px"><input type="checkbox" data-a="vahv" style="width:22px;height:22px;flex:0 0 auto;margin-top:1px"' + (h.vahvistettu ? " checked" : "") + ">Olen tarkistanut mittausarvot</label>" +
              '<p class="hint">Raporttiin viedään mittausarvoina vain vahvistetut arvot. AI-työkalua ohjeistetaan, ettei se päättele arvoja kuvista tai sanelusta.</p>'
            : "") +
          "</div></section>"
        : "";

      root.innerHTML = App.topbar({ title: nro(h.nro) + " · " + M.menetelma(h.menetelma).lyhyt, sub: Model.sijaintiTeksti(h.sijainti) || "Sijainti puuttuu", back: "#/k/" + k.id }) +
        '<main class="view no-nav">' +
        '<div class="thumbs" style="margin-bottom:12px">' + thumbs +
        '<a class="thumb-add" href="#/k/' + k.id + "/kuvaus/" + h.id + '" aria-label="Lisää kuvia ja sanelua">' + icon("cam") + "</a></div>" +

        '<section class="card"><div class="card-h"><h2>Havainto</h2>' +
        '<button class="icon-btn" data-a="dict" data-t="sanelu" aria-label="Sanele havaintoon">' + icon(dictTarget === "sanelu" ? "stop" : "mic") + "</button></div>" +
        '<div class="card-b"><textarea data-t="sanelu" aria-label="Havainto">' + esc(h.sanelu) + "</textarea>" + audio +
        '<p class="hint">Kirjoita tai sanele, mitä näet ja mittaat. Tulkinta kirjataan erikseen alempana.</p></div></section>' +

        '<section class="card"><div class="card-b" style="padding-top:12px">' +
        '<span class="label">Sijainti</span>' +
        '<button class="btn btn-block" data-a="loc" style="justify-content:flex-start;margin-bottom:14px">' + icon("pin") + esc(Model.sijaintiTeksti(h.sijainti) || "Valitse sijainti") +
        (h.sijainti.piste ? " · merkitty pohjaan" : "") + "</button>" +
        '<span class="label' + (h.tulos ? "" : " missing") + '">Tulos <span class="req">*</span>' + (h.tulos ? "" : " · valitse") + '</span><div class="chips" style="margin-bottom:14px">' +
        '<button class="chip c-note" data-a="tulos" data-v="poikkeama" aria-pressed="' + (h.tulos === "poikkeama") + '">Poikkeama</button>' +
        '<button class="chip c-ok" data-a="tulos" data-v="ok" aria-pressed="' + (h.tulos === "ok") + '">Ei huomautettavaa</button></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="label' + (h.menetelma ? "" : " missing") + '">Menetelmä <span class="req">*</span>' + (h.menetelma ? "" : " · valitse") + '</span>' +
        '<a class="link" href="#/menetelmat" style="font-size:13px;padding:0 0 6px">Muokkaa menetelmiä</a></div>' +
        '<div class="chips scroll" data-menlist style="margin-bottom:14px">' +
        M.MENETELMAT.filter((x) => !x.piilotettu || x.id === h.menetelma).map((x) => '<button class="chip" data-a="men" data-v="' + x.id + '" aria-pressed="' + (x.id === h.menetelma) + '">' + esc(x.nimi) + "</button>").join("") + "</div>" +
        (k.suunnitelma.length ? '<label class="field" style="margin:0"><span>Tutkimussuunnitelman kohta</span><select data-a="kohta">' + kohtaOptions() + "</select></label>" : "") +
        "</div></section>" +

        mit +

        '<section class="card"><div class="card-h"><h2>Alustava tulkinta <span style="font-weight:400;color:var(--muted)">(valinnainen)</span></h2>' +
        '<button class="icon-btn" data-a="dict" data-t="tulkinta" aria-label="Sanele tulkinta">' + icon(dictTarget === "tulkinta" ? "stop" : "mic") + "</button></div>" +
        '<div class="card-b"><textarea data-t="tulkinta" style="min-height:72px" aria-label="Alustava tulkinta" placeholder="Tutkijan oma arvio, esim. todennäköinen syy">' + esc(h.tulkinta) + "</textarea></div></section>" +

        '<button class="btn btn-danger btn-block" data-a="del">' + icon("trash") + "Poista havainto</button>" +
        "</main>" +
        '<div class="actionbar"><a class="btn" href="#/k/' + k.id + '">Tallenna</a>' +
        '<button class="btn btn-primary wide" data-a="next">' + icon("cam") + "Tallenna ja uusi kuva</button></div>";
      UI.showSelected(root.querySelector("[data-menlist]"));
    }

    function stopDict() {
      if (dict) dict.stop();
      dict = null; dictTarget = null;
    }

    function startDict(target) {
      stopDict();
      dictTarget = target;
      const ta = () => root.querySelector('textarea[data-t="' + target + '"]');
      dict = new Dictation({
        onFinal: (t) => {
          if (!t) return;
          let cur = h[target] || "";
          cur = (cur ? cur.replace(/\s+$/, "") + " " : "") + t.charAt(0).toUpperCase() + t.slice(1);
          if (!/[.!?]$/.test(cur)) cur += ".";
          h[target] = cur;
          if (ta()) ta().value = cur;
          save();
        },
        onInterim: () => {},
        onState: (st, msg) => {
          if (st === "error") { if (msg) toast(msg, 4000); dictTarget = null; paint(); }
        },
        onAudio: async (blob) => {
          const fid = await DB.putFile(k.id, blob, { kind: "aanite", havaintoId: h.id });
          h.aanitteet = (h.aanitteet || []).concat(fid);
          await Model.ensureUrls([fid]);
          await Model.saveHavainto(h); paint();
        }
      });
      dict.start();
      paint();
    }

    function viewer(i) {
      const fid = h.kuvat[i];
      const v = document.createElement("div");
      v.className = "viewer";
      v.innerHTML = '<img src="' + Model.url(fid) + '" alt="Kuva ' + (i + 1) + '">' +
        '<div class="vbar"><button class="btn" data-v="close">Sulje</button><button class="btn btn-danger" data-v="del" style="background:#fff">' + icon("trash") + "Poista kuva</button></div>";
      document.body.appendChild(v);
      v.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-v]");
        if (!b && e.target !== v) return;
        if (b && b.dataset.v === "del") {
          v.remove();
          if (!(await confirmSheet({ title: "Poistetaanko kuva?", ok: "Poista kuva", danger: true }))) return;
          h.kuvat.splice(i, 1);
          await DB.del("tiedostot", fid);
          await Model.saveHavainto(h); paint();
          return;
        }
        v.remove();
      });
    }

    root.oninput = (e) => {
      const t = e.target;
      if (t.matches("textarea[data-t]")) { h[t.dataset.t] = t.value; save(); }
      else if (t.matches("[data-fk]") && t.type !== "date") {
        const f = M.menetelma(h.menetelma).kentat.find((x) => x.k === t.dataset.fk);
        h.kentat[t.dataset.fk] = t.value;
        if (f && f.mittaus && h.vahvistettu) { h.vahvistettu = false; const cb = root.querySelector('[data-a="vahv"]'); if (cb) cb.checked = false; }
        if (f && f.muista) { S.kohde.muisti[h.menetelma + "." + f.k] = t.value; Model.saveKohde(); }
        save();
      }
    };
    root.onchange = (e) => {
      const t = e.target;
      if (t.matches('[data-a="kohta"]')) { h.suunnitelmaId = t.value || null; save(); }
      else if (t.matches('[data-a="vahv"]')) {
        if (t.checked && !hasMittaus(h)) { t.checked = false; toast("Kirjaa ensin mittausarvot"); return; }
        h.vahvistettu = t.checked; save();
      }
      else if (t.matches("[data-fk]") && (t.tagName === "SELECT" || t.type === "date")) {
        h.kentat[t.dataset.fk] = t.value;
        const f = M.menetelma(h.menetelma).kentat.find((x) => x.k === t.dataset.fk);
        if (f && f.muista) { S.kohde.muisti[h.menetelma + "." + f.k] = t.value; Model.saveKohde(); }
        save();
      }
    };
    root.onclick = async (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || b.tagName === "SELECT" || b.type === "checkbox") return;
      const a = b.dataset.a;
      if (a === "tulos") { h.tulos = h.tulos === b.dataset.v ? null : b.dataset.v; save(); paint(); }
      else if (a === "men") {
        if (h.menetelma === b.dataset.v) return;
        h.menetelma = b.dataset.v;
        h.vahvistettu = false;
        // muistetut arvot (esim. mittalaite) valmiiksi
        M.menetelma(h.menetelma).kentat.forEach((f) => {
          const mem = S.kohde.muisti[h.menetelma + "." + f.k];
          if (f.muista && mem && !h.kentat[f.k]) h.kentat[f.k] = mem;
        });
        const cur = Model.kohta(h.suunnitelmaId);
        if (cur && cur.menetelma !== h.menetelma) h.suunnitelmaId = null;
        save(); paint();
      }
      else if (a === "sugg") {
        const s = suggestions()[+b.dataset.i];
        const fields = M.menetelma(h.menetelma).kentat.filter((f) => f.u === s.u);
        const target = fields.find((f) => !h.kentat[f.k]) || fields[0];
        if (target) {
          h.kentat[target.k] = s.arvo.replace(".", ",");
          h.vahvistettu = false;
          save(); paint();
          toast(target.l + ": " + s.arvo.replace(".", ",") + " " + s.u + ". Tarkista arvo.");
        }
      }
      else if (a === "loc") Plan.locationSheet(h.sijainti, (s) => { h.sijainti = s; save(); paint(); });
      else if (a === "dict") { if (dictTarget === b.dataset.t) { stopDict(); paint(); } else startDict(b.dataset.t); }
      else if (a === "view") viewer(+b.dataset.i);
      else if (a === "next") {
        save.flush();
        S.kohde.viimeisin = { kerrosId: h.sijainti.kerrosId, tilaId: h.sijainti.tilaId, rakenneosa: h.sijainti.rakenneosa };
        await Model.saveKohde();
        location.hash = "#/k/" + k.id + "/kuvaus";
      }
      else if (a === "del") {
        if (!(await confirmSheet({ title: "Poistetaanko " + nro(h.nro) + "?", text: "Havainnon kuvat ja sanelu poistetaan.", ok: "Poista havainto", danger: true }))) return;
        await Model.deleteHavainto(h);
        location.hash = "#/k/" + k.id;
      }
    };

    paint();
    S.cleanup = () => { stopDict(); save.flush(); root.oninput = root.onchange = root.onclick = null; };
  }

  window.Card = { view };
})();
