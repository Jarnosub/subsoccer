-- 1. Fix typo: Subsocer HQ → Subsoccer HQ
UPDATE games SET game_name = 'Subsoccer HQ' WHERE game_name = 'Subsocer HQ';

-- 2. Add metadata JSONB column to games table (if it doesn't exist)
ALTER TABLE games ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 3. Seed the Subsoccer HQ config with default arcade pricing
UPDATE games SET metadata = jsonb_build_object(
  'basePrice', 2.00,
  'matchTime', 90,
  'freePlayEnabled', false,
  'basicMode', false,
  'tiebreaker', 'Automated Coin Flip (Fastest)'
) WHERE game_name = 'Subsoccer HQ';

-- 4. Allow public read access to metadata (anon key)
-- RLS policy: anyone can SELECT metadata from games
CREATE POLICY IF NOT EXISTS "allow_read_game_metadata" ON games
  FOR SELECT USING (true);
