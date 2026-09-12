-- ==============================================================================
-- SUBSOCCER ARCADE — PHASE 1: VENUE PIN AUTH, MAINTENANCE & FREE PLAY SYMMETRY
-- Migration: 20260912_arcade_phase1_moderator_and_maintenance.sql
-- ==============================================================================

-- 0. Pgcrypto-laajennus
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. ENUMIT JA RAJOITTEET
ALTER TYPE public.arcade_order_status ADD VALUE IF NOT EXISTS 'interrupted';

ALTER TABLE IF EXISTS public.arcade_orders 
    DROP CONSTRAINT IF EXISTS arcade_orders_amount_cents_check;

ALTER TABLE IF EXISTS public.arcade_orders 
    ADD CONSTRAINT arcade_orders_amount_cents_check CHECK (amount_cents >= 0);

ALTER TABLE IF EXISTS public.arcade_sessions
    DROP CONSTRAINT IF EXISTS arcade_sessions_status_check;

ALTER TABLE IF EXISTS public.arcade_sessions
    ADD CONSTRAINT arcade_sessions_status_check
    CHECK (status IN ('requested', 'active', 'cooldown', 'completed', 'failed', 'canceled', 'force_stopped', 'hardware_uncertain', 'interrupted'));

-- 2. TOIMIPAIKKATAULUT JA PIN-YRITYSRAJOITUS
CREATE TABLE IF NOT EXISTS public.arcade_venues (
    venue_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT,                     -- bcrypt-tiiviste (sisältää suolan)
    pin_version INT NOT NULL DEFAULT 1, -- kasvaa vaihdossa -> mitätöi aiemmat istunnot
    venue_failed_attempts INT NOT NULL DEFAULT 0,
    venue_locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asiakaskohtainen yritysseuranta (estäen DoS koko ravintolalle)
CREATE TABLE IF NOT EXISTS public.arcade_pin_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_id TEXT NOT NULL REFERENCES public.arcade_venues(venue_id) ON DELETE CASCADE,
    caller_hash TEXT NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(venue_id, caller_hash)
);

CREATE INDEX IF NOT EXISTS idx_arcade_pin_attempts_lookup 
ON public.arcade_pin_attempts(venue_id, caller_hash);

-- Pöytäasetukset: toimipaikkaviite ja huoltolippu
ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS venue_id TEXT REFERENCES public.arcade_venues(venue_id);

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS pending_maintenance_lock BOOLEAN NOT NULL DEFAULT false;

-- Skeemakorjaus: arcade_events ei saa vaatia pöytää järjestelmätason tapahtumissa
ALTER TABLE IF EXISTS public.arcade_events 
    ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE IF EXISTS public.arcade_events 
    ADD COLUMN IF NOT EXISTS venue_id TEXT;

-- Alustetaan pilottitoimipaikat ILMAN oletus-PINiä (superadmin asettaa PINin APIlla)
INSERT INTO public.arcade_venues (venue_id, name)
VALUES 
    ('venue-demo-01', 'Mall of Tripla Demo Venue'),
    ('venue-tripla', 'Mall of Tripla Subsoccer Lounge')
ON CONFLICT (venue_id) DO NOTHING;

UPDATE public.arcade_table_configs
SET venue_id = 'venue-demo-01'
WHERE table_id = 'demo-pulse-01' AND venue_id IS NULL;

UPDATE public.arcade_table_configs
SET venue_id = 'venue-tripla'
WHERE table_id = 'subsoccer-tripla-live-01' AND venue_id IS NULL;

