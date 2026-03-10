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
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('candidates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return;
  }
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

// --- Candidates (Supabase nebo IndexedDB) ---
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabase() {
  return (typeof window !== 'undefined' && window.supabaseClient) || null;
}

function candidateRowToApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    positionId: row.position_id || null,
    stage: row.stage || 'nova_prihlaska',
    surname: row.surname || '',
    firstname: row.firstname || '',
    email: row.email || '',
    phone: row.phone || '',
    linkedin: row.linkedin || '',
    source: row.source || '',
    salary: row.salary || '',
    contract: row.contract || '',
    prvniInterakce: row.prvni_interakce || '',
    notes: row.notes || '',
    kolo1: row.kolo1 || '',
    kolo2: row.kolo2 || '',
    kolo3: row.kolo3 || '',
    ukol: row.ukol || '',
    rejectionReason: row.rejection_reason || '',
    watch: !!row.watch,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function candidateAppToRow(item) {
  const now = new Date().toISOString();
  return {
    position_id: item.positionId || null,
    stage: item.stage || 'nova_prihlaska',
    surname: item.surname || null,
    firstname: item.firstname || null,
    email: item.email || null,
    phone: item.phone || null,
    linkedin: item.linkedin || null,
    source: item.source || null,
    salary: item.salary || null,
    contract: item.contract || null,
    prvni_interakce: item.prvniInterakce || null,
    notes: item.notes || null,
    kolo1: item.kolo1 || null,
    kolo2: item.kolo2 || null,
    kolo3: item.kolo3 || null,
    ukol: item.ukol || null,
    rejection_reason: item.rejectionReason || null,
    watch: !!item.watch,
    updated_at: now
  };
}

async function getAllCandidates() {
  const supabase = getSupabase();
  if (supabase) {
    const pageSize = 1000;
    let all = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error('Supabase getAllCandidates:', error);
        return all.length ? all.map(candidateRowToApp) : [];
      }
      const page = data || [];
      all = all.concat(page);
      hasMore = page.length === pageSize;
      offset += pageSize;
    }
    return all.map(candidateRowToApp);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('candidates').select('*').eq('id', id).single();
    if (error || !data) return null;
    return candidateRowToApp(data);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const row = candidateAppToRow(item);
    const isUpdate = item.id && UUID_REGEX.test(String(item.id));
    if (isUpdate) {
      const { data, error } = await supabase.from('candidates').update(row).eq('id', item.id).select().single();
      if (error) {
        console.error('Supabase saveCandidate update:', error);
        throw error;
      }
      return candidateRowToApp(data);
    }
    const { data, error } = await supabase.from('candidates').insert(row).select().single();
    if (error) {
      console.error('Supabase saveCandidate insert:', error);
      throw error;
    }
    return candidateRowToApp(data);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('candidates').delete().eq('id', id);
    if (error) {
      console.error('Supabase deleteCandidate:', error);
      throw error;
    }
    return;
  }
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

// Fáze náboru
const STAGE_LABELS = {
  novy_kandidat: 'Nový kandidát',
  telefonat: 'Telefonát',
  ukol: 'Úkol',
  kolo1: '1. kolo',
  kolo2: '2. kolo',
  nabidka: 'Nabídka',
  prijat: 'Přijat',
  zamitnut: 'Zamítnut'
};
