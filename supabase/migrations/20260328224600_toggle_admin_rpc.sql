-- ============================================================
-- SUBSOCCER PLATFORM - ADMIN TOGGLE RPC
-- ============================================================
-- Tämä RPC-funktio korvaa suoran REST API -päivityksen, jonka 
-- aikaisempi "protect_sensitive_player_data" -triggeri estää.
-- Tämä ajetaan "SECURITY DEFINER" -oikeuksilla palvelimella.

CREATE OR REPLACE FUNCTION public.toggle_admin_status(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Tarkistetaan että kutsujalla on oikeasti admin-oikeudet
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access Denied: Only admins can toggle admin status';
  END IF;

  -- 2. Tuhlataan / vaihdetaan kohdekäyttäjän admin-status vastakkaiseksi
  UPDATE public.players 
  SET is_admin = NOT is_admin
  WHERE id = p_target;
END;
$$;

SELECT '✅ Toggle Admin RPC asennettu! (Bypassoi triggerin adminien toimesta korrektiin käyttöön)' as status;
