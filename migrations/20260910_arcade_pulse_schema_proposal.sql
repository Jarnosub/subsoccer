-- ==============================================================================
-- SUBSOCCER GO — ARCADE / PULSE PILOT DATABASE PROPOSAL
-- Vain tarkistettavaksi ehdotukseksi — ÄLÄ AJA TUOTANTOON ENNEN HYVÄKSYNTÄÄ
-- ==============================================================================

-- 1. PÖYTÄKOHTAINEN VIRTA- JA LAITEASETUS
-- table_id tukee sekä tekstimuotoisia tunnisteita että UUID-merkkijonoja.
CREATE TABLE IF NOT EXISTS public.arcade_table_configs (
    table_id TEXT PRIMARY KEY,                     -- esim. 'pulse-tripla-01' tai 'demo-pulse-01'
    game_id UUID REFERENCES public.games(id) ON DELETE SET NULL, -- valinnainen linkki games-tauluun
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_free_play_allowed BOOLEAN NOT NULL DEFAULT false, -- Tuotantorajoite: ilmaisaktivointi vaatii tietoisen hyväksynnän
    switch_type TEXT NOT NULL DEFAULT 'netio_json', -- 'simulation', 'netio_json', 'netio_cloud', 'shelly_cloud'
    switch_endpoint TEXT,                          -- esim. pilvi- tai laiterajapinnan URL
    switch_auth_secret TEXT,                      -- laitteen API-token/salasana (vain palvelimen luettavissa)
    switch_output_id INT NOT NULL DEFAULT 1,       -- releen/pistorasian numero (oletus 1: pöytä)
    default_duration_seconds INT NOT NULL DEFAULT 900,  -- 15 min
    max_duration_seconds INT NOT NULL DEFAULT 3600,     -- 60 min
    lock_state TEXT NOT NULL DEFAULT 'available' CHECK (lock_state IN ('available', 'maintenance_locked', 'error_locked')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SESSIOTAULU (KÄYTTÖJAKSOT)
-- Sisältää sessioiden elinkaaren, idempotenssitunnisteen ja päättymisajat.
CREATE TABLE IF NOT EXISTS public.arcade_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id TEXT NOT NULL REFERENCES public.arcade_table_configs(table_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('requested', 'active', 'cooldown', 'completed', 'failed', 'canceled', 'force_stopped')),
    auth_source TEXT NOT NULL DEFAULT 'test_table' CHECK (auth_source IN ('free_play', 'test_table', 'stripe', 'admin')),
    duration_seconds INT NOT NULL DEFAULT 900,
    client_session_token TEXT NOT NULL,           -- Selaimen uniikki idempotenssiavain
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    confirmed_off_at TIMESTAMPTZ,
    error_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- KRIITTINEN IDEMPOTENSSIRAJOITE 1:
-- Estää useamman samanaikaisen aktiivisen tai pyydetyn session samalle pöydälle
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_arcade_session 
ON public.arcade_sessions (table_id) 
WHERE status IN ('requested', 'active', 'cooldown');

-- KRIITTINEN IDEMPOTENSSIRAJOITE 2:
-- Estää saman selaintapahtuman toistamisen (tuplaklikkaukset, verkkoretryt)
CREATE UNIQUE INDEX IF NOT EXISTS idx_arcade_client_session_token
ON public.arcade_sessions (client_session_token);

CREATE INDEX IF NOT EXISTS idx_arcade_sessions_table_status ON public.arcade_sessions (table_id, status);
CREATE INDEX IF NOT EXISTS idx_arcade_sessions_expires ON public.arcade_sessions (expires_at) WHERE status = 'active';

-- 3. AUDIT- JA TAPAHTUMALOKI
-- Raportoi toteutuneen virta-ajan ja laitevirheet erillään peliotteluista.
CREATE TABLE IF NOT EXISTS public.arcade_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_id TEXT NOT NULL,
    session_id UUID REFERENCES public.arcade_sessions(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'session_requested', 
        'switch_cmd_sent', 
        'switch_confirmed_on', 
        'session_expired', 
        'switch_confirmed_off', 
        'force_stopped', 
        'switch_error'
    )),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arcade_events_table_session ON public.arcade_events (table_id, session_id);
CREATE INDEX IF NOT EXISTS idx_arcade_events_created ON public.arcade_events (created_at DESC);

-- 4. TURVALLISUUS & RLS (ROW LEVEL SECURITY)
ALTER TABLE public.arcade_table_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arcade_events ENABLE ROW LEVEL SECURITY;

-- arcade_table_configs: Ei julkista pääsyä, vain service_role pääsee käsiksi
DROP POLICY IF EXISTS "service_role_manage_table_configs" ON public.arcade_table_configs;
CREATE POLICY "service_role_manage_table_configs" ON public.arcade_table_configs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- arcade_sessions: service_role hallinnoi täysin
DROP POLICY IF EXISTS "service_role_manage_sessions" ON public.arcade_sessions;
CREATE POLICY "service_role_manage_sessions" ON public.arcade_sessions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- arcade_events: service_role hallinnoi täysin
DROP POLICY IF EXISTS "service_role_manage_events" ON public.arcade_events;
CREATE POLICY "service_role_manage_events" ON public.arcade_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
