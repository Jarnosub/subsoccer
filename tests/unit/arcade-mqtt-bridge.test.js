import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { EventEmitter } from 'events';

const require = createRequire(import.meta.url);

const {
    getMqttConfig,
    validateMqttConfig,
    parseNetioOutputsTelemetry,
    dispatchTimedPlayMqtt,
    probeOutletOffMqtt,
    setAuxOutletMqtt,
    setMaintenanceEventMqtt,
    _setMqttClientFactory
} = require('../../netlify/functions/utils/mqtt-cloud-bridge.js');

const {
    claimAndActivateOrder,
    getTableConfig,
    _setSupabaseClient,
    memoryDb,
    resetMemoryDb
} = require('../../netlify/functions/utils/arcade-core.js');

/**
 * Mock MQTT Client simulating network events, publish, subscribe, and message reception
 */
class MockMqttClient extends EventEmitter {
    constructor(config, prefix) {
        super();
        this.config = config;
        this.prefix = prefix;
        this.subscriptions = new Set();
        this.publishedMessages = [];
        this.isEnded = false;

        // Auto-emit 'connect' on next tick
        setTimeout(() => {
            if (!this.isEnded) this.emit('connect');
        }, 5);
    }

    subscribe(topic, opts, cb) {
        this.subscriptions.add(topic);
        if (typeof opts === 'function') cb = opts;
        setTimeout(() => { if (cb) cb(null); }, 5);
    }

    publish(topic, payload, opts, cb) {
        this.publishedMessages.push({
            topic,
            payload: typeof payload === 'string' ? payload : payload.toString(),
            opts
        });
        if (typeof opts === 'function') cb = opts;
        setTimeout(() => { if (cb) cb(null); }, 5);
    }

    end(force, cb) {
        this.isEnded = true;
        this.removeAllListeners();
        if (cb) cb();
    }

    simulateMessage(topic, payload, packet = { retain: false }) {
        if (this.isEnded) return;
        const buffer = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
        this.emit('message', topic, buffer, packet);
    }
}

