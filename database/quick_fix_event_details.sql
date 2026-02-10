-- ============================================================
-- QUICK FIX: Event Details Loading Error
-- Run this in Supabase SQL Editor
-- ============================================================

-- ==================== FIX 1: ADD TOURNAMENT FIELDS ====================

ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'elimination',
ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 8,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
ADD COLUMN IF NOT EXISTS tournament_name TEXT;

-- ==================== FIX 2: ADD TOURNAMENT_ID TO REGISTRATIONS ====================

ALTER TABLE public.event_registrations 
ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournament_history(id) ON DELETE CASCADE;

-- ==================== FIX 3: RECREATE events_with_participant_count VIEW ====================

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
    COUNT(DISTINCT eg.game_id) as table_count
FROM public.events e
LEFT JOIN public.event_registrations er ON e.id = er.event_id
LEFT JOIN public.games g ON e.game_id = g.id
LEFT JOIN public.event_games eg ON e.id = eg.event_id
GROUP BY e.id, g.game_name, g.location, g.latitude, g.longitude;

-- ==================== FIX 4: ADD INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_tournament_history_organizer_id 
ON public.tournament_history(organizer_id);

CREATE INDEX IF NOT EXISTS idx_tournament_history_status 
ON public.tournament_history(status);

CREATE INDEX IF NOT EXISTS idx_event_registrations_tournament_id 
ON public.event_registrations(tournament_id);

-- ==================== VERIFICATION ====================

-- Check tournament_history has new columns
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'tournament_history' 
AND column_name IN ('organizer_id', 'tournament_type', 'max_participants', 'status', 'tournament_name')
AND table_schema = 'public'
ORDER BY column_name;

-- Check event_registrations has tournament_id
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'event_registrations' 
AND column_name = 'tournament_id'
AND table_schema = 'public';

-- Check view exists
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name = 'events_with_participant_count';

-- ============================================================
-- EXPECTED RESULTS:
-- 1. Should show 5 tournament_history columns
-- 2. Should show tournament_id in event_registrations
-- 3. Should show events_with_participant_count view exists
-- ============================================================
