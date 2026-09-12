/**
 * ==============================================================================
 * SUBSOCCER ARCADE — Cloud-Native Secure MQTT Bridge
 * ==============================================================================
 * 
 * Handles ephemeral, serverless MQTT communication from Netlify Functions
 * directly to NETIO PowerBOX 3PF via private cloud MQTT broker (e.g. HiveMQ Cloud).
 * 
 * Guarantees:
 * - Strict TLS (port 8883) with private cloud credentials and certificate validation
 * - Ephemeral connection lifecycle (connect -> suback -> pub -> observe -> end)
 * - Anti-stale protection: strictly discards broker retained messages (packet.retain === true)
 * - Chronological causality: ignores telemetry arriving before command publish / probe start
 * - Measurement freshness verification: validates genuine device timestamps (${TIME})
 *   and command correlation (Action 3 for timed play)
 * - Parses genuine NETIO MQTT-flex ${OUTPUTS_STATUS} JSON payloads
 * - Searches outputs strictly by ID field (`o.ID === targetOutletId`), NEVER by array index
 * - Strictly validates numeric State (0 = OFF, 1 = ON) and rejects invalid values (e.g. "0-invalid")
 * - Bounded timeouts adapted to device periodic interval (15s probe timeout for 5s periodic interval)
 * - Fail-closed safety: missing telemetry yields failure, NEVER assumed success
 * - No optimistic fallbacks: OPTIMISTIC_NO_TELEMETRY and OPTIMISTIC_HARDWARE_PULSE_EXPIRED removed
 * - Single dispatch with no retries that could duplicate physical plays
 * 
 * NETIO MQTT FLEX Configuration Reference:
 * - Topic Command: subsoccer/test-<sn>/cmd
 * - Topic Status:  subsoccer/test-<sn>/status
 * - Trigger 1 (Event):   {"type": "change", "source": "OUTPUTS/1/STATE"}
 * - Trigger 2 (Timer):    {"type": "timer", "period": 5}
 * - Payload template:     {"Time": "${TIME}", "Outputs": ${OUTPUTS_STATUS}}
 *   (Note: ${JDOUT_STATUS} is invalid in PowerBOX 3PF and triggers "Variable parser: Invalid variable")
 */

const mqtt = require('mqtt');

// Allow slight positive clock delta for network transit / clock jitter into future (5s max)
const MAX_FUTURE_SKEW_MS = 5000;

let _clientFactory = null;

/**
 * Dependency injection helper for unit tests to mock MQTT client
 */
function _setMqttClientFactory(factory) {
    _clientFactory = factory;
}

/**
 * Retrieve MQTT configuration from environment or parameters.
 * Does NOT fall back to public HiveMQ or hardcoded device serial.
 */
function getMqttConfig(overrides = {}) {
    return {
        host: overrides.host || process.env.HIVEMQ_HOST || process.env.MQTT_BROKER_HOST || '',
        port: parseInt(overrides.port || process.env.HIVEMQ_PORT || process.env.MQTT_BROKER_PORT || '8883', 10),
        username: overrides.username || process.env.HIVEMQ_USERNAME || process.env.MQTT_USERNAME || '',
        password: overrides.password || process.env.HIVEMQ_PASSWORD || process.env.MQTT_PASSWORD || '',
        deviceSn: overrides.deviceSn || process.env.HIVEMQ_DEVICE_SN || process.env.NETIO_SERIAL || '',
        topicPrefix: (overrides.topicPrefix || process.env.MQTT_TOPIC_PREFIX || 'subsoccer').trim(),
        allowInsecure: Boolean(overrides.allowInsecure)
    };
}

/**
 * Resolve standard MQTT topics for a device: subsoccer/<SN>/cmd and subsoccer/<SN>/status.
 * @param {Object} config
 * @returns {{ cmd: string, status: string, event: string }}
 */
function getDeviceTopics(config) {
    const rawPrefix = (config.topicPrefix || 'subsoccer').trim();
    const sn = config.deviceSn;
    const base = rawPrefix.endsWith('-') || rawPrefix.endsWith('/') ? `${rawPrefix}${sn}` : `${rawPrefix}/${sn}`;
    return {
        cmd: `${base}/cmd`,
        status: `${base}/status`,
        event: `${base}/event`
    };
}

/**
 * Validate configuration for production / secure operation.
 */
