-- ============================================================
-- SECURITY FIX: Restrict anon access to players table
-- ============================================================
-- Run date: 2026-06-14
-- ============================================================

DROP VIEW IF EXISTS public.player_profiles;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.players;

CREATE POLICY "Authenticated users can view all players"
ON public.players FOR SELECT
TO authenticated
USING (true);

CREATE VIEW public.player_profiles AS
SELECT id, username, avatar_url, elo, wins, losses, country, 
       team_id, is_admin, created_at
FROM public.players;

GRANT SELECT ON public.player_profiles TO anon;
GRANT SELECT ON public.player_profiles TO authenticated;

DROP POLICY IF EXISTS "Enable read access for all" ON public_tracking;

CREATE POLICY "Authenticated users can read tracking"
ON public_tracking FOR SELECT
TO authenticated
USING (true);
