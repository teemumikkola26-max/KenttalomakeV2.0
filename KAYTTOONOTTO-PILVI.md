# Pilven käyttöönotto (Supabase + Microsoft 365)

Ohje ylläpitäjälle. Sovellus toimii ilman näitä asetuksia pelkästään laitteella. Kun asetukset on tehty, kirjautuneen tutkijan kohteet synkronoituvat pilveen, ja kohteen tiimi voi kirjata samaan kohteeseen yhtä aikaa.

## 1. Supabase-projekti (EU)

1. Luo uusi projekti. Valitse **tietty EU-alue**, esim. *eu-north-1 (Stockholm)* tai *eu-central-1 (Frankfurt)*. Älä valitse yleistä "Europe"-aluetta, koska se voi sijoittaa projektin Lontooseen tai Zürichiin.
2. Hyväksy Supabasen käsittelijäsopimus (DPA): supabase.com/legal/dpa.
3. Avaa **SQL Editor** ja aja tiedosto `supabase/schema.sql`.
   - Jos organisaation sähköpostidomain on muu kuin `pbm.fi`, muuta se ensin funktioon `sallittu_email`.
4. Aja tiedosto `supabase/rls-testit.sql`. Jokaisen rivin on tulostettava **OK**. Jos jokin tulostaa VIRHE, älä ota sovellusta käyttöön ennen kuin syy on korjattu. Testi ei jätä tietokantaan mitään.
5. **Authentication → Sign In / Providers:**
   - Poista sähköposti- ja salasanakirjautuminen sekä muut palveluntarjoajat käytöstä.
   - Ota käyttöön vain **Azure**.

## 2. Microsoft Entra ID

1. Avaa Azure-portaalissa **Microsoft Entra ID → App registrations → New registration**.
   - Nimi: *Kuva + sanelu*
   - Tilityyppi: **Accounts in this organizational directory only (single tenant)**
   - Redirect URI: tyyppi **Web**, osoite `https://<projekti>.supabase.co/auth/v1/callback`
2. Valitse **Certificates & secrets → New client secret**. Kopioi **Value** ja kirjaa vanhenemispäivä ylös: salaisuus on vaihdettava ennen sitä.
3. Lisää valinnaiset claimit (Supabasen suositus). **Manifest**-kohdassa: idTokeniin `email` ja `xms_edov`, accessTokeniin `xms_edov`.
4. Supabasessa (**Authentication → Providers → Azure**):
   - Client ID = *Application (client) ID*
   - Secret = edellä kopioitu Value
   - Azure Tenant URL = `https://login.microsoftonline.com/<Directory (tenant) ID>`. Vain organisaation tunnukset kelpaavat.
5. Supabasessa (**Authentication → URL Configuration**): Site URL ja Redirect URLs = sovelluksen osoite, esim. `https://teemumikkola26-max.github.io/`.
6. Suositellaan:
   - Ehdollinen käyttöoikeus (Conditional Access) tälle sovellukselle: kaksivaiheinen tunnistus ja tarvittaessa vain hallitut laitteet.
   - Sovellukselle on määritettävä käyttäjät (*Assignment required = Yes*), jotta vain tutkijat pääsevät sisään.

## 3. Sovelluksen asetukset

1. Kirjoita tiedostoon `js/config.js`:
   - `supabaseUrl`: projektin osoite
   - `supabaseAnonKey`: julkinen avain (*anon public* tai *publishable key*). **Älä koskaan** laita sovellukseen `service_role`- tai *secret*-avainta.
   - `sallitutDomainit`: organisaation sähköpostidomainit
   - `puheentunnistus`: `"laite"` (suositus) tai `"palvelin"`, ks. kohta 5
2. Vaihda `index.html`:n Content-Security-Policy-rivillä `https://YOUR-PROJECT.supabase.co` samaksi osoitteeksi. Ilman tätä sovellus ei avaa pilviyhteyttä, ja etusivulle tulee ylläpitäjälle tarkoitettu virheilmoitus.
3. Nosta `sw.js`:n CACHE-versio ja julkaise.

