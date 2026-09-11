/**
 * Monitor the active physical session until NETIO watchdog turns OFF,
 * then trigger reconciliation to release the table in Supabase.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const val = match[2].trim().replace(/^["'](.*)["']$/, '$1');
            if (!process.env[key]) process.env[key] = val;
        }
    });
}

process.env.ARCADE_ENV = 'production';
process.env.ARCADE_MOCK_MODE = 'false';

const arcadeSessionModule = require('../netlify/functions/arcade-session');

const TABLE_ID = process.env.PILOT_TABLE_ID || 'demo-pulse-01';
const NETIO_BASE = process.env.NETIO_BASE_URL || 'http://192.168.8.120';
const NETIO_AUTH = Buffer.from(`${process.env.NETIO_USERNAME || 'netio'}:${process.env.NETIO_PASSWORD || 'netio'}`).toString('base64');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_TEST_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function queryNetio() {
    const res = await fetch(`${NETIO_BASE}/netio.json`, {
        headers: { 'Authorization': `Basic ${NETIO_AUTH}` }
    });
    if (!res.ok) throw new Error(`NETIO responded with ${res.status}`);
    const data = await res.json();
    const out = data?.Outputs?.find(o => o.ID === 1);
    return {
        state: out?.State,
        name: out?.Name,
        time: data?.Agent?.Time
    };
}

async function run() {
    console.log(`\n\x1b[1;36m=== MONITORING ACTIVE SESSION ON ${TABLE_ID} ===\x1b[0m`);

    // Get active session
    const { data: session } = await supabase
        .from('arcade_sessions')
        .select('*')
        .eq('table_id', TABLE_ID)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!session) {
        console.log('No active session found in Supabase.');
        return;
    }

    const expiresAtMs = new Date(session.expires_at).getTime();
    console.log(`Active Session ID: ${session.id}`);
    console.log(`Expires At: ${session.expires_at} (${new Date(expiresAtMs).toLocaleTimeString()})`);

    let turnedOff = false;
    while (Date.now() < expiresAtMs + 10000) {
        const remainingSec = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
        const netio = await queryNetio();
        const nowStr = new Date().toLocaleTimeString();

        console.log(`[${nowStr}] Aikaa jäljellä: ${remainingSec}s | NETIO Outlet 1: State=${netio.state} (${netio.state === 1 ? 'ON (PÄÄLLÄ)' : 'OFF (SAMMUNUT)'})`);

        if (netio.state === 0) {
            turnedOff = true;
            console.log(`\n\x1b[1;32m✔ FYYSINEN NETIO LAITEAJASTIN SAMMUTTI VIRRAN AUTOMAATTISESTI! (State === 0)\x1b[0m`);
            break;
        }

        const waitTime = Math.min(10000, Math.max(2000, (expiresAtMs - Date.now()) + 2000));
        await new Promise(r => setTimeout(r, waitTime));
    }

    if (!turnedOff) {
        await new Promise(r => setTimeout(r, 4000));
        const finalCheck = await queryNetio();
        if (finalCheck.state === 0) {
            console.log(`\n\x1b[1;32m✔ FYYSINEN NETIO LAITEAJASTIN SAMMUTTI VIRRAN AUTOMAATTISESTI! (State === 0)\x1b[0m`);
        } else {
            console.warn(`\x1b[1;31m[VAROITUS] Rele ei sammunut: State=${finalCheck.state}\x1b[0m`);
        }
    }

    // Safety buffer wait: now > expires_at + 4000
    const safetyWait = Math.max(0, (expiresAtMs + 4500) - Date.now());
    if (safetyWait > 0) {
        console.log(`Odotetaan turvapuskuri (${Math.round(safetyWait / 1000)}s)...`);
        await new Promise(r => setTimeout(r, safetyWait));
    }

    console.log('\n\x1b[1;36m=== SUORITETAAN SOVITTELU (RECONCILIATION) ===\x1b[0m');
    const res = await arcadeSessionModule.handler({
        httpMethod: 'GET',
        queryStringParameters: { table: TABLE_ID }
    });

    console.log(`arcade-session status response: ${res.statusCode}`);
    const resBody = JSON.parse(res.body);
    console.log('Tulos:', JSON.stringify(resBody, null, 2));

    // Audit verify
    const { data: updatedOrder } = await supabase.from('arcade_orders').select('*').eq('session_id', session.id).single();
    const { data: updatedSession } = await supabase.from('arcade_sessions').select('*').eq('id', session.id).single();
    const { data: updatedTable } = await supabase.from('arcade_table_configs').select('*').eq('table_id', TABLE_ID).single();

    console.log('\n\x1b[1;32m======================================================================\x1b[0m');
    console.log('\x1b[1;32mLOPPUTULOS JA SUPABASE AUDIT-TRAIL:\x1b[0m');
    console.log(`1. Tilaus: id=${updatedOrder?.order_id}, status='${updatedOrder?.status}' (odotettu: 'completed')`);
    console.log(`2. Sessio: id=${updatedSession?.id}, status='${updatedSession?.status}', confirmed_off_at='${updatedSession?.confirmed_off_at}' (odotettu: 'completed')`);
    console.log(`3. Pöytä: table_id='${updatedTable?.table_id}', lock_state='${updatedTable?.lock_state}' (odotettu: 'available')`);
    console.log(`4. Fyysinen NETIO Outlet 1: State=${(await queryNetio()).state} (odotettu: 0 / OFF)`);
    console.log('\x1b[1;32m======================================================================\x1b[0m\n');
}

run().catch(console.error);
