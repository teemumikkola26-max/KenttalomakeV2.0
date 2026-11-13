# Lähtötietopaketti, versio 1

Tämä kuvaus määrittää paketin, jonka Claude palauttaa ja jonka Kuva + sanelu -sovellus tuo kohteelle. Paketti on yksi JSON-objekti. Kaikki kentät ovat valinnaisia paitsi `muoto` ja `versio`. Kenttää, josta aineistossa ei ole tietoa, ei kirjoiteta.

## Rakenne

```
{
  "muoto": "kuva-sanelu-lahtotiedot",
  "versio": 1,
  "luotu": "VVVV-KK-PP",
  "tiedostot": [ Tiedosto, … ],
  "kohde": { "nimi": Arvo, "osoite": Arvo },
  "suunnitelma": [ Kohta, … ],
  "kerrokset": [ Kerros, … ],
  "kuntoarvio": {
    "perustiedot": { "<kenttä>": Arvo, … },
    "korjaukset": [ Korjaus, … ],
    "rakenteet": [ Rakenne, … ]
  },
  "huomiot": [ Huomio, … ],
  "tarkistukset": [ Tarkistus, … ],
  "puuttuu": [ "teksti", … ]
}
```

### Lähde ja varmuus

Jokaisella tiedolla on lähde, jotta tutkija voi tarkistaa sen sovelluksessa:

```
"lahde": { "tiedosto": "ARK_02_Pohja.pdf", "sivu": 1, "ote": "HUONEISTOALA VANHA 720,0 m2" }
"varmuus": "varma" | "epävarma"
```

- `ote` on lyhyt sanatarkka lainaus aineistosta (enintään noin 150 merkkiä), ei tiivistelmä.
- `varmuus: "epävarma"`, jos teksti on vaikealukuista, arvo on päätelty (esim. rakennusvuosi piirustusten päiväyksestä) tai lähteet ovat ristiriidassa. Sovellus jättää epävarmat valitsematta.

### Arvo

Joko pelkkä arvo tai objekti: `{ "arvo": "1978", "lahde": {…}, "varmuus": "varma" }`. Käytä objektia aina, kun lähde on tiedossa.

### Tiedosto

`{ "nimi": "ARK_02_Rantatie_Pohja.pdf", "laji": "Pohjapiirustus", "kuvaus": "1. kerroksen pohja, saneeraus 1993", "sivuja": 1 }`

`nimi` täsmälleen kuten tutkija sen antoi: sovellus yhdistää alkuperäiset tiedostot nimen perusteella. `laji`: Tarjous / tutkimussuunnitelma, Isännöitsijäntodistus, Yhtiöjärjestys, Kunnossapitotarveselvitys / PTS, Energiatodistus, Rakennusselostus, Aiempi tutkimusraportti, Asemapiirros, Pohjapiirustus, Leikkauspiirustus, Julkisivupiirustus, Rakennepiirustus, LVI-piirustus, Sähköpiirustus, Muu asiakirja.

### Kohta (tutkimussuunnitelma)

`{ "menetelma": "rh", "maara": 6, "kuvaus": "alapohja, märkätilat", "tila": "", "lahde": {…} }`

- `menetelma` on tunnus alla olevasta taulukosta. Jos mikään ei sovi, `"muu"` ja kuvaukseen menetelmän nimi.
- `maara` kokonaislukuna, jos tarjouksessa on määrä (kpl, pistettä, näytettä). Muuten jätetään pois.
- `kuvaus`: tarkennus tarjouksen sanoin (rakenne, tila, näytetyyppi), lyhyesti.
- Yksi kohta per tarjouksen tutkimusrivi. Ei yleisiä työvaiheita (raportointi, aloituspalaveri, matkat).

