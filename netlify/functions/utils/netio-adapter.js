/**
 * ==============================================================================
 * SUBSOCCER ARCADE — NETIO PowerBOX 3PF / 4KF Hardware Adapter
 * ==============================================================================
 * 
 * Supports:
 * - NETIO PowerBOX 3PF (3x Schuko, LAN, ZVS)
 * - NETIO PowerBOX 4KF (4x Schuko, LAN, ZCS, Power Metering)
 * - NETIO PowerCable 1KF (1x Schuko, WiFi, ZCS)
 * 
 * Protocol: NETIO Open API (JSON API via HTTP POST, URL API fallback)
 * Actions:
 *   0 = OFF
 *   1 = ON
 *   2 = Short OFF (Restart)
 *   3 = Short ON (Turn ON with auto-off timer)
 *   4 = Toggle
 */

class NetioAdapter {
    /**
     * @param {Object} config
     * @param {string} [config.endpoint] - e.g. "http://192.168.1.150" or remote URL.
     * @param {string} [config.username] - JSON API username
     * @param {string} [config.password] - JSON API password
     * @param {number} [config.timeoutMs] - HTTP timeout (default: 3500ms)
     * @param {boolean} [config.isMock] - Force mock simulation mode
     */
    constructor(config = {}) {
        const rawEndpoint = config.endpoint || process.env.NETIO_BASE_URL || process.env.NETIO_ENDPOINT;
        const allowMock = process.env.ARCADE_MOCK_MODE === 'true' || process.env.NODE_ENV === 'test' || process.env.ARCADE_ENV === 'test';
        
        this.endpoint = rawEndpoint || (allowMock ? 'simulated' : '');
        this.username = config.username || process.env.NETIO_USERNAME || process.env.NETIO_USER || 'admin';
        this.password = config.password || process.env.NETIO_PASSWORD || process.env.NETIO_PASS || '';
        this.timeoutMs = config.timeoutMs || 3500;
        this.isMock = config.isMock ?? (this.endpoint === 'simulated' || (!rawEndpoint && allowMock));

        // Mock state tracking for high-fidelity physical hardware simulation
        this._mockOutputs = config.mockOutputs ? JSON.parse(JSON.stringify(config.mockOutputs)) : [
            { id: 1, name: 'Subsoccer Pulse Table', state: 0, delayMs: 0 },
            { id: 2, name: 'Attract Lights', state: 1, delayMs: 0 },
            { id: 3, name: 'Kiosk Display', state: 1, delayMs: 0 }
        ];
        this.mockActiveShortOn = config.mockActiveShortOn ?? false;
        this.mockCutoffRejected = config.mockCutoffRejected ?? false;
        this.mockCutoffReturnsState1 = config.mockCutoffReturnsState1 ?? false;
        this.mockStatusOutputState = config.mockStatusOutputState ?? null;
        this.mockStatusFails = config.mockStatusFails ?? false;
        this.mockStartFails = config.mockStartFails ?? false;
        this.mockVerifyOffThrows = config.mockVerifyOffThrows ?? false;

        if (!this.isMock && !this.endpoint) {
            throw new Error('NETIO configuration missing: NETIO_BASE_URL (or NETIO_ENDPOINT) must be provided in non-test mode');
        }
    }

    /**
     * Activate a timed session for the Subsoccer table (Käyttötapaus 1: Power Lease)
     * Uses NETIO Action: 3 (Short ON) with Delay in milliseconds.
     * 
     * @param {number} durationMinutes - e.g. 15, 30, 60 or 0.5 (for 30s test)
     * @param {number} [outletId=1] - Pistorasia 1 = Pelipöytä
     * @param {number} [durationSeconds] - e.g. 30 (optional explicit seconds)
     * @returns {Promise<Object>}
     */
    async startTimedPlay(durationMinutes, outletId = 1, durationSeconds = null) {
        const delayMs = durationSeconds != null 
            ? Math.round(durationSeconds * 1000) 
            : Math.round(durationMinutes * 60 * 1000);

        if (this.isMock) {
            if (this.mockStartFails) {
                const err = new Error('NETIO command failed: simulated hardware error');
                err.code = 'COMMUNICATION_ERROR';
                throw err;
            }
            console.log(`[NETIO MOCK] startTimedPlay: Outlet ${outletId} -> Short ON for ${delayMs} ms.`);
            const out = this._mockOutputs.find(o => o.id === outletId);
            if (out) {
                out.state = 1;
                out.delayMs = delayMs;
            }
            return {
                success: true,
                mode: 'simulation',
                outletId,
                action: 3,
                delayMs,
                autoOffSecs: Math.round(delayMs / 1000),
                timestamp: new Date().toISOString()
            };
        }

        const payload = {
            Outputs: [
                {
                    ID: outletId,
                    Action: 3,
                    Delay: delayMs
                }
            ]
        };

        return await this._sendJsonCommand(payload);
    }

