-- ============================================================
-- FIX EVENT_REGISTRATIONS UNIQUE CONSTRAINT
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop old unique constraint (event_id, player_id)
ALTER TABLE public.event_registrations 
DROP CONSTRAINT IF EXISTS event_registrations_event_id_player_id_key;

-- Add new unique constraint (event_id, tournament_id, player_id)
-- This allows same player to register to multiple tournaments in same event
ALTER TABLE public.event_registrations 
ADD CONSTRAINT event_registrations_unique 
UNIQUE (event_id, tournament_id, player_id);

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Check constraints
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.event_registrations'::regclass
AND contype = 'u'
ORDER BY conname;

-- Expected: Should show event_registrations_unique constraint
-- with (event_id, tournament_id, player_id)
