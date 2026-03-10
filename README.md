# HR Nábor – náborový modul a job stránka

Aplikace pro správu náboru kandidátů, pozic a přihlášek z veřejné job stránky. Data se ukládají v prohlížeči (IndexedDB).

**Zabezpečení:** Návrh přihlášení, rolí, pozvánek a hesel je v [docs/NAVRH-ZABEZPECENI.md](docs/NAVRH-ZABEZPECENI.md). Backend API (Express) je ve složce [server/](server/) – přihlášení, reset hesla, nastavení hesla z pozvánky, role admin/manager/recruiter/viewer.

---

## Changelog (historie změn)

### v12 — Migrace email/telefon, řazení sloupců kliknutím (9. 3. 2026)

**Co se změnilo:**
- **Automatická migrace kontaktů** — při prvním spuštění aplikace proběhne jednorázová migrace: u všech existujících kandidátů se pole „Telefon / Kontakt" projde a e-maily se přesunou do sloupce E-mail, telefonní čísla zůstanou v Telefonu. Zároveň se konvertují Excelová sériová čísla v „První interakce" na čitelné datum. Migrace proběhne jen jednou (flag v `localStorage`).
- **Řazení sloupců kliknutím** — hlavička tabulky kandidátů je nyní klikací. Kliknutím na název sloupce se řadí A→Z, dalším klikem Z→A. Aktivní řazení je vizuálně zvýrazněno indigo šipkou. Neaktivní sloupce mají šedou obousměrnou šipku.
- Sloupec přejmenován z „Telefon / Kontakt" na „Telefon".

**Změněné soubory:**
- `app.js` — nová funkce `migrateContactFields()` volaná v `init()`, nové funkce `sortArrow()`, `toggleSort()`, `applySorting()`, sort state proměnné `sortColumn`/`sortDirection`. Přidány `sortVal` funkce ke všem sloupcům v `ALL_COLUMNS`. Aktualizován `renderCandidates()` pro klikací hlavičky.

**Jak vrátit zpět:**
Obnovit `app.js` z verze v11. Smazat `hr_migration_contact_split_v1` z localStorage pro opětovnou migraci.

---

### v11 — Přidání kandidáta ze screenshotu (AI Vision) + nová pole kandidáta (9. 3. 2026)

**Co se změnilo:**
- **Přidání ze screenshotu** — nové tlačítko „Ze screenshotu" v sekci Kandidáti. Otevře modal, kam lze nahrát screenshoty (drag & drop, klik, Ctrl+V vložení z clipboardu). Systém pošle obrázky na OpenAI GPT-4o Vision API, rozpozná data uchazeče a vyplní formulář. Uživatel data zkontroluje, upraví a uloží jako nového kandidáta.
- **OpenAI API klíč** — ukládá se v `localStorage` prohlížeče. Klíč se odesílá pouze na OpenAI API.
- **Nová pole kandidáta** (inspirovaná screenshoty z ATS systému):
  - `gender` (Pohlaví) — Muž / Žena
  - `salary` + `salaryCurrency` (Plat + Měna) — oddělená měna (CZK, EUR, USD)
  - `salaryNote` (Poznámka ke mzdě) — HPP, IČO apod.
  - `startDate` (Datum nástupu) — volný text
  - `languages` (Jazyky) — jazykové úrovně
  - `potential` (Potenciál uchazeče) — Perspektivní / Průměrný / Nevhodný
- Nová pole jsou ve formuláři pro editaci, v detailu kandidáta, v konfiguraci sloupců tabulky.

**Změněné soubory:**
- `index.html` — nový modal `modal-screenshot` (drop zone, API key, formulář rozpoznaných dat, uložit), tlačítko „Ze screenshotu", rozšířený formulář `modal-candidate` o nová pole.
- `app.js` — nové funkce: `initScreenshotModal()`, `addScreenshots()`, `renderScreenshotPreviews()`, `analyzeScreenshots()`, `fillScreenshotForm()`, `saveFromScreenshot()`, `openScreenshotModal()`. Rozšířeny: `ALL_COLUMNS`, `CANDIDATE_FIELDS`, `openCandidateDetail()`.