-- 3. ATOMINEN PIN-TARKISTUS: arcade_verify_venue_pin
-- Tarkistaa PINin bcrypt crypt() -funktiolla samassa tietokantalukituksessa ilman suolakilpailua
CREATE OR REPLACE FUNCTION public.arcade_verify_venue_pin(
    p_table_id TEXT,
    p_pin TEXT,
    p_caller_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_table RECORD;
    v_venue RECORD;
    v_caller RECORD;
    v_is_valid BOOLEAN := false;
    v_caller_remaining INT;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_pin IS NULL OR trim(p_pin) = '' OR
       p_caller_hash IS NULL OR trim(p_caller_hash) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400, 'error', 'Puuttuvia parametreja PIN-kirjautumisessa.');
    END IF;

    -- 1. Etsi pöytä
    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404, 'error', 'Pöytää ei löydy.');
    END IF;

    IF v_table.venue_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'VENUE_NOT_CONFIGURED', 'statusCode', 400, 'error', 'Pöydälle ei ole määritetty toimipaikkaa.');
    END IF;

    -- 2. Lukitse toimipaikka FOR UPDATE (estää samanaikaisen PIN-vaihdon kilpailutilanteen)
    SELECT * INTO v_venue
    FROM public.arcade_venues
    WHERE venue_id = v_table.venue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'VENUE_NOT_FOUND', 'statusCode', 404, 'error', 'Toimipaikkaa ei löydy.');
    END IF;

    -- 3. Tarkista toimipaikkatason suojalukko (esim. 25 yrityksen DoS-suoja)
    IF v_venue.venue_locked_until IS NOT NULL AND v_venue.venue_locked_until > now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'VENUE_LOCKED_OUT',
            'statusCode', 429,
            'locked_until', v_venue.venue_locked_until,
            'seconds_remaining', ceil(extract(epoch from (v_venue.venue_locked_until - now()))),
            'error', 'Toimipaikan kirjautuminen on tilapäisesti estetty järjestelmätason suojalukituksella. Ota yhteys ylläpitoon.'
        );
    END IF;

    -- 4. Tarkista onko PIN asetettu toimipaikalle
    IF v_venue.pin_hash IS NULL OR trim(v_venue.pin_hash) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PIN_NOT_CONFIGURED',
            'statusCode', 400,
            'error', 'Toimipaikalle ei ole vielä asetettu PIN-koodia. Pyydä ylläpitoa määrittämään PIN.'
        );
    END IF;

    -- 5. Asiakaskohtainen yritysseuranta (FOR UPDATE)
    INSERT INTO public.arcade_pin_attempts (venue_id, caller_hash, failed_attempts, last_attempt_at)
    VALUES (v_venue.venue_id, p_caller_hash, 0, now())
    ON CONFLICT (venue_id, caller_hash) DO NOTHING;

    SELECT * INTO v_caller
    FROM public.arcade_pin_attempts
    WHERE venue_id = v_venue.venue_id AND caller_hash = p_caller_hash
    FOR UPDATE;

    -- Tarkista onko tämä laite lukittu
    IF v_caller.locked_until IS NOT NULL AND v_caller.locked_until > now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CALLER_LOCKED_OUT',
            'statusCode', 429,
            'locked_until', v_caller.locked_until,
            'seconds_remaining', ceil(extract(epoch from (v_caller.locked_until - now()))),
            'error', 'Liian monta virheellistä yritystä tältä laitteelta. Yritä uudelleen 15 minuutin kuluttua.'
        );
    END IF;

    -- 6. ATOMINEN VERTAILU: crypt(p_pin, v_venue.pin_hash)
    v_is_valid := (v_venue.pin_hash = extensions.crypt(p_pin, v_venue.pin_hash));

    IF v_is_valid THEN
        -- Nollaa laitteen ja toimipaikan epäonnistumiset
        UPDATE public.arcade_pin_attempts
        SET failed_attempts = 0, locked_until = NULL, last_attempt_at = now()
        WHERE id = v_caller.id;

        UPDATE public.arcade_venues
        SET venue_failed_attempts = 0, venue_locked_until = NULL, updated_at = now()
        WHERE venue_id = v_venue.venue_id;

        INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
        VALUES (p_table_id, v_venue.venue_id, 'venue_pin_verified', jsonb_build_object(
            'auth_method', 'shared_venue_pin',
            'venue_id', v_venue.venue_id,
            'table_id', p_table_id
        ));

        RETURN jsonb_build_object(
            'success', true,
            'statusCode', 200,
            'venue_id', v_venue.venue_id,
            'venue_name', v_venue.name,
            'pin_version', v_venue.pin_version
        );
    ELSE
        -- Epäonnistui: kasvata laitteen laskuria
        v_caller.failed_attempts := v_caller.failed_attempts + 1;
        v_caller_remaining := GREATEST(0, 5 - v_caller.failed_attempts);

        IF v_caller.failed_attempts >= 5 THEN
            v_caller.locked_until := now() + interval '15 minutes';
        END IF;

        UPDATE public.arcade_pin_attempts
        SET failed_attempts = v_caller.failed_attempts,
            locked_until = v_caller.locked_until,
            last_attempt_at = now()
        WHERE id = v_caller.id;

        -- Kasvata toimipaikan globaalia laskuria
        v_venue.venue_failed_attempts := v_venue.venue_failed_attempts + 1;
        IF v_venue.venue_failed_attempts >= 25 THEN
            v_venue.venue_locked_until := now() + interval '30 minutes';
        END IF;

        UPDATE public.arcade_venues
        SET venue_failed_attempts = v_venue.venue_failed_attempts,
            venue_locked_until = v_venue.venue_locked_until,
            updated_at = now()
        WHERE venue_id = v_venue.venue_id;

        INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
        VALUES (p_table_id, v_venue.venue_id, 'venue_pin_failed', jsonb_build_object(
            'auth_method', 'shared_venue_pin',
            'caller_failed_attempts', v_caller.failed_attempts,
            'caller_locked', (v_caller.failed_attempts >= 5),
            'venue_failed_attempts', v_venue.venue_failed_attempts,
            'venue_locked', (v_venue.venue_failed_attempts >= 25)
        ));

        IF v_caller.failed_attempts >= 5 THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'CALLER_LOCKED_OUT',
                'statusCode', 429,
                'attempts_remaining', 0,
                'locked', true,
                'locked_until', v_caller.locked_until,
                'error', 'Liian monta virheellistä yritystä tältä laitteelta. Lukittu 15 minuutiksi.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_PIN',
            'statusCode', 401,
            'attempts_remaining', v_caller_remaining,
            'locked', false,
            'error', 'Virheellinen PIN-koodi. Yrityksiä jäljellä: ' || v_caller_remaining
        );
    END IF;
