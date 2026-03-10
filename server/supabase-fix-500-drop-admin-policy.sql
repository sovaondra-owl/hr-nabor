-- Odstranění policy, která způsobuje 500 při načítání profilů.
-- Spusťte v Supabase: SQL Editor → vložit a Run.
-- Potom obnovte stránku aplikace (Ctrl+Shift+R).

DROP POLICY IF EXISTS "admin read all profiles" ON profiles;
