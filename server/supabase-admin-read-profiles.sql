-- Spusťte v Supabase: SQL Editor → vložit a Run
-- Umožní adminům číst všechny řádky v tabulce profiles (aby sekce Uživatelé zobrazila celý seznam).

CREATE POLICY "admin read all profiles"
ON profiles
FOR SELECT
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
