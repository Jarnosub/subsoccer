-- ============================================================
-- SECURITY FIX #16: Server-side brand password verification
-- ============================================================
-- WHAT THIS DOES:
-- 1. Creates brand_passwords table to store hashed passwords
-- 2. Creates verify_brand_password() RPC function
-- 3. Allows anon to call RPC (public demo pages need it)
-- 4. Denies direct access to brand_passwords table
--
-- AFTER RUNNING: Insert passwords for your brands (see bottom)
-- ============================================================

-- Step 1: Create table for brand passwords
CREATE TABLE IF NOT EXISTS public.brand_passwords (
    brand_slug text PRIMARY KEY,
    password_hash text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Step 2: RLS — deny all direct access to the table
ALTER TABLE public.brand_passwords ENABLE ROW LEVEL SECURITY;
-- No policies = no one can read/write directly (only via SECURITY DEFINER function)

-- Step 3: Create the RPC function
CREATE OR REPLACE FUNCTION public.verify_brand_password(
    brand_slug text,
    password_attempt text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    stored_hash text;
BEGIN
    -- Look up stored hash
    SELECT bp.password_hash INTO stored_hash
    FROM brand_passwords bp
    WHERE bp.brand_slug = verify_brand_password.brand_slug;

    -- Brand not found or no password set
    IF stored_hash IS NULL THEN
        RETURN false;
    END IF;

    -- Compare using pgcrypto crypt()
    RETURN stored_hash = crypt(password_attempt, stored_hash);
END;
$$;

-- Step 4: Allow anon and authenticated to call the function
GRANT EXECUTE ON FUNCTION public.verify_brand_password(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_brand_password(text, text) TO authenticated;

-- ============================================================
-- INSERT YOUR BRAND PASSWORDS
-- Run these AFTER the migration above:
-- ============================================================
-- Make sure pgcrypto extension is enabled:
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insert brand passwords (change 'your-password-here' to actual passwords):
INSERT INTO public.brand_passwords (brand_slug, password_hash) VALUES
    ('kia', crypt('kia2026', gen_salt('bf'))),
    ('brands', crypt('subsoccer2026', gen_salt('bf')))
ON CONFLICT (brand_slug) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        updated_at = now();

-- ============================================================
-- ROLLBACK (if needed):
-- DROP FUNCTION IF EXISTS public.verify_brand_password(text, text);
-- DROP TABLE IF EXISTS public.brand_passwords;
-- ============================================================