END;
$$;

-- 4. ATOMINEN PIN-ASETUS JA -VAIHTO: arcade_set_venue_pin
CREATE OR REPLACE FUNCTION public.arcade_set_venue_pin(
    p_venue_id TEXT,
    p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_venue RECORD;
    v_new_version INT;
BEGIN
    IF p_venue_id IS NULL OR trim(p_venue_id) = '' OR
       p_new_pin IS NULL OR length(trim(p_new_pin)) < 4 OR length(trim(p_new_pin)) > 8 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400, 'error', 'Uuden PIN-koodin on oltava 4–8 merkkiä.');
    END IF;

    SELECT * INTO v_venue
    FROM public.arcade_venues
    WHERE venue_id = p_venue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'VENUE_NOT_FOUND', 'statusCode', 404, 'error', 'Toimipaikkaa ei löydy.');
    END IF;

    v_new_version := v_venue.pin_version + 1;

    -- Päivitä uusi bcrypt-tiiviste ja nosta pin_version (mitätöi aiemmat istunnot välittömästi)
    UPDATE public.arcade_venues
    SET pin_hash = extensions.crypt(trim(p_new_pin), extensions.gen_salt('bf', 10)),
        pin_version = v_new_version,
        venue_failed_attempts = 0,
        venue_locked_until = NULL,
        updated_at = now()
    WHERE venue_id = p_venue_id;

    -- Nollaa kaikki laitekohtaiset lukitukset PIN-vaihdon yhteydessä
    DELETE FROM public.arcade_pin_attempts
    WHERE venue_id = p_venue_id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (NULL, p_venue_id, 'venue_pin_rotated', jsonb_build_object(
        'venue_id', p_venue_id,
        'new_version', v_new_version
    ));

    RETURN jsonb_build_object(
        'success', true,
        'statusCode', 200,
        'venue_id', p_venue_id,
        'pin_version', v_new_version
    );
END;
$$;

