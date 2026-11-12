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
| Kuva + sanelu | Tavallinen havainto kirjataan loppuun tässä näkymässä: kuvat, sanelu (pidä mikrofonia pohjassa) tai kirjoitus, menetelmä ja tulos. **Seuraava** tallentaa ja aloittaa uuden havainnon samaan paikkaan samalla menetelmällä. **Kortti** avaa havaintokortin, jos menetelmällä on täytettäviä kenttiä; merkki kertoo puuttuvien tietojen määrän. |
| Havaintokortti | Havainto, sijainti, tulos (pakollinen), menetelmä (pakollinen), suunnitelman kohta, menetelmän kentät, mittausarvojen vahvistus ja tutkijan alustava tulkinta erikseen |
| Mittauspiste (RH) | Yhteen havaintoon kirjataan mittauspisteen kaikki lukemat taulukkona: syvyys, RH, T, absoluuttinen kosteus ja lukupäivä. Ympäröivät olosuhteet kirjataan samalla tavalla omaan taulukkoonsa. Syvyys valitaan siruista (esim. 28 mm, 70 mm), ja rinnakkaiset mittaukset kuvataan samalla syvyydellä. **Lue mittarista** lukee arvot mittarin näytöltä kameralla. |
| Menetelmän valinta | Ehdotuksina edellinen menetelmä ja tutkimussuunnitelman tekemättömät menetelmät (esim. *Merkkiainekoe 0/1*). Hakukenttä löytää menetelmän nimen tai lyhenteen alusta, eikä välitä isoista kirjaimista tai ääkkösistä (*lampo* → Lämpökuvaus). Jos osumaa ei ole, hausta voi lisätä uuden menetelmän, jolle voi myöhemmin lisätä kenttiä Menetelmät-sivulla. |
| Menetelmät | Menetelmien lisäys, muokkaus, järjestys, piilotus ja jakaminen tiedostona (etusivu → Menetelmät tai havaintokortti → Muokkaa menetelmiä) |
| Pohjapiirros | Kerrokset, pohjakuva (kuva tai PDF), tilat ja niiden tutkimustilanne, havaintomerkit |
| Lähtötarkistus | Puutteet suunnitelmaa, tiloja ja pakollisia tietoja vasten. Vienti avautuu, kun puutteet on tehty tai perusteltu. |

## Kenttäkäytön periaatteet

Tavoite: havainnon kirjaaminen vie saman ajan kuin pelkkä kuvaaminen. Tutkija kuvaa ja puhuu, sovellus täyttää loput.

**Tiedot täyttyvät itse (`js/autofill.js`)**

| Tieto | Mistä |
|---|---|
| Tila | Sanelusta: olemassa olevan tilan nimi tai tunnus ("keittiössä", "K03"), tai yleinen tilan nimi, jolloin tila luodaan ("kylpyhuoneessa" → uusi tila Kylpyhuone). Muuten edellisestä havainnosta. |
| Rakenneosa | Sanelusta ("lattian rajassa" → Alapohja / lattia, "ulkoseinän" → Ulkoseinä). Ensimmäinen maininta ratkaisee. |
| Tulos | Sanelusta: vauriota kuvaavat sanat → Poikkeama ("hilseilee", "kosteusvaurio", "irtoaa"); "ei huomautettavaa", "kunnossa", "ehjä" ja kieltomuodot ("ei homeen merkkejä") → Ei huomautettavaa. |
| Menetelmä | Sanelusta ("RH-mittaus", "rakenneavaus", "näyte", "merkkiainekoe"…). Muuten aistinvarainen tarkastelu; Seuraava jatkaa samalla menetelmällä. |
| Suunnitelman kohta | Menetelmän ja tilan perusteella; menetelmä, jota ei ole suunnitelmassa, merkitään "ei suunnitelmassa". |
| Mittauspisteen tunnus | Juokseva: M1 → M2, RA1 → RA2 (edellisen tunnuksen muoto säilyy). |
| Mittalaite, tasaantumisaika | Edellinen arvo tältä laitteelta, myös uusissa kohteissa. |
| Syvyys (RH) | Syvyyssarja opitaan edellisestä pisteestä (esim. 2 × 28 mm, 2 × 70 mm) ja vaihtuu itse. |
| Lukupäivä | Kuvauspäivä. |
| Mittausten vahvistus | Varmat kameraluvut ja itse kirjoitetut arvot ovat vahvistettuja. Vain epävarmat lukemat tarkistetaan. |

