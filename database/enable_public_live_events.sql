-- ============================================================
-- ENABLE PUBLIC ACCESS FOR LIVE EVENT LINKS
-- This allows anyone to view event data via ?live=eventId URLs
-- Run this in Supabase SQL Editor
-- ============================================================

-- ==================== EVENTS TABLE ====================

-- Enable RLS on events if not already enabled
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
DROP POLICY IF EXISTS "Anyone can create events" ON public.events;
DROP POLICY IF EXISTS "Anyone can delete events" ON public.events;
DROP POLICY IF EXISTS "Anyone can insert events" ON public.events;
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can create events" ON public.events;
DROP POLICY IF EXISTS "Organizers can update own events" ON public.events;
DROP POLICY IF EXISTS "Organizers can delete own events" ON public.events;

-- Allow ANYONE (including anon users) to VIEW events only
CREATE POLICY "Anyone can view events"
    ON public.events FOR SELECT
    TO public
    USING (true);

-- Allow ANYONE to create events (we use custom auth, not Supabase Auth)
-- App validates user in JavaScript before calling insert
CREATE POLICY "Anyone can create events"
    ON public.events FOR INSERT
    TO public
    WITH CHECK (true);

-- Allow ANYONE to update events (we validate organizer_id match in app)
CREATE POLICY "Anyone can update events"
    ON public.events FOR UPDATE
    TO public
    USING (true);

-- Allow ANYONE to delete events (we validate organizer_id match in app)
CREATE POLICY "Anyone can delete events"
    ON public.events FOR DELETE
    TO public
    USING (true);

-- ==================== TOURNAMENT_HISTORY TABLE ====================

-- Enable RLS on tournament_history if not already enabled
ALTER TABLE public.tournament_history ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Anyone can view tournament history" ON public.tournament_history;
DROP POLICY IF EXISTS "Anyone can create tournaments" ON public.tournament_history;
DROP POLICY IF EXISTS "Organizers can manage tournaments" ON public.tournament_history;
DROP POLICY IF EXISTS "Organizers can delete tournaments" ON public.tournament_history;
DROP POLICY IF EXISTS "Allow all access" ON public.tournament_history;
DROP POLICY IF EXISTS "Authenticated users can create tournaments" ON public.tournament_history;
DROP POLICY IF EXISTS "Organizers can update tournaments" ON public.tournament_history;

-- Allow ANYONE (including anon users) to VIEW tournament history
CREATE POLICY "Anyone can view tournament history"
    ON public.tournament_history FOR SELECT
    TO public
    USING (true);

-- Allow ANYONE to INSERT tournaments (we use custom auth, not Supabase Auth)
-- App validates user in JavaScript before calling insert
CREATE POLICY "Anyone can create tournaments"
    ON public.tournament_history FOR INSERT
    TO public
    WITH CHECK (true);

-- Allow ANYONE to UPDATE tournaments (we validate organizer_id match in app)
CREATE POLICY "Anyone can update tournaments"
    ON public.tournament_history FOR UPDATE
    TO public
    USING (true);

-- Allow ANYONE to DELETE tournaments (we validate organizer_id match in app)
CREATE POLICY "Anyone can delete tournaments"
    ON public.tournament_history FOR DELETE
    TO public
    USING (true);

-- ==================== EVENT_REGISTRATIONS TABLE ====================

-- Enable RLS on event_registrations if not already enabled
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Anyone can view event registrations" ON public.event_registrations;
DROP POLICY IF EXISTS "Players can register for events" ON public.event_registrations;
DROP POLICY IF EXISTS "Players can cancel own registration" ON public.event_registrations;
DROP POLICY IF EXISTS "Players can update own registration" ON public.event_registrations;
DROP POLICY IF EXISTS "Players can delete own registration" ON public.event_registrations;

-- Allow ANYONE (including anon users) to VIEW registrations only
CREATE POLICY "Anyone can view event registrations"
    ON public.event_registrations FOR SELECT
    TO public
    USING (true);

-- Allow anyone to register (INSERT) - we validate player_id in app
CREATE POLICY "Anyone can register for events"
    ON public.event_registrations FOR INSERT
    TO public
    WITH CHECK (true);

-- Allow anyone to UPDATE their own registrations
CREATE POLICY "Anyone can update own registration"
    ON public.event_registrations FOR UPDATE
    TO public
    USING (true);

-- Allow anyone to DELETE their own registrations
CREATE POLICY "Anyone can delete own registration"
    ON public.event_registrations FOR DELETE
    TO public
    USING (true);

-- ==================== GAMES TABLE (needed for tournament display) ====================

-- Enable RLS on games if not already enabled
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view games" ON public.games;

-- Allow ANYONE (including anon users) to VIEW games only
CREATE POLICY "Anyone can view games"
    ON public.games FOR SELECT
    TO public
    USING (true);

-- ==================== PLAYERS TABLE (needed for participant names) ====================

-- Enable RLS on players if not already enabled
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view players" ON public.players;

-- Allow ANYONE (including anon users) to VIEW player profiles only
CREATE POLICY "Anyone can view players"
    ON public.players FOR SELECT
    TO public
    USING (true);

-- ============================================================
-- VERIFY POLICIES
-- ============================================================

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename IN ('events', 'tournament_history', 'event_registrations', 'games', 'players')
ORDER BY tablename, policyname;

-- ============================================================
-- EXPECTED RESULTS:
-- All tables should have SELECT policies allowing 'public' role
-- This enables anonymous (non-authenticated) access for live event links
-- 
-- SECURITY SUMMARY:
-- ⚠️ CUSTOM AUTHENTICATION: This app uses custom auth (players table), not Supabase Auth
-- ⚠️ All users have 'public' (anon) role in Supabase, even when logged in
-- ⚠️ Security is enforced in application code, not RLS policies
-- 
-- ✅ events: Public can VIEW/INSERT/UPDATE/DELETE (validated in app)
-- ✅ tournament_history: Public can VIEW/INSERT/UPDATE/DELETE (validated in app)
-- ✅ event_registrations: Public can VIEW/INSERT/UPDATE/DELETE (needed for registration)
-- ✅ games: Public can VIEW only
-- ✅ players: Public can VIEW only
-- 
-- ✅ Live event links work without authentication (FUNCTIONAL)
-- ⚠️ App-level validation ensures only organizers can modify their own events/tournaments
-- ============================================================
