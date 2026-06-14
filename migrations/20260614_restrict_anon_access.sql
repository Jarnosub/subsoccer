-- ============================================================
-- SECURITY FIX: Restrict anon access to players table
-- ============================================================
-- Problem: anon role can SELECT all columns including email, phone, password
-- Fix: Revoke direct anon SELECT, create a safe public view
-- ============================================================

-- 1. Drop the overly permissive policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.players;
DROP POLICY IF EXISTS "Public profiles viewable (safe columns only)" ON public.players;

-- 2. Create new SELECT policy: authenticated users see everything, anon sees nothing directly
CREATE POLICY "Authenticated users can view all players"
ON public.players FOR SELECT
TO authenticated
USING (true);

-- 3. Create a safe public view for anon (leaderboards, profile cards, etc.)
CREATE OR REPLACE VIEW public.player_profiles AS
SELECT 
    id,
    username,
    avatar_url,
    elo,
    wins,
    losses,
    country,
    team_id,
    is_admin,
    nationality,
    bio,
    created_at
FROM public.players;

-- 4. Grant anon SELECT on the view only
GRANT SELECT ON public.player_profiles TO anon;
GRANT SELECT ON public.player_profiles TO authenticated;

-- 5. Also restrict public_tracking SELECT to authenticated (admins check in frontend)
DROP POLICY IF EXISTS "Enable read access for all" ON public_tracking;
CREATE POLICY "Authenticated users can read tracking"
ON public_tracking FOR SELECT
TO authenticated
USING (true);

-- Verify: anon can no longer SELECT from players directly
-- They must use player_profiles view instead
