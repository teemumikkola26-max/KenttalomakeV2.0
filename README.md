# Kuva + sanelu

Mobiilikäyttöinen kenttälomake kuntotutkimuksiin. Kuva ja sanelu ovat lomakkeen ydin. Lomake ohjaa tutkijaa kirjaamaan kentällä ne tiedot, joita AI-raportointityökalu ei voi päätellä kuvista:

- mittausarvot ja niiden vahvistus
- tutkimuksen kattavuus (tarkastettu / poikkeama / ei pääsyä / ei tutkittu)
- tutkimussuunnitelman toteutuminen ja pois jätettyjen kohtien syyt

Aineisto viedään ZIP-pakettina, jonka voi antaa AI-työkalulle sellaisenaan.

Sovellus on osa RTA-opinnäytetyön kehitystyötä ja erillinen PBM Kenttälomakkeet -sovelluksesta (Aloitussivu).

## Näkymät

| Näkymä | Tarkoitus |
|---|---|
| Kohde | Tutkimussuunnitelman eteneminen, viimeisimmät havainnot ja Kuva + sanelu -painike |
| Kuva + sanelu | Kamera, menetelmän valinta ja havaintoteksti samassa näkymässä. Havainnon voi kirjoittaa, tai sanelu käynnistetään Sanele-painikkeesta. Kuvat ja teksti tallentuvat samaan havaintoon heti. Sijainti muistetaan edellisestä havainnosta. |
| Havaintokortti | Havainto, sijainti, tulos (pakollinen), menetelmä (pakollinen), suunnitelman kohta, menetelmän kentät, mittausarvojen vahvistus ja tutkijan alustava tulkinta erikseen |
| Mittauspiste (RH) | Yhteen havaintoon kirjataan mittauspisteen kaikki lukemat taulukkona: syvyys, RH, T, absoluuttinen kosteus ja lukupäivä. Ympäröivät olosuhteet kirjataan samalla tavalla omaan taulukkoonsa. Syvyys valitaan siruista (esim. 28 mm, 70 mm), ja rinnakkaiset mittaukset kuvataan samalla syvyydellä. **Lue mittarista** lukee arvot mittarin näytöltä kameralla. |
| Menetelmät | Menetelmien lisäys, muokkaus, järjestys, piilotus ja jakaminen tiedostona (etusivu → Menetelmät tai havaintokortti → Muokkaa menetelmiä) |
| Pohjapiirros | Kerrokset, pohjakuva (kuva tai PDF), tilat ja niiden tutkimustilanne, havaintomerkit |
| Lähtötarkistus | Puutteet suunnitelmaa, tiloja ja pakollisia tietoja vasten. Vienti avautuu, kun puutteet on tehty tai perusteltu. |

## RH-mittauspiste ja kameraluku

Kentällä:

1. Kuva + sanelu → valitse menetelmäksi *Rakenteen RH-mittaus* → Valmis.
2. Havaintokortilla: mittauspisteen tunnus, mittalaite ja tasaantumisaika (laite ja aika muistetaan seuraavaan pisteeseen).
3. **Lue mittarista**: valitse syvyys yläreunasta (*+ Uusi*, esim. 28), rajaa mittarin näyttö kehykseen ja paina laukaisinta. Jokaisesta kuvasta syntyy rivi heti, ja tunnistus tehdään taustalla. Kuvaa rinnakkaiset mittaukset samalla syvyydellä, vaihda syvyys (esim. 70) ja jatka.
4. Rajaa näyttö kehykseen. Sovellus etsii nestekidenäytön rajauksen sisältä automaattisesti, joten mittarin kehys tai runko ei haittaa. Oranssilla merkityt arvot ovat epävarmoja: napauta riviä, vertaa arvoja näytön kuvaan ja kuittaa. Epäselvät kuvat hylätään heti ja pyydetään kuvaamaan uudelleen.
5. Lukupäivä täyttyy automaattisesti kuvauspäivällä ja on muokattavissa (esim. jos lukemat kirjataan jälkikäteen).
6. Kortin yhteenveto näyttää syvyyksittäin lukemien määrän ja keskiarvot.
7. **Ympäröivät olosuhteet**: *Lue mittarista* toimii samoin (RH, T, a, lukupäivä).
8. Kun lukemat on tarkistettu, valitse *Olen tarkistanut mittausarvot*. Vahvistus ei onnistu, jos rivejä on kesken tai tarkistamatta.