-- 5. ATOMINEN LUKITUKSEN PURKU: arcade_reset_venue_lockout
CREATE OR REPLACE FUNCTION public.arcade_reset_venue_lockout(
    p_venue_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue RECORD;
BEGIN
    IF p_venue_id IS NULL OR trim(p_venue_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    SELECT * INTO v_venue
    FROM public.arcade_venues
    WHERE venue_id = p_venue_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'VENUE_NOT_FOUND', 'statusCode', 404);
    END IF;

    UPDATE public.arcade_venues
    SET venue_failed_attempts = 0,
        venue_locked_until = NULL,
        updated_at = now()
    WHERE venue_id = p_venue_id;

    DELETE FROM public.arcade_pin_attempts
    WHERE venue_id = p_venue_id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (NULL, p_venue_id, 'venue_lockout_cleared', jsonb_build_object(
        'venue_id', p_venue_id
    ));

    RETURN jsonb_build_object(
        'success', true,
        'statusCode', 200,
        'venue_id', p_venue_id,
        'message', 'Toimipaikan lukitus ja yrityslaskurit on nollattu.'
    );
END;
$$;

-- 6. PÄIVITETTY FUNKTIO: arcade_create_payment_hold
CREATE OR REPLACE FUNCTION public.arcade_create_payment_hold(
    p_table_id TEXT,
    p_duration_minutes INTEGER,
    p_duration_seconds INTEGER,
    p_amount_cents INTEGER,
    p_currency TEXT,
    p_client_token_hash TEXT,
    p_hold_seconds INTEGER DEFAULT 180
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_active_session RECORD;
    v_active_order RECORD;
    v_new_order_id TEXT;
    v_hold_expires TIMESTAMPTZ;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_client_token_hash IS NULL OR trim(p_client_token_hash) = '' OR
       p_duration_seconds <= 0 OR p_amount_cents <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    -- 1. PÖYTÄ LUKITUS FOR UPDATE
    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    IF NOT v_table.is_enabled OR v_table.lock_state IN ('maintenance_locked', 'error_locked') OR v_table.pending_maintenance_lock THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'TABLE_LOCKED', 
            'statusCode', 423, 
            'lock_state', v_table.lock_state,
            'pending_maintenance_lock', v_table.pending_maintenance_lock,
            'error', 'Pöytä on poissa käytöstä tai lukittu huoltotilaan.'
        );
    END IF;

    -- 2. FYYSINEN SESSIO
    SELECT * INTO v_active_session
    FROM public.arcade_sessions
    WHERE table_id = p_table_id
      AND status IN ('requested', 'active', 'cooldown', 'hardware_uncertain')
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'TABLE_BUSY', 
            'statusCode', 409, 
            'error', 'Pöydällä on käynnissä oleva fyysinen pelijakso.',
            'session_status', v_active_session.status,
            'expires_at', v_active_session.expires_at
        );
    END IF;

    -- 3. TILAUKSET
    SELECT * INTO v_active_order
    FROM public.arcade_orders
    WHERE table_id = p_table_id
      AND status IN ('holding', 'processing', 'active', 'hardware_uncertain')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        IF v_active_order.status IN ('active', 'processing', 'hardware_uncertain') OR v_active_order.hardware_dispatched_at IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false, 
                'code', 'TABLE_BUSY', 
                'statusCode', 409, 
                'error', 'Pöytä on parhaillaan varattu tai käytössä.',
                'expires_at', v_active_order.expires_at
            );
        END IF;

        IF v_active_order.status = 'holding' THEN
            IF v_active_order.hold_expires_at > now() THEN
                IF v_active_order.client_token_hash = p_client_token_hash THEN
                    RETURN jsonb_build_object(
                        'success', true,
                        'is_replay', true,
                        'order_id', v_active_order.order_id,
                        'hold_expires_at', v_active_order.hold_expires_at,
                        'amount_cents', v_active_order.amount_cents,
                        'duration_minutes', v_active_order.duration_minutes
                    );
                END IF;

                RETURN jsonb_build_object(
                    'success', false, 
                    'code', 'TABLE_HELD', 
                    'statusCode', 409, 
                    'error', 'Pöytä on parhaillaan toisen pelaajan varattavana.',
                    'hold_expires_at', v_active_order.hold_expires_at
                );
            ELSE
                UPDATE public.arcade_orders
                SET status = 'hold_expired', updated_at = now()
                WHERE id = v_active_order.id;
            END IF;
        END IF;
    END IF;

    -- 4. UUSI TILAUS
    v_new_order_id := 'ord-' || floor(extract(epoch from now()) * 1000)::text || '-' || substr(md5(random()::text), 1, 7);
    v_hold_expires := now() + (p_hold_seconds || ' seconds')::interval;

    INSERT INTO public.arcade_orders (
        order_id,
        table_id,
        status,
        duration_minutes,
        duration_seconds,
        amount_cents,
        currency,
        hold_expires_at,
        client_token_hash,
        payment_status,
        created_at,
        updated_at
    ) VALUES (
        v_new_order_id,
        p_table_id,
        'holding',
        p_duration_minutes,
        p_duration_seconds,
        p_amount_cents,
        lower(p_currency),
        v_hold_expires,
        p_client_token_hash,
        'pending',
        now(),
        now()
    );

    UPDATE public.arcade_table_configs
    SET lock_state = 'pending_payment', updated_at = now()
    WHERE table_id = p_table_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_replay', false,
        'order_id', v_new_order_id,
        'table_id', p_table_id,
        'amount_cents', p_amount_cents,
        'currency', lower(p_currency),
        'duration_minutes', p_duration_minutes,
        'hold_expires_at', v_hold_expires
    );
END;
$$;

