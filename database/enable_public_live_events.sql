-- ============================================================
-- ENABLE PUBLIC ACCESS FOR LIVE EVENT LINKS
-- This allows anyone to view event data via ?live=eventId URLs
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable RLS on tournament_history if not already enabled
ALTER TABLE public.tournament_history ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view tournament history (for live event displays)
DROP POLICY IF EXISTS "Anyone can view tournament history" ON public.tournament_history;
CREATE POLICY "Anyone can view tournament history"
    ON public.tournament_history FOR SELECT
    USING (true);

-- Allow authenticated users to manage tournaments
DROP POLICY IF EXISTS "Organizers can manage tournaments" ON public.tournament_history;
CREATE POLICY "Organizers can manage tournaments"
    ON public.tournament_history FOR ALL
    USING (auth.uid() = organizer_id)
    WITH CHECK (auth.uid() = organizer_id);

-- Allow anyone to insert tournaments (we validate in app)
DROP POLICY IF EXISTS "Anyone can create tournaments" ON public.tournament_history;
CREATE POLICY "Anyone can create tournaments"
    ON public.tournament_history FOR INSERT
    WITH CHECK (true);

-- ============================================================
-- VERIFY POLICIES
-- ============================================================

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename IN ('events', 'tournament_history', 'event_registrations')
ORDER BY tablename, policyname;

-- ============================================================
-- EXPECTED RESULTS:
-- - events: Public events viewable by everyone
-- - tournament_history: Viewable by everyone
-- - event_registrations: Viewable by everyone
-- ============================================================
