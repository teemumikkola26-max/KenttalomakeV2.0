"""Menetelmät ja kalusto -taulukko -> js/menetelmat-data.js (window.MENETELMA_DATA).
Märkätilakartoitus, RH-taulukot ja sanelun valintasanat ovat käsin methods.js:ssä."""
import openpyxl, json, re, sys, collections, warnings
warnings.filterwarnings("ignore")
SRC = sys.argv[1]
OUT = sys.argv[2]
wb = openpyxl.load_workbook(SRC)

def rows(name):
    ws = wb[name]
    rr = list(ws.iter_rows(values_only=True))
    head = [str(c).strip() if c else "" for c in rr[0]]
    out = []
    for r in rr[1:]:
        if not any(c not in (None, "") for c in r):
            continue
        out.append({head[i]: (str(r[i]).strip() if r[i] is not None else "") for i in range(len(head)) if head[i]})
    return out

TYYPIT = {"Teksti": "text", "Pitkä teksti": "textarea", "Numero": "num", "Päivämäärä": "date", "Valinta": "select",
          "Taulukko": "table", "Lasketaan": "calc", "Kellonaika": "time", "Kellonaika (uusi tyyppi)": "time",
          "Monivalinta": "multi"}
TASO = {"Kohta": "kohta", "Tila": "tila", "Kohde": "kohde"}
yes = lambda s: s.strip().lower().startswith("kyll")
split = lambda s: [x.strip() for x in s.split(";") if x.strip()]
numre = re.compile(r"^\d+(?:[,.]\d+)?$")

def field(r, kun_ids=None):
    t = TYYPIT[r["Tyyppi"]]
    f = {"k": r["Kentän tunnus"], "l": r["Otsikko"], "t": t}
    if r.get("Yksikkö"): f["u"] = r["Yksikkö"]
    opt = r.get("Vaihtoehdot") or r.get("Vaihtoehdot / ohje") or ""
    if t in ("select", "multi"):
        if opt and not opt.startswith("kohteen") and not opt.startswith("tämän"):
            f["o"] = split(opt)
        elif opt.startswith("kohteen"):
            f["t"] = "text"           # rakenneavaus: tunnus (linkitys sovelluksessa)
    elif opt:
        if t == "num" and numre.match(opt) and not yes(r.get("Mittausarvo", "")):
            f["oletus"] = opt.replace(".", ",")
        elif t != "table":
            f["ph"] = opt
    if yes(r.get("Pakollinen", "")): f["req"] = True
    if yes(r.get("Mittausarvo", "")): f["mittaus"] = True
    if yes(r.get("Muista edellinen", "")): f["muista"] = True
    kun = r.get("Näkyy kun", "")
    if kun:
        k, v = [x.strip() for x in kun.split("=", 1)]
        f["kun"] = {"k": k, "v": [x.strip() for x in v.split("/")]}
    return f

# ---- Menetelmät
mets = rows("Menetelmät")
nimi2id = {m["Menetelmä"]: m["Tunnus"] for m in mets}
out_m = []
for m in mets:
    if m["Tila"].lower().startswith("poista"):
        continue
    ali = []
    for a in [x.strip() for x in m.get("Tyypilliset alimenetelmät", "").split(",")]:
        if a in nimi2id: ali.append(nimi2id[a])
        elif a == "Kaikki": ali = ["*"]
    out_m.append({"id": m["Tunnus"], "nimi": m["Menetelmä"], "lyhyt": m["Lyhenne"], "taso": TASO.get(m["Taso"], "kohta"),
                  "ali": ali, "sanasto": [w.strip() for w in m.get("Sanelun tunnistussanat", "").split(",") if w.strip()],
                  "kuvaus": m.get("Kuvaus", ""), "kentat": []})
byid = {m["id"]: m for m in out_m}
# Liian yleiset tunnistussanat (testi 19.11.: "ei havaittu vedeneristettä" on aistinvarainen havainto, ei kalvopaksuusmittaus)
POISTA_SANAT = {"kalvopaksuus": ["vedeneriste", "vesieriste"]}
for mid, ws in POISTA_SANAT.items():
    byid[mid]["sanasto"] = [w for w in byid[mid]["sanasto"] if w not in ws]

