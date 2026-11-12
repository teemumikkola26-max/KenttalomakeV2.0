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

**Kolme vähimmäistietoa.** Havainnolle tarvitaan kuva, havainto (kirjoitettu tai saneltu) ja tila. Kameranäkymän alareunassa ne näkyvät kolmena merkkinä (Kuva, Havainto, Tila), jotka muuttuvat vihreiksi, kun tieto on saatu. Menetelmä ja tulos ovat yhdellä tiiviillä rivillä tekstikentän alla: ne täyttyvät sanelusta tai oletuksesta (katkoviivareuna = automaattinen), ja niitä voi vaihtaa yhdellä napautuksella. Menetelmän omat kentät (esim. RH-mittaukset) ovat Mittaukset-painikkeen takana.

**Tila ilman käsityötä.** Tila tulee ensisijaisesti automaattisesti:

1. edellisestä havainnosta (merkintä *edellinen*)
2. sanelusta: tilan tunnus ("tilassa A 101") tai yksiselitteinen nimi ("keittiössä"). Jos samannimisiä tiloja on useita (esim. kymmenen WC:tä), nimestä ei arvata.
3. kuvasta: kun kuvaat oven tilakyltin tai pohjakuvan tilanumeron, sovellus lukee kuvasta kohteen tilojen tunnukset (merkintä *kuvasta*). Vain kohteessa olevat tunnukset kelpaavat. Luku tehdään taustalla, eikä se koske tutkijan itse valitsemaa tilaa.

Jos tila pitää valita itse, sijaintinäkymässä on ensin viimeksi käytetyt tilat ja haku (tunnus tai nimi, esim. "wc 12"). Sen alla on pohjapiirros: tilan merkin napautus valitsee tilan ja kohdan, ja haulla valittu tila kohdistetaan ja zoomataan pohjapiirroksessa. Rakenneosa on valinnainen.

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

**Sanelusta menetelmän kenttiin (`js/fieldfill.js`).** Sanelusta täyttyvät myös menetelmän omat kentät. Esimerkiksi sanelu *"RH-mittaus porareiästä, Vaisala HM40, tasaantumisaika kolme vuorokautta. 30 millissä 78 prosenttia 21,5 astetta, rinnakkainen 79 prosenttia. 70 millissä 84 prosenttia 21,3 astetta. Huoneilma 32 prosenttia 22 astetta."* tuottaa:

- mittalaitteeksi Vaisala HM40 (muistetaan seuraavaan havaintoon) ja tasaantumisajaksi 72 h (vuorokaudet muunnetaan tunneiksi)
- mittausrivit syvyyksittäin: 30 mm 78 % 21,5 °C, 30 mm 79 % ja 70 mm 84 % 21,3 °C. Rinnakkainen lukema tulee omaksi rivikseen samalle syvyydelle.
- ympäröiviin olosuhteisiin 32 % 22 °C (sanat *huoneilma*, *olosuhteet*, *sisäilma* tai *ympäröivä* ohjaavat arvot olosuhdetaulukkoon seuraavaan syvyyteen asti).

Muut menetelmät toimivat samoin: pintakosteus (laite, lukema, vertailuarvo, asteikko), rakenneavaus (tunnus RA3, rakennekerrokset paksuuksineen, esim. "muovimatto, tasoite 5 mm, betoni 80 mm, eps 100 mm"), materiaalinäyte (tunnus, tyyppi, materiaali), merkkiainekoe (aine, injektointikohta, painesuhde, tulos), lämpökuvaus (kamera, sisä- ja ulkolämpötila, paine-ero) ja painesuhde. Itse lisätyt menetelmät saavat avainsanansa kentän nimestä ja yksiköstä. Numerot tunnistetaan myös sanoina ("kolme", "kaksikymmentäyksi pilkku viisi", "miinus 12").

Sanelusta tullut arvo näkyy kortissa merkinnällä *sanelusta*, ja rivi on merkitty mikrofonilla. ZIP-paketissa ne lukevat kohdassa *tunnistettu sanelusta*, ja taulukon rivien lähde on *sanelu*. Tutkijan itse kirjoittamaa arvoa sanelu ei muuta. Kun tutkija muokkaa tai poistaa yhdenkin sanelusta tehdyn rivin, taulukko on hänen, eikä sanelu enää muuta sitä. Puheentunnistus voi kuulla numeron väärin, joten sanelusta tulleet lukemat kannattaa vilkaista kortissa.

