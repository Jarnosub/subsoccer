-- ============================================================
-- SECURE PLAYERS TABLE
-- Restrict updates to owners and admins only
-- ============================================================

-- 1. Poistetaan vanhat liian sallivat säännöt
DROP POLICY IF EXISTS "Public Access" ON public.players;
DROP POLICY IF EXISTS "Anyone can view players" ON public.players;
DROP POLICY IF EXISTS "Anyone can insert players" ON public.players;
DROP POLICY IF EXISTS "Anyone can update players" ON public.players;
DROP POLICY IF EXISTS "Users can update own profile" ON public.players;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.players;

-- 2. Sallitaan kaikkien nähdä pelaajien perustiedot (Leaderboard & Profiilit)
CREATE POLICY "Anyone can view players" 
ON public.players FOR SELECT 
USING (true);

-- 3. Sallitaan vain kirjautuneen käyttäjän muokata omaa riviään
-- auth.uid() palauttaa Supabase Authin ID:n, jonka pitää täsmätä players.id:hen
CREATE POLICY "Users can update own profile" 
ON public.players FOR UPDATE 
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Sallitaan ylläpitäjien muokata kaikkia profiileja
-- Tämä on välttämätön moderator-service.js:n toiminnoille
CREATE POLICY "Admins can update any player" 
ON public.players FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.players 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- 5. Sallitaan profiilin luonti kirjautumisen yhteydessä
CREATE POLICY "Users can insert own profile" 
ON public.players FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = id);