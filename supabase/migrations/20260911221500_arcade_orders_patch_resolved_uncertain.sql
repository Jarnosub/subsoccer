-- ==============================================================================
-- SUBSOCCER ARCADE — PATCH FOR RESOLVED_UNCERTAIN & RECONCILE FUNCTIONS
-- Migration: 20260911221500_arcade_orders_patch_resolved_uncertain.sql
-- ==============================================================================

-- 1. Lisätään 'resolved_uncertain' olemassa olevaan arcade_order_status ENUM -tyyppiin
ALTER TYPE public.arcade_order_status ADD VALUE IF NOT EXISTS 'resolved_uncertain';

-- 2. Päivitetään osittainen uniikki-indeksi pudottamalla vanha ja luomalla uusi
DROP INDEX IF EXISTS public.idx_arcade_orders_single_active_per_table;

CREATE UNIQUE INDEX idx_arcade_orders_single_active_per_table
ON public.arcade_orders (table_id)
WHERE status IN ('holding', 'processing', 'active', 'hardware_uncertain');

-- 3. Poistetaan vanha 4-parametrinen versio funktiosta arcade_release_reconciled_table
DROP FUNCTION IF EXISTS public.arcade_release_reconciled_table(TEXT, TEXT, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.arcade_release_reconciled_table(TEXT, TEXT, UUID, BOOLEAN, TIMESTAMPTZ);

-- 4. Päivitetty arcade_release_reconciled_table (vaatii tuoreen p_confirmed_off_at -aikaleiman ja rajatut tilat)
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
BEGIN
    -- 1. PARAMETRIEN PERUSVALIDOINTI
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_order_id IS NULL OR trim(p_order_id) = '' OR
       p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    -- 2. LUKITUSJÄRJESTYS: Pöytä -> Tilaus -> Sessio (käytetään taulualiasia)
    SELECT * INTO v_table 
    FROM public.arcade_table_configs AS tc 
    WHERE tc.table_id = p_table_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    SELECT * INTO v_order 
    FROM public.arcade_orders AS ord 
    WHERE ord.order_id = p_order_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'statusCode', 404);
    END IF;

    SELECT * INTO v_session 
    FROM public.arcade_sessions AS sess 
    WHERE sess.id = p_session_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'SESSION_NOT_FOUND', 'statusCode', 404);
    END IF;

    -- 3. OMISTAJUUSTARKISTUS
    IF v_order.table_id <> p_table_id OR v_session.table_id <> p_table_id OR v_order.session_id <> p_session_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'OWNERSHIP_MISMATCH', 'statusCode', 400);
    END IF;

    -- 4. IDEMPOTENSSI: Jos tilaus tai sessio on jo aiemmin ratkaistu tai purettu, ÄLÄ KOSKE PÖYTÄÄN!
    IF v_order.status IN ('completed', 'resolved_uncertain', 'hold_expired', 'activation_failed', 'cancelled')
       OR v_session.status IN ('completed', 'failed', 'canceled', 'force_stopped') THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_idempotent_replay', true,
            'already_resolved', true,
            'order_status', v_order.status,
            'session_status', v_session.status,
            'message', 'Tilaus on jo aiemmin purettu. Pöydän tilaan ei kosketa.'
        );
    END IF;

    -- 5. RAJAUS VAIN SALLITTUIHIN TILOIHIN: active ja hardware_uncertain
    IF v_order.status NOT IN ('active', 'hardware_uncertain') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_IN_RELEASABLE_STATE',
            'statusCode', 409,
            'status', v_order.status,
            'error', 'Vapautus on sallittu vain tiloissa active tai hardware_uncertain.'
        );
    END IF;

    IF v_order.status = 'active' AND v_session.status NOT IN ('active', 'cooldown') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_SESSION_STATE_FOR_RELEASE',
            'statusCode', 409,
            'session_status', v_session.status
        );
    END IF;

    IF v_order.status = 'hardware_uncertain' AND v_session.status <> 'hardware_uncertain' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_SESSION_STATE_FOR_RELEASE',
            'statusCode', 409,
            'session_status', v_session.status
        );
    END IF;

    -- Pöydän lukkotilan vastaavuus
    IF v_order.status = 'active' AND v_table.lock_state <> 'active' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TABLE_LOCK_MISMATCH',
            'statusCode', 409,
            'lock_state', v_table.lock_state,
            'error', 'Aktiivisen tilauksen vapautus edellyttää pöydän active-lukkotilaa.'
        );
    END IF;

    IF v_order.status = 'hardware_uncertain' AND v_table.lock_state <> 'error_locked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TABLE_LOCK_MISMATCH',
            'statusCode', 409,
            'lock_state', v_table.lock_state,
            'error', 'Epävarman tilauksen vapautus edellyttää pöydän error_locked-lukkotilaa.'
        );
    END IF;

    -- 6. TURVALLISUUSTARKISTUS: OFF-varmistus ja sen aikaleima
    IF p_confirmed_off IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'RELE_STILL_ON_OR_UNCONFIRMED', 
            'statusCode', 409, 
            'error', 'Pöytää ei voida vapauttaa: releen sammumista (State === 0) ei ole vahvistettu.'
        );
    END IF;

    IF p_confirmed_off_at IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'MISSING_OFF_CONFIRMATION_TIME',
            'statusCode', 400,
            'error', 'Pöytää ei voida vapauttaa: releen OFF-havainnon aikaleima puuttuu.'
        );
    END IF;

    IF v_order.expires_at IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'MISSING_EXPIRES_AT',
            'statusCode', 409,
            'error', 'Pöytää ei voida vapauttaa: tilaukselta puuttuu aikaraja.'
        );
    END IF;

    IF now() < (v_order.expires_at + interval '4 seconds') THEN
        RETURN jsonb_build_object(
            'success', false, 
            'code', 'DEADLINE_NOT_ELAPSED', 
            'statusCode', 409, 
            'error', 'Pöytää ei voida vapauttaa ennen kuin alkuperäinen peliaika ja turvamarginaali ovat kuluneet.'
        );
    END IF;

    IF p_confirmed_off_at < (v_order.expires_at + interval '4 seconds') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'OFF_OBSERVED_BEFORE_DEADLINE',
            'statusCode', 409,
            'error', 'OFF-havainto on tehty ennen peliajan ja turvamarginaalin päättymistä.'
        );
    END IF;

    IF p_confirmed_off_at < (now() - interval '120 seconds') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'OFF_OBSERVATION_STALE',
            'statusCode', 409,
            'error', 'OFF-havainto on vanhentunut (yli 120 sekuntia vanha).'
        );
    END IF;

    IF p_confirmed_off_at > (now() + interval '5 seconds') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'OFF_OBSERVATION_IN_FUTURE',
            'statusCode', 400,
            'error', 'OFF-havainnon aikaleima on tulevaisuudessa.'
        );
    END IF;

    -- 7. TILAN PÄIVITYS:
    IF v_order.status = 'active' THEN
        UPDATE public.arcade_orders AS ord
        SET status = 'completed', completed_at = now(), updated_at = now()
        WHERE ord.id = v_order.id;
    ELSIF v_order.status = 'hardware_uncertain' THEN
        UPDATE public.arcade_orders AS ord
        SET status = 'resolved_uncertain', completed_at = now(), updated_at = now()
        WHERE ord.id = v_order.id;
    END IF;

    UPDATE public.arcade_sessions AS sess
    SET status = 'completed', confirmed_off_at = p_confirmed_off_at
    WHERE sess.id = v_session.id;

    UPDATE public.arcade_table_configs AS tc
    SET lock_state = 'available', updated_at = now()
    WHERE tc.table_id = p_table_id;

    RETURN jsonb_build_object(
        'success', true, 
        'table_id', p_table_id, 
        'lock_state', 'available',
        'message', 'Pöytä vapautettu turvallisesti vahvistetun tuoreen OFF-havainnon jälkeen.'
    );
