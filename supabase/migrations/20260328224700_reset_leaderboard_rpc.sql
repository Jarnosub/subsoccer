-- ============================================================
-- SUBSOCCER PLATFORM - RESET LEADERBOARD RPC
-- ============================================================
-- Tuhoaa kaikkien pelaajien ELO:n ja wins/losses tilastot.
-- Tämä ohittaa normaalin Trigger-lukituksen koska ajetaan palvelimella.

CREATE OR REPLACE FUNCTION public.reset_global_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Tarkistetaan että kutsujalla on oikeasti admin-oikeudet
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access Denied: Only admins can reset the leaderboard';
  END IF;

  -- 2. Nollataan kaikkien ELO ja tilastot
  UPDATE public.players 
  SET elo = 1300, wins = 0, losses = 0
  WHERE username != 'SYSTEM_RESERVED_NAME';
END;
$$;

SELECT '✅ Reset Leaderboard RPC asennettu! (Bypassoi triggerin)' as status;
