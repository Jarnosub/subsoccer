-- ============================================================
-- TOURNAMENT_HISTORY TABLE UPDATES
-- Add fields needed for tournament creation via events
-- Run this in Supabase SQL Editor
-- ============================================================

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

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tournament_history_organizer_id 
ON public.tournament_history(organizer_id);

CREATE INDEX IF NOT EXISTS idx_tournament_history_status 
ON public.tournament_history(status);

CREATE INDEX IF NOT EXISTS idx_tournament_history_tournament_type 
ON public.tournament_history(tournament_type);

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================

-- Check that new columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'tournament_history' 
AND column_name IN ('organizer_id', 'tournament_type', 'max_participants', 'status')
AND table_schema = 'public'
ORDER BY ordinal_position;
