-- ============================================================
-- FIX: venue_kpis view — correct country counting
-- Location format: "Helsinki, FI (Europe/Helsinki) [60.17,24.94]"
-- We need just the 2-letter country code after first comma
-- ============================================================

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

    COALESCE(scans.total_scans, 0) AS total_scans,
    COALESCE(scans.scans_last_7d, 0) AS scans_last_7d,
    COALESCE(scans.scans_last_30d, 0) AS scans_last_30d,

    COALESCE(matches.total_matches, 0) AS total_matches,
    COALESCE(matches.matches_last_7d, 0) AS matches_last_7d,
    COALESCE(matches.matches_last_30d, 0) AS matches_last_30d,

    CASE
        WHEN COALESCE(scans.total_scans, 0) > 0
        THEN ROUND(COALESCE(matches.total_matches, 0)::numeric / scans.total_scans * 100, 1)
        ELSE 0
    END AS conversion_pct,

    COALESCE(retention.returning_sessions, 0) AS returning_sessions,
    CASE
        WHEN COALESCE(scans.total_scans, 0) > 0
        THEN ROUND(COALESCE(retention.returning_sessions, 0)::numeric / scans.total_scans * 100, 1)
        ELSE 0
    END AS retention_pct,

    scans.first_scan,
    scans.last_scan,
    matches.last_match,

    -- Fixed: extract 2-letter country code from location string
    -- Format: "City, CC (timezone) [lat,lng]"
    -- TRIM(SPLIT_PART(SPLIT_PART(location, '(', 1), ',', 2)) → "FI" or "SK"
    COALESCE(geo.unique_countries, 0) AS unique_countries

FROM public.games g

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

LEFT JOIN (
    SELECT
        game_code,
        COUNT(*) FILTER (WHERE is_returning = true) AS returning_sessions
    FROM public.public_tracking
    WHERE event_type = 'app_opened'
    GROUP BY game_code
) retention ON retention.game_code = g.unique_code

LEFT JOIN (
    SELECT
        game_code,
        COUNT(DISTINCT TRIM(SPLIT_PART(SPLIT_PART(location, '(', 1), ',', 2))) AS unique_countries
    FROM public.public_tracking
    WHERE event_type = 'app_opened' 
      AND location IS NOT NULL
      AND location LIKE '%, %'
    GROUP BY game_code
) geo ON geo.game_code = g.unique_code;

GRANT SELECT ON public.venue_kpis TO anon, authenticated;

-- Verify fix
SELECT venue_name, total_scans, unique_countries
FROM public.venue_kpis
WHERE venue_name IS NOT NULL
ORDER BY total_scans DESC;
