-- Přidání chybějících sloupců do tabulky candidates (spusťte v Supabase SQL Editoru)
-- Pokud ukládání kandidáta hlásí chybu typu "column does not exist", spusťte tento skript.

-- cv_files (životopisy PDF)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_files JSONB;

-- Další pole z formuláře (Pohlaví, Měna, Pozn. ke mzdě, Datum nástupu, Jazyky, Potenciál)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS salary_currency TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS salary_note TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS languages TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS potential TEXT;
