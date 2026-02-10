-- ============================================================
-- ADD START/END DATETIME TO TOURNAMENTS
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add start_datetime and end_datetime to tournament_history
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMPTZ;

-- Add index for querying tournaments by time
CREATE INDEX IF NOT EXISTS idx_tournament_history_start_datetime 
ON public.tournament_history(start_datetime);

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Check columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'tournament_history' 
AND column_name IN ('start_datetime', 'end_datetime')
AND table_schema = 'public'
ORDER BY column_name;

-- Expected: Should show 2 rows (end_datetime, start_datetime)