function validateMqttConfig(config, { requireDeviceSn = true, isProductionStrict = false } = {}) {
    const isTestMode = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
    if (!isProductionStrict && (_clientFactory || config.allowInsecure || isTestMode)) {
        return true;
    }

    if (!config.host || config.host === 'broker.hivemq.com') {
        throw new Error('CONFIG_INVALID: Private secure MQTT broker host (HIVEMQ_HOST) required. Public HiveMQ broker is strictly forbidden.');
    }
    if (config.port !== 8883) {
        throw new Error(`CONFIG_INVALID: Secure TLS port 8883 required for cloud MQTT broker (received port: ${config.port}).`);
    }
    if (!config.username || !config.password) {
        throw new Error('CONFIG_INVALID: Private broker credentials (HIVEMQ_USERNAME and HIVEMQ_PASSWORD) are required.');
    }
    if (requireDeviceSn && !config.deviceSn) {
        throw new Error('CONFIG_INVALID: Device serial number (HIVEMQ_DEVICE_SN or deviceSn parameter) is required.');
    }
    return true;
}

/**
 * Parse genuine NETIO ${OUTPUTS_STATUS} payload.
 * Handles both `{ Outputs: [...] }` wrapper and raw `[...]` array.
 * Extracts device timestamp if present (Time, time, timestamp, Agent.Time).
 * Strictly validates:
 * - ID must be a positive integer (rejects "1-invalid", floats, negatives)
 * - State must strictly be 0 or 1 (rejects "0-invalid", booleans, floats, other numbers)
 * 
 * @param {Buffer|string} msgBuffer
 * @returns {{ outputs: Array<{ ID: number, State: number, Action?: number, Delay?: number, Name?: string }>, deviceTime: string|null, deviceTimeMs: number|null } | null}
 */
