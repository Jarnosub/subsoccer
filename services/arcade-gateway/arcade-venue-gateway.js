/**
 * ==============================================================================
 * SUBSOCCER ARCADE — ON-SITE VENUE GATEWAY DEMONSTRATOR
 * ==============================================================================
 * 
 * Runs locally on the venue hardware (Mac in LAN with NETIO).
 * Communicates:
 * 1. Outbound only to Supabase cloud via unprivileged ANON_KEY + GATEWAY_TOKEN RPCs.
 * 2. Inbound LAN only to NETIO PowerBOX 3PF at 192.168.8.120.
 * 
 * Guarantees:
 * - Atomic queue claiming (FOR UPDATE SKIP LOCKED)
 * - Persistent Write-Ahead Log (WAL) on disk BEFORE any NETIO HTTP call
 * - Crash recovery: never re-dispatches in-flight commands
 * - Immutable deadline based on hardware_dispatched_at, not cloud arrival
 * - Short ON response validation (HTTP 200, valid JSON, State === 1; no strict Action: 3 requirement)
 * - Autonomous LAN attract lights reactivation when game timer expires
 * - Authoritative cloud reconciliation preserving pending maintenance locks
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env
const envPaths = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env')
];
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        const envContent = fs.readFileSync(p, 'utf8');
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
        break;
    }
}

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL;
// STRICT LEAST PRIVILEGE: ANON KEY ONLY
const SUPABASE_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const NETIO_BASE_URL = process.env.NETIO_BASE_URL || 'http://192.168.8.120';
const NETIO_AUTH = Buffer.from(`${process.env.NETIO_USERNAME || 'netio'}:${process.env.NETIO_PASSWORD || 'netio'}`).toString('base64');

const VENUE_ID = process.env.PILOT_VENUE_ID || 'venue-demo-01';
const TABLE_ID = process.env.PILOT_TABLE_ID || 'demo-pulse-01';
const GATEWAY_ID = process.env.GATEWAY_ID || 'gw-mac-local-01';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'gw_token_demo_01_live_2026_test';

const WAL_FILE = path.resolve(__dirname, 'gateway-wal.json');

console.log('\x1b[36m==============================================================================');
console.log(' SUBSOCCER ARCADE — ON-SITE VENUE GATEWAY');
console.log('==============================================================================\x1b[0m');
console.log(`[INIT] Supabase URL:   ${SUPABASE_URL}`);
console.log(`[INIT] Role / Key:     ANON PUBLIC KEY (Least Privilege enforced)`);
console.log(`[INIT] Local NETIO:    ${NETIO_BASE_URL}`);
console.log(`[INIT] Venue / Table:  ${VENUE_ID} / ${TABLE_ID}`);
console.log(`[INIT] Gateway ID:     ${GATEWAY_ID}`);
console.log(`[INIT] WAL Path:       ${WAL_FILE}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
});

const DROP_FLAG = path.resolve(__dirname, 'drop-internet.flag');

async function callSupabaseRpc(fnName, params) {
    if (fs.existsSync(DROP_FLAG)) {
        const err = new Error('SIMULATED_INTERNET_OUTAGE: Venue internet connection is DOWN. Cannot reach Supabase cloud.');
        err.code = 'ENETUNREACH';
        throw err;
    }
    return await supabase.rpc(fnName, params);
}

// ─── WAL (WRITE-AHEAD LOG) OPERATIONS ──────────────────────────────────────────

function readWal() {
    try {
        if (fs.existsSync(WAL_FILE)) {
            const raw = fs.readFileSync(WAL_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error(`[WAL] Error reading WAL file:`, err.message);
    }
    return null;
}

function writeWal(record) {
    try {
        fs.writeFileSync(WAL_FILE, JSON.stringify(record, null, 2), 'utf8');
        console.log(`[WAL] Persisted state '${record.state}' for order ${record.order_id} to disk.`);
    } catch (err) {
        console.error(`[WAL] CRITICAL: Failed to write WAL file:`, err.message);
        throw err;
    }
}

function clearWal(archiveReason = 'COMPLETED') {
    try {
        if (fs.existsSync(WAL_FILE)) {
            const wal = readWal();
            if (wal) {
                wal.state = archiveReason;
                wal.archived_at = new Date().toISOString();
                fs.writeFileSync(WAL_FILE, JSON.stringify(wal, null, 2), 'utf8');
            }
        }
        console.log(`[WAL] WAL archived with reason: ${archiveReason}`);
    } catch (err) {
        console.warn(`[WAL] Error archiving WAL:`, err.message);
    }
}

// ─── NETIO LAN HTTP CLIENT ───────────────────────────────────────────────────

async function getNetioState() {
    const res = await fetch(`${NETIO_BASE_URL}/netio.json`, {
        headers: { 'Authorization': `Basic ${NETIO_AUTH}` }
    });
    if (!res.ok) {
        throw new Error(`NETIO GET returned status ${res.status}`);
    }
    return await res.json();
}

async function sendNetioOutputs(outputs) {
    const res = await fetch(`${NETIO_BASE_URL}/netio.json`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${NETIO_AUTH}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ Outputs: outputs })
    });
    if (!res.ok) {
        throw new Error(`NETIO POST returned status ${res.status}`);
    }
    return await res.json();
}

// ─── CRASH RECOVERY & STARTUP CHECK ──────────────────────────────────────────

async function checkRecovery() {
    const wal = readWal();
    if (!wal || ['COMPLETED', 'EXPIRED', 'FAILED'].includes(wal.state)) {
        console.log(`[STARTUP] WAL clean or idle. Ready for new commands.`);
        return;
    }

    console.log(`\x1b[33m[WAL RECOVERY] In-flight state detected: ${wal.state} for command ${wal.command_id}, order ${wal.order_id}\x1b[0m`);
    console.log(`\x1b[33m[WAL RECOVERY] RULE ENFORCED: Never re-dispatching relay command after crash.\x1b[0m`);

    // Check hardware status
    try {
        const netioState = await getNetioState();
        const targetOutput = netioState.Outputs.find(o => o.ID === (wal.target_outlet_id || 1));
        console.log(`[WAL RECOVERY] NETIO Outlet ${wal.target_outlet_id || 1} state: ${targetOutput ? targetOutput.State : 'unknown'}`);

        const now = Date.now();
        const expiresAtMs = new Date(wal.game_expires_at).getTime();

        if (now < expiresAtMs && targetOutput && targetOutput.State === 1) {
            console.log(`[WAL RECOVERY] Hardware is ON and session still active until ${wal.game_expires_at}. Resuming monitoring...`);
            try {
                await callSupabaseRpc('arcade_gateway_report_activation_success', {
                    p_venue_id: VENUE_ID,
                    p_gateway_id: GATEWAY_ID,
                    p_gateway_token: GATEWAY_TOKEN,
                    p_command_id: wal.command_id
                });
            } catch (e) {}
            await monitorGameToEnd(wal);
        } else {
            console.log(`[WAL RECOVERY] Session expired or relay OFF. Reconciling...`);
            if (targetOutput && targetOutput.State === 0) {
                // Restore lights locally
                await sendNetioOutputs([{ ID: 3, Action: 1 }]);
                // Report OFF
                await callSupabaseRpc('arcade_gateway_report_off', {
                    p_venue_id: VENUE_ID,
                    p_gateway_id: GATEWAY_ID,
                    p_gateway_token: GATEWAY_TOKEN,
                    p_command_id: wal.command_id,
                    p_off_observed_at: new Date().toISOString()
                });
                clearWal('RECOVERED_AND_COMPLETED');
            } else {
                await callSupabaseRpc('arcade_gateway_report_uncertain', {
                    p_venue_id: VENUE_ID,
                    p_gateway_id: GATEWAY_ID,
                    p_gateway_token: GATEWAY_TOKEN,
                    p_command_id: wal.command_id,
                    p_error_reason: 'CRASH_RECOVERY_UNCERTAIN_STATE'
                });
                clearWal('RECOVERED_UNCERTAIN');
            }
        }
    } catch (err) {
        console.error(`[WAL RECOVERY] Hardware probe failed during recovery:`, err.message);
    }
}

// ─── GAME MONITORING & RECONCILIATION ─────────────────────────────────────────

async function monitorGameToEnd(walRecord) {
    const gameExpiresAtMs = new Date(walRecord.game_expires_at).getTime();
    console.log(`[MONITOR] Monitoring game for order ${walRecord.order_id}. Ends at: ${walRecord.game_expires_at}`);

    while (true) {
        const remainingMs = gameExpiresAtMs - Date.now();
        if (remainingMs > 0) {
            const sleepMs = Math.min(remainingMs, 2000);
            await new Promise(r => setTimeout(r, sleepMs));
        } else {
            break;
        }
    }

    console.log(`\n\x1b[32m[MONITOR] Game timer elapsed (${walRecord.duration_seconds}s). Verifying OFF state on hardware...\x1b[0m`);
    
    // Poll hardware for confirmation of OFF
    let offConfirmed = false;
    let netioState = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
        try {
            netioState = await getNetioState();
            const targetOutput = netioState.Outputs.find(o => o.ID === walRecord.target_outlet_id);
            if (targetOutput && targetOutput.State === 0) {
                offConfirmed = true;
                break;
            }
        } catch (err) {
            console.warn(`[MONITOR] Poll attempt ${attempt} failed:`, err.message);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!offConfirmed) {
        console.error(`\x1b[31m[MONITOR] ERROR: Outlet ${walRecord.target_outlet_id} did NOT turn OFF after watchdog! Locking table...\x1b[0m`);
        await callSupabaseRpc('arcade_gateway_report_uncertain', {
            p_venue_id: VENUE_ID,
            p_gateway_id: GATEWAY_ID,
            p_gateway_token: GATEWAY_TOKEN,
            p_command_id: walRecord.command_id,
            p_error_reason: 'RELAY_DID_NOT_TURN_OFF_AFTER_WATCHDOG'
        });
        clearWal('FAILED_NOT_OFF');
        return;
    }

    console.log(`\x1b[32m[MONITOR] Confirmed Outlet ${walRecord.target_outlet_id} is State: 0 (OFF).\x1b[0m`);

    // 1. Local Attract Lights Auto-Restore (LAN autonomous)
    try {
        console.log(`[MONITOR] Turning Attract Lights (Outlet 3) back ON locally in LAN...`);
        await sendNetioOutputs([{ ID: 3, Action: 1 }]);
        console.log(`[MONITOR] Attract Lights turned ON successfully.`);
    } catch (err) {
        console.warn(`[MONITOR] Warning: Failed to turn attract lights ON locally:`, err.message);
    }

    // 2. Authoritative Cloud Reconciliation (with resilient retry for network drops)
    console.log(`[MONITOR] Reporting confirmed OFF state to cloud Supabase...`);
    const offReportTime = new Date().toISOString();
    let reconciled = false;
    while (!reconciled) {
        try {
            const { data: recRes, error: recErr } = await callSupabaseRpc('arcade_gateway_report_off', {
                p_venue_id: VENUE_ID,
                p_gateway_id: GATEWAY_ID,
                p_gateway_token: GATEWAY_TOKEN,
                p_command_id: walRecord.command_id,
                p_off_observed_at: offReportTime
            });

            if (recErr || !recRes?.success) {
                console.error(`[MONITOR] Cloud reconciliation failed (will retry):`, recErr?.message || recRes?.error);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.log(`\x1b[32m[MONITOR] Cloud reconciliation SUCCESS! Table lock state: ${recRes.table_lock_state}\x1b[0m`);
                clearWal('COMPLETED');
                reconciled = true;
            }
        } catch (netEx) {
            console.error(`[MONITOR] Network error reporting OFF (internet drop):`, netEx.message);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// ─── COMMAND EXECUTION ────────────────────────────────────────────────────────

async function processCommand(cmd) {
    console.log(`\n\x1b[35m[COMMAND] Claimed command ${cmd.command_id} for order ${cmd.order_id} (duration: ${cmd.duration_seconds}s)\x1b[0m`);

    // 1. Verify dispatch deadline
    const now = Date.now();
    const deadlineMs = new Date(cmd.dispatch_deadline_at).getTime();
    if (now > deadlineMs) {
        console.warn(`\x1b[31m[COMMAND] Command deadline exceeded (${cmd.dispatch_deadline_at} < ${new Date().toISOString()}). Discarding.\x1b[0m`);
        return;
    }

    // 2. Calculate immutable timestamps
    const dispatchTime = new Date();
    const gameExpiresTime = new Date(dispatchTime.getTime() + cmd.duration_seconds * 1000);

    const walRecord = {
        command_id: cmd.command_id,
        order_id: cmd.order_id,
        table_id: cmd.table_id,
        target_outlet_id: cmd.target_outlet_id || 1,
        duration_seconds: cmd.duration_seconds,
        hardware_dispatched_at: dispatchTime.toISOString(),
        game_expires_at: gameExpiresTime.toISOString(),
        state: 'DISPATCHING_LOCAL_RELAY'
    };

    // 3. PYSYVÄ ENNAKKOKIRJAUS LEVYLLE (WAL) ENNEN NETIO-KUTSUA
    writeWal(walRecord);

    // 4. Kirjataan mahdollinen lähetyshetki pilveen
    try {
        await callSupabaseRpc('arcade_gateway_report_dispatch_attempt', {
            p_venue_id: VENUE_ID,
            p_gateway_id: GATEWAY_ID,
            p_gateway_token: GATEWAY_TOKEN,
            p_command_id: cmd.command_id,
            p_hardware_dispatched_at: dispatchTime.toISOString(),
            p_game_expires_at: gameExpiresTime.toISOString()
        });
    } catch (err) {
        console.warn(`[COMMAND] Note: Cloud dispatch attempt notice failed or delayed:`, err.message);
    }

    // 5. NETIO HTTP-kutsu lähiverkossa
    console.log(`[DISPATCH] \x1b[33mANNOUNCEMENT: Sending Short ON to Outlet ${walRecord.target_outlet_id} (${cmd.duration_seconds}s) and Outlet 3 OFF...\x1b[0m`);
    let postResult = null;
    let netioErr = null;

    try {
        postResult = await sendNetioOutputs([
            { ID: walRecord.target_outlet_id, Action: 3, Delay: cmd.duration_seconds * 1000 },
            { ID: 3, Action: 0 } // Attract lights OFF during play
        ]);
    } catch (err) {
        netioErr = err;
    }

    // 6. Validointi (Käyttäjän sääntö: ei vaadita Action: 3, tarkistetaan HTTP 200 + kelvollinen JSON + State === 1)
    let isSuccess = false;
    let verifiedState = null;

    if (!netioErr && postResult && Array.isArray(postResult.Outputs)) {
        // Double check state directly
        try {
            const probe = await getNetioState();
            const out = probe.Outputs.find(o => o.ID === walRecord.target_outlet_id);
            if (out) {
                verifiedState = out.State;
                if (verifiedState === 1) {
                    isSuccess = true;
                }
            }
        } catch (probeErr) {
            console.warn(`[DISPATCH] Probe error after POST:`, probeErr.message);
        }
    }

    if (!isSuccess) {
        console.error(`\x1b[31m[DISPATCH] HARDWARE UNCERTAIN: POST failed or State !== 1. Error: ${netioErr?.message || 'State ' + verifiedState}\x1b[0m`);
        walRecord.state = 'HARDWARE_UNCERTAIN';
        writeWal(walRecord);

        await callSupabaseRpc('arcade_gateway_report_uncertain', {
            p_venue_id: VENUE_ID,
            p_gateway_id: GATEWAY_ID,
            p_gateway_token: GATEWAY_TOKEN,
            p_command_id: cmd.command_id,
            p_error_reason: netioErr ? `POST_ERROR: ${netioErr.message}` : `INVALID_STATE: ${verifiedState}`
        });
        return;
    }

    console.log(`\x1b[32m[DISPATCH] SUCCESS! NETIO Outlet ${walRecord.target_outlet_id} is State: 1 (ON), Outlet 3 is OFF.\x1b[0m`);
    walRecord.state = 'ACTIVE_PLAY';
    writeWal(walRecord);

    // 7. Kuittaa onnistunut aktivointi pilveen
    await callSupabaseRpc('arcade_gateway_report_activation_success', {
        p_venue_id: VENUE_ID,
        p_gateway_id: GATEWAY_ID,
        p_gateway_token: GATEWAY_TOKEN,
        p_command_id: cmd.command_id
    });

    // 8. Seuraa pelin päättymistä
    await monitorGameToEnd(walRecord);
}

// ─── POLLING LOOP ─────────────────────────────────────────────────────────────

let isRunning = true;

async function pollLoop() {
    console.log(`[POLL] Gateway polling queue for venue ${VENUE_ID}...`);
    while (isRunning) {
        try {
            const { data: res, error } = await callSupabaseRpc('arcade_gateway_claim_command', {
                p_venue_id: VENUE_ID,
                p_gateway_id: GATEWAY_ID,
                p_gateway_token: GATEWAY_TOKEN
            });

            if (error) {
                console.error(`[POLL] RPC Error:`, error.message);
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            if (res && res.success && res.command) {
                await processCommand(res.command);
            }
        } catch (err) {
            console.error(`[POLL] Unexpected error in polling loop:`, err.message);
        }

        await new Promise(r => setTimeout(r, 1500));
    }
}

async function start() {
    await checkRecovery();
    await pollLoop();
}

process.on('SIGINT', () => {
    console.log('\n[GATEWAY] Shutting down cleanly...');
    isRunning = false;
    process.exit(0);
});

start().catch(err => {
    console.error(`[FATAL]`, err);
    process.exit(1);
});
