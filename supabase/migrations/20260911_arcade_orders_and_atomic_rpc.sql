-- ==============================================================================
-- SUBSOCCER ARCADE — PERSISTENT ORDERS, PAYMENT HOLDS & ATOMIC RPC FUNCTIONS
-- Migration: 20260911_arcade_orders_and_atomic_rpc.sql
-- ==============================================================================

-- 1. ENUMIT JA CHECK-RAJOITTEET
DO $$ BEGIN
    CREATE TYPE arcade_order_status AS ENUM (
        'holding',             -- 3 min maksamisvaraus voimassa
        'processing',          -- Webhook lunastanut käsittelyyn, aktivointi käynnissä
        'active',              -- Peli käynnissä, rele kytketty ja vahvistettu
        'completed',           -- Peli päättynyt onnistuneesti ja rele sammunut
        'hold_expired',        -- Varausaika raukesi ennen maksua
        'activation_failed',   -- Rele sammutettu turvallisesti (State 0), mutta epäonnistui
        'hardware_uncertain',  -- Releen tila epävarma, pöytä virhelukittu (error_locked)
        'resolved_uncertain',  -- Epävarma tila purettu turvallisesti OFF-varmistuksen ja aikarajan jälkeen
        'cancelled'            -- Maksu epäonnistui tai peruttiin
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE arcade_payment_status AS ENUM (
        'pending',
        'succeeded',
        'failed',
        'canceled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE arcade_refund_status AS ENUM (
        'none',
        'refund_required',
        'refund_initiated',
        'refund_completed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Päivitetään arcade_table_configs lock_state CHECK-rajoite
ALTER TABLE IF EXISTS public.arcade_table_configs 
    DROP CONSTRAINT IF EXISTS arcade_table_configs_lock_state_check;

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD CONSTRAINT arcade_table_configs_lock_state_check 
    CHECK (lock_state IN ('available', 'pending_payment', 'active', 'maintenance_locked', 'error_locked'));

-- Varmistetaan arcade_sessions auth_source ja status CHECK-rajoitteet
ALTER TABLE IF EXISTS public.arcade_sessions 
    DROP CONSTRAINT IF EXISTS arcade_sessions_auth_source_check;

ALTER TABLE IF EXISTS public.arcade_sessions 
    ADD CONSTRAINT arcade_sessions_auth_source_check 
    CHECK (auth_source IN ('free_play', 'test_table', 'stripe', 'admin'));

ALTER TABLE IF EXISTS public.arcade_sessions 
    DROP CONSTRAINT IF EXISTS arcade_sessions_status_check;

ALTER TABLE IF EXISTS public.arcade_sessions 
    ADD CONSTRAINT arcade_sessions_status_check 
    CHECK (status IN ('requested', 'active', 'cooldown', 'completed', 'failed', 'canceled', 'force_stopped', 'hardware_uncertain'));

-- 2. TILAUSTAULU: arcade_orders
CREATE TABLE IF NOT EXISTS public.arcade_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,                                   -- ord-...
    table_id TEXT NOT NULL REFERENCES public.arcade_table_configs(table_id),
    status arcade_order_status NOT NULL DEFAULT 'holding',
    
    -- Hinnoittelu & kesto tarkistuksilla
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'eur',
    
    -- Ajoitukset: varausaika vs. peliaika
    hold_expires_at TIMESTAMPTZ NOT NULL,
    hardware_dispatched_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Stripe-kytkös (sidotaan luonnissa, vahvistetaan webhookissa)
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_idempotency_key TEXT UNIQUE,
    payment_status arcade_payment_status NOT NULL DEFAULT 'pending',
    refund_status arcade_refund_status NOT NULL DEFAULT 'none',
    refund_reason TEXT,
    
    -- Tietoturva: Asiakastunnisteesta vain SHA-256 tiiviste
    client_token_hash VARCHAR(64) NOT NULL,
    
    -- Käsittelijätunniste ja linkki fyysiseen sessioon
    session_id UUID REFERENCES public.arcade_sessions(id) ON DELETE SET NULL,
    claimed_by_worker TEXT,
    last_error_code TEXT,
    last_error_details TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_hold_future CHECK (hold_expires_at > created_at),
    CONSTRAINT chk_expires_after_dispatch CHECK (expires_at IS NULL OR hardware_dispatched_at IS NULL OR expires_at >= hardware_dispatched_at)
);

-- OSITTAINEN UNIIKKI-INDEKSI (Sisältää hardware_uncertain!):
-- Takaa tietokantatasolla, ettei pöydällä voi koskaan olla kahta aktiivista,
-- varaavaa tai epäselvää tilausta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_arcade_orders_single_active_per_table
ON public.arcade_orders (table_id)
WHERE status IN ('holding', 'processing', 'active', 'hardware_uncertain');

CREATE INDEX IF NOT EXISTS idx_arcade_orders_lookup ON public.arcade_orders (table_id, status);
CREATE INDEX IF NOT EXISTS idx_arcade_orders_hold_exp ON public.arcade_orders (hold_expires_at) WHERE status = 'holding';
CREATE INDEX IF NOT EXISTS idx_arcade_orders_token_hash ON public.arcade_orders (client_token_hash);
CREATE INDEX IF NOT EXISTS idx_arcade_orders_pi ON public.arcade_orders (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- 3. TAULUTASON RLS JA OIKEUDET
ALTER TABLE public.arcade_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.arcade_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.arcade_orders TO service_role;

-- ==============================================================================
-- 4. ATOMISET POSTGRESQL RPC -FUNKTIOT
-- ==============================================================================

-- FUNKTIO 1: arcade_create_payment_hold
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
    -- Validointi
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_client_token_hash IS NULL OR trim(p_client_token_hash) = '' OR
       p_duration_seconds <= 0 OR p_amount_cents <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    -- 1. LUKITUS 1: PÖYTÄ (Aina ensimmäisenä)
    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    IF NOT v_table.is_enabled OR v_table.lock_state IN ('maintenance_locked', 'error_locked') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'TABLE_LOCKED', 
            'statusCode', 423, 
            'lock_state', v_table.lock_state,
            'error', 'Pöytä on poissa käytöstä tai lukittu huoltotilaan.'
        );
    END IF;

    -- 2. LUKITUS 2: FYYSINEN SESSIO (arcade_sessions)
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

    -- 3. LUKITUS 3: TILAUKSET (arcade_orders)
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
                -- Sama asiakas: palautetaan voimassa oleva varaus
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

                -- Eri asiakas: estetään
                RETURN jsonb_build_object(
                    'success', false, 
                    'code', 'TABLE_HELD', 
                    'statusCode', 409, 
                    'error', 'Pöytä on parhaillaan toisen pelaajan varattavana.',
                    'hold_expires_at', v_active_order.hold_expires_at
                );
            ELSE
                -- Vanhentunut varaus, jonka laiteaktivointia EI ole aloitettu: vapautetaan
                UPDATE public.arcade_orders
                SET status = 'hold_expired', updated_at = now()
                WHERE id = v_active_order.id;
            END IF;
        END IF;
    END IF;

    -- 4. UUSI TILAUS JA PÖYDÄN LUKITUS
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
        'hold_expires_at', v_hold_expires,
        'amount_cents', p_amount_cents,
        'duration_minutes', p_duration_minutes,
        'duration_seconds', p_duration_seconds
    );
