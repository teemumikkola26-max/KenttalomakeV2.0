#!/usr/bin/env python3
"""
tila_alueet.py – tilojen alueet ja oviaukot pohjapiirustuksesta (lähtötietopaketti, kerros)

Käyttö Clauden lähtötieto-projektissa (koodin suoritus):
    python3 tila_alueet.py pohja.pdf --sivu 1 --mittakaava 1:100 --tilat tilat.json --ulos alueet.json [--kuva tarkistus.png]

tilat.json = paketin saman kerroksen tilat sijainteineen:
    [ { "tunnus": "101", "sijainti": { "x": 0.412, "y": 0.268 } }, … ]   (x, y 0–1 sivun vasemmasta yläkulmasta)

Tulos (alueet.json):
    { "leveys_m": 62.9, "korkeus_m": 29.7,
      "tilat": [ { "tunnus": "101", "alue": [[x, y], …], "ala_m2": 14.2, "varmuus": "varma" | "arvio" } ],
      "ovet": [ { "a": "101", "b": "102", "x": 0.43, "y": 0.27 } ],
      "huomiot": [ … ] }
Alueet ja ovet ovat 0–1 sivun koordinaateissa kuten sijainnit. Kopioi kentät paketin kerrokseen
(ks. lahtotietopaketti-v1.md, Kerros). Tarkista tarkistuskuva aina silmämääräisesti.

Menetelmä: sivu rasteroidaan (150 dpi), tekstit peitetään, tummat viivat = seinät. Oviaukot suljetaan
morfologisella sulkemisella (0,9 m), jolloin tilat erottuvat; sisätilat = komponentit, joissa on tilan
merkintä. Vesijakomenetelmä (etäisyysmuunnos) jakaa vapaan tilan merkinnöistä alkaen. Ovet = tilojen
välinen raja, jossa ei ole paksua seinää (ovilehti, kaari ja kynnysviiva ovat ohuita).
Vaatii: pdfplumber, pypdfium2, numpy, scipy, scikit-image, opencv-python-headless.
"""
import argparse, json, re, sys
import numpy as np, pdfplumber, pypdfium2 as pdfium, cv2
from scipy import ndimage as ndi
from skimage.segmentation import watershed
from skimage.morphology import disk

ap = argparse.ArgumentParser()
ap.add_argument("pdf"); ap.add_argument("--sivu", type=int, default=1); ap.add_argument("--mittakaava", default="1:100")
ap.add_argument("--tilat", required=True); ap.add_argument("--ulos", required=True); ap.add_argument("--kuva")
ap.add_argument("--dpi", type=int, default=150); ap.add_argument("--kynnys", type=int, default=160)
A = ap.parse_args()

DPI = A.dpi; K = DPI / 72.0
sk = int(re.match(r"\s*1\s*:\s*(\d+)", A.mittakaava).group(1))
PPM = 1000 / (25.4 / 72 * sk) * K                     # px / m
pg = pdfplumber.open(A.pdf).pages[A.sivu - 1]
im = pdfium.PdfDocument(A.pdf)[A.sivu - 1].render(scale=K, rotation=0).to_pil().convert("L")
G = np.array(im); H, W = G.shape
for c in pg.chars:                                     # tekstit eivät ole seiniä
    x0, x1, t, b = [int(round(v * K)) for v in (c["x0"], c["x1"], c["top"], c["bottom"])]
    G[max(0, t - 1):b + 1, max(0, x0 - 1):x1 + 1] = 255
dark = G < A.kynnys
tilat = [t for t in json.load(open(A.tilat)) if t.get("sijainti")]
huom = []

# Sisätilat: komponentit, joissa on tilan merkintä, kun oviaukot on suljettu
r = int(0.45 * PPM)
closed = ndi.binary_dilation(dark, structure=disk(r))
lab, n = ndi.label(~closed)
seeds = []
for t in tilat:
    x, y = int(t["sijainti"]["x"] * W), int(t["sijainti"]["y"] * H)
    seeds.append((t["tunnus"], x, y))
osuu = set()
for _, x, y in seeds:
    win = lab[max(0, y - 40):y + 40, max(0, x - 40):x + 40]
    v = win[win > 0]
    if len(v): osuu.add(int(np.bincount(v).argmax()))