## 4. Käyttö

- **Kirjautuminen:** tutkija kirjautuu kerran Microsoft-tunnuksellaan. Tämän jälkeen hän voi työskennellä myös ilman verkkoa.
- **Kohteen luonti:** kirjautuneena luotu kohde on pilvikohde. Vanhan, vain laitteella olevan kohteen voi siirtää pilveen kohteen Tiedot-sivulta.
- **Tiimi:** kohteen Tiedot-sivulla lisätään tiimiin tutkijoita sähköpostiosoitteella. Tutkijan on kirjauduttava sovellukseen kerran ennen kuin hänet voi lisätä. Kohteen näkevät vain tiimin jäsenet.
- **Kenttänumerot:** kentällä havainnoilla on tutkijakohtainen sarja (esim. TM-05). ZIP-paketissa eli raportilla havainnot numeroidaan juoksevasti H01, H02 … kirjausjärjestyksessä.
- **Samaan aikaan muokattu havainto:** pilvessä ollut versio jää voimaan. Korvautunut versio jää talteen havaintokortille, josta sen voi palauttaa.
- **Uloskirjautuminen** poistaa pilvikohteiden tiedot puhelimesta. Lähettämättömät muutokset säilyvät puhelimessa, kunnes ne on lähetetty. Synkronoidut kohteet, joita ei ole avattu `laitteellaPaivia`-asetuksen ajan (oletus 14 päivää), poistetaan puhelimesta automaattisesti.

## 5. Sanelu ja tietosuoja

Selaimen puheentunnistus lähettää oletuksena äänen verkkopalveluun (Chromessa Google). Asetuksella `puheentunnistus: "laite"` sovellus käyttää vain puhelimessa tapahtuvaa tunnistusta.

- Jos suomen kielipaketti on ladattavissa, etusivun kortissa *Sanelu ja tietosuoja* on lataus­painike.
- Jos puhelin tai selain ei tue suomea laitteella, sanelut tallennetaan äänitteinä. Ääni ei lähde puhelimesta, ja äänitteet kulkevat ZIP-paketissa raportointiin.

Testaa organisaation puhelimilla, toimiiko suomi laitteella. Päätä sen perusteella asetus.

## 6. Tietoturvan tarkistuslista

- [ ] Supabase-projekti tietyllä EU-alueella ja DPA hyväksytty
- [ ] `schema.sql` ajettu, `rls-testit.sql` kaikki OK (aja uudelleen aina sääntöjen muuttuessa)
- [ ] Vain Azure-kirjautuminen käytössä, single tenant, Assignment required
- [ ] Kaksivaiheinen tunnistus (Conditional Access)
- [ ] Client secretin vanhenemispäivä kalenterissa
- [ ] `config.js`: vain julkinen avain. CSP:ssä oikea projektiosoite.
- [ ] Kirjastot ovat repossa (`lib/`), ei CDN:stä. Päivitys: `lib/VERSIONS.txt`.
- [ ] Puheentunnistuksen asetus päätetty
- [ ] Säilytysaika päätetty, esim. kohde poistetaan pilvestä X vuoden kuluttua raportista (ylläpitäjä poistaa SQL:llä)
- [ ] Varmuuskopiot (Supabasen projektin varmuuskopiointi) ja lokien seuranta (taulu `loki`)
- [ ] AI-raporttityökalun sopimus: aineistoa ei käytetä koulutukseen, ja se käsitellään EU:ssa
- [ ] Puhelimissa näyttölukko ja salaus (mobiilihallinta, jos käytössä)
- [ ] Kun työntekijä lähtee tai puhelin katoaa: sulje tunnus Entrassa **ja** poista käyttäjä Supabasessa (Authentication → Users). Supabasen istunto ei katkea pelkästä Entra-sulusta, vaan säilyy, kunnes käyttäjä poistetaan tai istunto vanhenee. Poista hänet myös kohteiden tiimeistä.
- [ ] Istunnon kesto: jos Supabase-pakettinne sisältää istuntojen rajauksen (Authentication → Sessions), aseta enimmäiskesto, esim. viikko.
