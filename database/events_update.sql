-- ============================================================
-- SUBSOCCER EVENT CALENDAR SYSTEM - UPDATE SCRIPT
-- Adds multi-table support and custom location fields
-- Run this ONLY if you already ran events_schema.sql before
-- ============================================================

-- If you haven't run events_schema.sql yet, run that instead!
-- This script is for updating existing events table structure

-- 1. ADD LOCATION FIELDS TO EVENTS TABLE
-- ============================================================
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add comment to game_id to clarify its optional nature
COMMENT ON COLUMN public.events.game_id IS 'Optional: primary table for single-location events. For multi-table events, use event_games junction table. For custom locations, use location/lat/lng fields instead.';


-- 2. CREATE EVENT_GAMES JUNCTION TABLE (for multi-table tournaments)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id, game_id) -- Prevent duplicate table assignments
);

CREATE INDEX IF NOT EXISTS idx_event_games_event_id ON public.event_games(event_id);
CREATE INDEX IF NOT EXISTS idx_event_games_game_id ON public.event_games(game_id);

-- Enable RLS
ALTER TABLE public.event_games ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_games
CREATE POLICY "Anyone can view event games"
    ON public.event_games FOR SELECT
    USING (true);

CREATE POLICY "Event organizers can manage event games"
    ON public.event_games FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.events 
        WHERE events.id = event_games.event_id 
        AND events.organizer_id = auth.uid()
    ));


-- 3. UPDATE VIEWS
-- ============================================================

-- Drop old view and recreate with new fields
DROP VIEW IF EXISTS public.events_with_participant_count;

CREATE OR REPLACE VIEW public.events_with_participant_count AS
SELECT 
    e.*,
    COUNT(DISTINCT er.player_id) FILTER (WHERE er.status = 'registered') as registered_count,
    COUNT(DISTINCT er.player_id) FILTER (WHERE er.checked_in = true) as checked_in_count,
    -- Primary game table info (if single location)
    g.game_name,
    g.location as game_location,
    g.latitude as game_latitude,
    g.longitude as game_longitude,
    -- Count of tables for multi-table events
    COUNT(DISTINCT eg.game_id) as table_count
FROM public.events e
LEFT JOIN public.event_registrations er ON e.id = er.event_id
LEFT JOIN public.games g ON e.game_id = g.id
LEFT JOIN public.event_games eg ON e.id = eg.event_id
GROUP BY e.id, g.game_name, g.location, g.latitude, g.longitude;

-- Create new view for event tables
CREATE OR REPLACE VIEW public.event_tables AS
SELECT 
    e.id as event_id,
    e.event_name,
    g.id as game_id,
    g.game_name,
    g.location,
    g.latitude,
    g.longitude
FROM public.events e
JOIN public.event_games eg ON e.id = eg.event_id
JOIN public.games g ON eg.game_id = g.id
ORDER BY e.event_name, g.game_name;


-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'events' 
AND table_schema = 'public'
AND column_name IN ('location', 'address', 'latitude', 'longitude')
ORDER BY column_name;

-- Check event_games table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'event_games';

-- Check updated view structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'events_with_participant_count' 
AND table_schema = 'public'
AND column_name IN ('table_count', 'game_location')
ORDER BY column_name;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Your events table now supports:
-- 1. Single table events (game_id)
-- 2. Multi-table events (event_games junction table)
-- 3. Custom location events (location/address/lat/lng fields)
-- ============================================================