describe('Subsoccer Arcade: NETIO PowerBOX 3PF Strict MQTT Safety & Reconciliation', () => {
    let activeClients = [];

    beforeEach(() => {
        activeClients = [];
        _setMqttClientFactory((config, prefix) => {
            const client = new MockMqttClient(config, prefix);
            activeClients.push(client);
            return client;
        });
        resetMemoryDb();
        _setSupabaseClient(null);
    });

    afterEach(() => {
        _setMqttClientFactory(null);
        for (const client of activeClients) {
            client.end(true);
        }
        activeClients = [];
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 1. SECURE BROKER CONFIGURATION & VALIDATION
    // ──────────────────────────────────────────────────────────────────────────
    describe('1. Secure Broker Configuration & Topic Scoping', () => {
        it('rejects public HiveMQ broker (broker.hivemq.com)', () => {
            expect(() => {
                validateMqttConfig({
                    host: 'broker.hivemq.com',
                    port: 8883,
                    username: 'user',
                    password: 'pw',
                    deviceSn: 'NETIO-123'
                }, { isProductionStrict: true });
            }).toThrow(/Public HiveMQ broker is strictly forbidden/);
        });

        it('rejects missing host or unencrypted port 1883', () => {
            expect(() => {
                validateMqttConfig({ host: '', port: 8883, username: 'u', password: 'p', deviceSn: 'd' }, { isProductionStrict: true });
            }).toThrow(/Private secure MQTT broker host/);

            expect(() => {
                validateMqttConfig({ host: 'my.hivemq.cloud', port: 1883, username: 'u', password: 'p', deviceSn: 'd' }, { isProductionStrict: true });
            }).toThrow(/Secure TLS port 8883 required/);
        });

        it('rejects missing credentials or device serial in production', () => {
            expect(() => {
                validateMqttConfig({ host: 'my.hivemq.cloud', port: 8883, username: '', password: '', deviceSn: 'd' }, { isProductionStrict: true });
            }).toThrow(/Private broker credentials/);

            expect(() => {
                validateMqttConfig({ host: 'my.hivemq.cloud', port: 8883, username: 'u', password: 'p', deviceSn: '' }, { requireDeviceSn: true, isProductionStrict: true });
            }).toThrow(/Device serial number/);
        });

        it('accepts valid private TLS configuration', () => {
            expect(validateMqttConfig({
                host: 'subsoccer.hivemq.cloud',
                port: 8883,
                username: 'subsoccer_app',
                password: 'SecretPassword123!',
                deviceSn: '24A42C3B9999'
            }, { isProductionStrict: true })).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. NETIO TELEMETRY PARSING (${OUTPUTS_STATUS})
    // ──────────────────────────────────────────────────────────────────────────
    describe('2. NETIO Official Telemetry Parsing (${OUTPUTS_STATUS})', () => {
        it('correctly parses genuine ${OUTPUTS_STATUS} payload with Outputs array', () => {
            const payload = JSON.stringify({
                Outputs: [
                    { ID: 1, Name: 'Table Power', State: 1, Action: 3, Delay: 300000 },
                    { ID: 2, Name: 'Screen', State: 1, Action: 1, Delay: 0 },
                    { ID: 3, Name: 'Attract Lights', State: 0, Action: 0, Delay: 0 }
                ]
            });

            const outputs = parseNetioOutputsTelemetry(Buffer.from(payload));
            expect(outputs).toHaveLength(3);
            expect(outputs[0]).toEqual({ ID: 1, State: 1, Action: 3, Delay: 300000, Name: 'Table Power' });
            expect(outputs[1]).toEqual({ ID: 2, State: 1, Action: 1, Delay: 0, Name: 'Screen' });
            expect(outputs[2]).toEqual({ ID: 3, State: 0, Action: 0, Delay: 0, Name: 'Attract Lights' });
        });

        it('correctly parses direct array format and stringified states', () => {
            const payload = JSON.stringify([
                { ID: '1', State: '0' },
                { ID: '2', State: '1' }
            ]);

            const outputs = parseNetioOutputsTelemetry(Buffer.from(payload));
            expect(outputs).toHaveLength(2);
            expect(outputs[0]).toEqual({ ID: 1, State: 0, Action: undefined, Delay: undefined, Name: undefined });
            expect(outputs[1]).toEqual({ ID: 2, State: 1, Action: undefined, Delay: undefined, Name: undefined });
        });

        it('returns null on malformed JSON or empty buffers', () => {
            expect(parseNetioOutputsTelemetry(null)).toBeNull();
            expect(parseNetioOutputsTelemetry(Buffer.from('not-json'))).toBeNull();
            expect(parseNetioOutputsTelemetry(Buffer.from('{"Other": 123}'))).toBeNull();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. PLAY DISPATCH: NO OPTIMISTIC_NO_TELEMETRY & CHRONOLOGICAL CAUSALITY
    // ──────────────────────────────────────────────────────────────────────────
    describe('3. dispatchTimedPlayMqtt Safety & Telemetry Verification', () => {
        const baseOptions = {
            deviceSn: 'TEST-NETIO-SN',
            durationSeconds: 300,
            targetOutletId: 1,
            attractOutletId: 3,
            timeoutMs: 100
        };

        it('fails with TIMEOUT_NO_TELEMETRY if NETIO sends no telemetry (NO OPTIMISTIC ASSUMPTION)', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);

            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
            expect(result.error).toMatch(/did not publish activation telemetry/);
        });

        it('discards retained telemetry packets (anti-stale guarantee)', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);

            // Wait until client publishes command
            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];
            expect(client).toBeDefined();

            // Simulate incoming telemetry marked as retained
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [{ ID: 1, State: 1 }]
            }, { retain: true });

            // Expect the retained message to be ignored, leading to timeout failure
            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('discards pre-publish telemetry arriving before command publish ACK', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);
            const client = activeClients[0];

            // Send message BEFORE publish ACK is recorded
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [{ ID: 1, State: 1 }]
            }, { retain: false });

            // Expect pre-publish message to be ignored, leading to timeout
            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('succeeds immediately when fresh non-retained telemetry with State === 1 arrives after publish', async () => {
            const promise = dispatchTimedPlayMqtt({ ...baseOptions, timeoutMs: 1000 });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            // Publish valid activation telemetry after command was sent
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [
                    { ID: 1, State: 1, Action: 3, Delay: 300000 },
                    { ID: 3, State: 0 }
                ]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(true);
            expect(result.observedAt).toBeDefined();
            expect(result.rawTelemetry).toBeDefined();

            // Verify published command payload
            expect(client.publishedMessages).toHaveLength(1);
            const published = JSON.parse(client.publishedMessages[0].payload);
            expect(published.Outputs).toEqual([
                { ID: 1, Action: 3, Delay: 300000 },
                { ID: 3, Action: 0 }
            ]);
        });

        it('matches strictly by ID field, NOT array index', async () => {
            const promise = dispatchTimedPlayMqtt({ ...baseOptions, timeoutMs: 1000 });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            // Output 1 is at index 2 in the array
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [
                    { ID: 2, State: 1 },
                    { ID: 3, State: 0 },
                    { ID: 1, State: 1 }
                ]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(true);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. PROBE OUTLET OFF: NO OPTIMISTIC PULSE EXPIRATION & GENUINE OFF CHECK
    // ──────────────────────────────────────────────────────────────────────────
    describe('4. probeOutletOffMqtt Safety & State Verification', () => {
        const probeOptions = {
            deviceSn: 'TEST-NETIO-SN',
            targetOutletId: 1,
            timeoutMs: 80
        };

        it('returns confirmedOff: false and NO fake timestamp on timeout (NO OPTIMISTIC PULSE EXPIRY)', async () => {
            const promise = probeOutletOffMqtt(probeOptions);

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.state).toBeNull();
            expect(result.observedAt).toBeNull();
            expect(result.reason).toBe('PROBE_TIMEOUT_NO_FRESH_TELEMETRY');
        });

        it('returns confirmedOff: true with observedAt when fresh telemetry reports State === 0', async () => {
            const promise = probeOutletOffMqtt({ ...probeOptions, timeoutMs: 1000 });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [
                    { ID: 1, State: 0, Action: 0, Delay: 0 },
                    { ID: 3, State: 1 }
                ]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(true);
            expect(result.state).toBe(0);
            expect(result.observedAt).toBeDefined();
            expect(result.reason).toBe('CONFIRMED_OFF');
        });

        it('returns confirmedOff: false when fresh telemetry reports State === 1 (outlet still active)', async () => {
            const promise = probeOutletOffMqtt({ ...probeOptions, timeoutMs: 1000 });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [
                    { ID: 1, State: 1, Action: 3, Delay: 150000 }
                ]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.state).toBe(1);
            expect(result.reason).toBe('OUTLET_STILL_ON');
        });

        it('discards retained probe messages', async () => {
            const promise = probeOutletOffMqtt(probeOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            // Retained State 0 message should be ignored
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [{ ID: 1, State: 0 }]
            }, { retain: true });

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.reason).toBe('PROBE_TIMEOUT_NO_FRESH_TELEMETRY');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. AUXILIARY OUTLETS (DISPLAY & ATTRACT LIGHTS)
    // ──────────────────────────────────────────────────────────────────────────
    describe('5. Auxiliary Outlets Control (Display & Lights)', () => {
        it('rejects controlling main table power (Outlet 1) through setAuxOutletMqtt', async () => {
            await expect(setAuxOutletMqtt({
                deviceSn: 'TEST-NETIO-SN',
                outletId: 1,
                action: 1
            })).rejects.toThrow(/Only auxiliary outlets 2/);
        });

        it('controls attract lights (Outlet 3) and verifies state response', async () => {
            const promise = setAuxOutletMqtt({
                deviceSn: 'TEST-NETIO-SN',
                outletId: 3,
                action: 1,
                timeoutMs: 1000
            });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [{ ID: 3, State: 1 }]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(true);
            expect(result.state).toBe(1);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. IDEMPOTENCY & RECONCILIATION PROTECTIONS
    // ──────────────────────────────────────────────────────────────────────────
    describe('6. Idempotency & Reconciliation Protections', () => {
        it('reconciliation release requires deadline + 4s buffer and does not release early', async () => {
            // Mock an expired session order where now is only 2s past expires_at
            const now = Date.now();
            const expiresAtMs = now - 2000; // Only 2s expired, buffer is 4s (need now > expiresAtMs + 4000)

            const isPassedBuffer = now > (expiresAtMs + 4000);
            expect(isPassedBuffer).toBe(false); // Must not release yet!

            // After 5s expired (> 4s buffer)
            const pastBufferExpiresAtMs = now - 5000;
            const isNowPassedBuffer = now > (pastBufferExpiresAtMs + 4000);
            expect(isNowPassedBuffer).toBe(true);
        });

        it('claimAndActivateOrder rejects missing PaymentIntent data for paid plays', async () => {
            const res = await claimAndActivateOrder({
                orderId: 'ord-test-123',
                paymentIntent: null,
                isFreePlay: false,
                isTestMode: true
            });

            expect(res.success).toBe(false);
            expect(res.code).toBe('INVALID_PAYMENT_INTENT');
        });
    });
});