END;
$$;

-- FUNKTIO 2: arcade_bind_payment_intent
CREATE OR REPLACE FUNCTION public.arcade_bind_payment_intent(
    p_table_id TEXT,
    p_order_id TEXT,
    p_payment_intent_id TEXT,
    p_idempotency_key TEXT DEFAULT NULL
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
    IF p_table_id IS NULL OR p_order_id IS NULL OR p_payment_intent_id IS NULL OR
       trim(p_table_id) = '' OR trim(p_order_id) = '' OR trim(p_payment_intent_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    -- Lukitusjärjestys: Pöytä -> Tilaus
    SELECT * INTO v_table FROM public.arcade_table_configs WHERE table_id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    SELECT * INTO v_order FROM public.arcade_orders WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404);
    END IF;

    IF v_order.table_id <> p_table_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_MISMATCH', 'statusCode', 400);
    END IF;

    IF v_order.status <> 'holding' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_HOLDING', 'statusCode', 409);
    END IF;

    IF v_order.stripe_payment_intent_id IS NOT NULL AND v_order.stripe_payment_intent_id <> p_payment_intent_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_INTENT_ALREADY_BOUND', 'statusCode', 409);
    END IF;

    UPDATE public.arcade_orders
    SET 
        stripe_payment_intent_id = p_payment_intent_id,
        stripe_idempotency_key = p_idempotency_key,
        updated_at = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'payment_intent_id', p_payment_intent_id);