**Oppiminen (`js/learn.js`).** Kun avainsanat eivät tunnista menetelmää, sovellus ehdottaa sitä oppimansa perusteella (merkintä *opittu*). Malli oppii valmiista havainnoista, millainen sanelu kuuluu millekin menetelmälle: tutkijan itse valitsema tai korjaama menetelmä painaa enemmän (2) kuin automaattisesti tunnistettu ja hyväksytty (0,5), jottei malli vahvista omia virheitään. Malli on naiivi Bayes -luokittelija, joka toimii kokonaan laitteella. Piirteinä ovat sanojen alut (taivutusmuodot), yhdyssanojen osat, numerot ja yksiköt sekä rakenneosa, ja jokainen sana antaa yhden äänen. Tilojen nimet jätetään pois. Ehdotus tehdään vasta, kun esimerkkejä on vähintään 6 ja todennäköisyys on vähintään 0,85 (`RAJAT`). Menetelmät-sivulla näkyy esimerkkien määrä menetelmittäin, ja oppimisen voi nollata. Malli kulkee Vie menetelmät -tiedostossa, ja tuotaessa se yhdistetään laitteen malliin, joten tiimi voi kerätä yhteisen mallin.

Automaattinen arvo näkyy merkinnällä *sanelusta* eikä koskaan korvaa tutkijan itse valitsemaa arvoa. Yksi napautus muuttaa sen. ZIP-paketti kertoo, mitkä tiedot on tunnistettu sanelusta. Tunnistus on tarkoituksella varovainen: epäselvässä tapauksessa arvo jää tyhjäksi ja lähtötarkistus muistuttaa siitä. Sanalistoja voi täydentää tiedostossa `js/autofill.js`.

**Muut periaatteet**

- **Yksi näkymä tavalliselle havainnolle.** Kuva, sanelu, menetelmä ja tulos kameranäkymässä. Havaintokortille vain, kun menetelmällä on täytettäviä kenttiä.
- **Sanelu pitämällä pohjassa.** Vapautus lopettaa ja lisää tekstin. Lyhyt napautus lukitsee sanelun päälle; toinen napautus lopettaa. Ilman verkkoa sanelu tallentuu äänitteenä.
- **Puutteet näkyvät heti** (Kortti-painikkeen luku, kortin yläosa, kohdenäkymän merkit), ja **lähtötarkistuksessa** puuttuvan tuloksen voi valita kuvan vierestä yhdellä napautuksella.
- **Mitään ei menetetä.** Kaikki tallentuu heti, myös kesken olevat kuvat ennen siirtymää.
- **Näyttö pysyy päällä** kuvatessa, ja puhelin värähtää kuvan otossa, sanelun alussa ja lopussa, kun kameraluku on varma ja kun syvyys vaihtuu.

## Tilojen tunnistus pohjakuvasta (`js/planrooms.js`)

Kun kerrokseen lisätään pohjakuva, sovellus etsii siitä tilojen nimet ja tunnukset ja ehdottaa tiloja valmiiksi sijoitettuina:

- **PDF, jossa on tekstiä** (CAD-tuloste): nimet luetaan suoraan PDF:n tekstistä. Tämä on nopea (alle sekunti) ja tarkka.
- **Skannattu pohjakuva** (kuva tai kuvana tallennettu PDF): nimet luetaan tekstintunnistuksella (Tesseract, suomi). Tämä kestää muutamia sekunteja. Ensimmäisellä kerralla ladataan suomen kielidata (noin 1 Mt), ja sen jälkeen tunnistus toimii myös ilman verkkoa.

