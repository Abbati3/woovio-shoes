// Minimal idb-style wrapper — vendored, no CDN dependency
// API: openDB(name, version, { upgrade }) → db
//   db.get(store, key), db.put(store, val), db.getAll(store),
//   db.delete(store, key), db.transaction([stores], mode)

function openDB(name, version, { upgrade } = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = e => {
      if (upgrade) upgrade(req.result, e.oldVersion, e.newVersion, req.transaction);
    };
    req.onsuccess = () => resolve(wrap(req.result));
    req.onerror   = () => reject(req.error);
  });
}

function promReq(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

function wrap(db) {
  return {
    get(store, key)    { return promReq(db.transaction(store).objectStore(store).get(key)); },
    getAll(store)      { return promReq(db.transaction(store).objectStore(store).getAll()); },
    put(store, val)    { return promReq(db.transaction(store,'readwrite').objectStore(store).put(val)); },
    delete(store, key) { return promReq(db.transaction(store,'readwrite').objectStore(store).delete(key)); },
    transaction(stores, mode) {
      const tx = db.transaction(stores, mode || 'readonly');
      return {
        objectStore: n => tx.objectStore(n),
        done: new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); })
      };
    },
    _raw: db
  };
}

window.idb = { openDB };
