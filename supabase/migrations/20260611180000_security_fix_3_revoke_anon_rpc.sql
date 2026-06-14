-- ============================================================
-- SECURITY FIX #3: Revoke anonymous access to record_quick_match_v1
-- and add participant verification
-- ============================================================
-- WHAT THIS DOES:
-- 1. Removes anon access to record_quick_match_v1 (ranking manipulation prevention)
-- 2. Adds auth.uid() check — must be logged in
-- 3. Adds participant check — caller must be one of the players
-- 4. Removes HQ bypass (anyone could set game_id='HQ' to bypass ELO cap)
-- 5. Validates tournament_id exists before bypassing ELO cap
--
-- ROLLBACK: See bottom of file
-- ============================================================

-- Step 1: Drop old function (parameter names changed)
DROP FUNCTION IF EXISTS public.record_quick_match_v1(uuid, uuid, int, int, boolean, jsonb);

-- Step 2: Create secured version (anon will NOT get GRANT)
CREATE OR REPLACE FUNCTION public.record_quick_match_v1(
    p1_id uuid,
    p2_id uuid,
    p1_new_elo_client int,  -- Ignored (kept for API compatibility)
    p2_new_elo_client int,  -- Ignored (kept for API compatibility)
    p1_won boolean,
    match_data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_elo_a int := 1300;
    v_elo_b int := 1300;
    v_new_elo_a int;
    v_new_elo_b int;
    expected_score_a float;
    expected_score_b float;
    actual_score_a int;
    actual_score_b int;
    is_verified_table boolean := false;
    v_game_id uuid;
    v_tournament_exists boolean := false;
    ELO_CAP int := 1600;
BEGIN
    -- ==========================================
    -- SECURITY CHECK 1: Must be authenticated
    -- ==========================================
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required to record matches';
    END IF;

    -- ==========================================
    -- SECURITY CHECK 2: Caller must be a participant
    -- (Allow NULL player = guest, but at least one must be the caller)
    -- ==========================================
    IF p1_id IS NOT NULL AND p2_id IS NOT NULL THEN
        -- Both players identified: caller must be one of them
        IF auth.uid() != p1_id AND auth.uid() != p2_id THEN
            RAISE EXCEPTION 'You must be a participant in the match';
        END IF;
    ELSIF p1_id IS NOT NULL THEN
        IF auth.uid() != p1_id THEN
            RAISE EXCEPTION 'You must be a participant in the match';
        END IF;
    ELSIF p2_id IS NOT NULL THEN
        IF auth.uid() != p2_id THEN
            RAISE EXCEPTION 'You must be a participant in the match';
        END IF;
    ELSE
        RAISE EXCEPTION 'At least one player must be identified';
    END IF;

    -- 1. Get current ELOs
    IF p1_id IS NOT NULL THEN
        SELECT COALESCE(elo, 1300) INTO v_elo_a FROM public.players WHERE id = p1_id;
    END IF;

    IF p2_id IS NOT NULL THEN
        SELECT COALESCE(elo, 1300) INTO v_elo_b FROM public.players WHERE id = p2_id;
    END IF;

    -- 2. Calculate ELO changes
    expected_score_a := 1.0 / (1.0 + POWER(10.0, (v_elo_b - v_elo_a) / 400.0));
    expected_score_b := 1.0 / (1.0 + POWER(10.0, (v_elo_a - v_elo_b) / 400.0));

    IF p1_won THEN
        actual_score_a := 1;
        actual_score_b := 0;
    ELSE
        actual_score_a := 0;
        actual_score_b := 1;
    END IF;

    v_new_elo_a := ROUND(v_elo_a + 32.0 * (actual_score_a - expected_score_a));
    v_new_elo_b := ROUND(v_elo_b + 32.0 * (actual_score_b - expected_score_b));

    -- Minimum change enforcement
    IF actual_score_a = 1 AND v_new_elo_a <= v_elo_a THEN v_new_elo_a := v_elo_a + 1; END IF;
    IF actual_score_b = 1 AND v_new_elo_b <= v_elo_b THEN v_new_elo_b := v_elo_b + 1; END IF;
    IF actual_score_a = 0 AND v_new_elo_a >= v_elo_a THEN v_new_elo_a := GREATEST(0, v_elo_a - 1); END IF;
    IF actual_score_b = 0 AND v_new_elo_b >= v_elo_b THEN v_new_elo_b := GREATEST(0, v_elo_b - 1); END IF;

    -- 3. Verified table check (SECURED)
    -- REMOVED: HQ bypass (was exploitable by anyone)
    IF match_data->>'game_id' IS NOT NULL AND match_data->>'game_id' != 'HQ' THEN
        BEGIN
            v_game_id := (match_data->>'game_id')::uuid;
            SELECT (verified AND is_public) INTO is_verified_table 
            FROM public.games WHERE id = v_game_id;
        EXCEPTION WHEN OTHERS THEN
            is_verified_table := false;
        END;
    END IF;

    -- Tournament bypass: VERIFY tournament actually exists
    IF match_data->>'tournament_id' IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM public.tournament_history 
            WHERE id = (match_data->>'tournament_id')::uuid
        ) INTO v_tournament_exists;
        
        IF v_tournament_exists THEN
            is_verified_table := true;
        END IF;
    END IF;

    -- 4. ELO Cap enforcement
    IF NOT is_verified_table THEN
        IF actual_score_a = 1 THEN
            IF v_elo_a >= ELO_CAP THEN v_new_elo_a := v_elo_a; 
            ELSIF v_new_elo_a > ELO_CAP THEN v_new_elo_a := ELO_CAP; 
            END IF;
        END IF;

        IF actual_score_b = 1 THEN
            IF v_elo_b >= ELO_CAP THEN v_new_elo_b := v_elo_b; 
            ELSIF v_new_elo_b > ELO_CAP THEN v_new_elo_b := ELO_CAP; 
            END IF;
        END IF;
    END IF;

    -- 5. Update player stats
    IF p1_id IS NOT NULL THEN
        UPDATE public.players 
        SET elo = v_new_elo_a,
            wins = CASE WHEN p1_won THEN wins + 1 ELSE wins END,
            losses = CASE WHEN NOT p1_won THEN losses + 1 ELSE losses END
        WHERE id = p1_id;
    END IF;

    IF p2_id IS NOT NULL THEN
        UPDATE public.players 
        SET elo = v_new_elo_b,
            wins = CASE WHEN NOT p1_won THEN wins + 1 ELSE wins END,
            losses = CASE WHEN p1_won THEN losses + 1 ELSE losses END
        WHERE id = p2_id;
    END IF;

    -- 6. Record match
    INSERT INTO public.matches (
        player1, player2, winner, 
        player1_score, player2_score, 
        tournament_id, tournament_name, 
        event_id,
        created_at
    ) VALUES (
        match_data->>'player1', match_data->>'player2', match_data->>'winner',
        CASE WHEN match_data->>'player1_score' IS NOT NULL THEN (match_data->>'player1_score')::int ELSE NULL END, 
        CASE WHEN match_data->>'player2_score' IS NOT NULL THEN (match_data->>'player2_score')::int ELSE NULL END,
        CASE WHEN match_data->>'tournament_id' IS NOT NULL THEN (match_data->>'tournament_id')::uuid ELSE NULL END, 
        match_data->>'tournament_name',
        CASE WHEN match_data->>'event_id' IS NOT NULL THEN (match_data->>'event_id')::uuid ELSE NULL END,
        NOW()
    );
END;
$$;

-- Keep permissions for authenticated and service_role only
GRANT EXECUTE ON FUNCTION public.record_quick_match_v1 TO authenticated, service_role;

SELECT '✅ SECURITY FIX #3 APPLIED: record_quick_match_v1 secured' as status;

-- ============================================================
-- ROLLBACK (run only if something breaks):
-- ============================================================
-- GRANT EXECUTE ON FUNCTION public.record_quick_match_v1 TO anon;
-- Then re-run the old function from: 20260328221500_secure_elo_calculation.sql
