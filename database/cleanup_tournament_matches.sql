-- ============================================================
-- CLEANUP: Remove database-based bracket system
-- Keeps only the helper functions needed for participant management
-- ============================================================

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_sync_tournament_match ON public.tournament_matches;

-- Drop functions related to bracket management
DROP FUNCTION IF EXISTS public.sync_tournament_match_to_matches();
DROP FUNCTION IF EXISTS public.generate_tournament_bracket(UUID);

-- Drop table
DROP TABLE IF EXISTS public.tournament_matches;

-- ============================================================
-- KEEP THESE: Helper functions for participant management
-- (create_guest_player and add_tournament_participant remain unchanged)
-- ============================================================

-- These are still needed and are already in the database:
-- - create_guest_player(p_username TEXT)
-- - add_tournament_participant(p_tournament_id UUID, p_player_id UUID)