| Tunnus | Menetelmä | Käytä, kun tarjouksessa on |
|---|---|---|
| `aisti` | Aistinvarainen tarkastelu | aistinvarainen tarkastelu, katselmus, tarkastuskäynti |
| `pintakosteus` | Pintakosteuskartoitus | pintakosteuskartoitus, kosteuskartoitus pintakosteudenosoittimella |
| `rh` | Rakenteen RH-mittaus | porareikämittaus, rakenteen suhteellinen kosteus, RH-mittaus |
| `avaus` | Rakenneavaus | rakenneavaus, rakenteen avaaminen, kurkistusreikä |
| `nayte` | Näytteenotto | materiaali-, mikrobi-, ilma-, VOC-, asbesti-, PAH-, PCB-, kuitu- tai pölynäyte |
| `merkkiaine` | Merkkiainekoe | merkkiainekoe, ilmavuotojen tutkimus merkkiaineella |
| `lampokuvaus` | Lämpökuvaus | lämpökuvaus, termografia |
| `paine` | IV / painesuhdemittaus | painesuhteet, paine-eromittaus, ilmamäärät, ilmanvaihdon toiminta |
| `mtk` | Märkätilakartoitus | märkätilakartoitus, märkätilojen kuntotarkastus |
| `seuranta` | Olosuhdeseuranta | olosuhdeseuranta, jatkuvatoiminen mittaus (lämpötila, kosteus, CO2, paine-ero) |
| `kuntoarvio` | Kuntoarvio | kuntoarvio, kuntotarkastus (koko rakennus, PTS) |
| `muu` | Muu menetelmä | muut tutkimukset (esim. radon, viemärikuvaus, kosteuskartoitus rakennuttajalle) |

### Kerros

```
{ "nimi": "1. krs",
  "pohjakuva": { "tiedosto": "ARK_02_Rantatie_Pohja.pdf", "sivu": 1 },
  "tilat": [ { "tunnus": "OH1", "nimi": "Olohuone", "asunto": "A1" }, … ] }
```

- Kerroksen nimi lyhyesti: "Kellari", "1. krs", "2. krs", "Ullakko". Yksi kerros per pohjapiirustus.
- `pohjakuva`: tiedosto ja sivu, jolla kerroksen pohja on. Sovellus asettaa sen kerroksen pohjakuvaksi ja merkitsee tilat siihen.
- `tilat`: pohjapiirustuksen huonemerkinnät. `tunnus` piirustuksen merkintä sellaisenaan (esim. "MH2", "KH", "102"), `nimi` tilan nimi suomeksi. Jos merkintä on pelkkä lyhenne (MH), nimi lyhenteen mukaan alla olevasta taulukosta. `asunto` vain, jos piirustuksessa on asuntotunnus (A1, B12).
- Toistuvien huoneistotyyppien (esim. "3H+K+S", 6 kpl) kaikkia tiloja ei listata erikseen ilman asuntotunnuksia: listaa tilat vain, jos ne voidaan yksilöidä.

### Kuntoarvion perustiedot

Kentät: `rakennustyyppi`, `rakennusvuosi`, `pintaala` (huoneistoala, m²), `huoneistoja`, `huoneistotyypit` (esim. "6 × 3H+K+S 80,0 m², 4 × 2H+K+S 60,0 m²"), `kerrosala`, `tilavuus`, `tontti`, `perustukset`, `runko`, `julkisivu`, `vesikatto`, `lammitys`.

- Luvut ilman yksikköä, desimaalierotin pilkku tai piste: `"720,0"`.
- `rakennusvuosi` = valmistumis- tai käyttöönottovuosi. Saneerauksen vuosi ei ole rakennusvuosi.

### Korjaus

`{ "vuosi": "2005", "tyo": "Vesikaton uusiminen", "osa": "vesikatteet", "lahde": {…} }`

`vuosi` voi olla väli "2008–2009". `osa` rakennusosan tunnus alla olevasta taulukosta, jos työ kohdistuu yhteen osaan.

### Rakenne

`{ "osa": "vesikatteet", "nimike": "Bitumikermikate", "vuosi": "2005", "missa": "koko katto", "lahde": {…} }`

Rakennusosan materiaali tai rakenne (leikkauksista, rakennetyypeistä, rakennusselostuksesta, isännöitsijäntodistuksesta). `vuosi` = rakentamis- tai uusimisvuosi, jos tiedossa. Rakennetyypin kerrokset voi kirjoittaa `missa`-kenttään lyhyesti (esim. "US1: tiili 85, tuuletusrako, mineraalivilla 150, kevytbetoni 200").

### Huomio

`{ "teksti": "Isännöitsijäntodistuksen mukaan vesivahinko A12:n kylpyhuoneessa 2019", "lahde": {…} }`

Kenttätyön kannalta olennaiset asiakirjoissa mainitut asiat: aiemmat vauriot ja tutkimukset, tiedossa olevat haitta-aineet, rajaukset ja tilaajan erityistoiveet. Vain asiakirjoissa sanottua, ei omia arvioita tai suosituksia.

