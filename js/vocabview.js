/* =========================================================================
   vocabview.js – Sanasto-sivu (#/sanasto)

   Tutkija muokkaa sanelun ja pohjakuvien tulkinnan sanalistoja omaan
   kieleensä sopiviksi. Jokainen lista on tekstikenttä: yksi sana riville,
   tai "sana = arvo". Muutos tallentuu heti ja on käytössä seuraavassa
   sanelussa. "Kokeile sanelua" näyttää, mitä sovellus lauseesta päättelee.
   ========================================================================= */
(function () {
  "use strict";
  const { icon, esc, toast, confirmSheet } = UI;
  const { S } = App;

  const ORDER = ["Sanelu: tulos", "Sanelu: sijainti", "Sanelu: menetelmän kentät", "Pohjakuvat"];
  const count = (key) => Vocab.list(key).length;

  function listHtml(d) {
    const ed = Vocab.edited(d.key);
    return '<details class="card vocab" data-key="' + esc(d.key) + '">' +
      '<summary class="card-h"><h2>' + esc(d.title) + "</h2>" +
      '<span class="meta"><span data-n>' + count(d.key) + "</span>" + (ed ? ' · <b class="vb-ed">muokattu</b>' : "") + "</span></summary>" +
      '<div class="card-b">' +
      '<p class="hint" style="margin:0 0 8px">' + esc(d.help || "") + "</p>" +
      (d.type === "map" && d.options ? '<p class="hint" style="margin:0 0 8px">Arvot: ' + esc((typeof d.options === "function" ? d.options() : d.options).join(", ")) + "</p>" : "") +
      '<textarea data-v="' + esc(d.key) + '" spellcheck="false" autocapitalize="off" autocomplete="off" style="min-height:220px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px">' +
      esc(Vocab.lines(d.key).join("\n")) + "</textarea>" +
      '<div style="display:flex;gap:8px;margin-top:8px;align-items:center">' +
      '<button class="btn btn-sm" data-a="reset" data-key="' + esc(d.key) + '"' + (ed ? "" : " disabled") + ">Palauta oletus</button>" +
      '<span class="hint" data-saved style="margin:0"></span></div>' +
      "</div></details>";
  }

  async function view() {
    const defs = Vocab.all();
    const groups = ORDER.concat(defs.map((d) => d.group).filter((g) => !ORDER.includes(g)))
      .filter((g, i, a) => a.indexOf(g) === i && defs.some((d) => d.group === g));
    const root = document.getElementById("app");
    root.innerHTML = App.topbar({ title: "Sanasto", sub: "Sanat, joilla sanelu ja pohjakuvat tulkitaan", back: App.paluu("#/menetelmat") }) +
      '<main class="view no-nav">' +
      '<section class="card"><div class="card-h"><h2>Täytetään sanelusta</h2></div><div class="card-b">' +
      '<p class="hint" style="margin:0 0 8px">Valitse, mitkä tiedot sovellus päättelee sanelusta. Muut valitset itse. Sanelu tallentuu aina tekstinä, ja itse tehdyistä valinnoista kertyy aineistoa tunnistuksen parantamiseen.</p>' +
      Object.keys(Auto.AF).map((k) => '<label class="ka-chk"><input type="checkbox" data-af="' + k + '"' + (Auto.paalla(k) ? " checked" : "") + '><span><b>' + Auto.AF[k].nimi + "</b>" + (Auto.AF[k].ohje ? '<br><span class="hint">' + Auto.AF[k].ohje + "</span>" : "") + "</span></label>").join("") +
      "</div></section>" +
      '<section class="card"><div class="card-h"><h2>Kokeile sanelua</h2></div><div class="card-b">' +
      '<textarea data-test placeholder="esim. Pesuhuoneen lattiakaivon ympäriltä pko-arvot koholla, Gann Hydromette BL-E, b55-anturi 120 yksikköä" style="min-height:72px"></textarea>' +
      '<div data-out class="hint" style="margin:8px 0 0;font-size:14px;line-height:1.6"></div></div></section>' +
      '<p class="hint" style="margin:0 2px 14px">Yksi sana riville. Sana on sanan alku: <b>kondens</b> osuu sanoihin kondenssi ja kondensoitunut. Enintään kahden kirjaimen sana (<b>us</b>, <b>ap</b>) ja lainausmerkeissä oleva sana tunnistetaan vain kokonaisena. # aloittaa kommentin. ' +
      'Menetelmien omat tunnistussanat ja kenttien sanat muokataan <a href="#/menetelmat">Menetelmät</a>-sivulla.</p>' +
      groups.map((g) => '<h3 class="label" style="margin:18px 4px 8px">' + esc(g) + "</h3>" + defs.filter((d) => d.group === g).map(listHtml).join("")).join("") +
      '<p class="hint" style="margin-top:16px">Sanasto tallentuu tälle laitteelle. Se kulkee Menetelmät-sivun <i>Vie menetelmät</i> -tiedostossa, joten tiimi voi käyttää yhteistä sanastoa.</p>' +
      "</main>";

    const savers = {};
    const test = root.querySelector("[data-test]");
    root.querySelectorAll("[data-af]").forEach((c) => c.addEventListener("change", () => { Auto.aseta(c.dataset.af, c.checked); UI.toast(Auto.AF[c.dataset.af].nimi + ": " + (c.checked ? "sanelusta" : "valitaan itse"), 2200); }));
    const out = root.querySelector("[data-out]");
    const runTest = () => { out.innerHTML = tryText(test.value); };

    root.oninput = (e) => {
      const ta = e.target.closest("[data-v]");
      if (ta) {
        const key = ta.dataset.v;
        const box = ta.closest("details");
        box.querySelector("[data-saved]").textContent = "";
        savers[key] = savers[key] || UI.debounce(async () => {
          await Vocab.set(key, ta.value);
          box.querySelector("[data-n]").textContent = count(key);
          const ed = Vocab.edited(key);
          box.querySelector('[data-a="reset"]').disabled = !ed;
          const meta = box.querySelector(".meta");
          meta.innerHTML = '<span data-n>' + count(key) + "</span>" + (ed ? ' · <b class="vb-ed">muokattu</b>' : "");
          box.querySelector("[data-saved]").textContent = "Tallennettu";
          runTest();
        }, 600);
        savers[key]();
      } else if (e.target === test) runTest();
    };
    root.onclick = async (e) => {
      const b = e.target.closest('[data-a="reset"]');
      if (!b || b.disabled) return;
      const key = b.dataset.key;
      if (!(await confirmSheet({ title: "Palautetaanko oletussanasto?", text: "Listan muutokset korvataan sovelluksen oletuksilla.", ok: "Palauta", danger: true }))) return;
      await Vocab.reset(key);
      toast("Oletus palautettu");
      App.render();
    };
    S.cleanup = () => {
      Object.values(savers).forEach((s) => s.flush && s.flush());
      root.oninput = root.onclick = null;
    };
  }

  /* Näyttää, mitä sanelusta päätellään: menetelmä, tulos, tila, rakenneosa ja kentät */
  function tryText(text) {
    if (!text.trim()) return "";
    const D = Auto._detect;
    const t = D.norm(text);
    const rows = [];
    const add = (k, v) => rows.push("<div>" + esc(k) + ": <b>" + esc(v) + "</b></div>");
    let mid = null;
    try { mid = D.detectMethod(t); } catch (e) { /* ohita */ }
    add("Menetelmä", mid ? M.menetelma(mid).nimi : "ei tunnistettu");
    const tul = D.detectTulos(t);
    add("Tulos", tul ? M.TULOKSET[tul] : "ei tunnistettu");
    const tila = Vocab.list("tilat").find(([w]) => new RegExp("(^| )" + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u").test(t));
    if (tila) add("Tila", tila[1]);
    const part = D.detectPart(t);
    if (part) add("Rakenneosa", part);
    if (mid && window.FieldFill) {
      try {
        // Sama päättely kuin kirjauksessa, mutta ilman tallennusta (ei muuta muistettuja arvoja)
        const m = M.menetelma(mid), pt = FieldFill.prep(text);
        const tables = m.kentat.filter((f) => f.t === "table");
        const main = tables.find((f) => (f.sarakkeet || []).some((c) => c.ryhma)) || tables[0];
        m.kentat.forEach((f) => {
          if (f.t === "date") return;
          if (f.t === "table") {
            const amb = f !== main && !(f.sarakkeet || []).some((c) => c.ryhma);
            const split = tables.length > 1;
            const rs = FieldFill.tableRows(Object.assign({}, f, { __ambSplit: split }), pt, amb && split);
            if (rs.length) add(f.l, rs.map((r) => (f.sarakkeet || []).filter((c) => c.t !== "date" && r[c.k] != null && r[c.k] !== "")
              .map((c) => c.l + " " + String(r[c.k]).replace(".", ",") + (c.u ? " " + c.u : "")).join(", ")).join(" | "));
            return;
          }
          const v = FieldFill.scalarValue(f, pt);
          if (v != null && v !== "") add(f.l, String(v) + (f.u && f.t === "num" ? " " + f.u : ""));
        });
      } catch (e) { console.warn(e); }
    }
    return rows.join("");
  }

  window.VocabView = { view, tryText };
})();