# Ulkona: reunaan yhteydessä olevat sekä suuret komponentit ilman tilan merkintää (piirustuksen kehyksen
# sisäpuolinen piha-alue, otsikkokenttä). Pienet merkinnättömät (komerot, kalusteiden välit) ovat sisällä.
reuna = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
koot = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
ulko = [i for i in range(1, n + 1) if i not in osuu and (i in reuna or koot[i - 1] > 60 * PPM ** 2)]
inside = ~ndi.binary_dilation(np.isin(lab, ulko), structure=disk(r + 2))
free = (~ndi.binary_dilation(dark, iterations=1)) & inside

markers = np.zeros(dark.shape, np.int32)
for i, (tun, x, y) in enumerate(seeds, 1):
    ys, xs = np.nonzero(free[max(0, y - 30):y + 30, max(0, x - 30):x + 30])
    if not len(ys): huom.append(f"{tun}: merkinnän kohdalla ei vapaata tilaa, alue jäi tunnistamatta"); continue
    k = np.argmin((ys - min(30, y)) ** 2 + (xs - min(30, x)) ** 2)
    markers[max(0, y - 30) + ys[k], max(0, x - 30) + xs[k]] = i
seg = watershed(-ndi.distance_transform_edt(free), markers, mask=free)
raw = seg.copy()

# Jälkikäsittely puolikokoisena: irtoalueet naapurille, kalusteiden aukot täytetään
F = 2
segS, freeS, insS = seg[::F, ::F].copy(), free[::F, ::F], inside[::F, ::F]; P2 = PPM / F
for _ in range(3):
    left = freeS & (segS == 0); l2, m = ndi.label(left)
    if not m: break
    sizes = ndi.sum(left, l2, range(1, m + 1))
    for kk in range(1, m + 1):
        if sizes[kk - 1] < 0.3 * P2 ** 2: continue
        sl = ndi.find_objects((l2 == kk).astype(int))[0]
        sl = tuple(slice(max(0, a.start - 8), a.stop + 8) for a in sl)
        comp = l2[sl] == kk; ring = ndi.binary_dilation(comp, iterations=6) & ~comp
        v = segS[sl][ring]; lv = v[v > 0]; outn = (~insS[sl][ring]).sum()
        if len(lv) and len(lv) > 3 * outn: segS[sl][comp] = np.bincount(lv).argmax()
out = np.zeros_like(segS)
for i in sorted(range(1, len(seeds) + 1), key=lambda i: -(segS == i).sum()):
    ys, xs = np.nonzero(segS == i)
    if not len(ys): continue
    pd = int(.5 * P2); y0, y1, x0, x1 = max(0, ys.min() - pd), ys.max() + pd, max(0, xs.min() - pd), xs.max() + pd
    rr = ndi.binary_fill_holes(ndi.binary_closing(segS[y0:y1, x0:x1] == i, structure=disk(int(.25 * P2))))
    sub = out[y0:y1, x0:x1]; sub[(sub == 0) & rr] = i

