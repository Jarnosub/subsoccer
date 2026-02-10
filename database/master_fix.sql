-- ============================================================
-- MASTER FIX SCRIPT: Events System Database Issues
-- Run this FIRST in Supabase SQL Editor
-- ============================================================
-- This fixes both issues:
-- 1. Missing location columns in events table
-- 2. RLS policies that don't work with custom auth
-- ============================================================

-- ==================== FIX 1: ADD LOCATION COLUMNS ====================

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- ==================== FIX 2: UPDATE RLS POLICIES ====================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
DROP POLICY IF EXISTS "Organizers can update own events" ON public.events;
DROP POLICY IF EXISTS "Organizers can delete own events" ON public.events;

-- Create permissive policies for custom auth
CREATE POLICY "Anyone can view events"
    ON public.events FOR SELECT
    USING (true);

CREATE POLICY "Anyone can insert events"
    ON public.events FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update events"
    ON public.events FOR UPDATE
    USING (true);

CREATE POLICY "Anyone can delete events"
    ON public.events FOR DELETE
    USING (true);

-- ==================== VERIFICATION ====================

-- Check location columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'events' 
AND table_schema = 'public'
AND column_name IN ('location', 'address', 'latitude', 'longitude')
ORDER BY column_name;

-- Check RLS policies
SELECT policyname, cmd 
FROM pg_policies
WHERE tablename = 'events'
ORDER BY policyname;

-- ============================================================
-- EXPECTED RESULTS:
-- 1. Should show 4 location columns (address, latitude, location, longitude)
-- 2. Should show 5 policies (including "Public events are viewable by everyone" and 4 new ones)
-- ============================================================

-- ============================================================
-- NEXT STEP: Fix Storage RLS (MUST be done via Dashboard UI)
-- See file: fix_storage_rls.txt
-- ============================================================