END;
$$;

-- FUNKTIO 3: arcade_claim_order_for_activation
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
    -- 1. PARAMETRIEN TIUKKA TARKISTUS
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_order_id IS NULL OR trim(p_order_id) = '' OR
       p_payment_intent_id IS NULL OR trim(p_payment_intent_id) = '' OR
       p_worker_id IS NULL OR trim(p_worker_id) = '' OR
       p_amount_cents IS NULL OR p_amount_cents <= 0 OR
       p_currency IS NULL OR trim(p_currency) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_PARAMETERS',
            'statusCode', 400,
            'refund_required', true,
            'error', 'Puuttuvia tai virheellisiä parametreja maksun lunastuksessa.'
        );
    END IF;

    -- 2. LUKITUSJÄRJESTYS 1: PÖYTÄ
    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404, 'refund_required', true);
    END IF;

    -- 3. LUKITUSJÄRJESTYS 2: TILAUS
    SELECT * INTO v_order
    FROM public.arcade_orders
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404, 'refund_required', true);
    END IF;

    -- 4. VASTAAVUUSTARKISTUKSET ENNEN MITÄÄN REPLAY-PALAUTUSTA:
    -- ÄLÄ MUUTA OIKEAN TILAUKSEN ELINKAARTA RISTIRIITAISEN TAPAHTUMAN VUOKSI!
    -- A. Pöydän vastaavuus
    IF v_order.table_id <> p_table_id THEN
        INSERT INTO public.arcade_events (table_id, event_type, payload)
        VALUES (p_table_id, 'switch_error', jsonb_build_object('error', 'TABLE_MISMATCH', 'order_id', p_order_id, 'incoming_table', p_table_id, 'order_table', v_order.table_id, 'payment_intent_id', p_payment_intent_id));

        RETURN jsonb_build_object('success', false, 'code', 'TABLE_MISMATCH', 'statusCode', 400, 'refund_required', true);
    END IF;

    -- B. Summan ja valuutan vastaavuus
    IF v_order.amount_cents <> p_amount_cents OR lower(v_order.currency) <> lower(p_currency) THEN
        INSERT INTO public.arcade_events (table_id, event_type, payload)
        VALUES (p_table_id, 'switch_error', jsonb_build_object('error', 'AMOUNT_OR_CURRENCY_MISMATCH', 'order_id', p_order_id, 'expected_cents', v_order.amount_cents, 'incoming_cents', p_amount_cents, 'payment_intent_id', p_payment_intent_id));

        RETURN jsonb_build_object('success', false, 'code', 'AMOUNT_MISMATCH', 'statusCode', 400, 'refund_required', true);
    END IF;

    -- C. PaymentIntentin vastaavuus (Vaadi ennalta sidottu PaymentIntent)
    IF v_order.stripe_payment_intent_id IS NULL OR v_order.stripe_payment_intent_id <> p_payment_intent_id THEN
        INSERT INTO public.arcade_events (table_id, event_type, payload)
        VALUES (p_table_id, 'switch_error', jsonb_build_object('error', 'PAYMENT_INTENT_MISMATCH', 'order_id', p_order_id, 'expected_pi', v_order.stripe_payment_intent_id, 'incoming_pi', p_payment_intent_id));

        RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_INTENT_MISMATCH', 'statusCode', 400, 'refund_required', true);
    END IF;

    -- 5. TILAN TARKISTUS LUKITUKSEN SAAMISEN JÄLKEEN:
    -- A. Idempotent Replay: Peli jo aktiivinen
    IF v_order.status = 'active' THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'status', 'active',
            'order_id', v_order.order_id,
            'session_id', v_order.session_id,
            'expires_at', v_order.expires_at
        );
    END IF;

    -- B. Idempotent Replay: Peli jo valmistunut
    IF v_order.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'status', 'completed',
            'order_id', v_order.order_id,
            'session_id', v_order.session_id,
            'completed_at', v_order.completed_at
        );
    END IF;

    -- C. Idempotent Replay: Toinen työntekijä käsittelee parhaillaan
    IF v_order.status = 'processing' THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'status', 'processing',
            'order_id', v_order.order_id,
            'claimed_by_worker', v_order.claimed_by_worker
        );
    END IF;

    -- D. Myöhästynyt maksu tilaan, joka on jo expired tai cancelled:
    -- TALLENNETAAN MAKSU JA HYVITYSTARVE PYSYVÄSTI KANTAAN.
    -- HUOM: Hyvitystila ei saa koskaan palautua taaksepäin (initiated/completed säilytetään!)
    IF v_order.status IN ('hold_expired', 'activation_failed', 'hardware_uncertain', 'resolved_uncertain', 'cancelled') THEN
        UPDATE public.arcade_orders
        SET 
            payment_status = 'succeeded',
            stripe_payment_intent_id = p_payment_intent_id,
            refund_status = CASE 
                WHEN refund_status IN ('refund_initiated', 'refund_completed') THEN refund_status
                ELSE 'refund_required'::arcade_refund_status
            END,
            refund_reason = COALESCE(refund_reason, 'LATE_PAYMENT_ON_' || v_order.status),
            updated_at = now()
        WHERE id = v_order.id;

        RETURN jsonb_build_object(
            'success', false,
            'code', v_order.status,
            'statusCode', 409,
            'refund_required', true,
            'error', 'Maksu saapui tilaan, joka on päättynyt tai peruttu. Maksu on tallennettu hyvitettäväksi.'
        );
    END IF;

    -- E. Hold vanhentunut juuri ennen saapumista:
    IF v_order.status = 'holding' AND v_order.hold_expires_at <= now() THEN
        UPDATE public.arcade_orders
        SET 
            status = 'hold_expired',
            payment_status = 'succeeded',
            stripe_payment_intent_id = p_payment_intent_id,
            refund_status = CASE 
                WHEN refund_status IN ('refund_initiated', 'refund_completed') THEN refund_status
                ELSE 'refund_required'::arcade_refund_status
            END,
            refund_reason = 'LATE_PAYMENT_AFTER_HOLD_EXPIRY',
            updated_at = now()
        WHERE id = v_order.id;

        RETURN jsonb_build_object(
            'success', false,
            'code', 'HOLD_EXPIRED',
            'statusCode', 409,
            'refund_required', true,
            'error', 'Maksu saapui 3 minuutin varausajan jälkeen. Maksu on merkitty hyvitettäväksi.'
        );
    END IF;

    -- 6. ATOMINEN LUNASTUS: holding -> processing
    UPDATE public.arcade_orders
    SET 
        status = 'processing',
        payment_status = 'succeeded',
        stripe_payment_intent_id = p_payment_intent_id,
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

