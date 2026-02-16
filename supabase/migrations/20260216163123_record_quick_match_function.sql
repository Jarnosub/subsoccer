-- 1. Poistetaan vanha funktio varmuuden vuoksi, jotta allekirjoitus on varmasti puhdas
DROP FUNCTION IF EXISTS public.record_quick_match_v1(uuid, uuid, int, int, boolean, jsonb);

-- 2. Luodaan funktio uudelleen
CREATE OR REPLACE FUNCTION public.record_quick_match_v1(
    p1_id uuid,
    p2_id uuid,
    p1_new_elo int,
    p2_new_elo int,
    p1_won boolean,
    match_data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Suoritetaan ylläpitäjän oikeuksilla
AS $$
BEGIN
    -- Päivitä Pelaaja 1 jos ei vieras
    IF p1_id IS NOT NULL THEN
        UPDATE public.players 
        SET elo = p1_new_elo,
            wins = CASE WHEN p1_won THEN wins + 1 ELSE wins END,
            losses = CASE WHEN NOT p1_won THEN losses + 1 ELSE losses END
        WHERE id = p1_id;
    END IF;

    -- Päivitä Pelaaja 2 jos ei vieras
    IF p2_id IS NOT NULL THEN
        UPDATE public.players 
        SET elo = p2_new_elo,
            wins = CASE WHEN NOT p1_won THEN wins + 1 ELSE wins END,
            losses = CASE WHEN p1_won THEN losses + 1 ELSE losses END
        WHERE id = p2_id;
    END IF;

    -- Lisää ottelu matches-tauluun
    INSERT INTO public.matches (
        player1, player2, winner, 
        player1_score, player2_score, 
        tournament_id, tournament_name, 
        created_at
    ) VALUES (
        match_data->>'player1', match_data->>'player2', match_data->>'winner',
        (match_data->>'player1_score')::int, (match_data->>'player2_score')::int,
        (match_data->>'tournament_id')::uuid, match_data->>'tournament_name',
        NOW()
    );
END;
$$;

-- 3. ANNA KÄYTTÖOIKEUDET (Tämä on kriittinen PGRST202-virheen korjaamiseksi)
GRANT EXECUTE ON FUNCTION public.record_quick_match_v1 TO anon, authenticated, service_role;

-- 4. Pakota skeeman välimuistin päivitys
NOTIFY pgrst, 'reload schema';