Tulkinta tuntee tavalliset lyhenteet (MH, OH, KT, KPH, PH, S, ET, VH, WC, TK, AK, LJ, IV-KH, ...) ja tilannimet, myös kahdelle riville jaetut. Lyhyet ja moniselitteiset lyhenteet (K, S, TK, LH, ...) hyväksytään vain, jos lähellä on pinta-ala tai tilanumero, joten mitat ja nimiöruudun tekstit eivät tulkitu tiloiksi. Lähellä oleva tilanumero (esim. 101, A12) tulee tunnukseksi. Samannimisille tiloille annetaan numerot (MH1, MH2).

Tunnistetut tilat näytetään **tarkistettavaksi** ennen lisäämistä: pohjakuvassa on numeroidut merkit ja niiden alla lista, jossa tunnuksen ja nimen voi korjata ja väärin tunnistetun tilan voi jättää pois. Tuntemattomat lyhenteet ovat aluksi valitsematta. Kun tutkija korjaa nimen tai nimeää tuntemattoman lyhenteen, sovellus oppii sen (laitteella, `ks_tilasanasto`). Jos kerroksessa on jo samanniminen tai -tunnuksinen tila, se päivitetään eikä siitä tule kaksoiskappaletta. Tunnistuksen voi ajaa uudelleen pohjapiirrosnäkymän painikkeella **Tunnista tilat pohjakuvasta**.

Tilojen rajoja ei tunnisteta: tila on pohjapiirroksessa merkki nimen kohdalla.

## Kuvien lisääminen aiempaan havaintoon

Kun havaintoja on paljon, oikea havainto löytyy usealla tavalla:

- **Kameranäkymä:** vasemman yläkulman havaintotunnus (esim. *Uusi havainto ▾*) on painike. Se avaa haun, jossa saman tilan havainnot ovat ensimmäisinä. Valinnan jälkeen kuvat ja sanelu menevät valittuun havaintoon. Seuraava-painikkeen jälkeen näkyy pikapainike *← Lisää kuvia: H05*, jos edellisestä havainnosta jäi kuva ottamatta.
- **Havainnot-lista:** haku kohdistuu tunnukseen (H05), mittauspisteen tunnukseen (M3), tilaan, menetelmään, tulokseen ja saneluun, ja kaikkien hakusanojen on osuttava (*keittiö lattia*). Isot kirjaimet ja ääkköset eivät haittaa. Lista näytetään joko uusimmasta alkaen tai tiloittain ryhmiteltynä, ja *Puutteelliset* näyttää vain havainnot, joista puuttuu tietoja. Jokaisen rivin kamerapainike avaa kameran suoraan kyseiseen havaintoon.
- **Pohjapiirros:** havaintomerkin ikkunassa on *Lisää kuva*.
- **Liitä kuvia galleriasta** (Havainnot-lista): puhelimen omalla kameralla otetut kuvat liitetään havaintoihin ottoajan perusteella. Ottoaika luetaan kuvan EXIF-tiedoista. Kuvalle ehdotetaan havaintoa, jonka kirjaamisen aikaan kuva otettiin, ja ehdotuksen voi vaihtaa. Kuvat, joille ei löydy havaintoa, liitetään uuteen havaintoon (peräkkäin otetut samaan).

## RH-mittauspiste ja kameraluku

Kentällä:

1. Kuva + sanelu → valitse menetelmäksi *Rakenteen RH-mittaus* → Valmis.
2. Havaintokortilla: mittauspisteen tunnus, mittalaite ja tasaantumisaika (laite ja aika muistetaan seuraavaan pisteeseen).
3. **Lue mittarista**: valitse syvyys yläreunasta (*+ Uusi*, esim. 28) ja osoita kameralla mittarin näyttöä. Rajausta ei tarvitse tehdä itse:
   - Sovellus paikantaa näytön kamerakuvasta (kehys näytön ympärillä).
   - Kun puhelin pysyy paikallaan, arvot luetaan ja näytetään kameranäkymän alareunassa reaaliajassa.
   - Kun luenta on varma (RH täsmää absoluuttiseen kosteuteen tai kastepisteeseen ja kaksi luentaa antaa samat arvot), kehys ja laukaisin muuttuvat vihreiksi. Laukaisin tallentaa juuri luetun kuvan ja arvot riviksi heti.
   - Jos laukaisinta painetaan ennen varmaa luentaa, kuva tallennetaan ja arvot luetaan taustalla perusteellisemmin. Epävarmat rivit merkitään oranssilla.
   - Kuvaa rinnakkaiset mittaukset samalla syvyydellä, vaihda syvyys (esim. 70) ja jatka.