**Jak vrátit zpět:**
Obnovit `app.js` a `index.html` z verze v10. Nová pole v IndexedDB se ignorují automaticky (bez migrace).

---

### v10 — Oprava fází: rozšířené mapování, dynamický filtr, oprava překrývání sekcí (9. 3. 2026)

**Co se změnilo:**
- **Oprava překrývání sekcí** — Tailwind CDN třída `flex` přepisovala CSS `.view { display: none }`. Přidáno `!important` k pravidlům `.view` a `.view.view-active` v `styles.css`.
- **Rozšířené mapování fází při importu** — `normalizeStageImport()` nyní rozpoznává ~50 variant názvů fází (např. „posunuto_na_pozici" → „prijat", „SJ reakce" → „osloven", „odmítnuto" → „zamítnut" atd.).
- **Dynamický filtr fází** — select „Fáze" v tabulce kandidátů se nyní generuje dynamicky z dat. Každá fáze zobrazuje počet kandidátů v závorce, např. „Zamítnut (523)". Nestandardní fáze (které nejsou v STAGE_LABELS) se zobrazí odděleně s ⚠ ikonou.
- **Inline stage select — podpora neznámých fází** — pokud má kandidát nestandardní fázi, zobrazí se jako extra `<option>` s ⚠, místo aby se tiše přepnula na první standardní fázi.
- **Dashboard** — pipeline summary nyní ukazuje i nestandardní fáze (oranžové štítky s ⚠).

**Změněné soubory:**
- `app.js` — nová funkce `fillStageFilter()`, rozšířená `normalizeStageImport()`, upravený `renderStageSelect()`, `renderDashboard()`.
- `styles.css` — přidáno `!important` k `.view` pravidlům.
- `index.html` — odstraněny hardcoded stage options z `filter-stage` (nyní dynamické).

**Jak vrátit zpět:**
Obnovit `app.js`, `styles.css` a `index.html` z verze v9.

---

### v9 — Interaktivní tabulka: datum, email/telefon split, kopírování, inline fáze, editace poznámek (9. 3. 2026)

**Co se změnilo:**
- **První interakce** — Excel sériová čísla (45670, 45671…) se nyní automaticky převádějí na čitelné datum (č. formát, např. 1. 1. 2025). Konverze funguje jak při importu, tak při zobrazení existujících dat.
- **Telefon / Kontakt → Email + Telefon** — při importu se kombinované pole „Kontakt" (např. „721 599 620, klasanela@gmail.com") automaticky rozdělí: e-maily jdou do sloupce E-mail, telefonní čísla zůstávají v Telefonu.
- **Kopírování do schránky** — u polí E-mail a Telefon se v tabulce i v detailu kandidáta zobrazuje ikonka kopírování. Po kliknutí se hodnota zkopíruje a ikona krátce zezelená.
- **Fáze přímo v tabulce** — sloupec „Fáze" je nyní rozbalovací menu (`<select>`). Změna fáze se okamžitě uloží do databáze.
- **Editace poznámek z tabulky** — sloupce Poznámky, 1. kolo, 2. kolo, 3. kolo, Úkol a Důvod odmítnutí jsou klikací. Otevřou popup s textovým polem pro rychlou editaci a uložení.
- Nový modal `modal-notes` v `index.html` pro inline editaci poznámek.

**Změněné soubory:**
- `app.js` — nové funkce: `excelDateToString()`, `splitContactField()`, `renderCopyable()`, `renderStageSelect()`, `renderNotesCell()`, `openNotesModal()`, `saveNotesModal()`. Upraveny: `ALL_COLUMNS` rendery, `parseSheetToCandidates()`, `renderCandidates()`, `openCandidateDetail()`.
- `index.html` — nový modal `modal-notes` (textarea + uložit/zrušit).
- `README.md` — přidán v9 changelog.

**Jak vrátit zpět:**
Obnovit `app.js` a `index.html` z verze v8. Smazat modal `modal-notes` z `index.html`.

