-- ============================================================
-- FIX PLAYERS RLS FOR MIGRATION & UPSERT
-- Allow users to claim their legacy records via email
-- ============================================================

-- 1. Päivitetään UPDATE-policy sallimaan haku sähköpostilla (tarvitaan upsertia varten)
DROP POLICY IF EXISTS "Users can update own profile" ON public.players;
CREATE POLICY "Users can update own profile" 
ON public.players FOR UPDATE 
TO authenticated
USING (auth.uid() = id OR email = (auth.jwt() ->> 'email'))
WITH CHECK (auth.uid() = id);

-- 2. Sallitaan käyttäjän poistaa oma legacy-profiilinsa migraation aikana
CREATE POLICY "Users can delete own profile" 
ON public.players FOR DELETE 
TO authenticated
USING (auth.uid() = id OR email = (auth.jwt() ->> 'email'));

-- 3. Sallitaan ylläpitäjien poistaa pelaajia
CREATE POLICY "Admins can delete any player" 
ON public.players FOR DELETE 
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
);