4. Oranssilla merkityt arvot ovat epävarmoja: napauta riviä, vertaa arvoja näytön kuvaan ja kuittaa. Epäselvät kuvat hylätään heti ja pyydetään kuvaamaan uudelleen.
5. Lukupäivä täyttyy automaattisesti kuvauspäivällä ja on muokattavissa (esim. jos lukemat kirjataan jälkikäteen).
6. Kortin yhteenveto näyttää syvyyksittäin lukemien määrän ja keskiarvot.
7. **Ympäröivät olosuhteet**: *Lue mittarista* toimii samoin (RH, T, a, lukupäivä).
8. Kun lukemat on tarkistettu, valitse *Olen tarkistanut mittausarvot*. Vahvistus ei onnistu, jos rivejä on kesken tai tarkistamatta.

Rivin voi lisätä myös käsin (*Rivi käsin*), esimerkiksi jos mittarin näyttöä ei voi kuvata.

**Tunnistus** on sama kuin PBM Kenttälomakkeissa (`js/lukulaite-ocr.js`, Vaisala HM40 -sarjan näkymä T, RH, Td, Tw, a). Ydin vertaa RH:ta kastepisteestä ja absoluuttisesta kosteudesta laskettuun arvoon ja merkitsee ristiriitaiset lukemat epävarmoiksi. Tiedosto on kopio: kun tunnistusta parannetaan, päivitä se molempiin sovelluksiin. Tähän kopioon on lisätty vain `window.LukulaiteOcr.core`-vienti. Kuva + sanelu lisää ytimen ympärille:

- **Näytön paikannus** (`findDisplay`, `js/meter.js`): näytön sävy mitataan kuvan keskeltä (sinne kameraa osoitetaan), joten paikannus toimii, vaikka valkotasapaino tekisi näytöstä sinertävän tai kellertävän. Näytöksi hyväksytään yhtenäinen, suorakulmainen alue, joka ei jatku kuvan reunoille. Varalla on kirkkaan ja harmaan alueen sääntö. Ajetaan pienennetystä kamerakuvasta noin 6 kertaa sekunnissa (~20 ms/kerta).
- **Tarkennettu rajaus** (`lcdCrop`): rajaus kiristetään pelkkään nestekidenäyttöön, koska mittarin kehys ja runko sotkevat tunnistuksen kynnysarvon.
- **Kevyt luenta** (`recognizeQuick`, lisätty tunnistusytimen kopioon): enintään 2 esikäsittelyvarianttia reaaliaikaisessa luennassa, 6 taustatunnistuksessa. Jos kastepisteen miinusmerkki katoaa luennassa (−1,4 → 1,4), johdonmukaisuus arvioidaan absoluuttisella kosteudella eikä oikeita RH- ja T-arvoja "korjata" vääriksi. **Tämä korjaus kannattaa viedä myös PBM Kenttälomakkeiden tunnistukseen.**

**Testisivu:** `kameraluku-testi.html` (sama osoite kuin sovellus, esim. …/kameraluku-testi.html). Valitse puhelimella otettuja kuvia mittarin näytöstä, niin sivu näyttää paikannetun näytön, rajauksen, luetut arvot ja tunnistetun tekstin. Kuvat eivät tallennu. Sivu sopii epäonnistuneiden tapausten keräämiseen ja tunnistuksen kehittämiseen.

