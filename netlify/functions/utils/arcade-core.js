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
const crypto = require('crypto');
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

let stripeClient = null;

function getStripeClient() {
    if (stripeClient) return stripeClient;
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
        return require('stripe')(key);
    }
    return null;
}

function _setStripeClient(client) {
    stripeClient = client;
}

let supabase = null;

function getSupabase() {
    if (supabase) return supabase;
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_TEST_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
    if (url && key) {
        try {
            supabase = createClient(url, key, {
                auth: { persistSession: false }
            });
            return supabase;
        } catch (e) {
            console.warn('[ARCADE-CORE] Supabase init warning:', e.message);
        }
    }
    return null;
}

// Initial attempt to bind Supabase client
getSupabase();

// In-memory simulation fallback storage (used when in test mode or without Supabase credentials)
const memoryDb = {
    tableConfigs: new Map([
        ['demo-pulse-01', { table_id: 'demo-pulse-01', venue_id: 'venue-demo-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: true, device_endpoint: null }],
        ['demo-arcade-02', { table_id: 'demo-arcade-02', venue_id: 'venue-demo-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: false, device_endpoint: null }],
        ['demo-locked-03', { table_id: 'demo-locked-03', venue_id: 'venue-demo-01', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: false, device_endpoint: null }],
        ['subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', venue_id: 'venue-tripla', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: false, device_endpoint: null }],
        ['subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', venue_id: 'venue-freeplay-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: true, device_endpoint: null }]
    ]),
    venues: new Map([
        ['venue-demo-01', { venue_id: 'venue-demo-01', name: 'Mall of Tripla Demo Venue', pin_hash: null, pin_version: 1, venue_failed_attempts: 0, venue_locked_until: null }],
        ['venue-tripla', { venue_id: 'venue-tripla', name: 'Mall of Tripla Subsoccer Lounge', pin_hash: null, pin_version: 1, venue_failed_attempts: 0, venue_locked_until: null }],
        ['venue-freeplay-01', { venue_id: 'venue-freeplay-01', name: 'Freeplay Venue', pin_hash: null, pin_version: 1, venue_failed_attempts: 0, venue_locked_until: null }]
    ]),
    pinAttempts: new Map(), // key: `${venue_id}:${caller_hash}` -> { failed_attempts, locked_until, last_attempt_at }
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
    return process.env.ARCADE_ENV === 'test' || 
           process.env.NODE_ENV === 'test' || 
           process.env.ARCADE_MOCK_MODE === 'true' || 
           Boolean(process.env.VITEST);
}

function getTableConfig(tableId, isTestMode) {
    if (memoryDb.tableConfigs.has(tableId)) {
        return memoryDb.tableConfigs.get(tableId);
    }
    if (isTestMode && tableId && tableId.startsWith('test-')) {
        const dynamicCfg = {
            table_id: tableId,
            venue_id: 'venue-demo-01',
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 1,
            display_output_id: 2,
            lights_output_id: 3,
            display_mode: 'auto',
            lights_mode: 'auto',
            display_manual_until: null,
            lights_manual_until: null,
            display_last_heartbeat_at: null,
            is_free_play_allowed: true,
            device_endpoint: null
        };
        memoryDb.tableConfigs.set(tableId, dynamicCfg);
        return dynamicCfg;
    }
    return null;
}

async function getTableConfigAsync(tableId, isTestMode) {
    const sb = getSupabase();
    if (sb) {
        try {
            const { data: dbCfg } = await sb
                .from('arcade_table_configs')
                .select('*')
                .eq('table_id', tableId)
                .maybeSingle();
            if (dbCfg) return dbCfg;
        } catch (e) {
            console.warn('[ARCADE-CORE] Failed to load table config from Supabase:', e.message);
        }
    }
    return getTableConfig(tableId, isTestMode);
}

async function getVenueAsync(venueId, isTestMode) {
    const sb = getSupabase();
    if (sb) {
        try {
            const { data: venue } = await sb
                .from('arcade_venues')
                .select('*')
                .eq('venue_id', venueId)
                .maybeSingle();
            if (venue) return venue;
        } catch (e) {
            console.warn('[ARCADE-CORE] Failed to load venue from Supabase:', e.message);
        }
    }
    return memoryDb.venues.get(venueId) || null;
}

function getNetioAdapter(tableConfig, isTestMode) {
    if (isTestMode && memoryDb._mockNetioInstance) {
        return memoryDb._mockNetioInstance;
    }
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

        const targetOutputId = tableConfig?.switch_output_id || 1;

        // A. Premature cutoff detection: active session before expiresAt - 15s where hardware is confirmed OFF (State === 0)
        if (session.status === 'active' && session.expiresAt && now < (session.expiresAt - 15000)) {
            let isPrematureOff = false;
            try {
                if (netio && typeof netio.verifyConfirmedOff === 'function') {
                    if (netio.isMock) {
                        isPrematureOff = (netio.mockStatusOutputState === 0 || netio.mockPrematureOff === true);
                    } else {
                        isPrematureOff = (await netio.verifyConfirmedOff(targetOutputId) === true);
                    }
                }
            } catch (err) {
                isPrematureOff = false;
            }

            if (isPrematureOff === true) {
                let uptime = null;
                try {
                    const st = await netio.getStatus();
                    uptime = st?.device?.uptime ?? st?.device?.Uptime ?? null;
                } catch (e) {}

                // Agent.Uptime < 120 proves device restarted, not power loss.
                const reason = (uptime !== null && uptime < 120) ? 'device_restarted' : 'premature_cutoff';
                session.status = 'failed';
                session.error_reason = reason;

                const matchedOrder = Array.from(memoryDb.orders.values()).find(o => o.tableId === tableId && (o.sessionId === session.id || o.status === 'active'));
                if (matchedOrder) {
                    matchedOrder.status = 'interrupted';
                    matchedOrder.refundReason = reason;
                    if (matchedOrder.amountCents > 0) {
                        matchedOrder.refundStatus = 'refund_required';
                    }
                }

                if (tableConfig) {
                    if (tableConfig.pending_maintenance_lock || tableConfig.lock_state === 'maintenance_locked') {
                        tableConfig.lock_state = 'maintenance_locked';
                        tableConfig.pending_maintenance_lock = false;
                    } else {
                        tableConfig.lock_state = 'available';
                    }
                }
                memoryDb.sessions.delete(tableId);
                saveMemorySessions();
                memoryDb.events.push({
                    table_id: tableId,
                    session_id: session.id,
                    event_type: 'interrupted',
                    payload: { reason, uptime, refundRequired: matchedOrder?.amountCents > 0 },
                    created_at: new Date().toISOString()
                });
                return;
            }
        }

        // B. Normal session expiration: scheduled time + 4s has elapsed
        if ((session.status === 'active' || session.status === 'hardware_uncertain') && session.expiresAt && now > (session.expiresAt + 4000)) {
            let isOff = false;
            try {
                if (netio && typeof netio.verifyConfirmedOff === 'function') {
                    isOff = (await netio.verifyConfirmedOff(targetOutputId) === true);
                }
            } catch (err) {
                console.warn('[RECONCILIATION] Hardware probe failed during session expiration:', err.message);
                isOff = false;
            }

            if (isOff === true) {
                memoryDb.sessions.delete(tableId);
                if (tableConfig) {
                    if (tableConfig.pending_maintenance_lock || tableConfig.lock_state === 'maintenance_locked') {
                        tableConfig.lock_state = 'maintenance_locked';
                        tableConfig.pending_maintenance_lock = false;
                    } else {
                        tableConfig.lock_state = 'available';
                    }
                }
                const matchedOrder = Array.from(memoryDb.orders.values()).find(o => o.tableId === tableId && (o.sessionId === session.id || o.status === 'hardware_uncertain' || o.status === 'active'));
                if (matchedOrder) {
                    if (matchedOrder.status === 'hardware_uncertain') {
                        matchedOrder.status = 'resolved_uncertain';
                    } else if (matchedOrder.status === 'active') {
                        matchedOrder.status = 'completed';
                    }
                }
                saveMemorySessions();
                memoryDb.events.push({
                    table_id: tableId,
                    session_id: session.id,
                    event_type: 'switch_confirmed_off',
                    payload: { reconciledAt: new Date().toISOString() },
                    created_at: new Date().toISOString()
                });
                try {
                    await syncAuxOutlets({ tableId, isTestMode, trigger: 'game_completed' });
                } catch (e) {}
            } else {
                session.status = 'hardware_uncertain';
                if (tableConfig) tableConfig.lock_state = 'error_locked';
                saveMemorySessions();
            }
        }
        return;
    }

    // 3. Supabase session reconciliation
    const sb = getSupabase();
    if (sb) {
        try {
            const staleThreshold = new Date(now - 30000).toISOString();
            await sb.from('arcade_sessions')
                .update({ status: 'failed', error_reason: 'Activation timed out before hardware command was dispatched' })
                .eq('table_id', tableId)
                .eq('status', 'requested')
                .is('hardware_dispatched_at', null)
                .lt('requested_at', staleThreshold);

            const { data: expiredSessions } = await sb
                .from('arcade_sessions')
                .select('*')
                .eq('table_id', tableId)
                .in('status', ['active', 'requested', 'hardware_uncertain'])
                .order('created_at', { ascending: false });

            if (expiredSessions && expiredSessions.length > 0) {
                const currentSession = expiredSessions[0];
                const expiresAtMs = currentSession.expires_at 
                    ? new Date(currentSession.expires_at).getTime() 
                    : (new Date(currentSession.requested_at).getTime() + (currentSession.duration_seconds || 900) * 1000);

                const targetOutputId = tableConfig?.switch_output_id || 1;

                // A. Premature cutoff in Supabase
                if (currentSession.status === 'active' && now < (expiresAtMs - 15000)) {
                    let isPrematureOff = false;
                    try {
                        if (netio && typeof netio.verifyConfirmedOff === 'function') {
                            if (netio.isMock) {
                                isPrematureOff = (netio.mockStatusOutputState === 0 || netio.mockPrematureOff === true);
                            } else {
                                isPrematureOff = (await netio.verifyConfirmedOff(targetOutputId) === true);
                            }
                        }
                    } catch (probeErr) {
                        isPrematureOff = false;
                    }

                    if (isPrematureOff === true) {
                        let uptime = null;
                        try {
                            const st = await netio.getStatus();
                            uptime = st?.device?.uptime ?? st?.device?.Uptime ?? null;
                        } catch (e) {}

                        // Agent.Uptime < 120 proves device restarted, not power loss.
                        const reason = (uptime !== null && uptime < 120) ? 'device_restarted' : 'premature_cutoff';

                        const { data: matchedOrder } = await sb
                            .from('arcade_orders')
                            .select('*')
                            .eq('table_id', tableId)
                            .eq('session_id', currentSession.id)
                            .eq('status', 'active')
                            .maybeSingle();

                        if (matchedOrder) {
                            try {
                                await sb.rpc('arcade_record_premature_cutoff', {
                                    p_table_id: tableId,
                                    p_order_id: matchedOrder.order_id,
                                    p_session_id: currentSession.id,
                                    p_reason: reason,
                                    p_device_uptime: uptime
                                });
                            } catch (rpcErr) {
                                console.error('[RECONCILIATION ERROR] arcade_record_premature_cutoff failed:', rpcErr.message);
                            }

                            // If paid order, initiate idempotent Stripe refund
                            if (matchedOrder.amount_cents > 0 && matchedOrder.stripe_payment_intent_id) {
                                try {
                                    const stripe = getStripeClient();
                                    if (stripe && stripe.refunds) {
                                        const ref = await stripe.refunds.create({
                                            payment_intent: matchedOrder.stripe_payment_intent_id,
                                            reason: 'requested_by_customer'
                                        }, {
                                            idempotencyKey: `ref-${matchedOrder.order_id}`
                                        });

                                        if (ref.status === 'succeeded') {
                                            await sb.from('arcade_orders').update({
                                                refund_status: 'refund_completed',
                                                refund_id: ref.id,
                                                updated_at: new Date().toISOString()
                                            }).eq('order_id', matchedOrder.order_id);
                                        } else {
                                            await sb.from('arcade_orders').update({
                                                refund_status: 'refund_initiated',
                                                refund_id: ref.id,
                                                updated_at: new Date().toISOString()
                                            }).eq('order_id', matchedOrder.order_id);
                                        }
                                    }
                                } catch (refErr) {
                                    console.error('[STRIPE REFUND ERROR] Idempotent refund failed:', refErr.message);
                                    // Fail-closed: keep in refund_required state in DB
                                }
                            }
                        } else {
                            await sb.from('arcade_sessions').update({
                                status: 'failed',
                                error_reason: reason,
                                confirmed_off_at: new Date().toISOString()
                            }).eq('id', currentSession.id);

                            const targetLock = (tableConfig?.pending_maintenance_lock || tableConfig?.lock_state === 'maintenance_locked') ? 'maintenance_locked' : 'available';
                            await sb.from('arcade_table_configs').update({
                                lock_state: targetLock,
                                pending_maintenance_lock: false,
                                updated_at: new Date().toISOString()
                            }).eq('table_id', tableId);
                        }
                        return;
                    }
                }

                // B. Normal session expiration in Supabase
                if (now > (expiresAtMs + 4000)) {
                    let isOff = false;
                    try {
                        if (netio && typeof netio.verifyConfirmedOff === 'function') {
                            isOff = (await netio.verifyConfirmedOff(targetOutputId) === true);
                        }
                    } catch (probeErr) {
                        console.warn('[RECONCILIATION] Supabase probe error:', probeErr.message);
                        isOff = false;
                    }

                    if (isOff === true) {
                        const confirmedOffAt = new Date().toISOString();
                        const { data: matchedOrder } = await sb
                            .from('arcade_orders')
                            .select('order_id')
                            .eq('table_id', tableId)
                            .eq('session_id', currentSession.id)
                            .in('status', ['active', 'hardware_uncertain'])
                            .maybeSingle();

                        if (matchedOrder?.order_id) {
                            let releaseData = null;
                            let releaseErr = null;
                            try {
                                const res = await sb.rpc('arcade_release_reconciled_table', {
                                    p_table_id: tableId,
                                    p_order_id: matchedOrder.order_id,
                                    p_session_id: currentSession.id,
                                    p_confirmed_off: true,
                                    p_confirmed_off_at: confirmedOffAt
                                });
                                releaseData = res.data;
                                releaseErr = res.error;
                            } catch (relEx) {
                                releaseErr = relEx;
                            }

                            if (releaseErr || !releaseData?.success) {
                                console.error('[RECONCILIATION ERROR] arcade_release_reconciled_table failed:', releaseErr?.message || releaseData?.error);
                                return;
                            }
                        } else {
                            await sb
                                .from('arcade_sessions')
                                .update({ status: 'completed', confirmed_off_at: confirmedOffAt })
                                .eq('id', currentSession.id);

                            const targetLock = (tableConfig?.pending_maintenance_lock || tableConfig?.lock_state === 'maintenance_locked') ? 'maintenance_locked' : 'available';
                            await sb
                                .from('arcade_table_configs')
                                .update({ lock_state: targetLock, pending_maintenance_lock: false })
                                .eq('table_id', tableId);
                        }

                        try {
                            await sb.from('arcade_events').insert({
                                table_id: tableId,
                                session_id: currentSession.id,
                                event_type: 'switch_confirmed_off',
                                payload: { confirmedAt: confirmedOffAt }
                            });
                        } catch (e) {}

                        try {
                            await syncAuxOutlets({ tableId, isTestMode, trigger: 'game_completed' });
                        } catch (e) {}
                    } else {
                        await sb
                            .from('arcade_sessions')
                            .update({ status: 'hardware_uncertain', error_reason: 'Relay not confirmed OFF after expiration buffer' })
                            .eq('id', currentSession.id);

                        await sb
                            .from('arcade_table_configs')
                            .update({ lock_state: 'error_locked' })
                            .eq('table_id', tableId);
                    }
                }
            }
        } catch (e) {
            console.warn('[RECONCILE ERROR]', e.message);
        }
        return;
    }
}

/**
 * Creates an atomic table hold for the customer during checkout (3 min window).
 */
async function createPaymentHold({ tableId, durationMinutes, clientToken, isTestMode }) {
    const pkg = PRICE_CATALOG[durationMinutes];
    if (!pkg) {
        return {
            success: false,
            statusCode: 400,
            code: 'INVALID_DURATION',
            error: `Invalid durationMinutes. Allowed values: ${ALLOWED_DURATIONS.join(', ')}`
        };
    }

    const sb = getSupabase();
    if (sb) {
        const crypto = require('crypto');
        const token = (clientToken || `tok-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`).trim();
        const clientTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const durationSeconds = durationMinutes * 60;

        let data = null;
        let error = null;
        try {
            const res = await sb.rpc('arcade_create_payment_hold', {
                p_table_id: tableId,
                p_duration_minutes: durationMinutes,
                p_duration_seconds: durationSeconds,
                p_amount_cents: pkg.amountCents,
                p_currency: pkg.currency,
                p_client_token_hash: clientTokenHash,
                p_hold_seconds: 180
            });
            data = res.data;
            error = res.error;
        } catch (holdEx) {
            error = holdEx;
        }

        if (error) {
            console.error('[SUPABASE RPC ERROR] arcade_create_payment_hold:', error.message);
            return {
                success: false,
                statusCode: 500,
                code: 'DB_RPC_ERROR',
                error: `Tietokantavirhe varausta luotaessa: ${error.message}`
            };
        }

        if (!data || !data.success) {
            return {
                success: false,
                statusCode: data?.statusCode || 409,
                code: data?.code || 'TABLE_HOLD_FAILED',
                error: data?.error || 'Pöydän varaaminen epäonnistui.',
                holdExpiresAt: data?.hold_expires_at || null,
                lockState: data?.lock_state || null
            };
        }

        const order = {
            orderId: data.order_id,
            tableId,
            durationMinutes,
            durationSeconds,
            amountCents: pkg.amountCents,
            currency: pkg.currency,
            clientTokenHash,
            status: 'holding',
            holdExpiresAt: data.hold_expires_at,
            paymentIntentId: null
        };

        return {
            success: true,
            order,
            isReplay: Boolean(data.is_idempotent_replay)
        };
    }

    // Fail closed in production if Supabase is missing (Requirement 3)
    if (!isTestMode) {
        return {
            success: false,
            statusCode: 503,
            code: 'DATABASE_NOT_CONFIGURED',
            error: 'Tietokantayhteys puuttuu. Maksullinen varaus ei ole käytettävissä tuotannossa.'
        };
    }

    // In-memory fallback for local unit tests without Supabase
    loadMemorySessions();
    const cfg = getTableConfig(tableId, isTestMode);
    if (!cfg) {
        return { success: false, statusCode: 404, code: 'TABLE_NOT_FOUND', error: `Unknown table ID '${tableId}'` };
    }

    const netio = getNetioAdapter(cfg, isTestMode);
    await reconcileTableState(tableId, cfg, netio, isTestMode);

    if (!cfg.is_enabled || cfg.lock_state !== 'available' || cfg.pending_maintenance_lock) {
        return { 
            success: false, 
            statusCode: 423, 
            code: 'TABLE_LOCKED', 
            error: 'Table is currently disabled or locked for maintenance.',
            lockState: cfg.pending_maintenance_lock ? 'pending_maintenance' : cfg.lock_state 
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
async function releasePaymentHold({ tableId, orderId, reason }) {
    const sb = getSupabase();
    if (sb) {
        try {
            await sb.from('arcade_orders')
                .update({ status: 'cancelled', refund_reason: reason || 'released', updated_at: new Date().toISOString() })
                .eq('order_id', orderId)
                .eq('status', 'holding');

            await sb.from('arcade_table_configs')
                .update({ lock_state: 'available', updated_at: new Date().toISOString() })
                .eq('table_id', tableId)
                .eq('lock_state', 'pending_payment');
            return true;
        } catch (e) {
            console.warn('[RELEASE HOLD ERROR]', e.message);
            return false;
        }
    }

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
 * Creates an atomic table hold for moderator free play (amount_cents = 0).
 */
async function createFreePlayHold({ tableId, durationMinutes = 5, venueId = null, authMethod = 'shared_venue_pin', clientToken = null, isTestMode = false }) {
    if (!tableId) {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: "Missing 'tableId' parameter" };
    }

    const token = (clientToken || `tok-free-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`).trim();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const sb = getSupabase();
    if (sb) {
        try {
            const { data, error } = await sb.rpc('arcade_create_free_play_hold', {
                p_table_id: tableId,
                p_duration_minutes: durationMinutes,
                p_venue_id: venueId,
                p_auth_method: authMethod || 'shared_venue_pin',
                p_client_token_hash: tokenHash
            });

            if (error) {
                console.error('[SUPABASE RPC ERROR] arcade_create_free_play_hold:', error.message);
                return { success: false, statusCode: 500, code: 'DB_RPC_ERROR', error: error.message };
            }

            if (!data?.success) {
                return {
                    success: false,
                    statusCode: data?.statusCode || 409,
                    code: data?.code || 'TABLE_HOLD_FAILED',
                    error: data?.error || 'Pöydän varaaminen ilmaispeliin epäonnistui.'
                };
            }

            return {
                success: true,
                orderId: data.order_id,
                tableId: data.table_id,
                amountCents: 0,
                currency: 'eur',
                durationMinutes: data.duration_minutes,
                durationSeconds: data.duration_seconds,
                clientToken: token,
                holdExpiresAt: data.hold_expires_at
            };
        } catch (err) {
            return { success: false, statusCode: 500, code: 'DB_RPC_EXCEPTION', error: err.message };
        }
    }

    if (!isTestMode) {
        return {
            success: false,
            statusCode: 503,
            code: 'DATABASE_NOT_CONFIGURED',
            error: 'Tietokantayhteys puuttuu. Ilmaispelin varaus ei ole käytettävissä tuotannossa.'
        };
    }

    // In-memory fallback
    loadMemorySessions();
    const cfg = getTableConfig(tableId, isTestMode);
    if (!cfg) {
        return { success: false, statusCode: 404, code: 'TABLE_NOT_FOUND', error: `Unknown table ID '${tableId}'` };
    }

    const netio = getNetioAdapter(cfg, isTestMode);
    await reconcileTableState(tableId, cfg, netio, isTestMode);

    if (!cfg.is_enabled || cfg.lock_state === 'maintenance_locked' || cfg.pending_maintenance_lock) {
        return {
            success: false,
            statusCode: 423,
            code: 'TABLE_LOCKED',
            error: 'Pöytä on huoltotilassa.',
            lockState: cfg.lock_state
        };
    }

    if (cfg.lock_state === 'error_locked') {
        return {
            success: false,
            statusCode: 423,
            code: 'TABLE_ERROR_LOCKED',
            error: 'Pöytä on virhelukittu laitehäiriön vuoksi.',
            lockState: cfg.lock_state
        };
    }

    if (cfg.lock_state !== 'available') {
        return {
            success: false,
            statusCode: 409,
            code: 'TABLE_BUSY',
            error: 'Pöytä on varattu tai peli on käynnissä.',
            lockState: cfg.lock_state
        };
    }

    const activeSession = memoryDb.sessions.get(tableId);
    if (activeSession && (activeSession.status === 'active' || activeSession.status === 'requested' || activeSession.status === 'hardware_uncertain')) {
        return {
            success: false,
            statusCode: 409,
            code: 'TABLE_BUSY',
            error: 'Table is currently in an active play session.'
        };
    }

    const existingHoldOrderId = memoryDb.holds.get(tableId);
    if (existingHoldOrderId) {
        const existingOrder = memoryDb.orders.get(existingHoldOrderId);
        if (existingOrder && existingOrder.status === 'pending_payment' && existingOrder.holdExpiresAt > Date.now()) {
            return {
                success: false,
                statusCode: 409,
                code: 'TABLE_HELD',
                error: 'Pöytä on parhaillaan toisen pelaajan varattavana.'
            };
        }
    }

    const orderId = `ord-free-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const holdExpiresAt = Date.now() + (3 * 60 * 1000);

    const effectiveVenueId = venueId || cfg.venue_id || 'unknown';
    const order = {
        orderId,
        tableId,
        durationMinutes,
        durationSeconds: durationMinutes * 60,
        amountCents: 0,
        currency: 'eur',
        clientToken: token,
        clientTokenHash: tokenHash,
        status: 'pending_payment',
        holdExpiresAt,
        createdAt: new Date().toISOString(),
        paymentIntentId: null,
        refundStatus: 'none',
        paymentStatus: 'succeeded',
        isClaimed: false,
        claimedByWorker: `${authMethod || 'shared_venue_pin'}:${effectiveVenueId}`
    };

    memoryDb.orders.set(orderId, order);
    memoryDb.holds.set(tableId, orderId);
    saveMemorySessions();

    return {
        success: true,
        orderId,
        tableId,
        amountCents: 0,
        currency: 'eur',
        durationMinutes,
        durationSeconds: durationMinutes * 60,
        clientToken: token,
        holdExpiresAt: new Date(holdExpiresAt).toISOString()
    };
}

/**
 * Sets table maintenance mode on or off.
 * If maintenance is set while a game is active, pending_maintenance_lock is flagged
 * so the active game completes without power cutoff, and locks into maintenance_locked upon finish.
 */
async function setTableMaintenance({ tableId, maintenanceEnabled, venueId = null, authMethod = 'shared_venue_pin', reason = null, isTestMode = false }) {
    if (!tableId || typeof maintenanceEnabled !== 'boolean') {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: 'Invalid tableId or maintenance flag' };
    }

    const sb = getSupabase();
    if (sb) {
        try {
            const { data, error } = await sb.rpc('arcade_set_table_maintenance', {
                p_table_id: tableId,
                p_maintenance_enabled: maintenanceEnabled,
                p_venue_id: venueId,
                p_auth_method: authMethod || 'shared_venue_pin',
                p_reason: reason
            });

            if (error) {
                console.error('[SUPABASE RPC ERROR] arcade_set_table_maintenance:', error.message);
                return { success: false, statusCode: 500, code: 'DB_RPC_ERROR', error: error.message };
            }

            if (data?.success) {
                try {
                    await syncAuxOutlets({ tableId, isTestMode, trigger: 'maintenance_changed' });
                } catch (e) {}
            }

            return data;
        } catch (err) {
            return { success: false, statusCode: 500, code: 'DB_RPC_EXCEPTION', error: err.message };
        }
    }

    if (!isTestMode) {
        return {
            success: false,
            statusCode: 503,
            code: 'DATABASE_NOT_CONFIGURED',
            error: 'Tietokantayhteys puuttuu.'
        };
    }

    loadMemorySessions();
    const cfg = getTableConfig(tableId, isTestMode);
    if (!cfg) {
        return { success: false, statusCode: 404, code: 'TABLE_NOT_FOUND', error: `Unknown table ID '${tableId}'` };
    }

    let isDeferred = false;
    let targetLockState;

    const activeSession = memoryDb.sessions.get(tableId);
    const isBusy = (activeSession && (activeSession.status === 'active' || activeSession.status === 'requested' || (activeSession.expiresAt && activeSession.expiresAt > Date.now()))) || memoryDb.holds.has(tableId) || cfg.lock_state === 'active' || cfg.lock_state === 'pending_payment';

    if (maintenanceEnabled) {
        if (isBusy) {
            cfg.pending_maintenance_lock = true;
            isDeferred = true;
            targetLockState = cfg.lock_state || 'available';
        } else {
            cfg.lock_state = 'maintenance_locked';
            cfg.pending_maintenance_lock = false;
            isDeferred = false;
            targetLockState = 'maintenance_locked';
        }
    } else {
        cfg.lock_state = 'available';
        cfg.pending_maintenance_lock = false;
        isDeferred = false;
        targetLockState = 'available';
    }

    memoryDb.events.push({
        table_id: tableId,
        venue_id: venueId || cfg.venue_id || null,
        event_type: 'maintenance_state_changed',
        payload: {
            maintenance_enabled: maintenanceEnabled,
            lock_state: targetLockState,
            pending_maintenance_lock: maintenanceEnabled && isDeferred,
            is_deferred: isDeferred,
            auth_method: authMethod || 'shared_venue_pin',
            venue_id: venueId || cfg.venue_id || null,
            reason
        },
        created_at: new Date().toISOString()
    });

    saveMemorySessions();

    try {
        await syncAuxOutlets({ tableId, isTestMode, trigger: 'maintenance_changed' });
    } catch (e) {}

    return {
        success: true,
        table_id: tableId,
        lock_state: targetLockState,
        pending_maintenance_lock: maintenanceEnabled && isDeferred,
        is_deferred: isDeferred,
        message: maintenanceEnabled && isDeferred
            ? 'Peli on käynnissä. Pöytä lukittuu huoltotilaan pelin päättyessä.'
            : (maintenanceEnabled ? 'Pöytä on asetettu huoltotilaan välittömästi.' : 'Huoltotila poistettu. Pöytä on vapaa.')
    };
}

/**
 * Atomically binds a Stripe PaymentIntent to an active holding order.
 * Ensures the order cannot be hijacked or paid for with an unbonded intent.
 */
async function bindPaymentIntent({ tableId, orderId, paymentIntentId, idempotencyKey, isTestMode }) {
    if (!tableId || !orderId || !paymentIntentId) {
        return { success: false, code: 'INVALID_PARAMETERS', error: 'Missing tableId, orderId, or paymentIntentId' };
    }

    const sb = getSupabase();
    if (sb) {
        let data = null;
        let error = null;
        try {
            const res = await sb.rpc('arcade_bind_payment_intent', {
                p_table_id: tableId,
                p_order_id: orderId,
                p_payment_intent_id: paymentIntentId,
                p_idempotency_key: idempotencyKey || null
            });
            data = res.data;
            error = res.error;
        } catch (bindEx) {
            error = bindEx;
        }

        if (error) {
            console.error('[SUPABASE RPC ERROR] arcade_bind_payment_intent:', error.message);
            return {
                success: false,
                code: 'DB_RPC_ERROR',
                error: `Tietokantavirhe PaymentIntentiä sidottaessa: ${error.message}`
            };
        }

        if (!data || !data.success) {
            return {
                success: false,
                code: data?.code || 'BIND_FAILED',
                error: data?.error || 'PaymentIntentin sitominen tilaukseen epäonnistui.'
            };
        }

        return {
            success: true,
            orderId,
            paymentIntentId
        };
    }

    if (!isTestMode) {
        return {
            success: false,
            code: 'DATABASE_NOT_CONFIGURED',
            error: 'Tietokantayhteys puuttuu. PaymentIntentin sitominen ei onnistu tuotannossa.'
        };
    }

    loadMemorySessions();
    const order = memoryDb.orders.get(orderId);
    if (!order) {
        return { success: false, code: 'ORDER_NOT_FOUND', error: `Order '${orderId}' not found in memoryDb` };
    }
    if (order.tableId !== tableId) {
        return { success: false, code: 'TABLE_MISMATCH', error: `Order table mismatch` };
    }
    order.paymentIntentId = paymentIntentId;
    saveMemorySessions();
    return { success: true, orderId, paymentIntentId };
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

        const clientTokenHash = clientToken ? crypto.createHash('sha256').update(clientToken.trim()).digest('hex') : null;
        try {
            await supabase.from('arcade_events').insert({
                table_id: table,
                session_id: sessionId,
                event_type: 'session_requested',
                payload: { durationMinutes: targetMinutes, clientTokenHash, outputId: targetOutputId, paymentIntentId }
            });
        } catch (e) {}

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

            try {
                await supabase.from('arcade_events').insert({
                    table_id: table,
                    session_id: sessionId,
                    event_type: 'switch_error',
                    payload: { error: errReason, phase: 'pre_dispatch_guard' }
                });
            } catch (e) {}

            if (dispatchErr) {
                try {
                    await supabase.from('arcade_sessions')
                        .update({ status: 'failed', error_reason: errReason })
                        .eq('id', sessionId);
                } catch (e) {}
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

        try {
            await supabase.from('arcade_events').insert({
                table_id: table,
                session_id: sessionId,
                event_type: 'switch_cmd_sent',
                payload: { outletId: targetOutputId, durationMinutes: targetMinutes }
            });
        } catch (e) {}

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
                try {
                    await supabase.from('arcade_sessions').update({
                        status: 'failed',
                        error_reason: `DB update to active failed; emergency power cut confirmed OFF: ${updErr.message}`
                    }).eq('id', sessionId);
                } catch (e) {}

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

                try {
                    await supabase.from('arcade_sessions').update({
                        status: 'hardware_uncertain',
                        error_reason: reason,
                        expires_at: expiresAt
                    }).eq('id', sessionId);
                } catch (e) {}

                try {
                    await supabase.from('arcade_table_configs').update({
                        lock_state: 'error_locked'
                    }).eq('table_id', table);
                } catch (e) {}

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

        try {
            await supabase.from('arcade_events').insert({
                table_id: table,
                session_id: sessionId,
                event_type: 'switch_confirmed_on',
                payload: { hardware: netioResult, expiresAt, outputId: targetOutputId }
            });
        } catch (e) {}

        try {
            await syncAuxOutlets({ tableId: table, isTestMode, trigger: 'game_activated' });
        } catch (e) {}

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

    const memClientTokenHash = clientToken ? crypto.createHash('sha256').update(clientToken.trim()).digest('hex') : null;
    memoryDb.events.push({
        table_id: table,
        session_id: sessionId,
        event_type: 'session_requested',
        payload: { durationMinutes: targetMinutes, clientTokenHash: memClientTokenHash, outputId: targetOutputId, paymentIntentId },
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

    try {
        await syncAuxOutlets({ tableId: table, isTestMode, trigger: 'game_activated' });
    } catch (e) {}

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
async function claimAndActivateOrder({ orderId, paymentIntent, isFreePlay = false, tableId: explicitTableId, durationMinutes: explicitDurationMinutes, workerId: explicitWorkerId, isTestMode }) {
    const isFree = isFreePlay || (orderId && orderId.startsWith('ord-free-'));
    if (!isFree && (!paymentIntent || !paymentIntent.id)) {
        return { success: false, statusCode: 400, code: 'INVALID_PAYMENT_INTENT', error: 'Missing PaymentIntent data' };
    }

    const sb = getSupabase();
    if (sb) {
        const tableId = isFree ? explicitTableId : paymentIntent.metadata?.table_id;
        const amountCents = isFree ? 0 : paymentIntent.amount;
        const currency = isFree ? 'eur' : paymentIntent.currency;
        const workerId = explicitWorkerId || `worker-${process.pid || 1}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const clientSessionToken = 'tok-ord-' + orderId;
        const paymentIntentId = isFree ? null : paymentIntent.id;

        // 1. Call atomic claim RPC: arcade_claim_order_for_activation
        let claimData = null;
        let claimErr = null;
        try {
            const res = await sb.rpc('arcade_claim_order_for_activation', {
                p_table_id: tableId,
                p_order_id: orderId,
                p_payment_intent_id: paymentIntentId,
                p_amount_cents: amountCents,
                p_currency: currency,
                p_worker_id: workerId
            });
            claimData = res.data;
            claimErr = res.error;
        } catch (cEx) {
            claimErr = cEx;
        }

        if (claimErr) {
            console.error('[SUPABASE RPC ERROR] arcade_claim_order_for_activation:', claimErr.message);
            return {
                success: false,
                statusCode: 500,
                code: 'DB_RPC_ERROR',
                refundRequired: !isFree,
                error: `Tietokantavirhe lunastuksessa: ${claimErr.message}`
            };
        }

        // Idempotent replay: already active, completed, or being processed concurrently
        if (claimData?.is_idempotent_replay) {
            return {
                success: true,
                isIdempotentReplay: true,
                orderId,
                status: claimData.status,
                sessionId: claimData.session_id || null,
                expiresAt: claimData.expires_at || null
            };
        }

        // Claim failure (e.g. late payment, hold expired, amount mismatch, table mismatch)
        if (!claimData || !claimData.success) {
            return {
                success: false,
                statusCode: claimData?.statusCode || 409,
                code: claimData?.code || 'CLAIM_FAILED',
                refundRequired: isFree ? false : Boolean(claimData?.refund_required),
                error: claimData?.error || 'Maksun/tilauksen lunastus epäonnistui.'
            };
        }

        const effectiveTableId = claimData.table_id || tableId;
        const durationMinutes = claimData.duration_minutes || explicitDurationMinutes || 5;
        const durationSeconds = claimData.duration_seconds || (durationMinutes * 60);

        // 2. Pre-dispatch guard: arcade_pre_dispatch_guard
        let guardData = null;
        let guardErr = null;
        try {
            const guardRes = await sb.rpc('arcade_pre_dispatch_guard', {
                p_table_id: effectiveTableId,
                p_order_id: orderId,
                p_worker_id: workerId,
                p_client_session_token: clientSessionToken
            });
            guardData = guardRes.data;
            guardErr = guardRes.error;
        } catch (gEx) {
            guardErr = gEx;
        }

        if (guardErr || !guardData?.success) {
            const errReason = guardErr ? guardErr.message : (guardData?.error || 'Pre-dispatch guard rejected');
            console.error('[DISPATCH GUARD] Pre-dispatch guard failed:', errReason);

            try {
                await sb.from('arcade_orders').update({
                    status: 'activation_failed',
                    refund_status: 'refund_required',
                    refund_reason: errReason,
                    last_error_code: 'DISPATCH_GUARD_FAILED',
                    last_error_details: errReason,
                    updated_at: new Date().toISOString()
                }).eq('order_id', orderId);
            } catch (e) {}

            return {
                success: false,
                statusCode: guardData?.statusCode || 500,
                code: guardData?.code || 'DISPATCH_RECORDING_FAILED',
                refundRequired: true,
                error: `Failed to record hardware dispatch state before execution: ${errReason}`
            };
        }

        const sessionId = guardData.session_id;
        const expiresAt = guardData.expires_at;

        // 3. Obtain table configuration & NETIO adapter
        const cfg = await getTableConfigAsync(effectiveTableId, isTestMode);
        const netio = getNetioAdapter(cfg, isTestMode);

        if (!netio && !isTestMode) {
            let finErr = null;
            try {
                const finRes = await sb.rpc('arcade_finalize_activation', {
                    p_table_id: effectiveTableId,
                    p_order_id: orderId,
                    p_session_id: sessionId,
                    p_worker_id: workerId,
                    p_success: false,
                    p_hardware_uncertain: false,
                    p_error_reason: 'Hardware adapter configuration missing'
                });
                if (finRes.error) finErr = finRes.error;
            } catch (e) {
                finErr = e;
            }
            if (finErr) {
                console.error('[FINALIZE ERROR] arcade_finalize_activation failed on missing adapter:', finErr.message);
            }

            return {
                success: false,
                statusCode: 503,
                code: 'HARDWARE_CONFIG_MISSING',
                refundRequired: true,
                error: `Hardware configuration missing for table '${effectiveTableId}'.`
            };
        }

        const targetOutputId = cfg?.switch_output_id || 1;

        // 4. Send command to NETIO hardware (Short ON)
        let netioResult;
        let dispatchError = null;
        try {
            netioResult = await netio.startTimedPlay(durationMinutes, targetOutputId, durationSeconds);
        } catch (err) {
            dispatchError = err;
        }

        if (dispatchError) {
            console.error('[HARDWARE ERROR] startTimedPlay failed:', dispatchError.message);
            let isConfirmedOff = false;
            try {
                if (netio && typeof netio.verifyConfirmedOff === 'function') {
                    const probeRes = await netio.verifyConfirmedOff(targetOutputId);
                    // Strictly numerical 0 returns true; State === 1, missing, or timeout returns false/throws
                    isConfirmedOff = (probeRes === true);
                }
            } catch (probeErr) {
                console.warn('[HARDWARE PROBE] Probe after error failed with exception:', probeErr.message);
                isConfirmedOff = false;
            }

            if (isConfirmedOff === true) {
                let finData = null;
                let finErr = null;
                try {
                    const res = await sb.rpc('arcade_finalize_activation', {
                        p_table_id: effectiveTableId,
                        p_order_id: orderId,
                        p_session_id: sessionId,
                        p_worker_id: workerId,
                        p_success: false,
                        p_hardware_uncertain: false,
                        p_error_reason: `Relay activation failed (confirmed OFF): ${dispatchError.message}`
                    });
                    finData = res.data;
                    finErr = res.error;
                } catch (e) {
                    finErr = e;
                }

                if (finErr || !finData?.success) {
                    console.error('[FINALIZE ERROR] arcade_finalize_activation failed in confirmed-off error path:', finErr?.message || finData?.error);
                }

                return {
                    success: false,
                    statusCode: 502,
                    code: 'RELAY_ACTIVATION_FAILED',
                    refundRequired: true,
                    error: `Releen käynnistys epäonnistui: ${dispatchError.message}`
                };
            } else {
                // State === 1, timeout, network error, missing output, or any exception -> hardware_uncertain
                let finData = null;
                let finErr = null;
                try {
                    const res = await sb.rpc('arcade_finalize_activation', {
                        p_table_id: effectiveTableId,
                        p_order_id: orderId,
                        p_session_id: sessionId,
                        p_worker_id: workerId,
                        p_success: false,
                        p_hardware_uncertain: true,
                        p_error_reason: `Relay state uncertain (not confirmed OFF): ${dispatchError.message}`
                    });
                    finData = res.data;
                    finErr = res.error;
                } catch (e) {
                    finErr = e;
                }

                if (finErr || !finData?.success) {
                    console.error('[FINALIZE ERROR] arcade_finalize_activation failed in hardware_uncertain error path:', finErr?.message || finData?.error);
                }

                // Explicitly persist order, session, and table lock in database even if RPC failed:
                try {
                    await sb.from('arcade_orders').update({
                        status: 'hardware_uncertain',
                        refund_status: 'refund_required',
                        refund_reason: `Hardware uncertain: ${dispatchError.message}`,
                        last_error_code: 'HARDWARE_UNCERTAIN',
                        last_error_details: dispatchError.message,
                        updated_at: new Date().toISOString()
                    }).eq('order_id', orderId);
                } catch (e) {
                    console.error('[DB ERROR] Failed to lock order in hardware_uncertain:', e.message);
                }

                try {
                    await sb.from('arcade_sessions').update({
                        status: 'hardware_uncertain',
                        error_reason: `Hardware uncertain: ${dispatchError.message}`
                    }).eq('id', sessionId);
                } catch (e) {
                    console.error('[DB ERROR] Failed to update session in hardware_uncertain:', e.message);
                }

                try {
                    await sb.from('arcade_table_configs').update({
                        lock_state: 'error_locked',
                        updated_at: new Date().toISOString()
                    }).eq('table_id', effectiveTableId);
                } catch (e) {
                    console.error('[DB ERROR] Failed to lock table in error_locked:', e.message);
                }

                return {
                    success: false,
                    statusCode: 502,
                    code: 'HARDWARE_UNCERTAIN',
                    tableLocked: true,
                    refundRequired: true,
                    expiresAt,
                    error: `Hardware state uncertain: unable to confirm relay watchdog lease. Table has been locked for operator inspection.`
                };
            }
        }

        // 5. Finalize activation in Supabase (transition processing -> active)
        let finalizeData = null;
        let finalizeErr = null;
        try {
            const res = await sb.rpc('arcade_finalize_activation', {
                p_table_id: effectiveTableId,
                p_order_id: orderId,
                p_session_id: sessionId,
                p_worker_id: workerId,
                p_success: true,
                p_hardware_uncertain: false,
                p_error_reason: null
            });
            finalizeData = res.data;
            finalizeErr = res.error;
        } catch (fEx) {
            finalizeErr = fEx;
        }

        if (finalizeErr || !finalizeData?.success) {
            console.error('[FINALIZE ERROR] arcade_finalize_activation failed after hardware ON:', finalizeErr?.message || finalizeData?.error);

            // Jos NETIO Short ON onnistuu mutta arcade_finalize_activation epäonnistuu tai aikakatkaistaan:
            // - Älä palauta onnistumista äläkä vapauta pöytää.
            // - Merkitse tilaus ja pöytä hardware_uncertain / error_locked.
            // - Säilytä expires_at muuttumattomana.
            // - Palauta 502 HARDWARE_UNCERTAIN.
            // - Varmista, että myöhempi reconcileTableState vapauttaa pöydän turvallisesti vasta kun watchdog on varmasti sammunut ja rele on confirmed off.

            try {
                await sb.from('arcade_orders').update({
                    status: 'hardware_uncertain',
                    refund_status: 'refund_required',
                    refund_reason: `DB finalize failed after hardware ON: ${finalizeErr?.message || finalizeData?.error || 'Unknown error'}`,
                    last_error_code: 'HARDWARE_UNCERTAIN',
                    last_error_details: finalizeErr?.message || finalizeData?.error || 'Finalize RPC failed',
                    updated_at: new Date().toISOString()
                }).eq('order_id', orderId);
            } catch (e) {
                console.error('[DB ERROR] Failed to mark order hardware_uncertain:', e.message);
            }

            try {
                await sb.from('arcade_sessions').update({
                    status: 'hardware_uncertain',
                    error_reason: `DB finalize failed after hardware ON: ${finalizeErr?.message || finalizeData?.error || 'Unknown error'}`
                }).eq('id', sessionId);
            } catch (e) {
                console.error('[DB ERROR] Failed to mark session hardware_uncertain:', e.message);
            }

            try {
                await sb.from('arcade_table_configs').update({
                    lock_state: 'error_locked',
                    updated_at: new Date().toISOString()
                }).eq('table_id', effectiveTableId);
            } catch (e) {
                console.error('[DB ERROR] Failed to lock table in error_locked:', e.message);
            }

            return {
                success: false,
                statusCode: 502,
                code: 'HARDWARE_UNCERTAIN',
                tableLocked: true,
                refundRequired: true,
                expiresAt,
                error: 'Hardware state uncertain: session state could not be finalized. Table has been locked.'
            };
        }

        // 6. Record successful event in arcade_events
        try {
            await sb.from('arcade_events').insert({
                table_id: effectiveTableId,
                session_id: sessionId,
                event_type: 'switch_confirmed_on',
                payload: { hardware: netioResult, expiresAt, outputId: targetOutputId }
            });
        } catch (e) {}

        // 7. Synchronize auxiliary outlets (Display ON, Lights OFF during active game)
        try {
            await syncAuxOutlets({ tableId: effectiveTableId, isTestMode, trigger: 'game_activated' });
        } catch (e) {
            console.warn('[AUX OUTLETS WARNING] Failed to sync aux outlets after game activation:', e.message);
        }

        return {
            success: true,
            orderId,
            sessionId,
            expiresAt,
            hardware: netioResult
        };
    }

    // Fail closed in production if Supabase is missing (Requirement 3 & 12)
    if (!isTestMode) {
        return {
            success: false,
            statusCode: 503,
            code: 'DATABASE_NOT_CONFIGURED',
            refundRequired: true,
            error: 'Tietokantayhteys puuttuu. Maksullinen lunastus ei ole käytettävissä tuotannossa.'
        };
    }

    // In-memory fallback for local unit tests without Supabase
    loadMemorySessions();

    // 1. Idempotency Check: Has this payment intent already been processed?
    if (!isFree && paymentIntent && memoryDb.processedPaymentIntents.has(paymentIntent.id)) {
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
        return {
            success: false,
            statusCode: 404,
            code: 'ORDER_NOT_FOUND',
            refundRequired: !isFree,
            error: `No stored order found matching ID '${orderId}'. Payment must be reviewed or refunded.`
        };
    }

    // 3. Strict Order & PaymentIntent Verification
    if (!isFree) {
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
    }

    // 4. Hold Expiration and Conflict Check
    const now = Date.now();
    const currentTableHold = memoryDb.holds.get(order.tableId);

    if (order.isClaimed) {
        return {
            success: true,
            isIdempotentReplay: true,
            orderId,
            status: order.status,
            sessionId: order.sessionId
        };
    }

    if (now > order.holdExpiresAt || currentTableHold !== order.orderId) {
        order.status = 'late_payment_conflict';
        if (!isFree) {
            order.refundStatus = 'refund_required';
        }
        saveMemorySessions();
        return {
            success: false,
            statusCode: 409,
            code: 'LATE_PAYMENT_CONFLICT',
            refundRequired: !isFree,
            error: 'Payment was confirmed after the 3-minute hold expired or table was reassigned.'
        };
    }

    // 5. ATOMIC CLAIM TRANSITION
    order.isClaimed = true;
    order.status = 'activating';
    if (!isFree && paymentIntent) {
        order.paymentIntentId = paymentIntent.id;
        memoryDb.processedPaymentIntents.add(paymentIntent.id);
    }
    saveMemorySessions();

    // 6. Invoke Shared Safe Activation
    const activationResult = await activateSessionCore({
        table: order.tableId,
        durationMinutes: order.durationMinutes,
        durationSeconds: order.durationSeconds,
        is30SecTest: false,
        clientToken: order.clientToken,
        authSource: isFree ? 'admin' : 'stripe',
        paymentIntentId: isFree ? null : paymentIntent?.id,
        orderId: order.orderId,
        isTestMode
    });

    if (activationResult.statusCode === 200) {
        if (memoryDb._simulateFinalizeError || memoryDb._simulateFinalizeTimeout) {
            order.status = 'hardware_uncertain';
            order.refundStatus = 'refund_required';
            order.refundReason = memoryDb._simulateFinalizeTimeout ? 'Finalize RPC timed out' : 'Finalize RPC error';
            order.lastErrorCode = 'HARDWARE_UNCERTAIN';
            order.lastErrorDetails = memoryDb._simulateFinalizeTimeout ? 'Finalize RPC timed out' : 'Finalize RPC error';
            order.sessionId = activationResult.body.sessionId;
            order.expiresAt = activationResult.body.expiresAt;
            memoryDb.holds.delete(order.tableId);
            const cfg = memoryDb.tableConfigs.get(order.tableId);
            if (cfg) cfg.lock_state = 'error_locked';
            const memSession = memoryDb.sessions.get(order.tableId);
            if (memSession) memSession.status = 'hardware_uncertain';
            saveMemorySessions();

            return {
                success: false,
                statusCode: 502,
                code: 'HARDWARE_UNCERTAIN',
                tableLocked: true,
                refundRequired: true,
                expiresAt: order.expiresAt,
                error: 'Hardware state uncertain: session state could not be finalized. Table has been locked.'
            };
        }

        order.status = 'active';
        order.sessionId = activationResult.body.sessionId;
        order.expiresAt = activationResult.body.expiresAt;
        order.activatedAt = new Date().toISOString();
        memoryDb.holds.delete(order.tableId);
        saveMemorySessions();

        return {
            success: true,
            orderId: order.orderId,
            sessionId: order.sessionId,
            expiresAt: order.expiresAt,
            hardware: activationResult.body.hardware
        };
    } else {
        if (activationResult.body?.code === 'HARDWARE_UNCERTAIN' || activationResult.body?.tableLocked) {
            order.status = 'hardware_uncertain';
            order.refundStatus = 'refund_required';
            order.refundReason = activationResult.body.error;
            order.lastErrorCode = 'HARDWARE_UNCERTAIN';
            order.lastErrorDetails = activationResult.body.details || activationResult.body.error;
            order.sessionId = memoryDb.sessions.get(order.tableId)?.id || null;
            order.expiresAt = activationResult.body?.expiresAt || null;
            memoryDb.holds.delete(order.tableId);
            const cfg = memoryDb.tableConfigs.get(order.tableId);
            if (cfg) cfg.lock_state = 'error_locked';
            saveMemorySessions();

            return {
                success: false,
                statusCode: 502,
                code: 'HARDWARE_UNCERTAIN',
                tableLocked: true,
                refundRequired: true,
                expiresAt: order.expiresAt,
                error: activationResult.body.error
            };
        }

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
async function getOrderStatus({ tableId, orderId, clientToken }) {
    const sb = getSupabase();
    if (sb) {
        try {
            const { data: order } = await sb
                .from('arcade_orders')
                .select('*')
                .eq('order_id', orderId)
                .maybeSingle();

            if (order) {
                if (tableId && order.table_id !== tableId) return null;
                if (clientToken) {
                    const crypto = require('crypto');
                    const hash = crypto.createHash('sha256').update(clientToken.trim()).digest('hex');
                    if (order.client_token_hash && order.client_token_hash !== hash) {
                        return null;
                    }
                }

                let timeRemainingSecs = 0;
                if (order.status === 'active' && order.expires_at) {
                    const expMs = new Date(order.expires_at).getTime();
                    timeRemainingSecs = Math.max(0, Math.round((expMs - Date.now()) / 1000));
                }

                return {
                    orderId: order.order_id,
                    tableId: order.table_id,
                    durationMinutes: order.duration_minutes,
                    amountCents: order.amount_cents,
                    currency: order.currency,
                    status: order.status,
                    isActivated: order.status === 'active',
                    timeRemainingSecs,
                    expiresAt: order.expires_at,
                    holdExpiresAt: order.hold_expires_at,
                    refundStatus: order.refund_status,
                    errorReason: order.refund_reason || order.last_error_details
                };
            }
        } catch (e) {
            console.warn('[ARCADE-CORE] getOrderStatus DB query failed:', e.message);
        }
    }

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

function getSessionSecret(isTestMode) {
    const secret = process.env.ARCADE_SESSION_SECRET;
    if (!secret || typeof secret !== 'string' || secret.trim() === '') {
        return null;
    }
    return secret.trim();
}

function computeCallerHash(venueId, callerIdentifier, clientIp) {
    // Ankkuroi ensisijaisesti todelliseen asiakas-IP-osoitteeseen,
    // jotta selaimen fingerprintin vaihtaminen ei nollaa yrityslaskuria saman IP:n sisällä.
    const anchor = (clientIp && clientIp !== 'unknown') ? clientIp : (callerIdentifier || 'anonymous');
    const raw = `${venueId || 'unknown'}:${anchor}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

function hashPinNode(pin, salt) {
    return crypto.scryptSync(pin, salt, 64).toString('hex');
}

function signVenueStaffSession({ venueId, venueName, pinVersion, isTestMode }) {
    const secret = getSessionSecret(isTestMode);
    if (!secret) {
        throw new Error('SESSION_SECRET_MISSING');
    }
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        type: 'venue_staff',
        venue_id: venueId,
        venue_name: venueName,
        pin_version: pinVersion,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (8 * 3600)
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
}

function verifyVenueStaffSession(token, isTestMode) {
    const secret = getSessionSecret(isTestMode);
    if (!secret) {
        return {
            ok: false,
            statusCode: 503,
            code: 'SESSION_SECRET_MISSING',
            error: 'Palvelimen konfiguraatiovirhe: ARCADE_SESSION_SECRET puuttuu.'
        };
    }
    if (!token || typeof token !== 'string') {
        return { ok: false, statusCode: 401, code: 'INVALID_TOKEN', error: 'Istuntotunnus puuttuu.' };
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { ok: false, statusCode: 401, code: 'INVALID_TOKEN', error: 'Virheellinen istuntotunnuksen muoto.' };
    }
    const [header, payload, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
        return { ok: false, statusCode: 401, code: 'INVALID_TOKEN', error: 'Virheellinen istuntoallekirjoitus.' };
    }
    let data;
    try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch (e) {
        return { ok: false, statusCode: 401, code: 'INVALID_TOKEN', error: 'Virheellinen istuntodata.' };
    }
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
        return { ok: false, statusCode: 401, code: 'SESSION_EXPIRED', error: 'Henkilökunnan istunto on vanhentunut. Kirjaudu sisään uudelleen.' };
    }
    return { ok: true, session: data };
}

async function verifyVenuePin({ tableId, pin, callerHash, isTestMode }) {
    if (!tableId || !pin) {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: 'Puuttuvia parametreja.' };
    }

    const sb = getSupabase();
    if (sb) {
        try {
            const { data, error } = await sb.rpc('arcade_verify_venue_pin', {
                p_table_id: tableId,
                p_pin: pin,
                p_caller_hash: callerHash || 'anon'
            });
            if (error) {
                console.error('[SUPABASE RPC ERROR] arcade_verify_venue_pin:', error.message);
                return { success: false, statusCode: 500, code: 'DB_RPC_ERROR', error: error.message };
            }
            return data;
        } catch (err) {
            return { success: false, statusCode: 500, code: 'DB_RPC_EXCEPTION', error: err.message };
        }
    }

    if (!isTestMode) {
        return { success: false, statusCode: 503, code: 'DATABASE_NOT_CONFIGURED', error: 'Tietokantayhteys puuttuu.' };
    }

    // In-memory simulation
    const cfg = getTableConfig(tableId, isTestMode);
    if (!cfg) {
        return { success: false, statusCode: 404, code: 'TABLE_NOT_FOUND', error: 'Pöytää ei löydy.' };
    }
    const venueId = cfg.venue_id;
    if (!venueId) {
        return { success: false, statusCode: 400, code: 'VENUE_NOT_CONFIGURED', error: 'Pöydälle ei ole määritetty toimipaikkaa.' };
    }
    const venue = memoryDb.venues.get(venueId);
    if (!venue) {
        return { success: false, statusCode: 404, code: 'VENUE_NOT_FOUND', error: 'Toimipaikkaa ei löydy.' };
    }

    if (!venue.pin_hash) {
        return {
            success: false,
            statusCode: 400,
            code: 'PIN_NOT_CONFIGURED',
            error: 'Toimipaikalle ei ole vielä asetettu PIN-koodia. Pyydä ylläpitoa määrittämään PIN.'
        };
    }

    // Check caller lockout
    const attemptKey = `${venueId}:${callerHash || 'anon'}`;
    let caller = memoryDb.pinAttempts.get(attemptKey);
    if (!caller) {
        caller = { failed_attempts: 0, locked_until: null, last_attempt_at: Date.now() };
        memoryDb.pinAttempts.set(attemptKey, caller);
    }

    if (caller.locked_until && caller.locked_until > Date.now()) {
        return {
            success: false,
            statusCode: 429,
            code: 'CALLER_LOCKED_OUT',
            locked_until: new Date(caller.locked_until).toISOString(),
            error: 'Liian monta virheellistä yritystä tältä laitteelta. Yritä uudelleen 15 minuutin kuluttua.'
        };
    }

    // Compare PIN
    let isValid = false;
    if (venue.pin_hash.includes(':')) {
        const [h, s] = venue.pin_hash.split(':');
        isValid = hashPinNode(pin, s) === h;
    } else {
        isValid = venue.pin_hash === pin;
    }

    if (isValid) {
        caller.failed_attempts = 0;
        caller.locked_until = null;
        venue.venue_failed_attempts = 0;
        venue.venue_locked_until = null;

        memoryDb.events.push({
            table_id: tableId,
            venue_id: venueId,
            event_type: 'venue_pin_verified',
            payload: { auth_method: 'shared_venue_pin', venue_id: venueId, table_id: tableId },
            created_at: new Date().toISOString()
        });

        return {
            success: true,
            statusCode: 200,
            venue_id: venue.venue_id,
            venue_name: venue.name,
            pin_version: venue.pin_version
        };
    } else {
        caller.failed_attempts += 1;
        const attemptsRemaining = Math.max(0, 5 - caller.failed_attempts);
        if (caller.failed_attempts >= 5) {
            caller.locked_until = Date.now() + 15 * 60 * 1000;
        }

        venue.venue_failed_attempts += 1;

        memoryDb.events.push({
            table_id: tableId,
            venue_id: venueId,
            event_type: 'venue_pin_failed',
            payload: {
                auth_method: 'shared_venue_pin',
                caller_failed_attempts: caller.failed_attempts,
                caller_locked: caller.failed_attempts >= 5,
                venue_failed_attempts: venue.venue_failed_attempts
            },
            created_at: new Date().toISOString()
        });

        // Koko toimipaikan lukitsemisen sijaan korkeasta virhemäärästä (>= 25) kirjataan hälytys,
        // jotta ulkopuolinen hyökkääjä ei voi tahallisesti estää henkilökunnan pääsyä oikealla PINillä.
        if (venue.venue_failed_attempts >= 25) {
            memoryDb.events.push({
                table_id: tableId,
                venue_id: venueId,
                event_type: 'venue_pin_abuse_alert',
                payload: {
                    auth_method: 'shared_venue_pin',
                    venue_id: venueId,
                    table_id: tableId,
                    caller_hash: callerHash,
                    venue_failed_attempts: venue.venue_failed_attempts,
                    severity: 'warning',
                    alert: 'Poikkeuksellisen korkea määrä epäonnistuneita PIN-yrityksiä toimipaikalla. Mahdollinen brute-force tai DoS-yritys.'
                },
                created_at: new Date().toISOString()
            });
        }

        if (caller.failed_attempts >= 5) {
            return {
                success: false,
                statusCode: 429,
                code: 'CALLER_LOCKED_OUT',
                attempts_remaining: 0,
                locked: true,
                locked_until: new Date(caller.locked_until).toISOString(),
                error: 'Liian monta virheellistä yritystä tältä laitteelta. Lukittu 15 minuutiksi.'
            };
        }

        return {
            success: false,
            statusCode: 401,
            code: 'INVALID_PIN',
            attempts_remaining: attemptsRemaining,
            locked: false,
            error: `Virheellinen PIN-koodi. Yrityksiä jäljellä: ${attemptsRemaining}`
        };
    }
}

async function setVenuePin({ venueId, newPin, isTestMode }) {
    if (!venueId || !newPin || newPin.length < 4 || newPin.length > 8) {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: 'Uuden PIN-koodin on oltava 4–8 merkkiä.' };
    }

    const sb = getSupabase();
    if (sb) {
        try {
            const { data, error } = await sb.rpc('arcade_set_venue_pin', {
                p_venue_id: venueId,
                p_new_pin: newPin
            });
            if (error) {
                console.error('[SUPABASE RPC ERROR] arcade_set_venue_pin:', error.message);
                return { success: false, statusCode: 500, code: 'DB_RPC_ERROR', error: error.message };
            }
            return data;
        } catch (err) {
            return { success: false, statusCode: 500, code: 'DB_RPC_EXCEPTION', error: err.message };
        }
    }

    if (!isTestMode) {
        return { success: false, statusCode: 503, code: 'DATABASE_NOT_CONFIGURED', error: 'Tietokantayhteys puuttuu.' };
    }

    let venue = memoryDb.venues.get(venueId);
    if (!venue) {
        venue = { venue_id: venueId, name: venueId, pin_hash: null, pin_version: 1, venue_failed_attempts: 0, venue_locked_until: null };
        memoryDb.venues.set(venueId, venue);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPinNode(newPin, salt);
    venue.pin_hash = `${hash}:${salt}`;
    venue.pin_version += 1;
    venue.venue_failed_attempts = 0;
    venue.venue_locked_until = null;

    // Clear all caller lockouts for this venue
    for (const [k] of memoryDb.pinAttempts.entries()) {
        if (k.startsWith(`${venueId}:`)) {
            memoryDb.pinAttempts.delete(k);
        }
    }

    memoryDb.events.push({
        table_id: null,
        venue_id: venueId,
        event_type: 'venue_pin_rotated',
        payload: { venue_id: venueId, new_version: venue.pin_version },
        created_at: new Date().toISOString()
    });

    return {
        success: true,
        statusCode: 200,
        venue_id: venueId,
        pin_version: venue.pin_version
    };
}

async function resetVenueLockout({ venueId, isTestMode }) {
    if (!venueId) {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: 'Puuttuva venueId' };
    }

    const sb = getSupabase();
    if (sb) {
        try {
            const { data, error } = await sb.rpc('arcade_reset_venue_lockout', {
                p_venue_id: venueId
            });
            if (error) {
                console.error('[SUPABASE RPC ERROR] arcade_reset_venue_lockout:', error.message);
                return { success: false, statusCode: 500, code: 'DB_RPC_ERROR', error: error.message };
            }
            return data;
        } catch (err) {
            return { success: false, statusCode: 500, code: 'DB_RPC_EXCEPTION', error: err.message };
        }
    }

    if (!isTestMode) {
        return { success: false, statusCode: 503, code: 'DATABASE_NOT_CONFIGURED', error: 'Tietokantayhteys puuttuu.' };
    }

    const venue = memoryDb.venues.get(venueId);
    if (!venue) {
        return { success: false, statusCode: 404, code: 'VENUE_NOT_FOUND', error: 'Toimipaikkaa ei löydy.' };
    }

    venue.venue_failed_attempts = 0;
    venue.venue_locked_until = null;

    for (const [k] of memoryDb.pinAttempts.entries()) {
        if (k.startsWith(`${venueId}:`)) {
            memoryDb.pinAttempts.delete(k);
        }
    }

    memoryDb.events.push({
        table_id: null,
        venue_id: venueId,
        event_type: 'venue_lockout_cleared',
        payload: { venue_id: venueId },
        created_at: new Date().toISOString()
    });

    return {
        success: true,
        statusCode: 200,
        venue_id: venueId,
        message: 'Toimipaikan lukitus ja yrityslaskurit on nollattu.'
    };
}

function validateDistinctOutputs(config) {
    if (!config) return { valid: true };
    const gameId = config.switch_output_id !== undefined ? Number(config.switch_output_id) : 1;
    const displayId = config.display_output_id !== undefined && config.display_output_id !== null ? Number(config.display_output_id) : null;
    const lightsId = config.lights_output_id !== undefined && config.lights_output_id !== null ? Number(config.lights_output_id) : null;

    if (displayId !== null && displayId === gameId) {
        return { valid: false, error: `Display output ID (${displayId}) cannot match game output ID (${gameId})` };
    }
    if (lightsId !== null && lightsId === gameId) {
        return { valid: false, error: `Lights output ID (${lightsId}) cannot match game output ID (${gameId})` };
    }
    if (displayId !== null && lightsId !== null && displayId === lightsId) {
        return { valid: false, error: `Display output ID (${displayId}) cannot match lights output ID (${lightsId})` };
    }
    return { valid: true };
}

async function syncAuxOutlets({ tableId, isTestMode = false, force = false, trigger = 'auto' }) {
    const cfg = await getTableConfigAsync(tableId, isTestMode);
    if (!cfg) return { success: false, error: 'Table config not found' };

    const validation = validateDistinctOutputs(cfg);
    if (!validation.valid) {
        console.warn(`[AUX OUTLETS] Invalid output configuration for table ${tableId}: ${validation.error}`);
        return { success: false, error: validation.error };
    }

    const netio = getNetioAdapter(cfg, isTestMode);
    if (!netio) {
        return { success: true, skipped: true, reason: 'No NetIO adapter configured' };
    }

    const now = Date.now();
    const results = { display: null, lights: null };

    // 1. Display target state calculation
    const displayOutputId = cfg.display_output_id !== undefined && cfg.display_output_id !== null ? Number(cfg.display_output_id) : 2;
    let targetDisplayState = 1; // Always ON by default
    if (cfg.display_mode === 'manual_off' && cfg.display_manual_until && new Date(cfg.display_manual_until).getTime() > now) {
        targetDisplayState = 0;
    } else if (cfg.display_mode === 'manual_on' && cfg.display_manual_until && new Date(cfg.display_manual_until).getTime() > now) {
        targetDisplayState = 1;
    } else if (cfg.display_mode !== 'auto' && cfg.display_manual_until && new Date(cfg.display_manual_until).getTime() <= now) {
        cfg.display_mode = 'auto';
        cfg.display_manual_until = null;
        targetDisplayState = 1;
    }

    // 2. Lights target state calculation
    const lightsOutputId = cfg.lights_output_id !== undefined && cfg.lights_output_id !== null ? Number(cfg.lights_output_id) : 3;
    let targetLightsState = 1; // Default auto: ON when available
    if (cfg.lights_mode === 'manual_off' && cfg.lights_manual_until && new Date(cfg.lights_manual_until).getTime() > now) {
        targetLightsState = 0;
    } else if (cfg.lights_mode === 'manual_on' && cfg.lights_manual_until && new Date(cfg.lights_manual_until).getTime() > now) {
        targetLightsState = 1;
    } else {
        if (cfg.lights_mode !== 'auto' && cfg.lights_manual_until && new Date(cfg.lights_manual_until).getTime() <= now) {
            cfg.lights_mode = 'auto';
            cfg.lights_manual_until = null;
        }

        const isTableBusy = (cfg.lock_state === 'active' || cfg.lock_state === 'pending_payment') || (memoryDb.sessions.get(tableId)?.status === 'active');
        const isTableMaintenance = (cfg.lock_state === 'maintenance_locked' || cfg.lock_state === 'error_locked');

        if (isTableBusy || isTableMaintenance) {
            targetLightsState = 0;
        } else {
            targetLightsState = 1;
        }
    }

    if (!cfg._last_aux_states) {
        cfg._last_aux_states = {};
    }

    // Execute Display command if needed
    if (displayOutputId && (force || cfg._last_aux_states.display !== targetDisplayState)) {
        try {
            await netio.setOutletState(displayOutputId, targetDisplayState === 1);
            cfg._last_aux_states.display = targetDisplayState;
            results.display = { outputId: displayOutputId, state: targetDisplayState, success: true };
        } catch (dErr) {
            console.warn(`[AUX OUTLETS WARNING] Failed to set display outlet ${displayOutputId} to ${targetDisplayState}:`, dErr.message);
            results.display = { outputId: displayOutputId, error: dErr.message, success: false };
            const sb = getSupabase();
            if (sb) {
                try {
                    await sb.from('arcade_events').insert({
                        table_id: tableId,
                        event_type: 'aux_outlet_warning',
                        payload: { outletRole: 'display', outputId: displayOutputId, targetState: targetDisplayState, error: dErr.message, trigger }
                    });
                } catch (e) {}
            }
        }
    } else {
        results.display = { outputId: displayOutputId, state: cfg._last_aux_states.display ?? targetDisplayState, unchanged: true };
    }

    // Execute Lights command if needed
    if (lightsOutputId && (force || cfg._last_aux_states.lights !== targetLightsState)) {
        try {
            await netio.setOutletState(lightsOutputId, targetLightsState === 1);
            cfg._last_aux_states.lights = targetLightsState;
            results.lights = { outputId: lightsOutputId, state: targetLightsState, success: true };
        } catch (lErr) {
            console.warn(`[AUX OUTLETS WARNING] Failed to set lights outlet ${lightsOutputId} to ${targetLightsState}:`, lErr.message);
            results.lights = { outputId: lightsOutputId, error: lErr.message, success: false };
            const sb = getSupabase();
            if (sb) {
                try {
                    await sb.from('arcade_events').insert({
                        table_id: tableId,
                        event_type: 'aux_outlet_warning',
                        payload: { outletRole: 'lights', outputId: lightsOutputId, targetState: targetLightsState, error: lErr.message, trigger }
                    });
                } catch (e) {}
            }
        }
    } else {
        results.lights = { outputId: lightsOutputId, state: cfg._last_aux_states.lights ?? targetLightsState, unchanged: true };
    }

    return {
        success: true,
        trigger,
        results
    };
}

async function setAuxOutletMode({ tableId, outletRole, mode, durationMinutes = 30, isTestMode }) {
    if (!['display', 'lights'].includes(outletRole)) {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: "outletRole must be 'display' or 'lights'" };
    }
    if (!['auto', 'manual_on', 'manual_off'].includes(mode)) {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: "mode must be 'auto', 'manual_on', or 'manual_off'" };
    }

    const cfg = await getTableConfigAsync(tableId, isTestMode);
    if (!cfg) {
        return { success: false, statusCode: 404, code: 'TABLE_NOT_FOUND', error: 'Pöytää ei löydy.' };
    }

    const outputId = outletRole === 'display' 
        ? (cfg.display_output_id !== undefined && cfg.display_output_id !== null ? Number(cfg.display_output_id) : 2)
        : (cfg.lights_output_id !== undefined && cfg.lights_output_id !== null ? Number(cfg.lights_output_id) : 3);

    const manualUntil = mode === 'auto' ? null : new Date(Date.now() + (durationMinutes || 30) * 60000).toISOString();

    const sb = getSupabase();
    if (sb) {
        try {
            await sb.rpc('arcade_set_aux_outlet_mode', {
                p_table_id: tableId,
                p_outlet_role: outletRole,
                p_mode: mode,
                p_duration_minutes: durationMinutes
            });
        } catch (e) {
            console.warn('[ARCADE-CORE] Failed to persist aux mode to DB:', e.message);
        }
    }

    if (outletRole === 'display') {
        cfg.display_mode = mode;
        cfg.display_manual_until = manualUntil;
    } else {
        cfg.lights_mode = mode;
        cfg.lights_manual_until = manualUntil;
    }

    const memCfg = memoryDb.tableConfigs.get(tableId);
    if (memCfg && memCfg !== cfg) {
        if (outletRole === 'display') {
            memCfg.display_mode = mode;
            memCfg.display_manual_until = manualUntil;
        } else {
            memCfg.lights_mode = mode;
            memCfg.lights_manual_until = manualUntil;
        }
    }

    const syncRes = await syncAuxOutlets({ tableId, isTestMode, force: true, trigger: `moderator_manual_${mode}` });
    const actualState = outletRole === 'display' ? syncRes.results?.display?.state : syncRes.results?.lights?.state;

    memoryDb.events.push({
        table_id: tableId,
        venue_id: cfg.venue_id || null,
        event_type: 'moderator_aux_override',
        payload: {
            outletRole,
            outputId,
            mode,
            durationMinutes,
            manualUntil,
            actualState
        },
        created_at: new Date().toISOString()
    });

    saveMemorySessions();

    return {
        success: true,
        statusCode: 200,
        tableId,
        outletRole,
        outputId,
        mode,
        manualUntil,
        actualState: actualState ?? (mode === 'manual_off' ? 0 : 1)
    };
}

async function recordDisplayHeartbeat({ tableId, isTestMode }) {
    if (!tableId) {
        return { success: false, statusCode: 400, code: 'INVALID_PARAMETERS', error: 'tableId is required' };
    }
    const cfg = await getTableConfigAsync(tableId, isTestMode);
    if (!cfg) {
        return { success: false, statusCode: 404, code: 'TABLE_NOT_FOUND', error: 'Table not found' };
    }

    const heartbeatAt = new Date().toISOString();
    cfg.display_last_heartbeat_at = heartbeatAt;
    const memCfg = memoryDb.tableConfigs.get(tableId);
    if (memCfg && memCfg !== cfg) {
        memCfg.display_last_heartbeat_at = heartbeatAt;
    }

    const sb = getSupabase();
    if (sb) {
        try {
            await sb.rpc('arcade_record_display_heartbeat', { p_table_id: tableId });
        } catch (e) {}
    }

    return {
        success: true,
        statusCode: 200,
        tableId,
        heartbeatAt
    };
}

function getDisplayStatus(tableConfig, netioStatus) {
    const lastHeartbeat = tableConfig?.display_last_heartbeat_at;
    const now = Date.now();
    const heartbeatAgeSec = lastHeartbeat ? Math.round((now - new Date(lastHeartbeat).getTime()) / 1000) : null;
    
    const displayOutputId = tableConfig?.display_output_id !== undefined && tableConfig?.display_output_id !== null ? Number(tableConfig.display_output_id) : 2;
    const outlet = netioStatus?.outputs?.find(o => o.id === displayOutputId);
    const isRelayOn = outlet ? outlet.state === 1 : true;

    // Display is considered online if relay is ON and heartbeat has been seen within 90s
    const isOnline = isRelayOn && heartbeatAgeSec !== null && heartbeatAgeSec <= 90;

    return {
        outletId: displayOutputId,
        state: outlet ? outlet.state : (isRelayOn ? 1 : 0),
        mode: tableConfig?.display_mode || 'auto',
        manualUntil: tableConfig?.display_manual_until || null,
        isOnline,
        heartbeatAgeSec,
        lastHeartbeatAt: lastHeartbeat || null
    };
}

function getLightsStatus(tableConfig, netioStatus) {
    const lightsOutputId = tableConfig?.lights_output_id !== undefined && tableConfig?.lights_output_id !== null ? Number(tableConfig.lights_output_id) : 3;
    const outlet = netioStatus?.outputs?.find(o => o.id === lightsOutputId);
    const isRelayOn = outlet ? outlet.state === 1 : (tableConfig?.lock_state === 'available');

    return {
        outletId: lightsOutputId,
        state: outlet ? outlet.state : (isRelayOn ? 1 : 0),
        mode: tableConfig?.lights_mode || 'auto',
        manualUntil: tableConfig?.lights_manual_until || null
    };
}

function resetMemoryDb() {
    memoryDb.sessions.clear();
    memoryDb.orders.clear();
    memoryDb.holds.clear();
    memoryDb.pinAttempts.clear();
    memoryDb.processedPaymentIntents.clear();
    try {
        if (fs.existsSync(SESSIONS_PERSIST_FILE)) {
            fs.unlinkSync(SESSIONS_PERSIST_FILE);
        }
    } catch (e) {}
    memoryDb.events.length = 0;
    memoryDb._simulateDbErrorOnActivate = false;
    memoryDb._simulateDispatchError = false;
    memoryDb.tableConfigs.set('demo-pulse-01', { table_id: 'demo-pulse-01', venue_id: 'venue-demo-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: true, device_endpoint: null });
    memoryDb.tableConfigs.set('demo-arcade-02', { table_id: 'demo-arcade-02', venue_id: 'venue-demo-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('demo-locked-03', { table_id: 'demo-locked-03', venue_id: 'venue-demo-01', is_enabled: false, lock_state: 'maintenance_locked', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('subsoccer-tripla-live-01', { table_id: 'subsoccer-tripla-live-01', venue_id: 'venue-tripla', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: false, device_endpoint: null });
    memoryDb.tableConfigs.set('subsoccer-freeplay-venue-01', { table_id: 'subsoccer-freeplay-venue-01', venue_id: 'venue-freeplay-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, display_output_id: 2, lights_output_id: 3, display_mode: 'auto', lights_mode: 'auto', display_manual_until: null, lights_manual_until: null, display_last_heartbeat_at: null, is_free_play_allowed: true, device_endpoint: null });
    memoryDb.venues.set('venue-demo-01', { venue_id: 'venue-demo-01', name: 'Mall of Tripla Demo Venue', pin_hash: null, pin_version: 1, venue_failed_attempts: 0, venue_locked_until: null });
    memoryDb.venues.set('venue-tripla', { venue_id: 'venue-tripla', name: 'Mall of Tripla Subsoccer Lounge', pin_hash: null, pin_version: 1, venue_failed_attempts: 0, venue_locked_until: null });
    memoryDb.venues.set('venue-freeplay-01', { venue_id: 'venue-freeplay-01', name: 'Freeplay Venue', pin_hash: null, pin_version: 1, venue_failed_attempts: 0, venue_locked_until: null });
    memoryDb._mockNetioConfig = {};
    memoryDb._mockNetioInstance = null;
    memoryDb._simulateFinalizeError = false;
    memoryDb._simulateFinalizeTimeout = false;
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
    createFreePlayHold,
    releasePaymentHold,
    setTableMaintenance,
    bindPaymentIntent,
    getTableConfigAsync,
    getVenueAsync,
    getSupabase,
    activateSessionCore,
    claimAndActivateOrder,
    getOrderStatus,
    getStripeClient,
    _setStripeClient,
    getSessionSecret,
    computeCallerHash,
    hashPinNode,
    signVenueStaffSession,
    verifyVenueStaffSession,
    verifyVenuePin,
    setVenuePin,
    resetVenueLockout,
    validateDistinctOutputs,
    syncAuxOutlets,
    setAuxOutletMode,
    recordDisplayHeartbeat,
    getDisplayStatus,
    getLightsStatus,
    _setSupabaseClient: (client) => { supabase = client; },
    _getSupabaseClient: () => supabase
};

