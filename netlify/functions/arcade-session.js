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
const ADMIN_SECRET = process.env.ADMIN_TOKEN || process.env.ARCADE_ADMIN_KEY || 'subsoccer-arcade-admin-2026';

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

// In-memory fallback simulation storage (used when Supabase env is not configured or in tests)
const memoryDb = {
    tableConfigs: new Map([
        ['demo-pulse-01', { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1 }],
        ['demo-arcade-02', { table_id: 'demo-arcade-02', is_enabled: true, lock_state: 'available', switch_output_id: 1 }],
        ['demo-locked-03', { table_id: 'demo-locked-03', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1 }]
    ]),
    sessions: new Map(), // key: table_id -> active session object
    events: []
};

// Clean up expired in-memory sessions
function cleanExpiredMemorySessions() {
    const now = Date.now();
    for (const [tableId, s] of memoryDb.sessions.entries()) {
        if (s.expiresAt && now > (s.expiresAt + 4000)) { // 4s cooldown buffer
            memoryDb.sessions.delete(tableId);
        }
    }
}

/**
 * Check Admin Authorization for protected endpoints
 */
function isAuthorizedAdmin(event, body) {
    const headerToken = event.headers['x-admin-token'] || 
                        (event.headers['authorization'] ? event.headers['authorization'].replace(/^Bearer\s+/i, '') : '');
    const bodyToken = body?.adminToken;
    const candidate = (headerToken || bodyToken || '').trim();

    return candidate.length > 0 && candidate === ADMIN_SECRET;
}

