-- ============================================================
-- FIX: Allow admin users to toggle is_admin via trigger
-- ============================================================
-- PROBLEM: The protect_sensitive_player_data trigger silently 
-- restores is_admin to its old value on every UPDATE where 
-- auth.uid() IS NOT NULL. This blocks admin toggle from working.
--
-- FIX: Allow admin callers to change is_admin while still
-- protecting elo, wins, losses, and password for everyone.
-- ============================================================

-- Update trigger to allow admin-initiated is_admin changes
CREATE OR REPLACE FUNCTION public.protect_sensitive_player_data()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() IS NOT NULL THEN
        -- Always protect these fields from REST API changes
        NEW.elo := OLD.elo;
        NEW.wins := OLD.wins;
        NEW.losses := OLD.losses;
        NEW.password := OLD.password;
        
        -- Protect is_admin UNLESS the caller is an admin
        IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true) THEN
            NEW.is_admin := OLD.is_admin;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure toggle RPC is clean and grantable
CREATE OR REPLACE FUNCTION public.toggle_admin_status(p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access Denied: Only admins can toggle admin status';
  END IF;

  UPDATE public.players 
  SET is_admin = NOT is_admin
  WHERE id = p_target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_admin_status(uuid) TO authenticated;

SELECT '✅ FIX: Admin toggle now works — admins can change is_admin, all other fields remain protected' as status;
