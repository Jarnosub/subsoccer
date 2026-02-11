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

-- Function to generate elimination bracket for a tournament (dynamically scales)
CREATE OR REPLACE FUNCTION public.generate_tournament_bracket(p_tournament_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_participant_count INT;
    v_bracket_size INT;
    v_rounds INT;
    v_current_round INT;
    v_matches_in_round INT;
    v_match_number INT;
    v_participants UUID[];
    v_player_index INT;
BEGIN
    -- Get registered participants (RANDOMIZED for fair matchups)
    SELECT array_agg(player_id ORDER BY random())
    INTO v_participants
    FROM public.event_registrations
    WHERE tournament_id = p_tournament_id AND status = 'registered';
    
    v_participant_count := array_length(v_participants, 1);
    
    IF v_participant_count IS NULL OR v_participant_count < 2 THEN
        RETURN false; -- Not enough players
    END IF;
    
    -- Calculate bracket size dynamically (next power of 2)
    v_bracket_size := power(2, ceil(log(2, v_participant_count)));
    
    -- Calculate number of rounds
    v_rounds := ceil(log(2, v_bracket_size));
    
    -- Clear existing matches
    DELETE FROM public.tournament_matches
    WHERE tournament_id = p_tournament_id;
    
    -- Generate first round matches
    v_current_round := v_bracket_size / 2; -- e.g., 8 players = round 4 (quarter-finals)
    v_matches_in_round := v_bracket_size / 2;
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

-- ==================== PART 4: TRIGGER TO SYNC WITH MATCHES TABLE ====================

-- Function to copy completed tournament match to matches table and update ELO
CREATE OR REPLACE FUNCTION public.sync_tournament_match_to_matches()
RETURNS TRIGGER AS $$
DECLARE
    v_player1_data RECORD;
    v_player2_data RECORD;
    v_winner_data RECORD;
    v_tournament_name TEXT;
    v_new_elo_p1 INT;
    v_new_elo_p2 INT;
    v_k_factor INT := 32;
    v_expected_p1 FLOAT;
    v_expected_p2 FLOAT;
    v_actual_p1 FLOAT;
    v_actual_p2 FLOAT;
BEGIN
    -- Only process when match is completed (not bye)
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        
        -- Get player data
        SELECT * INTO v_player1_data FROM public.players WHERE id = NEW.player1_id;
        SELECT * INTO v_player2_data FROM public.players WHERE id = NEW.player2_id;
        SELECT * INTO v_winner_data FROM public.players WHERE id = NEW.winner_id;
        
        -- Get tournament name
        SELECT tournament_name INTO v_tournament_name 
        FROM public.tournament_history 
        WHERE id = NEW.tournament_id;
        
        IF v_player1_data.id IS NOT NULL AND v_player2_data.id IS NOT NULL THEN
            
            -- Calculate ELO changes
            v_expected_p1 := 1.0 / (1.0 + power(10, (v_player2_data.elo - v_player1_data.elo) / 400.0));
            v_expected_p2 := 1.0 - v_expected_p1;
            
            IF NEW.winner_id = NEW.player1_id THEN
                v_actual_p1 := 1.0;
                v_actual_p2 := 0.0;
            ELSE
                v_actual_p1 := 0.0;
                v_actual_p2 := 1.0;
            END IF;
            
            v_new_elo_p1 := v_player1_data.elo + round(v_k_factor * (v_actual_p1 - v_expected_p1));
            v_new_elo_p2 := v_player2_data.elo + round(v_k_factor * (v_actual_p2 - v_expected_p2));
            
            -- Update player ELO ratings
            UPDATE public.players SET elo = v_new_elo_p1 WHERE id = NEW.player1_id;
            UPDATE public.players SET elo = v_new_elo_p2 WHERE id = NEW.player2_id;
            
            -- Update winner's win count
            UPDATE public.players 
            SET wins = COALESCE(wins, 0) + 1 
            WHERE id = NEW.winner_id;
            
            -- Insert match record into matches table
            INSERT INTO public.matches (
                player1,
                player2,
                winner,
                tournament_name,
                tournament_id,
                created_at
            ) VALUES (
                v_player1_data.username,
                v_player2_data.username,
                v_winner_data.username,
                v_tournament_name,
                NEW.tournament_id,
                NEW.completed_at
            );
            
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires after tournament_matches update
DROP TRIGGER IF EXISTS trigger_sync_tournament_match ON public.tournament_matches;

CREATE TRIGGER trigger_sync_tournament_match
    AFTER UPDATE ON public.tournament_matches
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_tournament_match_to_matches();

-- ==================== PART 5: WINNER ADVANCEMENT FUNCTION ====================

-- Function to advance winner to next round (called by UI after match completion)
CREATE OR REPLACE FUNCTION public.advance_winner_to_next_round(
    p_match_id UUID,
    p_winner_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_match RECORD;
    v_next_round INT;
    v_next_match_number INT;
    v_is_player1_slot BOOLEAN;
    v_update_field TEXT;
BEGIN
    -- Get current match details
    SELECT * INTO v_current_match 
    FROM public.tournament_matches 
    WHERE id = p_match_id;
    
    -- Calculate next round (rounds go: 8→4→2→1)
    v_next_round := v_current_match.round / 2;
    
    -- If already in final (round 1), no advancement needed
    IF v_next_round < 1 THEN
        RETURN true;
    END IF;
    
    -- Calculate which match in next round (match 1,2 → next match 1; match 3,4 → next match 2)
    v_next_match_number := CEIL(v_current_match.match_number::FLOAT / 2.0);
    
    -- Determine if winner goes to player1 or player2 slot (odd match numbers go to player1)
    v_is_player1_slot := (v_current_match.match_number % 2 = 1);
    
    -- Update next round match with winner
    IF v_is_player1_slot THEN
        UPDATE public.tournament_matches
        SET player1_id = p_winner_id
        WHERE tournament_id = v_current_match.tournament_id
        AND round = v_next_round
        AND match_number = v_next_match_number;
    ELSE
        UPDATE public.tournament_matches
        SET player2_id = p_winner_id
        WHERE tournament_id = v_current_match.tournament_id
        AND round = v_next_round
        AND match_number = v_next_match_number;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== PART 6: VERIFICATION QUERIES ====================

-- Check tournament_matches table
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'tournament_matches' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('generate_tournament_bracket', 'sync_tournament_match_to_matches', 'advance_winner_to_next_round');

-- Check trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name = 'trigger_sync_tournament_match';

-- ============================================================
-- EXPECTED RESULTS:
-- 1. tournament_matches table with 13 columns
-- 2. generate_tournament_bracket function created
-- 3. sync_tournament_match_to_matches function created
-- 4. advance_winner_to_next_round function created
-- 5. trigger_sync_tournament_match trigger created
-- ============================================================
