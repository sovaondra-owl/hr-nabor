/**
 * Vygeneruje šablonu pro import kandidátů (XLSX) do souboru v repo.
 * Hlavičky odpovídají přiřazení v aplikaci (Import → Přiřazení sloupců).
 *
 * Použití: node scripts/build-import-template.js
 * Výstup: sablona-import-kandidatu.xlsx (v kořeni projektu)
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Stejné hlavičky jako v app.js (IMPORT_FIELD_OPTIONS bez Neimportovat a Kontakt smíšený)
const HEADERS = [
  'Příjmení',
  'Jméno',
  'E-mail',
  'Telefon',
  'LinkedIn',
  'Zdroj',
  'Pozice',
  'Fáze / stav',
  'Plat',
  'HPP / IČO',
  'První interakce (datum)',
  'Poznámky',
  '1. kolo',
  '2. kolo',
  '3. kolo',
  'Úkol',
  'Důvod odmítnutí',
];

const outPath = path.join(__dirname, '..', 'sablona-import-kandidatu.xlsx');
const sheetData = [HEADERS];
const ws = XLSX.utils.aoa_to_sheet(sheetData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Kandidáti');
XLSX.writeFile(wb, outPath);
console.log('Šablona uložena:', outPath);
console.log('Sloupce:', HEADERS.join(', '));
