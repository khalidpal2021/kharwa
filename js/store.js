/* ===========================================================================
   store.js — a tiny IndexedDB key-value store, one database per section.

   Used to cache API responses (Quran surahs, hadith chapters) so they open
   instantly, and without a connection, after their first load. Every failure
   degrades to "not cached": callers just fetch again.
   =========================================================================== */

class IdbStore {
  constructor(name) {
    this.name = name;
    this.db = null;
  }

  open() {
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(() => null);
    }
    return this.db;
  }

  async get(key) {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction('kv').objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async put(key, value) {
    const db = await this.open();
    if (!db) return;
    try {
      db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
    } catch { /* full or blocked: just don't cache */ }
  }
}
