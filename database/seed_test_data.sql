-- Lisätään testipelaaja (Järjestäjä)
-- Käytetään kiinteää ID:tä, joka vastaa virheilmoitustasi
INSERT INTO public.players (id, username, email, elo, wins, losses)
VALUES ('6cb10d26-f142-401d-8d0a-dbdf8228de79', 'TEST_ORGANIZER', 'test@example.com', 1300, 0, 0)
ON CONFLICT (id) DO UPDATE SET 
    username = EXCLUDED.username,
    email = EXCLUDED.email;

-- Lisätään testipelipöytä
-- Linkitetään se äsken luotuun pelaajaan (owner_id)
INSERT INTO public.games (id, game_name, location, is_public, owner_id, verified)
VALUES (gen_random_uuid(), 'Pasila Table #1', 'Main Hall', true, '6cb10d26-f142-401d-8d0a-dbdf8228de79', true)
ON CONFLICT DO NOTHING;

-- Tarkistetaan lisätty data
SELECT 'Pelaajat:' as info, count(*) FROM public.players
UNION ALL
SELECT 'Pelipöydät:', count(*) FROM public.games;