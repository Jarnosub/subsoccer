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
        ['demo-pulse-01', { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true }],
        ['demo-arcade-02', { table_id: 'demo-arcade-02', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false }],
        ['demo-locked-03', { table_id: 'demo-locked-03', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, is_free_play_allowed: false }],
        ['subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false }],
        ['subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true }]
    ]),
    sessions: new Map(), // key: table_id -> active session object
    events: []
};

function getTableConfig(tableId, isTestMode) {
    if (memoryDb.tableConfigs.has(tableId)) {
        return memoryDb.tableConfigs.get(tableId);
    }
    // Allow dynamic test tables in test mode
    if (isTestMode && tableId.startsWith('test-')) {
        return {
            table_id: tableId,
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 1,
            is_free_play_allowed: true
        };
    }
    return null;
}

// Clean up expired in-memory sessions
function cleanExpiredMemorySessions() {
    const now = Date.now();
    for (const [tableId, s] of memoryDb.sessions.entries()) {
        if (s.expiresAt && now > (s.expiresAt + 4000)) { // 4s cooldown buffer
            s.status = 'completed';
            memoryDb.sessions.delete(tableId);
        } else if (s.status === 'requested' && now > (new Date(s.requestedAt).getTime() + 30000)) {
            s.status = 'failed';
            memoryDb.sessions.delete(tableId);
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

    // Tuotantorajoite: puuttuvat kanta-asetukset estävät toiminnan
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
        const netio = new NetioAdapter({
            endpoint: process.env.NETIO_BASE_URL || process.env.NETIO_ENDPOINT || (isTestMode ? 'simulated' : ''),
            username: process.env.NETIO_USERNAME || process.env.NETIO_USER || 'admin',
            password: process.env.NETIO_PASSWORD || process.env.NETIO_PASS || '',
            isMock: isTestMode && !process.env.NETIO_BASE_URL && !process.env.NETIO_ENDPOINT
        });

        if (netio.isMock && !isTestMode) {
            return {
                statusCode: 503,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    error: 'Hardware configuration missing: NETIO_BASE_URL (or NETIO_ENDPOINT) required in production mode.',
                    code: 'HARDWARE_CONFIG_MISSING'
                })
            };
        }

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

            cleanExpiredMemorySessions();

            let tableState = 'available';
            let timeRemainingSecs = 0;
            let tableConfig = null;
            let activeExpiresAt = null;

            if (supabase) {
                const nowIso = new Date().toISOString();
                // Automaattinen vanhentuneiden sessioiden hallittu päättäminen
                await supabase.from('arcade_sessions')
                    .update({ status: 'completed' })
                    .eq('table_id', tableId)
                    .in('status', ['active', 'cooldown'])
                    .lt('expires_at', nowIso);

                // Vanhentuneet requested-sessiot (yli 30s vanhat hylätään vapauttamaan lukko)
                const staleThreshold = new Date(Date.now() - 30000).toISOString();
                await supabase.from('arcade_sessions')
                    .update({ status: 'failed', error_reason: 'Activation timed out before hardware confirmation' })
                    .eq('table_id', tableId)
                    .eq('status', 'requested')
                    .lt('requested_at', staleThreshold);

                const { data: cfg } = await supabase
                    .from('arcade_table_configs')
                    .select('*')
                    .eq('table_id', tableId)
                    .maybeSingle();
                tableConfig = cfg;

                if (!tableConfig && !isTestMode) {
                    return {
                        statusCode: 404,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: `Unknown table ID '${tableId}'. Table is not registered in arcade fleet.`, code: 'TABLE_NOT_FOUND' })
                    };
                }

                const { data: activeSession } = await supabase
                    .from('arcade_sessions')
                    .select('*')
                    .eq('table_id', tableId)
                    .in('status', ['requested', 'active', 'cooldown', 'hardware_uncertain'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (activeSession?.status === 'hardware_uncertain' || tableConfig?.lock_state === 'error_locked') {
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
                // In-memory fallback (vain testitilassa)
                const cfg = getTableConfig(tableId, isTestMode);
                tableConfig = cfg;

                if (!tableConfig) {
                    return {
                        statusCode: 404,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: `Unknown table ID '${tableId}'. Table is not registered in arcade fleet.`, code: 'TABLE_NOT_FOUND' })
                    };
                }

                const existingSession = memoryDb.sessions.get(tableId);

                if (existingSession?.status === 'hardware_uncertain' || cfg?.lock_state === 'error_locked') {
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

            const netioStatus = await netio.getStatus().catch(() => ({ mode: 'offline' }));

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
                        mode: netio.isMock ? 'simulation' : 'hardware',
                        endpoint: netio.isMock ? 'simulation' : 'connected',
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

                    // Automaattinen vanhentuneiden sessioiden hallittu päättäminen ennen varausta
                    const nowIso = new Date().toISOString();
                    await supabase.from('arcade_sessions')
                        .update({ status: 'completed' })
                        .eq('table_id', table)
                        .in('status', ['active', 'cooldown'])
                        .lt('expires_at', nowIso);

                    // Insert session with status 'requested'.
                    // idx_single_active_arcade_session uniikki-indeksi estää rinnakkaiset varaukset!
                    const { data: session, error: insertError } = await supabase
                        .from('arcade_sessions')
                        .insert({
                            table_id: table,
                            status: 'requested',
                            auth_source: policy.authSource,
                            duration_seconds: durationMinutes * 60,
                            client_session_token: clientToken,
                            requested_at: requestedAt
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
                        // Epäselvän laitevastauksen selvitys: Tutkitaan laitteen todellinen tila
                        let isRelayOn = null;
                        try {
                            isRelayOn = await netio.isOutputActive(targetOutputId);
                        } catch (probeErr) {
                            console.warn('[PROBE FAILED] Hardware probe failed after command error:', probeErr.message);
                        }

                        if (isRelayOn === true) {
                            // Rele kytkeytyi virheestä huolimatta perille! Sovitetaan tila activeksi.
                            const activatedAt = new Date().toISOString();
                            const expiresAt = new Date(Date.now() + (durationMinutes * 60 * 1000)).toISOString();

                            await supabase.from('arcade_sessions').update({
                                status: 'active',
                                activated_at: activatedAt,
                                expires_at: expiresAt
                            }).eq('id', sessionId);

                            await supabase.from('arcade_events').insert({
                                table_id: table,
                                session_id: sessionId,
                                event_type: 'switch_confirmed_on',
                                payload: { reconciled: true, warning: netioErr.message, expiresAt }
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
                                    reconciled: true
                                })
                            };
                        } else if (isRelayOn === false) {
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
                            // Epäselvä tila: Yhteyttä ei saada. SÄILYTETÄÄN ESTÄVÄ LUKITUS!
                            await supabase.from('arcade_sessions')
                                .update({ status: 'hardware_uncertain', error_reason: `Hardware state uncertain: ${netioErr.message}` })
                                .eq('id', sessionId);

                            await supabase.from('arcade_table_configs')
                                .update({ lock_state: 'error_locked' })
                                .eq('table_id', table);

                            await supabase.from('arcade_events').insert({
                                table_id: table,
                                session_id: sessionId,
                                event_type: 'switch_error',
                                payload: { error: netioErr.message, state: 'uncertain', actionTaken: 'error_locked' }
                            });

                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({ 
                                    error: 'Hardware state uncertain: unable to confirm relay status. Table has been locked for operator inspection.',
                                    code: 'HARDWARE_UNCERTAIN',
                                    details: netioErr.message 
                                })
                            };
                        }
                    }

                    // Success: Update session to active and calculate expires_at
                    const activatedAt = new Date().toISOString();
                    const expiresAt = new Date(Date.now() + (durationMinutes * 60 * 1000)).toISOString();

                    const { error: updErr } = await supabase.from('arcade_sessions').update({
                        status: 'active',
                        activated_at: activatedAt,
                        expires_at: expiresAt
                    }).eq('id', sessionId);
                    if (updErr) console.error('[SUPABASE ERROR] session activate update failed:', updErr.message);

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
                    cleanExpiredMemorySessions();

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
                    if (currentSession && (currentSession.expiresAt > Date.now() || currentSession.status === 'requested' || currentSession.status === 'hardware_uncertain')) {
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

                    memoryDb.sessions.set(table, {
                        id: fallbackSessionId,
                        tableId: table,
                        status: 'requested',
                        authSource: policy.authSource,
                        clientToken,
                        requestedAt
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
                        let isRelayOn = null;
                        try {
                            isRelayOn = await netio.isOutputActive(targetOutputId);
                        } catch (probeErr) {
                            // ignore probe error
                        }

                        if (isRelayOn === true) {
                            const expiresAtMs = Date.now() + (durationMinutes * 60 * 1000);
                            const expiresAtIso = new Date(expiresAtMs).toISOString();

                            memoryDb.sessions.set(table, {
                                id: fallbackSessionId,
                                tableId: table,
                                status: 'active',
                                clientToken,
                                durationMinutes,
                                startedAt: Date.now(),
                                expiresAt: expiresAtMs
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
                                    reconciled: true
                                })
                            };
                        } else if (isRelayOn === false) {
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
                            // Uncertain: keep lock in memory
                            memoryDb.sessions.set(table, {
                                id: fallbackSessionId,
                                tableId: table,
                                status: 'hardware_uncertain',
                                clientToken,
                                requestedAt
                            });
                            if (cfg) cfg.lock_state = 'error_locked';

                            return {
                                statusCode: 502,
                                headers: CORS_HEADERS,
                                body: JSON.stringify({ 
                                    error: 'Hardware state uncertain: unable to confirm relay status. Table has been locked for operator inspection.',
                                    code: 'HARDWARE_UNCERTAIN',
                                    details: netioErr.message 
                                })
                            };
                        }
                    }

                    const expiresAtMs = Date.now() + (durationMinutes * 60 * 1000);
                    const expiresAtIso = new Date(expiresAtMs).toISOString();

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

                const outputId = cfg?.switch_output_id || 1;
                let commandResult;
                try {
                    commandResult = await netio.emergencyStop(outputId);
                } catch (netErr) {
                    return {
                        statusCode: 502,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ error: 'Failed to cut relay power on hardware', details: netErr.message })
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
    memoryDb.tableConfigs.set('demo-pulse-01', { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true });
    memoryDb.tableConfigs.set('demo-arcade-02', { table_id: 'demo-arcade-02', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false });
    memoryDb.tableConfigs.set('demo-locked-03', { table_id: 'demo-locked-03', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, is_free_play_allowed: false });
    memoryDb.tableConfigs.set('subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false });
    memoryDb.tableConfigs.set('subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true });
};
