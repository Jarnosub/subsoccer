-- ==============================================================================
-- SUBSOCCER ARCADE — PHASE 3: SECURE OUTBOUND GATEWAY QUEUE & ATOMIC RPCs
-- Migration: 20260912_arcade_phase3_gateway_queue.sql
-- ==============================================================================

-- 0. Varmistetaan pgcrypto-laajennus
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. ENUM-LAAJENNUS: pending_gateway_dispatch
DO $$ BEGIN
    ALTER TYPE public.arcade_order_status ADD VALUE IF NOT EXISTS 'pending_gateway_dispatch';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. PÖYTÄASETUSTEN TARKISTUS (AUX OUTLETS)
ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS display_output_id INT DEFAULT 2;

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS lights_output_id INT DEFAULT 3;

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS lights_mode TEXT NOT NULL DEFAULT 'auto';

-- 3. TOIMIPAIKKOJEN GATEWAY-TOKENIT
ALTER TABLE IF EXISTS public.arcade_venues
    ADD COLUMN IF NOT EXISTS gateway_token_hash TEXT;

ALTER TABLE IF EXISTS public.arcade_venues
    ADD COLUMN IF NOT EXISTS gateway_last_seen_at TIMESTAMPTZ;

-- Asetetaan demo-toimipaikalle testitokenin tiiviste (Token: 'gw_token_demo_01_live_2026_test')
UPDATE public.arcade_venues 
SET gateway_token_hash = '12843ece604d436c96ce944216e682b1e7a26aee7a5a681ece0edc4f4c915055'
WHERE venue_id = 'venue-demo-01';

