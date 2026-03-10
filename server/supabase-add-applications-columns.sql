-- ============================================================
-- Přihlášky (applications): sloupce + RLS pro anonymní odeslání
-- Spusťte v Supabase: SQL Editor → vložit a Run (celý blok).
-- ============================================================

ALTER TABLE applications ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contract TEXT;

-- Oprávnění: anon smí INSERT a SELECT (SELECT kvůli .insert().select().single())
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT ON applications TO anon;
GRANT SELECT ON applications TO anon;

-- RLS
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Odstranit všechny staré politiky pro applications (aby nic neblokovalo)
DROP POLICY IF EXISTS "anon insert applications" ON applications;
DROP POLICY IF EXISTS "public insert applications" ON applications;
DROP POLICY IF EXISTS "anon full applications" ON applications;
DROP POLICY IF EXISTS "authenticated full access applications" ON applications;

-- Anon: smí vkládat a číst (čtení jen kvůli vrácení řádku po INSERT)
CREATE POLICY "anon full applications"
  ON applications FOR ALL TO anon USING (true) WITH CHECK (true);

-- Přihlášení uživatelé smí vše
CREATE POLICY "authenticated full access applications"
  ON applications FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
