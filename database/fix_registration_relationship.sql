-- ============================================================
-- FIX: Missing relationship between event_registrations and players
-- ============================================================

-- 1. Varmistetaan, että viiteavain on olemassa
-- Poistetaan vanha jos se on olemassa eri nimellä ja luodaan standardi viiteavain
ALTER TABLE public.event_registrations 
DROP CONSTRAINT IF EXISTS event_registrations_player_id_fkey;

ALTER TABLE public.event_registrations 
ADD CONSTRAINT event_registrations_player_id_fkey 
FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;

-- 2. PAKOTETAAN PostgREST päivittämään välimuisti (TÄRKEÄ!)
-- Tämä korjaa "Could not find a relationship" virheen
NOTIFY pgrst, 'reload schema';

SELECT '✅ Viiteavain korjattu ja API-välimuisti nollattu!' as status;