-- 7. PÄIVITETTY FUNKTIO: arcade_claim_order_for_activation (Tuki nollasummalle)
CREATE OR REPLACE FUNCTION public.arcade_claim_order_for_activation(
    p_table_id TEXT,
    p_order_id TEXT,
    p_payment_intent_id TEXT,
    p_amount_cents INTEGER,
    p_currency TEXT,
    p_worker_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_order RECORD;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_order_id IS NULL OR trim(p_order_id) = '' OR
       p_worker_id IS NULL OR trim(p_worker_id) = '' OR
       p_amount_cents IS NULL OR p_amount_cents < 0 OR
       p_currency IS NULL OR trim(p_currency) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_PARAMETERS',
            'statusCode', 400,
            'refund_required', false,
            'error', 'Puuttuvia tai virheellisiä parametreja tilauksen lunastuksessa.'
        );
    END IF;

    IF p_amount_cents > 0 AND (p_payment_intent_id IS NULL OR trim(p_payment_intent_id) = '') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_PARAMETERS',
            'statusCode', 400,
            'refund_required', true,
            'error', 'Maksullinen tilaus vaatii kelvollisen Stripe PaymentIntent -tunnisteen.'
        );
    END IF;

    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404, 'refund_required', (p_amount_cents > 0));
    END IF;

    IF v_table.lock_state = 'maintenance_locked' OR v_table.pending_maintenance_lock THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TABLE_LOCKED',
            'statusCode', 423,
            'refund_required', (p_amount_cents > 0),
            'error', 'Pöytä on huoltotilassa. Aktivointi hylätty.'
        );
    END IF;

    SELECT * INTO v_order
    FROM public.arcade_orders
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404, 'refund_required', (p_amount_cents > 0));
    END IF;

    IF v_order.table_id <> p_table_id THEN
        INSERT INTO public.arcade_events (table_id, event_type, payload)
        VALUES (p_table_id, 'switch_error', jsonb_build_object('error', 'TABLE_MISMATCH', 'order_id', p_order_id, 'incoming_table', p_table_id, 'order_table', v_order.table_id));

        RETURN jsonb_build_object('success', false, 'code', 'TABLE_MISMATCH', 'statusCode', 400, 'refund_required', (p_amount_cents > 0));
    END IF;

    IF v_order.amount_cents <> p_amount_cents OR lower(v_order.currency) <> lower(p_currency) THEN
        INSERT INTO public.arcade_events (table_id, event_type, payload)
        VALUES (p_table_id, 'switch_error', jsonb_build_object('error', 'AMOUNT_OR_CURRENCY_MISMATCH', 'order_id', p_order_id, 'expected_cents', v_order.amount_cents, 'incoming_cents', p_amount_cents));

        RETURN jsonb_build_object('success', false, 'code', 'AMOUNT_MISMATCH', 'statusCode', 400, 'refund_required', (p_amount_cents > 0));
    END IF;

    IF p_amount_cents > 0 THEN
        IF v_order.stripe_payment_intent_id IS NULL OR v_order.stripe_payment_intent_id <> p_payment_intent_id THEN
            INSERT INTO public.arcade_events (table_id, event_type, payload)
            VALUES (p_table_id, 'switch_error', jsonb_build_object('error', 'PAYMENT_INTENT_MISMATCH', 'order_id', p_order_id, 'expected_pi', v_order.stripe_payment_intent_id, 'incoming_pi', p_payment_intent_id));

            RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_INTENT_MISMATCH', 'statusCode', 400, 'refund_required', true);
        END IF;
    END IF;

    IF v_order.status = 'active' THEN
        RETURN jsonb_build_object('success', true, 'is_idempotent_replay', true, 'status', 'active', 'order_id', v_order.order_id, 'session_id', v_order.session_id, 'expires_at', v_order.expires_at);
    END IF;

    IF v_order.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'is_idempotent_replay', true, 'status', 'completed', 'order_id', v_order.order_id, 'session_id', v_order.session_id, 'completed_at', v_order.completed_at);
    END IF;

    IF v_order.status = 'processing' THEN
        RETURN jsonb_build_object('success', true, 'is_idempotent_replay', true, 'status', 'processing', 'order_id', v_order.order_id, 'claimed_by_worker', v_order.claimed_by_worker);
    END IF;

    IF v_order.status IN ('hold_expired', 'activation_failed', 'hardware_uncertain', 'resolved_uncertain', 'interrupted', 'cancelled') THEN
        IF p_amount_cents > 0 THEN
            UPDATE public.arcade_orders
            SET payment_status = 'succeeded',
                stripe_payment_intent_id = p_payment_intent_id,
                refund_status = CASE WHEN refund_status IN ('refund_initiated', 'refund_completed') THEN refund_status ELSE 'refund_required'::arcade_refund_status END,
                refund_reason = COALESCE(refund_reason, 'LATE_PAYMENT_ON_' || v_order.status),
                updated_at = now()
            WHERE id = v_order.id;

            RETURN jsonb_build_object('success', false, 'code', v_order.status, 'statusCode', 409, 'refund_required', true, 'error', 'Maksu saapui päättyneeseen tilaan.');
        ELSE
            RETURN jsonb_build_object('success', false, 'code', v_order.status, 'statusCode', 409, 'refund_required', false, 'error', 'Ilmaisvaraus on päättynyt.');
        END IF;
    END IF;

    IF v_order.status = 'holding' AND v_order.hold_expires_at <= now() THEN
        IF p_amount_cents > 0 THEN
            UPDATE public.arcade_orders
            SET status = 'hold_expired',
                payment_status = 'succeeded',
                stripe_payment_intent_id = p_payment_intent_id,
                refund_status = CASE WHEN refund_status IN ('refund_initiated', 'refund_completed') THEN refund_status ELSE 'refund_required'::arcade_refund_status END,
                refund_reason = 'LATE_PAYMENT_AFTER_HOLD_EXPIRY',
                updated_at = now()
            WHERE id = v_order.id;

            RETURN jsonb_build_object('success', false, 'code', 'HOLD_EXPIRED', 'statusCode', 409, 'refund_required', true, 'error', 'Varausaika ehti umpeutua.');
        ELSE
            UPDATE public.arcade_orders SET status = 'hold_expired', updated_at = now() WHERE id = v_order.id;
            RETURN jsonb_build_object('success', false, 'code', 'HOLD_EXPIRED', 'statusCode', 409, 'refund_required', false, 'error', 'Ilmaisvarausaika ehti umpeutua.');
        END IF;
    END IF;

    UPDATE public.arcade_orders
    SET status = 'processing',
        payment_status = CASE WHEN p_amount_cents > 0 THEN 'succeeded'::arcade_payment_status ELSE payment_status END,
        stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
        claimed_by_worker = p_worker_id,
        updated_at = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'is_idempotent_replay', false,
        'order_id', v_order.order_id,
        'table_id', v_order.table_id,
        'duration_minutes', v_order.duration_minutes,
        'duration_seconds', v_order.duration_seconds
    );