---

### v8 — Modern Clean / Soft UI redesign s Tailwind CSS (9. 3. 2026)

**Co se změnilo:**
- Kompletní vizuální přepis celé aplikace do stylu "Modern Clean / Soft UI" s Tailwind CSS (CDN).
- Font změněn z Plus Jakarta Sans na Inter.
- Sidebar: bílé pozadí (`bg-white`), jemný stín, aktivní položky s `bg-indigo-50 text-indigo-700`, SVG ikony místo Unicode symbolů.
- Karty a panely: čistě bílé, `rounded-xl`, `shadow-sm`, bez tvrdých borders, hover efekty s `shadow-md` a `border-indigo-100`.
- Pipeline (Kanban): karty s `group-hover:text-indigo-600`, měkké stíny, sloupce bez hard borders.
- Typografie: `text-slate-900` pro nadpisy, `text-slate-500` pro sekundární text, verzálkové štítky (`uppercase tracking-wider`).
- Badges: soft colors — `bg-indigo-50 text-indigo-600` (fáze), `bg-emerald-50 text-emerald-600` (přijat), `bg-slate-100 text-slate-500` (zamítnut).
- Tlačítka: `bg-indigo-600` s glow efektem `shadow-[0_2px_10px_-3px_rgba(79,70,229,0.5)]`.
- Vstupy: `focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400`.
- Tabulky: subtilní řádkové bordery (`border-slate-50`), hover `bg-indigo-50/40`.
- `styles.css` redukován na ~80 řádků (modal systém, view show/hide, drag states, scrollbar hiding).
- Veškerý dynamický HTML v `app.js` přepsán na Tailwind třídy (TW objekt pro opakované třídy).

**Změněné soubory:**
- `index.html` — kompletně přepsán s Tailwind třídami, SVG ikony, nový layout.
- `styles.css` — redukován na minimální CSS (modal, view, drag, scrollbar).
- `app.js` — TW objekt pro sdílené třídy, všechny `render*()` a `open*()` funkce aktualizovány.

**Jak vrátit zpět:**
Obnovit všechny tři soubory (`index.html`, `styles.css`, `app.js`) z verze v7.

---

### v7 — Import přímo ze souboru (XLS/XLSX/CSV) v prohlížeči (9. 3. 2026)

**Co se změnilo:**
- Odstraněna závislost na `seed-data.json` a Node.js skriptu `npm run import-excel`.
- Import nyní funguje jednorázově: nahrajete soubor → data se přečtou → soubor se uvolní.
- Nová sekce importu s drag & drop zónou (podporuje `.xlsx`, `.xls`, `.csv`).
- Při XLS/XLSX s více listy se zobrazí checkboxy pro výběr listů k importu.
- Náhled prvních 15 kandidátů před importem.
- Dvě tlačítka: **Nahradit vše** a **Aktualizovat – doplnit chybějící**.
- SheetJS knihovna (xlsx) se načítá z CDN (`cdn.sheetjs.com`), parsování probíhá v prohlížeči.

**Změněné soubory:**
- `index.html` — nový HTML pro import (file-drop zóna, výběr listů, náhled tabulka, dvě akční tlačítka).
- `app.js` — celá import sekce přepsána: `handleFileSelected()`, `buildPreview()`, `parseSheetToCandidates()`, `ensurePositionsFromCandidates()`, nahrazení a merge logika. Odstraněn `fetchSeedData()`, CSV mapping UI a `parseCSVLine()`.
- `styles.css` — nové styly: `.file-drop`, `.file-drop-icon`, `.import-file-info`, `.import-sheet-checks`, `.sheet-row-count`.

**Jak vrátit zpět:**
Obnovit `index.html` (sekce `#import`), `app.js` (sekce Import) a `styles.css` (file-drop styly) z verze v6.

---

### v6 — Přizpůsobitelné sloupce a detail kandidáta (9. 3. 2026)