### Tarkistus

`{ "kuvaus": "Huoneistojakauma 6 × 80,0 + 4 × 60,0 = 720,0 m² = huoneistoala 720,0 m²", "tulos": "ok" }`

`tulos`: "ok" tai "ristiriita: …". Sovellus näyttää ristiriidat tutkijalle.

## Rakennusosat (`osa`)

| Tunnus (osa) | Rakennusosa | Ryhmä | Koodi |
|---|---|---|---|
| `kuivatus` | Kuivatus ja sadevedet | Alueosat (1.1) | 1.1.1.6 |
| `paallysteet` | Päällysteet | Alueosat (1.1) | 1.1.3 |
| `aluevarusteet` | Alueen varusteet | Alueosat (1.1) | 1.1.4 |
| `aluerakenteet` | Alueen rakenteet | Alueosat (1.1) | 1.1.5 |
| `perustukset` | Perustukset | Talo-osat (1.2) | 1.2.1 |
| `alapohjat` | Alapohjat | Talo-osat (1.2) | 1.2.2 |
| `runko` | Runko, välipohjat ja yläpohjat | Talo-osat (1.2) | 1.2.3 |
| `ulkoseinat` | Ulkoseinät ja julkisivut | Talo-osat (1.2) | 1.2.4.1 |
| `ikkunat` | Ikkunat | Talo-osat (1.2) | 1.2.4.2 |
| `ulkoovet` | Ulko-ovet | Talo-osat (1.2) | 1.2.4.3 |
| `julkisivuvarusteet` | Julkisivuvarusteet | Talo-osat (1.2) | 1.2.4.4 |
| `parvekkeet` | Parvekkeet | Talo-osat (1.2) | 1.2.5.1 |
| `katokset` | Katokset ja ulkotasot | Talo-osat (1.2) | 1.2.5.2 |
| `vesikattorakenteet` | Vesikattorakenteet | Talo-osat (1.2) | 1.2.6.1 |
| `raystaat` | Räystäät | Talo-osat (1.2) | 1.2.6.2 |
| `vesikatteet` | Vesikatteet | Talo-osat (1.2) | 1.2.6.3 |
| `vesikattovarusteet` | Vesikattovarusteet | Talo-osat (1.2) | 1.2.6.4 |
| `kattoikkunat` | Kattoikkunat ja luukut | Talo-osat (1.2) | 1.2.6.6 |
| `tilanjako` | Väliseinät, väliovet ja tilaportaat | Tilaosat (1.3) | 1.3.1 |
| `lattiat` | Lattiapinnat | Tilaosat (1.3) | 1.3.2.2 |
| `seinatkatot` | Seinä- ja kattopinnat | Tilaosat (1.3) | 1.3.2.4–6 |
| `martilat` | Huoneistojen märkätilat | Tilaosat (1.3) | 1.3.2 |
| `kiintokalusteet` | Kiintokalusteet ja varusteet | Tilaosat (1.3) | 1.3.3 |
| `tulisijat` | Tulisijat ja savuhormit | Tilaosat (1.3) | 1.3.4.2 |
| `lammonlahde` | Lämmönlähde ja lämmönjakokeskus | LVIA-järjestelmät | G1 |
| `lammonjakelu` | Lämpöjohdot, patterit ja venttiilit | LVIA-järjestelmät | G1 |
| `vesijohdot` | Vesijohdot ja lämmin vesi | LVIA-järjestelmät | G2 |
| `viemarit` | Viemärit | LVIA-järjestelmät | G2 |
| `vesikalusteet` | Vesi- ja viemärikalusteet | LVIA-järjestelmät | G2 |
| `ilmanvaihto` | Ilmanvaihto | LVIA-järjestelmät | G3 |
| `palo` | Palontorjunta ja turvallisuus | LVIA-järjestelmät |  |
| `aluesahko` | Aluesähköistys | Sähkö- ja tietotekniset järjestelmät |  |
| `sahkojakelu` | Sähkökeskukset ja jakelu | Sähkö- ja tietotekniset järjestelmät | S |
| `valaistus` | Valaistus ja turvavalaistus | Sähkö- ja tietotekniset järjestelmät |  |
| `tele` | Tele-, antenni- ja tietoliikennejärjestelmät | Sähkö- ja tietotekniset järjestelmät |  |
| `hissit` | Hissit | Sähkö- ja tietotekniset järjestelmät |  |

