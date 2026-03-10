/**
 * Načte Excel 00_Nábory_nové, aplikuje pravidla a vyplní výstupní XLS pro import.
 *
 * Pravidla:
 * - Kontakt: obsahuje @ → email, zbytek → telefon; u telefonu odstranit předvolbu 420 a +420
 * - Plat: rozsah s pomlčkou (20-30000) → horní hranice (30000); 20 → 20 000 Kč, 35K → 35 000 Kč
 * - Všichni kandidáti: status Odmítnuto; "možná příště" → zaškrtnuté sledování + důvod odmítnutí
 * - Poznámky: datuma zachovat
 *
 * Použití: node scripts/fill-import-from-nabory.js [cesta-k-00_Nábory_nové.xlsx]
 * Výstup: import-kandidatu-vyplneno.xlsx (v kořeni projektu)
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_EXCEL_PATH = path.join(process.env.HOME || '', 'Desktop', '00_Nábory_nové (od r.2023).xlsx');
const excelPath = process.argv[2] || DEFAULT_EXCEL_PATH;
const outputPath = path.join(__dirname, '..', 'import-kandidatu-vyplneno.xlsx');

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

/** Rozdělí kontakt: jen e-maily (s @) a jen čísla do telefonu. Žádný text (Email, telefon: atd.). */
function splitContact(contactStr) {
  if (!contactStr || !String(contactStr).trim()) return { email: '', phone: '' };
  const s = String(contactStr).trim();
  const emails = [];
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  let m;
  while ((m = emailRegex.exec(s)) !== null) emails.push(m[0]);
  const phoneNumbers = new Set();
  const digitBlocks = s.replace(/[\w.-]+@[\w.-]+\.\w+/g, ' ').match(/\d[\d\s]{5,}/g) || [];
  for (const block of digitBlocks) {
    const digits = block.replace(/\D/g, '');
    if (digits.length >= 6) {
      const without420 = digits.replace(/^420/, '');
      if (without420) phoneNumbers.add(without420);
    }
  }
  const withPlus = s.match(/\+[\d\s]{8,}/g) || [];
  for (const block of withPlus) {
    const digits = block.replace(/\D/g, '');
    if (digits.length >= 6) {
      const without420 = digits.startsWith('420') ? digits.slice(3) : digits;
      if (without420) phoneNumbers.add(without420);
    }
  }
  return {
    email: [...new Set(emails)].join(', '),
    phone: [...phoneNumbers].join(', ')
  };
}

/** Normalizuje plat: rozsah → horní hranice; 20 → 20 000 Kč; 35K → 35 000 Kč; vše v Kč. */
function normalizeSalary(raw) {
  if (!raw || !String(raw).trim()) return '';
  const s = String(raw).trim();
  const dashRange = /^(\d+(?:\s*\d{3})?)\s*-\s*(\d+(?:\s*\d{3})?)\s*(?:K?|Kč)?$/i.exec(s)
    || /^(\d+)\s*-\s*(\d+)\s*(?:K?|Kč)?$/i.exec(s);
  if (dashRange) {
    let upper = dashRange[2].replace(/\s/g, '');
    const u = parseInt(upper, 10);
    if (u > 0 && u < 1000) upper = String(u * 1000);
    return upper ? `${upper} Kč` : '';
  }
  const kMatch = /(\d+)\s*k$/i.exec(s);
  if (kMatch) return `${parseInt(kMatch[1], 10) * 1000} Kč`;
  let num = s.replace(/\s/g, '').replace(/[^\d]/g, '');
  if (!num) return s;
  const n = parseInt(num, 10);
  if (n < 1000 && n > 0) return `${n * 1000} Kč`;
  return `${num} Kč`;
}