END;
$$;

-- 8. PÄIVITETTY FUNKTIO: arcade_create_free_play_hold (Toimipaikkakohtainen audit)
CREATE OR REPLACE FUNCTION public.arcade_create_free_play_hold(
    p_table_id TEXT,
    p_duration_minutes INTEGER,
    p_venue_id TEXT,
    p_auth_method TEXT DEFAULT 'shared_venue_pin',
    p_client_token_hash VARCHAR(64) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_order_id TEXT;
    v_hold_expires_at TIMESTAMPTZ;
    v_duration_seconds INTEGER;
    v_actual_token_hash VARCHAR(64);
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    v_duration_seconds := p_duration_minutes * 60;
    v_actual_token_hash := COALESCE(p_client_token_hash, repeat('0', 64));

    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    IF NOT v_table.is_enabled THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_DISABLED', 'statusCode', 400);
    END IF;

    IF v_table.lock_state = 'maintenance_locked' OR v_table.pending_maintenance_lock THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_LOCKED', 'statusCode', 423, 'error', 'Pöytä on huoltotilassa.');
    END IF;

    IF v_table.lock_state = 'error_locked' THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_ERROR_LOCKED', 'statusCode', 423, 'error', 'Pöytä on virhelukittu.');
    END IF;

    IF v_table.lock_state IN ('active', 'pending_payment') THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_BUSY', 'statusCode', 409, 'error', 'Pöytä on varattu tai peli on käynnissä.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.arcade_orders
        WHERE table_id = p_table_id
          AND status IN ('holding', 'processing', 'active', 'hardware_uncertain')
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_BUSY', 'statusCode', 409, 'error', 'Pöydällä on jo keskeneräinen tilaus.');
    END IF;

    v_order_id := 'ord-free-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 6);
    v_hold_expires_at := now() + interval '3 minutes';

    INSERT INTO public.arcade_orders (
        order_id,
        table_id,
        status,
        duration_minutes,
        duration_seconds,
        amount_cents,
        currency,
        hold_expires_at,
        payment_status,
        refund_status,
        client_token_hash,
        claimed_by_worker
    ) VALUES (
        v_order_id,
        p_table_id,
        'holding',
        p_duration_minutes,
        v_duration_seconds,
        0,
        'eur',
        v_hold_expires_at,
        'succeeded',
        'none',
        v_actual_token_hash,
        COALESCE(p_auth_method, 'shared_venue_pin') || ':' || COALESCE(p_venue_id, 'unknown')
    );

    UPDATE public.arcade_table_configs
    SET lock_state = 'pending_payment', updated_at = now()
    WHERE table_id = p_table_id;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (p_table_id, p_venue_id, 'free_play_granted', jsonb_build_object(
        'order_id', v_order_id,
        'duration_minutes', p_duration_minutes,
        'auth_method', COALESCE(p_auth_method, 'shared_venue_pin'),
        'venue_id', p_venue_id
    ));

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'table_id', p_table_id,
        'amount_cents', 0,
        'duration_minutes', p_duration_minutes,
        'duration_seconds', v_duration_seconds,
        'hold_expires_at', v_hold_expires_at
    );
END;
$$;

