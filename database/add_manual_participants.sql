-- ============================================================
-- MANUAL PARTICIPANTS SUPPORT
-- Allows adding players without registration
-- ============================================================

-- Add player_name column to event_registrations
ALTER TABLE public.event_registrations 
ADD COLUMN IF NOT EXISTS player_name TEXT;

-- Make player_id optional (for guest players)
ALTER TABLE public.event_registrations 
ALTER COLUMN player_id DROP NOT NULL;

-- Update existing records to have player_name from players table
UPDATE public.event_registrations AS er
SET player_name = p.username
FROM public.players AS p
WHERE er.player_id = p.id 
AND er.player_name IS NULL;

-- Add constraint: must have either player_id OR player_name
ALTER TABLE public.event_registrations
ADD CONSTRAINT player_info_required 
CHECK (player_id IS NOT NULL OR player_name IS NOT NULL);

-- Update RPC function to work with player_name
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
    v_participant_names TEXT[];
    v_player_index INT;
    bye_match RECORD;
    v_next_round INT;
    v_next_match_number INT;
    v_is_player1_slot BOOLEAN;
    v_temp_player_id UUID;
    v_temp_player_name TEXT;
BEGIN
    -- Get registered participants (RANDOMIZED for fair matchups)
    -- For registered players: use player_id
    -- For guest players: create temporary player record
    SELECT 
        array_agg(
            CASE 
                WHEN player_id IS NOT NULL THEN player_id
                ELSE gen_random_uuid() -- Generate temp ID for guest players
            END 
            ORDER BY random()
        ),
        array_agg(player_name ORDER BY random())
    INTO v_participants, v_participant_names
    FROM public.event_registrations
    WHERE tournament_id = p_tournament_id AND status = 'registered';
    
    v_participant_count := array_length(v_participants, 1);
    
    IF v_participant_count IS NULL OR v_participant_count < 2 THEN
        RETURN false; -- Not enough players
    END IF;
    
    -- Create temporary player records for guests (if needed)
    FOR i IN 1..v_participant_count LOOP
        v_temp_player_id := v_participants[i];
        v_temp_player_name := v_participant_names[i];
        
        -- Check if this is a guest player (doesn't exist in players table)
        IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_temp_player_id) THEN
            -- Create temporary player record
            INSERT INTO public.players (id, username, elo, wins, created_at)
            VALUES (v_temp_player_id, v_temp_player_name, 1000, 0, NOW())
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END LOOP;
    
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
    
    -- Handle all BYE matches: set winner and advance to next round
    FOR bye_match IN 
        SELECT * FROM public.tournament_matches 
        WHERE tournament_id = p_tournament_id 
        AND status = 'bye'
        AND player1_id IS NOT NULL
        ORDER BY round DESC, match_number
    LOOP
        -- Set winner to the player who got the bye
        UPDATE public.tournament_matches
        SET winner_id = bye_match.player1_id, 
            completed_at = NOW()
        WHERE id = bye_match.id;
        
        -- Calculate next round position
        v_next_round := bye_match.round / 2;
        
        IF v_next_round >= 1 THEN
            v_next_match_number := CEIL(bye_match.match_number::FLOAT / 2.0);
            v_is_player1_slot := (bye_match.match_number % 2 = 1);
            
            -- Advance winner to next round
            IF v_is_player1_slot THEN
                UPDATE public.tournament_matches
                SET player1_id = bye_match.player1_id
                WHERE tournament_id = p_tournament_id
                AND round = v_next_round
                AND match_number = v_next_match_number;
            ELSE
                UPDATE public.tournament_matches
                SET player2_id = bye_match.player1_id
                WHERE tournament_id = p_tournament_id
                AND round = v_next_round
                AND match_number = v_next_match_number;
            END IF;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Check new column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'event_registrations' 
AND column_name = 'player_name';

-- Should return: player_name | text | YES
