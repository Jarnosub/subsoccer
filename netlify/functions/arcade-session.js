/**
 * ==============================================================================
 * SUBSOCCER GO — ARCADE SESSION API (NETIO & Supabase Integration)
 * ==============================================================================
 * 
 * Endpoints:
 * - GET  ?action=status&table=<table_id>
 * - POST { action: "activate", table: "pulse-01", durationMinutes: 15, clientToken: "..." }
 * - POST { action: "emergency-cut", table: "pulse-01", adminToken: "..." } (Admin only)
 * - POST { action: "set-outlet", table: "pulse-01", outletId: 2, state: true, adminToken: "..." } (Admin only)
 */

const { createClient } = require('@supabase/supabase-js');
const { NetioAdapter } = require('./utils/netio-adapter.js');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Session-Token, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

const ALLOWED_DURATIONS = [15, 30, 60];
const ALLOWED_OUTLETS = [1, 2, 3];

function getAdminSecret() {
    return process.env.ADMIN_TOKEN || process.env.ARCADE_ADMIN_KEY || null;
}

// Determine environment mode: mock/simulation is permitted ONLY in explicit test mode
function checkIsTestMode() {
    if (process.env.ARCADE_ENV === 'production' || process.env.NODE_ENV === 'production') {
        return false;
    }
    return process.env.NODE_ENV === 'test' || 
           process.env.ARCADE_ENV === 'test' || 
           process.env.ARCADE_MOCK_MODE === 'true';
}

function getPilotTableId() {
    return process.env.PILOT_TABLE_ID || null;
}

// Initialize Supabase Client if credentials exist
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        });
    } catch (e) {
        console.warn('[ARCADE] Supabase init warning:', e.message);
    }
}

