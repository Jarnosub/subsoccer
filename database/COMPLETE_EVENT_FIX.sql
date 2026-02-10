-- ============================================================
-- COMPLETE EVENT SYSTEM FIX - ALL IN ONE
-- Run this in Supabase SQL Editor to fix all issues
-- ============================================================

-- ==================== PART 1: EVENTS TABLE ====================

-- Add location columns
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Fix RLS policies for custom auth
DROP POLICY IF EXISTS "Authenticated users can view all events" ON public.events;
DROP POLICY IF EXISTS "Organizers can update own events" ON public.events;
DROP POLICY IF EXISTS "Organizers can delete own events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
DROP POLICY IF EXISTS "Anyone can insert events" ON public.events;
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;
DROP POLICY IF EXISTS "Anyone can delete events" ON public.events;

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

-- ==================== PART 2: TOURNAMENT_HISTORY TABLE ====================

-- Add tournament fields
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'elimination',
ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 8,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
ADD COLUMN IF NOT EXISTS tournament_name TEXT,
ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMPTZ;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_tournament_history_organizer_id 
ON public.tournament_history(organizer_id);

CREATE INDEX IF NOT EXISTS idx_tournament_history_status 
ON public.tournament_history(status);

CREATE INDEX IF NOT EXISTS idx_tournament_history_start_datetime 
ON public.tournament_history(start_datetime);

-- ==================== PART 3: EVENT_REGISTRATIONS TABLE ====================

-- Add tournament_id column
ALTER TABLE public.event_registrations 
ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournament_history(id) ON DELETE CASCADE;

-- Fix unique constraint to allow multiple tournament registrations per event
ALTER TABLE public.event_registrations 
DROP CONSTRAINT IF EXISTS event_registrations_event_id_player_id_key;

-- Add new unique constraint (event_id, tournament_id, player_id)
ALTER TABLE public.event_registrations 
DROP CONSTRAINT IF EXISTS event_registrations_unique;

ALTER TABLE public.event_registrations 
ADD CONSTRAINT event_registrations_unique 
UNIQUE (event_id, tournament_id, player_id);

-- Add index
CREATE INDEX IF NOT EXISTS idx_event_registrations_tournament_id 
ON public.event_registrations(tournament_id);

-- ==================== PART 4: RECREATE VIEW ====================

DROP VIEW IF EXISTS public.events_with_participant_count CASCADE;

CREATE OR REPLACE VIEW public.events_with_participant_count AS
SELECT 
    e.*,
    COUNT(DISTINCT er.player_id) FILTER (WHERE er.status = 'registered') as registered_count,
    COUNT(DISTINCT er.player_id) FILTER (WHERE er.checked_in = true) as checked_in_count,
    g.game_name,
    g.location as game_location,
    g.latitude as game_latitude,
    g.longitude as game_longitude,
    0 as table_count
FROM public.events e
LEFT JOIN public.event_registrations er ON e.id = er.event_id
LEFT JOIN public.games g ON e.game_id = g.id
GROUP BY e.id, g.game_name, g.location, g.latitude, g.longitude;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check events table columns
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'events' 
AND column_name IN ('location', 'address', 'latitude', 'longitude')
AND table_schema = 'public'
ORDER BY column_name;

-- Check tournament_history columns
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'tournament_history' 
AND column_name IN ('organizer_id', 'tournament_type', 'max_participants', 'status', 'tournament_name', 'start_datetime', 'end_datetime')
AND table_schema = 'public'
ORDER BY column_name;

-- Check event_registrations columns
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'event_registrations' 
AND column_name = 'tournament_id'
AND table_schema = 'public';

-- Check unique constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.event_registrations'::regclass
AND contype = 'u'
ORDER BY conname;

-- Check view exists
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name = 'events_with_participant_count';

-- ============================================================
-- EXPECTED RESULTS:
-- 1. events: 4 columns (address, latitude, location, longitude)
-- 2. tournament_history: 7 columns (end_datetime, max_participants, organizer_id, start_datetime, status, tournament_name, tournament_type)
-- 3. event_registrations: 1 column (tournament_id)
-- 4. constraint: event_registrations_unique (event_id, tournament_id, player_id)
-- 5. view: events_with_participant_count exists
-- ============================================================
