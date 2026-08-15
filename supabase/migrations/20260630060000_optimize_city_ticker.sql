-- ============================================================
-- PERFORMANCE FIX: Optimized city ticker data aggregation
-- ============================================================
-- WHAT THIS DOES:
-- 1. Adds composite index on public_tracking for location queries
-- 2. Creates get_city_ticker_data() RPC that returns unique locations
--    with their most recent match score — replaces 10+ paginated
--    client-side queries (fetching ~10,000 rows) with a single
--    aggregated query returning ~100-200 rows
--
-- IMPACT: Reduces PostgRES load by ~90% for every landing page visit
-- ============================================================

-- Step 1: Add index for location-based queries
CREATE INDEX IF NOT EXISTS idx_public_tracking_location_time
ON public.public_tracking (location, client_time DESC)
WHERE location IS NOT NULL;

-- Step 2: Create optimized RPC function
CREATE OR REPLACE FUNCTION public.get_city_ticker_data()
RETURNS TABLE(location text, match_score text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- For each unique location, get the most recent match score (if any)
  -- Filters: proper city format only + excludes known data center cities
  WITH unique_locations AS (
    SELECT DISTINCT ON (t.location)
      t.location, t.client_time
    FROM public_tracking t
    WHERE t.location IS NOT NULL
      AND t.location LIKE '%,%'         -- must have comma (City, CC format)
      AND t.location LIKE '%(%)%'       -- must have timezone in parens
      AND t.location NOT LIKE 'Boardman,%'   -- AWS us-west-2 data center
      AND t.location NOT LIKE 'Boydton,%'    -- Microsoft Azure data center
      AND t.location NOT LIKE 'Altoona,%'    -- Meta data center
    ORDER BY t.location, t.client_time DESC
  ),
  latest_scores AS (
    SELECT DISTINCT ON (t.location)
      t.location, t.match_score
    FROM public_tracking t
    WHERE t.location IS NOT NULL
      AND t.event_type IN ('game_finished', 'tournament_match_finished')
      AND t.match_score IS NOT NULL
    ORDER BY t.location, t.client_time DESC
  )
  SELECT u.location, s.match_score
  FROM unique_locations u
  LEFT JOIN latest_scores s ON u.location = s.location
  ORDER BY u.client_time DESC;
$$;

-- Step 3: Grant access (landing page uses anon key)
GRANT EXECUTE ON FUNCTION public.get_city_ticker_data() TO anon;
GRANT EXECUTE ON FUNCTION public.get_city_ticker_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_city_ticker_data() TO service_role;

SELECT '✅ PERFORMANCE FIX: get_city_ticker_data() created — replaces 10+ paginated queries with 1 RPC call' as status;

-- ============================================================
-- ROLLBACK (if needed):
-- DROP FUNCTION IF EXISTS public.get_city_ticker_data();
-- DROP INDEX IF EXISTS idx_public_tracking_location_time;
-- ============================================================
