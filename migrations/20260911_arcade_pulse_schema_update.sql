-- ==============================================================================
-- SUBSOCCER GO — ARCADE / PULSE SCHEMA UPDATE (IDEMPOTENT MIGRATION)
-- Version: 2026-09-11
-- Safe to execute on existing databases created with earlier schema proposals.
-- ==============================================================================

-- 1. ARCADE_TABLE_CONFIGS UPDATES
-- Add per-table hardware routing and activation policy columns if missing
ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS device_endpoint TEXT,
    ADD COLUMN IF NOT EXISTS device_username TEXT,
    ADD COLUMN IF NOT EXISTS device_password TEXT,
    ADD COLUMN IF NOT EXISTS is_free_play_allowed BOOLEAN NOT NULL DEFAULT false;

-- Ensure lock_state supports 'error_locked'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'arcade_table_configs'
    ) THEN
        ALTER TABLE public.arcade_table_configs 
            DROP CONSTRAINT IF EXISTS arcade_table_configs_lock_state_check;
        ALTER TABLE public.arcade_table_configs 
            ADD CONSTRAINT arcade_table_configs_lock_state_check 
            CHECK (lock_state IN ('available', 'maintenance_locked', 'error_locked'));
    END IF;
END $$;

-- 2. ARCADE_SESSIONS UPDATES
-- Add hardware_dispatched_at timestamp column for atomic stale session cleanup
ALTER TABLE IF EXISTS public.arcade_sessions 
    ADD COLUMN IF NOT EXISTS hardware_dispatched_at TIMESTAMPTZ;

-- Update status check constraint to support 'hardware_uncertain'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'arcade_sessions'
    ) THEN
        ALTER TABLE public.arcade_sessions 
            DROP CONSTRAINT IF EXISTS arcade_sessions_status_check;
        ALTER TABLE public.arcade_sessions 
            ADD CONSTRAINT arcade_sessions_status_check 
            CHECK (status IN ('requested', 'active', 'cooldown', 'completed', 'failed', 'canceled', 'force_stopped', 'hardware_uncertain'));
    END IF;
END $$;

-- 3. UNIQUE INDEX UPDATES
-- Drop old partial index if exists and recreate with 'hardware_uncertain' to ensure locking
DROP INDEX IF EXISTS public.idx_single_active_arcade_session;
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_arcade_session 
ON public.arcade_sessions (table_id) 
WHERE status IN ('requested', 'active', 'cooldown', 'hardware_uncertain');

CREATE UNIQUE INDEX IF NOT EXISTS idx_arcade_client_session_token
ON public.arcade_sessions (client_session_token);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_table_status 
ON public.arcade_sessions (table_id, status);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_expires 
ON public.arcade_sessions (expires_at) 
WHERE status = 'active';

-- 4. ARCADE_EVENTS UPDATES
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'arcade_events'
    ) THEN
        ALTER TABLE public.arcade_events 
            DROP CONSTRAINT IF EXISTS arcade_events_event_type_check;
        ALTER TABLE public.arcade_events 
            ADD CONSTRAINT arcade_events_event_type_check 
            CHECK (event_type IN (
                'session_requested', 
                'switch_cmd_sent', 
                'switch_confirmed_on', 
                'session_expired', 
                'switch_confirmed_off', 
                'force_stopped', 
                'switch_error'
            ));
    END IF;
END $$;
