-- =====================================================
-- Games table RLS: Owner-based access control
-- Date: 2026-06-14
-- 
-- Ensures that only the owner of a game can UPDATE/DELETE it.
-- Admins can also UPDATE/DELETE any game.
-- Anyone can SELECT (public games are visible to all).
-- Authenticated users can INSERT (to register new games).
-- Includes RPC for secure ownership transfer.
-- =====================================================

-- Enable RLS on games table
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read games (needed for QR scan, public map, etc.)
CREATE POLICY "games_select_all" ON games
    FOR SELECT
    USING (true);

-- Policy: Authenticated users can insert new games (must be their own)
CREATE POLICY "games_insert_authenticated" ON games
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = owner_id);

-- Policy: Only owner OR admin can update games
CREATE POLICY "games_update_owner_or_admin" ON games
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = owner_id
        OR EXISTS (
            SELECT 1 FROM players
            WHERE players.id = auth.uid()
            AND players.is_admin = true
        )
    );

-- Policy: Only owner OR admin can delete games
CREATE POLICY "games_delete_owner_or_admin" ON games
    FOR DELETE
    TO authenticated
    USING (
        auth.uid() = owner_id
        OR EXISTS (
            SELECT 1 FROM players
            WHERE players.id = auth.uid()
            AND players.is_admin = true
        )
    );

-- =====================================================
-- Secure Ownership Transfer RPC
-- Called by new owner after current owner approves
-- Validates the transfer request exists and is pending
-- =====================================================
CREATE OR REPLACE FUNCTION transfer_game_ownership(
    p_game_id UUID,
    p_transfer_request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request RECORD;
    v_new_owner_id UUID;
BEGIN
    v_new_owner_id := auth.uid();

    -- Verify the transfer request exists, is pending, and is for this user
    SELECT * INTO v_request
    FROM ownership_transfer_requests
    WHERE id = p_transfer_request_id
      AND game_id = p_game_id
      AND new_owner_id = v_new_owner_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired transfer request');
    END IF;

    -- Transfer ownership
    UPDATE games
    SET owner_id = v_new_owner_id
    WHERE id = p_game_id;

    -- Mark request as completed
    UPDATE ownership_transfer_requests
    SET status = 'completed', updated_at = NOW()
    WHERE id = p_transfer_request_id;

    RETURN json_build_object('success', true);
END;
$$;