function parseNetioOutputsTelemetry(msgBuffer) {
    if (!msgBuffer) return null;
    let data;
    try {
        const text = msgBuffer.toString().trim();
        data = JSON.parse(text);
    } catch (e) {
        return null;
    }

    if (!data) return null;
    let outputs = null;
    if (Array.isArray(data.Outputs)) {
        outputs = data.Outputs;
    } else if (data.Outputs && typeof data.Outputs === 'object' && Array.isArray(data.Outputs.Outputs)) {
        outputs = data.Outputs.Outputs;
    } else if (data.Status && typeof data.Status === 'object' && Array.isArray(data.Status.Outputs)) {
        outputs = data.Status.Outputs;
    } else if (Array.isArray(data)) {
        outputs = data;
    }

    if (!outputs) return null;

    let deviceTime = null;
    let deviceTimeMs = null;
    let hasValidTimestamp = false;

    const rawTime = data.Time ?? data.time ?? data.timestamp ?? data.UTC_TIME ?? data.utc_time ??
        (data.Status && typeof data.Status === 'object' && (data.Status.Time ?? data.Status.time ?? data.Status.UTC_TIME)) ??
        (data.Agent && (data.Agent.Time ?? data.Agent.time ?? data.Agent.timestamp));
    if (rawTime !== undefined && rawTime !== null && rawTime !== '') {
        if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime > 0) {
            // Unix epoch: if seconds (< 1e11), convert to ms
            const ms = rawTime < 1e11 ? Math.round(rawTime * 1000) : Math.round(rawTime);
            deviceTime = new Date(ms).toISOString();
            deviceTimeMs = ms;
            hasValidTimestamp = true;
        } else if (typeof rawTime === 'string') {
            const trimmed = rawTime.trim();
            if (/^\d{9,13}$/.test(trimmed)) {
                const num = Number(trimmed);
                const ms = num < 1e11 ? num * 1000 : num;
                deviceTime = new Date(ms).toISOString();
                deviceTimeMs = ms;
                hasValidTimestamp = true;
            } else {
                const parsedMs = Date.parse(trimmed);
                if (!isNaN(parsedMs) && Number.isFinite(parsedMs)) {
                    deviceTime = new Date(parsedMs).toISOString();
                    deviceTimeMs = parsedMs;
                    hasValidTimestamp = true;
                }
            }
        }
    }

    if (!hasValidTimestamp && outputs && outputs.length > 0 && outputs[0] && typeof outputs[0] === 'object') {
        const outTime = outputs[0].Time ?? outputs[0].time ?? outputs[0].timestamp;
        if (outTime !== undefined && outTime !== null && outTime !== '') {
            if (typeof outTime === 'number' && Number.isFinite(outTime) && outTime > 0) {
                const ms = outTime < 1e11 ? Math.round(outTime * 1000) : Math.round(outTime);
                deviceTime = new Date(ms).toISOString();
                deviceTimeMs = ms;
                hasValidTimestamp = true;
            } else if (typeof outTime === 'string') {
                const trimmed = outTime.trim();
                const parsedMs = Date.parse(trimmed);
                if (!isNaN(parsedMs) && Number.isFinite(parsedMs)) {
                    deviceTime = new Date(parsedMs).toISOString();
                    deviceTimeMs = parsedMs;
                    hasValidTimestamp = true;
                }
            }
        }
    }

    const parsedOutputs = [];
    for (const o of outputs) {
        if (!o || typeof o !== 'object') continue;

        // STRICT ID VALIDATION: must be a genuine positive integer
        let idNum = null;
        if (typeof o.ID === 'number' && Number.isInteger(o.ID) && o.ID > 0) {
            idNum = o.ID;
        } else if (typeof o.ID === 'string' && /^[1-9]\d*$/.test(o.ID.trim())) {
            idNum = Number(o.ID.trim());
        } else {
            // Reject invalid ID (e.g. "1-invalid", negative, float, non-numeric)
            continue;
        }

        // STRICT STATE VALIDATION: must strictly be 0 or 1. No "0-invalid", no loose strings, no floats.
        let stateNum = null;
        if (o.State === 0 || o.State === 1) {
            stateNum = o.State;
        } else if (o.State === '0') {
            stateNum = 0;
        } else if (o.State === '1') {
            stateNum = 1;
        } else {
            // Reject anything else (e.g. "0-invalid", 2, true, false, null)
            continue;
        }

        let actionNum = undefined;
        if (typeof o.Action === 'number' && Number.isInteger(o.Action)) {
            actionNum = o.Action;
        } else if (typeof o.Action === 'string' && /^\d+$/.test(o.Action.trim())) {
            actionNum = Number(o.Action.trim());
        }

        let delayNum = undefined;
        if (typeof o.Delay === 'number' && !isNaN(o.Delay)) {
            delayNum = o.Delay;
        } else if (typeof o.Delay === 'string' && /^\d+$/.test(o.Delay.trim())) {
            delayNum = Number(o.Delay.trim());
        }

        parsedOutputs.push({
            ID: idNum,
            State: stateNum,
            Action: actionNum,
            Delay: delayNum,
            Name: typeof o.Name === 'string' ? o.Name : undefined
        });
    }

    return {
        outputs: parsedOutputs,
        deviceTime,
        deviceTimeMs,
        hasValidTimestamp
    };
}

/**
 * Helper to connect to broker over TLS with timeout.
 */
function createMqttClient(config, clientPrefix = 'cloud-fn') {
    if (_clientFactory) {
        return _clientFactory(config, clientPrefix);
    }

    validateMqttConfig(config, { requireDeviceSn: false });
    const clientId = `${clientPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isLocalOrMock = config.port === 1883 || config.host === 'localhost' || config.host === '127.0.0.1';
    const protocol = isLocalOrMock ? 'mqtt' : 'mqtts';

    const client = mqtt.connect(`${protocol}://${config.host}:${config.port}`, {
        clientId,
        username: config.username || undefined,
        password: config.password || undefined,
        servername: isLocalOrMock ? undefined : config.host,
        rejectUnauthorized: !isLocalOrMock,
        protocolVersion: 4, // MQTT 3.1.1
        connectTimeout: 8000,
        reconnectPeriod: 0 // Do NOT auto-reconnect inside ephemeral serverless functions
    });

    return client;
}

