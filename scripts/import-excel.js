/**
 * Načte Excel (00_Nábory_nové) a vyexportuje seed-data.json pro načtení do HR aplikace.
 * Použití: node scripts/import-excel.js [cesta-k-souboru.xlsx]
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_EXCEL_PATH = path.join(process.env.HOME || '', 'Desktop', '00_Nábory_nové (od r.2023).xlsx');
const excelPath = process.argv[2] || DEFAULT_EXCEL_PATH;
const outputPath = path.join(__dirname, '..', 'seed-data.json');

const SHEET_TO_POSITION = {
  'PPC': 'PPC Specialista',
  'social': 'Social Ads Specialista',
  'DATA': 'DATA specialista',
  'Account Manager': 'Account Manager',
  'RTB specialista': 'RTB specialista',
  '✅Business Manager': 'Business Manager',
  'Business Manager': 'Business Manager',
  '✅Office Manager': 'Office Manager',
  'Office Manager': 'Office Manager',
  'Nezařaditelní': null,
  'Kurzy oslovení': null
};

const INFO_POSITIONS = [
  { name: 'PPC Specialista', status: 'uzavreno', notes: 'update: 9.1.2024 - aktivně nehledáme' },
  { name: 'Social Ads Specialista', status: 'otevreno', notes: 'hledáme' },
  { name: 'Account Manager', status: 'otevreno', notes: '' },
  { name: 'Business Manager', status: 'uzavreno', notes: 'přijat = Tomáš Mulač (1.8.2023)' },
  { name: 'Office Manager', status: 'uzavreno', notes: 'přijata = Kateřina Platil Salingerová (1.5.2023)' },
  { name: 'RTB specialista', status: 'uzavreno', notes: 'nehledáme aktivně' },
  { name: 'DATA specialista', status: 'uzavreno', notes: 'update: 9.1.2024 plný kapacity' }
];

function safeVal(cell) {
  if (cell == null) return '';
  if (typeof cell === 'object' && cell.v != null) return String(cell.v).trim();
  return String(cell).trim();
}

function findColIndex(headers, name) {
  const needle = name.toLowerCase();
  return headers.findIndex(h => (h || '').toLowerCase() === needle);
}

function findColIndexFuzzy(headers, ...names) {
  for (const name of names) {
    const exact = findColIndex(headers, name);
    if (exact >= 0) return exact;
  }
  const normalized = headers.map(h => (h || '').trim().toLowerCase());
  for (const name of names) {
    const idx = normalized.findIndex(h => h.includes(name.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeStage(text) {
  if (!text) return 'nova_prihlaska';
  const t = text.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[áä]/g, 'a')
    .replace(/[éě]/g, 'e')
    .replace(/[í]/g, 'i')
    .replace(/[ó]/g, 'o')
    .replace(/[úů]/g, 'u')
    .replace(/[č]/g, 'c')
    .replace(/[ř]/g, 'r')
    .replace(/[š]/g, 's')
    .replace(/[ž]/g, 'z');
  const stageMap = {
    'osloven': 'osloven', 'osloven_a': 'osloven', 'osloven/a': 'osloven',
    'zadost': 'zadost', 'zadost_o_pozici': 'zadost',
    'zaslan_dotaznik': 'dotaznik', 'dotaznik': 'dotaznik',
    'cekam': 'cekam', 'cekam_na_odpoved': 'cekam',
    'rozhovor': 'rozhovor',
    'druhe_kolo': 'druhe_kolo',
    'nabidka': 'nabidka',
    'prijat': 'prijat',
    'zamitnut': 'zamitnut',
    'uzavreno': 'zamitnut'
  };
  return stageMap[t] || (t ? t : 'nova_prihlaska');
}

function parseDataSheet(workbook, sheetName, defaultPositionName) {
  const candidates = [];
  if (!workbook.SheetNames.includes(sheetName)) return candidates;
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) return candidates;

  const headers = rows[0].map(h => safeVal(h));

  const idxSurname = findColIndexFuzzy(headers, 'Příjmení', 'příjmení');
  const idxFirstname = findColIndexFuzzy(headers, 'Jméno', 'jméno');
  const idxEmail = findColIndexFuzzy(headers, 'e-mail', 'email');
  const idxContact = findColIndexFuzzy(headers, 'Kontakt', 'kontakt');
  const idxPhone = findColIndex(headers, 'telefon');
  const idxLinkedIn = findColIndexFuzzy(headers, 'LinkedIn', 'linkedin');
  const idxSource = findColIndexFuzzy(headers, 'Zdroj', 'zdroj');

  // Dva samostatné sloupce pro poznámky
  const idxPrvniInterakce = findColIndex(headers, 'První interakce');
  const idxPoznamky = findColIndex(headers, 'Poznámky');

  // Sloupce s dalšími zápisky (kola pohovorů, úkol, důvod)
  const idxKolo1 = findColIndex(headers, '1. kolo');
  const idxKolo2 = findColIndex(headers, '2.kolo') >= 0 ? findColIndex(headers, '2.kolo') : findColIndex(headers, '2. kolo');
  const idxKolo3 = findColIndex(headers, '3. kolo');
  const idxUkol = findColIndex(headers, 'Úkol');
  const idxDuvod = findColIndexFuzzy(headers, 'Důvod odmítnutí', 'Důvod zamítnutí');

  const idxPlat = findColIndexFuzzy(headers, 'Plat');
  const idxContract = findColIndexFuzzy(headers, 'HPP x IČO', 'HPP');
  const idxPosition = findColIndexFuzzy(headers, 'Jakou pozici nakonec?', 'Jakou pozici');
  const idxStage = findColIndexFuzzy(headers, 'Stav', 'Fáze', 'Status');

  console.log(`  [${sheetName}] headers: ${headers.join(' | ')}`);
  console.log(`    idxPrvniInterakce=${idxPrvniInterakce}, idxPoznamky=${idxPoznamky}, idxKolo1=${idxKolo1}, idxDuvod=${idxDuvod}`);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const surname = idxSurname >= 0 ? safeVal(row[idxSurname]) : '';
    const firstname = idxFirstname >= 0 ? safeVal(row[idxFirstname]) : '';
    const email = idxEmail >= 0 ? safeVal(row[idxEmail]) : '';
    const contact = idxContact >= 0 ? safeVal(row[idxContact]) : '';
    const phone = idxPhone >= 0 ? safeVal(row[idxPhone]) : '';
    if (!surname && !firstname && !email && !contact && !phone) continue;

    const prvniInterakce = idxPrvniInterakce >= 0 ? safeVal(row[idxPrvniInterakce]) : '';
    const poznamky = idxPoznamky >= 0 ? safeVal(row[idxPoznamky]) : '';
    const kolo1 = idxKolo1 >= 0 ? safeVal(row[idxKolo1]) : '';
    const kolo2 = idxKolo2 >= 0 ? safeVal(row[idxKolo2]) : '';
    const kolo3 = idxKolo3 >= 0 ? safeVal(row[idxKolo3]) : '';
    const ukol = idxUkol >= 0 ? safeVal(row[idxUkol]) : '';
    const duvod = idxDuvod >= 0 ? safeVal(row[idxDuvod]) : '';
    const stage = idxStage >= 0 ? normalizeStage(safeVal(row[idxStage])) : 'nova_prihlaska';
    const phoneVal = phone || contact;

    candidates.push({
      surname,
      firstname,
      email,
      phone: phoneVal,
      linkedin: idxLinkedIn >= 0 ? safeVal(row[idxLinkedIn]) : '',
      source: idxSource >= 0 ? safeVal(row[idxSource]) : '',
      prvniInterakce,
      notes: poznamky,
      kolo1,
      kolo2,
      kolo3,
      ukol,
      rejectionReason: duvod,
      salary: idxPlat >= 0 ? safeVal(row[idxPlat]) : '',
      contract: idxContract >= 0 ? safeVal(row[idxContract]) : '',
      positionName: defaultPositionName || (idxPosition >= 0 ? safeVal(row[idxPosition]) : ''),
      stage
    });
  }
  return candidates;
}

function main() {
  if (!fs.existsSync(excelPath)) {
    console.error('Soubor nenalezen:', excelPath);
    process.exit(1);
  }

  console.log('Čtu:', excelPath);
  const workbook = XLSX.readFile(excelPath);

  const positions = INFO_POSITIONS.map((p, i) => ({
    id: 'pos_' + (i + 1),
    name: p.name,
    status: p.status,
    notes: p.notes || ''
  }));

  const positionByName = {};
  positions.forEach(p => { positionByName[p.name] = p.id; });

  const allCandidates = [];

  for (const sheetName of workbook.SheetNames) {
    const posName = SHEET_TO_POSITION[sheetName] !== undefined ? SHEET_TO_POSITION[sheetName] : null;
    if (sheetName === 'info' || sheetName === 'Kurzy oslovení') continue;
    if (SHEET_TO_POSITION[sheetName] === undefined) continue;
    const list = parseDataSheet(workbook, sheetName, posName);
    list.forEach(c => {
      c.positionId = (c.positionName && positionByName[c.positionName]) || (posName && positionByName[posName]) || null;
      delete c.positionName;
      allCandidates.push(c);
    });
  }

  const seed = {
    positions,
    candidates: allCandidates,
    exportedAt: new Date().toISOString()
  };

  fs.writeFileSync(outputPath, JSON.stringify(seed, null, 2), 'utf8');
  console.log('\nHotovo. Zapsáno do', outputPath);
  console.log('Pozic:', positions.length, '| Kandidátů:', allCandidates.length);

  const withNotes = allCandidates.filter(c => c.notes && c.notes.trim());
  console.log('S poznámkami:', withNotes.length, '| Bez:', allCandidates.length - withNotes.length);
}

main();