**Vähimmäistiedot ja kentät sanelun mukaan.** Menetelmän kentät eivät ole valmiiksi tyhjinä lomakkeena, vaan ne syntyvät sanelusta. Kortissa näkyvät täytetyt kentät ja menetelmän vähimmäistiedot. Vähimmäistiedot ovat Menetelmät-sivulla *pakolliseksi* merkityt kentät, ja niitä voi muokata. Puuttuva vähimmäistieto on korostettu, ja sen kohdalla on esimerkkilause, esim. *Puuttuu · sano esim. "tasaantumisaika 3 vrk"*. Muut kentät saa esiin napauttamalla (+ Ympäröivät olosuhteet). Kortin otsikossa näkyy *Vähimmäistiedot 3/4*. Kameranäkymässä puuttuvat vähimmäistiedot näkyvät tekstikentän alla heti sanelun jälkeen, esim. *RH · puuttuu: mittalaite, tasaantumisaika – Sano esim. "mittalaite Vaisala HM40"*, joten tutkija voi sanoa puuttuvan tiedon saman tien. Puute poistuu, kun tieto on saatu. Lähtötarkistus muistuttaa vielä puuttuvista ennen lähtöä.

**Sanasto.** Valmiina on laaja sanasto: menetelmien avainsanat (mm. porareikä, tasaantumisaika, Gann, Tramex, mikrobinäyte, typpivety, lämpökamera, paine-ero), poikkeamaa ja kunnossa olevaa kuvaavat sanat (mm. homekasvu, kondenssi, lahonnut, vastakaato, kylmäsilta / kuiva, tiivis, ei todettu), noin 70 rakenneosasanaa, yli 80 tilannimeä, yleiset mittalaitteet (Vaisala, Gann, Tramex, Protimeter, Testo, Flir ...) ja noin 60 materiaalia rakennekerroksia varten. Kaikkea ei siis tarvitse opettaa. Sanalistat ovat tiedostojen `js/autofill.js` ja `js/fieldfill.js` alussa.

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
- **Skannattu pohjakuva tai valokuva paperipiirustuksesta** (kuva tai kuvana tallennettu PDF): kuvasta etsitään ensin tekstin näköiset kohdat (merkin kokoiset tummat alueet rivissä). Ne leikataan irti, suurennetaan ja luetaan tekstintunnistuksella (Tesseract, suomi). Näin pienetkin tunnukset löytyvät viivojen seasta, eivätkä varjot tai epätasainen valo haittaa. Lyhyet sanat, joita ei tunnisteta, luetaan uudelleen kolmella eri kuvankäsittelyllä, ja tulokset äänestetään. Piirustuksen kierto (0/90/180/270°) päätellään itse. Siisteistä skannauksista luetaan lisäksi koko sivu, ja tulokset yhdistetään. Ensimmäisellä kerralla ladataan suomen kielidata (noin 1 Mt), ja sen jälkeen tunnistus toimii myös ilman verkkoa.
- **Huonekortit (ArchiCAD, Revit, AutoCAD)**: suunnitteluohjelman huonekortti on muotoa "A101 aula" ja sen alla pinta-ala "139,0". Kun PDF:ssä tai kuvassa on vähintään viisi korttia pinta-aloineen, tilat luetaan vain korteista. Tilanumero tulee tunnukseksi ja kortin teksti nimeksi, olipa se sanastossa tai ei. Vain yksiselitteiset lyhenteet avataan (wc, pkh, prsh A1 → Porrashuone A1, tk, VSS). Monimerkityksiset (rk, s, spk) jätetään sellaisinaan, ja ne voi nimetä (opitaan). Ovien, seinien ja alakattojen tyyppitunnuksia (O1, VS3, AK7, K7) ei tulkita tiloiksi, eikä ovimerkintöjen tilanumero ilman nimeä tee tilaa.
- **Kierretty PDF**: jos koko piirustus on PDF:ssä kierretty, tekstit luetaan yleisimmän tekstisuunnan mukaan.