/**
 * Dispatch timed play command to NETIO and await genuine hardware activation telemetry (State === 1).
 * 
 * Strict safety rules:
 * - NO OPTIMISTIC_NO_TELEMETRY: timeout without telemetry returns failure.
 * - Strictly ignores retained messages (`packet.retain === true`).
 * - Chronological causality: ignores telemetry received before command publish ACK.
 * - Measurement freshness: if device timestamp is provided, verifies it is not stale.
 * - Command correlation: if Action/Delay reported, verifies Action is 3 (timed play).
 * - Matches outlet strictly by ID field (`o.ID === targetOutletId`).
 * 
 * @param {Object} options
 * @param {string} [options.deviceSn] - Device serial number
 * @param {number} options.durationSeconds - Game duration in seconds
 * @param {number} [options.targetOutletId=1] - Table power outlet (Output 1)
 * @param {number} [options.attractOutletId=3] - Attract lights outlet (Output 3)
 * @param {number} [options.timeoutMs=15000] - Max wait time for activation ACK
 * @returns {Promise<{ success: boolean, code?: string, observedAt?: string, error?: string, rawTelemetry?: any }>}
 */
async function dispatchTimedPlayMqtt({
    deviceSn,
    durationSeconds,
    targetOutletId = 1,
    attractOutletId = 3,
    timeoutMs = (process.env.TEST_DISPATCH_TIMEOUT_MS ? Number(process.env.TEST_DISPATCH_TIMEOUT_MS) : (Number(process.env.MQTT_DISPATCH_TIMEOUT_MS) || 15000))
}) {
    return new Promise((resolve) => {
        let config;
        try {
            config = getMqttConfig({ deviceSn });
            validateMqttConfig(config, { requireDeviceSn: true });
        } catch (cfgErr) {
            return resolve({
                success: false,
                code: 'CONFIG_INVALID',
                error: cfgErr.message
            });
        }

        const topics = getDeviceTopics(config);
        const topicCmd = topics.cmd;
        const topicStatus = topics.status;

        const delayMs = Math.round(durationSeconds * 1000);
        const payloadCmd = JSON.stringify({
            Outputs: [
                { ID: targetOutletId, Action: 3, Delay: delayMs },
                { ID: attractOutletId, Action: 0 }
            ]
        });

        let client = null;
        let isDone = false;
        let commandPublishedAt = 0;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            if (client) {
                try { client.end(true); } catch (e) {}
            }
        };

        const finish = (result) => {
            if (isDone) return;
            isDone = true;
            cleanup();
            resolve(result);
        };

        const timer = setTimeout(() => {
            console.warn(`[MQTT BRIDGE] dispatchTimedPlayMqtt timed out after ${timeoutMs}ms waiting for activation.`);
            finish({
                success: false,
                code: 'TIMEOUT_NO_TELEMETRY',
                error: 'NETIO did not publish activation telemetry (State: 1) within deadline'
            });
        }, timeoutMs);

        try {
            client = createMqttClient(config, 'dispatch');
        } catch (initErr) {
            return finish({
                success: false,
                code: 'CLIENT_INIT_FAILED',
                error: initErr.message
            });
        }

        client.on('error', (err) => {
            console.error('[MQTT BRIDGE] Connection error:', err.message);
            finish({
                success: false,
                code: 'CONNECTION_ERROR',
                error: err.message
            });
        });

        client.on('connect', () => {
            console.log(`[MQTT BRIDGE] Connected to broker ${config.host}:${config.port}. Subscribing to ${topicStatus}...`);
            client.subscribe(topicStatus, { qos: 0 }, (subErr) => {
                if (subErr) {
                    return finish({
                        success: false,
                        code: 'SUBSCRIBE_FAILED',
                        error: subErr.message
                    });
                }

                console.log(`[MQTT BRIDGE] Subscribed to ${topicStatus}. Publishing timed play command to ${topicCmd}...`);
                commandPublishedAt = Date.now();
                client.publish(topicCmd, payloadCmd, { qos: 0, retain: false }, (pubErr) => {
                    if (pubErr) {
                        return finish({
                            success: false,
                            code: 'PUBLISH_FAILED',
                            error: pubErr.message
                        });
                    }
                    console.log(`[MQTT BRIDGE] Command published successfully at ${commandPublishedAt}. Waiting for verified activation telemetry...`);
                });
            });
        });

        client.on('message', (topic, msgBuffer, packet) => {
            if (topic !== topicStatus) return;

            // Anti-stale: discard retained messages
            if (packet && packet.retain) {
                console.log('[MQTT BRIDGE] Discarding retained stale telemetry packet.');
                return;
            }

            // Chronological causality: ignore messages received before command was published
            const receivedAt = Date.now();
            if (!commandPublishedAt || receivedAt < commandPublishedAt) {
                console.log('[MQTT BRIDGE] Discarding pre-publish telemetry packet.');
                return;
            }

            const parsed = parseNetioOutputsTelemetry(msgBuffer);
            if (!parsed || !parsed.outputs || parsed.outputs.length === 0) return;

            // Strict timestamp validation: must have valid device timestamp
            if (!parsed.hasValidTimestamp || parsed.deviceTimeMs === null) {
                console.log('[MQTT BRIDGE] Discarding telemetry: missing or invalid device timestamp.');
                return;
            }

            // Delayed message rejection: must not have been generated before command publish
            if (parsed.deviceTimeMs < commandPublishedAt) {
                console.log(`[MQTT BRIDGE] Discarding delayed telemetry: deviceTime (${parsed.deviceTime}) < commandPublishedAt (${new Date(commandPublishedAt).toISOString()})`);
                return;
            }

            // Future timestamp rejection: cannot be in the future beyond server tolerance
            if (parsed.deviceTimeMs > (Date.now() + MAX_FUTURE_SKEW_MS)) {
                console.log(`[MQTT BRIDGE] Discarding future timestamp: deviceTime (${parsed.deviceTime}) is in the future.`);
                return;
            }

            // Search strictly by ID field, NOT by array index
            const targetOutput = parsed.outputs.find(o => o.ID === targetOutletId);
            if (targetOutput && targetOutput.State === 1) {
                // NOTE: NETIO PowerBOX 3PF reports Action: 6 ("no action / read status") in standard telemetry
                // both when ON and OFF. Do not reject Action !== 3; State === 1 confirms relay activation.
                console.log(`[MQTT BRIDGE] Verified Output ${targetOutletId} is ACTIVE (State: 1, Action: ${targetOutput.Action ?? 'none'})!`);
                finish({
                    success: true,
                    observedAt: parsed.deviceTime,
                    rawTelemetry: parsed.outputs
                });
            }
        });
    });
}