Rivin voi lisätä myös käsin (*Rivi käsin*), esimerkiksi jos mittarin näyttöä ei voi kuvata.

**Tunnistus** on sama kuin PBM Kenttälomakkeissa (`js/lukulaite-ocr.js`, Vaisala HM40 -sarjan näkymä T, RH, Td, Tw, a). Ydin vertaa RH:ta kastepisteestä ja absoluuttisesta kosteudesta laskettuun arvoon ja merkitsee ristiriitaiset lukemat epävarmoiksi. Tiedosto on kopio: kun tunnistusta parannetaan, päivitä se molempiin sovelluksiin. Tähän kopioon on lisätty vain `window.LukulaiteOcr.core`-vienti. Näytön automaattinen rajaus (`lcdCrop` tiedostossa `js/meter.js`) tehdään ennen tunnistusta; jos rajaus ei tuota RH- ja T-arvoja, tunnistus yritetään vielä koko rajauksesta.

**Ilman verkkoa:** tekstintunnistuksen moottori (Tesseract.js 5.1.1) ja kielidata ladataan ensimmäisellä kameraluvulla ja tallennetaan laitteelle. Tee ensimmäinen luku verkkoyhteydessä, jolloin kameraluku toimii jatkossa myös kellarissa.

**ZIP-paketissa** lukemat ovat taulukkona (havainnot.md ja havainnot.json), jokaisella rivillä on lähde (kameraluku / käsin / korjattu käsin) ja näytön kuva (`kuvat/H01_lukema_1.jpg`). Laskettu yhteenveto (keskiarvo, vaihteluväli) on merkitty sovelluksen laskemaksi, ei mittaustulokseksi.

Taulukkokentän voi lisätä mihin tahansa menetelmään menetelmäeditorissa (tyyppi *Taulukko*): sarakkeet (numero, teksti, päivämäärä), pakolliset sarakkeet, ryhmittelysarake sekä kameraluvun RH-, lämpötila- ja absoluuttisen kosteuden sarakkeet.

**Menetelmien päivitys:** oletusmenetelmällä on versionumero (`versio` tiedostossa `js/methods.js`). Kun versio nousee, laitteelle tallennettu vanhempi versio korvataan uudella käynnistyksen yhteydessä. Itse lisätyt menetelmät eivät muutu.

## Tallennus ja tietosuoja

- Tiedot tallentuvat vain laitteen selaimeen (IndexedDB). Palvelinta tai pilveä ei ole.
- Sovellus pyytää selaimelta pysyvää tallennustilaa, mutta selaimen tietojen tyhjennys poistaa kohteet. **Vie ZIP-paketti jokaisesta kohteesta.** Samalla paketilla kohteen voi palauttaa (etusivu → Palauta varmuuskopio).
- Puheentunnistus (Web Speech API) käsittelee puheen selaimen palvelussa (Chrome: Google). Arvioi tämä organisaation tietosuojakäytäntöjä vasten ennen tuotantokäyttöä.

## ZIP-paketin sisältö

```
LUE_MINUT.txt            ohje aineiston käyttöön, myös AI-työkalulle
havainnot.md             havainnot luettavassa muodossa
havainnot.json           samat tiedot jäsenneltynä
kuvat/H01_1.jpg …
aanitteet/H01_1.webm …   jos puheentunnistus ei ollut käytössä
pohjapiirrokset/<kerros>.png               merkinnöin
pohjapiirrokset/<kerros>_alkuperainen.*    ilman merkintöjä
varmuuskopio/data.json   palautusta varten
```

Mittausarvot ovat paketissa erillään havainnosta, ja jokaisessa havainnossa kerrotaan, onko tutkija vahvistanut arvot. `LUE_MINUT.txt` ohjeistaa käyttämään vain vahvistettuja arvoja ja kirjaamaan tutkimatta jääneet tilat ja pois jätetyt kohdat rajauksina.

## Käyttöönotto GitHub Pagesissa

1. Luo uusi repositorio ja vie tämän kansion tiedostot sen juureen.
2. Settings → Pages → Source: *Deploy from a branch*, haara `main`, kansio `/ (root)`.
3. Avaa osoite puhelimella ja lisää sovellus kotinäytölle.

Kamera ja mikrofoni vaativat HTTPS-yhteyden (GitHub Pages käyttää sitä). Paikallisesti testattaessa `http://localhost` toimii:

```
python3 -m http.server 8000
```

**Päivitykset:** nosta `sw.js`:n `CACHE`-versiota (esim. `kuva-sanelu-v2`) aina, kun julkaiset muutoksia. Muuten puhelimet voivat käyttää vanhaa versiota.

## Selaintuki

| | Kamera | Puheentunnistus |
|---|---|---|
| Chrome, Android | kyllä | kyllä, vaatii verkkoyhteyden |
| Safari, iOS | kyllä | selainikkunassa yleensä kyllä. Kotinäytöltä avattuna puheentunnistus voi puuttua: silloin sanelu tallennetaan äänitteenä, ja tekstin voi sanella näppäimistön mikrofonilla. |
| Edge, Windows | kyllä | kyllä |

Jos selaimen kamera ei käynnisty, laukaisin avaa puhelimen oman kamerasovelluksen.

## Rakenne

```
index.html             sovelluksen runko
css/app.css            PBM-väriteema
js/ui.js               kuvakkeet, ikkunat, ilmoitukset
js/db.js               IndexedDB-tallennus
js/methods.js          oletusmenetelmät, rakenneosat, menetelmien tallennus
js/editor.js           menetelmien muokkaus
js/meter.js            mittarin näytön kameraluku ja lukemien tarkistus
js/lukulaite-ocr.js    tunnistusydin (kopio PBM Kenttälomakkeista)
js/dictation.js        sanelu (puheentunnistus tai äänite)
js/camera.js           kamera ja kuvien pienennys
js/app.js              tila, reititys, kohteet, tutkimussuunnitelma
js/capture.js          Kuva + sanelu
js/card.js             havaintokortti
js/plan.js             pohjapiirros, kerrokset, tilat, sijainnin valinta
js/check.js            lähtötarkistus
js/export.js           ZIP-vienti ja palautus
sw.js                  toiminta ilman verkkoa
```

Ulkoiset kirjastot ladataan CDN:stä ja tallennetaan välimuistiin: JSZip 3.10.1 (vienti), pdf.js 3.11.174 (PDF-pohjakuvat) ja Tesseract.js 5.1.1 (kameraluku). Muita riippuvuuksia tai käännösvaihetta ei ole.

### Menetelmien muokkaus

Menetelmiä muokataan sovelluksessa: **etusivu → Menetelmät**. Jokaiselle menetelmälle voi lisätä kenttiä (teksti lyhyt/pitkä, numero, päivämäärä, valintalista) ja valita kentälle:

- **Pakollinen** – lähtötarkistus näyttää tyhjän kentän puutteena.
- **Mittaustulos** (vain numero) – tutkija vahvistaa arvon, ja ZIP-paketissa se on erillään muista tiedoista.
- **Muista edellinen arvo** – esim. mittalaite täyttyy valmiiksi seuraavaan saman menetelmän havaintoon.
- **Yksikkö** – sanelusta tai tekstistä tunnistetut luvut ehdotetaan kenttiin yksikön perusteella.

Menetelmät tallentuvat laitteelle. Ne jaetaan kollegoille **Vie menetelmät** / **Tuo menetelmät** -toiminnoilla (JSON-tiedosto). Kohteen ZIP-paketti sisältää kohteessa käytetyt menetelmät, ja ne lisätään palautettaessa. Havainnoissa käytettyä menetelmää ei voi poistaa, mutta sen voi piilottaa valinnoista.

Oletusmenetelmät ovat tiedostossa `js/methods.js` (`OLETUKSET`). Niitä muutetaan koodissa vain, jos halutaan muuttaa uusien asennusten lähtötilannetta.

## Tunnetut rajoitukset

- Ei synkronointia laitteiden välillä. Siirto tehdään ZIP-paketilla.
- Pohjakuvasta käytetään yhtä PDF-sivua kerrosta kohden.
- Tiloja ei piirretä alueina: tila merkitään pohjapiirrokseen tunnuksella, ja sen väri kertoo tutkimustilanteen.
- Jokainen mittauspiste on oma havaintonsa. Saman pisteen kaikki syvyydet ja rinnakkaiset lukemat ovat havainnon taulukossa.
- Kameraluku tunnistaa Vaisala HM40 -sarjan näytön. Muut mittarit kirjataan käsin, kunnes niille lisätään tunnistus.
- Sanelusta tunnistetut luvut ovat ehdotuksia. Tutkija valitsee ne ja vahvistaa arvot itse.