Tulkinta tuntee tavalliset lyhenteet (MH, OH, KT, K, R, KPH, PH, S, ET, VH, WC, TK, AK, LJ, IV-KH, ...) ja tilannimet, myös kahdelle riville jaetut. Numeroitu lyhenne (MH1, MH2) tulee tunnukseksi. Lyhyet ja moniselitteiset lyhenteet (K, S, R, TK, LH, ...) hyväksytään, jos lähellä on pinta-ala tai tilanumero, tai jos pohjassa on muuten selvästi tilalyhenteitä ja lyhenne on tilojen alueella. Näin mitat ja nimiöruudun tekstit eivät tulkitu tiloiksi. Tekstintunnistuksen tyypilliset sekaannukset korjataan (WH2 → MH2, CH → OH, IK → TK). Lähellä oleva tilanumero (esim. 101, A12) tulee tunnukseksi.

**Asunnot.** Jos pohjassa on useita asuntotyyppimerkintöjä (3H+K 73,0 m²), tilat ryhmitellään asunnoittain, ja tunnukseen tulee asunnon numero (As3 MH1). Asunnon rajat päätellään niin, että samat tilat ovat kaikissa asunnoissa samassa kohdassa. Toistuvan pohjan ansiosta:
- väärin luettu tunnus korjataan muiden asuntojen mukaiseksi
- asunnosta puuttuva tila lisätään, jos samassa kohdassa on tekstiä, jota ei saatu luettua (merkintä *päätelty muista samanlaisista asunnoista*).

Asunnon tunnuksen voi vaihtaa (As3 → C12) minkä tahansa sen tilan valikosta, jolloin asunnon kaikkien tilojen tunnukset päivittyvät.

**Sanasto ja suodatus.** Sanastossa on asuntojen, varastojen, teknisten tilojen ja julkisten rakennusten tavalliset lyhenteet (KE, E, KUISTI, LASIK, IRTV, VSS ...). Pinta-ala tunnistetaan myös ilman yksikköä, kun luku (11.9) on suoraan nimen alla. Kalusteiden ja laitteiden merkinnät (JK, LVV, VAR kaapissa) erotetaan tekstin koon perusteella: tilojen nimet ovat piirustuksessa samankokoisia, kalustemerkinnät pienempiä. Yksittäinen kirjain (E, K, S) hyväksytään vain, jos sen ympärillä on tyhjää lattia-alaa. Vinoviivalla tai päällekkäin merkitty tila (AK / PKH) on yksi tila.

### Tarkistus vain epävarmoille

Kymmenien tai satojen tilojen tarkistaminen yksitellen ei ole järkevää, joten tunnistus jakaa tilat kahteen ryhmään:

- **Varmat lisätään suoraan.** Varma on esimerkiksi PDF:n tekstistä luettu nimi, nimi pinta-alan tai tilanumeron vieressä, selvästi luettu tunnettu lyhenne tai tila, joka on samassa kohdassa vähintään kolmessa samanlaisessa asunnossa. Ehdot ovat tarkoituksella tiukat: on parempi kysyä kuin lisätä väärin.
- **Epävarmat näytetään tarkistettavaksi.** Kunkin vieressä on leike pohjakuvan siitä kohdasta, josta nimi luettiin (kierretyssä kuvassa oikein päin), ja syy, miksi tila on epävarma. Päätös on yksi napautus: ✓ tila tai ✕ ei tila. Nimen voi korjata samalla.

Jos epävarmoja ei ole, tilat lisätään ilman tarkistusnäkymää. Suoraan lisätyt tilat voi halutessaan avata tarkistettavaksi (Näytä myös suoraan lisättävät).

**Luottamus säilyy, koska suoraan lisätty tila on merkitty.** Pohjakuvasta luettu tila on *tunnistettu* (katkoviivareunus pohjapiirroksessa), kunnes tutkija on nähnyt sen nimen. Tila vahvistuu, kun se valitaan havainnon sijainniksi, kun sitä muokataan tai kun tilan valikosta kuitataan *Nimi on oikein*. Tarkistus tehdään siis kentällä samalla, kun tilaa käytetään, eikä erillistä tarkistusvaihetta tarvita. ZIP-paketissa jokaisella tilalla on `nimen_lahde` ja `nimi_vahvistettu`. LUE_MINUT ohjeistaa raportin laatijaa, ettei vahvistamatonta nimeä esitetä tutkijan toteamana. Tilat, joissa ei käyty, voi lähtötarkistuksessa merkitä kerralla rajauksiksi yhteisellä syyllä.

