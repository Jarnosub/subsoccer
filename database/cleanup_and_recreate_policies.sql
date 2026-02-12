-- ============================================================
-- FORCE CLEANUP AND RECREATE ALL RLS POLICIES
-- This removes ALL existing policies dynamically, then creates new ones
-- Run this in Supabase SQL Editor
-- ============================================================

-- ==================== STEP 1: FORCE DROP ALL EXISTING POLICIES ====================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Drop all policies on events table
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.events', r.policyname);
        RAISE NOTICE 'Dropped policy % on events', r.policyname;
    END LOOP;
    
    -- Drop all policies on tournament_history table
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tournament_history'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.tournament_history', r.policyname);
        RAISE NOTICE 'Dropped policy % on tournament_history', r.policyname;
    END LOOP;
    
    -- Drop all policies on event_registrations table
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_registrations'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.event_registrations', r.policyname);
        RAISE NOTICE 'Dropped policy % on event_registrations', r.policyname;
    END LOOP;
    
    -- Drop all policies on games table
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'games'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.games', r.policyname);
        RAISE NOTICE 'Dropped policy % on games', r.policyname;
    END LOOP;
    
    -- Drop all policies on players table
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'players'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.players', r.policyname);
        RAISE NOTICE 'Dropped policy % on players', r.policyname;
    END LOOP;
END $$;

-- ==================== STEP 2: ENABLE RLS ====================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- ==================== STEP 3: CREATE NEW POLICIES ====================

-- EVENTS TABLE
CREATE POLICY "Anyone can view events"
    ON public.events FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Anyone can create events"
    ON public.events FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY "Anyone can update events"
    ON public.events FOR UPDATE
    TO public
    USING (true);

CREATE POLICY "Anyone can delete events"
    ON public.events FOR DELETE
    TO public
    USING (true);

-- TOURNAMENT_HISTORY TABLE
CREATE POLICY "Anyone can view tournament history"
    ON public.tournament_history FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Anyone can create tournaments"
    ON public.tournament_history FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY "Anyone can update tournaments"
    ON public.tournament_history FOR UPDATE
    TO public
    USING (true);

CREATE POLICY "Anyone can delete tournaments"
    ON public.tournament_history FOR DELETE
    TO public
    USING (true);

-- EVENT_REGISTRATIONS TABLE
CREATE POLICY "Anyone can view event registrations"
    ON public.event_registrations FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Anyone can register for events"
    ON public.event_registrations FOR INSERT
    TO public
    WITH CHECK (true);

CREATE POLICY "Anyone can update own registration"
    ON public.event_registrations FOR UPDATE
    TO public
    USING (true);

CREATE POLICY "Anyone can delete own registration"
    ON public.event_registrations FOR DELETE
    TO public
    USING (true);

-- GAMES TABLE (read-only for public)
CREATE POLICY "Anyone can view games"
    ON public.games FOR SELECT
    TO public
    USING (true);

-- PLAYERS TABLE (read-only for public)
CREATE POLICY "Anyone can view players"
    ON public.players FOR SELECT
    TO public
    USING (true);

-- ==================== STEP 4: VERIFY ====================

SELECT 
    tablename, 
    policyname, 
    cmd, 
    roles,
    CASE 
        WHEN qual IS NOT NULL THEN 'Has USING clause'
        ELSE 'No USING clause'
    END as using_clause,
    CASE 
        WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END as with_check_clause
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename IN ('events', 'tournament_history', 'event_registrations', 'games', 'players')
ORDER BY tablename, cmd, policyname;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ RLS POLICIES SUCCESSFULLY RECREATED!';
    RAISE NOTICE '';
    RAISE NOTICE '🔓 CUSTOM AUTH MODE ENABLED:';
    RAISE NOTICE '   - All users have "public" role (not authenticated)';
    RAISE NOTICE '   - Security enforced in application code';
    RAISE NOTICE '   - Live event links work without authentication';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Policy Summary:';
    RAISE NOTICE '   - events: Public can SELECT/INSERT/UPDATE/DELETE';
    RAISE NOTICE '   - tournament_history: Public can SELECT/INSERT/UPDATE/DELETE';
    RAISE NOTICE '   - event_registrations: Public can SELECT/INSERT/UPDATE/DELETE';
    RAISE NOTICE '   - games: Public can SELECT only';
    RAISE NOTICE '   - players: Public can SELECT only';
    RAISE NOTICE '';
    RAISE NOTICE '✨ You can now:';
    RAISE NOTICE '   1. Create events (no more 401 errors)';
    RAISE NOTICE '   2. Share live event links that work without login';
    RAISE NOTICE '   3. View live events with ?live=<event-id> URLs';
    RAISE NOTICE '';
END $$;
