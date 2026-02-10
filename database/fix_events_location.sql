-- ============================================================
-- FIX: Add missing location columns to events table
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add location columns if they don't exist
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'events' 
AND table_schema = 'public'
AND column_name IN ('location', 'address', 'latitude', 'longitude')
ORDER BY column_name;

-- ============================================================
-- EXPECTED OUTPUT: Should show 4 rows with these columns
-- ============================================================