-- FUNKTIO 4: arcade_pre_dispatch_guard
CREATE OR REPLACE FUNCTION public.arcade_pre_dispatch_guard(
    p_table_id TEXT,
    p_order_id TEXT,
    p_worker_id TEXT,
    p_client_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_order RECORD;
    v_session_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_order_id IS NULL OR trim(p_order_id) = '' OR
       p_worker_id IS NULL OR trim(p_worker_id) = '' OR
       p_client_session_token IS NULL OR trim(p_client_session_token) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    -- Lukitusjärjestys: Pöytä -> Tilaus
    SELECT * INTO v_table FROM public.arcade_table_configs WHERE table_id = p_table_id FOR UPDATE;
    IF NOT FOUND OR NOT v_table.is_enabled OR v_table.lock_state <> 'pending_payment' THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_IN_HOLD', 'statusCode', 409);
    END IF;

    SELECT * INTO v_order FROM public.arcade_orders WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404);
    END IF;

    -- Omistajuustarkistus
    IF v_order.table_id <> p_table_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_MISMATCH', 'statusCode', 400);
    END IF;

    IF v_order.status <> 'processing' OR v_order.claimed_by_worker <> p_worker_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'DISPATCH_GUARD_REJECTED', 'statusCode', 409);
    END IF;

    IF v_order.hardware_dispatched_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_DISPATCHED', 'statusCode', 409);
    END IF;

    -- Kesto otetaan suoraan tallennetusta tilauksesta
    v_expires_at := now() + (v_order.duration_seconds || ' seconds')::interval;

    -- Luodaan sessiorivi
    INSERT INTO public.arcade_sessions (
        table_id,
        status,
        auth_source,
        duration_seconds,
        client_session_token,
        requested_at,
        expires_at,
        hardware_dispatched_at,
        created_at
    ) VALUES (
        p_table_id,
        'requested',
        'stripe',
        v_order.duration_seconds,
        p_client_session_token,
        now(),
        v_expires_at,
        now(),
        now()
    ) RETURNING id INTO v_session_id;

    UPDATE public.arcade_orders
    SET 
        hardware_dispatched_at = now(),
        expires_at = v_expires_at,
        session_id = v_session_id,
        updated_at = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true, 
        'session_id', v_session_id, 
        'expires_at', v_expires_at,
        'duration_seconds', v_order.duration_seconds
    );
