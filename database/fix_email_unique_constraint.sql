-- 1. Poistetaan mahdolliset duplikaatit sähköpostin perusteella (pidetään uusin)
-- Tämä varmistaa, että constraintin lisääminen ei epäonnistu olemassa olevan datan takia
DELETE FROM public.players a USING public.players b 
WHERE a.id < b.id AND a.email = b.email;

-- 2. Lisätään uniikki-rajoite email-sarakkeeseen
-- Tämä on pakollinen, jotta koodin 'upsert' toimii
DROP INDEX IF EXISTS public.idx_players_email_unique;
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS idx_players_email_unique;
ALTER TABLE public.players 
ADD CONSTRAINT idx_players_email_unique UNIQUE (email);

-- 3. Pakotetaan API-välimuistin nollaus
NOTIFY pgrst, 'reload schema';

SELECT '✅ Uniikki-rajoite lisätty onnistuneesti! Upsert toimii nyt.' as status;
