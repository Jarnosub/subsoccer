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
 * - Parses genuine NETIO MQTT-flex ${OUTPUTS_STATUS} JSON payloads
 * - Searches outputs strictly by ID field (`o.ID === targetOutletId`), NEVER by array index
 * - Validates numeric State (0 = OFF, 1 = ON)
 * - Bounded timeouts with fail-closed safety (missing telemetry yields failure, NEVER assumed success)
 * - No optimistic fallbacks: OPTIMISTIC_NO_TELEMETRY and OPTIMISTIC_HARDWARE_PULSE_EXPIRED removed
 * - Single dispatch with no retries that could duplicate physical plays
 * 
 * NETIO MQTT FLEX Configuration Reference:
 * - Topic Command: subsoccer/test-<sn>/cmd
 * - Topic Status:  subsoccer/test-<sn>/status
 * - Trigger 1 (Event):   {"type": "change", "source": "OUTPUTS/1/STATE"}
 * - Trigger 2 (Timer):    {"type": "timer", "period": 5}
 * - Payload template:     ${OUTPUTS_STATUS}
 *   (Note: ${JDOUT_STATUS} is invalid in PowerBOX 3PF and triggers "Variable parser: Invalid variable")
 */

const mqtt = require('mqtt');

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
        topicPrefix: (overrides.topicPrefix || process.env.MQTT_TOPIC_PREFIX || 'subsoccer/test').trim(),
        allowInsecure: Boolean(overrides.allowInsecure)
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
 * Extracts outlet ID and numeric State (0 or 1).
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
    } else if (Array.isArray(data)) {
        outputs = data;
    }

    if (!outputs) return null;

    return outputs.map(o => {
        const idNum = typeof o.ID === 'number' ? o.ID : parseInt(o.ID, 10);
        let stateNum = null;
        if (typeof o.State === 'number') {
            stateNum = o.State;
        } else if (o.State !== undefined && o.State !== null) {
            const parsed = parseInt(o.State, 10);
            if (!isNaN(parsed)) stateNum = parsed;
        }

        return {
            ID: idNum,
            State: stateNum,
            Action: typeof o.Action === 'number' ? o.Action : undefined,
            Delay: typeof o.Delay === 'number' ? o.Delay : undefined,
            Name: o.Name
        };
    }).filter(o => !isNaN(o.ID) && o.State !== null && !isNaN(o.State));
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
 * - Matches outlet strictly by ID field (`o.ID === targetOutletId`).
 * 
 * @param {Object} options
 * @param {string} [options.deviceSn] - Device serial number
 * @param {number} options.durationSeconds - Game duration in seconds
 * @param {number} [options.targetOutletId=1] - Table power outlet (Output 1)
 * @param {number} [options.attractOutletId=3] - Attract lights outlet (Output 3)
 * @param {number} [options.timeoutMs=12000] - Max wait time for activation ACK
 * @returns {Promise<{ success: boolean, code?: string, observedAt?: string, error?: string, rawTelemetry?: any }>}
 */
