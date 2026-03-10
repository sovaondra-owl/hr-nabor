-- ============================================================
-- HR Nábor – kompletní schéma pro Supabase (profiles + candidates + positions + openings + applications)
-- Spusťte v Supabase: SQL Editor → vložit a Run.
-- ============================================================

-- ---------- 1. Tabulka profilů (propojená s auth.users) ----------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin','manager','recruiter','viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Čtení vlastního profilu (každý vidí jen svůj řádek)
DROP POLICY IF EXISTS "read own profile" ON profiles;
CREATE POLICY "read own profile"
  ON profiles FOR SELECT
  USING ( auth.uid() = id );

-- Odstranění problematické policy (způsobovala 500)
DROP POLICY IF EXISTS "admin read all profiles" ON profiles;


-- ---------- 2. Tabulka kandidátů ----------
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id TEXT,
  stage TEXT NOT NULL DEFAULT 'nova_prihlaska',
  surname TEXT,
  firstname TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  source TEXT,
  salary TEXT,
  contract TEXT,
  prvni_interakce TEXT,
  notes TEXT,
  kolo1 TEXT,
  kolo2 TEXT,
  kolo3 TEXT,
  ukol TEXT,
  rejection_reason TEXT,
  watch BOOLEAN NOT NULL DEFAULT false,
  gender TEXT,
  salary_currency TEXT,
  salary_note TEXT,
  start_date TEXT,
  languages TEXT,
  potential TEXT,
  cv_files JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_position_id ON candidates(position_id);
CREATE INDEX IF NOT EXISTS idx_candidates_stage ON candidates(stage);
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- Přihlášení uživatelé mohou číst a měnit kandidáty
DROP POLICY IF EXISTS "authenticated full access candidates" ON candidates;
CREATE POLICY "authenticated full access candidates"
  ON candidates FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE candidates IS 'Kandidáti z importu XLS a z aplikace HR Nábor';


-- ---------- 3. Tabulka pozic ----------
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT,
  notes TEXT,
  merged_into_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_merged_into_id ON positions(merged_into_id);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access positions" ON positions;
CREATE POLICY "authenticated full access positions"
  ON positions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Job stránka: anonymní čtení (pro zobrazení názvů pozic)
DROP POLICY IF EXISTS "anon read positions" ON positions;
CREATE POLICY "anon read positions"
  ON positions FOR SELECT TO anon USING (true);


-- ---------- 4. Tabulka výběrových řízení ----------
CREATE TABLE IF NOT EXISTS openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'aktivni',
  description TEXT,
  workload TEXT,
  required_skills TEXT,
  required_software TEXT,
  collaboration_type TEXT,
  opened_at DATE,
  public_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE openings ADD COLUMN IF NOT EXISTS workload TEXT;
ALTER TABLE openings ADD COLUMN IF NOT EXISTS required_skills TEXT;
ALTER TABLE openings ADD COLUMN IF NOT EXISTS required_software TEXT;
ALTER TABLE openings ADD COLUMN IF NOT EXISTS collaboration_type TEXT;

CREATE INDEX IF NOT EXISTS idx_openings_status ON openings(status);
CREATE INDEX IF NOT EXISTS idx_openings_public_slug ON openings(public_slug);
CREATE INDEX IF NOT EXISTS idx_openings_position_id ON openings(position_id);

ALTER TABLE openings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access openings" ON openings;
CREATE POLICY "authenticated full access openings"
  ON openings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Job stránka: anonymní čtení pouze aktivních výběrových řízení
DROP POLICY IF EXISTS "anon read active openings" ON openings;
CREATE POLICY "anon read active openings"
  ON openings FOR SELECT TO anon USING (status = 'aktivni');


-- ---------- 5. Sloupec opening_id u kandidátů (pro filtr) ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidates' AND column_name = 'opening_id'
  ) THEN
    ALTER TABLE candidates ADD COLUMN opening_id UUID REFERENCES openings(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_candidates_opening_id ON candidates(opening_id);
  END IF;
END $$;


-- ---------- 5b. Sloupec cv_files u kandidátů (životopisy PDF) ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidates' AND column_name = 'cv_files'
  ) THEN
    ALTER TABLE candidates ADD COLUMN cv_files JSONB;
  END IF;
END $$;
COMMENT ON COLUMN candidates.cv_files IS 'Životopisy (PDF) – pole objektů { name, data } s base64 obsahem';


-- ---------- 5c. Sloupce gender, salary_currency, salary_note, start_date, languages, potential ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'gender') THEN
    ALTER TABLE candidates ADD COLUMN gender TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'salary_currency') THEN
    ALTER TABLE candidates ADD COLUMN salary_currency TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'salary_note') THEN
    ALTER TABLE candidates ADD COLUMN salary_note TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'start_date') THEN
    ALTER TABLE candidates ADD COLUMN start_date TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'languages') THEN
    ALTER TABLE candidates ADD COLUMN languages TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'potential') THEN
    ALTER TABLE candidates ADD COLUMN potential TEXT;
  END IF;
END $$;


-- ---------- 6. Tabulka přihlášek (job stránka) ----------
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id UUID REFERENCES openings(id) ON DELETE SET NULL,
  position_id TEXT,
  surname TEXT,
  firstname TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  start_date TEXT,
  position_name TEXT,
  message TEXT,
  files JSONB,
  converted_to_candidate_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS start_date TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contract TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_opening_id ON applications(opening_id);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access applications" ON applications;
CREATE POLICY "authenticated full access applications"
  ON applications FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Job stránka: anonymní uživatel může pouze odeslat přihlášku (INSERT)
DROP POLICY IF EXISTS "anon insert applications" ON applications;
CREATE POLICY "anon insert applications"
  ON applications FOR INSERT TO anon WITH CHECK (true);

COMMENT ON TABLE positions IS 'Pozice (slovník) – sync z jakéhokoliv zařízení';
COMMENT ON TABLE openings IS 'Výběrová řízení / nábory';
COMMENT ON TABLE applications IS 'Přihlášky z job stránky';
