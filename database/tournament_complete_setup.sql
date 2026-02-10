-- ============================================================
-- COMPLETE TOURNAMENT SETUP
-- Run this in Supabase SQL Editor AFTER master_fix.sql
-- ============================================================

-- ==================== ADD TOURNAMENT FIELDS ====================

-- Add organizer_id (who created the tournament)
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.players(id) ON DELETE SET NULL;

-- Add tournament_type (elimination, swiss, round_robin)
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'elimination' 
CHECK (tournament_type IN ('elimination', 'swiss', 'round_robin'));

-- Add max_participants (how many players can register)
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS max_participants INTEGER DEFAULT 8;

-- Add status (scheduled, ongoing, completed, cancelled)
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled' 
CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled'));

-- Add tournament_name (optional name for event tournaments)
ALTER TABLE public.tournament_history 
ADD COLUMN IF NOT EXISTS tournament_name TEXT;

-- ==================== ADD TOURNAMENT_ID TO REGISTRATIONS ====================

-- Add tournament_id to event_registrations (link to specific tournament)
ALTER TABLE public.event_registrations 
ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournament_history(id) ON DELETE CASCADE;

-- ==================== ADD INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_tournament_history_organizer_id 
ON public.tournament_history(organizer_id);

CREATE INDEX IF NOT EXISTS idx_tournament_history_status 
ON public.tournament_history(status);

CREATE INDEX IF NOT EXISTS idx_tournament_history_tournament_type 
ON public.tournament_history(tournament_type);

CREATE INDEX IF NOT EXISTS idx_event_registrations_tournament_id 
ON public.event_registrations(tournament_id);

-- ==================== VERIFICATION ====================

-- Check tournament_history columns
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'tournament_history' 
AND column_name IN ('organizer_id', 'tournament_type', 'max_participants', 'status', 'tournament_name', 'event_id', 'game_id')
AND table_schema = 'public'
ORDER BY column_name;

-- Check event_registrations has tournament_id
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'event_registrations' 
AND column_name = 'tournament_id'
AND table_schema = 'public';

-- ============================================================
-- EXPECTED RESULTS:
-- 1. Should show 7 columns in tournament_history (including new ones)
-- 2. Should show tournament_id in event_registrations
-- ============================================================
