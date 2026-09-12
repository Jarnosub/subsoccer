-- ==============================================================================
-- SUBSOCCER ARCADE — PHASE 2: AUXILIARY OUTLETS (DISPLAY & ATTRACT LIGHTS)
-- Migration: 20260912_arcade_phase2_aux_outlets.sql
-- ==============================================================================

-- 1. PÖYTÄASETUSTEN LAAJENNUS NÄYTÖLLE JA VALOILLE
ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS display_output_id INT DEFAULT 2;

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS lights_output_id INT DEFAULT 3;

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS display_manual_until TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS lights_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS lights_manual_until TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.arcade_table_configs 
    ADD COLUMN IF NOT EXISTS display_last_heartbeat_at TIMESTAMPTZ;

-- 2. RAJOITE: Sama lähtö-ID ei saa olla samanaikaisesti peli, näyttö ja valot
ALTER TABLE IF EXISTS public.arcade_table_configs
    DROP CONSTRAINT IF EXISTS check_distinct_arcade_outputs;

ALTER TABLE IF EXISTS public.arcade_table_configs
    ADD CONSTRAINT check_distinct_arcade_outputs CHECK (
        (display_output_id IS NULL OR display_output_id <> switch_output_id) AND
        (lights_output_id IS NULL OR lights_output_id <> switch_output_id) AND
        (display_output_id IS NULL OR lights_output_id IS NULL OR display_output_id <> lights_output_id)
    );

-- 3. ENUM-TARKISTUS MODUS-KENTILLE
ALTER TABLE IF EXISTS public.arcade_table_configs
    DROP CONSTRAINT IF EXISTS check_arcade_outlet_modes;

ALTER TABLE IF EXISTS public.arcade_table_configs
    ADD CONSTRAINT check_arcade_outlet_modes CHECK (
        display_mode IN ('auto', 'manual_on', 'manual_off') AND
        lights_mode IN ('auto', 'manual_on', 'manual_off')
    );

-- 4. RPC: arcade_set_aux_outlet_mode (Moderaattorin manuaaliohjaus ja palautus)
CREATE OR REPLACE FUNCTION public.arcade_set_aux_outlet_mode(
    p_table_id TEXT,
    p_outlet_role TEXT, -- 'display' tai 'lights'
    p_mode TEXT,        -- 'auto', 'manual_on', 'manual_off'
    p_duration_minutes INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_table RECORD;
    v_manual_until TIMESTAMPTZ := NULL;
    v_target_output_id INT;
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' OR
       p_outlet_role IS NULL OR p_outlet_role NOT IN ('display', 'lights') OR
       p_mode IS NULL OR p_mode NOT IN ('auto', 'manual_on', 'manual_off') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    SELECT * INTO v_table
    FROM public.arcade_table_configs
    WHERE table_id = p_table_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TABLE_NOT_FOUND', 'statusCode', 404);
    END IF;

    IF p_outlet_role = 'display' THEN
        v_target_output_id := v_table.display_output_id;
        IF v_target_output_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'OUTLET_NOT_CONFIGURED', 'statusCode', 400, 'error', 'Näyttölähtöä ei ole määritetty tälle pöydälle.');
        END IF;

        IF p_mode <> 'auto' THEN
            v_manual_until := now() + ((COALESCE(p_duration_minutes, 30)) * interval '1 minute');
        END IF;

        UPDATE public.arcade_table_configs
        SET display_mode = p_mode,
            display_manual_until = v_manual_until,
            updated_at = now()
        WHERE table_id = p_table_id;
    ELSE
        v_target_output_id := v_table.lights_output_id;
        IF v_target_output_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'OUTLET_NOT_CONFIGURED', 'statusCode', 400, 'error', 'Valolähtöä ei ole määritetty tälle pöydälle.');
        END IF;

        IF p_mode <> 'auto' THEN
            v_manual_until := now() + ((COALESCE(p_duration_minutes, 30)) * interval '1 minute');
        END IF;

        UPDATE public.arcade_table_configs
        SET lights_mode = p_mode,
            lights_manual_until = v_manual_until,
            updated_at = now()
        WHERE table_id = p_table_id;
    END IF;

    INSERT INTO public.arcade_events (table_id, event_type, payload)
    VALUES (p_table_id, 'moderator_aux_override', jsonb_build_object(
        'outlet_role', p_outlet_role,
        'target_output_id', v_target_output_id,
        'mode', p_mode,
        'manual_until', v_manual_until
    ));

    RETURN jsonb_build_object(
        'success', true,
        'statusCode', 200,
        'table_id', p_table_id,
        'outlet_role', p_outlet_role,
        'output_id', v_target_output_id,
        'mode', p_mode,
        'manual_until', v_manual_until
    );
END;
$$;

-- 5. RPC: arcade_record_display_heartbeat (Näytön todellinen käynnistyminen / elonmerkki)
CREATE OR REPLACE FUNCTION public.arcade_record_display_heartbeat(
    p_table_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_table_id IS NULL OR trim(p_table_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PARAMETERS', 'statusCode', 400);
    END IF;

    UPDATE public.arcade_table_configs
    SET display_last_heartbeat_at = now()
    WHERE table_id = p_table_id;

    RETURN jsonb_build_object('success', true, 'statusCode', 200, 'table_id', p_table_id, 'heartbeat_at', now());
END;
$$;

-- 6. KÄYTTÖOIKEUDET (Least Privilege)
REVOKE EXECUTE ON FUNCTION public.arcade_set_aux_outlet_mode FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_record_display_heartbeat FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.arcade_set_aux_outlet_mode TO service_role;
GRANT EXECUTE ON FUNCTION public.arcade_record_display_heartbeat TO service_role;