**Co se změnilo:**
- Tabulka kandidátů má konfigurovatelné sloupce (tlačítko „Sloupce ▾" s dropdown checkboxy).
- Viditelnost sloupců se ukládá do `localStorage`.
- Kliknutí na řádek kandidáta otevře detail popup (`modal-candidate-detail`) s plným profilem (kontakt, poznámky, kola pohovorů, důvod odmítnutí).
- Z detailu lze přejít do editačního modálu tlačítkem „Upravit".
- Editační formulář (`modal-candidate`) rozšířen o pole: `prvniInterakce`, `notes`, `kolo1`, `kolo2`, `kolo3`, `ukol`, `rejectionReason`.

**Změněné soubory:**
- `index.html` — nový modal `modal-candidate-detail`, rozšířený `modal-candidate` formulář, dropdown pro sloupce.
- `app.js` — `ALL_COLUMNS` definice, `getVisibleColumns()`, `saveVisibleColumns()`, `renderColumnsDropdown()`, `openCandidateDetail()`, aktualizovaný `renderCandidates()` a `openCandidateModal()`.
- `styles.css` — styly pro `.columns-toggle-wrap`, `.columns-dropdown`, `.detail-header-bar`, `.detail-grid`, `.detail-field`, `.detail-section`, `.cell-truncate`.
- `scripts/import-excel.js` — parsování oddělených polí (kolo1, kolo2, kolo3, ukol, rejectionReason, prvniInterakce, notes).

---

### v5 — Oprava importu poznámek a merge import (9. 3. 2026)

**Co se změnilo:**
- `import-excel.js` opraven: poznámky z Excelu se nyní správně extrahují ze sloupce „Poznámky" (ne „První interakce").
- Přidány oddělené sloupce: `prvniInterakce`, `notes`, `kolo1`, `kolo2`, `kolo3`, `ukol`, `rejectionReason` do `seed-data.json`.
- Nové tlačítko „Aktualizovat – doplnit chybějící" (merge import) – doplní prázdná pole u existujících kandidátů z Excelu, nové kandidáty přidá.
- `normalizeStage()` rozšířen o mapování `uzavreno` → `zamitnut`.

**Změněné soubory:**
- `scripts/import-excel.js` — vylepšený parsing, oddělené sloupce.
- `index.html` — dvě tlačítka importu (nahradit / aktualizovat).
- `app.js` — `btn-merge-seed` handler s merge logikou.

---

### v4 — Export do Google Sheets (9. 3. 2026)

**Co se změnilo:**
- Nová sekce „Export do Google Sheets" v sidebar.
- Uživatel vloží URL Google Apps Script Web App, uloží ho (localStorage).
- Tlačítko „Exportovat" odešle všechna data kandidátů jako JSON POST request.
- Obsahuje kopírovatelný kód Apps Script pro nasazení.
- Export zahrnuje 17 sloupců (příjmení, jméno, e-mail, telefon, LinkedIn, pozice, fáze, zdroj, plat, HPP/IČO, první interakce, poznámky, 1.–3. kolo, úkol, důvod odmítnutí).

**Změněné soubory:**
- `index.html` — sekce `#export` s nastavením a tlačítky.
- `app.js` — `initExport()`, `btn-export-gsheet` handler, `btn-save-gsheet-url`, `btn-copy-script`.
- `styles.css` — styly pro export sekci.

---

### v3 — Import dat z Excelu přes Node.js skript (9. 3. 2026)

**Co se změnilo:**
- Node.js skript `scripts/import-excel.js` parsuje `.xlsx` soubor a generuje `seed-data.json`.
- `seed-data.json` obsahuje pozice a kandidáty.
- Tlačítko „Nahradit vše daty z Excelu" v sekci Import.
- CSV import s manuálním mapováním sloupců.

**Změněné soubory:**
- `scripts/import-excel.js` — nový soubor.
- `package.json` — závislost `xlsx`, skript `import-excel`.
- `index.html` — sekce Import.
- `app.js` — `fetchSeedData()`, CSV import logika.

---

### v2 — Moderní ATS design a pipeline (9. 3. 2026)

