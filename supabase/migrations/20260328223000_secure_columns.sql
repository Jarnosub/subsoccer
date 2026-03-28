-- ============================================================
-- SUBSOCCER PLATFORM - SUPERADMIN & HACKER COLUMN PROTECTION
-- ============================================================
-- This script protects sensitive player fields (is_admin, elo, wins, password)
-- using a Trigger that silently restores original values if a user tries to modify them
-- over the REST API (browser console).
--
-- Note: 'service_role' (used by RPC like record_quick_match_v1) is unaffected.

-- 1. Ylikirjoittava Trigger-funktio, joka hiljalleen estää arkaluontoisten sarakkeiden muokkauksen.
CREATE OR REPLACE FUNCTION public.protect_sensitive_player_data()
RETURNS TRIGGER AS $$
DECLARE
    role_claim text;
BEGIN
    -- Hae tietokantasession aktiivinen käyttäjä.
    -- Jos muokkaaja käyttää PostgREST API:a (selain), hänen asettamansa user on 'authenticated' tai 'anon'.
    -- Jos prosessi on SERVER-PUOLEN 'SECURITY DEFINER' -funktio (esim. record_quick_match_v1),
    -- user on yleensä 'postgres' tai 'service_role'.
    IF current_user IN ('authenticated', 'anon') THEN
        -- Pakotetaan vanhat arvot takaisin näille kentille ("hiljainen esto")
        NEW.is_admin := OLD.is_admin;
        NEW.elo := OLD.elo;
        NEW.wins := OLD.wins;
        NEW.losses := OLD.losses;
        NEW.password := OLD.password; -- Selaimen kautta ei vaihdeta legacy-salasanoja
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Liitä Trigger players-tauluun
DROP TRIGGER IF EXISTS protect_sensitive_player_data_trigger ON public.players;

CREATE TRIGGER protect_sensitive_player_data_trigger
BEFORE UPDATE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.protect_sensitive_player_data();

-- 3. DESTROY EXPOSED SUPERADMIN PASSWORDS IN DATABASE
-- Jos Jarno (tai mikä tahansa admin) on jo migroinut Auth-puolelle, poistetaan heidän
-- vanha legacy-salasanaläjä tekstimuodossa `players`-taulusta, jottei selain voi ikinä sitä ladata!
UPDATE public.players
SET password = NULL
WHERE is_admin = true AND email IS NOT NULL;

SELECT '✅ Superadmin Password Wiped from API \u0026 Console Hacker Columns Locked!' as status;