async function dispatchTimedPlayMqtt({
    deviceSn,
    durationSeconds,
    targetOutletId = 1,
    attractOutletId = 3,
    timeoutMs = 12000
}) {
    const config = getMqttConfig({ deviceSn });
    validateMqttConfig(config, { requireDeviceSn: true });

    const sn = config.deviceSn;
    const topicCmd = `${config.topicPrefix}-${sn}/cmd`;
    const topicStatus = `${config.topicPrefix}-${sn}/status`;

    const delayMs = Math.round(durationSeconds * 1000);
    const payloadCmd = JSON.stringify({
        Outputs: [
            { ID: targetOutletId, Action: 3, Delay: delayMs },
            { ID: attractOutletId, Action: 0 }
        ]
    });

    return new Promise((resolve) => {
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

            const outputs = parseNetioOutputsTelemetry(msgBuffer);
            if (!outputs) return;

            // Search strictly by ID field, NOT by array index
            const targetOutput = outputs.find(o => o.ID === targetOutletId);
            if (targetOutput && targetOutput.State === 1) {
                console.log(`[MQTT BRIDGE] Verified Output ${targetOutletId} is ACTIVE (State: 1)!`);
                finish({
                    success: true,
                    observedAt: new Date().toISOString(),
                    rawTelemetry: outputs
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
 * - Does NOT assume {"Outputs": []} triggers a synchronous MQTT reply. Listens for fresh status
 *   telemetry (from periodic timer or event) received at or after probe start.
 * - Strictly ignores retained messages (`packet.retain === true`).
 * - Chronological causality: only considers messages received at or after probe start.
 * - Requires numeric State === 0. State === 1 returns confirmedOff: false.
 * 
 * @param {Object} options
 * @param {string} [options.deviceSn]
 * @param {number} [options.targetOutletId=1]
 * @param {number} [options.timeoutMs=5000]
 * @returns {Promise<{ confirmedOff: boolean, state: number|null, observedAt?: string|null, roundtripMs?: number, reason?: string }>}
 */
async function probeOutletOffMqtt({
    deviceSn,
    targetOutletId = 1,
    timeoutMs = 5000
}) {
    const config = getMqttConfig({ deviceSn });
    validateMqttConfig(config, { requireDeviceSn: true });

    const sn = config.deviceSn;
    const topicCmd = `${config.topicPrefix}-${sn}/cmd`;
    const topicStatus = `${config.topicPrefix}-${sn}/status`;
    const probeStartedAt = Date.now();

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

            const outputs = parseNetioOutputsTelemetry(msgBuffer);
            if (!outputs) return;

            const targetOutput = outputs.find(o => o.ID === targetOutletId);
            if (targetOutput && typeof targetOutput.State === 'number') {
                const isOff = (targetOutput.State === 0);
                const roundtripMs = Date.now() - probeStartedAt;
                finish({
                    confirmedOff: isOff,
                    state: targetOutput.State,
                    roundtripMs,
                    observedAt: new Date().toISOString(),
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
    timeoutMs = 5000
}) {
    if (![2, 3].includes(outletId)) {
        throw new Error(`Only auxiliary outlets 2 (Screen) and 3 (Lights) can be controlled via setAuxOutletMqtt`);
    }

    const config = getMqttConfig({ deviceSn });
    validateMqttConfig(config, { requireDeviceSn: true });

    const sn = config.deviceSn;
    const topicCmd = `${config.topicPrefix}-${sn}/cmd`;
    const topicStatus = `${config.topicPrefix}-${sn}/status`;
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
            finish({ success: false, reason: 'TIMEOUT_NO_CONFIRMATION' });
        }, timeoutMs);

        try {
            client = createMqttClient(config, 'aux');
        } catch (e) {
            return finish({ success: false, reason: e.message });
        }

        client.on('error', (err) => finish({ success: false, reason: err.message }));

        client.on('connect', () => {
            client.subscribe(topicStatus, { qos: 0 }, (err) => {
                if (err) return finish({ success: false, reason: err.message });
                client.publish(topicCmd, payload, { qos: 0, retain: false });
            });
        });

        client.on('message', (topic, msgBuffer, packet) => {
            if (topic !== topicStatus || (packet && packet.retain)) return;
            if (Date.now() < startedAt) return;
            const outputs = parseNetioOutputsTelemetry(msgBuffer);
            if (!outputs) return;
            const target = outputs.find(o => o.ID === outletId);
            if (target && target.State === action) {
                finish({ success: true, state: target.State, observedAt: new Date().toISOString() });
            }
        });
    });
}

/**
 * Publish maintenance event string ("maintenance" or "normal")
 * 
 * @param {Object} options
 * @param {string} [options.deviceSn]
 * @param {boolean} options.isMaintenance
 */
async function setMaintenanceEventMqtt({
    deviceSn,
    isMaintenance
}) {
    const config = getMqttConfig({ deviceSn });
    validateMqttConfig(config, { requireDeviceSn: true });

    const sn = config.deviceSn;
    const topicEvent = `${config.topicPrefix}-${sn}/event`;
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
    parseNetioOutputsTelemetry,
    createMqttClient,
    dispatchTimedPlayMqtt,
    probeOutletOffMqtt,
    setAuxOutletMqtt,
    setMaintenanceEventMqtt,
    _setMqttClientFactory
};
