-- ============================================================
-- VERIFIED GAMES SYSTEM - Two-Tier Game Registration
-- Serial Number replaces Unique Game Code as primary identifier
-- ============================================================

-- ==================== PART 1: GAMES TABLE EXTENSIONS ====================

-- Add verified game fields
-- serial_number: Replaces unique_code as the primary game identifier
-- owner_id: Links to the player who owns this verified game
-- verified: True when serial number is registered (automatic verification)
-- registered_at: Timestamp when the game was verified with serial number

ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS serial_number TEXT,
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

-- Update comment on unique_code to clarify it's now auto-generated from serial
COMMENT ON COLUMN public.games.unique_code IS 'Auto-generated from serial_number. Legacy field for backward compatibility.';
COMMENT ON COLUMN public.games.serial_number IS 'Primary game identifier from QR code sticker. Required for tournament eligibility and verified status.';

-- Create unique partial index for serial numbers (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_serial_number_unique 
ON public.games(serial_number) 
WHERE serial_number IS NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_games_owner_id 
ON public.games(owner_id);

CREATE INDEX IF NOT EXISTS idx_games_verified 
ON public.games(verified);

-- ==================== PART 2: OWNERSHIP TRANSFER REQUESTS ====================

-- Create table for ownership transfer requests
CREATE TABLE IF NOT EXISTS public.ownership_transfer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    serial_number TEXT NOT NULL,
    current_owner_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    new_owner_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT different_owners CHECK (current_owner_id != new_owner_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_game_id 
ON public.ownership_transfer_requests(game_id);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_current_owner 
ON public.ownership_transfer_requests(current_owner_id);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_new_owner 
ON public.ownership_transfer_requests(new_owner_id);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_status 
ON public.ownership_transfer_requests(status);

-- ==================== PART 3: RLS POLICIES ====================

-- Enable RLS
ALTER TABLE public.ownership_transfer_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can view, insert, update, delete (matching existing pattern)
-- Drop ALL existing policies dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ownership_transfer_requests' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.ownership_transfer_requests', r.policyname);
    END LOOP;
END $$;

CREATE POLICY "Anyone can view ownership transfers"
    ON public.ownership_transfer_requests FOR SELECT
    USING (true);

CREATE POLICY "Anyone can insert ownership transfers"
    ON public.ownership_transfer_requests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update ownership transfers"
    ON public.ownership_transfer_requests FOR UPDATE
    USING (true);

CREATE POLICY "Anyone can delete ownership transfers"
    ON public.ownership_transfer_requests FOR DELETE
    USING (true);

-- ==================== PART 4: FUNCTIONS ====================

-- Function to approve ownership transfer
CREATE OR REPLACE FUNCTION public.approve_ownership_transfer(transfer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_game_id UUID;
    v_new_owner_id UUID;
BEGIN
    -- Get transfer details
    SELECT game_id, new_owner_id INTO v_game_id, v_new_owner_id
    FROM public.ownership_transfer_requests
    WHERE id = transfer_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Update game ownership
    UPDATE public.games
    SET owner_id = v_new_owner_id
    WHERE id = v_game_id;
    
    -- Mark transfer as approved
    UPDATE public.ownership_transfer_requests
    SET status = 'approved', resolved_at = NOW()
    WHERE id = transfer_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release ownership (make game available)
CREATE OR REPLACE FUNCTION public.release_game_ownership(p_game_id UUID, p_player_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Verify ownership and update
    UPDATE public.games
    SET owner_id = NULL, verified = false
    WHERE id = p_game_id AND owner_id = p_player_id;
    
    IF FOUND THEN
        -- Cancel any pending transfer requests for this game
        UPDATE public.ownership_transfer_requests
        SET status = 'cancelled', resolved_at = NOW()
        WHERE game_id = p_game_id AND status = 'pending';
        
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== PART 5: VERIFICATION QUERIES ====================

-- Check games table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'games' 
AND column_name IN ('serial_number', 'owner_id', 'verified', 'registered_at')
AND table_schema = 'public'
ORDER BY column_name;

-- Check ownership_transfer_requests table exists
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'ownership_transfer_requests' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check unique index on serial_number
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'games'
AND indexname = 'idx_games_serial_number_unique';

-- Check functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('approve_ownership_transfer', 'release_game_ownership')
ORDER BY routine_name;

-- ============================================================
-- EXPECTED RESULTS:
-- 1. games: 4 new columns (owner_id, registered_at, serial_number, verified)
-- 2. ownership_transfer_requests: 9 columns
-- 3. Unique index on serial_number (partial, non-null only)
-- 4. 2 functions created (approve_ownership_transfer, release_game_ownership)
-- ============================================================
