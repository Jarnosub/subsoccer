-- Add game_hero_url column for the tournament/game background image
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS game_hero_url TEXT;
