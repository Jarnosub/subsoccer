-- ============================================================
-- SUBSOCCER PLATFORM - FIX DELETE POLICY
-- ============================================================
-- Tämä paikkaa avoimen DELETE-politiikan, joka sallisi tilien
-- mielivaltaisen poiston. Nyt käyttäjä voi poistaa vain itsensä.

DROP POLICY IF EXISTS "Anyone can delete players (migration temp backdoor)" ON public.players;

CREATE POLICY "Users can delete own profile" ON public.players 
FOR DELETE USING (id = auth.uid());

SELECT '✅ DELETE-politiikka lukittu onnistuneesti!' as status;