END;
$$;

-- FUNKTIO 5: arcade_finalize_activation
CREATE OR REPLACE FUNCTION public.arcade_finalize_activation(
    p_table_id TEXT,
    p_order_id TEXT,
    p_session_id UUID,
    p_worker_id TEXT,
    p_success BOOLEAN,
    p_hardware_uncertain BOOLEAN,
    p_error_reason TEXT DEFAULT NULL
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
BEGIN
    -- 1. PARAMETRIEN VALIDIOINTI (Hylkää NULL ja ristiriitaiset arvot)
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_order_id IS NULL OR trim(p_order_id) = '' OR
       p_session_id IS NULL OR
       p_worker_id IS NULL OR trim(p_worker_id) = '' OR
       p_success IS NULL OR p_hardware_uncertain IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    IF p_success IS TRUE AND p_hardware_uncertain IS TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CONTRADICTORY_PARAMETERS',
            'statusCode', 400,
            'error', 'Aktivointi ei voi olla samanaikaisesti onnistunut (success=true) ja epävarma (hardware_uncertain=true).'
        );
    END IF;

    -- 2. LUKITUSJÄRJESTYS 1: PÖYTÄ
    SELECT * INTO v_table FROM public.arcade_table_configs WHERE table_id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    -- 3. LUKITUSJÄRJESTYS 2: TILAUS
    SELECT * INTO v_order FROM public.arcade_orders WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404);
    END IF;

    -- 4. LUKITUSJÄRJESTYS 3: SESSIO
    SELECT * INTO v_session FROM public.arcade_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND', 'statusCode', 404);
    END IF;

    -- 5. OMISTAJA- JA TILATARKISTUKSET
    IF v_order.table_id <> p_table_id OR v_session.table_id <> p_table_id OR v_order.session_id <> p_session_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'OWNERSHIP_MISMATCH', 'statusCode', 400);
    END IF;

    IF v_order.status <> 'processing' OR v_order.claimed_by_worker <> p_worker_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'STALE_HANDLER_REJECTED', 'statusCode', 409);
    END IF;

    IF v_session.status <> 'requested' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_SESSION_STATE', 'statusCode', 409);
    END IF;

    IF v_table.lock_state NOT IN ('pending_payment', 'active') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TABLE_LOCK_STATE', 'statusCode', 409);
    END IF;

    -- 6. TILAPÄIVITYKSET
    IF p_success THEN
        UPDATE public.arcade_orders
        SET status = 'active', activated_at = now(), updated_at = now()
        WHERE id = v_order.id;

        UPDATE public.arcade_sessions
        SET status = 'active', activated_at = now()
        WHERE id = v_session.id;

        UPDATE public.arcade_table_configs
        SET lock_state = 'active', updated_at = now()
        WHERE table_id = p_table_id;

        RETURN jsonb_build_object('success', true, 'status', 'active');
    ELSE
        IF p_hardware_uncertain THEN
            UPDATE public.arcade_orders
            SET 
                status = 'hardware_uncertain',
                refund_status = 'refund_required',
                refund_reason = p_error_reason,
                last_error_code = 'HARDWARE_UNCERTAIN',
                last_error_details = p_error_reason,
                updated_at = now()
            WHERE id = v_order.id;

            UPDATE public.arcade_sessions
            SET status = 'hardware_uncertain', error_reason = p_error_reason
            WHERE id = v_session.id;

            UPDATE public.arcade_table_configs
            SET lock_state = 'error_locked', updated_at = now()
            WHERE table_id = p_table_id;
        ELSE
            UPDATE public.arcade_orders
            SET 
                status = 'activation_failed',
                refund_status = 'refund_required',
                refund_reason = p_error_reason,
                last_error_code = 'ACTIVATION_FAILED_SAFE_OFF',
                last_error_details = p_error_reason,
                updated_at = now()
            WHERE id = v_order.id;

            UPDATE public.arcade_sessions
            SET status = 'failed', error_reason = p_error_reason
            WHERE id = v_session.id;

            IF v_table.lock_state = 'pending_payment' THEN
                UPDATE public.arcade_table_configs
                SET lock_state = 'available', updated_at = now()
                WHERE table_id = p_table_id;
            END IF;
        END IF;

        RETURN jsonb_build_object('success', true, 'status', 'activation_failed', 'refund_required', true);
    END IF;