-- 4. GATEWAY-KOMENTOJONO (arcade_gateway_commands)
CREATE TABLE IF NOT EXISTS public.arcade_gateway_commands (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    command_id TEXT UNIQUE NOT NULL,
    venue_id TEXT NOT NULL REFERENCES public.arcade_venues(venue_id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES public.arcade_table_configs(table_id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    command_type TEXT NOT NULL DEFAULT 'START_TIMED_PLAY',
    target_outlet_id INT NOT NULL DEFAULT 1,
    duration_seconds INT NOT NULL,
    dispatch_deadline_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'dispatched', 'active', 'expired', 'failed', 'completed')),
    claimed_by TEXT,
    claimed_at TIMESTAMPTZ,
    hardware_dispatched_at TIMESTAMPTZ,
    game_expires_at TIMESTAMPTZ,
    off_observed_at TIMESTAMPTZ,
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_commands_poll 
ON public.arcade_gateway_commands(venue_id, status, dispatch_deadline_at);

-- RLS-suojaus (vain service_role pääsee suoraan tauluun, anon ei koskaan suoraan)
ALTER TABLE public.arcade_gateway_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_commands" ON public.arcade_gateway_commands;
CREATE POLICY "service_role_manage_commands" ON public.arcade_gateway_commands
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. RPC: arcade_queue_gateway_command (Backend / Service Role)
CREATE OR REPLACE FUNCTION public.arcade_queue_gateway_command(
    p_venue_id TEXT,
    p_table_id TEXT,
    p_order_id TEXT,
    p_duration_seconds INT,
    p_dispatch_deadline_seconds INT DEFAULT 15,
    p_target_outlet_id INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_command_id TEXT;
    v_deadline TIMESTAMPTZ;
BEGIN
    IF p_venue_id IS NULL OR p_table_id IS NULL OR p_order_id IS NULL OR p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    v_command_id := 'cmd-' || p_order_id || '-' || substr(md5(random()::text), 1, 6);
    v_deadline := now() + ((COALESCE(p_dispatch_deadline_seconds, 15)) * interval '1 second');

    INSERT INTO public.arcade_gateway_commands (
        command_id,
        venue_id,
        table_id,
        order_id,
        command_type,
        target_outlet_id,
        duration_seconds,
        dispatch_deadline_at,
        status
    ) VALUES (
        v_command_id,
        p_venue_id,
        p_table_id,
        p_order_id,
        'START_TIMED_PLAY',
        COALESCE(p_target_outlet_id, 1),
        p_duration_seconds,
        v_deadline,
        'pending'
    );

    UPDATE public.arcade_orders
    SET status = 'pending_gateway_dispatch',
        updated_at = now()
    WHERE order_id = p_order_id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (p_table_id, p_venue_id, 'gateway_command_queued', jsonb_build_object(
        'command_id', v_command_id,
        'order_id', p_order_id,
        'dispatch_deadline_at', v_deadline,
        'duration_seconds', p_duration_seconds
    ));

    RETURN jsonb_build_object(
        'success', true,
        'command_id', v_command_id,
        'dispatch_deadline_at', v_deadline,
        'duration_seconds', p_duration_seconds
    );
END;
$$;

-- 6. RPC: arcade_gateway_claim_command (Gateway atominen varaus FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.arcade_gateway_claim_command(
    p_venue_id TEXT,
    p_gateway_id TEXT,
    p_gateway_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue RECORD;
    v_cmd RECORD;
BEGIN
    IF p_venue_id IS NULL OR p_gateway_id IS NULL OR p_gateway_token IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    -- 1. Tarkistetaan gateway-token
    SELECT * INTO v_venue
    FROM public.arcade_venues
    WHERE venue_id = p_venue_id;

    IF NOT FOUND OR v_venue.gateway_token_hash IS NULL OR
       encode(digest(p_gateway_token, 'sha256'), 'hex') <> v_venue.gateway_token_hash THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'statusCode', 401, 'error', 'Invalid gateway token');
    END IF;

    -- Päivitetään gatewayn sydänääni
    UPDATE public.arcade_venues
    SET gateway_last_seen_at = now()
    WHERE venue_id = p_venue_id;

    -- 2. Vanhennetaan vanhentuneet jonokomennot (deadline < now())
    UPDATE public.arcade_gateway_commands
    SET status = 'expired',
        error_reason = 'DISPATCH_DEADLINE_EXCEEDED_IN_QUEUE',
        updated_at = now()
    WHERE venue_id = p_venue_id
      AND status = 'pending'
      AND dispatch_deadline_at < now();

    -- Päivitetään vastaavat tilaukset tilaan activation_failed ja refund_required
    UPDATE public.arcade_orders AS ord
    SET status = 'activation_failed',
        refund_status = CASE 
            WHEN ord.amount_cents > 0 AND ord.payment_status = 'succeeded' THEN 'refund_required'::arcade_refund_status
            ELSE ord.refund_status
        END,
        refund_reason = 'EXPIRED_IN_QUEUE_BEFORE_GATEWAY_DISPATCH',
        updated_at = now()
    WHERE ord.status = 'pending_gateway_dispatch'
      AND ord.order_id IN (
          SELECT order_id FROM public.arcade_gateway_commands 
          WHERE venue_id = p_venue_id AND status = 'expired' AND error_reason = 'DISPATCH_DEADLINE_EXCEEDED_IN_QUEUE'
      );

    -- 3. Varataan atomisesti vanhin voimassa oleva komento yhdelle gatewaylle
    SELECT * INTO v_cmd
    FROM public.arcade_gateway_commands
    WHERE venue_id = p_venue_id
      AND status = 'pending'
      AND dispatch_deadline_at >= now()
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'command', null);
    END IF;

    -- Merkitään käsky varatuksi
    UPDATE public.arcade_gateway_commands
    SET status = 'claimed',
        claimed_by = p_gateway_id,
        claimed_at = now(),
        updated_at = now()
    WHERE id = v_cmd.id;

    RETURN jsonb_build_object(
        'success', true,
        'command', jsonb_build_object(
            'command_id', v_cmd.command_id,
            'venue_id', v_cmd.venue_id,
            'table_id', v_cmd.table_id,
            'order_id', v_cmd.order_id,
            'command_type', v_cmd.command_type,
            'target_outlet_id', v_cmd.target_outlet_id,
            'duration_seconds', v_cmd.duration_seconds,
            'dispatch_deadline_at', v_cmd.dispatch_deadline_at,
            'claimed_at', now()
        )
    );
END;
$$;

-- 7. RPC: arcade_gateway_report_dispatch_attempt (Kirjaa mahdollisen lähetyshetken)
CREATE OR REPLACE FUNCTION public.arcade_gateway_report_dispatch_attempt(
    p_venue_id TEXT,
    p_gateway_id TEXT,
    p_gateway_token TEXT,
    p_command_id TEXT,
    p_hardware_dispatched_at TIMESTAMPTZ,
    p_game_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue RECORD;
    v_cmd RECORD;
BEGIN
    SELECT * INTO v_venue FROM public.arcade_venues WHERE venue_id = p_venue_id;
    IF NOT FOUND OR v_venue.gateway_token_hash IS NULL OR
       encode(digest(p_gateway_token, 'sha256'), 'hex') <> v_venue.gateway_token_hash THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'statusCode', 401);
    END IF;

    SELECT * INTO v_cmd 
    FROM public.arcade_gateway_commands 
    WHERE command_id = p_command_id AND venue_id = p_venue_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'COMMAND_NOT_FOUND', 'statusCode', 404);
    END IF;

    UPDATE public.arcade_gateway_commands
    SET status = 'dispatched',
        hardware_dispatched_at = p_hardware_dispatched_at,
        game_expires_at = p_game_expires_at,
        updated_at = now()
    WHERE id = v_cmd.id;

    UPDATE public.arcade_orders
    SET status = 'processing',
        hardware_dispatched_at = p_hardware_dispatched_at,
        expires_at = p_game_expires_at,
        updated_at = now()
    WHERE order_id = v_cmd.order_id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (v_cmd.table_id, p_venue_id, 'gateway_dispatch_attempt', jsonb_build_object(
        'command_id', p_command_id,
        'gateway_id', p_gateway_id,
        'hardware_dispatched_at', p_hardware_dispatched_at,
        'game_expires_at', p_game_expires_at
    ));

    RETURN jsonb_build_object('success', true, 'command_id', p_command_id);
END;
$$;

-- 8. RPC: arcade_gateway_report_activation_success (Releen veto vahvistettu)
CREATE OR REPLACE FUNCTION public.arcade_gateway_report_activation_success(
    p_venue_id TEXT,
    p_gateway_id TEXT,
    p_gateway_token TEXT,
    p_command_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue RECORD;
    v_cmd RECORD;
BEGIN
    SELECT * INTO v_venue FROM public.arcade_venues WHERE venue_id = p_venue_id;
    IF NOT FOUND OR v_venue.gateway_token_hash IS NULL OR
       encode(digest(p_gateway_token, 'sha256'), 'hex') <> v_venue.gateway_token_hash THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'statusCode', 401);
    END IF;

    SELECT * INTO v_cmd 
    FROM public.arcade_gateway_commands 
    WHERE command_id = p_command_id AND venue_id = p_venue_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'COMMAND_NOT_FOUND', 'statusCode', 404);
    END IF;

    UPDATE public.arcade_gateway_commands
    SET status = 'active',
        updated_at = now()
    WHERE id = v_cmd.id;

    UPDATE public.arcade_orders
    SET status = 'active',
        updated_at = now()
    WHERE order_id = v_cmd.order_id;

    UPDATE public.arcade_table_configs
    SET lock_state = 'active',
        updated_at = now()
    WHERE table_id = v_cmd.table_id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (v_cmd.table_id, p_venue_id, 'gateway_activation_success', jsonb_build_object(
        'command_id', p_command_id,
        'gateway_id', p_gateway_id,
        'order_id', v_cmd.order_id
    ));

    RETURN jsonb_build_object('success', true, 'command_id', p_command_id);