# ---- Kentät (märkätila, RH-taulukot ja VSS-tarkastuslista käsitellään erikseen)
vss_rivit = []
for r in rows("Kentät"):
    mid = nimi2id[r["Menetelmä"]]
    if r.get("Tila", "").lower().startswith("poista") or mid == "mtk":
        continue
    if r["Tyyppi"] == "Taulukko" and mid == "vss":
        txt = r["Vaihtoehdot"]
        rv = txt.split("Rivit:", 1)[1].split(". Sarakkeet:")[0]
        vss_rivit = split(rv)
        so = re.search(r"Kunto \(([^)]*)\)", txt).group(1)
        vss_opts = [x.strip() for x in so.split("/")]
        for i, l in enumerate(vss_rivit):
            byid[mid]["kentat"].append({"k": "vss%02d" % (i + 1), "l": l, "t": "select", "o": vss_opts, "okv": vss_opts[0], "tarkistus": True})
        continue
    if r["Tyyppi"] == "Taulukko":
        byid[mid]["kentat"].append({"k": r["Kentän tunnus"], "taulukko": True})   # paikka; sisältö methods.js:ssä
        continue
    f = field(r)
    if f["t"] == "calc":
        f["kaava"] = {"lujuus": "vetolujuus"}.get(f["k"], f["k"])
        f.pop("ph", None)
    byid[mid]["kentat"].append(f)

# ---- Näytteet
ntyy = []
for r in rows("Näytteet"):
    if r["Tila"].lower().startswith("poista"):
        continue
    ntyy.append({"nimi": r["Näytetyyppi"], "ryhma": r["Ryhmä"], "ohje": r.get("Labroc-ohje", ""), "kn": r.get("Kenttänolla", ""),
                 "muistutus": r.get("Muistutus kentällä", ""), "kalusto": split(r.get("Kalusto", "")), "lahde": r.get("Lähde", ""),
                 "tila": r["Tila"]})
tyypit = [t["nimi"] for t in ntyy]
yhteiset, perkentta, jarj = [], collections.OrderedDict(), {}
for r in rows("Näytekentät"):
    if r.get("Tila", "").lower().startswith("poista"):
        continue
    if r["Näytetyyppi"] == "Kaikki näytteet":
        yhteiset.append(field(r)); continue
    f = field(r)
    jarj.setdefault(r["Näytetyyppi"], []).append(f["k"])
    sig = json.dumps(f, ensure_ascii=False, sort_keys=True)
    perkentta.setdefault(sig, {"f": f, "v": []})["v"].append(r["Näytetyyppi"])
for t in ntyy: t["kentat"] = jarj.get(t["nimi"], [])
nkentat = []
for x in perkentta.values():
    f = dict(x["f"]); f["kun"] = {"k": "tyyppi", "v": x["v"]}
    nkentat.append(f)

# ---- Kalusto
kal = collections.OrderedDict()
for r in rows("Kalusto"):
    if r.get("Tila", "").lower().startswith("poista"):
        continue
    mid = "yleis" if r["Menetelmä"].startswith("Yleiskalusto") else nimi2id.get(r["Menetelmä"])
    if not mid: print("tuntematon kalusto", r); continue
    if r["Kalusto"].startswith("Näytetyypin mukainen"): continue
    kal.setdefault(mid, []).append({"n": r["Kalusto"], "aina": r["Milloin mukaan"].startswith("Aina")})
# Teemu 17.11.: veden lämpötilamittari asuntokaupan kuntotarkastukseen (taulukon rivi 115)
if not any(x["n"].startswith("Veden lämpötila") for x in kal.get("asuntokauppa", [])):
    kal.setdefault("asuntokauppa", []).append({"n": "Veden lämpötilamittari", "aina": True})

# ---- Asuntokaupan kuntotarkastus (välilehti Kuntotarkastus, jos on)
import unicodedata
def slug(t):
    t = unicodedata.normalize("NFKD", t.lower().replace("ä", "a").replace("ö", "o").replace("å", "a"))
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")[:28]
AKK_TYYPIT = {"Teksti": "text", "Pitkä teksti": "textarea", "Numero": "num", "Päivämäärä": "date", "Valinta": "select", "Monivalinta": "multi"}