-- 9. PÄIVITETTY FUNKTIO: arcade_set_table_maintenance
CREATE OR REPLACE FUNCTION public.arcade_set_table_maintenance(
    p_table_id TEXT,
    p_maintenance_enabled BOOLEAN,
    p_venue_id TEXT DEFAULT NULL,
    p_auth_method TEXT DEFAULT 'shared_venue_pin',
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_is_deferred BOOLEAN := false;
    v_target_lock_state TEXT;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR p_maintenance_enabled IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    IF p_maintenance_enabled THEN
        IF v_table.lock_state = 'active' THEN
            UPDATE public.arcade_table_configs
            SET pending_maintenance_lock = true, updated_at = now()
            WHERE table_id = p_table_id;
            v_is_deferred := true;
            v_target_lock_state := 'active';
        ELSIF v_table.lock_state = 'pending_payment' THEN
            UPDATE public.arcade_table_configs
            SET pending_maintenance_lock = true, updated_at = now()
            WHERE table_id = p_table_id;
            v_is_deferred := true;
            v_target_lock_state := 'pending_payment';
        ELSE
            UPDATE public.arcade_table_configs
            SET lock_state = 'maintenance_locked', pending_maintenance_lock = false, updated_at = now()
            WHERE table_id = p_table_id;
            v_is_deferred := false;
            v_target_lock_state := 'maintenance_locked';
        END IF;
    ELSE
        UPDATE public.arcade_table_configs
        SET lock_state = 'available', pending_maintenance_lock = false, updated_at = now()
        WHERE table_id = p_table_id;
        v_is_deferred := false;
        v_target_lock_state := 'available';
    END IF;

    INSERT INTO public.arcade_events (table_id, venue_id, event_type, payload)
    VALUES (p_table_id, p_venue_id, 'maintenance_state_changed', jsonb_build_object(
        'maintenance_enabled', p_maintenance_enabled,
        'lock_state', v_target_lock_state,
        'pending_maintenance_lock', (p_maintenance_enabled AND v_is_deferred),
        'is_deferred', v_is_deferred,
        'auth_method', COALESCE(p_auth_method, 'shared_venue_pin'),
        'venue_id', p_venue_id,
        'reason', p_reason
    ));

    RETURN jsonb_build_object(
        'success', true,
        'table_id', p_table_id,
        'lock_state', v_target_lock_state,
        'pending_maintenance_lock', (p_maintenance_enabled AND v_is_deferred),
        'is_deferred', v_is_deferred,
        'message', CASE 
            WHEN p_maintenance_enabled AND v_is_deferred 
                THEN 'Peli on käynnissä. Pöytä lukittuu huoltotilaan pelin päättyessä.'
            WHEN p_maintenance_enabled 
                THEN 'Pöytä on asetettu huoltotilaan välittömästi.'
            ELSE 'Huoltotila poistettu. Pöytä on vapaa.'
        END
    );
END;
$$;

-- 10. PÄIVITETTY FUNKTIO: arcade_release_reconciled_table
CREATE OR REPLACE FUNCTION public.arcade_release_reconciled_table(
    p_table_id TEXT,
    p_order_id TEXT,
    p_session_id UUID,
    p_confirmed_off BOOLEAN,
    p_confirmed_off_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_order RECORD;
    v_session RECORD;
    v_target_lock_state TEXT;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_order_id IS NULL OR trim(p_order_id) = '' OR
       p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    SELECT * INTO v_table FROM public.arcade_table_configs AS tc WHERE tc.table_id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404); END IF;

    SELECT * INTO v_order FROM public.arcade_orders AS ord WHERE ord.order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404); END IF;

    SELECT * INTO v_session FROM public.arcade_sessions AS sess WHERE sess.id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND', 'statusCode', 404); END IF;

    IF v_order.table_id <> p_table_id OR v_session.table_id <> p_table_id OR v_order.session_id <> p_session_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'OWNERSHIP_MISMATCH', 'statusCode', 400);
    END IF;

    IF v_order.status IN ('completed', 'resolved_uncertain', 'hold_expired', 'activation_failed', 'cancelled', 'interrupted')
       OR v_session.status IN ('completed', 'failed', 'canceled', 'force_stopped') THEN
        RETURN jsonb_build_object(
            'success', true, 'is_idempotent_replay', true, 'already_resolved', true,
            'order_status', v_order.status, 'session_status', v_session.status,
            'message', 'Tilaus on jo aiemmin purettu.'
        );
    END IF;

    IF v_order.status NOT IN ('active', 'hardware_uncertain') THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_IN_RELEASABLE_STATE', 'statusCode', 409, 'status', v_order.status);
    END IF;

    IF p_confirmed_off IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'RELE_STILL_ON_OR_UNCONFIRMED', 'statusCode', 409);
    END IF;

    IF p_confirmed_off_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'MISSING_OFF_CONFIRMATION_TIME', 'statusCode', 400);
    END IF;

    IF v_order.expires_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'MISSING_EXPIRES_AT', 'statusCode', 409);
    END IF;

    IF now() < (v_order.expires_at + interval '4 seconds') THEN
        RETURN jsonb_build_object('success', false, 'code', 'DEADLINE_NOT_ELAPSED', 'statusCode', 409);
    END IF;

    IF p_confirmed_off_at > (now() + interval '5 seconds') THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFF_OBSERVATION_IN_FUTURE', 'statusCode', 400);
    END IF;

    IF p_confirmed_off_at < (now() - interval '120 seconds') THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFF_OBSERVATION_STALE', 'statusCode', 409);
    END IF;

    IF p_confirmed_off_at < (v_order.expires_at + interval '4 seconds') THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFF_OBSERVED_BEFORE_DEADLINE', 'statusCode', 409);
    END IF;

    IF v_order.status = 'active' THEN
        UPDATE public.arcade_orders AS ord SET status = 'completed', completed_at = now(), updated_at = now() WHERE ord.id = v_order.id;
    ELSIF v_order.status = 'hardware_uncertain' THEN
        UPDATE public.arcade_orders AS ord SET status = 'resolved_uncertain', completed_at = now(), updated_at = now() WHERE ord.id = v_order.id;
    END IF;

    UPDATE public.arcade_sessions AS sess SET status = 'completed', confirmed_off_at = p_confirmed_off_at WHERE sess.id = v_session.id;

    -- PÖYDÄN TILAN RATKAISU: SÄILYTETÄÄN ODOTTAVA HUOLTOLUKKO!
    IF v_table.pending_maintenance_lock OR v_table.lock_state = 'maintenance_locked' THEN
        UPDATE public.arcade_table_configs AS tc
        SET lock_state = 'maintenance_locked', pending_maintenance_lock = false, updated_at = now()
        WHERE tc.table_id = p_table_id;
        v_target_lock_state := 'maintenance_locked';
    ELSE
        UPDATE public.arcade_table_configs AS tc
        SET lock_state = 'available', updated_at = now()
        WHERE tc.table_id = p_table_id;
        v_target_lock_state := 'available';
    END IF;

    RETURN jsonb_build_object('success', true, 'table_id', p_table_id, 'lock_state', v_target_lock_state);