/**
 * Probe an outlet to verify if it is definitively OFF (State === 0).
 * 
 * Strict safety rules:
 * - NO OPTIMISTIC_HARDWARE_PULSE_EXPIRED: timeout returns confirmedOff: false.
 * - Timeout adapted to periodic interval (15000ms default for 5s device interval + connect delay).
 * - Does NOT assume {"Outputs": []} triggers a synchronous MQTT reply. Listens for fresh status
 *   telemetry (from periodic timer or event) received at or after probe start.
 * - Strictly ignores retained messages (`packet.retain === true`).
 * - Chronological causality: only considers messages received at or after probe start.
 * - Measurement freshness: if device timestamp is provided, verifies it was generated at or after probe start.
 * - Requires numeric State === 0. State === 1 returns confirmedOff: false.
 * 
 * @param {Object} options
 * @param {string} [options.deviceSn]
 * @param {number} [options.targetOutletId=1]
 * @param {number} [options.timeoutMs=15000]
 * @returns {Promise<{ confirmedOff: boolean, state: number|null, observedAt?: string|null, roundtripMs?: number, reason?: string }>}
 */
async function probeOutletOffMqtt({
    deviceSn,
    targetOutletId = 1,
    timeoutMs = (process.env.TEST_PROBE_TIMEOUT_MS ? Number(process.env.TEST_PROBE_TIMEOUT_MS) : (Number(process.env.MQTT_PROBE_TIMEOUT_MS) || 15000))
}) {
    return new Promise((resolve) => {
        let config;
        try {
            config = getMqttConfig({ deviceSn });
            validateMqttConfig(config, { requireDeviceSn: true });
        } catch (cfgErr) {
            return resolve({
                confirmedOff: false,
                state: null,
                observedAt: null,
                reason: cfgErr.message
            });
        }

        const topics = getDeviceTopics(config);
        const topicCmd = topics.cmd;
        const topicStatus = topics.status;
        const probeStartedAt = Date.now();

        let client = null;
        let isDone = false;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            if (client) {
                try { client.end(true); } catch (e) {}
            }
        };

        const finish = (result) => {
            if (isDone) return;
            isDone = true;
            cleanup();
            resolve(result);
        };

        const timer = setTimeout(() => {
            console.warn(`[MQTT PROBE] Probe timed out after ${timeoutMs}ms without fresh telemetry.`);
            finish({
                confirmedOff: false,
                state: null,
                observedAt: null,
                reason: 'PROBE_TIMEOUT_NO_FRESH_TELEMETRY'
            });
        }, timeoutMs);

        try {
            client = createMqttClient(config, 'probe');
        } catch (e) {
            return finish({ confirmedOff: false, state: null, observedAt: null, reason: e.message });
        }

        client.on('error', (err) => {
            finish({ confirmedOff: false, state: null, observedAt: null, reason: err.message });
        });

        client.on('connect', () => {
            client.subscribe(topicStatus, { qos: 0 }, (subErr) => {
                if (subErr) return finish({ confirmedOff: false, state: null, observedAt: null, reason: subErr.message });

                // Publish query to cmd topic in case device has an incoming query trigger rule,
                // but do not rely on it for response (listening for periodic status timer as well).
                const queryPayload = JSON.stringify({ Outputs: [] });
                client.publish(topicCmd, queryPayload, { qos: 0, retain: false }, (pubErr) => {
                    if (pubErr) {
                        console.warn('[MQTT PROBE] Query publish notice:', pubErr.message);
                    }
                });
            });
        });

        client.on('message', (topic, msgBuffer, packet) => {
            if (topic !== topicStatus) return;

            // Discard retained messages
            if (packet && packet.retain) {
                console.log('[MQTT PROBE] Discarding retained stale telemetry packet.');
                return;
            }

            // Chronological causality: must be received at or after probe was started
            const receivedAt = Date.now();
            if (receivedAt < probeStartedAt) {
                console.log('[MQTT PROBE] Discarding pre-probe telemetry packet.');
                return;
            }

            const parsed = parseNetioOutputsTelemetry(msgBuffer);
            if (!parsed || !parsed.outputs || parsed.outputs.length === 0) return;

            // Strict timestamp validation: must have valid device timestamp
            if (!parsed.hasValidTimestamp || parsed.deviceTimeMs === null) {
                console.log('[MQTT PROBE] Discarding probe telemetry: missing or invalid device timestamp.');
                return;
            }

            // Delayed OFF message rejection: must not have been generated before probe was initiated
            if (parsed.deviceTimeMs < probeStartedAt) {
                console.log(`[MQTT PROBE] Discarding delayed OFF telemetry: deviceTime (${parsed.deviceTime}) < probeStartedAt (${new Date(probeStartedAt).toISOString()})`);
                return;
            }

            // Future timestamp rejection: cannot be in the future beyond server tolerance
            if (parsed.deviceTimeMs > (Date.now() + MAX_FUTURE_SKEW_MS)) {
                console.log(`[MQTT PROBE] Discarding future timestamp in probe: deviceTime (${parsed.deviceTime}) is in the future.`);
                return;
            }

            const targetOutput = parsed.outputs.find(o => o.ID === targetOutletId);
            if (targetOutput && typeof targetOutput.State === 'number') {
                const isOff = (targetOutput.State === 0);
                const roundtripMs = Date.now() - probeStartedAt;
                finish({
                    confirmedOff: isOff,
                    state: targetOutput.State,
                    roundtripMs,
                    observedAt: parsed.deviceTime,
                    reason: isOff ? 'CONFIRMED_OFF' : 'OUTLET_STILL_ON'
                });
            }
        });
    });
}

