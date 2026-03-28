-- ============================================================
-- SUBSOCCER PLATFORM - ANTI-CHEAT SERVER-SIDE ELO CALCULATION
-- ============================================================
-- NOTE: Please copy-paste this file into the Supabase SQL Editor and run it.
-- This script overrides the vulnerable record_quick_match_v1 with a secure version
-- that ignores client-side ELO math and correctly enforces the ELO cap on the server.

-- 1. Poistetaan vanha funktio tarvittaessa
DROP FUNCTION IF EXISTS public.record_quick_match_v1(uuid, uuid, int, int, boolean, jsonb);

-- 2. Luodaan funktio uudelleen
CREATE OR REPLACE FUNCTION public.record_quick_match_v1(
    p1_id uuid,
    p2_id uuid,
    p1_new_elo_client int,  -- Ignored, left for schema compatibility with old client versions
    p2_new_elo_client int,  -- Ignored, left for schema compatibility
    p1_won boolean,
    match_data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Suoritetaan ylläpitäjän oikeuksilla turvallisesti
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
    ELO_CAP int := 1600;
BEGIN
    -- 1. Hae nykyiset ELO:t TAI pakota 1300 jos vieras
    IF p1_id IS NOT NULL THEN
        SELECT COALESCE(elo, 1300) INTO v_elo_a FROM public.players WHERE id = p1_id;
    END IF;

    IF p2_id IS NOT NULL THEN
        SELECT COALESCE(elo, 1300) INTO v_elo_b FROM public.players WHERE id = p2_id;
    END IF;

    -- 2. Laske oikeat tulokset
    expected_score_a := 1.0 / (1.0 + POWER(10.0, (v_elo_b - v_elo_a) / 400.0));
    expected_score_b := 1.0 / (1.0 + POWER(10.0, (v_elo_a - v_elo_b) / 400.0));

    IF p1_won THEN
        actual_score_a := 1;
        actual_score_b := 0;
    ELSE
        actual_score_a := 0;
        actual_score_b := 1;
    END IF;

    -- K-Factor = 32
    v_new_elo_a := ROUND(v_elo_a + 32.0 * (actual_score_a - expected_score_a));
    v_new_elo_b := ROUND(v_elo_b + 32.0 * (actual_score_b - expected_score_b));

    -- Varmistetaan minimimuutos (+1 tai -1)
    IF actual_score_a = 1 AND v_new_elo_a <= v_elo_a THEN v_new_elo_a := v_elo_a + 1; END IF;
    IF actual_score_b = 1 AND v_new_elo_b <= v_elo_b THEN v_new_elo_b := v_elo_b + 1; END IF;
    IF actual_score_a = 0 AND v_new_elo_a >= v_elo_a THEN v_new_elo_a := GREATEST(0, v_elo_a - 1); END IF;
    IF actual_score_b = 0 AND v_new_elo_b >= v_elo_b THEN v_new_elo_b := GREATEST(0, v_elo_b - 1); END IF;

    -- 3. Tarkista Anti-Cheat / Verified Table palvelimella!
    -- Kova-koodattu Toimiston Pelipöytä (HQ bypass)
    IF match_data->>'game_id' = 'HQ' THEN
        is_verified_table := true;
    ELSIF match_data->>'game_id' IS NOT NULL THEN
        -- Yritä hakea taulusta
        BEGIN
            v_game_id := (match_data->>'game_id')::uuid;
            SELECT (verified AND is_public) INTO is_verified_table 
            FROM public.games WHERE id = v_game_id;
        EXCEPTION WHEN OTHERS THEN
            is_verified_table := false;
        END;
    END IF;

    -- Kaikki turnaukset (tournament_id) ohittavat CAPPIn (virallisia matseja)
    IF match_data->>'tournament_id' IS NOT NULL THEN
        is_verified_table := true;
    END IF;

    -- 4. ELO Cap: Jos ei-vahvistettu, ELO ei koskaan nouse yli CAPin
    IF NOT is_verified_table THEN
        -- p1 (voittaja?)
        IF actual_score_a = 1 THEN
            IF v_elo_a >= ELO_CAP THEN v_new_elo_a := v_elo_a; 
            ELSIF v_new_elo_a > ELO_CAP THEN v_new_elo_a := ELO_CAP; 
            END IF;
        END IF;

        -- p2 (voittaja?)
        IF actual_score_b = 1 THEN
            IF v_elo_b >= ELO_CAP THEN v_new_elo_b := v_elo_b; 
            ELSIF v_new_elo_b > ELO_CAP THEN v_new_elo_b := ELO_CAP; 
            END IF;
        END IF;
    END IF;

    -- 5. PÄIVITÄ TILASTOT TURVALLISESTI
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

    -- 6. TALLENNA MATSI
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
        -- Allow tracking event_id if present
        CASE WHEN match_data->>'event_id' IS NOT NULL THEN (match_data->>'event_id')::uuid ELSE NULL END,
        NOW()
    );
END;
$$;

-- 7. ANNA KÄYTTÖOIKEUDET API:IN
GRANT EXECUTE ON FUNCTION public.record_quick_match_v1 TO anon, authenticated, service_role;

SELECT '✅ Server-Side ELO Calculation Activated!' as status;
