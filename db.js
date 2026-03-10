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

// --- Positions (Supabase nebo IndexedDB) ---
async function getAllPositions() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('positions').select('*').order('name');
    if (error) throw error;
    return (data || []).map(positionRowToApp);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('positions').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return positionRowToApp(data);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const row = positionAppToRow(item);
    if (item.id) {
      const { data, error } = await supabase.from('positions').update(row).eq('id', item.id).select().single();
      if (error) throw error;
      return positionRowToApp(data);
    }
    const { data, error } = await supabase.from('positions').insert(row).select().single();
    if (error) throw error;
    return positionRowToApp(data);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('positions').delete().eq('id', id);
    if (error) throw error;
    return;
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('positions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    return;
  }
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

// --- Openings (Supabase nebo IndexedDB) ---
async function getAllOpenings() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('openings').select('*').order('title');
    if (error) throw error;
    return (data || []).map(openingRowToApp);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('openings').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return openingRowToApp(data);
  }
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('openings', 'readonly');
    const store = tx.objectStore('openings');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _openingPublicSlug(item) {
  const base = (item.title || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pozice';
  return `${base}-${(item.id || generateId()).slice(-4)}`;
}

async function saveOpening(item) {
  const supabase = getSupabase();
  if (supabase) {
    const toSave = { ...item };
    if (!toSave.publicSlug) toSave.publicSlug = _openingPublicSlug(toSave);
    const row = openingAppToRow(toSave);
    if (item.id) {
      const { data, error } = await supabase.from('openings').update(row).eq('id', item.id).select().single();
      if (error) throw error;
      return openingRowToApp(data);
    }
    const { data, error } = await supabase.from('openings').insert(row).select().single();
    if (error) throw error;
    return openingRowToApp(data);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('openings').delete().eq('id', id);
    if (error) throw error;
    return;
  }
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
    openingId: row.opening_id || null,
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
    gender: row.gender || '',
    salaryCurrency: row.salary_currency || '',
    salaryNote: row.salary_note || '',
    startDate: row.start_date || '',
    languages: row.languages || '',
    potential: row.potential || '',
    cvFiles: Array.isArray(row.cv_files) ? row.cv_files : (row.cv_files ? [row.cv_files] : []),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function candidateAppToRow(item) {
  const now = new Date().toISOString();
  return {
    position_id: item.positionId || null,
    opening_id: item.openingId || null,
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
    gender: item.gender || null,
    salary_currency: item.salaryCurrency || null,
    salary_note: item.salaryNote || null,
    start_date: item.startDate || null,
    languages: item.languages || null,
    potential: item.potential || null,
    cv_files: Array.isArray(item.cvFiles) && item.cvFiles.length ? item.cvFiles : null,
    updated_at: now
  };
}

function positionRowToApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    status: row.status || 'aktivni',
    notes: row.notes || '',
    mergedIntoId: row.merged_into_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function positionAppToRow(item) {
  const now = new Date().toISOString();
  const row = {
    name: item.name || '',
    status: item.status || 'aktivni',
    notes: item.notes || '',
    merged_into_id: item.mergedIntoId || null,
    updated_at: item.updatedAt || now,
  };
  if (item.id) row.id = item.id;
  return row;
}

function openingRowToApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || '',
    positionId: row.position_id || null,
    location: row.location || '',
    status: row.status || 'aktivni',
    description: row.description || '',
    workload: row.workload || '',
    requiredSkills: row.required_skills || '',
    requiredSoftware: row.required_software || '',
    openedAt: row.opened_at || null,
    publicSlug: row.public_slug || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function openingAppToRow(item) {
  const now = new Date().toISOString();
  const row = {
    title: item.title || '',
    position_id: item.positionId || null,
    location: item.location || '',
    status: item.status || 'aktivni',
    description: item.description || '',
    workload: item.workload || null,
    required_skills: item.requiredSkills || null,
    required_software: item.requiredSoftware || null,
    opened_at: item.openedAt || null,
    public_slug: item.publicSlug || null,
    updated_at: item.updatedAt || now,
  };
  if (item.id) row.id = item.id;
  return row;
}

function applicationRowToApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    openingId: row.opening_id || null,
    positionId: row.position_id || null,
    positionName: row.position_name || null,
    surname: row.surname || '',
    firstname: row.firstname || '',
    email: row.email || '',
    phone: row.phone || '',
    linkedin: row.linkedin || '',
    startDate: row.start_date || '',
    message: row.message || '',
    files: row.files || [],
    convertedToCandidateId: row.converted_to_candidate_id || null,
    createdAt: row.created_at,
  };
}

function applicationAppToRow(item) {
  return {
    opening_id: item.openingId || null,
    position_id: item.positionId || null,
    position_name: item.positionName || null,
    surname: item.surname || '',
    firstname: item.firstname || '',
    email: item.email || '',
    phone: item.phone || '',
    linkedin: item.linkedin || '',
    start_date: item.startDate || null,
    message: item.message || '',
    files: item.files || [],
    converted_to_candidate_id: item.convertedToCandidateId || null,
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

function formatSupabaseError(err) {
  if (!err) return 'Neznámá chyba';
  const msg = err.message || '';
  const code = err.code ? ` [${err.code}]` : '';
  const details = err.details ? ` – ${err.details}` : '';
  const hint = err.hint ? ` (${err.hint})` : '';
  return msg + code + details + hint;
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
        throw new Error(formatSupabaseError(error));
      }
      return candidateRowToApp(data);
    }
    const { data, error } = await supabase.from('candidates').insert(row).select().single();
    if (error) {
      console.error('Supabase saveCandidate insert:', error);
      throw new Error(formatSupabaseError(error));
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

// --- Applications (Supabase nebo IndexedDB) ---
async function getAllApplications() {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('applications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(applicationRowToApp);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('applications').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return applicationRowToApp(data);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const row = applicationAppToRow(item);
    if (item.id) {
      const { data, error } = await supabase.from('applications').update(row).eq('id', item.id).select().single();
      if (error) throw error;
      return applicationRowToApp(data);
    }
    const { data, error } = await supabase.from('applications').insert(row).select().single();
    if (error) throw error;
    return applicationRowToApp(data);
  }
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
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from('applications').delete().eq('id', id);
    if (error) throw error;
    return;
  }
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
