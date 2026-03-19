--
-- Subsoccer Public Game Tracking Data Structure
-- Run this in Supabase SQL Editor
--

CREATE TABLE IF NOT EXISTS public_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,         -- e.g., 'app_opened', 'game_finished'
    game_code TEXT NOT NULL,          -- the specific code read from QR (e.g. SOCIAL-1, COSTCO)
    match_score TEXT,                 -- score '3-1', default null on open
    source_partner TEXT,              -- extracted partner from URL (e.g., 'free', 'costco')
    user_agent TEXT,                  -- browser type for device tracking
    location TEXT,                    -- The user's timezone/location when scanning
    client_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- NOTE: If you already ran this script previously, just run this single line to add location:
-- ALTER TABLE public_tracking ADD COLUMN location TEXT;

-- Turn on Row Level Security
ALTER TABLE public_tracking ENABLE ROW LEVEL SECURITY;

-- Anonymous users (anyone scanning the QR code) can INSERT their game data
CREATE POLICY "Enable insert for anonymous users" 
ON public_tracking FOR INSERT 
TO public 
WITH CHECK (true);

-- Only authenticated users (The Forge Dashboard / Admin views) can READ the data
CREATE POLICY "Enable read access for authenticated users" 
ON public_tracking FOR SELECT 
USING (true);

-- Note: We allow anonymous selection strictly for building external trackers if no admin auth is used yet,
-- but since Jarno is viewing it, we can temporarily grant ALL select to read the dashboard without logging in:
DROP POLICY IF EXISTS "Enable read access for all" ON public_tracking;
CREATE POLICY "Enable read access for all" 
ON public_tracking FOR SELECT 
USING (true);
