-- ============================================================
-- 🔒 QUICK FIX: REMOVE INSECURE PUBLIC POLICIES
-- Run this IMMEDIATELY to fix security issue
-- Then run enable_public_live_events.sql for complete setup
-- ============================================================

-- Remove dangerous policies that allow public to modify/delete events
DROP POLICY IF EXISTS "Anyone can delete events" ON public.events;
DROP POLICY IF EXISTS "Anyone can insert events" ON public.events;
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;

-- Remove dangerous all-access policy on tournament_history
DROP POLICY IF EXISTS "Allow all access" ON public.tournament_history;

-- Verify what's left
SELECT tablename, policyname, roles, cmd
FROM pg_policies 
WHERE tablename IN ('events', 'tournament_history')
AND roles::text LIKE '%public%'
ORDER BY tablename, cmd;

-- ============================================================
-- EXPECTED RESULTS AFTER THIS FIX:
-- events: Only "Anyone can view events" with SELECT should remain
-- tournament_history: Only view/select policies should remain
-- 
-- ⚠️ IMPORTANT: After running this, run enable_public_live_events.sql
--    to set up proper policies with correct permissions
-- ============================================================