/** Je stav "možná příště"? */
function isMoznaPriste(stageRaw) {
  if (!stageRaw) return false;
  const t = String(stageRaw).toLowerCase().replace(/\s+/g, ' ');
  return t.includes('možná příště') || t.includes('mozna priste') || t.includes('možná příste');
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
  const idxPrvniInterakce = findColIndex(headers, 'První interakce');
  const idxPoznamky = findColIndex(headers, 'Poznámky');
  const idxKolo1 = findColIndex(headers, '1. kolo');
  const idxKolo2 = findColIndex(headers, '2. kolo') >= 0 ? findColIndex(headers, '2. kolo') : findColIndex(headers, '2.kolo');
  const idxKolo3 = findColIndex(headers, '3. kolo');
  const idxUkol = findColIndex(headers, 'Úkol');
  const idxDuvod = findColIndexFuzzy(headers, 'Důvod odmítnutí', 'Důvod zamítnutí');
  const idxPlat = findColIndexFuzzy(headers, 'Plat');
  const idxContract = findColIndexFuzzy(headers, 'HPP x IČO', 'HPP');
  const idxPosition = findColIndexFuzzy(headers, 'Jakou pozici nakonec?', 'Jakou pozici');
  const idxStage = findColIndexFuzzy(headers, 'Stav', 'Fáze', 'Status');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const surname = idxSurname >= 0 ? safeVal(row[idxSurname]) : '';
    const firstname = idxFirstname >= 0 ? safeVal(row[idxFirstname]) : '';
    const emailCol = idxEmail >= 0 ? safeVal(row[idxEmail]) : '';
    const contactCol = idxContact >= 0 ? safeVal(row[idxContact]) : '';
    const phoneCol = idxPhone >= 0 ? safeVal(row[idxPhone]) : '';

    if (!surname && !firstname && !emailCol && !contactCol && !phoneCol) continue;

    const combinedContact = [contactCol, phoneCol, emailCol].filter(Boolean).join(' ');
    const { email: splitEmail, phone: splitPhone } = splitContact(combinedContact);
    const email = emailCol || splitEmail;
    const phone = phoneCol || splitPhone;

    const stageRaw = idxStage >= 0 ? safeVal(row[idxStage]) : '';
    const watch = isMoznaPriste(stageRaw);
    const duvodRaw = idxDuvod >= 0 ? safeVal(row[idxDuvod]) : '';
    const duvodOdmitnuti = duvodRaw || (watch ? 'Možná příště' : 'Odmítnuto');

    const platRaw = idxPlat >= 0 ? safeVal(row[idxPlat]) : '';
    const plat = normalizeSalary(platRaw);

    candidates.push({
      surname,
      firstname,
      email,
      phone,
      linkedin: idxLinkedIn >= 0 ? safeVal(row[idxLinkedIn]) : '',
      source: idxSource >= 0 ? safeVal(row[idxSource]) : '',
      positionName: defaultPositionName || (idxPosition >= 0 ? safeVal(row[idxPosition]) : ''),
      stage: 'zamitnut',
      plat,
      contract: idxContract >= 0 ? safeVal(row[idxContract]) : '',
      prvniInterakce: idxPrvniInterakce >= 0 ? safeVal(row[idxPrvniInterakce]) : '',
      notes: idxPoznamky >= 0 ? safeVal(row[idxPoznamky]) : '',
      kolo1: idxKolo1 >= 0 ? safeVal(row[idxKolo1]) : '',
      kolo2: idxKolo2 >= 0 ? safeVal(row[idxKolo2]) : '',
      kolo3: idxKolo3 >= 0 ? safeVal(row[idxKolo3]) : '',
      ukol: idxUkol >= 0 ? safeVal(row[idxUkol]) : '',
      rejectionReason: duvodOdmitnuti,
      watch
    });
  }
  return candidates;
}

const OUT_HEADERS = [
  'Příjmení', 'Jméno', 'E-mail', 'Telefon', 'LinkedIn', 'Zdroj', 'Pozice', 'Fáze / stav',
  'Plat', 'HPP / IČO', 'První interakce (datum)', 'Poznámky', '1. kolo', '2. kolo', '3. kolo', 'Úkol', 'Důvod odmítnutí', 'Sledovat'
];

function main() {
  if (!fs.existsSync(excelPath)) {
    console.error('Soubor nenalezen:', excelPath);
    process.exit(1);
  }

  console.log('Čtu:', excelPath);
  const workbook = XLSX.readFile(excelPath);

  const allCandidates = [];
  for (const sheetName of workbook.SheetNames) {
    if (sheetName === 'info' || sheetName === 'Kurzy oslovení') continue;
    const posName = SHEET_TO_POSITION[sheetName] !== undefined ? SHEET_TO_POSITION[sheetName] : null;
    if (SHEET_TO_POSITION[sheetName] === undefined) continue;
    const list = parseDataSheet(workbook, sheetName, posName);
    allCandidates.push(...list);
  }

  const rows = [
    OUT_HEADERS,
    ...allCandidates.map(c => [
      c.surname,
      c.firstname,
      c.email,
      c.phone,
      c.linkedin,
      c.source,
      c.positionName || '',
      'Odmítnuto',
      c.plat,
      c.contract,
      c.prvniInterakce,
      c.notes,
      c.kolo1,
      c.kolo2,
      c.kolo3,
      c.ukol,
      c.rejectionReason,
      c.watch ? 'Ano' : ''
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kandidáti');
  XLSX.writeFile(wb, outputPath);

  console.log('Hotovo. Zapsáno do', outputPath);
  console.log('Kandidátů:', allCandidates.length);
  console.log('Sledovat (možná příště):', allCandidates.filter(c => c.watch).length);
}

main();
