/**
 * IndexedDB wrapper pro HR Nábor
 * Store: positions, openings, candidates, applications (přihlášky z job stránky)
 */
const DB_NAME = 'HRNaborDB';
const DB_VERSION = 2;

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const database = e.target.result;

      // Pozice (slovník)
      if (!database.objectStoreNames.contains('positions')) {
        const pos = database.createObjectStore('positions', { keyPath: 'id' });
        pos.createIndex('status', 'status', { unique: false });
      }

      // Výběrová řízení / nábor (openings)
      if (!database.objectStoreNames.contains('openings')) {
        const openings = database.createObjectStore('openings', { keyPath: 'id' });
        openings.createIndex('status', 'status', { unique: false });
        openings.createIndex('publicSlug', 'publicSlug', { unique: false });
      }

      // Kandidáti
      if (!database.objectStoreNames.contains('candidates')) {
        const cand = database.createObjectStore('candidates', { keyPath: 'id' });
        cand.createIndex('positionId', 'positionId', { unique: false });
        cand.createIndex('stage', 'stage', { unique: false });
        cand.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Přihlášky z job stránky
      if (!database.objectStoreNames.contains('applications')) {
        const app = database.createObjectStore('applications', { keyPath: 'id' });
        app.createIndex('positionId', 'positionId', { unique: false });
        app.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// --- Positions ---
async function getAllPositions() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('positions', 'readonly');
    const store = tx.objectStore('positions');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getPosition(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('positions', 'readonly');
    const store = tx.objectStore('positions');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePosition(item) {
  const database = await openDB();
  const record = { ...item };
  if (!record.id) {
    record.id = generateId();
    record.createdAt = new Date().toISOString();
  }
  record.updatedAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('positions', 'readwrite');
    const store = tx.objectStore('positions');
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function deletePosition(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('positions', 'readwrite');
    const store = tx.objectStore('positions');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function clearAllPositions() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('positions', 'readwrite');
    tx.objectStore('positions').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllCandidates() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('candidates', 'readwrite');
    tx.objectStore('candidates').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Openings (výběrová řízení) ---
async function getAllOpenings() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('openings', 'readonly');
    const store = tx.objectStore('openings');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getOpening(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('openings', 'readonly');
    const store = tx.objectStore('openings');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveOpening(item) {
  const database = await openDB();
  const record = { ...item };
  if (!record.id) {
    record.id = generateId();
    record.createdAt = new Date().toISOString();
  }
  if (!record.publicSlug) {
    const base = (record.title || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pozice';
    record.publicSlug = `${base}-${record.id.slice(-4)}`;
  }
  record.updatedAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('openings', 'readwrite');
    const store = tx.objectStore('openings');
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function deleteOpening(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('openings', 'readwrite');
    const store = tx.objectStore('openings');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// --- Candidates ---
async function getAllCandidates() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('candidates', 'readonly');
    const store = tx.objectStore('candidates');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getCandidate(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('candidates', 'readonly');
    const store = tx.objectStore('candidates');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveCandidate(item) {
  const database = await openDB();
  const record = { ...item };
  if (!record.id) {
    record.id = generateId();
    record.createdAt = new Date().toISOString();
  }
  record.updatedAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('candidates', 'readwrite');
    const store = tx.objectStore('candidates');
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function deleteCandidate(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('candidates', 'readwrite');
    const store = tx.objectStore('candidates');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// --- Applications (from job page) ---
async function getAllApplications() {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('applications', 'readonly');
    const store = tx.objectStore('applications');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getApplication(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('applications', 'readonly');
    const store = tx.objectStore('applications');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveApplication(item) {
  const database = await openDB();
  const record = { ...item };
  if (!record.id) {
    record.id = generateId();
    record.createdAt = new Date().toISOString();
  }
  return new Promise((resolve, reject) => {
    const tx = database.transaction('applications', 'readwrite');
    const store = tx.objectStore('applications');
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function deleteApplication(id) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('applications', 'readwrite');
    const store = tx.objectStore('applications');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Fáze náboru (pouze těchto 7)
const STAGE_LABELS = {
  novy_kandidat: 'Nový kandidát',
  telefonat: 'Telefonát',
  ukol: 'Úkol',
  kolo1: '1. kolo',
  kolo2: '2. kolo',
  prijat: 'Přijat',
  zamitnut: 'Zamítnut'
};
