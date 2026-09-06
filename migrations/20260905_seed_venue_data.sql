-- ============================================================
-- SUBSOCCER: SEED VENUE DATA FOR KNOWN TABLES
-- Uses UPDATE + conditional INSERT (no ON CONFLICT needed)
-- Run in Supabase SQL Editor
-- ============================================================

-- First: add unique constraint on unique_code so future operations are clean
-- (safe: IF NOT EXISTS prevents error if already there)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'games_unique_code_key'
    ) THEN
        -- Remove any duplicates first (keep newest)
        DELETE FROM public.games a USING public.games b
        WHERE a.unique_code = b.unique_code 
          AND a.unique_code IS NOT NULL
          AND a.created_at < b.created_at;
        
        ALTER TABLE public.games ADD CONSTRAINT games_unique_code_key UNIQUE (unique_code);
    END IF;
END $$;

-- ============================================================
-- VENUE DATA UPDATES (existing tables)
-- ============================================================

-- 1. Trnava Sports Arena, Slovakia (DOCK-1-SERIE001)
UPDATE public.games SET
    venue_name = 'Trnava Sports Arena',
    venue_type = 'sports_club',
    company_name = 'Trnava Sports Arena',
    city = 'Trnava',
    country_code = 'SK',
    venue_status = 'active',
    latitude = 48.3762,
    longitude = 17.5829
WHERE unique_code = 'DOCK-1-SERIE001';

-- 2. East Midlands Designer Outlet (McArthurGlen), UK
UPDATE public.games SET
    venue_name = 'East Midlands Designer Outlet',
    venue_type = 'mall',
    company_name = 'McArthurGlen Group',
    city = 'South Normanton',
    country_code = 'GB',
    venue_status = 'active',
    website = 'https://www.eastmidlandsdesigneroutlet.com',
    latitude = 53.1076,
    longitude = -1.3106
WHERE unique_code = 'COMMUNITY-69590614-d9aa-44f0-a8cf-2b1fe404559c';

-- 3. Subsoccer HQ, Helsinki
UPDATE public.games SET
    venue_name = 'Subsoccer International HQ',
    venue_type = 'corporate',
    company_name = 'Subsoccer International Oy',
    city = 'Helsinki',
    country_code = 'FI',
    venue_status = 'active',
    location = 'Melkonkatu 24, Lauttasaari',
    latitude = 60.1555,
    longitude = 24.8870
WHERE unique_code = 'DEMO1';

-- ============================================================
-- NEW VENUE INSERTS (tables that may not exist in games yet)
-- ============================================================

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, website, latitude, longitude, is_public, owner_id)
SELECT 'SUPERPARK-GLASGOW', 'SuperPark Glasgow Table', 'SuperPark Glasgow', 'activity_park', 'SuperPark Oy', 'Glasgow', 'GB', 'active', 'https://superpark.co.uk', 55.8642, -4.2518, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'SUPERPARK-GLASGOW');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, website, latitude, longitude, is_public, owner_id)
SELECT 'TRIPLA-01', 'Tripla Table #1', 'Mall of Tripla', 'mall', 'YIT / Tripla', 'Helsinki', 'FI', 'active', 'https://triplalive.fi', 60.1989, 24.9317, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'TRIPLA-01');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'FASHION-DISTRICT-PHL', 'Fashion District Philadelphia', 'Fashion District Philadelphia', 'mall', 'Macerich / PREIT', 'Philadelphia', 'US', 'active', 39.9526, -75.1592, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'FASHION-DISTRICT-PHL');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'KATOWICE-01', 'Katowice Table', 'Katowice Sports Hub', 'sports_club', 'Katowice', 'PL', 'active', 50.2649, 19.0238, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'KATOWICE-01');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'BANIK-OSTRAVA', 'Banik Ostrava Fan Zone', 'Banik Ostrava Stadium', 'sports_club', 'FC Banik Ostrava', 'Ostrava', 'CZ', 'active', 49.8209, 18.2625, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'BANIK-OSTRAVA');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'PANAMA-FC', 'Panama City FC Table', 'Panama City FC Fan Zone', 'sports_club', 'Panama City FC', 'Panama City', 'PA', 'active', 8.9824, -79.5199, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'PANAMA-FC');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'KINGSTON-ON', 'Kingston Table', 'Kingston Community Hub', 'activity_park', 'Kingston', 'CA', 'active', 44.2312, -76.4860, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'KINGSTON-ON');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'LIMA-JUEGA', 'Lima Juega Table', 'Lima Juega Sports Park', 'activity_park', 'Lima', 'PE', 'active', -12.0464, -77.0428, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'LIMA-JUEGA');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, company_name, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'FERRARI-LUX', 'Ferrari Club Luxembourg', 'Scuderia Ferrari Club Luxembourg', 'social_bar', 'Scuderia Ferrari Club', 'Luxembourg City', 'LU', 'active', 49.6117, 6.1319, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'FERRARI-LUX');

INSERT INTO public.games (unique_code, game_name, venue_name, venue_type, city, country_code, venue_status, latitude, longitude, is_public, owner_id)
SELECT 'FOOTBALL-STORE-MT', 'Football Store Malta Table', 'Football Store Malta', 'arcade', 'Valletta', 'MT', 'active', 35.8989, 14.5146, true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.games WHERE unique_code = 'FOOTBALL-STORE-MT');

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT 
    game_name,
    venue_name,
    venue_type,
    city,
    country_code,
    venue_status,
    unique_code
FROM public.games 
WHERE venue_name IS NOT NULL
ORDER BY venue_name;
