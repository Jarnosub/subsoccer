const {
    getMqttConfig,
    dispatchTimedPlayMqtt,
    probeOutletOffMqtt,
    setAuxOutletMqtt,
    setMaintenanceEventMqtt
} = require('./utils/mqtt-cloud-bridge');
const { getSupabase } = require('./utils/arcade-core');

exports.handler = async (event) => {
    // 1. Palvelinpuolinen ylläpitovaltuutus (Admin Token)
    const adminToken = process.env.ADMIN_TOKEN;
    const reqToken = event.headers['x-admin-token'] || 
                     (event.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
                     event.queryStringParameters?.adminToken;

    if (!reqToken || reqToken !== adminToken) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Unauthorized: Valid admin token required for diagnostic test', code: 'UNAUTHORIZED' })
        };
    }

    const config = getMqttConfig();
    const action = event.queryStringParameters?.action || 'probe';
    const targetOutlet = parseInt(event.queryStringParameters?.outlet || '1', 10);
    const requestedSn = event.queryStringParameters?.sn || config.deviceSn;

    // 2. Sallii vain testilaitteen
    if (requestedSn !== config.deviceSn) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `Forbidden: Only test device ${config.deviceSn} is permitted`, code: 'INVALID_DEVICE_SN' })
        };
    }

    const isMaskedConfig = {
        host: config.host,
        port: config.port,
        deviceSn: config.deviceSn,
        hasAuth: Boolean(config.username && config.password)
    };

    try {
        if (action === 'probe') {
            const result = await probeOutletOffMqtt({
                deviceSn: config.deviceSn,
                targetOutletId: targetOutlet,
                timeoutMs: 6000
            });
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: result.confirmedOff, action: 'probe', config: isMaskedConfig, result })
            };
        }

        if (action === 'pulse') {
            // 3. Rajattu pulssi: enintään 30 sekuntia
            const rawDuration = parseInt(event.queryStringParameters?.duration || '10', 10);
            const durationSeconds = Math.min(Math.max(rawDuration, 5), 30); // 5s .. 30s max

            // 4. Tarkistetaan pöydän lukitustila kannasta: ei ohita aktiivisen pelin tai huollon lukitusta
            const sb = getSupabase();
            const tableId = event.queryStringParameters?.table || process.env.PILOT_TABLE_ID || 'demo-pulse-01';

            if (sb) {
                const { data: tableCfg, error: tableErr } = await sb
                    .from('arcade_table_configs')
                    .select('lock_state, is_enabled')
                    .eq('table_id', tableId)
                    .maybeSingle();

                if (tableErr) {
                    return {
                        statusCode: 500,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ error: 'Database check failed before pulse', details: tableErr.message })
                    };
                }

                if (tableCfg) {
                    if (tableCfg.lock_state === 'active') {
                        return {
                            statusCode: 409,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ error: 'Rejected: Active game is currently in progress. Diagnostic pulse forbidden.', code: 'TABLE_ACTIVE' })
                        };
                    }
                    if (tableCfg.lock_state === 'maintenance_locked' || !tableCfg.is_enabled) {
                        return {
                            statusCode: 423,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ error: 'Rejected: Table is locked in maintenance. Diagnostic pulse forbidden.', code: 'TABLE_IN_MAINTENANCE' })
                        };
                    }
                    if (tableCfg.lock_state === 'error_locked') {
                        return {
                            statusCode: 423,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ error: 'Rejected: Table is error-locked. Diagnostic pulse forbidden.', code: 'TABLE_ERROR_LOCKED' })
                        };
                    }
                }
            }

            console.log(`[ARCADE MQTT TEST] Authorized pulse: ${durationSeconds}s on Outlet ${targetOutlet}`);
            const result = await dispatchTimedPlayMqtt({
                deviceSn: config.deviceSn,
                durationSeconds,
                targetOutletId: targetOutlet,
                attractOutletId: 3,
                timeoutMs: 12000
            });

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: result.success, action: 'pulse', durationSeconds, config: isMaskedConfig, result })
            };
        }

        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `Unknown action: ${action}` })
        };
    } catch (err) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: err.message })
        };
    }
};
