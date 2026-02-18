-- ============================================================
-- SECURE EVENTS TABLE
-- Restrict modifications to organizers and admins
-- ============================================================

-- 1. Poistetaan vanhat liian sallivat säännöt
DROP POLICY IF EXISTS "Public Access" ON public.events;
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
DROP POLICY IF EXISTS "Anyone can insert events" ON public.events;
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;
DROP POLICY IF EXISTS "Anyone can delete events" ON public.events;
DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
DROP POLICY IF EXISTS "Organizers can update own events" ON public.events;
DROP POLICY IF EXISTS "Organizers can delete own events" ON public.events;
DROP POLICY IF EXISTS "Users can create events" ON public.events;
DROP POLICY IF EXISTS "Organizers or admins can update events" ON public.events;

-- 2. Sallitaan kaikkien nähdä tapahtumat (tarvitaan Live-linkkejä varten)
CREATE POLICY "Anyone can view events" 
ON public.events FOR SELECT 
USING (true);

-- 3. Sallitaan vain kirjautuneen käyttäjän luoda tapahtumia omalla ID:llään
CREATE POLICY "Users can create events" 
ON public.events FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = organizer_id);

-- 4. Sallitaan järjestäjän tai adminin muokata tapahtumaa
CREATE POLICY "Organizers or admins can update events" 
ON public.events FOR UPDATE 
TO authenticated
USING (
    auth.uid() = organizer_id 
    OR 
    EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
);

-- 5. Sallitaan järjestäjän tai adminin poistaa tapahtuma
CREATE POLICY "Organizers or admins can delete events" 
ON public.events FOR DELETE 
TO authenticated
USING (
    auth.uid() = organizer_id 
    OR 
    EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
);