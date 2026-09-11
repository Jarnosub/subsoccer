const {
    checkIsTestMode,
    claimAndActivateOrder,
    releasePaymentHold,
    saveMemorySessions,
    memoryDb,
    getSupabase
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
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    const isTestMode = checkIsTestMode();
    const sb = getSupabase();

    // Fail-closed in production if database is not configured (Requirement 3 & 12)
    if (!sb && !isTestMode) {
        console.error('[STRIPE WEBHOOK] Database not configured in production. Failing closed.');
        return {
            statusCode: 503,
            body: JSON.stringify({ error: 'Database not configured in production', code: 'DATABASE_NOT_CONFIGURED' })
        };
    }

    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let stripeEvent;
    const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body || '');

    if (webhookSecret && stripe && sig) {
        try {
            stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        } catch (err) {
            console.error('[WEBHOOK ERROR] Signature verification failed:', err.message);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `Webhook Error: ${err.message}` })
            };
        }
    } else if (isTestMode) {
        // Fallback in unit test environments if no secret configured
        try {
            stripeEvent = typeof rawBody === 'string' ? JSON.parse(rawBody) : (rawBody || {});
        } catch (e) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) };
        }
    } else {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing webhook signature or webhook secret in production' })
        };
    }

    const eventType = stripeEvent.type;
    const paymentIntent = stripeEvent.data?.object;

    if (!paymentIntent) {
        return { statusCode: 200, body: JSON.stringify({ received: true, ignored: 'no_payment_intent' }) };
    }

    console.log(`[STRIPE WEBHOOK] Received event: ${eventType} for PaymentIntent: ${paymentIntent.id}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. PAYMENT_INTENT.SUCCEEDED -> ATOMIC CLAIM & HARDWARE ACTIVATION
    // ──────────────────────────────────────────────────────────────────────────
    if (eventType === 'payment_intent.succeeded') {
        const orderId = paymentIntent.metadata?.order_id;
        if (!orderId) {
            console.warn('[STRIPE WEBHOOK] Succeeded payment intent has no order_id metadata:', paymentIntent.id);
            return {
                statusCode: 200,
                body: JSON.stringify({ received: true, status: 'untracked_payment_received' })
            };
        }

        const activationResult = await claimAndActivateOrder({
            orderId,
            paymentIntent,
            isTestMode
        });

        console.log(`[STRIPE WEBHOOK] Activation result for order ${orderId}:`, activationResult);

        // Always return 200 to Stripe once event is definitively evaluated
        return {
            statusCode: 200,
            body: JSON.stringify({
                received: true,
                orderId,
                activation: activationResult
            })
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. PAYMENT_INTENT.PAYMENT_FAILED (Card declined, 3DS failed, etc.)
    // ──────────────────────────────────────────────────────────────────────────
    if (eventType === 'payment_intent.payment_failed') {
        const orderId = paymentIntent.metadata?.order_id;
        if (orderId && memoryDb.orders.has(orderId)) {
            const order = memoryDb.orders.get(orderId);
            order.lastPaymentError = paymentIntent.last_payment_error?.message || 'Payment failed';
            // Do NOT prematurely release the hold if the hold is still active!
            // The customer may retry with a different card before the 3-minute hold expires.
            saveMemorySessions();
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true, status: 'payment_failed_logged' })
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. PAYMENT_INTENT.CANCELED (Explicit customer or operator cancellation)
    // ──────────────────────────────────────────────────────────────────────────
    if (eventType === 'payment_intent.canceled') {
        const orderId = paymentIntent.metadata?.order_id;
        const tableId = paymentIntent.metadata?.table_id;

        if (orderId && tableId) {
            // Only release hold IF it is still in pending_payment!
            // If the session is already active (e.g. out-of-order event), do NOT cancel active game!
            const released = await releasePaymentHold({
                tableId,
                orderId,
                reason: 'stripe_payment_intent_canceled'
            });
            console.log(`[STRIPE WEBHOOK] Hold release for order ${orderId}: ${released}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true, status: 'canceled_processed' })
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ received: true, unhandled: eventType })
    };
};

exports._setStripeClient = function(client) {
    stripeClient = client;
};