END;
$$;

-- 9. RPC: arcade_gateway_report_off (Auktoritatiivinen pilvisovittelu ja huoltotilan säilytys)
CREATE OR REPLACE FUNCTION public.arcade_gateway_report_off(
    p_venue_id TEXT,
    p_gateway_id TEXT,
    p_gateway_token TEXT,
    p_command_id TEXT,
    p_off_observed_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue RECORD;
    v_cmd RECORD;
    v_table RECORD;
    v_target_lock_state TEXT;
BEGIN
    SELECT * INTO v_venue FROM public.arcade_venues WHERE venue_id = p_venue_id;
    IF NOT FOUND OR v_venue.gateway_token_hash IS NULL OR
       encode(digest(p_gateway_token, 'sha256'), 'hex') <> v_venue.gateway_token_hash THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'statusCode', 401);
    END IF;

    SELECT * INTO v_cmd 
    FROM public.arcade_gateway_commands 
    WHERE command_id = p_command_id AND venue_id = p_venue_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'COMMAND_NOT_FOUND', 'statusCode', 404);
    END IF;

    -- Idempotenssi: Jos jo päätetty
    IF v_cmd.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED', 'table_id', v_cmd.table_id);
    END IF;

    -- Aikarajatarkistus: Ei saa vapauttaa ennen muuttumatonta aikarajaa
    IF p_off_observed_at < (v_cmd.game_expires_at - interval '1 second') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'EARLY_OFF_REJECTED', 
            'statusCode', 400, 
            'error', 'Off report rejected: game_expires_at has not elapsed',
            'game_expires_at', v_cmd.game_expires_at,
            'off_observed_at', p_off_observed_at
        );
    END IF;

    -- Tarkistetaan odottava huoltotila (pending_maintenance_lock)
    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = v_cmd.table_id
    FOR UPDATE;

    IF v_table.pending_maintenance_lock THEN
        v_target_lock_state := 'maintenance_locked';
    ELSE
        v_target_lock_state := 'available';
    END IF;

    UPDATE public.arcade_table_configs
    SET lock_state = v_target_lock_state,
        pending_maintenance_lock = false,
        updated_at = now()
    WHERE table_id = v_cmd.table_id;

    UPDATE public.arcade_orders
    SET status = 'completed',
        updated_at = now()
    WHERE order_id = v_cmd.order_id;

    UPDATE public.arcade_gateway_commands
    SET status = 'completed',
        off_observed_at = p_off_observed_at,
        updated_at = now()
    WHERE id = v_cmd.id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (v_cmd.table_id, p_venue_id, 'gateway_off_reconciled', jsonb_build_object(
        'command_id', p_command_id,
        'gateway_id', p_gateway_id,
        'order_id', v_cmd.order_id,
        'off_observed_at', p_off_observed_at,
        'table_lock_state', v_target_lock_state
    ));

    RETURN jsonb_build_object(
        'success', true,
        'command_id', p_command_id,
        'table_id', v_cmd.table_id,
        'table_lock_state', v_target_lock_state,
        'reconciled_at', now()
    );
