-- ============================================================
-- CHECK TOURNAMENT BRACKET DEPENDENCIES
-- Run this BEFORE add_tournament_bracket_system.sql
-- ============================================================

-- Check if required tables exist
SELECT 
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tournament_history') 
        THEN '✓ tournament_history exists' 
        ELSE '✗ MISSING: tournament_history' 
    END as tournament_history_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_registrations') 
        THEN '✓ event_registrations exists' 
        ELSE '✗ MISSING: event_registrations' 
    END as event_registrations_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'players') 
        THEN '✓ players exists' 
        ELSE '✗ MISSING: players' 
    END as players_status,
    
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'matches') 
        THEN '✓ matches exists' 
        ELSE '✗ MISSING: matches' 
    END as matches_status;

-- Check if players table has required columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'players' 
AND column_name IN ('id', 'username', 'elo', 'wins', 'created_at')
ORDER BY column_name;

-- Check if tournament_history has event_id
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'tournament_history' 
AND column_name IN ('id', 'event_id', 'tournament_name')
ORDER BY column_name;

-- Check if event_registrations has required columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'event_registrations' 
AND column_name IN ('id', 'event_id', 'tournament_id', 'player_id', 'status', 'registered_at')
ORDER BY column_name;
