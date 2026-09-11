process.env.NODE_ENV = 'test';
process.env.ARCADE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_123456';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_secret';

const assert = require('assert');
const { handler: createPaymentIntentHandler, _setStripeClient: setCreateStripeClient } = require('../../netlify/functions/create-payment-intent.js');
const { handler: webhookHandler, _setStripeClient: setWebhookStripeClient } = require('../../netlify/functions/stripe-webhook.js');
const { handler: sessionHandler } = require('../../netlify/functions/arcade-session.js');
const {
    PRICE_CATALOG,
    memoryDb,
    resetMemoryDb,
    getOrderStatus,
    claimAndActivateOrder,
    createPaymentHold,
    releasePaymentHold
} = require('../../netlify/functions/utils/arcade-core.js');

describe('Stripe Checkout & Webhook Integration', () => {
    let mockStripe;

    beforeEach(() => {
        resetMemoryDb();

        // Configure mock NETIO
        memoryDb._mockNetioConfig = {
            mockActiveShortOn: true
        };

        // Create standard mock Stripe client
        mockStripe = {
            paymentIntents: {
                create: async (params, opts) => {
                    return {
                        id: `pi_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        client_secret: `pi_test_secret_${Date.now()}`,
                        amount: params.amount,
                        currency: params.currency,
                        metadata: params.metadata,
                        status: 'requires_payment_method',
                        livemode: false
                    };
                }
            },
            webhooks: {
                constructEvent: (body, sig, secret) => {
                    if (sig === 'bad_sig') {
                        throw new Error('Invalid signature');
                    }
                    return typeof body === 'string' ? JSON.parse(body) : body;
                }
            }
        };

        setCreateStripeClient(mockStripe);
        setWebhookStripeClient(mockStripe);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 1 & 3: SERVER PRICING & PAYMENTINTENT CREATION
    // ──────────────────────────────────────────────────────────────────────────
    it('creates a 3-minute payment hold and Stripe PaymentIntent with server catalog prices', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                table: 'demo-pulse-01',
                durationMinutes: 5
            })
        };

        const res = await createPaymentIntentHandler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.amountCents, 250); // 2.50 €
        assert.strictEqual(body.durationMinutes, 5);
        assert.ok(body.orderId.startsWith('ord-'));
        assert.ok(body.clientSecret);

        // Check hold in memoryDb
        assert.strictEqual(memoryDb.holds.get('demo-pulse-01'), body.orderId);
        const order = memoryDb.orders.get(body.orderId);
        assert.strictEqual(order.status, 'pending_payment');
        assert.strictEqual(order.amountCents, 250);
        assert.strictEqual(order.currency, 'eur');
    });

    it('strictly enforces commercial catalog: 5 min (250c), 15 min (500c), 30 min (700c) and rejects invalid durations', async () => {
        // Test 15 min
        const res15 = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 15 })
        }, {});
        assert.strictEqual(res15.statusCode, 200);
        assert.strictEqual(JSON.parse(res15.body).amountCents, 500);

        resetMemoryDb();

        // Test 30 min
        const res30 = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 30 })
        }, {});
        assert.strictEqual(res30.statusCode, 200);
        assert.strictEqual(JSON.parse(res30.body).amountCents, 700);

        resetMemoryDb();

        // Reject invalid duration e.g. 45 min
        const resInvalid = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 45 })
        }, {});
        assert.strictEqual(resInvalid.statusCode, 400);
        assert.strictEqual(JSON.parse(resInvalid.body).code, 'INVALID_DURATION');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 2: ATOMIC PAYMENT HOLD & CONCURRENCY
    // ──────────────────────────────────────────────────────────────────────────
    it('prevents a second user from booking the table while a payment hold is pending (returns 409 TABLE_HELD)', async () => {
        // User 1 creates hold
        const user1Res = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5, clientToken: 'user-1-token' })
        }, {});
        assert.strictEqual(user1Res.statusCode, 200);

        // User 2 attempts to book the same table
        const user2Res = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 15, clientToken: 'user-2-token' })
        }, {});
        assert.strictEqual(user2Res.statusCode, 409);

        const user2Body = JSON.parse(user2Res.body);
        assert.strictEqual(user2Body.code, 'TABLE_HELD');
        assert.ok(user2Body.error.includes('toisen pelaajan varattavana'));
    });

    it('allows idempotent replay for the SAME client token during checkout', async () => {
        const firstCall = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5, clientToken: 'same-client-token' })
        }, {});
        assert.strictEqual(firstCall.statusCode, 200);
        const firstBody = JSON.parse(firstCall.body);

        const replayCall = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5, clientToken: 'same-client-token' })
        }, {});
        assert.strictEqual(replayCall.statusCode, 200);
        const replayBody = JSON.parse(replayCall.body);
        assert.strictEqual(replayBody.orderId, firstBody.orderId);
    });

    it('releases payment hold immediately if Stripe API throws an error and returns 502', async () => {
        mockStripe.paymentIntents.create = async () => {
            throw new Error('Stripe network connection error');
        };

        const res = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 })
        }, {});
        assert.strictEqual(res.statusCode, 502);

        // Hold must be cleanly released!
        assert.strictEqual(memoryDb.holds.has('demo-pulse-01'), false);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 1 & 3: WEBHOOK PAYMENT VERIFICATION & HARDWARE ACTIVATION
    // ──────────────────────────────────────────────────────────────────────────
    it('activates hardware relay via shared core function when payment_intent.succeeded is received', async () => {
        // 1. Create order
        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 })
        }, {});
        const orderData = JSON.parse(createRes.body);

        // 2. Deliver webhook
        const webhookEvent = {
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_valid_123',
                        amount: 250,
                        currency: 'eur',
                        livemode: false,
                        metadata: {
                            order_id: orderData.orderId,
                            table_id: 'demo-pulse-01'
                        }
                    }
                }
            })
        };

        const webhookRes = await webhookHandler(webhookEvent, {});
        assert.strictEqual(webhookRes.statusCode, 200);

        const webhookBody = JSON.parse(webhookRes.body);
        assert.strictEqual(webhookBody.activation.success, true);
        assert.ok(webhookBody.activation.sessionId);

        // Verify session is active in table
        const session = memoryDb.sessions.get('demo-pulse-01');
        assert.ok(session);
        assert.strictEqual(session.status, 'active');
        assert.strictEqual(session.durationMinutes, 5);

        // Verify hold is released from holds map (since it is now an active session)
        assert.strictEqual(memoryDb.holds.has('demo-pulse-01'), false);
    });

    it('rejects payment with livemode === true and marks order for refund', async () => {
        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 })
        }, {});
        const orderData = JSON.parse(createRes.body);

        const webhookEvent = {
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_live_forbidden',
                        amount: 250,
                        currency: 'eur',
                        livemode: true, // FORBIDDEN IN TEST
                        metadata: {
                            order_id: orderData.orderId,
                            table_id: 'demo-pulse-01'
                        }
                    }
                }
            })
        };

        const webhookRes = await webhookHandler(webhookEvent, {});
        assert.strictEqual(webhookRes.statusCode, 200);

        const webhookBody = JSON.parse(webhookRes.body);
        assert.strictEqual(webhookBody.activation.success, false);
        assert.strictEqual(webhookBody.activation.refundRequired, true);
        assert.strictEqual(webhookBody.activation.code, 'LIVEMODE_REJECTED');

        // Relay must NOT have been activated!
        assert.strictEqual(memoryDb.sessions.has('demo-pulse-01'), false);
    });

    it('rejects payment with amount mismatch and marks order for refund', async () => {
        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 }) // 250c
        }, {});
        const orderData = JSON.parse(createRes.body);

        const webhookEvent = {
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_mismatch',
                        amount: 100, // MISMATCH: paid 1,00 € instead of 2,50 €
                        currency: 'eur',
                        livemode: false,
                        metadata: {
                            order_id: orderData.orderId,
                            table_id: 'demo-pulse-01'
                        }
                    }
                }
            })
        };

        const webhookRes = await webhookHandler(webhookEvent, {});
        assert.strictEqual(webhookRes.statusCode, 200);

        const webhookBody = JSON.parse(webhookRes.body);
        assert.strictEqual(webhookBody.activation.success, false);
        assert.strictEqual(webhookBody.activation.refundRequired, true);
        assert.strictEqual(webhookBody.activation.code, 'AMOUNT_MISMATCH');

        assert.strictEqual(memoryDb.sessions.has('demo-pulse-01'), false);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 2 & 5: IDEMPOTENT WEBHOOK REDELIVERY & DURATION IMMUTABILITY
    // ──────────────────────────────────────────────────────────────────────────
    it('handles duplicate webhook deliveries idempotently without re-issuing relay command', async () => {
        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 })
        }, {});
        const orderData = JSON.parse(createRes.body);

        const webhookEvent = {
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_duplicate_check',
                        amount: 250,
                        currency: 'eur',
                        livemode: false,
                        metadata: { order_id: orderData.orderId, table_id: 'demo-pulse-01' }
                    }
                }
            })
        };

        // 1st delivery
        const res1 = await webhookHandler(webhookEvent, {});
        const body1 = JSON.parse(res1.body);
        assert.strictEqual(body1.activation.success, true);
        const originalExpiresAt = body1.activation.expiresAt;

        // 2nd delivery (redelivery)
        const res2 = await webhookHandler(webhookEvent, {});
        const body2 = JSON.parse(res2.body);
        assert.strictEqual(body2.activation.success, true);
        assert.strictEqual(body2.activation.isIdempotentReplay, true);

        // Hardware expires_at must remain identical (not extended by redelivery!)
        const session = memoryDb.sessions.get('demo-pulse-01');
        assert.strictEqual(new Date(session.expiresAt).toISOString(), originalExpiresAt);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 4: SEPARATION OF PHYSICAL LOCK & FINANCIAL REFUND
    // ──────────────────────────────────────────────────────────────────────────
    it('sets refund_required on relay command failure while locking table in error_locked / hardware_uncertain', async () => {
        // Configure NETIO mock to throw network timeout error on startTimedPlay
        memoryDb._mockNetioConfig = {
            mockStatusFails: true // Will simulate probe failure
        };

        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 })
        }, {});
        const orderData = JSON.parse(createRes.body);

        const webhookEvent = {
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_hardware_fail',
                        amount: 250,
                        currency: 'eur',
                        livemode: false,
                        metadata: { order_id: orderData.orderId, table_id: 'demo-pulse-01' }
                    }
                }
            })
        };

        const { NetioAdapter } = require('../../netlify/functions/utils/netio-adapter.js');
        const origStart = NetioAdapter.prototype.startTimedPlay;
        const origProbe = NetioAdapter.prototype.verifyConfirmedOff;

        NetioAdapter.prototype.startTimedPlay = async () => {
            throw new Error('NETIO connection timeout (EHOSTUNREACH)');
        };
        NetioAdapter.prototype.verifyConfirmedOff = async () => {
            return false; // Hardware state cannot be confirmed OFF
        };

        try {
            const webhookRes = await webhookHandler(webhookEvent, {});
            assert.strictEqual(webhookRes.statusCode, 200);

            const webhookBody = JSON.parse(webhookRes.body);
            assert.strictEqual(webhookBody.activation.success, false);
            assert.strictEqual(webhookBody.activation.refundRequired, true);

            // Order status must reflect refund_required
            const order = memoryDb.orders.get(orderData.orderId);
            assert.strictEqual(order.refundStatus, 'refund_required');
            assert.strictEqual(order.status, 'activation_failed');

            // Table MUST be locked (hardware_uncertain / error_locked) - NOT released!
            const cfg = memoryDb.tableConfigs.get('demo-pulse-01');
            assert.strictEqual(cfg.lock_state, 'error_locked');

            const session = memoryDb.sessions.get('demo-pulse-01');
            assert.strictEqual(session.status, 'hardware_uncertain');
        } finally {
            NetioAdapter.prototype.startTimedPlay = origStart;
            NetioAdapter.prototype.verifyConfirmedOff = origProbe;
        }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 6: LATE & OUT-OF-ORDER EVENTS
    // ──────────────────────────────────────────────────────────────────────────
    it('routes late payment after hold expiry to refund_required without touching the relay', async () => {
        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 })
        }, {});
        const orderData = JSON.parse(createRes.body);

        // Fast-forward hold expiry
        const order = memoryDb.orders.get(orderData.orderId);
        order.holdExpiresAt = Date.now() - 5000; // Expired 5 seconds ago

        const webhookEvent = {
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_late_payment',
                        amount: 250,
                        currency: 'eur',
                        livemode: false,
                        metadata: { order_id: orderData.orderId, table_id: 'demo-pulse-01' }
                    }
                }
            })
        };

        const webhookRes = await webhookHandler(webhookEvent, {});
        assert.strictEqual(webhookRes.statusCode, 200);

        const webhookBody = JSON.parse(webhookRes.body);
        assert.strictEqual(webhookBody.activation.success, false);
        assert.strictEqual(webhookBody.activation.code, 'LATE_PAYMENT_CONFLICT');
        assert.strictEqual(webhookBody.activation.refundRequired, true);

        // Relay must NOT have been activated!
        assert.strictEqual(memoryDb.sessions.has('demo-pulse-01'), false);
    });

    it('does not cancel an active session if late payment_intent.canceled arrives', async () => {
        // 1. Order succeeds and activates
        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5 })
        }, {});
        const orderData = JSON.parse(createRes.body);

        await webhookHandler({
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_active_order',
                        amount: 250,
                        currency: 'eur',
                        livemode: false,
                        metadata: { order_id: orderData.orderId, table_id: 'demo-pulse-01' }
                    }
                }
            })
        }, {});

        assert.strictEqual(memoryDb.sessions.get('demo-pulse-01')?.status, 'active');

        // 2. Late canceled event arrives
        const cancelRes = await webhookHandler({
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.canceled',
                data: {
                    object: {
                        id: 'pi_test_active_order',
                        metadata: { order_id: orderData.orderId, table_id: 'demo-pulse-01' }
                    }
                }
            })
        }, {});
        assert.strictEqual(cancelRes.statusCode, 200);

        // Session must STILL BE ACTIVE!
        assert.strictEqual(memoryDb.sessions.get('demo-pulse-01')?.status, 'active');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // REQUIREMENT 7: CLIENT POLLS OWN ORDER
    // ──────────────────────────────────────────────────────────────────────────
    it('returns client order status when GET /arcade-session includes orderId query parameter', async () => {
        const createRes = await createPaymentIntentHandler({
            httpMethod: 'POST',
            body: JSON.stringify({ table: 'demo-pulse-01', durationMinutes: 5, clientToken: 'my-tok-123' })
        }, {});
        const orderData = JSON.parse(createRes.body);

        // Poll before payment
        const pollBefore = await sessionHandler({
            httpMethod: 'GET',
            queryStringParameters: {
                table: 'demo-pulse-01',
                orderId: orderData.orderId,
                clientToken: 'my-tok-123'
            }
        }, {});
        assert.strictEqual(pollBefore.statusCode, 200);
        const pollBeforeBody = JSON.parse(pollBefore.body);
        assert.ok(pollBeforeBody.order);
        assert.strictEqual(pollBeforeBody.order.status, 'pending_payment');
        assert.strictEqual(pollBeforeBody.order.isActivated, false);

        // Webhook arrives
        await webhookHandler({
            httpMethod: 'POST',
            headers: { 'stripe-signature': 'valid_sig' },
            body: JSON.stringify({
                type: 'payment_intent.succeeded',
                data: {
                    object: {
                        id: 'pi_test_poll_test',
                        amount: 250,
                        currency: 'eur',
                        livemode: false,
                        metadata: { order_id: orderData.orderId, table_id: 'demo-pulse-01' }
                    }
                }
            })
        }, {});

        // Poll after payment
        const pollAfter = await sessionHandler({
            httpMethod: 'GET',
            queryStringParameters: {
                table: 'demo-pulse-01',
                orderId: orderData.orderId,
                clientToken: 'my-tok-123'
            }
        }, {});
        assert.strictEqual(pollAfter.statusCode, 200);
        const pollAfterBody = JSON.parse(pollAfter.body);
        assert.strictEqual(pollAfterBody.order.status, 'active');
        assert.strictEqual(pollAfterBody.order.isActivated, true);
        assert.ok(pollAfterBody.order.timeRemainingSecs > 0);
    });
});
