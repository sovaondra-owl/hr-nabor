-- ============================================================
-- Přidání sloupce pro životopisy (PDF) u kandidátů
-- Spusťte v Supabase: SQL Editor → vložit a Run.
-- ============================================================

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_files JSONB;

COMMENT ON COLUMN candidates.cv_files IS 'Životopisy (PDF) – pole objektů { name, data } s base64 obsahem';
