-- Add geolocation columns to tournament_history
-- so tournaments created outside of a physical Kiosk (game_id = NULL)
-- can still be placed on the global map.

ALTER TABLE tournament_history 
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Index for map queries
CREATE INDEX IF NOT EXISTS idx_tournament_history_geo 
  ON tournament_history (latitude, longitude) 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
