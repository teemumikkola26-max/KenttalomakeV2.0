/* =========================================================================
   config.js – ympäristön asetukset (ylläpitäjä täyttää)

   Pilvi (Supabase, EU-alue) ja kirjautuminen Microsoft 365 -tunnuksilla.
   Jos supabaseUrl on tyhjä, sovellus toimii pelkästään laitteella (kuten ennen).

   TÄRKEÄÄ: index.html:n Content-Security-Policy-rivillä (connect-src) on oltava
   sama Supabase-osoite. Muualle sovellus ei saa lähettää tietoja.
   Julkinen avain (anon key) saa olla tässä: tietoihin pääsee vain kirjautunut
   käyttäjä tietokannan käyttöoikeussääntöjen (RLS) mukaisesti. Palvelinavainta
   (service_role) ei koskaan laiteta sovellukseen.
   ========================================================================= */
window.KS_CONFIG = {
  supabaseUrl: "",                 // esim. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",             // Supabase: Project Settings → API → anon public
  sallitutDomainit: ["pbm.fi"],    // vain nämä sähköpostidomainit hyväksytään (myös tietokannassa)

  /* Puheentunnistus:
     "laite"     tunnistus vain puhelimessa (processLocally). Jos suomen kielipakettia ei ole,
                 sanelu tallennetaan äänitteenä eikä ääntä lähetetä mihinkään.
     "palvelin"  selaimen oletus: ääni lähetetään selaimen puheentunnistuspalveluun
                 (Chrome: Google). Käytä vain, jos yritys on hyväksynyt tämän. */
  puheentunnistus: "laite",

  /* Laitteen tiedot: pilvikohteen tiedot poistetaan puhelimesta, kun kohde on synkronoitu
     eikä sitä ole avattu näin moneen päivään. */
  laitteellaPaivia: 14
};
