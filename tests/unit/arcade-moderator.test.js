process.env.NODE_ENV = 'test';
process.env.ARCADE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_123456';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_secret';
process.env.ARCADE_SESSION_SECRET = 'test-session-secret-key-32byteslong!';
process.env.ADMIN_TOKEN = 'test-admin-secret-token';

const assert = require('assert');
const { handler: sessionHandler } = require('../../netlify/functions/arcade-session.js');
const { handler: createPaymentIntentHandler, _setStripeClient: setCreateStripeClient } = require('../../netlify/functions/create-payment-intent.js');
const {
    PRICE_CATALOG,
    memoryDb,
    resetMemoryDb,
    createPaymentHold,
    createFreePlayHold,
    setTableMaintenance,
    setVenuePin,
    resetVenueLockout,
    claimAndActivateOrder,
    reconcileTableState,
    _setSupabaseClient,
    _setStripeClient
} = require('../../netlify/functions/utils/arcade-core.js');

describe('Subsoccer Arcade Phase 1: Moderator & Maintenance Mode', () => {
    let mockStripe;

    beforeEach(() => {
        resetMemoryDb();
        _setSupabaseClient(null);

        mockStripe = {
            paymentIntents: {
                create: async (params, opts) => ({
                    id: `pi_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    client_secret: `pi_test_secret_${Date.now()}`,
                    amount: params.amount,
                    currency: params.currency,
                    metadata: params.metadata,
                    status: 'requires_payment_method',
                    livemode: false
                }),
                cancel: async (id, opts) => ({ id, status: 'canceled' })
            },
            refunds: {
                create: async (params, opts) => ({
                    id: `re_${Date.now()}`,
                    status: 'succeeded',
                    payment_intent: params.payment_intent,
                    idempotencyKey: opts?.idempotencyKey
                })
            }
        };

        setCreateStripeClient(mockStripe);
        _setStripeClient(mockStripe);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 1. VENUE PIN AUTHENTICATION & SECURITY (PHASE 1)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Venue PIN Authentication & Moderator Security', () => {
        it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
            const res = await sessionHandler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'set-maintenance',
                    table: 'demo-pulse-01',
                    enabled: true
                })
            }, {});

            assert.strictEqual(res.statusCode, 401);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'UNAUTHORIZED');
        });

        it('fails closed with 503 SESSION_SECRET_MISSING when ARCADE_SESSION_SECRET is missing', async () => {
            const originalSecret = process.env.ARCADE_SESSION_SECRET;
            delete process.env.ARCADE_SESSION_SECRET;

            try {
                // Set a PIN first
                await setVenuePin({ venueId: 'venue-demo-01', newPin: '1234', isTestMode: true });

                const res = await sessionHandler({
                    httpMethod: 'POST',
                    body: JSON.stringify({
                        action: 'staff-pin-login',
                        table: 'demo-pulse-01',
                        pin: '1234'
                    })
                }, {});

                assert.strictEqual(res.statusCode, 503);
                const body = JSON.parse(res.body);
                assert.strictEqual(body.code, 'SESSION_SECRET_MISSING');
            } finally {
                process.env.ARCADE_SESSION_SECRET = originalSecret;
            }
        });

        it('allows superadmin to set venue PIN with admin token and rejects non-admin (401)', async () => {
            // 1. Without admin token -> 401
            const unauthRes = await sessionHandler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'set-venue-pin',
                    venueId: 'venue-demo-01',
                    newPin: '5678'
                })
            }, {});
            assert.strictEqual(unauthRes.statusCode, 401);

            // 2. With admin token -> 200
            const authRes = await sessionHandler({
                httpMethod: 'POST',
                headers: {
                    'x-admin-token': 'test-admin-secret-token'
                },
                body: JSON.stringify({
                    action: 'set-venue-pin',
                    venueId: 'venue-demo-01',
                    newPin: '5678'
                })
            }, {});
            assert.strictEqual(authRes.statusCode, 200);
            const body = JSON.parse(authRes.body);
            assert.strictEqual(body.success, true);
            assert.strictEqual(body.venueId, 'venue-demo-01');
            assert.strictEqual(body.pinVersion, 2);
        });

        it('authenticates staff with correct PIN and returns signed session token', async () => {
            await setVenuePin({ venueId: 'venue-demo-01', newPin: '1234', isTestMode: true });

            const res = await sessionHandler({
                httpMethod: 'POST',
                headers: {
                    'x-forwarded-for': '192.168.1.100'
                },
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '1234',
                    clientFingerprint: 'device-staff-1'
                })
            }, {});

            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.success, true);
            assert.ok(body.token);
            assert.strictEqual(body.venueId, 'venue-demo-01');
            assert.strictEqual(body.pinVersion, 2);
            assert.ok(body.expiresAt);
        });

        it('returns 401 INVALID_PIN and tracks attempts remaining on wrong PIN', async () => {
            await setVenuePin({ venueId: 'venue-demo-01', newPin: '1234', isTestMode: true });

            const res = await sessionHandler({
                httpMethod: 'POST',
                headers: {
                    'x-forwarded-for': '192.168.1.100'
                },
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '9999',
                    clientFingerprint: 'device-staff-1'
                })
            }, {});

            assert.strictEqual(res.statusCode, 401);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'INVALID_PIN');
            assert.strictEqual(body.attemptsRemaining, 4);
            assert.strictEqual(body.locked, false);
        });

        it('locks out caller after 5 failed attempts (429 Anti-DoS) while allowing another caller to authenticate', async () => {
            await setVenuePin({ venueId: 'venue-demo-01', newPin: '1234', isTestMode: true });

            // Caller A fails 4 times -> 401
            for (let i = 1; i <= 4; i++) {
                const res = await sessionHandler({
                    httpMethod: 'POST',
                    headers: { 'x-forwarded-for': '192.168.1.10' },
                    body: JSON.stringify({
                        action: 'staff-pin-login',
                        table: 'demo-pulse-01',
                        pin: '0000',
                        clientFingerprint: 'device-attacker-A'
                    })
                }, {});
                assert.strictEqual(res.statusCode, 401);
            }

            // 5th attempt from Caller A -> 429 CALLER_LOCKED_OUT
            const lockRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { 'x-forwarded-for': '192.168.1.10' },
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '0000',
                    clientFingerprint: 'device-attacker-A'
                })
            }, {});
            assert.strictEqual(lockRes.statusCode, 429);
            const lockBody = JSON.parse(lockRes.body);
            assert.strictEqual(lockBody.code, 'CALLER_LOCKED_OUT');
            assert.strictEqual(lockBody.locked, true);
            assert.ok(lockBody.lockedUntil);

            // Subsequent attempt from Caller A (even with correct PIN) is still blocked
            const blockedRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { 'x-forwarded-for': '192.168.1.10' },
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '1234',
                    clientFingerprint: 'device-attacker-A'
                })
            }, {});
            assert.strictEqual(blockedRes.statusCode, 429);

            // Caller B (legitimate staff on another device / IP) can still log in successfully!
            const callerBRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { 'x-forwarded-for': '192.168.1.55' },
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '1234',
                    clientFingerprint: 'device-staff-B'
                })
            }, {});
            assert.strictEqual(callerBRes.statusCode, 200);
            const callerBBody = JSON.parse(callerBRes.body);
            assert.strictEqual(callerBBody.success, true);
        });

        it('triggers venue-wide lockout after 25 failures across callers, blocking all until reset', async () => {
            await setVenuePin({ venueId: 'venue-demo-01', newPin: '1234', isTestMode: true });

            // Generate 25 failures across different IPs / callers
            for (let i = 1; i <= 25; i++) {
                await sessionHandler({
                    httpMethod: 'POST',
                    headers: { 'x-forwarded-for': `10.0.0.${i}` },
                    body: JSON.stringify({
                        action: 'staff-pin-login',
                        table: 'demo-pulse-01',
                        pin: 'wrong',
                        clientFingerprint: `fp-${i}`
                    })
                }, {});
            }

            // Venue is now locked out: even a new caller with the CORRECT PIN gets 429 VENUE_LOCKED_OUT
            const venueLockedRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { 'x-forwarded-for': '10.0.1.99' },
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '1234',
                    clientFingerprint: 'fp-clean'
                })
            }, {});
            assert.strictEqual(venueLockedRes.statusCode, 429);
            const body = JSON.parse(venueLockedRes.body);
            assert.strictEqual(body.code, 'VENUE_LOCKED_OUT');

            // Superadmin unlocks the venue via reset-venue-lockout
            const resetRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { 'x-admin-token': 'test-admin-secret-token' },
                body: JSON.stringify({
                    action: 'reset-venue-lockout',
                    venueId: 'venue-demo-01'
                })
            }, {});
            assert.strictEqual(resetRes.statusCode, 200);

            // Now clean caller can authenticate
            const recoveredRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { 'x-forwarded-for': '10.0.1.99' },
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '1234',
                    clientFingerprint: 'fp-clean'
                })
            }, {});
            assert.strictEqual(recoveredRes.statusCode, 200);
        });

        it('revokes previously issued sessions immediately upon PIN rotation (SESSION_REVOKED)', async () => {
            // 1. Set initial PIN and log in
            await setVenuePin({ venueId: 'venue-demo-01', newPin: '1234', isTestMode: true });

            const loginRes = await sessionHandler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '1234'
                })
            }, {});
            assert.strictEqual(loginRes.statusCode, 200);
            const { token: oldSessionToken } = JSON.parse(loginRes.body);

            // 2. Old token works for moderator action
            const actionRes1 = await sessionHandler({
                httpMethod: 'POST',
                headers: { authorization: `Bearer ${oldSessionToken}` },
                body: JSON.stringify({
                    action: 'set-maintenance',
                    table: 'demo-pulse-01',
                    enabled: true
                })
            }, {});
            assert.strictEqual(actionRes1.statusCode, 200);

            // 3. Superadmin rotates venue PIN
            const rotateRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { 'x-admin-token': 'test-admin-secret-token' },
                body: JSON.stringify({
                    action: 'set-venue-pin',
                    venueId: 'venue-demo-01',
                    newPin: '7777'
                })
            }, {});
            assert.strictEqual(rotateRes.statusCode, 200);

            // 4. Old session token is now rejected with 401 SESSION_REVOKED
            const actionRes2 = await sessionHandler({
                httpMethod: 'POST',
                headers: { authorization: `Bearer ${oldSessionToken}` },
                body: JSON.stringify({
                    action: 'set-maintenance',
                    table: 'demo-pulse-01',
                    enabled: false
                })
            }, {});
            assert.strictEqual(actionRes2.statusCode, 401);
            const errBody = JSON.parse(actionRes2.body);
            assert.strictEqual(errBody.code, 'SESSION_REVOKED');
        });

        it('enforces venue scoping and blocks cross-venue table access with 403 FORBIDDEN_TABLE', async () => {
            // Set PIN for Venue A (demo-01) and log in
            await setVenuePin({ venueId: 'venue-demo-01', newPin: '1234', isTestMode: true });
            const loginRes = await sessionHandler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'staff-pin-login',
                    table: 'demo-pulse-01',
                    pin: '1234'
                })
            }, {});
            const { token: venueAToken } = JSON.parse(loginRes.body);

            // Staff from Venue A tries to grant free play on Table in Venue B (subsoccer-tripla-live-01 belongs to venue-tripla)
            const crossRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { authorization: `Bearer ${venueAToken}` },
                body: JSON.stringify({
                    action: 'grant-free-play',
                    table: 'subsoccer-tripla-live-01',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(crossRes.statusCode, 403);
            const body = JSON.parse(crossRes.body);
            assert.strictEqual(body.code, 'FORBIDDEN_TABLE');
        });

        it('accepts staff with test-moderator-token in test mode for rapid development', async () => {
            const res = await sessionHandler({
                httpMethod: 'POST',
                headers: {
                    authorization: 'Bearer test-moderator-token'
                },
                body: JSON.stringify({
                    action: 'set-maintenance',
                    table: 'demo-pulse-01',
                    enabled: true
                })
            }, {});

            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.success, true);
            assert.strictEqual(body.lockState, 'maintenance_locked');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. RACE CONDITIONS: STRIPE PAYMENT VS MODERATOR FREE PLAY
    // ──────────────────────────────────────────────────────────────────────────
    describe('Payment & Free Play Race Conditions', () => {
        it('blocks free play hold with 409 conflict when a payment hold is active', async () => {
            // 1. Customer initiates paid checkout and creates payment hold
            const hold = await createPaymentHold({
                tableId: 'demo-pulse-01',
                durationMinutes: 15,
                clientToken: 'customer-tok-123',
                isTestMode: true
            });
            assert.strictEqual(hold.success, true);
            assert.strictEqual(hold.order.status, 'pending_payment');

            // 2. Moderator concurrently attempts to grant free play on the same table
            const freePlayRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { authorization: 'Bearer test-moderator-token' },
                body: JSON.stringify({
                    action: 'grant-free-play',
                    table: 'demo-pulse-01',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(freePlayRes.statusCode, 409);
            const body = JSON.parse(freePlayRes.body);
            assert.strictEqual(body.code, 'TABLE_HELD');
        });

        it('blocks payment hold with 409 conflict when a moderator free play hold is active', async () => {
            // 1. Moderator creates free play hold
            const freeHold = await createFreePlayHold({
                tableId: 'demo-pulse-01',
                durationMinutes: 5,
                clientToken: 'mod-tok-456',
                isTestMode: true
            });
            assert.strictEqual(freeHold.success, true);
            assert.strictEqual(freeHold.amountCents, 0);

            // 2. Customer attempts to create paid checkout hold
            const payHold = await createPaymentHold({
                tableId: 'demo-pulse-01',
                durationMinutes: 15,
                clientToken: 'customer-late-tok',
                isTestMode: true
            });

            assert.strictEqual(payHold.success, false);
            assert.strictEqual(payHold.statusCode, 409);
            assert.strictEqual(payHold.code, 'TABLE_HELD');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. ACTIVE GAME ENDING INTO PENDING MAINTENANCE
    // ──────────────────────────────────────────────────────────────────────────
    describe('Active Game Ending into Pending Maintenance', () => {
        it('preserves active game when maintenance requested and transitions to maintenance_locked upon finish', async () => {
            const table = 'demo-pulse-01';

            // 1. Start an active game (5 minutes)
            const actRes = await sessionHandler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table,
                    durationMinutes: 5,
                    clientToken: 'player-active-game'
                })
            }, {});
            assert.strictEqual(actRes.statusCode, 200);

            // Table state should now be active
            const session = memoryDb.sessions.get(table);
            assert.ok(session);
            assert.strictEqual(session.status, 'active');

            // 2. Moderator sets maintenance mode while game is active
            const maintRes = await sessionHandler({
                httpMethod: 'POST',
                headers: { authorization: 'Bearer test-moderator-token' },
                body: JSON.stringify({
                    action: 'set-maintenance',
                    table,
                    enabled: true,
                    reason: 'Daily surface cleaning scheduled'
                })
            }, {});

            assert.strictEqual(maintRes.statusCode, 200);
            const maintBody = JSON.parse(maintRes.body);
            assert.strictEqual(maintBody.success, true);
            assert.strictEqual(maintBody.pendingMaintenanceLock, true);
            assert.strictEqual(maintBody.isDeferred, true);

            // 3. Verify GET status shows table STILL active, but pendingMaintenanceLock is true
            const statusRes1 = await sessionHandler({
                httpMethod: 'GET',
                queryStringParameters: { table }
            }, {});
            const status1 = JSON.parse(statusRes1.body);
            assert.strictEqual(status1.state, 'active');
            assert.strictEqual(status1.pendingMaintenanceLock, true);
            assert.ok(status1.timeRemainingSecs > 0);

            // 4. Verify new booking/activation attempt is blocked during pending maintenance
            const conflictRes = await sessionHandler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table,
                    durationMinutes: 5,
                    clientToken: 'sneaky-player'
                })
            }, {});
            assert.strictEqual(conflictRes.statusCode, 409);

            // 5. Game expires naturally: advance clock past expiresAt + 4000ms safety buffer
            session.expiresAt = Date.now() - 5000;

            // Hardware confirms State 0
            memoryDb._mockNetioConfig = { mockStatusOutputState: 0 };

            // 6. Background reconciliation triggers (e.g. status check)
            const statusRes2 = await sessionHandler({
                httpMethod: 'GET',
                queryStringParameters: { table }
            }, {});
            const status2 = JSON.parse(statusRes2.body);

            // CRITICAL: Must transition to 'maintenance_locked', NOT 'available'!
            assert.strictEqual(status2.state, 'maintenance_locked');
            assert.strictEqual(status2.pendingMaintenanceLock, false);

            const cfg = memoryDb.tableConfigs.get(table);
            assert.strictEqual(cfg.lock_state, 'maintenance_locked');
            assert.strictEqual(cfg.pending_maintenance_lock, false);

            // 7. Any activation attempt is now strictly blocked with 423 TABLE_LOCKED
            const blockedRes = await sessionHandler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table,
                    durationMinutes: 5,
                    clientToken: 'player-after-maint'
                })
            }, {});
            assert.strictEqual(blockedRes.statusCode, 423);
            const blockedBody = JSON.parse(blockedRes.body);
            assert.strictEqual(blockedBody.code, 'TABLE_LOCKED');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. PREMATURE CUTOFF & TELEMETRY (DEVICE RESTARTED VS POWER LOSS)
    // ──────────────────────────────────────────────────────────────────────────
    describe('Premature Cutoff & Watchdog Telemetry', () => {
        it('records premature cutoff with Uptime < 120 as device_restarted and triggers idempotent refund', async () => {
            const table = 'demo-pulse-01';

            // 1. Create paid order & session
            const hold = await createPaymentHold({
                tableId: table,
                durationMinutes: 5,
                clientToken: 'client-reboot-probe',
                isTestMode: true
            });
            assert.strictEqual(hold.success, true);

            const order = hold.order;
            order.stripePaymentIntentId = 'pi_test_reboot_123';
            order.status = 'active';

            const session = {
                id: 'sess-active-reboot',
                tableId: table,
                durationSeconds: 300,
                status: 'active',
                expiresAt: Date.now() + 250000 // Still 4+ minutes remaining
            };
            memoryDb.sessions.set(table, session);
            order.sessionId = session.id;

            const cfg = memoryDb.tableConfigs.get(table);
            cfg.lock_state = 'active';

            // 2. Hardware abruptly restarted: NETIO rebooted (Uptime: 45s), Output 1 reset to State 0
            memoryDb._mockNetioConfig = {
                mockStatusOutputState: 0,
                mockUptime: 45
            };

            // 3. Background watchdog / polling reconciliation detects premature State 0
            const netio = {
                isMock: true,
                mockStatusOutputState: 0,
                verifyConfirmedOff: async () => true,
                getStatus: async () => ({
                    device: { uptime: 45, Uptime: 45 },
                    outputs: [{ id: 1, state: 0 }]
                })
            };

            await reconcileTableState(table, cfg, netio, true);

            // 4. Verification: Reason must be device_restarted (NOT power outage)
            assert.strictEqual(session.status, 'failed');
            assert.strictEqual(session.error_reason, 'device_restarted');
            assert.strictEqual(order.status, 'interrupted');
            assert.strictEqual(order.refundReason, 'device_restarted');
            assert.strictEqual(order.refundStatus, 'refund_required');

            // Event must record device_restarted with uptime telemetry
            const interruptedEvt = memoryDb.events.find(e => e.event_type === 'interrupted');
            assert.ok(interruptedEvt);
            assert.strictEqual(interruptedEvt.payload.reason, 'device_restarted');
            assert.strictEqual(interruptedEvt.payload.uptime, 45);
        });

        it('directs table to maintenance_locked if premature cutoff occurs during pending maintenance', async () => {
            const table = 'demo-pulse-01';

            const session = {
                id: 'sess-active-maint-drop',
                tableId: table,
                durationSeconds: 300,
                status: 'active',
                expiresAt: Date.now() + 200000
            };
            memoryDb.sessions.set(table, session);

            const cfg = memoryDb.tableConfigs.get(table);
            cfg.lock_state = 'active';
            cfg.pending_maintenance_lock = true; // Pending maintenance was requested

            // Device dropped prematurely
            memoryDb._mockNetioConfig = {
                mockStatusOutputState: 0,
                mockUptime: 30
            };

            const netio = {
                isMock: true,
                mockStatusOutputState: 0,
                verifyConfirmedOff: async () => true,
                getStatus: async () => ({
                    device: { uptime: 30 },
                    outputs: [{ id: 1, state: 0 }]
                })
            };

            await reconcileTableState(table, cfg, netio, true);

            // Table must NOT be freed to available; must immediately lock to maintenance_locked
            assert.strictEqual(cfg.lock_state, 'maintenance_locked');
            assert.strictEqual(cfg.pending_maintenance_lock, false);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. FREE PLAY ACTIVATION LIFECYCLE
    // ──────────────────────────────────────────────────────────────────────────
    describe('Moderator Free Play Activation Lifecycle', () => {
        it('grants 5-minute free play with 0 cents and activates hardware via Short ON', async () => {
            const table = 'demo-pulse-01';

            const res = await sessionHandler({
                httpMethod: 'POST',
                headers: { authorization: 'Bearer test-moderator-token' },
                body: JSON.stringify({
                    action: 'grant-free-play',
                    table,
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.success, true);
            assert.strictEqual(body.durationMinutes, 5);
            assert.strictEqual(body.hardware.action, 3);
            assert.strictEqual(body.hardware.delayMs, 300000);

            // Check stored order
            const order = memoryDb.orders.get(body.orderId);
            assert.ok(order);
            assert.strictEqual(order.amountCents, 0);
            assert.strictEqual(order.status, 'active');
            assert.strictEqual(order.paymentIntentId, null);

            // Check GET status shows table is active
            const statusRes = await sessionHandler({
                httpMethod: 'GET',
                queryStringParameters: { table }
            }, {});
            const status = JSON.parse(statusRes.body);
            assert.strictEqual(status.state, 'active');
            assert.ok(status.timeRemainingSecs > 290);
        });
    });
});