res = []
for i, (tun, x, y) in enumerate(seeds, 1):
    rr = (out == i).astype(np.uint8)
    if not rr.sum(): continue
    cs, _ = cv2.findContours(rr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    apx = cv2.approxPolyDP(c, 0.12 * P2, True)[:, 0, :]
    ala = cv2.contourArea(apx.astype(np.float32)) / P2 ** 2
    t = next(tt for tt in tilat if tt["tunnus"] == tun)
    # varmuus: suljettu tila (ei suurta avointa yhteyttä naapuriin) ja järkevä koko
    var = "varma" if 0.8 < ala < 400 else "arvio"
    res.append({"tunnus": tun, "alue": [[round(float(p[0]) * F / W, 4), round(float(p[1]) * F / H, 4)] for p in apx], "ala_m2": round(ala, 1), "varmuus": var})

# Ovet: tilojen välinen raja, jossa ei ole paksua seinää. Ovilehdet, aukeamiskaaret ja kynnysviivat ovat
# ohuita viivoja: avaus (opening) poistaa ne, seinät (≥ 100 mm tai kaksoisviiva) jäävät.
from skimage.segmentation import expand_labels
# Painotus löytämiseen: ylimääräinen ovi haittaa paikannusta vähemmän kuin puuttuva (puuttuva ovi sulkee tilan).
# Kaksoisviivoin piirretyt ohuet seinät voivat näkyä ovina: tarkista tarkistuskuvasta.
thick = ndi.binary_opening(dark, structure=disk(2))
ex = expand_labels(raw, distance=5)
ex[ndi.binary_dilation(thick, iterations=1)] = 0
ex[~inside] = 0
pairs = {}
for dy, dx in ((0, 1), (1, 0)):
    a1, b1 = ex[:H - dy, :W - dx], ex[dy:, dx:]
    mm = (a1 != b1) & (a1 > 0) & (b1 > 0)
    ys, xs = np.nonzero(mm)
    for y, x, i, j in zip(ys, xs, a1[mm], b1[mm]):
        pairs.setdefault((min(i, j), max(i, j)), []).append((x, y))
ovet = []
for (i, j), pts in pairs.items():
    Pt = np.array(pts); ox, oy = Pt[:, 0].min() - 2, Pt[:, 1].min() - 2
    img = np.zeros((np.ptp(Pt[:, 1]) + 5, np.ptp(Pt[:, 0]) + 5), bool); img[Pt[:, 1] - oy, Pt[:, 0] - ox] = True
    l3, kk = ndi.label(ndi.binary_dilation(img, iterations=3))
    for c in range(1, kk + 1):
        yy, xx = np.nonzero(l3 == c); yy = yy + oy; xx = xx + ox
        span = max(np.ptp(xx), np.ptp(yy)) / PPM
        if span < 0.5: continue                            # kapeampi kuin oviaukko
        npts = max(1, int(round(span / 1.2))); hor = np.ptp(xx) > np.ptp(yy)
        for tt in (np.linspace(xx.min(), xx.max(), npts + 2)[1:-1] if hor else np.linspace(yy.min(), yy.max(), npts + 2)[1:-1]):
            s2 = np.abs((xx if hor else yy) - tt) < 5
            if not s2.any(): continue
            px, py = (tt, yy[s2].mean()) if hor else (xx[s2].mean(), tt)
            ovet.append({"a": seeds[i - 1][0], "b": seeds[j - 1][0], "x": round(float(px) / W, 4), "y": round(float(py) / H, 4)})
ovet = [o for o in ovet if o["a"] != o["b"]]
ilman = [t["tunnus"] for t in res if not any(o["a"] == t["tunnus"] or o["b"] == t["tunnus"] for o in ovet)]
if ilman: huom.append("Tiloille ei löytynyt ovea: " + ", ".join(ilman) + ". Lisää ovi käsin (tai tila on suljettu, esim. hormi).")

json.dump({"leveys_m": round(W / PPM, 2), "korkeus_m": round(H / PPM, 2), "tilat": res, "ovet": ovet, "huomiot": huom}, open(A.ulos, "w"), ensure_ascii=False, indent=1)
print(len(res), "/", len(tilat), "tilaa,", len(ovet), "oviaukkoa,", "leveys", round(W / PPM, 1), "m")
for h in huom: print("HUOM:", h)

if A.kuva:
    col = cv2.cvtColor(np.array(im), cv2.COLOR_GRAY2BGR)
    rng = np.random.default_rng(3)
    for t in res:
        pts = (np.array(t["alue"]) * [W, H]).astype(np.int32)
        ov = col.copy(); cv2.fillPoly(ov, [pts], [int(c) for c in rng.integers(60, 230, 3)]); col = cv2.addWeighted(ov, .35, col, .65, 0)
        cv2.polylines(col, [pts], True, (40, 40, 40), 2)
        cx, cy = pts.mean(0).astype(int); cv2.putText(col, f'{t["tunnus"]} {t["ala_m2"]}', (cx - 30, cy), cv2.FONT_HERSHEY_SIMPLEX, .55, (0, 0, 160), 2)
    for o in ovet: cv2.circle(col, (int(o["x"] * W), int(o["y"] * H)), 7, (0, 120, 255), -1)
    cv2.imwrite(A.kuva, col)
