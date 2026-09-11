/**
 * ==============================================================================
 * SUBSOCCER ARCADE — Shared Core Engine (Arcade Core)
 * ==============================================================================
 * 
 * Provides unified, hardened session state management, table locking,
 * payment holds, and NETIO hardware relay dispatch.
 * 
 * Shared between:
 * - netlify/functions/arcade-session.js (Status, free play, 30s test, admin)
 * - netlify/functions/create-payment-intent.js (Server pricing, table hold)
 * - netlify/functions/stripe-webhook.js (Verified payment activation)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const NetioAdapter = require('./netio-adapter');

const PRICE_CATALOG = {
    5: { amountCents: 250, currency: 'eur', durationMinutes: 5, label: '5 min' },
    15: { amountCents: 500, currency: 'eur', durationMinutes: 15, label: '15 min' },
    30: { amountCents: 700, currency: 'eur', durationMinutes: 30, label: '30 min' }
};

const ALLOWED_DURATIONS = [5, 15, 30];
const ALLOWED_OUTLETS = [1, 2, 3];
const HOLD_DURATION_MS = 3 * 60 * 1000; // 3 minutes table hold during payment

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Session-Token, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        });
    } catch (e) {
        console.warn('[ARCADE-CORE] Supabase init warning:', e.message);
    }
}

// In-memory simulation fallback storage (used when in test mode or without Supabase credentials)
const memoryDb = {
    tableConfigs: new Map([
        ['demo-pulse-01', { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null }],
        ['demo-arcade-02', { table_id: 'demo-arcade-02', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null }],
        ['demo-locked-03', { table_id: 'demo-locked-03', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null }],
        ['subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null }],
        ['subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null }]
    ]),
    sessions: new Map(), // key: table_id -> active session object
    orders: new Map(),   // key: order_id -> order details & hold status
    holds: new Map(),    // key: table_id -> active order_id
    processedPaymentIntents: new Set(), // set of payment_intent.id to guarantee single execution
    events: [],
    _simulateDbErrorOnActivate: false,
    _simulateDispatchError: false,
    _mockNetioConfig: {}
};

const SESSIONS_PERSIST_FILE = path.join(__dirname, '../../../scratch/arcade-memory-sessions.json');

function saveMemorySessions() {
    if (process.env.VITEST) return;
    try {
        const obj = {
            sessions: {},
            orders: {},
            holds: {},
            processedPaymentIntents: Array.from(memoryDb.processedPaymentIntents)
        };
        for (const [k, v] of memoryDb.sessions.entries()) {
            obj.sessions[k] = v;
        }
        for (const [k, v] of memoryDb.orders.entries()) {
            obj.orders[k] = v;
        }
        for (const [k, v] of memoryDb.holds.entries()) {
            obj.holds[k] = v;
        }
        const dir = path.dirname(SESSIONS_PERSIST_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SESSIONS_PERSIST_FILE, JSON.stringify(obj), 'utf8');
    } catch (e) {}
}

function loadMemorySessions() {
    if (process.env.VITEST) return;
    try {
        if (fs.existsSync(SESSIONS_PERSIST_FILE)) {
            const content = fs.readFileSync(SESSIONS_PERSIST_FILE, 'utf8');
            const obj = JSON.parse(content);
            if (obj.sessions) {
                for (const [k, v] of Object.entries(obj.sessions)) {
                    memoryDb.sessions.set(k, v);
                }
            } else {
                for (const [k, v] of Object.entries(obj)) {
                    memoryDb.sessions.set(k, v);
                }
            }
            if (obj.orders) {
                for (const [k, v] of Object.entries(obj.orders)) {
                    memoryDb.orders.set(k, v);
                }
            }
            if (obj.holds) {
                for (const [k, v] of Object.entries(obj.holds)) {
                    memoryDb.holds.set(k, v);
                }
            }
            if (Array.isArray(obj.processedPaymentIntents)) {
                for (const id of obj.processedPaymentIntents) {
                    memoryDb.processedPaymentIntents.add(id);
                }
            }
        }
    } catch (e) {}
}

function checkIsTestMode() {
    if (process.env.ARCADE_ENV === 'production' || process.env.NODE_ENV === 'production') {
        return false;
    }
    if (process.env.ARCADE_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST) {
        return true;
    }
    return !supabase;
}

function getTableConfig(tableId, isTestMode) {
    if (memoryDb.tableConfigs.has(tableId)) {
        return memoryDb.tableConfigs.get(tableId);
    }
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

function getNetioAdapter(tableConfig, isTestMode) {
    const rawEndpoint = tableConfig?.device_endpoint || tableConfig?.switch_endpoint || process.env.NETIO_BASE_URL || process.env.NETIO_ENDPOINT || '';
    const username = tableConfig?.device_username || process.env.NETIO_USERNAME || process.env.NETIO_USER || 'admin';
    const password = tableConfig?.device_password || tableConfig?.switch_auth_secret || process.env.NETIO_PASSWORD || process.env.NETIO_PASS || '';

    if (!isTestMode && !rawEndpoint) {
        return null;
    }

    const mockConfig = (isTestMode && memoryDb._mockNetioConfig) || {};

    return new NetioAdapter({
        endpoint: rawEndpoint || (isTestMode ? 'simulated' : ''),
        username,
        password,
        isMock: isTestMode && !rawEndpoint,
        ...mockConfig
    });
}

/**
 * Reconcile table state and hardware watchdog status.
 * Releases table ONLY when:
 * 1. Play session expiration + 4000ms safety buffer has elapsed, AND
 * 2. NETIO physically confirms State === 0.
 * Also cleans up expired payment holds.
 */