def numeroi(osiot):
    """Luvun 5 osiot juoksevaan numerojärjestykseen (Teemu 20.11.: Sisätilat ja Muut tilat olivat molemmat 5.12).
    Alaluvut (5.14.1 …) säilyvät ryhmänä."""
    n, edel, edel_luku = 0, None, None
    for o in osiot:
        osat = o["luku"].split(".")
        ryhma = osat[1] if len(osat) > 1 else o["luku"]
        if ryhma != edel or (len(osat) == 2 and o["luku"] == edel_luku):
            n += 1
        edel, edel_luku = ryhma, o["luku"]
        o["luku"] = ".".join([osat[0], str(n)] + osat[2:])
    return osiot

akk = None
if "Kuntotarkastus" in wb.sheetnames:
    akk = {"yleiset": [], "osiot": [], "sarake": [], "kunto": [], "toimenpide": []}
    osiot = collections.OrderedDict()
    for r in rows("Kuntotarkastus"):
        if r.get("Tila", "").lower().startswith("poista"):
            continue
        osio, luku, kentta, tyyppi, opt = r["Osio"], r["Raportin luku"], r["Kenttä / tarkastuskohta"], r["Tyyppi"], r.get("Vaihtoehdot / ohje", "")
        if osio == "Jokainen luvun 5 osio":
            if tyyppi == "Taulukko": akk["sarake"] = split(opt.split("Sarake:", 1)[1])
            elif kentta == "Kunto": akk["kunto"] = split(opt)
            elif kentta == "Toimenpide": akk["toimenpide"] = split(opt)
            continue
        if luku.startswith("5"):
            o = osiot.setdefault(osio, {"id": slug(osio), "nimi": osio, "luku": luku.split(" ")[0], "rivit": [], "kentat": [], "ali": []})
            if tyyppi == "Taulukko":
                for x in split(opt.split("Rivit:", 1)[1].split(". Sarake:")[0]):
                    if "(alimenetelmä)" in x: o["ali"].append("pintakosteus")
                    else: o["rivit"].append(x)
            elif tyyppi == "Alimenetelmä":
                o["ali"].append("mtk" if "Märkätila" in opt else "pintakosteus")
            elif tyyppi in AKK_TYYPIT:
                f = {"k": slug(kentta), "l": kentta, "t": AKK_TYYPIT[tyyppi]}
                if f["t"] in ("select", "multi"): f["o"] = split(opt)
                m = re.match(r"^([^()]+?)\s*(\(mittausarvo\))?$", opt)
                if f["t"] == "num" and opt: f["u"] = re.sub(r"\s*\(mittausarvo\)", "", opt); f["mittaus"] = "mittausarvo" in opt
                o["kentat"].append(f)
            continue
        f = {"k": slug(kentta), "l": kentta, "t": AKK_TYYPIT.get(tyyppi, "auto"), "ryhma": osio, "luku": luku, "lahde": r.get("Lähde", "")}
        if f["t"] in ("select", "multi"): f["o"] = [x for x in split(opt) if not x.startswith("Muu (")] + (["Muu"] if "Muu (" in opt else [])
        elif opt: f["ohje"] = opt
        akk["yleiset"].append(f)
    akk["osiot"] = numeroi(list(osiot.values()))

data = {"akk": akk, "lahde": "Menetelmät ja kalusto -taulukko (hyväksytty 19.11.2026)", "menetelmat": out_m,
        "naytetyypit": ntyy, "naytekentat": {"yhteiset": yhteiset, "tyyppikohtaiset": nkentat}, "kalusto": kal}
js = ("/* Generoitu tiedostosta Menetelmät ja kalusto (Sheets) – älä muokkaa käsin.\n"
      "   Märkätilakartoitus, RH-taulukot ja sanelun valintasanat ovat methods.js:ssä. */\n"
      "window.MENETELMA_DATA = " + json.dumps(data, ensure_ascii=False, indent=0).replace("\n", "") + ";\n")
open(OUT, "w").write(js)
print(len(akk["osiot"]) if akk else 0, "AKK-osiota,", len(out_m), "menetelmää,", len(ntyy), "näytetyyppiä,", len(nkentat), "+", len(yhteiset), "näytekenttää,", sum(len(v) for v in kal.values()), "kalustoriviä,", len(vss_rivit), "VSS-riviä")