    /**
     * Moderator / Venue control: Switch a specific outlet ON or OFF
     * Used for:
     * - Outlet 2: Huomiovalot (Attract lights)
     * - Outlet 3: Näyttö / TV
     * 
     * @param {number} outletId - 1, 2, or 3
     * @param {boolean} turnOn - true = ON, false = OFF
     * @returns {Promise<Object>}
     */
    async setOutletState(outletId, turnOn) {
        const action = turnOn ? 1 : 0;

        if (this.isMock) {
            console.log(`[NETIO MOCK] setOutletState: Outlet ${outletId} -> ${turnOn ? 'ON' : 'OFF'} (Action ${action}).`);

            if (!turnOn) {
                // Katkaisuyritys (Action 0)
                if (this.mockCutoffRejected || this.mockActiveShortOn) {
                    const err = new Error(`NETIO cutoff rejected with HTTP 400 Bad request on Outlet ${outletId}`);
                    err.code = 'CUTOFF_REJECTED';
                    err.status = 400;
                    throw err;
                }
                if (this.mockCutoffReturnsState1) {
                    const err = new Error(`NETIO cutoff command for Outlet ${outletId} failed: device reported State=1 (expected 0/OFF)`);
                    err.code = 'CUTOFF_STILL_ON';
                    throw err;
                }
            }

            const out = this._mockOutputs.find(o => o.id === outletId);
            if (out) {
                out.state = turnOn ? 1 : 0;
                out.delayMs = 0;
            }

            return {
                success: true,
                mode: 'simulation',
                outletId,
                state: turnOn ? 1 : 0,
                response: {
                    Outputs: [
                        { ID: outletId, Action: action, State: turnOn ? 1 : 0 }
                    ]
                },
                timestamp: new Date().toISOString()
            };
        }

        const payload = {
            Outputs: [
                {
                    ID: outletId,
                    Action: action
                }
            ]
        };

        return await this._sendJsonCommand(payload);
    }

    /**
     * Emergency Force Stop: Cut power immediately to the table
     * @param {number} [outletId=1]
     */
    async emergencyStop(outletId = 1) {
        return await this.setOutletState(outletId, false);
    }

    /**
     * Query real-time device and outputs status
     * @returns {Promise<Object>}
     */
    async getStatus() {
        if (this.isMock) {
            if (this.mockStatusFails) {
                const err = new Error('NETIO getStatus failed: simulated device unreachable');
                err.code = 'NETWORK_ERROR';
                throw err;
            }

            return {
                success: true,
                mode: 'simulation',
                device: {
                    model: 'NETIO PowerBOX 3PF',
                    firmware: '4.0.0-sim',
                    numOutputs: this._mockOutputs.length
                },
                outputs: this._mockOutputs.map(o => ({
                    id: o.id,
                    name: o.name,
                    state: this.mockStatusOutputState !== null ? this.mockStatusOutputState : o.state,
                    action: o.state === 1 ? 1 : 0,
                    delayMs: o.delayMs || 0
                })),
                timestamp: new Date().toISOString()
            };
        }

        const cleanUrl = this.endpoint.replace(/\/$/, '') + '/netio.json';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const headers = { 'Accept': 'application/json' };
            if (this.password) {
                const authString = Buffer.from(`${this.username}:${this.password}`).toString('base64');
                headers['Authorization'] = `Basic ${authString}`;
            }

            const res = await fetch(cleanUrl, {
                method: 'GET',
                headers,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                const err = new Error(`NETIO responded with status ${res.status}: ${res.statusText}`);
                err.status = res.status;
                throw err;
            }

            let data;
            try {
                data = await res.json();
            } catch (jsonErr) {
                throw new Error(`NETIO getStatus returned invalid non-JSON payload (status ${res.status}): ${jsonErr.message}`);
            }

            if (!data || typeof data !== 'object' || !Array.isArray(data.Outputs)) {
                throw new Error("NETIO getStatus response missing required 'Outputs' array");
            }

            return {
                success: true,
                mode: 'hardware',
                device: data.Agent || {},
                outputs: (data.Outputs || []).map(o => ({
                    id: o.ID,
                    name: o.Name,
                    state: o.State,
                    action: o.Action,
                    delayMs: o.Delay
                })),
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                const timeoutErr = new Error(`NETIO getStatus timed out after ${this.timeoutMs}ms`);
                timeoutErr.code = 'TIMEOUT';
                throw timeoutErr;
            }
            if (!err.code) {
                err.code = err.status ? `HTTP_${err.status}` : 'NETWORK_ERROR';
            }
            console.error('[NETIO ERROR] getStatus failed:', err.message);
            throw err;
        }
    }