async function reconcileTableState(tableId, tableConfig, netio, isTestMode) {
    const now = Date.now();

    // 1. Clean up expired payment holds
    const activeHoldOrderId = memoryDb.holds.get(tableId);
    if (activeHoldOrderId) {
        const order = memoryDb.orders.get(activeHoldOrderId);
        if (order && order.status === 'pending_payment' && now > order.holdExpiresAt) {
            order.status = 'hold_expired';
            memoryDb.holds.delete(tableId);
            saveMemorySessions();
        }
    }

    // 2. In-memory session reconciliation
    if (!supabase) {
        const session = memoryDb.sessions.get(tableId);
        if (!session) return;

        // Active session whose scheduled time + 4s has elapsed
        if (session.status === 'active' && session.expiresAt && now > (session.expiresAt + 4000)) {
            const targetOutputId = tableConfig?.switch_output_id || 1;
            let isOff = false;
            try {
                isOff = await netio.verifyConfirmedOff(targetOutputId);
            } catch (err) {
                console.warn('[RECONCILIATION] Hardware probe failed during session expiration:', err.message);
            }

            if (isOff) {
                memoryDb.sessions.delete(tableId);
                if (tableConfig && tableConfig.lock_state === 'error_locked') {
                    tableConfig.lock_state = 'available';
                }
                saveMemorySessions();
                memoryDb.events.push({
                    table_id: tableId,
                    session_id: session.id,
                    event_type: 'switch_confirmed_off',
                    payload: { reconciledAt: new Date().toISOString() },
                    created_at: new Date().toISOString()
                });
            } else {
                session.status = 'hardware_uncertain';
                if (tableConfig) tableConfig.lock_state = 'error_locked';
                saveMemorySessions();
            }
        }
        return;
    }

    // 3. Supabase session reconciliation
    try {
        const { data: expiredSessions } = await supabase
            .from('arcade_sessions')
            .select('*')
            .eq('table_id', tableId)
            .in('status', ['active', 'requested'])
            .order('created_at', { ascending: false });

        if (expiredSessions && expiredSessions.length > 0) {
            const currentSession = expiredSessions[0];
            const expiresAtMs = new Date(currentSession.expires_at).getTime();

            if (now > (expiresAtMs + 4000)) {
                const targetOutputId = tableConfig?.switch_output_id || 1;
                let isOff = false;
                try {
                    isOff = await netio.verifyConfirmedOff(targetOutputId);
                } catch (probeErr) {
                    console.warn('[RECONCILIATION] Supabase probe error:', probeErr.message);
                }

                if (isOff) {
                    await supabase
                        .from('arcade_sessions')
                        .update({ status: 'completed', confirmed_off_at: new Date().toISOString() })
                        .eq('id', currentSession.id);

                    await supabase
                        .from('arcade_table_configs')
                        .update({ lock_state: 'available' })
                        .eq('table_id', tableId);

                    await supabase.from('arcade_events').insert({
                        table_id: tableId,
                        session_id: currentSession.id,
                        event_type: 'switch_confirmed_off',
                        payload: { confirmedAt: new Date().toISOString() }
                    });
                } else {
                    await supabase
                        .from('arcade_sessions')
                        .update({ status: 'hardware_uncertain', error_reason: 'Relay not confirmed OFF after expiration buffer' })
                        .eq('id', currentSession.id);

                    await supabase
                        .from('arcade_table_configs')
                        .update({ lock_state: 'error_locked' })
                        .eq('table_id', tableId);
                }
            }
        }
    } catch (e) {
        console.warn('[RECONCILE ERROR]', e.message);
    }
}

/**
 * Creates an atomic table hold for the customer during checkout (3 min window).
 */