### Oppiminen

Sovellus oppii laitteella (`ks_tilaoppi`), mitä kunkin pohjakuvamerkinnän lyhenne tarkoittaa:

| Tapahtuma | Vaikutus |
|---|---|
| Epävarma tila hyväksytään (✓) | +1 vahvistus |
| Nimi korjataan tai tuntematon lyhenne nimetään | opittu nimi, +2 |
| Tila käytetään havainnon sijaintina, sitä muokataan tai se kuitataan | +1 vahvistus |
| Epävarma tila hylätään (✕) tai vahvistamaton tila poistetaan | +1 hylkäys |

Kun merkinnällä on vähintään kolme vahvistusta eikä yhtään hylkäystä, se lisätään jatkossa suoraan. Esimerkiksi tuntematon "PP" nimetään kerran *Puuvarastoksi* ja hyväksytään kerran, ja siitä eteenpäin se lisätään ilman kysymistä. Usein hylätty oma merkintä ohitetaan. Sanaston lyhenne (WC, MH) ei katoa hylkäyksistä vaan siirtyy tarkistettavaksi. Yksittäisiä kirjaimia ei opita, koska samaa kirjainta käytetään piirustuksissa myös kalusteissa. Opitut lyhenteet näkyvät Menetelmät-sivulla, ne voi nollata, ja ne kulkevat Vie menetelmät -tiedostossa, joten tiimi voi koota yhteisen sanaston.

Rajoitus: lyhenne opitaan ilman asiayhteyttä. Jos sama lyhenne tarkoittaa eri piirustuksissa eri asiaa (AK = autokatos tai apukeittiö), se kannattaa jättää vahvistamatta, jolloin se pysyy tarkistettavana.

Tilojen rajoja ei tunnisteta: tila on pohjapiirroksessa merkki nimen kohdalla.

## Pohjapiirroksen zoomaus (`js/zoom.js`)

Pohjapiirrosta voi zoomata sekä pohjapiirrosnäkymässä että sijaintia valittaessa:

- kahden sormen nipistys zoomaa (jopa 10-kertaiseksi) ja yhden sormen veto siirtää kuvaa
- kaksoisnapautus zoomaa kohtaan, ja toinen kaksoisnapautus palauttaa koko kuvan
- painikkeet: + ja − zoomaavat, kuvakepainike palauttaa koko kuvan ja ⤢ avaa pohjan koko näytölle (pohjapiirrosnäkymässä)
- tietokoneella hiiren rulla zoomaa

Tilamerkit pysyvät samankokoisina zoomattaessa, joten tiheäkin pohja, jossa on kymmeniä tiloja, aukeaa luettavaksi. Napautus toimii zoomattuna normaalisti, mutta veto ei laukaise napautusta. Zoomaus ja kohta säilyvät, kun näkymä päivittyy (esimerkiksi tilan merkinnän jälkeen). Sijaintia valittaessa tilamerkin napautus valitsee samalla tilan, joten pitkää tilaluetteloa ei tarvitse selata.

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
js/vocab.js            muokattavat sanalistat (oletukset + tutkijan muutokset)
js/vocabview.js        Sanasto-sivu ja sanelun kokeilu
js/methodpicker.js     menetelmän valinta: ehdotukset, haku ja uusi menetelmä
js/autofill.js         tietojen tunnistus sanelusta ja automaattinen täyttö
js/learn.js            oppiva menetelmän tunnistus (naiivi Bayes, laitteella)
js/fieldfill.js        sanelusta menetelmän kenttiin (laite, lukemat, taulukon rivit)
js/meter.js            mittarin näytön kameraluku ja lukemien tarkistus
js/lukulaite-ocr.js    tunnistusydin (kopio PBM Kenttälomakkeista)
js/dictation.js        sanelu (puheentunnistus tai äänite)
js/camera.js           kamera ja kuvien pienennys
js/app.js              tila, reititys, kohteet, tutkimussuunnitelma
js/capture.js          Kuva + sanelu
js/card.js             havaintokortti
js/plan.js             pohjapiirros, kerrokset, tilat, sijainnin valinta
js/planrooms.js        tilojen nimien tunnistus pohjakuvasta (PDF-teksti tai OCR)
js/zoom.js             pohjapiirroksen zoomaus, siirto ja koko näyttö
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

