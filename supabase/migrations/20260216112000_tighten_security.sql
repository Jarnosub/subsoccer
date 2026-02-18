-- ============================================================
-- FINAL SECURITY HARDENING (LINKEDIN READY)
-- This script is idempotent: it cleans up before setup.
-- ============================================================

-- 1. ENABLE RLS ON ALL TABLES
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_history ENABLE ROW LEVEL SECURITY;

-- 2. CLEANUP ALL POSSIBLE OLD POLICIES (Prevents ERROR 42710)
DO $$ 
BEGIN
    -- Players
    DROP POLICY IF EXISTS "Anyone can view players" ON public.players;
    DROP POLICY IF EXISTS "Anyone can update players" ON public.players;
    DROP POLICY IF EXISTS "Users can update own profile" ON public.players;
    DROP POLICY IF EXISTS "Admins can update any player" ON public.players;
    DROP POLICY IF EXISTS "Users can insert own profile" ON public.players;
    DROP POLICY IF EXISTS "Public Access" ON public.players;
    
    -- Events
    DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
    DROP POLICY IF EXISTS "Users can create events" ON public.events;
    DROP POLICY IF EXISTS "Organizers or admins can update events" ON public.events;
    DROP POLICY IF EXISTS "Public Access" ON public.events;
    
    -- Matches
    DROP POLICY IF EXISTS "Anyone can view match history" ON public.matches;
    DROP POLICY IF EXISTS "Public Access" ON public.matches;
    
    -- Tournament Matches
    DROP POLICY IF EXISTS "Anyone can view tournament matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Organizers can manage tournament matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Anyone can delete matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Anyone can insert matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Anyone can update matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Anyone can view matches" ON public.tournament_matches;
END $$;

-- 3. CREATE SECURE POLICIES

-- PLAYERS: Everyone can see, only owner/admin can edit
CREATE POLICY "Anyone can view players" ON public.players FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.players 
FOR UPDATE TO authenticated 
USING (auth.uid() = id OR email = (auth.jwt() ->> 'email'))
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any player" ON public.players 
FOR UPDATE TO authenticated 
USING (EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true));

-- EVENTS: Everyone can see, only organizer/admin can edit
CREATE POLICY "Anyone can view events" ON public.events FOR SELECT USING (true);

CREATE POLICY "Users can create events" ON public.events 
FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers or admins can update events" ON public.events 
FOR UPDATE TO authenticated 
USING (auth.uid() = organizer_id OR EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true));

-- MATCHES: Read-only for public. (record_quick_match_v1 handles inserts)
CREATE POLICY "Anyone can view match history" ON public.matches FOR SELECT USING (true);

-- TOURNAMENT MATCHES: Public view, Organizer/Admin manage
CREATE POLICY "Anyone can view tournament matches" ON public.tournament_matches FOR SELECT USING (true);

CREATE POLICY "Organizers can manage tournament matches" ON public.tournament_matches
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.tournament_history th WHERE th.id = tournament_id AND th.organizer_id = auth.uid())
  OR 
  EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true)
);

-- STORAGE: Secure images
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Public upload access" ON storage.objects;

CREATE POLICY "Public read access" ON storage.objects 
FOR SELECT TO public USING ( bucket_id = 'event-images' );

CREATE POLICY "Public upload access" ON storage.objects 
FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'event-images' );

-- 4. FINAL PERMISSIONS
-- Ensure the game can record matches even with RLS on
GRANT EXECUTE ON FUNCTION public.record_quick_match_v1 TO anon, authenticated, service_role;

-- 5. VERIFY ADMIN STATUS (Replace with your username)
UPDATE public.players SET is_admin = true WHERE username = 'JARNO';

SELECT '✅ Database secured and ready for LinkedIn demo!' as status;