END;
$$;

-- 10. RPC: arcade_gateway_report_uncertain (Epäselvä tilanne / virhelukitus)
CREATE OR REPLACE FUNCTION public.arcade_gateway_report_uncertain(
    p_venue_id TEXT,
    p_gateway_id TEXT,
    p_gateway_token TEXT,
    p_command_id TEXT,
    p_error_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue RECORD;
    v_cmd RECORD;
BEGIN
    SELECT * INTO v_venue FROM public.arcade_venues WHERE venue_id = p_venue_id;
    IF NOT FOUND OR v_venue.gateway_token_hash IS NULL OR
       encode(digest(p_gateway_token, 'sha256'), 'hex') <> v_venue.gateway_token_hash THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'statusCode', 401);
    END IF;

    SELECT * INTO v_cmd 
    FROM public.arcade_gateway_commands 
    WHERE command_id = p_command_id AND venue_id = p_venue_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'COMMAND_NOT_FOUND', 'statusCode', 404);
    END IF;

    UPDATE public.arcade_gateway_commands
    SET status = 'failed',
        error_reason = p_error_reason,
        updated_at = now()
    WHERE id = v_cmd.id;

    UPDATE public.arcade_orders
    SET status = 'hardware_uncertain',
        error_reason = p_error_reason,
        updated_at = now()
    WHERE order_id = v_cmd.order_id;

    UPDATE public.arcade_table_configs
    SET lock_state = 'error_locked',
        updated_at = now()
    WHERE table_id = v_cmd.table_id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (v_cmd.table_id, p_venue_id, 'gateway_hardware_uncertain', jsonb_build_object(
        'command_id', p_command_id,
        'gateway_id', p_gateway_id,
        'error_reason', p_error_reason
    ));

    RETURN jsonb_build_object('success', true, 'command_id', p_command_id, 'lock_state', 'error_locked');
END;
$$;

-- 11. OIKEUKSIEN HALLINTA (Least Privilege)
-- Perutaan kaikki oletusoikeudet
REVOKE EXECUTE ON FUNCTION public.arcade_queue_gateway_command FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_gateway_claim_command FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_gateway_report_dispatch_attempt FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_gateway_report_activation_success FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_gateway_report_off FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_gateway_report_uncertain FROM PUBLIC, anon, authenticated;

-- Jonoon asettaminen sallitaan vain palvelinroolille (backend / service_role)
GRANT EXECUTE ON FUNCTION public.arcade_queue_gateway_command TO service_role;

-- Gateway-kutsut sallitaan anon- ja authenticated-rooleille (autentikoidaan sisäisesti tokenilla)
GRANT EXECUTE ON FUNCTION public.arcade_gateway_claim_command TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_gateway_report_dispatch_attempt TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_gateway_report_activation_success TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_gateway_report_off TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_gateway_report_uncertain TO anon, authenticated, service_role;