### Sanasto

Sanelun ja pohjakuvien tulkinnan sanalistat muokataan sovelluksessa: **etusivu → Sanasto** (myös Menetelmät-sivulta). Listat:

| Ryhmä | Lista | Muoto |
|---|---|---|
| Sanelu: tulos | Poikkeamaa kuvaavat sanat, Aina poikkeama (myös kieltomuodossa), Kunnossa olevaa kuvaavat | sana riville |
| Sanelu: sijainti | Rakenneosat, Tilojen nimet | `sana = arvo` |
| Sanelu: menetelmän kentät | Mittalaitteet, Materiaalit | sana riville |
| | Merkkiaineet | `sana = arvo` |
| Pohjakuvat | Tilojen lyhenteet | `LYHENNE = Tilan nimi` |
| | Tilojen nimet pohjakuvissa | nimi riville |

Säännöt: sana on sanan alku (`kondens` osuu sanoihin kondenssi ja kondensoitunut). Enintään kahden kirjaimen sana (`us`, `ap`, `yp`) ja lainausmerkeissä oleva sana tunnistetaan vain kokonaisena. `#` aloittaa kommentin. Mittalaite kirjataan sanaston kirjoitusasussa (`GANN Hydromette BL-E`).

Sivun **Kokeile sanelua** -kenttä näyttää heti, mitä lauseesta päätellään (menetelmä, tulos, tila, rakenneosa ja kentät), joten sanaston muutoksen vaikutuksen näkee kirjoittamalla esimerkkilauseen.

Menetelmäkohtaiset sanat ovat menetelmän sivulla: **Tunnistussanat** (milloin sanelu kuuluu tälle menetelmälle), **Tunnuksen etuliite** (esim. MIK → MIK1, MIK2) ja kentän muokkauksessa kentän **tunnistussanat** (minkä sanan jälkeen tuleva arvo kirjataan kenttään).

Muokattu lista tallentuu laitteelle ja korvaa oletuksen. **Palauta oletus** palauttaa listan. Sanasto kulkee **Vie menetelmät** -tiedostossa, ja tuonnissa kysytään, otetaanko se käyttöön, joten tiimi voi käyttää yhteistä sanastoa. Oletussanastoon on koottu tyypillisiä raporttien sanamuotoja (esim. pko-arvo, yksikköä, RA1, MIK1, MAK1, merkkiainevuoto, alunoita, toimenpiderajan ylitys, US/AP/YP).

## Tunnetut rajoitukset

- Ei synkronointia laitteiden välillä. Siirto tehdään ZIP-paketilla.
- Pohjakuvasta käytetään yhtä PDF-sivua kerrosta kohden.
- Tiloja ei piirretä alueina: tila merkitään pohjapiirrokseen tunnuksella, ja sen väri kertoo tutkimustilanteen.
- Tilojen tunnistus vaatii, että nimet ovat painettua tekstiä samassa suunnassa kuin piirustuksen muu teksti. Viivaan tai symboliin kiinni oleva nimi (esim. ovenkaaren vieressä) jää usein löytymättä. Käsin kirjoitettuja nimiä ei tunnisteta. Valokuvasta tunnistus onnistuu sitä paremmin, mitä tarkempi kuva on: kuvaa piirustus suoraan yläpuolelta, ja anna sovellukselle alkuperäinen kuva (ei pienennettyä kuvakaappausta). Tulos tarkistetaan aina ennen lisäämistä.
- Galleriakuvan ottoaika luetaan EXIF-tiedoista. Jos puhelin poistaa ne jaettaessa, käytetään tiedoston aikaleimaa, eikä ehdotus ole silloin luotettava.
- Jokainen mittauspiste on oma havaintonsa. Saman pisteen kaikki syvyydet ja rinnakkaiset lukemat ovat havainnon taulukossa.
- Kameraluku tunnistaa Vaisala HM40 -sarjan näytön. Muut mittarit kirjataan käsin, kunnes niille lisätään tunnistus.
- Sanelusta tunnistetut luvut ovat ehdotuksia. Tutkija valitsee ne ja vahvistaa arvot itse.
