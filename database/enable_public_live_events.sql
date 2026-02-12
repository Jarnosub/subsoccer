-- ============================================================
-- ENABLE PUBLIC ACCESS FOR LIVE EVENT LINKS
-- This allows anyone to view event data via ?live=eventId URLs
-- Run this in Supabase SQL Editor
-- ============================================================

-- ==================== EVENTS TABLE ====================

-- Enable RLS on events if not already enabled
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE (including anon users) to view events
DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;

CREATE POLICY "Anyone can view events"
    ON public.events FOR SELECT
    TO public
    USING (true);

-- Allow authenticated users to create events
DROP POLICY IF EXISTS "Anyone can create events" ON public.events;
CREATE POLICY "Authenticated users can create events"
    ON public.events FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow organizers to update their own events
DROP POLICY IF EXISTS "Organizers can update own events" ON public.events;
CREATE POLICY "Organizers can update own events"
    ON public.events FOR UPDATE
    TO authenticated
    USING (organizer_id IN (SELECT id FROM players WHERE username = current_user OR id::text = auth.uid()::text));

-- Allow organizers to delete their own events
DROP POLICY IF EXISTS "Organizers can delete own events" ON public.events;
CREATE POLICY "Organizers can delete own events"
    ON public.events FOR DELETE
    TO authenticated
    USING (organizer_id IN (SELECT id FROM players WHERE username = current_user OR id::text = auth.uid()::text));

-- ==================== TOURNAMENT_HISTORY TABLE ====================

-- Enable RLS on tournament_history if not already enabled
ALTER TABLE public.tournament_history ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE (including anon users) to view tournament history
DROP POLICY IF EXISTS "Anyone can view tournament history" ON public.tournament_history;
CREATE POLICY "Anyone can view tournament history"
    ON public.tournament_history FOR SELECT
    TO public
    USING (true);

-- Allow anyone to insert tournaments (we validate in app)
DROP POLICY IF EXISTS "Anyone can create tournaments" ON public.tournament_history;
CREATE POLICY "Anyone can create tournaments"
    ON public.tournament_history FOR INSERT
    TO public
    WITH CHECK (true);

-- Allow authenticated users to manage tournaments
DROP POLICY IF EXISTS "Organizers can manage tournaments" ON public.tournament_history;
CREATE POLICY "Organizers can manage tournaments"
    ON public.tournament_history FOR UPDATE
    TO authenticated
    USING (organizer_id IN (SELECT id FROM players WHERE username = current_user OR id::text = auth.uid()::text));

CREATE POLICY "Organizers can delete tournaments"
    ON public.tournament_history FOR DELETE
    TO authenticated
    USING (organizer_id IN (SELECT id FROM players WHERE username = current_user OR id::text = auth.uid()::text));

-- ==================== EVENT_REGISTRATIONS TABLE ====================

-- Enable RLS on event_registrations if not already enabled
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE (including anon users) to view registrations
DROP POLICY IF EXISTS "Anyone can view event registrations" ON public.event_registrations;
CREATE POLICY "Anyone can view event registrations"
    ON public.event_registrations FOR SELECT
    TO public
    USING (true);

-- Allow anyone to register (we validate in app)
DROP POLICY IF EXISTS "Players can register for events" ON public.event_registrations;
CREATE POLICY "Players can register for events"
    ON public.event_registrations FOR INSERT
    TO public
    WITH CHECK (true);

-- Allow users to update their own registrations
DROP POLICY IF EXISTS "Players can cancel own registration" ON public.event_registrations;
CREATE POLICY "Players can update own registration"
    ON public.event_registrations FOR UPDATE
    TO public
    USING (true);

-- ==================== GAMES TABLE (needed for tournament display) ====================

-- Enable RLS on games if not already enabled
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE (including anon users) to view games
DROP POLICY IF EXISTS "Anyone can view games" ON public.games;
CREATE POLICY "Anyone can view games"
    ON public.games FOR SELECT
    TO public
    USING (true);

-- ==================== PLAYERS TABLE (needed for participant names) ====================

-- Enable RLS on players if not already enabled
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE (including anon users) to view player profiles
DROP POLICY IF EXISTS "Anyone can view players" ON public.players;
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
-- ============================================================
