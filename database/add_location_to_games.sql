-- ============================================================
-- ADD LOCATION TO GAMES TABLE
-- ============================================================

-- Add location column if it doesn't exist
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS location TEXT;

-- Add latitude and longitude for map integration (optional)
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Check games table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'games' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Show current games with location
SELECT id, game_name, location, latitude, longitude
FROM public.games
ORDER BY created_at DESC;