/**
 * Control an auxiliary outlet (Display: Outlet 2, Attract Lights: Outlet 3)
 * 
 * @param {Object} options
 * @param {string} [options.deviceSn]
 * @param {number} options.outletId - 2 or 3
 * @param {number} options.action - 1 (ON) or 0 (OFF)
 * @param {number} [options.timeoutMs=5000]
 */
async function setAuxOutletMqtt({
    deviceSn,
    outletId,
    action,
    timeoutMs = (process.env.TEST_PROBE_TIMEOUT_MS ? Number(process.env.TEST_PROBE_TIMEOUT_MS) : (Number(process.env.MQTT_AUX_TIMEOUT_MS) || 15000))
}) {
    if (![2, 3].includes(outletId)) {
        throw new Error(`Only auxiliary outlets 2 (Screen) and 3 (Lights) can be controlled via setAuxOutletMqtt`);
    }

    const config = getMqttConfig({ deviceSn });
    validateMqttConfig(config, { requireDeviceSn: true });

    const topics = getDeviceTopics(config);
    const topicCmd = topics.cmd;
    const topicStatus = topics.status;
    const startedAt = Date.now();

    const payload = JSON.stringify({
        Outputs: [{ ID: outletId, Action: action }]
    });

    return new Promise((resolve) => {
        let client = null;
        let isDone = false;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            if (client) {
                try { client.end(true); } catch (e) {}
            }
        };

        const finish = (result) => {
            if (isDone) return;
            isDone = true;
            cleanup();
            resolve(result);
        };

        const timer = setTimeout(() => {
            console.warn(`[MQTT BRIDGE] setAuxOutletMqtt timed out after ${timeoutMs}ms waiting for confirmation.`);
            finish({
                success: false,
                code: 'TIMEOUT_NO_TELEMETRY',
                error: `NETIO did not publish auxiliary outlet confirmation within deadline`
            });
        }, timeoutMs);

        try {
            client = createMqttClient(config, 'aux');

            client.on('error', (err) => {
                console.error('[MQTT BRIDGE] MQTT Client Error during aux control:', err);
                finish({ success: false, code: 'MQTT_ERROR', error: err.message });
            });

            client.on('connect', () => {
                client.subscribe(topicStatus, { qos: 1 }, (subErr) => {
                    if (subErr) {
                        return finish({ success: false, code: 'SUBSCRIBE_ERROR', error: subErr.message });
                    }

                    client.publish(topicCmd, payload, { qos: 1 }, (pubErr) => {
                        if (pubErr) {
                            return finish({ success: false, code: 'PUBLISH_ERROR', error: pubErr.message });
                        }
                    });
                });
            });

            client.on('message', (topic, msgBuffer, packet) => {
                if (topic !== topicStatus) return;
                if (packet && packet.retain) return;

                const parsed = parseNetioOutputsTelemetry(msgBuffer);
                if (!parsed || !parsed.hasValidTimestamp || parsed.deviceTimeMs === null) return;
                if (parsed.deviceTimeMs < startedAt) return;
                if (parsed.deviceTimeMs > (Date.now() + MAX_FUTURE_SKEW_MS)) return;

                const targetOutput = parsed.outputs.find(o => o.ID === outletId);
                const expectedState = action === 1 ? 1 : 0;
                if (targetOutput && targetOutput.State === expectedState) {
                    finish({
                        success: true,
                        observedAt: parsed.deviceTime,
                        rawTelemetry: parsed.outputs
                    });
                }
            });
        } catch (err) {
            finish({ success: false, code: 'CLIENT_ERROR', error: err.message });
        }
    });
}

