const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_fallback_override_this_in_netlify');

exports.handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { items, customAmount, gameId } = JSON.parse(event.body || '{}');

        // Create a PaymentIntent with the dynamic amount requested by the arcade client
        const amountCents = customAmount ? parseInt(customAmount) : 200;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: 'eur',
            payment_method_types: ['card'],
            metadata: {
                game_id: gameId || 'unknown_table'
            }
        });

        return {
            statusCode: 200,
            headers: {
                // Ensure CORS headers so local testing or remote browsers can fetch this
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'OPTIONS,POST'
            },
            body: JSON.stringify({
                clientSecret: paymentIntent.client_secret,
            }),
        };
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                error: { message: e.message }
            }),
        };
    }
};
