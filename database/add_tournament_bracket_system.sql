-- ============================================================
-- TOURNAMENT BRACKET SYSTEM
-- Handles elimination bracket matches and results
-- ============================================================

-- ==================== PART 1: TOURNAMENT_MATCHES TABLE ====================

-- Create table for tournament matches (bracket system)
CREATE TABLE IF NOT EXISTS public.tournament_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournament_history(id) ON DELETE CASCADE,
    round INT NOT NULL, -- 1=Final, 2=Semi, 4=Quarter, 8=Round of 16, etc.
    match_number INT NOT NULL, -- Position within the round (1,2,3...)
    player1_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    player2_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    winner_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
    player1_score INT DEFAULT 0,
    player2_score INT DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'bye')),
    started_at TIMESTAMPTZ,
   completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT match_round_unique UNIQUE (tournament_id, round, match_number)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament 
ON public.tournament_matches(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_round 
ON public.tournament_matches(tournament_id, round);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_players 
ON public.tournament_matches(player1_id, player2_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_status 
ON public.tournament_matches(status);

-- ==================== PART 2: RLS POLICIES ====================

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Anyone can insert matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Anyone can update matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Anyone can delete matches" ON public.tournament_matches;

CREATE POLICY "Anyone can view matches"
    ON public.tournament_matches FOR SELECT
    USING (true);

CREATE POLICY "Anyone can insert matches"
    ON public.tournament_matches FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update matches"
    ON public.tournament_matches FOR UPDATE
    USING (true);

CREATE POLICY "Anyone can delete matches"
    ON public.tournament_matches FOR DELETE
    USING (true);

-- ==================== PART 3: BRACKET GENERATION FUNCTION ====================

-- Function to generate elimination bracket for a tournament
CREATE OR REPLACE FUNCTION public.generate_tournament_bracket(p_tournament_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_participant_count INT;
    v_max_participants INT;
    v_rounds INT;
    v_current_round INT;
    v_matches_in_round INT;
    v_match_number INT;
    v_participants UUID[];
    v_player_index INT;
BEGIN
    -- Get tournament info and participants
    SELECT max_participants INTO v_max_participants
    FROM public.tournament_history
    WHERE id = p_tournament_id;
    
    -- Get registered participants
    SELECT array_agg(player_id ORDER BY created_at)
    INTO v_participants
    FROM public.event_registrations
    WHERE tournament_id = p_tournament_id AND status = 'registered';
    
    v_participant_count := array_length(v_participants, 1);
    
    IF v_participant_count IS NULL OR v_participant_count < 2 THEN
        RETURN false; -- Not enough players
    END IF;
    
    -- Calculate number of rounds (log2 of max participants)
    v_rounds := ceil(log(2, v_max_participants));
    
    -- Clear existing matches
    DELETE FROM public.tournament_matches
    WHERE tournament_id = p_tournament_id;
    
    -- Generate first round matches
    v_current_round := v_max_participants / 2; -- e.g., 8 players = round 4 (quarter-finals)
    v_matches_in_round := v_max_participants / 2;
    v_player_index := 1;
    
    -- Create first round matches with participants
    FOR v_match_number IN 1..v_matches_in_round LOOP
        INSERT INTO public.tournament_matches (
            tournament_id, round, match_number,
            player1_id, player2_id, status
        ) VALUES (
            p_tournament_id,
            v_current_round,
            v_match_number,
            CASE WHEN v_player_index <= v_participant_count THEN v_participants[v_player_index] ELSE NULL END,
            CASE WHEN v_player_index + 1 <= v_participant_count THEN v_participants[v_player_index + 1] ELSE NULL END,
            CASE 
                WHEN v_player_index <= v_participant_count AND v_player_index + 1 <= v_participant_count THEN 'pending'
                WHEN v_player_index <= v_participant_count THEN 'bye'
                ELSE 'bye'
            END
        );
        
        -- Handle bye (advance player automatically if only one player)
        IF v_player_index <= v_participant_count AND v_player_index + 1 > v_participant_count THEN
            UPDATE public.tournament_matches
            SET winner_id = player1_id, status = 'bye', completed_at = NOW()
            WHERE tournament_id = p_tournament_id 
            AND round = v_current_round 
            AND match_number = v_match_number;
        END IF;
        
        v_player_index := v_player_index + 2;
    END LOOP;
    
    -- Generate empty matches for subsequent rounds
    WHILE v_current_round > 1 LOOP
        v_current_round := v_current_round / 2;
        v_matches_in_round := v_matches_in_round / 2;
        
        FOR v_match_number IN 1..v_matches_in_round LOOP
            INSERT INTO public.tournament_matches (
                tournament_id, round, match_number,
                player1_id, player2_id, status
            ) VALUES (
                p_tournament_id,
                v_current_round,
                v_match_number,
                NULL, NULL, 'pending'
            );
        END LOOP;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== PART 4: VERIFICATION QUERIES ====================

-- Check tournament_matches table
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'tournament_matches' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'generate_tournament_bracket';

-- ============================================================
-- EXPECTED RESULTS:
-- 1. tournament_matches table with 13 columns
-- 2. generate_tournament_bracket function created
-- ============================================================