## Tilojen lyhenteet

| Lyhenne | Tila |
|---|---|
| MH, MHH, MAKUUH | Makuuhuone |
| OH, OLOH | Olohuone |
| K, KT, KE, KEITT, KEITTIÖ | Keittiö |
| KK | Keittokomero |
| RT, R | Ruokailutila |
| RH | Ruokailuhuone |
| RK | Ruokakomero |
| ET, E, ETEINEN | Eteinen |
| TK, TUULIK | Tuulikaappi |
| KPH, KYLPYH | Kylpyhuone |
| PH, PESUH, PS, PESUHUONE | Pesuhuone |
| S, SA, SAUNA | Sauna |
| LH | Löylyhuone |
| SH | Saunatilat |
| WC | WC |
| KHH, KODH, KODINH | Kodinhoitohuone |
| VH, VAATEH | Vaatehuone |
| PUKH | Pukeutumishuone |
| TH, TYÖH | Työhuone |
| ASK, ASKH | Askarteluhuone |
| HH | Harrastehuone |
| TAKKAH | Takkahuone |
| AH | Aputila |
| AT, AUTOT | Autotalli |
| AK, AUTOK | Autokatos |
| PKH, PUKU, PUKUH, PUKUHUONE | Pukuhuone |
| VAR, V, VARASTO | Varasto |
| UV | Ulkovarasto |
| KV | Kellarivarasto |
| IRT, IRTV | Irtaimistovarasto |
| KYLM | Kylmävarasto |
| KYLMIÖ | Kylmiö |
| PUUV | Puuvarasto |
| PPV | Polkupyörävarasto |
| UVV | Ulkoiluvälinevarasto |
| TEKN, TEK, TEKNTILA | Tekninen tila |
| LJH, LJ, LJKH | Lämmönjakohuone |
| KATT, KATTILAH | Kattilahuone |
| ÖLJY, ÖLJYS | Öljysäiliöhuone |
| SÄHKÖ, SAHKO | Sähkötila |
| SPK | Sähköpääkeskus |
| IVKH, IVK, IVKONEH | IV-konehuone |
| KONEH | Konehuone |
| HISSI | Hissi |
| VSS, VS | Väestönsuoja |
| JH, JÄTEH | Jätehuone |
| SK, SIIVK | Siivouskomero |
| SIIV | Siivous |
| KUIV, KUH, KUIVH | Kuivaushuone |
| PESUT | Pesutupa |
| MANK, MANKELI | Mankelihuone |
| PRH, PRSH, PORR, PORRASH | Porrashuone |
| PANNUH | Pannuhuone |
| KÄYT, KAYT | Käytävä |
| AULA | Aula |
| PARV, P | Parveke |
| TER, TERASSI | Terassi |
| KUISTI | Kuisti |
| LASIK | Lasikuisti |
| ULL, ULLAKKO | Ullakko |
| KELL, KELLARI | Kellari |
| KHUONE, KERHOH | Kerhohuone |
| NEUV | Neuvotteluhuone |
| ARK | Arkisto |
| TSTO, TOIM | Toimisto |
| SOS | Sosiaalitila |
| HLÖK | Henkilökunnan tila |
| TAUKO | Taukotila |
| LK, LUOKKA | Luokka |
| OPH, OPETT | Opettajainhuone |
| RUOKAS | Ruokasali |
| SIIVH, SIIVOUSH | Siivoushuone |
| LEPOH | Lepohuone |
| KOKH, KOKOUSH | Kokoushuone |
| VAST | Vastaanotto |
| ODOT | Odotustila |
| TYÖT, TYÖTILA | Työtila |
| RYHMÄH | Ryhmähuone |
| RYHMÄT | Ryhmätila |
| OPETUST | Opetustila |
| LIIKS | Liikuntasali |
| VALMK | Valmistuskeittiö |
| JAKOK | Jakelukeittiö |
| ASTH | Astianpesuhuone |
| ATK | ATK-tila |
| SERV, PALV | Palvelintila |
| HUOLTO | Huoltotila |
| PESULA | Pesula |
| WCI, INVAWC, IWC | Inva-WC |
| SUIHKU | Suihku |
| VESIK | Vesikattotila |