END;
$$;

-- FUNKTIO 6: arcade_release_reconciled_table
CREATE OR REPLACE FUNCTION public.arcade_release_reconciled_table(
    p_table_id TEXT,
    p_order_id TEXT,
    p_session_id UUID,
    p_confirmed_off BOOLEAN
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
BEGIN
    IF p_table_id IS NULL OR p_order_id IS NULL OR p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    -- 1. LUKITUSJÄRJESTYS: Pöytä -> Tilaus -> Sessio
    SELECT * INTO v_table FROM public.arcade_table_configs WHERE table_id = p_table_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    SELECT * INTO v_order FROM public.arcade_orders WHERE order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404);
    END IF;

    SELECT * INTO v_session FROM public.arcade_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND', 'statusCode', 404);
    END IF;

    -- 2. OMISTAJUUSTARKISTUS
    IF v_order.table_id <> p_table_id OR v_session.table_id <> p_table_id OR v_order.session_id <> p_session_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'OWNERSHIP_MISMATCH', 'statusCode', 400);
    END IF;

    -- 3. IDEMPOTENSSI: Jos tilaus on jo aiemmin ratkaistu tai purettu, älä koske pöydän nykytilaan!
    IF v_order.status IN ('completed', 'resolved_uncertain', 'hold_expired', 'activation_failed', 'cancelled') THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'already_resolved', true,
            'status', v_order.status,
            'message', 'Tilaus on jo aiemmin purettu. Pöydän tilaa ei muuteta.'
        );
    END IF;

    -- 4. TURVALLISUUSTARKISTUS: OFF-varmistus on pakollinen (hylkää FALSE ja NULL!)
    IF p_confirmed_off IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'RELE_STILL_ON_OR_UNCONFIRMED', 
            'statusCode', 409, 
            'error', 'Pöytää ei voida vapauttaa: releen sammumista (State === 0) ei ole vahvistettu.'
        );
    END IF;

    -- 5. TURVALLISUUSTARKISTUS: Aikaraja + 4 sekunnin marginaali on täytynyt kulua
    IF v_order.expires_at IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'MISSING_EXPIRES_AT',
            'statusCode', 409,
            'error', 'Pöytää ei voida vapauttaa: tilaukselta puuttuu aikaraja.'
        );
    END IF;

    IF now() <= (v_order.expires_at + interval '4 seconds') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'DEADLINE_NOT_ELAPSED', 
            'statusCode', 409, 
            'error', 'Pöytää ei voida vapauttaa ennen kuin alkuperäinen peliaika ja turvamarginaali ovat kuluneet.'
        );
    END IF;

    -- 6. PÖYDÄN NYKYISEN OMISTAJUUDEN TARKISTUS:
    -- Vapautus saa muuttaa pöydän tilaa vain, jos pöytä on tämän kyseisen tilauksen lukitsema!
    IF v_table.lock_state NOT IN ('active', 'error_locked') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TABLE_NOT_IN_RELEASABLE_STATE',
            'statusCode', 409,
            'lock_state', v_table.lock_state
        );
    END IF;

    -- 7. TILAN PÄIVITYS:
    -- Siirretään myös hardware_uncertain -tilaus pois uniikki-indeksistä tilaan resolved_uncertain,
    -- säilyttäen refund_status = refund_required ennallaan!
    IF v_order.status = 'active' THEN
        UPDATE public.arcade_orders
        SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE id = v_order.id;
    ELSIF v_order.status = 'hardware_uncertain' THEN
        UPDATE public.arcade_orders
        SET status = 'resolved_uncertain', completed_at = now(), updated_at = now()
        WHERE id = v_order.id;
    END IF;

    UPDATE public.arcade_sessions
    SET status = 'completed', confirmed_off_at = now()
    WHERE id = v_session.id;

    UPDATE public.arcade_table_configs
    SET lock_state = 'available', updated_at = now()
    WHERE table_id = p_table_id;

    RETURN jsonb_build_object(
        'success', true, 
        'table_id', p_table_id, 
        'lock_state', 'available',
        'message', 'Pöytä vapautettu turvallisesti vahvistetun OFF-tilan jälkeen.'
    );
