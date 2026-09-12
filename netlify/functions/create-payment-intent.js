const {
    PRICE_CATALOG,
    ALLOWED_DURATIONS,
    CORS_HEADERS,
    checkIsTestMode,
    getSupabase,
    createPaymentHold,
    releasePaymentHold,
    bindPaymentIntent,
    saveMemorySessions
} = require('./utils/arcade-core');

let stripeClient = null;
function getStripeClient() {
    if (stripeClient) return stripeClient;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) return null;
    stripeClient = require('stripe')(secretKey);
    return stripeClient;
}

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: CORS_HEADERS,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' })
        };
    }

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

    const table = (body.table || body.tableId || '').trim();
    if (!table) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Missing required 'table' parameter.", code: 'INVALID_PARAMETERS' })
        };
    }

    const durationMinutes = Number(body.durationMinutes);
    if (!durationMinutes || !ALLOWED_DURATIONS.includes(durationMinutes)) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: `Invalid 'durationMinutes'. Allowed values: ${ALLOWED_DURATIONS.join(', ')}`,
                allowedDurations: ALLOWED_DURATIONS,
                code: 'INVALID_DURATION'
            })
        };
    }

    const clientToken = (body.clientToken || `tok-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`).trim();
    const isTestMode = checkIsTestMode();

    // Auto-unblock: Clear any stale hardware_uncertain or expired orders/sessions that block new checkout
    const supabase = getSupabase();
    if (supabase) {
        try {
            await supabase.from('arcade_sessions')
                .update({ status: 'completed', confirmed_off_at: new Date().toISOString() })
                .eq('table_id', table)
                .in('status', ['hardware_uncertain', 'requested']);

            await supabase.from('arcade_orders')
                .update({ status: 'refund_registered' })
                .eq('table_id', table)
                .in('status', ['hardware_uncertain', 'holding']);

            await supabase.from('arcade_table_configs')
                .update({ lock_state: 'available', pending_maintenance_lock: false })
                .eq('table_id', table)
                .eq('lock_state', 'error_locked');
        } catch (cleanErr) {
            console.warn('[CREATE PI] Stale unblock warning:', cleanErr.message);
        }
    }

    // 1. Create atomic table hold (3 min reservation)
    const holdResult = await createPaymentHold({
        tableId: table,
        durationMinutes,
        clientToken,
        isTestMode
    });

    if (!holdResult.success) {
        return {
            statusCode: holdResult.statusCode || 409,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: holdResult.error,
                code: holdResult.code,
                holdExpiresAt: holdResult.holdExpiresAt || null,
                expiresAt: holdResult.expiresAt || null
            })
        };
    }

    const order = holdResult.order;

    // 2. Initialize Stripe & Create PaymentIntent
    const stripe = getStripeClient();
    if (!stripe) {
        await releasePaymentHold({ tableId: table, orderId: order.orderId, reason: 'stripe_unconfigured' });
        return {
            statusCode: 503,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Stripe is not configured in backend: STRIPE_SECRET_KEY missing in environment.',
                code: 'STRIPE_NOT_CONFIGURED'
            })
        };
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: order.amountCents,
            currency: order.currency,
            payment_method_types: ['card'],
            metadata: {
                table_id: order.tableId,
                duration_minutes: String(order.durationMinutes),
                order_id: order.orderId
            },
            description: `Subsoccer Pulse Table (${order.tableId}) - ${order.durationMinutes} min play`
        }, {
            idempotencyKey: `pi-hold-${order.orderId}`
        });

        // 3. Atomically bind PaymentIntent to order in database (Requirement 5 & 6)
        const bindResult = await bindPaymentIntent({
            tableId: table,
            orderId: order.orderId,
            paymentIntentId: paymentIntent.id,
            idempotencyKey: `pi-hold-${order.orderId}`,
            isTestMode
        });

        if (!bindResult.success) {
            console.error('[PAYMENT INTENT BIND ERROR] Cancelling Stripe PaymentIntent:', bindResult.error);
            try {
                await stripe.paymentIntents.cancel(paymentIntent.id, {
                    cancellation_reason: 'abandoned'
                });
            } catch (cancelErr) {
                console.error('[STRIPE] Failed to cancel unbonded PaymentIntent:', cancelErr.message);
            }

            await releasePaymentHold({
                tableId: table,
                orderId: order.orderId,
                reason: 'bind_payment_intent_failed'
            });

            return {
                statusCode: 502,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    error: `PaymentIntent syntyi mutta tilaussidonta epäonnistui: ${bindResult.error}. Maksu on peruttu.`,
                    code: 'BIND_PAYMENT_INTENT_FAILED'
                })
            };
        }

        order.paymentIntentId = paymentIntent.id;
        saveMemorySessions();

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                success: true,
                orderId: order.orderId,
                clientSecret: paymentIntent.client_secret,
                amountCents: order.amountCents,
                durationMinutes: order.durationMinutes,
                holdExpiresAt: new Date(order.holdExpiresAt).toISOString(),
                publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
            })
        };
    } catch (stripeErr) {
        console.error('[STRIPE ERROR] Failed to create PaymentIntent:', stripeErr.message);
        await releasePaymentHold({ tableId: table, orderId: order.orderId, reason: 'stripe_api_error' });

        return {
            statusCode: 502,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: `Failed to create Stripe payment intent: ${stripeErr.message}`,
                code: 'STRIPE_API_ERROR'
            })
        };
    }
};

exports._setStripeClient = function(client) {
    stripeClient = client;
};
