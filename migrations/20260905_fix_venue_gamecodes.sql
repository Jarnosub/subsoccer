-- ============================================================
-- FIX: Map real game_codes from telemetry to venue records
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. DOCK-1-SERIE001 → Trnava Sports Arena (535 scans, 1618 events)
-- Check if games row exists, if not insert
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'DOCK-1-SERIE001', 'Trnava Arena Table', 'Trnava Sports Arena', 'sports_club', 'Trnava Sports Arena', 'Trnava', 'SK', 'active', 48.3762, 17.5829, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'DOCK-1-SERIE001');

-- If it already exists, update venue fields
UPDATE public.games SET
    venue_name = 'Trnava Sports Arena',
    venue_type = 'sports_club',
    company_name = 'Trnava Sports Arena',
    city = 'Trnava',
    country_code = 'SK',
    venue_status = 'active'
WHERE unique_code = 'DOCK-1-SERIE001' AND venue_name IS NULL;

-- 2. HQ → Subsoccer International HQ (192 scans)
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, location, latitude, longitude, is_public, owner_id)
SELECT 'HQ', 'Subsoccer HQ Main', 'Subsoccer International HQ', 'corporate', 'Subsoccer International Oy', 'Helsinki', 'FI', 'active', 'Melkonkatu 24, Lauttasaari', 60.1555, 24.8870, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'HQ');

UPDATE public.games SET
    venue_name = 'Subsoccer International HQ',
    venue_type = 'corporate',
    company_name = 'Subsoccer International Oy',
    city = 'Helsinki',
    country_code = 'FI',
    venue_status = 'active'
WHERE unique_code = 'HQ' AND venue_name IS NULL;

-- 3. DEMO1 → HQ Demo Table (25 scans)
UPDATE public.games SET
    venue_name = 'Subsoccer HQ Demo',
    venue_type = 'corporate',
    company_name = 'Subsoccer International Oy',
    city = 'Helsinki',
    country_code = 'FI',
    venue_status = 'active'
WHERE unique_code = 'DEMO1';

-- If DEMO1 doesn't exist in games
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'DEMO1', 'HQ Demo Table', 'Subsoccer HQ Demo', 'corporate', 'Subsoccer International Oy', 'Helsinki', 'FI', 'active', 60.1555, 24.8870, false, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'DEMO1');

-- 4. SALES → Sales Demo Kit (137 scans)
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, is_public, owner_id)
SELECT 'SALES', 'Sales Demo Kit', 'Subsoccer Sales Demo', 'corporate', 'Subsoccer International Oy', 'Helsinki', 'FI', 'active', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'SALES');

UPDATE public.games SET
    venue_name = 'Subsoccer Sales Demo',
    venue_type = 'corporate',
    city = 'Helsinki',
    country_code = 'FI',
    venue_status = 'active'
WHERE unique_code = 'SALES' AND venue_name IS NULL;

-- 5. SUBSOCCER-GO → Digital Game Platform (577 scans)
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, is_public, owner_id)
SELECT 'SUBSOCCER-GO', 'Subsoccer GO', 'Subsoccer GO Digital', 'other', 'Subsoccer International Oy', 'Helsinki', 'FI', 'active', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'SUBSOCCER-GO');

UPDATE public.games SET
    venue_name = 'Subsoccer GO Digital',
    venue_type = 'other',
    venue_status = 'active'
WHERE unique_code = 'SUBSOCCER-GO' AND venue_name IS NULL;

-- 6. MOBILE-TOURNAMENT → All mobile tournaments (4698 matches!)
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, venue_status, is_public, owner_id)
SELECT 'MOBILE-TOURNAMENT', 'Mobile Tournaments', 'Mobile Tournament Mode', 'other', 'Subsoccer International Oy', 'active', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'MOBILE-TOURNAMENT');

UPDATE public.games SET
    venue_name = 'Mobile Tournament Mode',
    venue_type = 'other',
    venue_status = 'active'
WHERE unique_code = 'MOBILE-TOURNAMENT' AND venue_name IS NULL;

-- 7. PUBLIC-APP → Default QR (shared by many venues, 8468 scans)
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, venue_status, is_public, owner_id)
SELECT 'PUBLIC-APP', 'Public App (All Venues)', 'Public App — All Venues', 'other', 'Subsoccer International Oy', 'active', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'PUBLIC-APP');

UPDATE public.games SET
    venue_name = 'Public App — All Venues',
    venue_type = 'other',
    venue_status = 'active'
WHERE unique_code = 'PUBLIC-APP' AND venue_name IS NULL;

-- 8. QR Production tables (S7W stickers with real scans)
INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, venue_status, is_public, owner_id)
SELECT 'S7W-WRW3F', 'S7 White #WRW3F', 'S7 White Table', 'private', 'active', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'S7W-WRW3F');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, venue_status, is_public, owner_id)
SELECT 'S7W-VWT9Q', 'S7 White #VWT9Q', 'S7 White Table', 'private', 'active', false, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'S7W-VWT9Q');

-- ============================================================
-- VERIFICATION: Now check venue_kpis with real data
-- ============================================================
SELECT 
    venue_name,
    venue_type,
    city,
    country_code,
    total_scans,
    scans_last_7d,
    total_matches,
    conversion_pct,
    retention_pct,
    unique_countries
FROM public.venue_kpis
WHERE venue_name IS NOT NULL
ORDER BY total_scans DESC;