END;
$$;

-- FUNKTIO 7: arcade_reconcile_stuck_orders
CREATE OR REPLACE FUNCTION public.arcade_reconcile_stuck_orders(
    p_timeout_seconds INTEGER DEFAULT 60
)
RETURNS TABLE (
    reconciled_order_id TEXT,
    action_taken TEXT,
    table_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_table RECORD;
    v_order RECORD;
    v_session RECORD;
BEGIN
    FOR r IN 
        SELECT o.table_id, o.order_id
        FROM public.arcade_orders o
        WHERE o.status = 'processing'
          AND o.updated_at < (now() - (p_timeout_seconds || ' seconds')::interval)
    LOOP
        -- Lukitusjärjestys jokaiselle riville: Pöytä -> Tilaus -> Sessio
        SELECT * INTO v_table FROM public.arcade_table_configs WHERE table_id = r.table_id FOR UPDATE;
        SELECT * INTO v_order FROM public.arcade_orders WHERE order_id = r.order_id FOR UPDATE;

        IF v_order.status = 'processing' AND v_order.updated_at < (now() - (p_timeout_seconds || ' seconds')::interval) THEN
            IF v_order.hardware_dispatched_at IS NOT NULL THEN
                -- Relekäsky oli lähetetty: ÄLÄ KOSKAAN LÄHETÄ UUDESTAAN. Lukitse epävarmaksi.
                UPDATE public.arcade_orders
                SET 
                    status = 'hardware_uncertain',
                    refund_status = CASE 
                        WHEN refund_status IN ('refund_initiated', 'refund_completed') THEN refund_status
                        ELSE 'refund_required'::arcade_refund_status
                    END,
                    refund_reason = COALESCE(refund_reason, 'SERVER_CRASH_DURING_DISPATCH_UNCERTAIN'),
                    last_error_code = 'HARDWARE_UNCERTAIN',
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.arcade_table_configs
                SET lock_state = 'error_locked', updated_at = now()
                WHERE table_id = r.table_id;

                IF v_order.session_id IS NOT NULL THEN
                    SELECT * INTO v_session FROM public.arcade_sessions WHERE id = v_order.session_id FOR UPDATE;
                    IF FOUND THEN
                        UPDATE public.arcade_sessions
                        SET status = 'hardware_uncertain', error_reason = 'Server crash during dispatch'
                        WHERE id = v_session.id;
                    END IF;
                END IF;

                reconciled_order_id := v_order.order_id;
                action_taken := 'MARKED_HARDWARE_UNCERTAIN_AND_LOCKED';
                table_id := r.table_id;
                RETURN NEXT;
            ELSE
                -- Käskyä ei oltu lähetetty: turvallinen peruminen ja hyvitys
                UPDATE public.arcade_orders
                SET 
                    status = 'activation_failed',
                    refund_status = CASE 
                        WHEN refund_status IN ('refund_initiated', 'refund_completed') THEN refund_status
                        ELSE 'refund_required'::arcade_refund_status
                    END,
                    refund_reason = COALESCE(refund_reason, 'SERVER_CRASH_BEFORE_DISPATCH'),
                    updated_at = now()
                WHERE id = v_order.id;

                IF v_table.lock_state = 'pending_payment' THEN
                    UPDATE public.arcade_table_configs
                    SET lock_state = 'available', updated_at = now()
                    WHERE table_id = r.table_id;
                END IF;

                reconciled_order_id := v_order.order_id;
                action_taken := 'CANCELLED_SAFE_AVAILABLE';
                table_id := r.table_id;
                RETURN NEXT;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- ==============================================================================
-- 5. OIKEUKSIEN HALLINTA (SECURITY DEFINER EXECUTE RIGHTS)
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.arcade_create_payment_hold FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bind_payment_intent FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_claim_order_for_activation FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_pre_dispatch_guard FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_finalize_activation FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_release_reconciled_table FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_reconcile_stuck_orders FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.arcade_create_payment_hold TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_bind_payment_intent TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_claim_order_for_activation TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_pre_dispatch_guard TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_finalize_activation TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_release_reconciled_table TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_reconcile_stuck_orders TO service_role;