async function createPaymentHold({ tableId, durationMinutes, clientToken, isTestMode }) {
    loadMemorySessions();
    const cfg = getTableConfig(tableId, isTestMode);
    if (!cfg) {
        return { success: false, statusCode: 404, code: 'TABLE_NOT_FOUND', error: `Unknown table ID '${tableId}'` };
    }

    const netio = getNetioAdapter(cfg, isTestMode);
    await reconcileTableState(tableId, cfg, netio, isTestMode);

    if (!cfg.is_enabled || cfg.lock_state !== 'available') {
        return { 
            success: false, 
            statusCode: 423, 
            code: 'TABLE_LOCKED', 
            error: 'Table is currently disabled or locked for maintenance.',
            lockState: cfg.lock_state 
        };
    }

    const now = Date.now();

    // Check active play session
    const activeSession = memoryDb.sessions.get(tableId);
    if (activeSession && (
        activeSession.status === 'requested' || 
        activeSession.status === 'active' || 
        activeSession.status === 'cooldown' || 
        activeSession.status === 'hardware_uncertain' || 
        (activeSession.expiresAt && activeSession.expiresAt > now)
    )) {
        return {
            success: false,
            statusCode: 409,
            code: 'TABLE_BUSY',
            error: 'Table is currently in an active play session.',
            expiresAt: activeSession.expiresAt ? new Date(activeSession.expiresAt).toISOString() : null
        };
    }

    // Check existing hold
    const existingHoldOrderId = memoryDb.holds.get(tableId);
    if (existingHoldOrderId) {
        const existingOrder = memoryDb.orders.get(existingHoldOrderId);
        if (existingOrder && existingOrder.status === 'pending_payment' && existingOrder.holdExpiresAt > now) {
            if (clientToken && existingOrder.clientToken === clientToken) {
                return { success: true, order: existingOrder, isReplay: true };
            }
            return {
                success: false,
                statusCode: 409,
                code: 'TABLE_HELD',
                error: 'Pöytä on parhaillaan toisen pelaajan varattavana. Yritä hetken kuluttua uudelleen.',
                holdExpiresAt: new Date(existingOrder.holdExpiresAt).toISOString()
            };
        }
    }

    const pkg = PRICE_CATALOG[durationMinutes];
    if (!pkg) {
        return {
            success: false,
            statusCode: 400,
            code: 'INVALID_DURATION',
            error: `Invalid durationMinutes. Allowed values: ${ALLOWED_DURATIONS.join(', ')}`
        };
    }

    const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const holdExpiresAt = now + HOLD_DURATION_MS;

    const order = {
        orderId,
        tableId,
        durationMinutes,
        durationSeconds: durationMinutes * 60,
        amountCents: pkg.amountCents,
        currency: pkg.currency,
        clientToken: clientToken || `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'pending_payment',
        holdExpiresAt,
        createdAt: new Date(now).toISOString(),
        paymentIntentId: null,
        refundStatus: null,
        isClaimed: false,
        lastPaymentError: null
    };

    memoryDb.orders.set(orderId, order);
    memoryDb.holds.set(tableId, orderId);
    saveMemorySessions();

    return { success: true, order, isReplay: false };
}

/**
 * Releases a payment hold if still pending
 */
function releasePaymentHold({ tableId, orderId, reason }) {
    loadMemorySessions();
    const activeHoldId = memoryDb.holds.get(tableId);
    const order = memoryDb.orders.get(orderId);

    if (order && order.status === 'pending_payment') {
        order.status = 'hold_released';
        order.cancelReason = reason || 'released';
        if (activeHoldId === orderId) {
            memoryDb.holds.delete(tableId);
        }
        saveMemorySessions();
        return true;
    }
    return false;
}

/**
 * Core Activation Function:
 * Hardened, atomic hardware relay dispatch with dispatch guard,
 * pre-recorded immutable expires_at, strict OFF verification,
 * and hardware_uncertain failure locking.
 */
async function activateSessionCore({
    table,
    durationMinutes,
    durationSeconds,
    is30SecTest = false,
    clientToken,
    authSource = 'free_play',
    paymentIntentId = null,
    orderId = null,
    isTestMode = false,
    adminToken = null
}) {
    loadMemorySessions();
    const targetSeconds = durationSeconds != null ? durationSeconds : (durationMinutes * 60);
    const targetMinutes = durationMinutes != null ? durationMinutes : (targetSeconds / 60);

    // ─── SUPABASE FLOW ───
    if (supabase) {
        const { data: cfg } = await supabase
            .from('arcade_table_configs')
            .select('*')
            .eq('table_id', table)
            .maybeSingle();

        if (!cfg && !isTestMode) {
            return {
                statusCode: 404,
                headers: CORS_HEADERS,
                body: { error: `Unknown table ID '${table}'. Table is not registered in arcade fleet.`, code: 'TABLE_NOT_FOUND' }
            };
        }

        if (cfg && (!cfg.is_enabled || cfg.lock_state !== 'available')) {
            return {
                statusCode: 423,
                headers: CORS_HEADERS,
                body: {
                    error: 'Table is currently disabled or locked for maintenance.',
                    code: 'TABLE_LOCKED',
                    lockState: cfg.lock_state
                }
            };
        }

        const netio = getNetioAdapter(cfg, isTestMode);
        if (!netio && !isTestMode) {
            return {
                statusCode: 503,
                headers: CORS_HEADERS,
                body: {
                    error: `Hardware configuration missing for table '${table}': no device endpoint configured and no global NETIO_BASE_URL.`,
                    code: 'HARDWARE_CONFIG_MISSING'
                }
            };
        }

        let existingSession = null;
        if (clientToken) {
            const { data } = await supabase
                .from('arcade_sessions')
                .select('*')
                .eq('client_session_token', clientToken)
                .maybeSingle();
            existingSession = data;
        }
        if (!existingSession && paymentIntentId) {
            const { data } = await supabase
                .from('arcade_sessions')
                .select('*')
                .eq('payment_intent_id', paymentIntentId)
                .maybeSingle();
            existingSession = data;
        }

        if (existingSession) {
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: {
                    success: existingSession.status === 'active',
                    action: 'activate',
                    tableId: existingSession.table_id,
                    sessionId: existingSession.id,
                    status: existingSession.status,
                    expiresAt: existingSession.expires_at,
                    isIdempotentReplay: true
                }
            };
        }

        await reconcileTableState(table, cfg, netio, isTestMode);

        const delayMs = targetSeconds * 1000;
        const expiresAt = new Date(Date.now() + delayMs).toISOString();

        const { data: session, error: insertError } = await supabase
            .from('arcade_sessions')
            .insert({
                table_id: table,
                status: 'requested',
                auth_source: authSource,
                duration_seconds: targetSeconds,
                client_session_token: clientToken,
                payment_intent_id: paymentIntentId,
                order_id: orderId,
                requested_at: new Date().toISOString(),
                expires_at: expiresAt,
                hardware_dispatched_at: null
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23505' || insertError.message?.includes('duplicate key') || insertError.message?.includes('idx_single_active_arcade_session')) {
                return {
                    statusCode: 409,
                    headers: CORS_HEADERS,
                    body: {
                        error: 'Table is currently active with another session.',
                        code: 'SESSION_CONFLICT'
                    }
                };
            }
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: { error: 'Database session reservation failed', details: insertError.message }
            };
        }

        const sessionId = session.id;
        const targetOutputId = cfg?.switch_output_id || 1;

        await supabase.from('arcade_events').insert({
            table_id: table,
            session_id: sessionId,
            event_type: 'session_requested',
            payload: { durationMinutes: targetMinutes, clientToken, outputId: targetOutputId, paymentIntentId }
        }).catch(() => {});

        const dispatchTimestamp = new Date().toISOString();
        const { data: dispatchRows, error: dispatchErr } = await supabase
            .from('arcade_sessions')
            .update({ hardware_dispatched_at: dispatchTimestamp })
            .eq('id', sessionId)
            .eq('status', 'requested')
            .is('hardware_dispatched_at', null)
            .select('id');

        if (dispatchErr || !Array.isArray(dispatchRows) || dispatchRows.length !== 1) {
            const errReason = dispatchErr
                ? `Dispatch update error: ${dispatchErr.message}`
                : `Dispatch update targeted ${dispatchRows?.length ?? 0} rows (expected exactly 1)`;
            console.error('[DISPATCH GUARD] Hardware dispatch aborted:', errReason);

            await supabase.from('arcade_events').insert({
                table_id: table,
                session_id: sessionId,
                event_type: 'switch_error',
                payload: { error: errReason, phase: 'pre_dispatch_guard' }
            }).catch(() => {});

            if (dispatchErr) {
                await supabase.from('arcade_sessions')
                    .update({ status: 'failed', error_reason: errReason })
                    .eq('id', sessionId)
                    .catch(() => {});
            }

            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: {
                    error: 'Failed to record hardware dispatch state before execution. Relay activation aborted.',
                    code: 'DISPATCH_RECORDING_FAILED',
                    details: errReason
                }
            };
        }

        await supabase.from('arcade_events').insert({
            table_id: table,
            session_id: sessionId,
            event_type: 'switch_cmd_sent',
            payload: { outletId: targetOutputId, durationMinutes: targetMinutes }
        }).catch(() => {});

        let netioResult;
        try {
            netioResult = await netio.startTimedPlay(targetMinutes, targetOutputId, targetSeconds);
        } catch (netioErr) {
            let isRelayOff = false;
            try {
                isRelayOff = await netio.verifyConfirmedOff(targetOutputId);
            } catch (probeErr) {}

            if (isRelayOff) {
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
                    body: { error: 'Failed to activate hardware relay', details: netioErr.message }
                };
            } else {
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
                    body: {
                        error: 'Hardware state uncertain: unable to confirm relay watchdog lease. Table has been locked for operator inspection.',
                        code: 'HARDWARE_UNCERTAIN',
                        tableLocked: true,
                        expiresAt,
                        details: netioErr.message
                    }
                };
            }
        }

        const activatedAt = new Date().toISOString();
        const { error: updErr } = await supabase.from('arcade_sessions').update({
            status: 'active',
            activated_at: activatedAt
        }).eq('id', sessionId);

        if (updErr) {
            let cutConfirmedOff = false;
            let cutError = null;
            try {
                const cutResult = await netio.emergencyStop(targetOutputId);
                const confirmedState = cutResult?.response?.Outputs?.find(o => o.ID === targetOutputId)?.State ?? cutResult?.state;
                if (confirmedState === 0) {
                    const isOff = await netio.verifyConfirmedOff(targetOutputId);
                    if (isOff) cutConfirmedOff = true;
                }
            } catch (cutErr) {
                cutError = cutErr;
            }

            if (cutConfirmedOff) {
                await supabase.from('arcade_sessions').update({
                    status: 'failed',
                    error_reason: `DB update to active failed; emergency power cut confirmed OFF: ${updErr.message}`
                }).eq('id', sessionId).catch(() => {});

                return {
                    statusCode: 500,
                    headers: CORS_HEADERS,
                    body: {
                        error: 'Database update failed after hardware start. Table power was safely cut. Please retry.',
                        code: 'DB_UPDATE_FAILED',
                        details: updErr.message
                    }
                };
            } else {
                const reason = cutError?.code === 'CUTOFF_REJECTED'
                    ? 'DB update failed and emergency cut was rejected by device'
                    : `DB update failed and emergency cut unconfirmed (state not 0): ${cutError?.message || 'cut unverified'}`;

                await supabase.from('arcade_sessions').update({
                    status: 'hardware_uncertain',
                    error_reason: reason,
                    expires_at: expiresAt
                }).eq('id', sessionId).catch(() => {});

                await supabase.from('arcade_table_configs').update({
                    lock_state: 'error_locked'
                }).eq('table_id', table).catch(() => {});

                return {
                    statusCode: 502,
                    headers: CORS_HEADERS,
                    body: {
                        error: 'Hardware state uncertain: session state could not be saved and power cut could not be verified. Table has been locked for operator inspection.',
                        code: 'HARDWARE_UNCERTAIN',
                        tableLocked: true,
                        expiresAt,
                        details: cutError?.message || updErr.message
                    }
                };
            }
        }

        await supabase.from('arcade_events').insert({
            table_id: table,
            session_id: sessionId,
            event_type: 'switch_confirmed_on',
            payload: { hardware: netioResult, expiresAt, outputId: targetOutputId }
        }).catch(() => {});

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: {
                success: true,
                action: 'activate',
                tableId: table,
                sessionId,
                durationMinutes: targetMinutes,
                durationSeconds: targetSeconds,
                expiresAt,
                hardware: netioResult
            }
        };
    }

    // ─── IN-MEMORY FALLBACK ───
    const cfg = getTableConfig(table, isTestMode);
    if (!cfg) {
        return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: { error: `Unknown table ID '${table}'. Table is not registered in arcade fleet.`, code: 'TABLE_NOT_FOUND' }
        };
    }

    const netio = getNetioAdapter(cfg, isTestMode);
    if (!netio && !isTestMode) {
        return {
            statusCode: 503,
            headers: CORS_HEADERS,
            body: { error: `Hardware configuration missing for table '${table}'.`, code: 'HARDWARE_CONFIG_MISSING' }
        };
    }

    // Reconcile table before reservation
    await reconcileTableState(table, cfg, netio, isTestMode);

    if (!cfg.is_enabled || cfg.lock_state !== 'available') {
        return {
            statusCode: 423,
            headers: CORS_HEADERS,
            body: {
                error: 'Table is currently disabled or locked for maintenance.',
                code: 'TABLE_LOCKED',
                lockState: cfg.lock_state
            }
        };
    }

    // Idempotency check: Client token or payment intent already activated?
    for (const s of memoryDb.sessions.values()) {
        if ((clientToken && s.clientToken === clientToken) || (paymentIntentId && s.paymentIntentId === paymentIntentId)) {
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: {
                    success: s.status === 'active',
                    action: 'activate',
                    tableId: s.tableId,
                    sessionId: s.id,
                    status: s.status,
                    expiresAt: s.expiresAt ? new Date(s.expiresAt).toISOString() : null,
                    isIdempotentReplay: true
                }
            };
        }
    }

    const now = Date.now();
    const currentSession = memoryDb.sessions.get(table);
    if (currentSession && (
        currentSession.status === 'requested' || 
        currentSession.status === 'active' || 
        currentSession.status === 'cooldown' || 
        currentSession.status === 'hardware_uncertain' || 
        (currentSession.expiresAt && currentSession.expiresAt > now)
    )) {
        return {
            statusCode: 409,
            headers: CORS_HEADERS,
            body: {
                error: 'Table is currently active with another session.',
                code: 'SESSION_CONFLICT',
                expiresAt: currentSession.expiresAt ? new Date(currentSession.expiresAt).toISOString() : null
            }
        };
    }

    const sessionId = (supabase ? 'sess-' : 'mem-') + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const targetOutputId = cfg?.switch_output_id || 1;
    const delayMs = targetSeconds * 1000;
    const expiresAtMs = now + delayMs;
    const expiresAtIso = new Date(expiresAtMs).toISOString();
    const requestedAt = new Date(now).toISOString();

    // 1. Immutable pre-recording: Store session before dispatch
    const sessionObj = {
        id: sessionId,
        tableId: table,
        status: 'requested',
        authSource,
        clientToken,
        orderId,
        paymentIntentId,
        durationMinutes: targetMinutes,
        durationSeconds: targetSeconds,
        requestedAt,
        expiresAt: expiresAtMs,
        hardwareDispatchedAt: null,
        cmdSent: false
    };

    memoryDb.sessions.set(table, sessionObj);
    saveMemorySessions();

    memoryDb.events.push({
        table_id: table,
        session_id: sessionId,
        event_type: 'session_requested',
        payload: { durationMinutes: targetMinutes, clientToken, outputId: targetOutputId, paymentIntentId },
        created_at: requestedAt
    });

    // Pre-dispatch guard simulation
    if (memoryDb._simulateDispatchError) {
        memoryDb.events.push({
            table_id: table,
            session_id: sessionId,
            event_type: 'switch_error',
            payload: { error: 'Simulated dispatch record failure', phase: 'pre_dispatch_guard' },
            created_at: new Date().toISOString()
        });
        memoryDb.sessions.delete(table);
        saveMemorySessions();
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: {
                error: 'Failed to record hardware dispatch state before execution. Relay activation aborted.',
                code: 'DISPATCH_RECORDING_FAILED',
                details: 'Simulated dispatch update error'
            }
        };
    }

    // Atomic dispatch mark
    const memSession = memoryDb.sessions.get(table);
    if (!memSession || memSession.id !== sessionId || memSession.status !== 'requested' || memSession.hardwareDispatchedAt) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: {
                error: 'Failed to record hardware dispatch state before execution. Relay activation aborted.',
                code: 'DISPATCH_RECORDING_FAILED',
                details: 'Session state invalidated before dispatch'
            }
        };
    }
    memSession.hardwareDispatchedAt = new Date().toISOString();
    memSession.cmdSent = true;

    memoryDb.events.push({
        table_id: table,
        session_id: sessionId,
        event_type: 'switch_cmd_sent',
        payload: { outletId: targetOutputId, durationMinutes: targetMinutes },
        created_at: new Date().toISOString()
    });

    // 2. Send command to NETIO hardware
    let netioResult;
    try {
        netioResult = await netio.startTimedPlay(targetMinutes, targetOutputId, targetSeconds);
    } catch (netioErr) {
        let isRelayOff = false;
        try {
            isRelayOff = await netio.verifyConfirmedOff(targetOutputId);
        } catch (probeErr) {}

        if (isRelayOff) {
            memoryDb.sessions.delete(table);
            saveMemorySessions();
            memoryDb.events.push({
                table_id: table,
                session_id: sessionId,
                event_type: 'switch_error',
                payload: { error: netioErr.message, confirmedOff: true },
                created_at: new Date().toISOString()
            });
            return {
                statusCode: 502,
                headers: CORS_HEADERS,
                body: { error: 'Failed to activate hardware relay', details: netioErr.message }
            };
        } else {
            // Uncertain: retain lock, do NOT assume lease or release table
            memSession.status = 'hardware_uncertain';
            if (cfg) cfg.lock_state = 'error_locked';
            saveMemorySessions();

            memoryDb.events.push({
                table_id: table,
                session_id: sessionId,
                event_type: 'switch_error',
                payload: { error: netioErr.message, state: 'uncertain', actionTaken: 'error_locked', expiresAt: expiresAtIso },
                created_at: new Date().toISOString()
            });

            return {
                statusCode: 502,
                headers: CORS_HEADERS,
                body: {
                    error: 'Hardware state uncertain: unable to confirm relay watchdog lease. Table has been locked for operator inspection.',
                    code: 'HARDWARE_UNCERTAIN',
                    tableLocked: true,
                    expiresAt: expiresAtIso,
                    details: netioErr.message
                }
            };
        }
    }

    // 3. Post-dispatch state transition to active
    if (memoryDb._simulateDbErrorOnActivate) {
        let cutConfirmedOff = false;
        let cutError = null;
        try {
            const cutResult = await netio.emergencyStop(targetOutputId);
            const confirmedState = cutResult?.response?.Outputs?.find(o => o.ID === targetOutputId)?.State ?? cutResult?.state;
            if (confirmedState === 0) {
                const isOff = await netio.verifyConfirmedOff(targetOutputId);
                if (isOff) cutConfirmedOff = true;
            }
        } catch (cutErr) {
            cutError = cutErr;
        }

        if (cutConfirmedOff) {
            memoryDb.sessions.delete(table);
            saveMemorySessions();
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: {
                    error: 'Database update failed after hardware start. Table power was safely cut. Please retry.',
                    code: 'DB_UPDATE_FAILED',
                    details: 'Simulated database update failure'
                }
            };
        } else {
            const reason = cutError?.code === 'CUTOFF_REJECTED'
                ? 'DB update failed and emergency cut was rejected by device'
                : `DB update failed and emergency cut unconfirmed (state not 0): ${cutError?.message || 'cut unverified'}`;

            memSession.status = 'hardware_uncertain';
            memSession.errorReason = reason;
            if (cfg) cfg.lock_state = 'error_locked';
            saveMemorySessions();

            return {
                statusCode: 502,
                headers: CORS_HEADERS,
                body: {
                    error: 'Hardware state uncertain: session state could not be saved and power cut could not be verified. Table has been locked for operator inspection.',
                    code: 'HARDWARE_UNCERTAIN',
                    tableLocked: true,
                    expiresAt: expiresAtIso,
                    details: cutError?.message || 'DB update failure'
                }
            };
        }
    }

    // Successfully transitioned to active
    memSession.status = 'active';
    memSession.activatedAt = new Date().toISOString();
    saveMemorySessions();

    memoryDb.events.push({
        table_id: table,
        session_id: sessionId,
        event_type: 'switch_confirmed_on',
        payload: { hardware: netioResult, expiresAt: expiresAtIso, outputId: targetOutputId },
        created_at: new Date().toISOString()
    });

    return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: {
            success: true,
            action: 'activate',
            tableId: table,
            sessionId,
            durationMinutes: targetMinutes,
            durationSeconds: targetSeconds,
            expiresAt: expiresAtIso,
            hardware: netioResult
        }
    };
}

/**
 * Claims a payment hold atomically and triggers activation.
 * Handles late payments, payment mismatches, out-of-order webhooks,
 * and maintains physical hardware locking separated from financial refunds.
 */
async function claimAndActivateOrder({ orderId, paymentIntent, isTestMode }) {
    loadMemorySessions();
    if (!paymentIntent || !paymentIntent.id) {
        return { success: false, statusCode: 400, code: 'INVALID_PAYMENT_INTENT', error: 'Missing PaymentIntent data' };
    }

    // 1. Idempotency Check: Has this payment intent already been processed?
    if (memoryDb.processedPaymentIntents.has(paymentIntent.id)) {
        const order = memoryDb.orders.get(orderId);
        return {
            success: true,
            isIdempotentReplay: true,
            orderId,
            status: order?.status || 'active',
            sessionId: order?.sessionId || null
        };
    }

    // 2. Order Lookup
    const order = memoryDb.orders.get(orderId);
    if (!order) {
        // Unknown order: Flag for review/refund
        return {
            success: false,
            statusCode: 404,
            code: 'ORDER_NOT_FOUND',
            refundRequired: true,
            error: `No stored order found matching ID '${orderId}'. Payment must be reviewed or refunded.`
        };
    }

    // 3. Strict Order & PaymentIntent Verification
    // A. Test Mode validation: livemode must be false
    if (paymentIntent.livemode === true) {
        order.status = 'livemode_rejected';
        order.refundStatus = 'refund_required';
        saveMemorySessions();
        return {
            success: false,
            statusCode: 400,
            code: 'LIVEMODE_REJECTED',
            refundRequired: true,
            error: 'Live mode payments are forbidden in this development/test environment.'
        };
    }

    // B. Amount & Currency verification
    if (paymentIntent.amount !== order.amountCents || paymentIntent.currency.toLowerCase() !== order.currency.toLowerCase()) {
        order.status = 'amount_mismatch';
        order.refundStatus = 'refund_required';
        saveMemorySessions();
        return {
            success: false,
            statusCode: 400,
            code: 'AMOUNT_MISMATCH',
            refundRequired: true,
            error: `Payment amount (${paymentIntent.amount} ${paymentIntent.currency}) does not match order catalog (${order.amountCents} ${order.currency}).`
        };
    }

    // C. Table & Duration metadata verification
    if (paymentIntent.metadata?.table_id && paymentIntent.metadata.table_id !== order.tableId) {
        order.status = 'table_mismatch';
        order.refundStatus = 'refund_required';
        saveMemorySessions();
        return {
            success: false,
            statusCode: 400,
            code: 'TABLE_MISMATCH',
            refundRequired: true,
            error: `Payment table metadata (${paymentIntent.metadata.table_id}) does not match order (${order.tableId}).`
        };
    }

    // 4. Hold Expiration and Conflict Check (Requirement 6)
    const now = Date.now();
    const currentTableHold = memoryDb.holds.get(order.tableId);

    // Is hold already claimed concurrently?
    if (order.isClaimed) {
        return {
            success: true,
            isIdempotentReplay: true,
            orderId,
            status: order.status,
            sessionId: order.sessionId
        };
    }

    // Has hold expired or been replaced?
    if (now > order.holdExpiresAt || currentTableHold !== order.orderId) {
        order.status = 'late_payment_conflict';
        order.refundStatus = 'refund_required';
        saveMemorySessions();
        return {
            success: false,
            statusCode: 409,
            code: 'LATE_PAYMENT_CONFLICT',
            refundRequired: true,
            error: 'Payment was confirmed after the 3-minute hold expired or table was reassigned. Payment is marked for refund.'
        };
    }

    // 5. ATOMIC CLAIM TRANSITION
    // Synchronously claim the hold in the event loop before any async points
    order.isClaimed = true;
    order.status = 'activating';
    order.paymentIntentId = paymentIntent.id;
    memoryDb.processedPaymentIntents.add(paymentIntent.id);
    saveMemorySessions();

    // 6. Invoke Shared Safe Activation
    const activationResult = await activateSessionCore({
        table: order.tableId,
        durationMinutes: order.durationMinutes,
        durationSeconds: order.durationSeconds,
        is30SecTest: false,
        clientToken: order.clientToken,
        authSource: 'stripe',
        paymentIntentId: paymentIntent.id,
        orderId: order.orderId,
        isTestMode
    });

    if (activationResult.statusCode === 200) {
        order.status = 'active';
        order.sessionId = activationResult.body.sessionId;
        order.expiresAt = activationResult.body.expiresAt;
        order.activatedAt = new Date().toISOString();
        memoryDb.holds.delete(order.tableId); // Release the pre-payment hold since play is now active
        saveMemorySessions();

        return {
            success: true,
            orderId: order.orderId,
            sessionId: order.sessionId,
            expiresAt: order.expiresAt,
            hardware: activationResult.body.hardware
        };
    } else {
        // Hardware or activation failed
        // Requirement 4: Separate physical lock from financial refund
        order.status = 'activation_failed';
        order.refundStatus = 'refund_required';
        order.errorReason = activationResult.body.error;
        saveMemorySessions();

        return {
            success: false,
            statusCode: activationResult.statusCode,
            code: activationResult.body.code || 'ACTIVATION_FAILED',
            tableLocked: activationResult.body.tableLocked || false,
            refundRequired: true,
            error: activationResult.body.error
        };
    }
}

/**
 * Returns clean customer-facing order status
 */
function getOrderStatus({ tableId, orderId, clientToken }) {
    loadMemorySessions();
    const order = memoryDb.orders.get(orderId);
    if (!order) return null;

    if (tableId && order.tableId !== tableId) return null;
    if (clientToken && order.clientToken !== clientToken) return null;

    let timeRemainingSecs = 0;
    if (order.status === 'active' && order.expiresAt) {
        const expMs = new Date(order.expiresAt).getTime();
        timeRemainingSecs = Math.max(0, Math.round((expMs - Date.now()) / 1000));
    }

    return {
        orderId: order.orderId,
        tableId: order.tableId,
        durationMinutes: order.durationMinutes,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        isActivated: order.status === 'active',
        timeRemainingSecs,
        expiresAt: order.expiresAt,
        holdExpiresAt: order.holdExpiresAt ? new Date(order.holdExpiresAt).toISOString() : null,
        refundStatus: order.refundStatus,
        errorReason: order.errorReason || order.lastPaymentError
    };
}

function resetMemoryDb() {
    memoryDb.sessions.clear();
    memoryDb.orders.clear();
    memoryDb.holds.clear();
    memoryDb.processedPaymentIntents.clear();
    try {
        if (fs.existsSync(SESSIONS_PERSIST_FILE)) {
            fs.unlinkSync(SESSIONS_PERSIST_FILE);
        }
    } catch (e) {}
    memoryDb.events.length = 0;
    memoryDb._simulateDbErrorOnActivate = false;
    memoryDb._simulateDispatchError = false;
    memoryDb.tableConfigs.set('demo-pulse-01', { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null });
    memoryDb.tableConfigs.set('demo-arcade-02', { table_id: 'demo-arcade-02', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('demo-locked-03', { table_id: 'demo-locked-03', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true, device_endpoint: null });
    memoryDb._mockNetioConfig = {};
}

module.exports = {
    PRICE_CATALOG,
    ALLOWED_DURATIONS,
    ALLOWED_OUTLETS,
    HOLD_DURATION_MS,
    CORS_HEADERS,
    memoryDb,
    _memoryDb: memoryDb,
    saveMemorySessions,
    loadMemorySessions,
    resetMemoryDb,
    _resetMemoryDb: resetMemoryDb,
    checkIsTestMode,
    getTableConfig,
    getNetioAdapter,
    reconcileTableState,
    createPaymentHold,
    releasePaymentHold,
    activateSessionCore,
    claimAndActivateOrder,
    getOrderStatus,
    _setSupabaseClient: (client) => { supabase = client; },
    _getSupabaseClient: () => supabase
};

