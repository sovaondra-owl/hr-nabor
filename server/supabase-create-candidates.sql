-- Tabulka kandidátů pro HR Nábor (nutné pro ukládání kandidátů do Supabase).
-- Spusťte JEDNOU v Supabase: SQL Editor → vložit a Run.
-- Potom: přihlášení uživatelé ukládají/načítají kandidáty z této tabulky; import XLS jde přímo do Supabase.

-- Volitelně: pokud chcete mít pozice také v Supabase, odkomentujte a spusťte před vytvořením candidates:
/*
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access positions"
  ON positions FOR ALL TO authenticated USING (true) WITH CHECK (true);
*/

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

-- Přihlášení uživatelé mohou číst a měnit kandidáty (lze později omezit podle role z profiles).
CREATE POLICY "authenticated full access candidates"
  ON candidates FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE candidates IS 'Kandidáti z importu XLS a z aplikace HR Nábor';
