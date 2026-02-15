-- 1. Lisätään is_admin sarake players-tauluun
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. Asetetaan admin-oikeudet halutulle käyttäjälle
-- Voit käyttää joko käyttäjänimeä tai sähköpostia
UPDATE public.players 
SET is_admin = true 
WHERE username = 'JARNO SAARINEN' 
   OR email = 'test@example.com'
   OR id = '5031f839-7710-477b-ac80-c4999a212547';

-- 3. Pakotetaan API-välimuistin nollaus
NOTIFY pgrst, 'reload schema';

SELECT '✅ Admin-oikeudet asetettu!' as status;