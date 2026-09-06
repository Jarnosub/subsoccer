-- ============================================================
-- SUBSOCCER: B2B VENUE DATA ENRICHMENT
-- Phase 1: Connect venue identity to game data
-- Run in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. ADD VENUE FIELDS TO GAMES TABLE
-- ============================================================

-- Venue identity: who owns/operates this table?
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS venue_name TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS venue_type TEXT;  -- 'arcade', 'activity_park', 'sports_club', 'mall', 'social_bar', 'event_rental', 'hotel', 'corporate', 'private', 'other'
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS company_name TEXT;

-- Venue contact info for B2B
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS website TEXT;

-- Link to B2B CRM prospect (Google Place ID)
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- Venue status
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS venue_status TEXT DEFAULT 'active';  -- 'active', 'inactive', 'demo', 'returned'

-- Country & city (structured, not just location text)
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS country_code TEXT;  -- ISO 2-letter: 'FI', 'GB', 'US'
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS city TEXT;

-- Revenue info
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2);
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS purchase_channel TEXT;  -- 'direct', 'costco', 'amazon', 'distributor'

-- Indexes for B2B queries
CREATE INDEX IF NOT EXISTS idx_games_venue_type ON public.games (venue_type) WHERE venue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_country_code ON public.games (country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_google_place_id ON public.games (google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_venue_status ON public.games (venue_status);

-- ============================================================
-- 2. ADD FIELDS TO B2B CRM (link prospects to venues)
-- ============================================================

-- b2b_crm already has prospect_id (= Google Place ID)
-- Add venue link: if a prospect becomes a customer, link to their game
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES public.games(id);
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS venue_name TEXT;
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.b2b_crm ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ============================================================
-- 3. B2B ACTIVITIES TABLE (outreach history)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prospect_id TEXT NOT NULL,  -- Google Place ID, matches b2b_crm.prospect_id
    action TEXT NOT NULL,       -- 'email_sent', 'call', 'meeting', 'demo', 'follow_up', 'note'
    subject TEXT,               -- Email subject or call topic
    body TEXT,                  -- Email body or meeting notes
    outcome TEXT,               -- 'positive', 'neutral', 'negative', 'no_response'
    performed_by TEXT DEFAULT 'jarno',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.b2b_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all on b2b_activities"
ON public.b2b_activities FOR SELECT USING (true);

CREATE POLICY "Enable insert for all on b2b_activities"
ON public.b2b_activities FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_b2b_activities_prospect ON public.b2b_activities (prospect_id);
CREATE INDEX IF NOT EXISTS idx_b2b_activities_created ON public.b2b_activities (created_at DESC);

-- ============================================================
-- 4. VENUE KPIs VIEW (automatic per-table metrics)
-- ============================================================

-- This view calculates live KPIs for each registered game/table
-- by joining games -> public_tracking via game_code/unique_code

CREATE OR REPLACE VIEW public.venue_kpis AS
SELECT
    g.id AS game_id,
    g.game_name,
    g.serial_number,
    g.venue_name,
    g.venue_type,
    g.company_name,
    g.city,
    g.country_code,
    g.location,
    g.venue_status,

    -- Scan metrics (app_opened events)
    COALESCE(scans.total_scans, 0) AS total_scans,
    COALESCE(scans.scans_last_7d, 0) AS scans_last_7d,
    COALESCE(scans.scans_last_30d, 0) AS scans_last_30d,

    -- Match metrics (tournament_match_finished events)
    COALESCE(matches.total_matches, 0) AS total_matches,
    COALESCE(matches.matches_last_7d, 0) AS matches_last_7d,
    COALESCE(matches.matches_last_30d, 0) AS matches_last_30d,

    -- Conversion: what % of scans result in a match
    CASE
        WHEN COALESCE(scans.total_scans, 0) > 0
        THEN ROUND(COALESCE(matches.total_matches, 0)::numeric / scans.total_scans * 100, 1)
        ELSE 0
    END AS conversion_pct,

    -- Returning visitors
    COALESCE(retention.returning_sessions, 0) AS returning_sessions,
    CASE
        WHEN COALESCE(scans.total_scans, 0) > 0
        THEN ROUND(COALESCE(retention.returning_sessions, 0)::numeric / scans.total_scans * 100, 1)
        ELSE 0
    END AS retention_pct,

    -- First and last activity
    scans.first_scan,
    scans.last_scan,
    matches.last_match,

    -- Unique countries (reach)
    COALESCE(geo.unique_countries, 0) AS unique_countries

FROM public.games g

-- Scan aggregates
LEFT JOIN (
    SELECT
        game_code,
        COUNT(*) AS total_scans,
        COUNT(*) FILTER (WHERE client_time >= NOW() - INTERVAL '7 days') AS scans_last_7d,
        COUNT(*) FILTER (WHERE client_time >= NOW() - INTERVAL '30 days') AS scans_last_30d,
        MIN(client_time) AS first_scan,
        MAX(client_time) AS last_scan
    FROM public.public_tracking
    WHERE event_type = 'app_opened'
    GROUP BY game_code
) scans ON scans.game_code = g.unique_code

-- Match aggregates
LEFT JOIN (
    SELECT
        game_code,
        COUNT(*) AS total_matches,
        COUNT(*) FILTER (WHERE client_time >= NOW() - INTERVAL '7 days') AS matches_last_7d,
        COUNT(*) FILTER (WHERE client_time >= NOW() - INTERVAL '30 days') AS matches_last_30d,
        MAX(client_time) AS last_match
    FROM public.public_tracking
    WHERE event_type = 'tournament_match_finished'
    GROUP BY game_code
) matches ON matches.game_code = g.unique_code

-- Returning visitor count
LEFT JOIN (
    SELECT
        game_code,
        COUNT(*) FILTER (WHERE is_returning = true) AS returning_sessions
    FROM public.public_tracking
    WHERE event_type = 'app_opened'
    GROUP BY game_code
) retention ON retention.game_code = g.unique_code

-- Geographic reach
LEFT JOIN (
    SELECT
        game_code,
        COUNT(DISTINCT SPLIT_PART(location, ',', 2)) AS unique_countries
    FROM public.public_tracking
    WHERE event_type = 'app_opened' AND location IS NOT NULL
    GROUP BY game_code
) geo ON geo.game_code = g.unique_code;

-- Grant access
GRANT SELECT ON public.venue_kpis TO anon, authenticated;

-- ============================================================
-- 5. VERIFICATION QUERIES
-- ============================================================

-- Check new columns on games table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'games' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check venue_kpis view works
SELECT * FROM public.venue_kpis ORDER BY total_scans DESC LIMIT 10;

-- Check b2b_activities table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'b2b_activities' AND table_schema = 'public'
ORDER BY ordinal_position;