**Co se změnilo:**
- Kompletní redesign: sidebar navigace, nový font (Plus Jakarta Sans), nová barevná paleta.
- Dashboard s KPI kartami a pipeline summary.
- Kanban pipeline view s drag & drop pro přesun kandidátů mezi fázemi.
- Přepínání Tabulka / Pipeline pohled.
- Pozice jako karty místo tabulky.

**Změněné soubory:**
- `index.html` — sidebar layout, dashboard KPI, pipeline board, view toggle.
- `styles.css` — kompletní přepis (sidebar, KPI, pipeline, karty).
- `app.js` — `renderPipeline()`, drag & drop handlery, `renderPipelineIfActive()`, `getCandidateViewMode()`.

---

### v1 — Základní HR aplikace + job stránka (9. 3. 2026)

**Co se změnilo:**
- Základní CRUD pro pozice a kandidáty.
- IndexedDB databáze (`db.js`) s tabulkami `positions`, `candidates`, `applications`.
- Veřejná job stránka (`job-page.html`) s formulářem a nahráváním souborů.
- Přihlášky z webu s možností převodu na kandidáta.
- Pipeline fáze náboru (10 stavů).

**Soubory:**
- `index.html`, `app.js`, `db.js`, `styles.css` — interní HR.
- `job-page.html`, `job-page.js`, `job-page.css` — veřejná stránka.

---

## Spuštění

1. Otevřete v prohlížeči soubor **`index.html`** (interní HR rozhraní).
2. Job stránku pro kandidáty otevřete jako **`job-page.html`** nebo přes odkaz „Job stránka" v menu.

Doporučení: pro spolehlivé sdílení dat mezi `index.html` a `job-page.html` používejte stejný origin (např. lokální server).

### Lokální server

```bash
# Python 3
python3 -m http.server 8080

# nebo npx
npx serve .
```

Potom otevřete: `http://localhost:8080` a `http://localhost:8080/job-page.html`.

## Funkce

### Interní HR aplikace (index.html)

- **Dashboard** – přehled otevřených pozic, počty kandidátů a přihlášek, pipeline podle fáze.
- **Kandidáti** – tabulka s konfigurovatelné sloupce, vyhledávání, filtry (pozice, fáze), Kanban pipeline s drag & drop. Detail kandidáta s popup oknem.
- **Pozice** – přidání a úprava pozic, stav Otevřeno / Uzavřeno.
- **Přihlášky z webu** – seznam přihlášek z job stránky, detail včetně stažení souborů, převod na kandidáta.
- **Import** – nahrání XLS/XLSX/CSV souboru přímo v prohlížeči, výběr listů, náhled, nahrazení nebo merge.
- **Export** – export kandidátů do Google Sheets přes Apps Script.

### Job stránka (job-page.html)

- Výběr **otevřené pozice** (načteno z databáze).
- **Formulář**: jméno, příjmení, e-mail, telefon, LinkedIn, zpráva.
- **Soubory pro nábor**: životopis (povinný), další dokumenty (volitelně).
- **Dokumenty pro nástup** (volitelně) – např. kopie dokladu, bankovní spojení.

## Fáze náboru (pipeline)

Nová přihláška → Osloven/a → Žádost o pozici → Zaslán dotazník → Čekám na odpověď → Rozhovor → Druhé kolo → Nabídka → Přijat / Zamítnut

## Soubory

- `index.html` – hlavní HR rozhraní
- `app.js` – logika HR aplikace (kandidáti, pozice, import, export, pipeline)
- `db.js` – IndexedDB wrapper (pozice, kandidáti, přihlášky) + STAGE_LABELS
- `styles.css` – styly pro HR rozhraní
- `job-page.html` – veřejná kariérní stránka
- `job-page.js` – formulář a odeslání přihlášky
- `job-page.css` – styly job stránky
- `scripts/import-excel.js` – (volitelný) Node.js skript pro offline parsing Excelu

## Poznámka

Aplikace běží celá v prohlížeči. Pro produkční nasazení s více uživateli a trvalým uložením souborů je vhodné doplnit backend (API + databáze + úložiště souborů).
