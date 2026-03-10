-- ============================================================
-- HR Nábor – kompletní schéma pro Supabase (profiles + candidates)
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
