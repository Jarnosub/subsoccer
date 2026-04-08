const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_fallback_override_this_in_netlify');

exports.handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { items } = JSON.parse(event.body || '{}');

        // Create a PaymentIntent with the final amount completely defined here on the backend
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 200, // 2.00 € represented as cents
            currency: 'eur',
            payment_method_types: ['card'],
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