exports.handler = async function (event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    try {
        const netio = new NetioAdapter({
            endpoint: process.env.NETIO_ENDPOINT || 'simulated',
            username: process.env.NETIO_USER || 'admin',
            password: process.env.NETIO_PASS || '',
            isMock: !process.env.NETIO_ENDPOINT || process.env.NETIO_ENDPOINT === 'simulated'
        });

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

            cleanExpiredMemorySessions();

            let tableState = 'available';
            let timeRemainingSecs = 0;
            let tableConfig = null;

            if (supabase) {
                const { data: cfg } = await supabase
                    .from('arcade_table_configs')
                    .select('*')
                    .eq('table_id', tableId)
                    .maybeSingle();
                tableConfig = cfg;

                const { data: activeSession } = await supabase
                    .from('arcade_sessions')
                    .select('*')
                    .eq('table_id', tableId)
                    .in('status', ['requested', 'active', 'cooldown'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (tableConfig && (!tableConfig.is_enabled || tableConfig.lock_state !== 'available')) {
                    tableState = tableConfig.lock_state || 'locked';
                } else if (activeSession) {
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
                // In-memory fallback
                const cfg = memoryDb.tableConfigs.get(tableId);
                tableConfig = cfg;
                const existingSession = memoryDb.sessions.get(tableId);

                if (cfg && (!cfg.is_enabled || cfg.lock_state !== 'available')) {
                    tableState = cfg.lock_state || 'locked';
                } else if (existingSession && existingSession.expiresAt > Date.now()) {
                    tableState = 'active';
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
                    // Check table config if registered
                    const { data: cfg } = await supabase
                        .from('arcade_table_configs')
                        .select('*')
                        .eq('table_id', table)
                        .maybeSingle();

                    if (cfg && (!cfg.is_enabled || cfg.lock_state !== 'available')) {
                        return {
                            statusCode: 423,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ error: 'Table is currently disabled for maintenance.' })
                        };
                    }

                    // Insert session with status 'requested'.
                    // idx_single_active_arcade_session unique index prevents concurrent active/requested sessions!
                    const { data: session, error: insertError } = await supabase
                        .from('arcade_sessions')
                        .insert({
                            table_id: table,
                            status: 'requested',
                            auth_source: body.authSource || 'free_play',
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
                        throw insertError;
                    }

                    sessionId = session.id;

                    // Audit Event: session_requested
                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        session_id: sessionId,
                        event_type: 'session_requested',
                        payload: { durationMinutes, clientToken }
                    }).catch(err => console.warn('[AUDIT ERROR] session_requested:', err.message));

                    // Audit Event: switch_cmd_sent
                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        session_id: sessionId,
                        event_type: 'switch_cmd_sent',
                        payload: { outletId: 1, durationMinutes }
                    }).catch(err => console.warn('[AUDIT ERROR] switch_cmd_sent:', err.message));

                    // Send command to NETIO hardware
                    let netioResult;
                    try {
                        netioResult = await netio.startTimedPlay(durationMinutes, 1);
                    } catch (netioErr) {
                        // Hardware error: mark session failed and write audit event
                        await supabase.from('arcade_sessions')
                            .update({ status: 'failed', error_reason: netioErr.message })
                            .eq('id', sessionId);

                        await supabase.from('arcade_events').insert({
                            table_id: table,
                            session_id: sessionId,
                            event_type: 'switch_error',
                            payload: { error: netioErr.message }
                        }).catch(() => null);

                        return {
                            statusCode: 502,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ error: 'Failed to activate hardware relay', details: netioErr.message })
                        };
                    }

                    // Success: Update session to active and calculate expires_at
                    const activatedAt = new Date().toISOString();
                    const expiresAt = new Date(Date.now() + (durationMinutes * 60 * 1000)).toISOString();

                    await supabase.from('arcade_sessions').update({
                        status: 'active',
                        activated_at: activatedAt,
                        expires_at: expiresAt
                    }).eq('id', sessionId);

                    // Audit Event: switch_confirmed_on
                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        session_id: sessionId,
                        event_type: 'switch_confirmed_on',
                        payload: { hardware: netioResult, expiresAt }
                    }).catch(() => null);

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
                    // ─── IN-MEMORY FALLBACK (Exact same constraint model) ───
                    cleanExpiredMemorySessions();
                    const currentSession = memoryDb.sessions.get(table);
                    if (currentSession && (currentSession.expiresAt > Date.now() || currentSession.status === 'requested')) {
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
                    // Set status requested first
                    memoryDb.sessions.set(table, {
                        id: fallbackSessionId,
                        tableId: table,
                        status: 'requested',
                        clientToken,
                        requestedAt
                    });

                    // Audit Event: session_requested
                    memoryDb.events.push({
                        table_id: table,
                        session_id: fallbackSessionId,
                        event_type: 'session_requested',
                        payload: { durationMinutes, clientToken },
                        created_at: requestedAt
                    });

                    // Audit Event: switch_cmd_sent
                    memoryDb.events.push({
                        table_id: table,
                        session_id: fallbackSessionId,
                        event_type: 'switch_cmd_sent',
                        payload: { outletId: 1, durationMinutes },
                        created_at: new Date().toISOString()
                    });

                    // Command NETIO
                    let netioResult;
                    try {
                        netioResult = await netio.startTimedPlay(durationMinutes, 1);
                    } catch (netioErr) {
                        memoryDb.sessions.delete(table);
                        memoryDb.events.push({
                            table_id: table,
                            session_id: fallbackSessionId,
                            event_type: 'switch_error',
                            payload: { error: netioErr.message },
                            created_at: new Date().toISOString()
                        });
                        return {
                            statusCode: 502,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ error: 'Failed to activate hardware relay', details: netioErr.message })
                        };
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
                        payload: { hardware: netioResult, expiresAt: expiresAtIso },
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

                const commandResult = await netio.emergencyStop(1);

                if (supabase) {
                    await supabase.from('arcade_sessions')
                        .update({ status: 'force_stopped', confirmed_off_at: new Date().toISOString() })
                        .eq('table_id', table)
                        .in('status', ['requested', 'active', 'cooldown']);

                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        event_type: 'force_stopped',
                        payload: { hardware: commandResult }
                    }).catch(() => null);
                } else {
                    memoryDb.sessions.delete(table);
                    memoryDb.events.push({
                        table_id: table,
                        event_type: 'force_stopped',
                        payload: { hardware: commandResult },
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

                const targetState = Boolean(body.state);
                const commandResult = await netio.setOutletState(outletId, targetState);

                if (supabase) {
                    await supabase.from('arcade_events').insert({
                        table_id: table,
                        event_type: targetState ? 'switch_confirmed_on' : 'switch_confirmed_off',
                        payload: { outletId, state: targetState, hardware: commandResult }
                    }).catch(() => null);
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
};
