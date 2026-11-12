/* =========================================================================
   cloud.js – pilviyhteys (Supabase) ja kirjautuminen Microsoft 365 -tunnuksilla

   - Ei asetuksia (config.js tyhjä) -> sovellus toimii vain laitteella.
   - Kirjautuminen: Supabase Auth, palveluntarjoaja "azure" (Microsoft Entra ID).
     Kaksivaiheinen tunnistus ja tunnusten sulku hoidetaan organisaation Entra-asetuksista.
   - Istunto säilyy laitteella; ilman verkkoa työ jatkuu, ja synkronointi odottaa
     yhteyttä (tarvittaessa uutta kirjautumista).
   - Sallittu sähköpostidomain tarkistetaan sekä täällä että tietokannassa.
   ========================================================================= */
(function () {
  "use strict";
  const C = window.KS_CONFIG || {};
  const enabled = !!(C.supabaseUrl && C.supabaseAnonKey && window.supabase);
  let client = null, session = null, profile = null;
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });

  // Turvatarkistus: CSP:n connect-src sallii tämän osoitteen (muuten pilviyhteys estetään)
  function cspOk() {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (!m) return false;
    const host = new URL(C.supabaseUrl).host;
    return m.content.includes("https://" + host);
  }

  function sallittu(email) {
    const d = String(email || "").split("@")[1] || "";
    return (C.sallitutDomainit || []).map((x) => x.toLowerCase()).includes(d.toLowerCase());
  }

  async function init() {
    if (!enabled) return;
    if (!cspOk()) { console.error("CSP ei salli Supabase-osoitetta"); Cloud.virhe = "Ylläpito: index.html:n Content-Security-Policy ei salli config.js:n Supabase-osoitetta."; return; }
    client = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "ks-auth" }
    });
    const { data } = await client.auth.getSession();
    session = data && data.session;
    client.auth.onAuthStateChange((_e, s) => { session = s; if (!s) profile = null; emit(); });
    if (session && !sallittu(session.user.email)) { await client.auth.signOut(); session = null; Cloud.virhe = "Tunnus ei ole sallitusta organisaatiosta."; }
    if (session) await loadProfile();
    // Paluu kirjautumisesta: siivotaan osoiterivi (koodi ei jää historiaan)
    if (/[?&]code=/.test(location.search)) history.replaceState(null, "", location.pathname + (location.hash || "#/"));
  }

  async function loadProfile() {
    try {
      const { data } = await client.from("profiles").select("id,email,nimi,sarja").eq("id", session.user.id).maybeSingle();
      profile = data || { id: session.user.id, email: session.user.email, nimi: session.user.email, sarja: null };
      try { localStorage.setItem("ks_profiili", JSON.stringify(profile)); } catch (e) { /* ohita */ }
    } catch (e) {
      try { profile = JSON.parse(localStorage.getItem("ks_profiili") || "null"); } catch (x) { profile = null; }
    }
    if (profile && !profile.sarja) profile.sarja = oletusSarja(profile.nimi || profile.email);
  }
  function oletusSarja(nimi) {
    const osat = String(nimi || "").replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
    return (osat.length >= 2 ? osat[0][0] + osat[osat.length - 1][0] : (osat[0] || "XX").slice(0, 2)).toUpperCase();
  }

  async function login() {
    if (!client) return;
    await client.auth.signInWithOAuth({
      provider: "azure",
      options: { scopes: "email openid profile", redirectTo: location.origin + location.pathname }
    });
  }
  async function logout() {
    if (!client) return;
    await client.auth.signOut();
    profile = null;
    try { localStorage.removeItem("ks_profiili"); } catch (e) { /* ohita */ }
    emit();
  }
  async function setSarja(s) {
    s = String(s || "").toUpperCase().replace(/[^A-ZÅÄÖ]/g, "").slice(0, 4);
    if (!s || !profile) return false;
    const { error } = await client.from("profiles").update({ sarja: s }).eq("id", profile.id);
    if (error) throw error;
    profile.sarja = s;
    try { localStorage.setItem("ks_profiili", JSON.stringify(profile)); } catch (e) { /* ohita */ }
    return true;
  }

  // Offline: viimeksi kirjautuneen tutkijan tiedot laitteelta (kirjaukset jatkuvat ilman verkkoa)
  function user() {
    if (profile) return profile;
    try { return JSON.parse(localStorage.getItem("ks_profiili") || "null"); } catch (e) { return null; }
  }

  const Cloud = {
    enabled, init, login, logout, setSarja, user, sallittu,
    get client() { return client; },
    get session() { return session; },
    get kirjautunut() { return !!session; },
    onChange(f) { listeners.push(f); },
    virhe: ""
  };
  window.Cloud = Cloud;
})();