    /**
     * Check if a specific outlet is currently powered ON
     * @param {number} [outletId=1]
     * @returns {Promise<boolean>}
     */
    async isOutputActive(outletId = 1) {
        const status = await this.getStatus();
        const output = (status.outputs || []).find(o => o.id === outletId);
        if (!output) {
            throw new Error(`Outlet ${outletId} not found in NETIO status response`);
        }
        return typeof output.state === 'number' && output.state === 1;
    }

    /**
     * Strictly verify that an outlet is confirmed to be OFF (State === 0).
     * Reads output directly from getStatus().
     * Returns true ONLY if output exists and output.state === 0 (strictly numerical 0).
     * Missing output, missing state, null, string "0", unknown value, or error must return false.
     * 
     * @param {number} [outletId=1]
     * @returns {Promise<boolean>} true only if output exists and state is strictly numerical 0
     */
    async verifyConfirmedOff(outletId = 1) {
        if (this.mockVerifyOffThrows) {
            const err = new Error(`NETIO probe error: simulated probe exception thrown on Outlet ${outletId}`);
            err.code = 'PROBE_EXCEPTION';
            throw err;
        }
        try {
            const status = await this.getStatus();
            const output = (status?.outputs || []).find(o => o.id === outletId);
            if (!output) {
                return false;
            }
            // Strict check: must be strictly numerical 0
            return typeof output.state === 'number' && output.state === 0;
        } catch (err) {
            console.warn(`[NETIO] verifyConfirmedOff probe failed for Outlet ${outletId}:`, err.message);
            return false;
        }
    }

    /**
     * Internal helper: Send POST /netio.json
     * @private
     */
    async _sendJsonCommand(payload) {
        const cleanUrl = this.endpoint.replace(/\/$/, '') + '/netio.json';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const targetOutput = payload?.Outputs?.[0];
        const targetOutputId = targetOutput?.ID;
        const targetAction = targetOutput?.Action;

        try {
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            if (this.password) {
                const authString = Buffer.from(`${this.username}:${this.password}`).toString('base64');
                headers['Authorization'] = `Basic ${authString}`;
            }

            const res = await fetch(cleanUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                if (res.status === 400 && targetAction === 0) {
                    const err = new Error(`NETIO cutoff rejected with HTTP 400 Bad request on Outlet ${targetOutputId}`);
                    err.code = 'CUTOFF_REJECTED';
                    err.status = 400;
                    throw err;
                }
                const err = new Error(`NETIO command failed with HTTP status ${res.status}`);
                err.status = res.status;
                err.code = `HTTP_${res.status}`;
                throw err;
            }

            let responseData;
            try {
                responseData = await res.json();
            } catch (jsonErr) {
                throw new Error(`NETIO returned invalid non-JSON payload (status ${res.status}): ${jsonErr.message}`);
            }

            if (!responseData || typeof responseData !== 'object' || !Array.isArray(responseData.Outputs)) {
                throw new Error("NETIO response missing required 'Outputs' confirmation array");
            }

            if (targetOutput && targetOutput.ID !== undefined) {
                const confirmedOutput = responseData.Outputs.find(o => o.ID === targetOutputId);
                if (!confirmedOutput) {
                    throw new Error(`NETIO response did not confirm action for Outlet ${targetOutputId}`);
                }

                // Vahvista että releen palauttama tila (State) vastaa annettua käskyä (Action)
                if (targetAction === 0 && confirmedOutput.State !== 0) {
                    const err = new Error(`NETIO cutoff command for Outlet ${targetOutputId} failed: device reported State=${confirmedOutput.State} (expected 0/OFF)`);
                    err.code = 'CUTOFF_STILL_ON';
                    throw err;
                }
                if (targetAction === 1 && confirmedOutput.State !== 1) {
                    throw new Error(`NETIO power ON command for Outlet ${targetOutputId} failed: device reported State=${confirmedOutput.State} (expected 1/ON)`);
                }
                if (targetAction === 3 && confirmedOutput.State !== 1) {
                    throw new Error(`NETIO timed play (Short ON) for Outlet ${targetOutputId} failed: device reported State=${confirmedOutput.State} (expected 1/ON)`);
                }
            }

            return {
                success: true,
                mode: 'hardware',
                response: responseData,
                timestamp: new Date().toISOString()
            };
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                const timeoutErr = new Error(`NETIO command timed out after ${this.timeoutMs}ms`);
                timeoutErr.code = 'TIMEOUT';
                throw timeoutErr;
            }
            if (!err.code) {
                err.code = 'NETWORK_ERROR';
            }
            console.error('[NETIO ERROR] Command failed:', err.message);
            throw err;
        }
    }
}

module.exports = NetioAdapter;
module.exports.NetioAdapter = NetioAdapter;

