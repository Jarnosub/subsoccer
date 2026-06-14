-- ============================================================
-- SECURITY FIX #1 + #2: Protect player personal data
-- ============================================================
-- WHAT THIS DOES:
-- 1. NULLs ALL remaining password fields (eliminates credential exposure)
-- 2. Fixes admin protection trigger (uses auth.uid() instead of current_user)
-- 3. Creates player_profiles view for safe public reads
--
-- NOTE: We keep anon SELECT on players table for now because the login
-- flow searches players by username/email BEFORE the user is authenticated.
-- Once legacy login is removed from auth.js, we can restrict anon SELECT.
--
-- ROLLBACK: See bottom of file
-- ============================================================

-- ==========================================
-- Step 1: NULL all password fields
-- ==========================================
UPDATE public.players SET password = NULL WHERE password IS NOT NULL;

SELECT '✅ Step 1: All password fields cleared (' || 
    (SELECT count(*) FROM public.players WHERE password IS NULL) || 
    ' players now have NULL password)' as status;

-- ==========================================
-- Step 2: Fix admin protection trigger
-- Use auth.uid() check which is reliable in Supabase PostgREST
-- ==========================================
CREATE OR REPLACE FUNCTION public.protect_sensitive_player_data()
RETURNS TRIGGER AS $$
BEGIN
    -- If called via REST API (user has auth.uid), protect sensitive fields
    -- Service-role functions (record_quick_match_v1) have NULL auth.uid() 
    -- because they run as SECURITY DEFINER, so they bypass this correctly
    IF auth.uid() IS NOT NULL THEN
        -- Regular authenticated user: silently restore protected fields
        NEW.is_admin := OLD.is_admin;
        NEW.elo := OLD.elo;
        NEW.wins := OLD.wins;
        NEW.losses := OLD.losses;
        NEW.password := OLD.password;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ Step 2: Admin protection trigger fixed (auth.uid() based)' as status;

-- ==========================================
-- Step 3: Create secure public view
-- (Alternative read path that hides sensitive data)
-- ==========================================
CREATE OR REPLACE VIEW public.player_profiles AS
SELECT 
    id,
    username,
    avatar_url,
    elo,
    wins,
    losses,
    country,
    city,
    is_admin,
    created_at,
    -- Email/phone visible only to the player themselves
    CASE WHEN id = auth.uid() THEN email ELSE NULL END as email,
    CASE WHEN id = auth.uid() THEN phone ELSE NULL END as phone
FROM public.players;

GRANT SELECT ON public.player_profiles TO anon, authenticated, service_role;

SELECT '✅ Step 3: Secure player_profiles view created' as status;

SELECT '✅✅ SECURITY FIX #1 + #2 COMPLETE' as status;

-- ============================================================
-- ROLLBACK:
-- ============================================================
-- Note: Passwords cannot be restored (they were cleartext/SHA256 hashes).
-- This is intentional — all users should use Supabase Auth.
--
-- To revert trigger:
-- Re-run from 20260328223000_secure_columns.sql
--
-- To remove view:
-- DROP VIEW IF EXISTS public.player_profiles;