**Milloin luenta on varma:** RH täsmää absoluuttiseen kosteuteen tai kastepisteeseen, vähintään kaksi eri esikäsittelyllä tehtyä luentaa antaa täsmälleen samat arvot ja näyttö on kamerakuvassa riittävän suuri (reaaliaikaisessa luennassa vähintään noin 420 px leveä, taustatunnistuksessa 300 px). Fysikaalinen ristiintarkistus ei yksinään erota pieniä lämpötilavirheitä (esim. 22,6 / 22,8), koska RH muuttuu niissä vähän. Siksi pieneltä näytöltä luetut arvot merkitään aina tarkistettaviksi.

Testattu: kolme oikeaa mittarikuvaa (eri valkotasapaino), sininen, kellertävä ja vihertävä sävy, hämärä, kaukana oleva mittari ja heijastus näytössä luetaan oikein. Selvästi vinossa (n. 6°) kuvassa osa arvoista voi mennä väärin, mutta luentaa ei silloin hyväksytä varmaksi, vaan rivi merkitään tarkistettavaksi.

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

**Päivitykset:** nosta aina kahta numeroa yhdessä, kun julkaiset muutoksia: `sw.js`:n `CACHE` (esim. `kuva-sanelu-v8`) ja `js/ui.js`:n `APP_VERSION` (esim. `"8"`). Versio näkyy etusivun alareunassa ja kameraluvun tiedoissa. Sovellus tarkistaa päivityksen, kun se avataan tai palaa näkyviin, ja ottaa uuden version käyttöön automaattisesti etusivulla tai kohdenäkymässä. Kesken olevaa kuvausta tai kirjausta ei keskeytetä.

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
js/methodpicker.js     menetelmän valinta: ehdotukset, haku ja uusi menetelmä
js/autofill.js         tietojen tunnistus sanelusta ja automaattinen täyttö
js/learn.js            oppiva menetelmän tunnistus (naiivi Bayes, laitteella)
js/meter.js            mittarin näytön kameraluku ja lukemien tarkistus
js/lukulaite-ocr.js    tunnistusydin (kopio PBM Kenttälomakkeista)
js/dictation.js        sanelu (puheentunnistus tai äänite)
js/camera.js           kamera ja kuvien pienennys
js/app.js              tila, reititys, kohteet, tutkimussuunnitelma
js/capture.js          Kuva + sanelu
js/card.js             havaintokortti
js/plan.js             pohjapiirros, kerrokset, tilat, sijainnin valinta
js/planrooms.js        tilojen nimien tunnistus pohjakuvasta (PDF-teksti tai OCR)
js/obslist.js          havaintojen haku ja valinta
js/gallery.js          galleriakuvien liittäminen ottoajan perusteella
js/check.js            lähtötarkistus
js/export.js           ZIP-vienti ja palautus
sw.js                  toiminta ilman verkkoa
```

Ulkoiset kirjastot ladataan CDN:stä ja tallennetaan välimuistiin: JSZip 3.10.1 (vienti), pdf.js 3.11.174 (PDF-pohjakuvat) ja Tesseract.js 5.1.1 (kameraluku ja skannattujen pohjakuvien tilannimet). Muita riippuvuuksia tai käännösvaihetta ei ole.

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
- Tilojen tunnistus vaatii, että nimet ovat pohjakuvassa vaakasuorassa tekstinä. Käsin kirjoitettuja tai pystysuoria nimiä ei tunnisteta, ja heikkolaatuisesta skannauksesta osa nimistä voi jäädä löytymättä. Tulos tarkistetaan aina ennen lisäämistä.
- Galleriakuvan ottoaika luetaan EXIF-tiedoista. Jos puhelin poistaa ne jaettaessa, käytetään tiedoston aikaleimaa, eikä ehdotus ole silloin luotettava.
- Jokainen mittauspiste on oma havaintonsa. Saman pisteen kaikki syvyydet ja rinnakkaiset lukemat ovat havainnon taulukossa.
- Kameraluku tunnistaa Vaisala HM40 -sarjan näytön. Muut mittarit kirjataan käsin, kunnes niille lisätään tunnistus.
- Sanelusta tunnistetut luvut ovat ehdotuksia. Tutkija valitsee ne ja vahvistaa arvot itse.
