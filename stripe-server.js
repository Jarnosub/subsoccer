const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_fallback_override_this_in_netlify');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

app.post('/create-payment-intent', async (req, res) => {
    try {
        const { items } = req.body;
        // Create a PaymentIntent with the final amount completely defined here on the backend
        const paymentIntent = await stripe.paymentIntents.create({
            amount: 200, // 2.00 € represented as cents
            currency: 'eur',
            payment_method_types: ['card'],
        });

        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (e) {
        res.status(400).send({
            error: { message: e.message }
        });
    }
});

const PORT = 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node backend running on port ${PORT}.`);
    console.log(`(Serving static files from project root and handling Stripe intents)`);
});
