// IndexedDB — single shared promise so every module gets the same instance.
// Separate database name from the receipts app: the two never share data.
let _db;

async function getDB() {
  if (_db) return _db;
  _db = await idb.openDB('woovio-shoes', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('shoes')) {
        const store = db.createObjectStore('shoes', { keyPath: 'id', autoIncrement: true });
        store.createIndex('status',   'status');
        store.createIndex('location', 'location');
        store.createIndex('size',     'size');
      }
    }
  });
  return _db;
}

window.getDB = getDB;
