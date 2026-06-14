-- =====================================================
-- Games table RLS: Owner-based access control
-- Date: 2026-06-14
-- 
-- Ensures that only the owner of a game can UPDATE/DELETE it.
-- Anyone can SELECT (public games are visible to all).
-- Authenticated users can INSERT (to register new games).
-- =====================================================

-- Enable RLS on games table
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read games (needed for QR scan, public map, etc.)
CREATE POLICY "games_select_all" ON games
    FOR SELECT
    USING (true);

-- Policy: Authenticated users can insert new games
CREATE POLICY "games_insert_authenticated" ON games
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = owner_id);

-- Policy: Only owner can update their own games
CREATE POLICY "games_update_owner" ON games
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Policy: Only owner can delete their own games
CREATE POLICY "games_delete_owner" ON games
    FOR DELETE
    TO authenticated
    USING (auth.uid() = owner_id);
