-- ============================================================
-- Security Fix: Restrict hardware_registry access
-- 
-- Problem: All 13,225 serial numbers are publicly readable 
-- via anon key, exposing production volumes and serial numbers.
--
-- Solution: Enable RLS and restrict access:
--   - Anon: NO access (was: full read)
--   - Authenticated: Can read own hardware (owner_id match)
--   - Authenticated: Can read unclaimed hardware by serial_number 
--     (needed for QR claim flow)
-- ============================================================

-- Step 1: Enable RLS (if not already enabled)
ALTER TABLE public.hardware_registry ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing permissive policies
DROP POLICY IF EXISTS "hardware_registry_select_policy" ON public.hardware_registry;
DROP POLICY IF EXISTS "hardware_registry_anon_select" ON public.hardware_registry;
DROP POLICY IF EXISTS "hardware_registry_auth_select" ON public.hardware_registry;
DROP POLICY IF EXISTS "hardware_registry_auth_update" ON public.hardware_registry;

-- Step 3: Authenticated users can read their own claimed hardware
CREATE POLICY "hw_select_own"
    ON public.hardware_registry
    FOR SELECT
    TO authenticated
    USING (owner_id = auth.uid());

-- Step 4: Authenticated users can read unclaimed hardware 
-- (needed for claim flow when scanning QR code)
CREATE POLICY "hw_select_unclaimed"
    ON public.hardware_registry
    FOR SELECT
    TO authenticated
    USING (is_claimed = false);

-- Step 5: Authenticated users can update to claim hardware
CREATE POLICY "hw_update_claim"
    ON public.hardware_registry
    FOR UPDATE
    TO authenticated
    USING (is_claimed = false OR owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Step 6: Revoke direct table access for anon role
-- (RLS will enforce, but belt-and-suspenders)
REVOKE ALL ON public.hardware_registry FROM anon;
GRANT SELECT ON public.hardware_registry TO authenticated;
GRANT UPDATE ON public.hardware_registry TO authenticated;