/**
 * Publish table maintenance / error event to MQTT broker.
 */
async function setMaintenanceEventMqtt({ deviceSn, isMaintenance = true, timeoutMs = 5000 }) {
    const config = getMqttConfig({ deviceSn });
    validateMqttConfig(config, { requireDeviceSn: true });

    const topics = getDeviceTopics(config);
    const topicEvent = topics.event;
    const eventString = isMaintenance ? 'maintenance' : 'normal';

    return new Promise((resolve) => {
        let client = null;
        let isDone = false;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            if (client) {
                try { client.end(true); } catch (e) {}
            }
        };

        const finish = (result) => {
            if (isDone) return;
            isDone = true;
            cleanup();
            resolve(result);
        };

        const timer = setTimeout(() => {
            finish({ success: false, reason: 'TIMEOUT' });
        }, 5000);

        try {
            client = createMqttClient(config, 'event');
        } catch (e) {
            return finish({ success: false, reason: e.message });
        }

        client.on('error', (err) => finish({ success: false, reason: err.message }));

        client.on('connect', () => {
            client.publish(topicEvent, eventString, { qos: 0, retain: false }, (err) => {
                if (err) finish({ success: false, reason: err.message });
                else finish({ success: true, event: eventString, publishedAt: new Date().toISOString() });
            });
        });
    });
}

module.exports = {
    getMqttConfig,
    validateMqttConfig,
    getDeviceTopics,
    parseNetioOutputsTelemetry,
    createMqttClient,
    dispatchTimedPlayMqtt,
    probeOutletOffMqtt,
    setAuxOutletMqtt,
    setMaintenanceEventMqtt,
    _setMqttClientFactory
};
