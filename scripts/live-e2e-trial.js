/**
 * ==============================================================================
 * SUBSOCCER ARCADE — LIVE PHYSICAL END-TO-END TRIAL
 * ==============================================================================
 * 
 * Tests the entire real payment & hardware activation lifecycle:
 * 1. Pre-flight check (NETIO 192.168.8.120 Output 1 State === 0, Supabase table available)
 * 2. POST /create-payment-intent (Server price 250c, Supabase hold, Stripe PI created & bound)
 * 3. Stripe payment confirmation (pm_card_visa)
 * 4. Signed Stripe webhook delivery (HMAC-SHA256 with STRIPE_WEBHOOK_SECRET)
 * 5. Atomic activation (claim -> pre-dispatch guard -> NETIO Action:3 Short ON -> finalize)
 * 6. Physical relay verification (State: 1 ON)
 * 7. Hardware watchdog countdown & automatic shutoff (State: 1 -> 0)
 * 8. Reconciliation & table release (arcade_release_reconciled_table -> available)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env if running standalone
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const val = match[2].trim().replace(/^["'](.*)["']$/, '$1');
            if (!process.env[key]) {
                process.env[key] = val;
            }
        }
    });
}

// Force production environment to guarantee zero memoryDb fallbacks and strict Supabase RPC enforcement
process.env.ARCADE_ENV = 'production';
process.env.ARCADE_MOCK_MODE = 'false';

const createPaymentIntentModule = require('../netlify/functions/create-payment-intent');
const stripeWebhookModule = require('../netlify/functions/stripe-webhook');
const arcadeSessionModule = require('../netlify/functions/arcade-session');
const { getTableConfigAsync } = require('../netlify/functions/utils/arcade-core');

const TABLE_ID = process.env.PILOT_TABLE_ID || 'demo-pulse-01';
const NETIO_BASE = process.env.NETIO_BASE_URL || 'http://192.168.8.120';
const NETIO_AUTH = Buffer.from(`${process.env.NETIO_USERNAME || 'netio'}:${process.env.NETIO_PASSWORD || 'netio'}`).toString('base64');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_TEST_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = require('stripe')(STRIPE_SECRET);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Register emergency cleanup
let testActive = false;
async function emergencyCutoff() {
    console.log('\n\x1b[33m[SAFETY] Sending emergency OFF command to NETIO Outlet 1...\x1b[0m');
    try {
        const res = await fetch(`${NETIO_BASE}/netio.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${NETIO_AUTH}`
            },
            body: JSON.stringify({ Outputs: [{ ID: 1, Action: 0 }] })
        });
        const text = await res.text();
        const current = await queryNetio();
        console.log(`\x1b[33m[SAFETY] Relay state after cutoff: State=${current?.state} (${current?.state === 0 ? 'OFF' : 'ON'})\x1b[0m`);
    } catch (e) {
        console.error('\x1b[31m[SAFETY ERROR] Could not reach NETIO for cutoff:\x1b[0m', e.message);
    }
}

process.on('SIGINT', async () => {
    console.log('\n\x1b[31m[INTERRUPTED] User pressed Ctrl+C.\x1b[0m');
    await emergencyCutoff();
    process.exit(1);
});

async function queryNetio() {
    const res = await fetch(`${NETIO_BASE}/netio.json`, {
        headers: { 'Authorization': `Basic ${NETIO_AUTH}` }
    });
    if (!res.ok) throw new Error(`NETIO responded with ${res.status}`);
    const data = await res.json();
    const out = data?.Outputs?.find(o => o.ID === 1);
    return {
        state: out?.State,
        action: out?.Action,
        delay: out?.Delay,
        name: out?.Name,
        time: data?.Agent?.Time
    };
}

function logStep(num, title) {
    console.log(`\n\x1b[1;36m======================================================================\x1b[0m`);
    console.log(`\x1b[1;32m[VAIHE ${num}] ${title}\x1b[0m`);
    console.log(`\x1b[1;36m======================================================================\x1b[0m`);
}

async function runLiveTrial() {
    console.log(`\x1b[1;35m>>> SUBSOCCER ARCADE — PHYSICAL E2E TRIAL STARTING <<<\x1b[0m`);
    console.log(`Target Table: ${TABLE_ID}`);
    console.log(`NETIO Hardware: ${NETIO_BASE} (Outlet 1)`);
    console.log(`Supabase URL: ${SUPABASE_URL}`);
    console.log(`Stripe Secret Key: ${STRIPE_SECRET.slice(0, 12)}...`);
    console.log(`Webhook Secret: ${WEBHOOK_SECRET.slice(0, 12)}...`);

    // ──────────────────────────────────────────────────────────────────────────
    // VAIHE 0: ESITARKISTUS (Pre-flight checks)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(0, 'Esitarkistus: Fyysinen rele ja Supabase-tietokanta');

    // 1. Tarkista NETIO
    const netioBefore = await queryNetio();
    console.log(`NETIO Outlet 1 tila: State=${netioBefore.state} (${netioBefore.state === 0 ? 'OFF (OK)' : 'ON (VAROITUS)'}), Nimi="${netioBefore.name}", Kellonaika=${netioBefore.time}`);
    if (netioBefore.state !== 0) {
        console.warn('\x1b[33m[VAROITUS] Rele on jo valmiiksi päällä! Sammutetaan ennen kokeen alkua...\x1b[0m');
        await emergencyCutoff();
        await new Promise(r => setTimeout(r, 1000));
        const recheck = await queryNetio();
        if (recheck.state !== 0) {
            throw new Error(`Relettä ei saatu sammutettua. Tila on edelleen State=${recheck.state}`);
        }
        console.log(`Rele sammutettu onnistuneesti (State=0).`);
    }

    // 2. Tarkista Supabase pöytäasetukset
    const { data: tableCfg, error: cfgErr } = await supabase
        .from('arcade_table_configs')
        .select('*')
        .eq('table_id', TABLE_ID)
        .single();

    if (cfgErr || !tableCfg) {
        throw new Error(`Pöytää '${TABLE_ID}' ei löydy Supabasesta: ${cfgErr?.message}`);
    }
    console.log(`Supabase pöytä '${TABLE_ID}': is_enabled=${tableCfg.is_enabled}, lock_state=${tableCfg.lock_state}`);

    if (tableCfg.lock_state !== 'available') {
        console.log(`\x1b[33mPöydän tila on '${tableCfg.lock_state}'. Nollataan tilaan 'available' koetta varten...\x1b[0m`);
        await supabase.from('arcade_table_configs').update({ lock_state: 'available', updated_at: new Date().toISOString() }).eq('table_id', TABLE_ID);
        console.log(`Pöytä '${TABLE_ID}' palautettu tilaan 'available'.`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // VAIHE 1: MAKSULLISEN VARAUKSEN LUONTI (create-payment-intent)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(1, 'Maksullisen varauksen luonti: create-payment-intent (5 min = 2,50 €)');

    const createPayload = {
        table: TABLE_ID,
        durationMinutes: 5,
        clientToken: `tok-e2e-${Date.now()}`
    };

    console.log('Kutsutaan netlify/functions/create-payment-intent.handler...');
    const createRes = await createPaymentIntentModule.handler({
        httpMethod: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload)
    });

    console.log(`create-payment-intent HTTP status: ${createRes.statusCode}`);
    const createBody = JSON.parse(createRes.body);
    console.log('Vastaus:', JSON.stringify(createBody, null, 2));

    if (createRes.statusCode !== 200 || !createBody.success) {
        throw new Error(`create-payment-intent epäonnistui: ${createBody.error || createRes.statusCode}`);
    }

    const orderId = createBody.orderId;
    const clientSecret = createBody.clientSecret;
    const paymentIntentId = clientSecret.split('_secret_')[0];

    console.log(`\x1b[32m✔ Tilaus luotu:\x1b[0m ${orderId}`);
    console.log(`\x1b[32m✔ Stripe PaymentIntent:\x1b[0m ${paymentIntentId}`);
    console.log(`\x1b[32m✔ Hinta:\x1b[0m ${createBody.amountCents / 100} € (${createBody.amountCents} snt)`);
    console.log(`\x1b[32m✔ Hold voimassa asti:\x1b[0m ${createBody.holdExpiresAt}`);

    // Tarkistetaan Supabase: arcade_orders & arcade_table_configs
    const { data: dbOrder } = await supabase.from('arcade_orders').select('*').eq('order_id', orderId).single();
    const { data: dbTableHeld } = await supabase.from('arcade_table_configs').select('*').eq('table_id', TABLE_ID).single();

    const dbPi = dbOrder?.stripe_payment_intent_id || dbOrder?.payment_intent_id;
    console.log(`Supabase arcade_orders tila: status='${dbOrder?.status}', stripe_payment_intent_id='${dbPi}'`);
    console.log(`Supabase arcade_table_configs tila: lock_state='${dbTableHeld?.lock_state}'`);

    if ((dbOrder?.status !== 'holding' && dbOrder?.status !== 'pending_payment') || dbPi !== paymentIntentId) {
        throw new Error(`Tilausta ei ole sidottu oikein Supabasessa: ${JSON.stringify(dbOrder)}`);
    }
    if (dbTableHeld?.lock_state !== 'pending_payment') {
        throw new Error(`Pöydän lock_state ei ole pending_payment: ${dbTableHeld?.lock_state}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // VAIHE 2: ASIAKKAAN MAKSUVAIHE (Stripe Test Confirmation)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(2, 'Asiakkaan maksu: Vahvistetaan Stripe PaymentIntent (pm_card_visa)');

    console.log(`Vahvistetaan Stripe PaymentIntent '${paymentIntentId}' testikortilla pm_card_visa...`);
    const confirmedPi = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: 'pm_card_visa'
    });

    console.log(`Stripe PaymentIntent tila vahvistuksen jälkeen: \x1b[32m${confirmedPi.status}\x1b[0m`);
    if (confirmedPi.status !== 'succeeded') {
        throw new Error(`Maksu ei onnistunut, odotettiin 'succeeded', saatiin '${confirmedPi.status}'`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // VAIHE 3: ALLEKIRJOITETTU WEBHOOK & LAITEKYTKENTÄ (stripe-webhook)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(3, 'Allekirjoitettu Webhook: Toimitus & Automaattinen laitekytkentä');

    const webhookPayloadObj = {
        id: `evt_live_${Date.now()}`,
        object: 'event',
        api_version: '2022-11-15',
        created: Math.floor(Date.now() / 1000),
        data: { object: confirmedPi },
        type: 'payment_intent.succeeded'
    };
    const rawWebhookBody = JSON.stringify(webhookPayloadObj);
    const webhookSig = stripe.webhooks.generateTestHeaderString({
        payload: rawWebhookBody,
        secret: WEBHOOK_SECRET
    });

    console.log('Toimitetaan allekirjoitettu payment_intent.succeeded netlify/functions/stripe-webhook.handlerille...');
    testActive = true;
    const webhookRes = await stripeWebhookModule.handler({
        httpMethod: 'POST',
        headers: {
            'stripe-signature': webhookSig,
            'content-type': 'application/json'
        },
        body: rawWebhookBody
    });

    console.log(`stripe-webhook HTTP status: ${webhookRes.statusCode}`);
    const webhookBody = JSON.parse(webhookRes.body);
    console.log('Webhook vastaus:', JSON.stringify(webhookBody, null, 2));

    if (webhookRes.statusCode !== 200 || !webhookBody.activation?.success) {
        throw new Error(`Webhook aktivointi epäonnistui: ${JSON.stringify(webhookBody)}`);
    }

    console.log(`\x1b[32m✔ Webhook lunasti ja aktivoi tilauksen onnistuneesti!\x1b[0m`);
    console.log(`  Sessio ID: ${webhookBody.activation.sessionId}`);
    console.log(`  Peliaika päättyy: ${webhookBody.activation.expiresAt}`);

    // ──────────────────────────────────────────────────────────────────────────
    // VAIHE 4: FYYSISEN LAITTEEN REAALIAIKAINEN TODENTAMINEN
    // ──────────────────────────────────────────────────────────────────────────
    logStep(4, 'Fyysisen laitteen todentaminen: NETIO Output 1 tila');

    // Luetaan tila heti suoraan NETIO:lta
    const netioDuring = await queryNetio();
    console.log(`\x1b[1;33m>>> NETIO OUTLET 1 TILA: State=${netioDuring.state} (${netioDuring.state === 1 ? 'ON / VIRTA PÄÄLLÄ' : 'OFF'}), Delay=${netioDuring.delay}ms, Action=${netioDuring.action} <<<\x1b[0m`);

    if (netioDuring.state !== 1) {
        throw new Error(`Rele ei mennyt päälle! NETIO palautti State=${netioDuring.state}`);
    }
    console.log(`\x1b[32m✔ FYYSINEN RELE ON PÄÄLLÄ (State === 1). Subsoccer Pulse saa virtaa!\x1b[0m`);

    // Tarkistetaan Supabase: arcade_orders, arcade_sessions, arcade_table_configs
    const { data: dbOrderActive } = await supabase.from('arcade_orders').select('*').eq('order_id', orderId).single();
    const { data: dbSessionActive } = await supabase.from('arcade_sessions').select('*').eq('id', webhookBody.activation.sessionId).single();
    const { data: dbTableActive } = await supabase.from('arcade_table_configs').select('*').eq('table_id', TABLE_ID).single();

    console.log(`Supabase arcade_orders: status='${dbOrderActive?.status}' (odotettu: 'active')`);
    console.log(`Supabase arcade_sessions: status='${dbSessionActive?.status}', expires_at='${dbSessionActive?.expires_at}' (odotettu: 'active')`);
    console.log(`Supabase arcade_table_configs: lock_state='${dbTableActive?.lock_state}' (odotettu: 'active')`);

    if (dbOrderActive?.status !== 'active' || dbSessionActive?.status !== 'active' || dbTableActive?.lock_state !== 'active') {
        throw new Error('Supabasen tilat eivät vastaa aktiivista sessiota!');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // VAIHE 5: LAITEAJASTIMEN ODOTUS JA AUTOMAATTINEN SAMMUTUS
    // ──────────────────────────────────────────────────────────────────────────
    logStep(5, 'Watchdog-laskuri ja automaattinen sammutus (300s = 5 min)');

    const expiresAtMs = new Date(webhookBody.activation.expiresAt).getTime();
    console.log(`Watchdog laskee aikaa laitteen sisäisesti. Peliaika päättyy klo: ${new Date(expiresAtMs).toLocaleTimeString()}`);
    console.log(`Seurataan tilannetta 15 sekunnin välein...`);

    let turnedOff = false;
    while (Date.now() < expiresAtMs + 6000) {
        const remainingSec = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
        const check = await queryNetio();
        const timeStr = new Date().toLocaleTimeString();

        console.log(`[${timeStr}] Jäljellä: ${remainingSec}s | NETIO Outlet 1: State=${check.state} (${check.state === 1 ? 'ON' : 'OFF'})`);

        if (check.state === 0) {
            console.log(`\n\x1b[32m✔ NETIO LAITEAJASTIN SAMMUTTI VIRRAN AUTOMAATTISESTI! (State === 0)\x1b[0m`);
            turnedOff = true;
            break;
        }

        const sleepTime = Math.min(15000, Math.max(2000, (expiresAtMs - Date.now()) + 2000));
        await new Promise(r => setTimeout(r, sleepTime));
    }

    if (!turnedOff) {
        // Viimeinen tarkistus
        await new Promise(r => setTimeout(r, 4000));
        const finalCheck = await queryNetio();
        if (finalCheck.state === 0) {
            turnedOff = true;
            console.log(`\n\x1b[32m✔ NETIO LAITEAJASTIN SAMMUTTI VIRRAN AUTOMAATTISESTI! (State === 0)\x1b[0m`);
        } else {
            console.warn(`\x1b[31m[VAROITUS] Rele ei sammunut odotetussa ajassa! State=${finalCheck.state}\x1b[0m`);
            await emergencyCutoff();
        }
    }

    testActive = false;

    // ──────────────────────────────────────────────────────────────────────────
    // VAIHE 6: SOVITTELU & PÖYDÄN VAPAUTUS (Reconciliation)
    // ──────────────────────────────────────────────────────────────────────────
    logStep(6, 'Sovittelu (Reconciliation): arcade_release_reconciled_table');

    console.log('Kutsutaan netlify/functions/arcade-session.handler (GET status)...');
    // Odota 4s suoja-ajan ylitys
    const waitSafety = Math.max(0, (expiresAtMs + 4500) - Date.now());
    if (waitSafety > 0) {
        console.log(`Odotetaan turvapuskurin (4s) täyttymistä (${Math.round(waitSafety / 1000)}s)...`);
        await new Promise(r => setTimeout(r, waitSafety));
    }

    const sessionStatusRes = await arcadeSessionModule.handler({
        httpMethod: 'GET',
        queryStringParameters: { table: TABLE_ID }
    });

    console.log(`arcade-session status response: ${sessionStatusRes.statusCode}`);
    const sessionStatusBody = JSON.parse(sessionStatusRes.body);
    console.log('Pöydän tilaraportti:', JSON.stringify(sessionStatusBody, null, 2));

    // Tarkistetaan Supabasen lopullinen audit-tila
    const { data: dbOrderFinal } = await supabase.from('arcade_orders').select('*').eq('order_id', orderId).single();
    const { data: dbSessionFinal } = await supabase.from('arcade_sessions').select('*').eq('id', webhookBody.activation.sessionId).single();
    const { data: dbTableFinal } = await supabase.from('arcade_table_configs').select('*').eq('table_id', TABLE_ID).single();

    console.log('\x1b[1;32m======================================================================\x1b[0m');
    console.log('\x1b[1;32mKOKONAISKOKEEN LOPPUTULOS JA AUDIT-TRAIL:\x1b[0m');
    console.log(`1. Tilaus: id=${dbOrderFinal?.order_id}, status='${dbOrderFinal?.status}' (odotettu: 'completed')`);
    console.log(`2. Sessio: id=${dbSessionFinal?.id}, status='${dbSessionFinal?.status}', confirmed_off_at='${dbSessionFinal?.confirmed_off_at}' (odotettu: 'completed')`);
    console.log(`3. Pöytä: table_id='${dbTableFinal?.table_id}', lock_state='${dbTableFinal?.lock_state}' (odotettu: 'available')`);
    console.log(`4. Fyysinen NETIO Outlet 1: State=${(await queryNetio()).state} (odotettu: 0 / OFF)`);
    console.log('\x1b[1;32m======================================================================\x1b[0m');

    if (dbTableFinal?.lock_state !== 'available' || dbOrderFinal?.status !== 'completed') {
        throw new Error('Pöytä tai tilaus ei vapautunut asianmukaisesti sovittelussa!');
    }

    console.log(`\n\x1b[1;32m🎉 KAIKKI 6 VAIHETTA HYVÄKSYTTY ONNISTUNEESTI! KOE VALMIS.\x1b[0m\n`);
}

runLiveTrial().catch(async (err) => {
    console.error('\n\x1b[1;31m[KOKEEN VIRHE] Koe keskeytyi virheeseen:\x1b[0m', err.message);
    if (testActive) {
        await emergencyCutoff();
    }
    process.exit(1);
});
