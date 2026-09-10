/**
 * ==============================================================================
 * SUBSOCCER GO — ARCADE SESSION API (NETIO PowerBOX Integration)
 * ==============================================================================
 * 
 * Endpoints:
 * - GET  ?action=status&table=demo-pulse-01
 * - POST { action: "activate", table: "demo-pulse-01", durationMinutes: 15, clientToken: "..." }
 * - POST { action: "emergency-cut", table: "demo-pulse-01" }
 * - POST { action: "set-outlet", table: "demo-pulse-01", outletId: 2, state: true }
 */

const { NetioAdapter } = require('./utils/netio-adapter.js');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Session-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

// In-memory active session cache for Phase A simulation / standalone operations
const inMemorySessions = new Map();

exports.handler = async function (event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' };
    }

    try {
        const netio = new NetioAdapter({
            endpoint: process.env.NETIO_ENDPOINT || 'simulated',
            username: process.env.NETIO_USER || 'admin',
            password: process.env.NETIO_PASS || '',
            isMock: !process.env.NETIO_ENDPOINT || process.env.NETIO_ENDPOINT === 'simulated'
        });

        // ─── 1. GET STATUS ───
        if (event.httpMethod === 'GET') {
            const tableId = event.queryStringParameters?.table || 'demo-pulse-01';
            const existingSession = inMemorySessions.get(tableId);

            let tableState = 'available';
            let timeRemainingSecs = 0;

            if (existingSession && existingSession.expiresAt > Date.now()) {
                tableState = 'active';
                timeRemainingSecs = Math.max(0, Math.round((existingSession.expiresAt - Date.now()) / 1000));
            } else if (existingSession && Date.now() - existingSession.expiresAt < 4000) {
                tableState = 'cooldown';
            }

            const netioStatus = await netio.getStatus().catch(() => ({ mode: 'offline' }));

            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    success: true,
                    tableId,
                    state: tableState,
                    timeRemainingSecs,
                    hardware: {
                        mode: netio.isMock ? 'simulation' : 'hardware',
                        endpoint: netio.isMock ? 'simulation' : 'connected',
                        outlets: netioStatus.outputs || []
                    },
                    packages: [15, 30, 60]
                })
            };
        }

        // ─── 2. POST ACTIONS ───
        if (event.httpMethod === 'POST') {
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

            const { action, table = 'demo-pulse-01', durationMinutes = 15, outletId = 1, state = false, clientToken } = body;

            // ACTION: ACTIVATE SESSION (USE CASE 1: POWER LEASE)
            if (action === 'activate') {
                const currentSession = inMemorySessions.get(table);
                if (currentSession && currentSession.expiresAt > Date.now()) {
                    return {
                        statusCode: 409,
                        headers: CORS_HEADERS,
                        body: JSON.stringify({
                            error: 'Table is currently active with another session.',
                            expiresAt: new Date(currentSession.expiresAt).toISOString()
                        })
                    };
                }

                // Command NETIO: Action 3 (Short ON)
                const commandResult = await netio.startTimedPlay(Number(durationMinutes), 1);
                const expiresAt = Date.now() + (Number(durationMinutes) * 60 * 1000);

                inMemorySessions.set(table, {
                    tableId: table,
                    clientToken: clientToken || 'tok-' + Date.now(),
                    startedAt: Date.now(),
                    durationMinutes: Number(durationMinutes),
                    expiresAt
                });

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        action: 'activate',
                        tableId: table,
                        durationMinutes: Number(durationMinutes),
                        expiresAt: new Date(expiresAt).toISOString(),
                        hardware: commandResult
                    })
                };
            }

            // ACTION: EMERGENCY FORCE CUT
            if (action === 'emergency-cut') {
                const commandResult = await netio.emergencyStop(1);
                inMemorySessions.delete(table);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        action: 'emergency-cut',
                        tableId: table,
                        hardware: commandResult
                    })
                };
            }

            // ACTION: MODERATOR OUTLET CONTROL (Outlet 2: Lights, Outlet 3: Screen)
            if (action === 'set-outlet') {
                const commandResult = await netio.setOutletState(Number(outletId), Boolean(state));

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        success: true,
                        action: 'set-outlet',
                        outletId: Number(outletId),
                        state: Boolean(state),
                        hardware: commandResult
                    })
                };
            }

            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: `Unknown action: ${action}` })
            };
        }

        return {
            statusCode: 405,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    } catch (error) {
        console.error('[API ERROR] arcade-session:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
};
