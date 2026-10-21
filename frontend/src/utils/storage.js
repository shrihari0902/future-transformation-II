// IndexedDB helper for resilient offline payment storage

const DB_NAME = 'offlinepay_vault_v1';
const DB_VERSION = 1;

let dbInstance = null;

export async function getDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Device keys: { id: 'current', deviceId, publicKeySpki, keypair }
      if (!db.objectStoreNames.contains('device_keys')) {
        db.createObjectStore('device_keys', { keyPath: 'id' });
      }

      // 2. Active certificates: { certificate_id, ... }
      if (!db.objectStoreNames.contains('certificates')) {
        db.createObjectStore('certificates', { keyPath: 'certificate_id' });
      }

      // 3. Offline sync queue: { transaction_id, status, ... }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const store = db.createObjectStore('sync_queue', { keyPath: 'transaction_id' });
        store.createIndex('status', 'status', { unique: false });
      }

      // 4. Seen nonces on merchant terminal: { nonce, seen_at }
      if (!db.objectStoreNames.contains('seen_nonces')) {
        db.createObjectStore('seen_nonces', { keyPath: 'nonce' });
      }

      // 5. Highest counters seen per payer device: { device_id, last_counter }
      if (!db.objectStoreNames.contains('device_counters')) {
        db.createObjectStore('device_counters', { keyPath: 'device_id' });
      }

      // 6. Settings / Bank public key cache: { key, value }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// Generic transaction helpers
async function executeTx(storeName, mode, callback) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);

    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

// Device Key Management
export async function saveDeviceKey(record) {
  return executeTx('device_keys', 'readwrite', (store) => store.put({ id: 'current', ...record }));
}

export async function getDeviceKey() {
  return executeTx('device_keys', 'readonly', (store) => store.get('current'));
}

// Bank Public Key Cache
export async function cacheBankPublicKey(spkiB64) {
  return executeTx('cache', 'readwrite', (store) => store.put({ key: 'bank_public_key', value: spkiB64 }));
}

export async function getCachedBankPublicKey() {
  const res = await executeTx('cache', 'readonly', (store) => store.get('bank_public_key'));
  return res ? res.value : null;
}

// Certificates
export async function saveCertificate(cert) {
  return executeTx('certificates', 'readwrite', (store) => store.put(cert));
}

export async function getAllCertificates() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('certificates', 'readonly');
    const store = tx.objectStore('certificates');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Sync Queue (Transactions & Receipts to sync when online)
export async function addToSyncQueue(item) {
  return executeTx('sync_queue', 'readwrite', (store) => store.put(item));
}

export async function getSyncQueue() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function updateSyncItem(item) {
  return executeTx('sync_queue', 'readwrite', (store) => store.put(item));
}

export async function removeFromSyncQueue(txId) {
  return executeTx('sync_queue', 'readwrite', (store) => store.delete(txId));
}

// Replay protection tracking on merchant browser
export async function hasSeenNonce(nonce) {
  const res = await executeTx('seen_nonces', 'readonly', (store) => store.get(nonce));
  return !!res;
}

export async function recordSeenNonce(nonce) {
  return executeTx('seen_nonces', 'readwrite', (store) => store.put({ nonce, seen_at: new Date().toISOString() }));
}

// Highest seen counter tracking for payer device
export async function getLastCounterForDevice(deviceId) {
  const res = await executeTx('device_counters', 'readonly', (store) => store.get(deviceId));
  return res ? res.last_counter : 0;
}

export async function updateLastCounterForDevice(deviceId, counter) {
  return executeTx('device_counters', 'readwrite', (store) => store.put({ device_id: deviceId, last_counter: counter }));
}

// Outgoing counter tracking for payer device
export async function getNextOutgoingCounter(deviceId) {
  const key = `counter_${deviceId}`;
  const current = parseInt(localStorage.getItem(key) || '0', 10);
  const next = current + 1;
  localStorage.setItem(key, next.toString());
  return next;
}

export async function getCurrentOutgoingCounter(deviceId) {
  const key = `counter_${deviceId}`;
  return parseInt(localStorage.getItem(key) || '0', 10);
}
