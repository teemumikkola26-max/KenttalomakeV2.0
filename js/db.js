/* =========================================================================
   db.js – tallennus laitteen IndexedDB-tietokantaan
   Säiliöt:
     kohteet   – kohteen tiedot, tilat, kerrokset, tutkimussuunnitelma
     havainnot – havainnot (viittaus kohteeseen kohdeId:llä)
     tiedostot – kuvat, pohjakuvat ja äänitteet Blob-muodossa
   ========================================================================= */
(function () {
  "use strict";

  const DB_NAME = "kuva-sanelu";
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kohteet")) db.createObjectStore("kohteet", { keyPath: "id" });
        if (!db.objectStoreNames.contains("havainnot")) {
          const s = db.createObjectStore("havainnot", { keyPath: "id" });
          s.createIndex("kohdeId", "kohdeId", { unique: false });
        }
        if (!db.objectStoreNames.contains("tiedostot")) {
          const s = db.createObjectStore("tiedostot", { keyPath: "id" });
          s.createIndex("kohdeId", "kohdeId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then((r) => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("Tallennus keskeytyi"));
    }));
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const DB = {
    uid(prefix) {
      const r = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
      return (prefix || "") + r.replace(/-/g, "").slice(0, 16);
    },

    get(store, id) { return tx(store, "readonly", (s) => reqP(s.get(id))); },
    put(store, obj) { return tx(store, "readwrite", (s) => reqP(s.put(obj))); },
    del(store, id) { return tx(store, "readwrite", (s) => reqP(s.delete(id))); },
    all(store) { return tx(store, "readonly", (s) => reqP(s.getAll())); },
    byKohde(store, kohdeId) {
      return tx(store, "readonly", (s) => reqP(s.index("kohdeId").getAll(kohdeId)));
    },

    async putFile(kohdeId, blob, meta) {
      const id = DB.uid("f_");
      await DB.put("tiedostot", Object.assign({ id, kohdeId, blob, type: blob.type, created: Date.now() }, meta || {}));
      return id;
    },

    async deleteKohde(kohdeId) {
      const hav = await DB.byKohde("havainnot", kohdeId);
      const files = await DB.byKohde("tiedostot", kohdeId);
      await tx("havainnot", "readwrite", (s) => { hav.forEach((h) => s.delete(h.id)); });
      await tx("tiedostot", "readwrite", (s) => { files.forEach((f) => s.delete(f.id)); });
      await DB.del("kohteet", kohdeId);
    },

    async requestPersist() {
      try {
        if (navigator.storage && navigator.storage.persist) {
          const already = await navigator.storage.persisted();
          if (!already) await navigator.storage.persist();
        }
      } catch (e) { /* ei kriittinen */ }
    },

    async usage() {
      try {
        if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
      } catch (e) { /* ohita */ }
      return null;
    }
  };

  window.DB = DB;
})();
