-- ============================================================
-- SUBSOCCER EVENT CALENDAR SYSTEM
-- Database Schema Creation Script
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. CREATE EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'tournament' CHECK (event_type IN ('tournament', 'league', 'casual')),
    game_id UUID REFERENCES public.games(id) ON DELETE SET NULL, -- Optional: primary table for single-location events
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ,
    organizer_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
    max_participants INTEGER DEFAULT 16,
    registration_deadline TIMESTAMPTZ,
    description TEXT,
    is_public BOOLEAN DEFAULT true,
    image_url TEXT,
    -- Custom location fields (alternative to game_id)
    location TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_start_datetime ON public.events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_game_id ON public.events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON public.events(organizer_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events
-- Anyone can view public events
CREATE POLICY "Public events are viewable by everyone"
    ON public.events FOR SELECT
    USING (is_public = true);

-- Authenticated users can view all events
CREATE POLICY "Authenticated users can view all events"
    ON public.events FOR SELECT
    USING (auth.role() = 'authenticated');

-- Organizers can update their own events
CREATE POLICY "Organizers can update own events"
    ON public.events FOR UPDATE
    USING (organizer_id = auth.uid());

-- Organizers can delete their own events
CREATE POLICY "Organizers can delete own events"
    ON public.events FOR DELETE
    USING (organizer_id = auth.uid());

-- Anyone can create events (we'll validate organizer_id in app)
CREATE POLICY "Anyone can create events"
    ON public.events FOR INSERT
    WITH CHECK (true);


-- 2. CREATE EVENT_REGISTRATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'confirmed', 'cancelled')),
    checked_in BOOLEAN DEFAULT false,
    UNIQUE(event_id, player_id) -- Prevent duplicate registrations
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON public.event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_player_id ON public.event_registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_status ON public.event_registrations(status);

-- Enable RLS
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for event_registrations
-- Everyone can view registrations
CREATE POLICY "Anyone can view event registrations"
    ON public.event_registrations FOR SELECT
    USING (true);

-- Players can register themselves
CREATE POLICY "Players can register for events"
    ON public.event_registrations FOR INSERT
    WITH CHECK (true);

-- Players can cancel their own registration
CREATE POLICY "Players can cancel own registration"
    ON public.event_registrations FOR UPDATE
    USING (player_id = auth.uid());

-- Players can delete their own registration
CREATE POLICY "Players can delete own registration"
    ON public.event_registrations FOR DELETE
    USING (player_id = auth.uid());


-- 3. CREATE EVENT_GAMES JUNCTION TABLE (for multi-table tournaments)
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


-- 4. ADD EVENT_ID TO EXISTING TABLES
-- ============================================================

-- Add event_id to tournament_history
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_history_event_id ON public.tournament_history(event_id);

-- Add event_id to matches
ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_event_id ON public.matches(event_id);


-- 5. HELPER VIEWS
-- ============================================================

-- View: Events with participant count and location info
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

-- View: Event tables (lists all tables for each event)
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


-- 6. USEFUL FUNCTIONS
-- ============================================================

-- Function to check if event is full
CREATE OR REPLACE FUNCTION public.is_event_full(event_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    max_count INTEGER;
BEGIN
    SELECT 
        COUNT(DISTINCT player_id) FILTER (WHERE status = 'registered'),
        e.max_participants
    INTO current_count, max_count
    FROM public.event_registrations er
    JOIN public.events e ON e.id = er.event_id
    WHERE er.event_id = event_uuid
    GROUP BY e.max_participants;
    
    RETURN current_count >= max_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get player's registered events
CREATE OR REPLACE FUNCTION public.get_player_events(player_uuid UUID)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    start_datetime TIMESTAMPTZ,
    status TEXT,
    registration_status TEXT,
    checked_in BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.event_name,
        e.start_datetime,
        e.status,
        er.status as registration_status,
        er.checked_in
    FROM public.events e
    JOIN public.event_registrations er ON e.id = er.event_id
    WHERE er.player_id = player_uuid
    ORDER BY e.start_datetime ASC;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VERIFICATION QUERIES (run these to check setup)
-- ============================================================

-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('events', 'event_registrations', 'event_games')
ORDER BY table_name;

-- Check columns in events table (should have 18 columns now)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'events' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('events', 'event_registrations', 'event_games');

-- ============================================================
-- END OF SCHEMA CREATION
-- ============================================================
