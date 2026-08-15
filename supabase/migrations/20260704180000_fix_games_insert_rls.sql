-- ============================================================
-- FIX: Allow game inserts for Add to Map feature
-- ============================================================
-- PROBLEM: games table has RLS enabled but no INSERT policy,
-- so the Add to Map feature silently fails for all users.
-- ============================================================

-- Allow authenticated users to insert games
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can add games' AND tablename = 'games') THEN
        CREATE POLICY "Authenticated users can add games" ON public.games 
        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- Also allow anon users to insert (for non-registered players who scan QR)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can add community games' AND tablename = 'games') THEN
        CREATE POLICY "Anyone can add community games" ON public.games 
        FOR INSERT WITH CHECK (true);
    END IF;
END $$;

SELECT '✅ Games INSERT policies added — Add to Map feature now works for all users' as status;