END;
$$;

-- 11. PÄIVITETTY FUNKTIO: arcade_record_premature_cutoff
CREATE OR REPLACE FUNCTION public.arcade_record_premature_cutoff(
    p_table_id TEXT,
    p_order_id TEXT,
    p_session_id UUID,
    p_reason TEXT,
    p_device_uptime NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_order RECORD;
    v_session RECORD;
    v_target_lock_state TEXT;
    v_final_reason TEXT;
    v_refund_needed BOOLEAN;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_order_id IS NULL OR trim(p_order_id) = '' OR
       p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    SELECT * INTO v_table FROM public.arcade_table_configs WHERE table_id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404); END IF;

    SELECT * INTO v_order FROM public.arcade_orders WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404); END IF;

    SELECT * INTO v_session FROM public.arcade_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND', 'statusCode', 404); END IF;

    IF v_order.status = 'interrupted' THEN
        RETURN jsonb_build_object('success', true, 'is_idempotent_replay', true, 'status', 'interrupted');
    END IF;

    IF p_device_uptime IS NOT NULL AND p_device_uptime < 120 THEN
        v_final_reason := 'device_restarted';
    ELSE
        v_final_reason := COALESCE(p_reason, 'premature_cutoff');
    END IF;

    v_refund_needed := (v_order.amount_cents > 0);

    UPDATE public.arcade_orders
    SET status = 'interrupted',
        completed_at = now(),
        refund_status = CASE WHEN v_refund_needed THEN 'refund_required'::arcade_refund_status ELSE 'none'::arcade_refund_status END,
        refund_reason = v_final_reason,
        last_error_code = 'PREMATURE_CUTOFF',
        last_error_details = v_final_reason,
        updated_at = now()
    WHERE id = v_order.id;

    UPDATE public.arcade_sessions
    SET status = 'failed', error_reason = v_final_reason, confirmed_off_at = now()
    WHERE id = v_session.id;

    IF v_table.pending_maintenance_lock OR v_table.lock_state = 'maintenance_locked' THEN
        UPDATE public.arcade_table_configs
        SET lock_state = 'maintenance_locked', pending_maintenance_lock = false, updated_at = now()
        WHERE table_id = p_table_id;
        v_target_lock_state := 'maintenance_locked';
    ELSE
        UPDATE public.arcade_table_configs
        SET lock_state = 'available', updated_at = now()
        WHERE table_id = p_table_id;
        v_target_lock_state := 'available';
    END IF;

    INSERT INTO public.arcade_events (table_id, session_id, event_type, payload)
    VALUES (p_table_id, p_session_id, 'interrupted', jsonb_build_object(
        'order_id', p_order_id,
        'reason', v_final_reason,
        'device_uptime', p_device_uptime,
        'refund_required', v_refund_needed
    ));

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'interrupted',
        'reason', v_final_reason,
        'refund_required', v_refund_needed,
        'lock_state', v_target_lock_state
    );
END;
$$;

-- 12. KÄYTTÖOIKEUDET (Least Privilege)
REVOKE EXECUTE ON FUNCTION public.arcade_verify_venue_pin FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_set_venue_pin FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_reset_venue_lockout FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_claim_order_for_activation FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_create_free_play_hold FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_set_table_maintenance FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_release_reconciled_table FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_record_premature_cutoff FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.arcade_verify_venue_pin TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_set_venue_pin TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_reset_venue_lockout TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_claim_order_for_activation TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_create_free_play_hold TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_set_table_maintenance TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_release_reconciled_table TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_record_premature_cutoff TO service_role;