// In-memory fallback simulation storage (used strictly when in explicit test mode)
const memoryDb = {
    tableConfigs: new Map([
        ['demo-pulse-01', { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null }],
        ['demo-arcade-02', { table_id: 'demo-arcade-02', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null }],
        ['demo-locked-03', { table_id: 'demo-locked-03', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null }],
        ['subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null }],
        ['subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null }]
    ]),
    sessions: new Map(), // key: table_id -> active session object
    events: [],
    _simulateDbErrorOnActivate: false,
    _mockNetioConfig: {}
};

function getTableConfig(tableId, isTestMode) {
    if (memoryDb.tableConfigs.has(tableId)) {
        return memoryDb.tableConfigs.get(tableId);
    }
    // Allow dynamic test tables in test mode
    if (isTestMode && tableId.startsWith('test-')) {
        const dynamicCfg = {
            table_id: tableId,
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 1,
            is_free_play_allowed: true,
            device_endpoint: null
        };
        memoryDb.tableConfigs.set(tableId, dynamicCfg);
        return dynamicCfg;
    }
    return null;
}

/**
 * Instantiate table-specific NETIO hardware adapter
 */
function getNetioAdapter(tableConfig, isTestMode) {
    const rawEndpoint = tableConfig?.device_endpoint || tableConfig?.switch_endpoint || process.env.NETIO_BASE_URL || process.env.NETIO_ENDPOINT || '';
    const username = tableConfig?.device_username || process.env.NETIO_USERNAME || process.env.NETIO_USER || 'admin';
    const password = tableConfig?.device_password || tableConfig?.switch_auth_secret || process.env.NETIO_PASSWORD || process.env.NETIO_PASS || '';
    const isMock = isTestMode && !rawEndpoint;

    if (!isTestMode && !rawEndpoint) {
        return null;
    }

    const mockConfig = (isTestMode && memoryDb._mockNetioConfig) || {};

    return new NetioAdapter({
        endpoint: rawEndpoint || (isTestMode ? 'simulated' : ''),
        username,
        password,
        timeoutMs: tableConfig?.timeoutMs || 3500,
        isMock,
        mockActiveShortOn: mockConfig.mockActiveShortOn ?? tableConfig?.mockActiveShortOn,
        mockCutoffReturnsState1: mockConfig.mockCutoffReturnsState1 ?? tableConfig?.mockCutoffReturnsState1,
        mockStatusOutputState: mockConfig.mockStatusOutputState ?? tableConfig?.mockStatusOutputState,
        mockStatusFails: mockConfig.mockStatusFails ?? tableConfig?.mockStatusFails
    });
}

/**
 * Pöydän ja sessioiden tilan sovittelu (Reconciliation)
 * Pöytää EI SAA vapauttaa ennen kuin:
 * 1. Alkuperäinen expires_at + 4000ms turvamarginaali on kulunut umpeen.
 * 2. NETIO-tilakysely vahvistaa, että releen State === 0.
 * Jos rele on edelleen State === 1 tai kysely epäonnistuu, pöytä lukitaan error_locked -tilaan.
 */
async function reconcileTableState(tableId, tableConfig, netio, isTestMode) {
    const now = Date.now();
    const targetOutputId = tableConfig?.switch_output_id || 1;

    if (supabase) {
        // 1. Käsittele sessiot joissa relekäskyä EI KOSKAAN lähetetty (hardware_dispatched_at IS NULL)
        const staleThreshold = new Date(now - 30000).toISOString();
        await supabase.from('arcade_sessions')
            .update({ status: 'failed', error_reason: 'Activation timed out before hardware command was dispatched' })
            .eq('table_id', tableId)
            .eq('status', 'requested')
            .is('hardware_dispatched_at', null)
            .lt('requested_at', staleThreshold);

        // 2. Hae kaikki aktiiviset tai lukitut sessiot
        const { data: sessions } = await supabase
            .from('arcade_sessions')
            .select('*')
            .eq('table_id', tableId)
            .in('status', ['requested', 'active', 'cooldown', 'hardware_uncertain'])
            .order('created_at', { ascending: false });

        if (!sessions || sessions.length === 0) {
            return;
        }

        for (const s of sessions) {
            const expiresAtMs = s.expires_at ? new Date(s.expires_at).getTime() : (new Date(s.requested_at).getTime() + (s.duration_seconds || 900) * 1000);
            const isDeadlinePassedWithMargin = now > (expiresAtMs + 4000);

            if (!isDeadlinePassedWithMargin) {
                // Deadline EI ole vielä kulunut: sessiota ja pöytää EI saa vapauttaa!
                if (s.status === 'requested' && s.hardware_dispatched_at && now > (new Date(s.requested_at).getTime() + 30000)) {
                    await supabase.from('arcade_sessions')
                        .update({ status: 'hardware_uncertain', error_reason: 'Hardware dispatched but not confirmed active within 30s' })
                        .eq('id', s.id);
                    await supabase.from('arcade_table_configs')
                        .update({ lock_state: 'error_locked' })
                        .eq('table_id', tableId);
                }
                continue;
            }

            // Deadline + 4000ms ON kulunut: Nyt tarkistetaan fyysisen laitteen tila!
            let isConfirmedOff = false;
            if (netio) {
                try {
                    isConfirmedOff = await netio.verifyConfirmedOff(targetOutputId);
                } catch (probeErr) {
                    console.warn(`[RECONCILE] Hardware probe failed for table ${tableId}:`, probeErr.message);
                    isConfirmedOff = false;
                }
            }

            if (isConfirmedOff) {
                // Rele on todistettavasti State === 0: Voidaan vapauttaa!
                await supabase.from('arcade_sessions')
                    .update({ status: 'completed', confirmed_off_at: new Date().toISOString() })
                    .eq('id', s.id);

                await supabase.from('arcade_table_configs')
                    .update({ lock_state: 'available' })
                    .eq('table_id', tableId)
                    .eq('lock_state', 'error_locked');
            } else {
                // Rele on edelleen ON tai yhteys epäonnistui: Pöytä pysyy lukittuna!
                await supabase.from('arcade_sessions')
                    .update({ 
                        status: 'hardware_uncertain', 
                        error_reason: 'Deadline passed but hardware relay is still ON or unreachable' 
                    })
                    .eq('id', s.id);

                await supabase.from('arcade_table_configs')
                    .update({ lock_state: 'error_locked' })
                    .eq('table_id', tableId);
            }
        }
    } else {
        // In-memory fallback
        const s = memoryDb.sessions.get(tableId);
        if (!s) return;

        const expiresAtMs = s.expiresAt || (new Date(s.requestedAt).getTime() + (s.durationMinutes || 15) * 60 * 1000);
        const isDeadlinePassedWithMargin = now > (expiresAtMs + 4000);

        if (!isDeadlinePassedWithMargin) {
            if (s.status === 'requested' && now > (new Date(s.requestedAt).getTime() + 30000)) {
                if (s.cmdSent) {
                    s.status = 'hardware_uncertain';
                    const cfg = memoryDb.tableConfigs.get(tableId);
                    if (cfg) cfg.lock_state = 'error_locked';
                } else {
                    s.status = 'failed';
                    memoryDb.sessions.delete(tableId);
                }
            }
            return;
        }

        // Deadline + margin has passed: verify hardware
        let isConfirmedOff = false;
        if (netio) {
            try {
                isConfirmedOff = await netio.verifyConfirmedOff(targetOutputId);
            } catch (probeErr) {
                isConfirmedOff = false;
            }
        }

        if (isConfirmedOff) {
            s.status = 'completed';
            memoryDb.sessions.delete(tableId);
            const cfg = memoryDb.tableConfigs.get(tableId);
            if (cfg && cfg.lock_state === 'error_locked') {
                cfg.lock_state = 'available';
            }
        } else {
            s.status = 'hardware_uncertain';
            const cfg = memoryDb.tableConfigs.get(tableId);
            if (cfg) cfg.lock_state = 'error_locked';
        }
    }
}

/**
 * Check Admin Authorization for protected endpoints
 * In production, ADMIN_SECRET MUST be set in environment variables.
 */
function isAuthorizedAdmin(event, body) {
    const adminSecret = getAdminSecret();
    if (!adminSecret) {
        return false;
    }
    const headers = event?.headers || {};
    const headerToken = headers['x-admin-token'] || 
                        (headers['authorization'] ? headers['authorization'].replace(/^Bearer\s+/i, '') : '');
    const bodyToken = body?.adminToken;
    const candidate = (headerToken || bodyToken || '').trim();

    return candidate.length > 0 && candidate === adminSecret;
}

/**
 * Production Activation Policy Gate:
 * Estää avoimen ilmaisaktivoinnin tuotannossa ilman liiketoimintapäätöstä.
 * Asiakkaan pyynnössä välitetty authSource ei koskaan anna käyttöoikeutta.
 */
function checkActivationPolicy(tableId, tableConfig, event, body, isTestMode) {
    // 1. Ylläpitäjä admin-tokenilla
    if (isAuthorizedAdmin(event, body)) {
        return { allowed: true, authSource: 'admin' };
    }

    // 2. Palvelimella erikseen hyväksytty free-play
    const globalFreePlay = process.env.ARCADE_FREE_PLAY_APPROVED === 'true';
    if (globalFreePlay || tableConfig?.is_free_play_allowed === true) {
        return { allowed: true, authSource: 'free_play' };
    }

    // 3. Testitilassa sallitut testipöydät
    const isTestTable = tableId === 'demo-pulse-01' || tableId === 'demo-arcade-02' || tableId.startsWith('test-');
    const allowTestTables = process.env.ARCADE_ALLOW_TEST_TABLES !== 'false';
    if (isTestMode && isTestTable && allowTestTables) {
        return { allowed: true, authSource: 'test_table' };
    }

    return {
        allowed: false,
        code: 'ACTIVATION_RESTRICTED',
        error: 'Pöydän aktivointi vaatii ylläpidon valtuutuksen tai ennalta sovitun ilmaisjakson. Asiakkaan ilmaisaktivointi on suljettu tuotannossa.'
    };
}

exports.handler = async function (event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    const isTestMode = checkIsTestMode();
    const pilotTableId = getPilotTableId();

    // Tuotantorajoite 1: PILOT_TABLE_ID on pakollinen tuotannossa
    if (!pilotTableId && !isTestMode) {
        return {
            statusCode: 503,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Pilot configuration missing: PILOT_TABLE_ID environment variable is required in production mode.',
                code: 'PILOT_CONFIG_MISSING'
            })
        };
    }

    // Tuotantorajoite 2: puuttuvat kanta-asetukset estävät toiminnan
    if (!supabase && !isTestMode) {
        return {
            statusCode: 503,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Database configuration missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production mode.',
                code: 'DB_CONFIG_MISSING'
            })
        };
    }

    try {
        // ──────────────────────────────────────────────────────────────────────────
        // 1. GET STATUS (?action=status&table=...)
        // ──────────────────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            const tableId = (event.queryStringParameters?.table || '').trim();
            if (!tableId) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Missing or invalid 'table' parameter" })
                };
            }

            if (pilotTableId && tableId !== pilotTableId) {
                return {
                    statusCode: 403,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ 
                        error: `Only pilot table '${pilotTableId}' is supported in this deployment.`,
                        code: 'TABLE_NOT_IN_PILOT'
                    })
                };
            }

            let tableConfig = null;
            if (supabase) {
                const { data: cfg } = await supabase
                    .from('arcade_table_configs')
                    .select('*')
                    .eq('table_id', tableId)
                    .maybeSingle();
                tableConfig = cfg;
            } else {
                tableConfig = getTableConfig(tableId, isTestMode);
            }

            if (!tableConfig) {
                return {
                    statusCode: 404,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: `Unknown table ID '${tableId}'. Table is not registered in arcade fleet.`, code: 'TABLE_NOT_FOUND' })
                };
            }

            const netio = getNetioAdapter(tableConfig, isTestMode);
            if (!netio && !isTestMode) {
                return {
                    statusCode: 503,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        error: `Hardware configuration missing for table '${tableId}': no device endpoint configured and no global NETIO_BASE_URL.`,
                        code: 'HARDWARE_CONFIG_MISSING'
                    })
                };
            }

            // Aja sovittelu laitteen ja tietokannan välillä
            await reconcileTableState(tableId, tableConfig, netio, isTestMode);

            let tableState = 'available';
            let timeRemainingSecs = 0;
            let activeExpiresAt = null;

            if (supabase) {
                const { data: updatedCfg } = await supabase
                    .from('arcade_table_configs')
                    .select('*')
                    .eq('table_id', tableId)
                    .maybeSingle();
                if (updatedCfg) tableConfig = updatedCfg;

                const { data: activeSession } = await supabase
                    .from('arcade_sessions')
                    .select('*')
                    .eq('table_id', tableId)
                    .in('status', ['requested', 'active', 'cooldown', 'hardware_uncertain'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (tableConfig?.lock_state === 'error_locked' || activeSession?.status === 'hardware_uncertain') {
                    tableState = 'error_locked';
                } else if (tableConfig && (!tableConfig.is_enabled || tableConfig.lock_state !== 'available')) {
                    tableState = tableConfig.lock_state || 'locked';
                } else if (activeSession) {
                    activeExpiresAt = activeSession.expires_at;
                    const expiresAtMs = activeSession.expires_at ? new Date(activeSession.expires_at).getTime() : 0;
                    const now = Date.now();
                    if (expiresAtMs > now) {
                        tableState = 'active';
                        timeRemainingSecs = Math.max(0, Math.round((expiresAtMs - now) / 1000));
                    } else if (activeSession.status === 'cooldown' || (now - expiresAtMs < 4000)) {
                        tableState = 'cooldown';
                    }
                }
            } else {
                const cfg = memoryDb.tableConfigs.get(tableId) || tableConfig;
                const existingSession = memoryDb.sessions.get(tableId);

                if (cfg?.lock_state === 'error_locked' || existingSession?.status === 'hardware_uncertain') {
                    tableState = 'error_locked';
                } else if (cfg && (!cfg.is_enabled || cfg.lock_state !== 'available')) {
                    tableState = cfg.lock_state || 'locked';
                } else if (existingSession && existingSession.expiresAt > Date.now()) {
                    tableState = 'active';
                    activeExpiresAt = new Date(existingSession.expiresAt).toISOString();
                    timeRemainingSecs = Math.max(0, Math.round((existingSession.expiresAt - Date.now()) / 1000));
                } else if (existingSession && Date.now() - existingSession.expiresAt < 4000) {
                    tableState = 'cooldown';
                }
            }

            const netioStatus = netio ? await netio.getStatus().catch(() => ({ mode: 'offline' })) : { mode: 'offline' };

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    tableId,
                    state: tableState,
                    timeRemainingSecs,
                    expiresAt: activeExpiresAt,
                    outputId: tableConfig?.switch_output_id || 1,
                    hardware: {
                        mode: netio?.isMock ? 'simulation' : 'hardware',
                        endpoint: netio?.isMock ? 'simulation' : (tableConfig?.device_endpoint ? 'table_endpoint' : 'connected'),
                        outlets: netioStatus.outputs || []
                    },
                    packages: ALLOWED_DURATIONS
                })
            };
        }

        // ──────────────────────────────────────────────────────────────────────────
        // 2. POST ACTIONS
        // ──────────────────────────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            let body = {};
            try {
                body = JSON.parse(event.body || '{}');
            } catch (e) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Invalid JSON payload' })
                };
            }

            const { action } = body;
            const table = (body.table || '').trim();

            // ─── VALIDATION 1: TABLE PARAMETER ───
            if (!table) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: "Missing or invalid 'table' parameter" })
                };
            }

            // ─── PILOT TABLE RESTRICTION ───
            if (pilotTableId && table !== pilotTableId) {
                return {
                    statusCode: 403,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ 
                        error: `Only pilot table '${pilotTableId}' is supported in this deployment.`,
                        code: 'TABLE_NOT_IN_PILOT'
                    })
                };
            }

            // ─── ACTION: ACTIVATE SESSION (USE CASE 1: POWER LEASE) ───
            if (action === 'activate') {
                const durationMinutes = Number(body.durationMinutes);
                const clientToken = (body.clientToken || `tok-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`).trim();

                // Validation 2: Duration
                if (!ALLOWED_DURATIONS.includes(durationMinutes)) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ 
                            error: `Invalid 'durationMinutes'. Allowed values: ${ALLOWED_DURATIONS.join(', ')}`,
                            allowedDurations: ALLOWED_DURATIONS 
                        })
                    };
                }

                let sessionId = null;
                const requestedAt = new Date().toISOString();

                // ─── SUPABASE FLOW ───
                if (supabase) {
                    // Check table config
                    const { data: cfg, error: cfgError } = await supabase
                        .from('arcade_table_configs')
                        .select('*')
                        .eq('table_id', table)
                        .maybeSingle();

                    if (cfgError) {
                        console.error('[SUPABASE ERROR] table config fetch failed:', cfgError.message);
                    }

                    if (!cfg && !isTestMode) {
                        return {
                            statusCode: 404,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ 
                                error: `Unknown table ID '${table}'. Table is not registered in arcade fleet.`,
                                code: 'TABLE_NOT_FOUND' 
                            })
                        };
                    }

                    if (cfg && (!cfg.is_enabled || cfg.lock_state !== 'available')) {
                        return {
                            statusCode: 423,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ 
                                error: 'Table is currently disabled or locked for maintenance.',
                                code: 'TABLE_LOCKED',
                                lockState: cfg.lock_state
                            })
                        };
                    }

                    // Hardware adapter tablekohtaisesti
                    const netio = getNetioAdapter(cfg, isTestMode);
                    if (!netio && !isTestMode) {
                        return {
                            statusCode: 503,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({
                                error: `Hardware configuration missing for table '${table}': no device endpoint configured and no global NETIO_BASE_URL.`,
                                code: 'HARDWARE_CONFIG_MISSING'
                            })
                        };
                    }

                    // Production Activation Policy Gate
                    const policy = checkActivationPolicy(table, cfg, event, body, isTestMode);
                    if (!policy.allowed) {
                        return {
                            statusCode: 403,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ error: policy.error, code: policy.code })
                        };
                    }

                    // Idempotency: Tarkista onko tällä clientTokenilla jo olemassa sessio
                    const { data: existingTokenSession } = await supabase
                        .from('arcade_sessions')
                        .select('*')
                        .eq('client_session_token', clientToken)
                        .maybeSingle();

                    if (existingTokenSession) {
                        // Idempotentti uusintapyyntö: palauta aiempi sessio ilman uutta relekäskyä!
                        return {
                            statusCode: 200,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({
                                success: existingTokenSession.status === 'active',
                                action: 'activate',
                                tableId: existingTokenSession.table_id,
                                sessionId: existingTokenSession.id,
                                status: existingTokenSession.status,
                                expiresAt: existingTokenSession.expires_at,
                                isIdempotentReplay: true
                            })
                        };
                    }

                    // Reconcile table state before reservation
                    await reconcileTableState(table, cfg, netio, isTestMode);

                    const delayMs = durationMinutes * 60 * 1000;
                    const durationSeconds = durationMinutes * 60;
                    const expiresAt = new Date(Date.now() + delayMs).toISOString();

                    // Insert session with status 'requested'.
                    // idx_single_active_arcade_session uniikki-indeksi estää rinnakkaiset varaukset!
                    const { data: session, error: insertError } = await supabase
                        .from('arcade_sessions')
                        .insert({
                            table_id: table,
                            status: 'requested',
                            auth_source: policy.authSource,
                            duration_seconds: durationSeconds,
                            client_session_token: clientToken,
                            requested_at: requestedAt,
                            expires_at: expiresAt, // Muuttumaton deadline asetettu heti alussa
                            hardware_dispatched_at: null
                        })
                        .select()
                        .single();

                    if (insertError) {
                        // Unique violation (PostgreSQL code 23505)
                        if (insertError.code === '23505' || insertError.message?.includes('duplicate key') || insertError.message?.includes('idx_single_active_arcade_session')) {
                            return {
                                statusCode: 409,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({
                                    error: 'Table is currently active with another session.',
                                    code: 'SESSION_CONFLICT'
                                })
                            };
                        }
                        console.error('[SUPABASE ERROR] session insert failed:', insertError.message);
                        return {
                            statusCode: 500,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ error: 'Database session reservation failed', details: insertError.message })
                        };
                    }

                    sessionId = session.id;
                    const targetOutputId = cfg?.switch_output_id || 1;

                    // Audit Event: session_requested
                    const { error: evReqErr } = await supabase.from('arcade_events').insert({
                        table_id: table,
                        session_id: sessionId,
                        event_type: 'session_requested',
                        payload: { durationMinutes, clientToken, outputId: targetOutputId }
                    });
                    if (evReqErr) console.warn('[AUDIT ERROR] session_requested:', evReqErr.message);

                    // Merkitään hardware_dispatched_at ennen relekäskyn lähetystä,
                    // jotta automaattisiivous tietää käskyn olleen matkalla eikä vapauta pöytää epävarmassa tilassa!
                    await supabase.from('arcade_sessions').update({
                        hardware_dispatched_at: new Date().toISOString()
                    }).eq('id', sessionId);

                    // Audit Event: switch_cmd_sent
                    const { error: evCmdErr } = await supabase.from('arcade_events').insert({
                        table_id: table,
                        session_id: sessionId,
                        event_type: 'switch_cmd_sent',
                        payload: { outletId: targetOutputId, durationMinutes }
                    });
                    if (evCmdErr) console.warn('[AUDIT ERROR] switch_cmd_sent:', evCmdErr.message);

                    // Send command to NETIO hardware
                    let netioResult;
                    try {
                        netioResult = await netio.startTimedPlay(durationMinutes, targetOutputId);
                    } catch (netioErr) {
                        let isRelayOff = false;
                        try {
                            isRelayOff = await netio.verifyConfirmedOff(targetOutputId);
                        } catch (probeErr) {
                            console.warn('[PROBE FAILED] Hardware probe failed after command error:', probeErr.message);
                        }

                        if (isRelayOff) {
                            // Rele on varmasti POIS PÄÄLTÄ: Vapautetaan lukko turvallisesti
                            await supabase.from('arcade_sessions')
                                .update({ status: 'failed', error_reason: `Relay failed: ${netioErr.message} (confirmed inactive)` })
                                .eq('id', sessionId);

                            await supabase.from('arcade_events').insert({
                                table_id: table,
                                session_id: sessionId,
                                event_type: 'switch_error',
                                payload: { error: netioErr.message, confirmedOff: true }
                            });

                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({ error: 'Failed to activate hardware relay', details: netioErr.message })
                            };
                        } else {
                            // Rele on ON tai probe epäonnistui:
                            await supabase.from('arcade_sessions')
                                .update({ 
                                    status: 'hardware_uncertain', 
                                    error_reason: `Hardware state uncertain (relay not confirmed OFF): ${netioErr.message}`,
                                    expires_at: expiresAt
                                })
                                .eq('id', sessionId);

                            await supabase.from('arcade_table_configs')
                                .update({ lock_state: 'error_locked' })
                                .eq('table_id', table);

                            await supabase.from('arcade_events').insert({
                                table_id: table,
                                session_id: sessionId,
                                event_type: 'switch_error',
                                payload: { error: netioErr.message, state: 'uncertain', actionTaken: 'error_locked', expiresAt }
                            });

                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({ 
                                    error: 'Hardware state uncertain: unable to confirm relay watchdog lease. Table has been locked for operator inspection.',
                                    code: 'HARDWARE_UNCERTAIN',
                                    tableLocked: true,
                                    expiresAt,
                                    details: netioErr.message 
                                })
                            };
                        }
                    }

                    // Success: Update session to active
                    const activatedAt = new Date().toISOString();

                    const { error: updErr } = await supabase.from('arcade_sessions').update({
                        status: 'active',
                        activated_at: activatedAt
                    }).eq('id', sessionId);

                    if (updErr) {
                        console.error('[SUPABASE ERROR] session activate update failed:', updErr.message);

                        let cutConfirmedOff = false;
                        let cutError = null;
                        try {
                            const cutResult = await netio.emergencyStop(targetOutputId);
                            const confirmedState = cutResult?.response?.Outputs?.find(o => o.ID === targetOutputId)?.State ?? cutResult?.state;
                            if (confirmedState === 0) {
                                const isOff = await netio.verifyConfirmedOff(targetOutputId);
                                if (isOff) {
                                    cutConfirmedOff = true;
                                }
                            }
                        } catch (cutErr) {
                            cutError = cutErr;
                            console.error('[EMERGENCY CUT FAILED] Relay cutoff failed or rejected:', cutErr.code || cutErr.message);
                        }

                        if (cutConfirmedOff) {
                            await supabase.from('arcade_sessions').update({
                                status: 'failed',
                                error_reason: `DB update to active failed; emergency power cut confirmed OFF: ${updErr.message}`
                            }).eq('id', sessionId).catch(() => {});

                            await supabase.from('arcade_events').insert({
                                table_id: table,
                                session_id: sessionId,
                                event_type: 'switch_error',
                                payload: { error: updErr.message, emergencyCut: 'confirmed_off' }
                            }).catch(() => {});

                            return {
                                statusCode: 500,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({
                                    error: 'Database update failed after hardware start. Table power was safely cut. Please retry.',
                                    code: 'DB_UPDATE_FAILED',
                                    details: updErr.message
                                })
                            };
                        } else {
                            const reason = cutError?.code === 'SHORT_ON_ACTIVE'
                                ? 'DB update failed and emergency cut was rejected (Short ON active on device)'
                                : `DB update failed and emergency cut unconfirmed (state not 0): ${cutError?.message || 'cut unverified'}`;

                            await supabase.from('arcade_sessions').update({
                                status: 'hardware_uncertain',
                                error_reason: reason,
                                expires_at: expiresAt // Säilytä alkuperäinen muuttumaton deadline!
                            }).eq('id', sessionId).catch(() => {});

                            await supabase.from('arcade_table_configs').update({
                                lock_state: 'error_locked'
                            }).eq('table_id', table).catch(() => {});

                            await supabase.from('arcade_events').insert({
                                table_id: table,
                                session_id: sessionId,
                                event_type: 'switch_error',
                                payload: {
                                    error: updErr.message,
                                    cutError: cutError?.message,
                                    cutErrorCode: cutError?.code,
                                    actionTaken: 'error_locked',
                                    expiresAt
                                }
                            }).catch(() => {});

                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({
                                    error: 'Hardware state uncertain: session state could not be saved and power cut could not be verified. Table has been locked for operator inspection.',
                                    code: 'HARDWARE_UNCERTAIN',
                                    tableLocked: true,
                                    expiresAt,
                                    details: cutError?.message || updErr.message
                                })
                            };
                        }
                    }

                    // Audit Event: switch_confirmed_on
                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        session_id: sessionId,
                        event_type: 'switch_confirmed_on',
                        payload: { hardware: netioResult, expiresAt, outputId: targetOutputId }
                    });

                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            success: true,
                            action: 'activate',
                            tableId: table,
                            sessionId,
                            durationMinutes,
                            expiresAt,
                            hardware: netioResult
                        })
                    };

                } else {
                    // ─── IN-MEMORY FALLBACK (Vain testitilassa) ───
                    const cfg = getTableConfig(table, isTestMode);
                    if (!cfg) {
                        return {
                            statusCode: 404,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ 
                                error: `Unknown table ID '${table}'. Table is not registered in arcade fleet.`,
                                code: 'TABLE_NOT_FOUND' 
                            })
                        };
                    }

                    const netio = getNetioAdapter(cfg, isTestMode);
                    if (!netio && !isTestMode) {
                        return {
                            statusCode: 503,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({
                                error: `Hardware configuration missing for table '${table}'.`,
                                code: 'HARDWARE_CONFIG_MISSING'
                            })
                        };
                    }

                    // Sovittelu ennen varausta
                    await reconcileTableState(table, cfg, netio, isTestMode);

                    if (!cfg.is_enabled || cfg.lock_state !== 'available') {
                        return {
                            statusCode: 423,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ 
                                error: 'Table is currently disabled or locked for maintenance.',
                                code: 'TABLE_LOCKED',
                                lockState: cfg.lock_state
                            })
                        };
                    }

                    // Production Activation Policy Gate
                    const policy = checkActivationPolicy(table, cfg, event, body, isTestMode);
                    if (!policy.allowed) {
                        return {
                            statusCode: 403,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ error: policy.error, code: policy.code })
                        };
                    }

                    // Idempotency check in memory
                    for (const s of memoryDb.sessions.values()) {
                        if (s.clientToken === clientToken) {
                            return {
                                statusCode: 200,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({
                                    success: s.status === 'active',
                                    action: 'activate',
                                    tableId: s.tableId,
                                    sessionId: s.id,
                                    status: s.status,
                                    expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
                                    isIdempotentReplay: true
                                })
                            };
                        }
                    }

                    const currentSession = memoryDb.sessions.get(table);
                    if (currentSession && (
                        currentSession.status === 'requested' || 
                        currentSession.status === 'active' || 
                        currentSession.status === 'cooldown' || 
                        currentSession.status === 'hardware_uncertain' || 
                        (currentSession.expiresAt && currentSession.expiresAt > Date.now())
                    )) {
                        return {
                            statusCode: 409,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({
                                error: 'Table is currently active with another session.',
                                code: 'SESSION_CONFLICT',
                                expiresAt: currentSession.expiresAt ? new Date(currentSession.expiresAt).toISOString() : null
                            })
                        };
                    }

                    const fallbackSessionId = 'mem-' + Date.now();
                    const targetOutputId = cfg?.switch_output_id || 1;
                    const delayMs = durationMinutes * 60 * 1000;
                    const expiresAtMs = Date.now() + delayMs;
                    const expiresAtIso = new Date(expiresAtMs).toISOString();

                    memoryDb.sessions.set(table, {
                        id: fallbackSessionId,
                        tableId: table,
                        status: 'requested',
                        authSource: policy.authSource,
                        clientToken,
                        durationMinutes,
                        requestedAt,
                        expiresAt: expiresAtMs, // Muuttumaton deadline tallennetaan heti
                        cmdSent: true
                    });

                    // Audit Event: session_requested
                    memoryDb.events.push({
                        table_id: table,
                        session_id: fallbackSessionId,
                        event_type: 'session_requested',
                        payload: { durationMinutes, clientToken, outputId: targetOutputId },
                        created_at: requestedAt
                    });

                    // Audit Event: switch_cmd_sent
                    memoryDb.events.push({
                        table_id: table,
                        session_id: fallbackSessionId,
                        event_type: 'switch_cmd_sent',
                        payload: { outletId: targetOutputId, durationMinutes },
                        created_at: new Date().toISOString()
                    });

                    // Command NETIO
                    let netioResult;
                    try {
                        netioResult = await netio.startTimedPlay(durationMinutes, targetOutputId);
                    } catch (netioErr) {
                        let isRelayOff = false;
                        try {
                            isRelayOff = await netio.verifyConfirmedOff(targetOutputId);
                        } catch (probeErr) {
                            // ignore probe error
                        }

                        if (isRelayOff) {
                            memoryDb.sessions.delete(table);
                            memoryDb.events.push({
                                table_id: table,
                                session_id: fallbackSessionId,
                                event_type: 'switch_error',
                                payload: { error: netioErr.message, confirmedOff: true },
                                created_at: new Date().toISOString()
                            });
                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({ error: 'Failed to activate hardware relay', details: netioErr.message })
                            };
                        } else {
                            // Uncertain or relay is ON: DO NOT ASSUME SUCCESS! Lock to hardware_uncertain
                            memoryDb.sessions.set(table, {
                                id: fallbackSessionId,
                                tableId: table,
                                status: 'hardware_uncertain',
                                clientToken,
                                requestedAt,
                                expiresAt: expiresAtMs,
                                cmdSent: true
                            });
                            if (cfg) cfg.lock_state = 'error_locked';

                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({ 
                                    error: 'Hardware state uncertain: unable to confirm relay watchdog lease. Table has been locked for operator inspection.',
                                    code: 'HARDWARE_UNCERTAIN',
                                    tableLocked: true,
                                    expiresAt: expiresAtIso,
                                    details: netioErr.message 
                                })
                            };
                        }
                    }

                    // Test-tilan simulaatio DB-päivityksen epäonnistumiselle relekäskyn jälkeen
                    if (memoryDb._simulateDbErrorOnActivate) {
                        let cutConfirmedOff = false;
                        let cutError = null;
                        try {
                            const cutResult = await netio.emergencyStop(targetOutputId);
                            const confirmedState = cutResult?.response?.Outputs?.find(o => o.ID === targetOutputId)?.State ?? cutResult?.state;
                            if (confirmedState === 0) {
                                const isOff = await netio.verifyConfirmedOff(targetOutputId);
                                if (isOff) {
                                    cutConfirmedOff = true;
                                }
                            }
                        } catch (cutErr) {
                            cutError = cutErr;
                        }

                        if (cutConfirmedOff) {
                            memoryDb.sessions.delete(table);
                            return {
                                statusCode: 500,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({
                                    error: 'Database update failed after hardware start. Table power was safely cut. Please retry.',
                                    code: 'DB_UPDATE_FAILED',
                                    details: 'Simulated database update failure'
                                })
                            };
                        } else {
                            const reason = cutError?.code === 'SHORT_ON_ACTIVE'
                                ? 'DB update failed and emergency cut was rejected (Short ON active on device)'
                                : `DB update failed and emergency cut unconfirmed (state not 0): ${cutError?.message || 'cut unverified'}`;

                            memoryDb.sessions.set(table, {
                                id: fallbackSessionId,
                                tableId: table,
                                status: 'hardware_uncertain',
                                clientToken,
                                requestedAt,
                                expiresAt: expiresAtMs, // Säilytä muuttumaton deadline!
                                cmdSent: true,
                                errorReason: reason
                            });
                            if (cfg) cfg.lock_state = 'error_locked';

                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({
                                    error: 'Hardware state uncertain: session state could not be saved and power cut could not be verified. Table has been locked for operator inspection.',
                                    code: 'HARDWARE_UNCERTAIN',
                                    tableLocked: true,
                                    expiresAt: expiresAtIso,
                                    details: cutError?.message || 'Simulated database update failure'
                                })
                            };
                        }
                    }

                    memoryDb.sessions.set(table, {
                        id: fallbackSessionId,
                        tableId: table,
                        status: 'active',
                        clientToken,
                        durationMinutes,
                        startedAt: Date.now(),
                        expiresAt: expiresAtMs
                    });

                    // Audit Event: switch_confirmed_on
                    memoryDb.events.push({
                        table_id: table,
                        session_id: fallbackSessionId,
                        event_type: 'switch_confirmed_on',
                        payload: { hardware: netioResult, expiresAt: expiresAtIso, outputId: targetOutputId },
                        created_at: new Date().toISOString()
                    });

                    return {
                        statusCode: 200,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            success: true,
                            action: 'activate',
                            tableId: table,
                            sessionId: fallbackSessionId,
                            durationMinutes,
                            expiresAt: expiresAtIso,
                            hardware: netioResult
                        })
                    };
                }
            }

            // ─── ACTION: EMERGENCY FORCE CUT (Admin Only) ───
            if (action === 'emergency-cut') {
                if (!isAuthorizedAdmin(event, body)) {
                    return {
                        statusCode: 401,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Unauthorized: Valid admin token required for emergency cut' })
                    };
                }

                let cfg = null;
                if (supabase) {
                    const { data } = await supabase.from('arcade_table_configs').select('*').eq('table_id', table).maybeSingle();
                    cfg = data;
                } else {
                    cfg = getTableConfig(table, isTestMode);
                }

                if (!cfg) {
                    return {
                        statusCode: 404,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: `Unknown table '${table}'`, code: 'TABLE_NOT_FOUND' })
                    };
                }

                const netio = getNetioAdapter(cfg, isTestMode);
                if (!netio && !isTestMode) {
                    return {
                        statusCode: 503,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            error: `Hardware configuration missing for table '${table}'.`,
                            code: 'HARDWARE_CONFIG_MISSING'
                        })
                    };
                }

                const outputId = cfg?.switch_output_id || 1;
                let commandResult;
                let cutError = null;
                try {
                    commandResult = await netio.emergencyStop(outputId);
                } catch (netErr) {
                    cutError = netErr;
                }

                if (cutError) {
                    if (cutError.code === 'SHORT_ON_ACTIVE') {
                        return {
                            statusCode: 409,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({
                                error: 'NETIO rejected cutoff: Short ON timer is active on hardware. Outlet will turn off autonomously when timer expires.',
                                code: 'SHORT_ON_ACTIVE',
                                details: cutError.message
                            })
                        };
                    }
                    return {
                        statusCode: 502,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Failed to cut relay power on hardware', details: cutError.message })
                    };
                }

                // Varmista että laite vahvisti tilan State === 0
                const confirmedState = commandResult?.response?.Outputs?.find(o => o.ID === outputId)?.State ?? commandResult?.state;
                if (confirmedState !== 0) {
                    return {
                        statusCode: 502,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            error: `Hardware cutoff unconfirmed: device reported State=${confirmedState}`,
                            code: 'CUTOFF_STILL_ON'
                        })
                    };
                }

                if (supabase) {
                    await supabase.from('arcade_sessions')
                        .update({ status: 'force_stopped', confirmed_off_at: new Date().toISOString() })
                        .eq('table_id', table)
                        .in('status', ['requested', 'active', 'cooldown', 'hardware_uncertain']);

                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        event_type: 'force_stopped',
                        payload: { outputId, hardware: commandResult }
                    });
                } else {
                    memoryDb.sessions.delete(table);
                    memoryDb.events.push({
                        table_id: table,
                        event_type: 'force_stopped',
                        payload: { outputId, hardware: commandResult },
                        created_at: new Date().toISOString()
                    });
                }

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        action: 'emergency-cut',
                        tableId: table,
                        outputId,
                        hardware: commandResult
                    })
                };
            }

            // ─── ACTION: MODERATOR OUTLET CONTROL (Admin Only) ───
            if (action === 'set-outlet') {
                if (!isAuthorizedAdmin(event, body)) {
                    return {
                        statusCode: 401,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Unauthorized: Valid admin token required for outlet control' })
                    };
                }

                const outletId = Number(body.outletId);
                if (!ALLOWED_OUTLETS.includes(outletId)) {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ 
                            error: `Invalid 'outletId'. Allowed values: ${ALLOWED_OUTLETS.join(', ')}`,
                            allowedOutlets: ALLOWED_OUTLETS 
                        })
                    };
                }

                // Tiukka boolean-validointi (ei hyväksytä stringejä tai epämääräisiä arvoja)
                if (typeof body.state !== 'boolean') {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: "Invalid 'state' parameter. Must be boolean true or false." })
                    };
                }
                const targetState = body.state;

                let cfg = null;
                if (supabase) {
                    const { data } = await supabase.from('arcade_table_configs').select('*').eq('table_id', table).maybeSingle();
                    cfg = data;
                } else {
                    cfg = getTableConfig(table, isTestMode);
                }

                const netio = getNetioAdapter(cfg, isTestMode);
                if (!netio && !isTestMode) {
                    return {
                        statusCode: 503,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            error: `Hardware configuration missing for table '${table}'.`,
                            code: 'HARDWARE_CONFIG_MISSING'
                        })
                    };
                }

                let commandResult;
                try {
                    commandResult = await netio.setOutletState(outletId, targetState);
                } catch (netErr) {
                    return {
                        statusCode: 502,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: `Failed to set outlet ${outletId} state`, details: netErr.message })
                    };
                }

                if (supabase) {
                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        event_type: targetState ? 'switch_confirmed_on' : 'switch_confirmed_off',
                        payload: { outletId, state: targetState, hardware: commandResult }
                    });
                } else {
                    memoryDb.events.push({
                        table_id: table,
                        event_type: targetState ? 'switch_confirmed_on' : 'switch_confirmed_off',
                        payload: { outletId, state: targetState, hardware: commandResult },
                        created_at: new Date().toISOString()
                    });
                }

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        action: 'set-outlet',
                        tableId: table,
                        outletId,
                        state: targetState,
                        hardware: commandResult
                    })
                };
            }

            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: `Unknown action: ${action}` })
            };
        }

        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    } catch (error) {
        console.error('[API ERROR] arcade-session:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
};

// Export internal state for unit testing
exports._memoryDb = memoryDb;
exports._resetMemoryDb = function () {
    memoryDb.sessions.clear();
    memoryDb.events.length = 0;
    memoryDb._simulateDbErrorOnActivate = false;
    memoryDb.tableConfigs.set('demo-pulse-01', { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null });
    memoryDb.tableConfigs.set('demo-arcade-02', { table_id: 'demo-arcade-02', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('demo-locked-03', { table_id: 'demo-locked-03', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null });
    memoryDb._mockNetioConfig = {};
};
exports._reconcileTableState = reconcileTableState;

