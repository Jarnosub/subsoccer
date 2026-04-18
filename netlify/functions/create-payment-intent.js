const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
if (!process.env.STRIPE_SECRET_KEY) {
    console.error('FATAL: STRIPE_SECRET_KEY environment variable is missing!');
}

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
                'Access-Control-Allow-Origin': 'https://subsoccer.pro',
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
            headers: { 'Access-Control-Allow-Origin': 'https://subsoccer.pro' },
            body: JSON.stringify({
                error: { message: 'Payment processing failed. Please try again.' }
            }),
        };
    }
};