END;
$$;

-- 5. Päivitetty arcade_reconcile_stuck_orders (taulualiasoitu nimiristiriitojen poistamiseksi)
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
        SELECT ord_loop.table_id AS loop_table_id, ord_loop.order_id AS loop_order_id
        FROM public.arcade_orders AS ord_loop
        WHERE ord_loop.status = 'processing'
          AND ord_loop.updated_at < (now() - (p_timeout_seconds || ' seconds')::interval)
    LOOP
        -- Lukitusjärjestys jokaiselle riville: Pöytä -> Tilaus -> Sessio (taulualiasoitu)
        SELECT * INTO v_table 
        FROM public.arcade_table_configs AS tc 
        WHERE tc.table_id = r.loop_table_id 
        FOR UPDATE;

        SELECT * INTO v_order 
        FROM public.arcade_orders AS ord 
        WHERE ord.order_id = r.loop_order_id 
        FOR UPDATE;

        IF v_order.status = 'processing' AND v_order.updated_at < (now() - (p_timeout_seconds || ' seconds')::interval) THEN
            IF v_order.hardware_dispatched_at IS NOT NULL THEN
                -- Relekäsky oli lähetetty: ÄLÄ KOSKAAN LÄHETÄ UUDESTAAN. Lukitse epävarmaksi.
                UPDATE public.arcade_orders AS ord
                SET 
                    status = 'hardware_uncertain',
                    refund_status = CASE 
                        WHEN ord.refund_status IN ('refund_initiated', 'refund_completed') THEN ord.refund_status
                        ELSE 'refund_required'::arcade_refund_status
                    END,
                    refund_reason = COALESCE(ord.refund_reason, 'SERVER_CRASH_DURING_DISPATCH_UNCERTAIN'),
                    last_error_code = 'HARDWARE_UNCERTAIN',
                    updated_at = now()
                WHERE ord.id = v_order.id;

                UPDATE public.arcade_table_configs AS tc
                SET lock_state = 'error_locked', updated_at = now()
                WHERE tc.table_id = r.loop_table_id;

                IF v_order.session_id IS NOT NULL THEN
                    SELECT * INTO v_session 
                    FROM public.arcade_sessions AS sess 
                    WHERE sess.id = v_order.session_id 
                    FOR UPDATE;

                    IF FOUND THEN
                        UPDATE public.arcade_sessions AS sess
                        SET status = 'hardware_uncertain', error_reason = 'Server crash during dispatch'
                        WHERE sess.id = v_session.id;
                    END IF;
                END IF;

                reconciled_order_id := v_order.order_id;
                action_taken := 'MARKED_HARDWARE_UNCERTAIN_AND_LOCKED';
                table_id := r.loop_table_id;
                RETURN NEXT;
            ELSE
                -- Käskyä ei oltu lähetetty: turvallinen peruminen ja hyvitys
                UPDATE public.arcade_orders AS ord
                SET 
                    status = 'activation_failed',
                    refund_status = CASE 
                        WHEN ord.refund_status IN ('refund_initiated', 'refund_completed') THEN ord.refund_status
                        ELSE 'refund_required'::arcade_refund_status
                    END,
                    refund_reason = COALESCE(ord.refund_reason, 'SERVER_CRASH_BEFORE_DISPATCH'),
                    updated_at = now()
                WHERE ord.id = v_order.id;

                IF v_table.lock_state = 'pending_payment' THEN
                    UPDATE public.arcade_table_configs AS tc
                    SET lock_state = 'available', updated_at = now()
                    WHERE tc.table_id = r.loop_table_id;
                END IF;

                reconciled_order_id := v_order.order_id;
                action_taken := 'CANCELLED_SAFE_AVAILABLE';
                table_id := r.loop_table_id;
                RETURN NEXT;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- 6. Oikeuksien hallinta
REVOKE EXECUTE ON FUNCTION public.arcade_release_reconciled_table(TEXT, TEXT, UUID, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_reconcile_stuck_orders(INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.arcade_release_reconciled_table(TEXT, TEXT, UUID, BOOLEAN, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_reconcile_stuck_orders(INTEGER) TO service_role;
