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

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { NetioAdapter } = require('./utils/netio-adapter.js');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Session-Token, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

const ALLOWED_DURATIONS = [5, 10, 20];
const ALLOWED_OUTLETS = [1, 2, 3];

function getAdminSecret() {
    return process.env.ADMIN_TOKEN || process.env.ARCADE_ADMIN_KEY || null;
}

function getPilotTableId() {
    return process.env.PILOT_TABLE_ID || null;
}

const {
    PRICE_CATALOG,
    memoryDb,
    saveMemorySessions,
    loadMemorySessions,
    resetMemoryDb,
    checkIsTestMode,
    getSupabase,
    reconcileTableState,
    activateSessionCore,
    getOrderStatus,
    _setSupabaseClient: _setCoreSupabaseClient
} = require('./utils/arcade-core');

let supabase = getSupabase();


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

            const orderId = (event.queryStringParameters?.orderId || '').trim();
            const clientToken = (event.queryStringParameters?.clientToken || '').trim();
            let orderData = null;
            if (orderId) {
                orderData = await getOrderStatus({ tableId, orderId, clientToken });
            }

            // Check if table is currently held during checkout:
            const activeHoldOrderId = memoryDb.holds.get(tableId);
            if (tableState === 'available' && activeHoldOrderId) {
                const heldOrder = memoryDb.orders.get(activeHoldOrderId);
                if (heldOrder && heldOrder.status === 'pending_payment' && heldOrder.holdExpiresAt > Date.now()) {
                    if (clientToken && heldOrder.clientToken === clientToken) {
                        tableState = 'held_by_client';
                    } else {
                        tableState = 'pending_payment';
                    }
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
                    packages: ALLOWED_DURATIONS,
                    isTestMode: isTestMode,
                    allow30sTest: isTestMode,
                    order: orderData || undefined
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
                const rawMinutes = Number(body.durationMinutes);
                const rawSeconds = Number(body.durationSeconds);
                const is30SecTest = body.is30sTest === true || rawSeconds === 30 || rawMinutes === 0.5;

                let durationMinutes;
                let durationSeconds;

                if (is30SecTest) {
                    if (!isTestMode) {
                        return {
                            statusCode: 403,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({ 
                                error: '30-second test activation is strictly forbidden in production mode.',
                                code: 'TEST_MODE_REQUIRED'
                            })
                        };
                    }
                    durationMinutes = 0.5;
                    durationSeconds = 30;
                } else if (ALLOWED_DURATIONS.includes(rawMinutes)) {
                    durationMinutes = rawMinutes;
                    durationSeconds = durationMinutes * 60;
                } else {
                    return {
                        statusCode: 400,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({ 
                            error: `Invalid 'durationMinutes'. Allowed values: ${ALLOWED_DURATIONS.join(', ')}`,
                            allowedDurations: ALLOWED_DURATIONS 
                        })
                    };
                }

                const clientToken = (body.clientToken || `tok-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`).trim();

                let cfg = null;
                if (supabase) {
                    const { data: c } = await supabase
                        .from('arcade_table_configs')
                        .select('*')
                        .eq('table_id', table)
                        .maybeSingle();
                    cfg = c;
                } else {
                    cfg = getTableConfig(table, isTestMode);
                }

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

                const actResult = await activateSessionCore({
                    table,
                    durationMinutes,
                    durationSeconds,
                    is30SecTest,
                    clientToken,
                    authSource: policy.authSource,
                    isTestMode
                });

                return {
                    statusCode: actResult.statusCode,
                    headers: actResult.headers || CORS_HEADERS,
                    body: typeof actResult.body === 'string' ? actResult.body : JSON.stringify(actResult.body)
                };
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
                    if (cutError.code === 'CUTOFF_REJECTED') {
                        return {
                            statusCode: 409,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({
                                error: 'Katkaisukäsky hylättiin. Virran katkeamista ei ole vahvistettu.',
                                code: 'CUTOFF_REJECTED',
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
                    saveMemorySessions();
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
                    if (netErr.code === 'CUTOFF_REJECTED') {
                        return {
                            statusCode: 409,
                            headers: CORS_HEADERS,
                            body: JSON.stringify({
                                error: 'Katkaisukäsky hylättiin. Virran katkeamista ei ole vahvistettu.',
                                code: 'CUTOFF_REJECTED',
                                details: netErr.message
                            })
                        };
                    }
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
exports._resetMemoryDb = resetMemoryDb;
exports._reconcileTableState = reconcileTableState;
exports._setSupabaseClient = function (client) {
    supabase = client;
    _setCoreSupabaseClient(client);
};
exports._getSupabaseClient = function () {
    return supabase;
};


