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
    createPaymentHold,
    claimAndActivateOrder,
    reconcileTableState,
    getTableConfig,
    _setSupabaseClient,
    memoryDb,
    resetMemoryDb
} = require('../../netlify/functions/utils/arcade-core.js');

const { handler: webhookHandler } = require('../../netlify/functions/stripe-webhook.js');

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
        process.env.NODE_ENV = 'test';
        process.env.ARCADE_ENV = 'test';
        process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
        delete process.env.STRIPE_WEBHOOK_SECRET;
        process.env.MQTT_ENABLED = 'true';
        process.env.TEST_PROBE_TIMEOUT_MS = '80';
        process.env.TEST_DISPATCH_TIMEOUT_MS = '80';
    });

    afterEach(() => {
        delete process.env.TEST_PROBE_TIMEOUT_MS;
        delete process.env.TEST_DISPATCH_TIMEOUT_MS;
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
    // 2. STRICT TELEMETRY PARSING (${OUTPUTS_STATUS}) & DEVICE TIMESTAMPS
    // ──────────────────────────────────────────────────────────────────────────
    describe('2. Strict Telemetry Parsing & Device Timestamp Extraction', () => {
        it('strictly accepts genuine numeric states 0 and 1, and parses device timestamp', () => {
            const payload = JSON.stringify({
                Time: '2026-09-12T18:00:00.000Z',
                Outputs: [
                    { ID: 1, Name: 'Table Power', State: 1, Action: 3, Delay: 300000 },
                    { ID: 2, Name: 'Screen', State: 0, Action: 0, Delay: 0 }
                ]
            });

            const parsed = parseNetioOutputsTelemetry(Buffer.from(payload));
            expect(parsed).not.toBeNull();
            expect(parsed.outputs).toHaveLength(2);
            expect(parsed.outputs[0].ID).toBe(1);
            expect(parsed.outputs[0].State).toBe(1);
            expect(parsed.outputs[1].ID).toBe(2);
            expect(parsed.outputs[1].State).toBe(0);
            expect(parsed.deviceTime).toBe('2026-09-12T18:00:00.000Z');
            expect(parsed.deviceTimeMs).toBe(Date.parse('2026-09-12T18:00:00.000Z'));
        });

        it('strictly REJECTS "0-invalid", floats, and invalid IDs', () => {
            const payload = JSON.stringify({
                Outputs: [
                    { ID: 1, State: '0-invalid' },   // Invalid state: must be rejected!
                    { ID: '1-invalid', State: 0 },   // Invalid ID: must be rejected!
                    { ID: -1, State: 0 },            // Negative ID: must be rejected!
                    { ID: 1.5, State: 0 },           // Non-integer ID: must be rejected!
                    { ID: 2, State: 2 },             // State 2: must be rejected!
                    { ID: 3, State: true },          // Boolean State: must be rejected!
                    { ID: 4, State: 0 }              // Valid: should be kept
                ]
            });

            const parsed = parseNetioOutputsTelemetry(Buffer.from(payload));
            expect(parsed).not.toBeNull();
            expect(parsed.outputs).toHaveLength(1);
            expect(parsed.outputs[0]).toEqual({
                ID: 4,
                State: 0,
                Action: undefined,
                Delay: undefined,
                Name: undefined
            });
        });

        it('parses nested Agent.Time and direct array format', () => {
            const payload = JSON.stringify({
                Agent: { Time: '2026-09-12T18:15:30.000Z' },
                Outputs: [{ ID: 1, State: 1 }]
            });

            const parsed = parseNetioOutputsTelemetry(Buffer.from(payload));
            expect(parsed.deviceTime).toBe('2026-09-12T18:15:30.000Z');
            expect(parsed.hasValidTimestamp).toBe(true);
            expect(parsed.outputs[0].State).toBe(1);
        });

        it('parses nested Status.Outputs or Outputs.Outputs with Unix epoch UTC_TIME', () => {
            // Case 1: "payload": "{\"Time\": ${UTC_TIME}, \"Status\": ${OUTPUTS_STATUS}}"
            const statusPayload = JSON.stringify({
                Time: 1726164822,
                Status: {
                    Outputs: [
                        { ID: 1, Name: 'Subsoccer Pulse', State: 0, Action: 6, Delay: 5000 },
                        { ID: 2, Name: 'Power output 2', State: 1, Action: 6, Delay: 5000 }
                    ]
                }
            });
            const parsedStatus = parseNetioOutputsTelemetry(Buffer.from(statusPayload));
            expect(parsedStatus).not.toBeNull();
            expect(parsedStatus.hasValidTimestamp).toBe(true);
            expect(parsedStatus.deviceTimeMs).toBe(1726164822000);
            expect(parsedStatus.outputs).toHaveLength(2);
            expect(parsedStatus.outputs[0].ID).toBe(1);
            expect(parsedStatus.outputs[0].State).toBe(0);

            // Case 2: "payload": "{\"Time\": ${UTC_TIME}, \"Outputs\": ${OUTPUTS_STATUS}}"
            const outputsNestedPayload = JSON.stringify({
                Time: 1726164822,
                Outputs: {
                    Outputs: [
                        { ID: 1, Name: 'Subsoccer Pulse', State: 1, Action: 6, Delay: 5000 }
                    ]
                }
            });
            const parsedNested = parseNetioOutputsTelemetry(Buffer.from(outputsNestedPayload));
            expect(parsedNested).not.toBeNull();
            expect(parsedNested.hasValidTimestamp).toBe(true);
            expect(parsedNested.deviceTimeMs).toBe(1726164822000);
            expect(parsedNested.outputs).toHaveLength(1);
            expect(parsedNested.outputs[0].State).toBe(1);
        });

        it('identifies invalid or missing timestamps correctly', () => {
            // Missing timestamp
            const noTime = parseNetioOutputsTelemetry(Buffer.from(JSON.stringify({ Outputs: [{ ID: 1, State: 1 }] })));
            expect(noTime.hasValidTimestamp).toBe(false);
            expect(noTime.deviceTime).toBeNull();

            // Malformed timestamp string
            const badTime = parseNetioOutputsTelemetry(Buffer.from(JSON.stringify({ Time: 'invalid-not-a-date', Outputs: [{ ID: 1, State: 1 }] })));
            expect(badTime.hasValidTimestamp).toBe(false);
            expect(badTime.deviceTime).toBeNull();

            // Unix timestamp in seconds
            const unixTime = parseNetioOutputsTelemetry(Buffer.from(JSON.stringify({ timestamp: 1789234567, Outputs: [{ ID: 1, State: 1 }] })));
            expect(unixTime.hasValidTimestamp).toBe(true);
            expect(unixTime.deviceTimeMs).toBe(1789234567000);
        });

        it('returns null on malformed JSON or empty buffers', () => {
            expect(parseNetioOutputsTelemetry(null)).toBeNull();
            expect(parseNetioOutputsTelemetry(Buffer.from('not-json'))).toBeNull();
            expect(parseNetioOutputsTelemetry(Buffer.from('{"Other": 123}'))).toBeNull();
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. PLAY DISPATCH: NO OPTIMISTIC_NO_TELEMETRY, FRESHNESS & COMMAND CORRELATION
    // ──────────────────────────────────────────────────────────────────────────
    describe('3. dispatchTimedPlayMqtt Safety, Freshness & Verification', () => {
        const baseOptions = {
            deviceSn: 'TEST-NETIO-SN',
            durationSeconds: 300,
            targetOutletId: 1,
            attractOutletId: 3,
            timeoutMs: 80
        };

        it('fails with TIMEOUT_NO_TELEMETRY if NETIO sends no telemetry (NO OPTIMISTIC ASSUMPTION)', async () => {
            const result = await dispatchTimedPlayMqtt(baseOptions);
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('discards retained telemetry packets (anti-stale guarantee)', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];
            expect(client).toBeDefined();

            // Simulate incoming telemetry marked as retained
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: new Date().toISOString(),
                Outputs: [{ ID: 1, State: 1 }]
            }, { retain: true });

            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('discards pre-publish telemetry arriving before command publish ACK', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);
            const client = activeClients[0];

            // Send message BEFORE publish ACK is recorded
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: new Date().toISOString(),
                Outputs: [{ ID: 1, State: 1 }]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('discards delayed telemetry generated before command publish', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            // Device timestamp from 2 seconds before command publish
            const staleTime = new Date(Date.now() - 2000).toISOString();
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: staleTime,
                Outputs: [{ ID: 1, State: 1, Action: 6 }]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('discards telemetry with invalid timestamp string', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: 'invalid-not-a-date',
                Outputs: [{ ID: 1, State: 1, Action: 6 }]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('discards telemetry with missing timestamp field', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            // Pure Outputs array without Time field
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [{ ID: 1, State: 1, Action: 6 }]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('discards telemetry with future timestamp (> 5s in the future)', async () => {
            const promise = dispatchTimedPlayMqtt(baseOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            // Future timestamp: 1 hour in the future
            const futureTime = new Date(Date.now() + 3600000).toISOString();
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: futureTime,
                Outputs: [{ ID: 1, State: 1, Action: 6 }]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(false);
            expect(result.code).toBe('TIMEOUT_NO_TELEMETRY');
        });

        it('succeeds when fresh telemetry with valid device timestamp and Action === 6 arrives post-publish', async () => {
            const promise = dispatchTimedPlayMqtt({ ...baseOptions, timeoutMs: 1000 });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            // Fresh device timestamp (now)
            const nowIso = new Date().toISOString();
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: nowIso,
                Outputs: [
                    { ID: 1, State: 1, Action: 6, Delay: 0 },
                    { ID: 2, State: 0, Action: 6, Delay: 0 },
                    { ID: 3, State: 0, Action: 6, Delay: 0 }
                ]
            }, { retain: false });

            const result = await promise;
            expect(result.success).toBe(true);
            expect(result.observedAt).toBe(nowIso);
            expect(result.rawTelemetry).toBeDefined();
            expect(result.rawTelemetry.find(o => o.ID === 1).Action).toBe(6);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 4. PROBE OUTLET OFF: NO OPTIMISTIC PULSE EXPIRATION & FRESH TELEMETRY
    // ──────────────────────────────────────────────────────────────────────────
    describe('4. probeOutletOffMqtt Safety, Freshness & State Verification', () => {
        const probeOptions = {
            deviceSn: 'TEST-NETIO-SN',
            targetOutletId: 1,
            timeoutMs: 80
        };

        it('returns confirmedOff: false and NO fake timestamp on timeout (NO OPTIMISTIC PULSE EXPIRY)', async () => {
            const result = await probeOutletOffMqtt(probeOptions);
            expect(result.confirmedOff).toBe(false);
            expect(result.state).toBeNull();
            expect(result.observedAt).toBeNull();
            expect(result.reason).toBe('PROBE_TIMEOUT_NO_FRESH_TELEMETRY');
        });

        it('confirms OFF when fresh telemetry with genuine device timestamp reports State === 0 (Action: 6)', async () => {
            const promise = probeOutletOffMqtt({ ...probeOptions, timeoutMs: 1000 });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            const deviceTime = new Date().toISOString();
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: deviceTime,
                Outputs: [
                    { ID: 1, State: 0, Action: 6, Delay: 0 },
                    { ID: 3, State: 1, Action: 6, Delay: 0 }
                ]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(true);
            expect(result.state).toBe(0);
            expect(result.observedAt).toBe(deviceTime);
            expect(result.reason).toBe('CONFIRMED_OFF');
        });

        it('discards delayed OFF message generated before probe started (viivästynyt OFF-viesti)', async () => {
            const promise = probeOutletOffMqtt(probeOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            // Device timestamp from 2 seconds before probe was initiated
            const preProbeTime = new Date(Date.now() - 2000).toISOString();
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: preProbeTime,
                Outputs: [{ ID: 1, State: 0, Action: 6, Delay: 0 }]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.reason).toBe('PROBE_TIMEOUT_NO_FRESH_TELEMETRY');
        });

        it('discards probe telemetry with invalid timestamp string', async () => {
            const promise = probeOutletOffMqtt(probeOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: 'invalid-not-a-date',
                Outputs: [{ ID: 1, State: 0, Action: 6, Delay: 0 }]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.reason).toBe('PROBE_TIMEOUT_NO_FRESH_TELEMETRY');
        });

        it('discards probe telemetry with missing timestamp field', async () => {
            const promise = probeOutletOffMqtt(probeOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            // Telemetry has no timestamp
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Outputs: [{ ID: 1, State: 0, Action: 6, Delay: 0 }]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.reason).toBe('PROBE_TIMEOUT_NO_FRESH_TELEMETRY');
        });

        it('discards probe telemetry with future timestamp (> 5s in future)', async () => {
            const promise = probeOutletOffMqtt(probeOptions);

            await new Promise(r => setTimeout(r, 20));
            const client = activeClients[0];

            // Timestamp 1 hour ahead in the future
            const futureTime = new Date(Date.now() + 3600000).toISOString();
            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: futureTime,
                Outputs: [{ ID: 1, State: 0, Action: 6, Delay: 0 }]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.reason).toBe('PROBE_TIMEOUT_NO_FRESH_TELEMETRY');
        });

        it('returns confirmedOff: false when fresh telemetry reports State === 1 (Action: 6, outlet still active)', async () => {
            const promise = probeOutletOffMqtt({ ...probeOptions, timeoutMs: 1000 });

            await new Promise(r => setTimeout(r, 30));
            const client = activeClients[0];

            client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: new Date().toISOString(),
                Outputs: [
                    { ID: 1, State: 1, Action: 6, Delay: 0 }
                ]
            }, { retain: false });

            const result = await promise;
            expect(result.confirmedOff).toBe(false);
            expect(result.state).toBe(1);
            expect(result.reason).toBe('OUTLET_STILL_ON');
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. REAL RECONCILIATION FUNCTION CALLS & TABLE LOCK VERIFICATION
    // ──────────────────────────────────────────────────────────────────────────
    describe('5. Real Reconciliation Execution & Table Lock Safety', () => {
        const tableId = 'test-reconcile-table';

        beforeEach(() => {
            memoryDb.tableConfigs.set(tableId, {
                table_id: tableId,
                lock_state: 'active',
                switch_type: 'mqtt',
                switch_output_id: 1,
                device_serial: 'TEST-NETIO-SN',
                is_enabled: true,
                pending_maintenance_lock: false
            });
        });

        it('does NOT release table before expires_at + 4000ms safety buffer elapses', async () => {
            const now = Date.now();
            // Session expired 2 seconds ago (buffer requires > 4 seconds)
            memoryDb.sessions.set(tableId, {
                id: 'sess-buffer-test',
                table_id: tableId,
                status: 'active',
                expiresAt: now - 2000
            });

            const table = memoryDb.tableConfigs.get(tableId);
            await reconcileTableState(tableId, table, null, true);

            // Table MUST remain locked in active state
            expect(table.lock_state).toBe('active');
            expect(memoryDb.sessions.has(tableId)).toBe(true);
        });

        it('sets table to error_locked and hardware_uncertain if probe fails after buffer (NO UNVERIFIED RELEASE)', async () => {
            const now = Date.now();
            // Session expired 6 seconds ago (> 4s buffer)
            memoryDb.sessions.set(tableId, {
                id: 'sess-timeout-test',
                table_id: tableId,
                status: 'active',
                expiresAt: now - 6000
            });

            // Mock MQTT client produces no telemetry -> probe will time out
            const table = memoryDb.tableConfigs.get(tableId);
            await reconcileTableState(tableId, table, null, true);

            // Table must be locked in error_locked and session marked hardware_uncertain
            expect(table.lock_state).toBe('error_locked');
            const sess = memoryDb.sessions.get(tableId);
            expect(sess.status).toBe('hardware_uncertain');

            // Fail-closed verification: new checkout hold MUST be rejected with TABLE_LOCKED
            const holdAttempt = await createPaymentHold({
                tableId,
                durationMinutes: 5,
                clientToken: 'tok-customer-failclosed',
                isTestMode: true
            });
            expect(holdAttempt.success).toBe(false);
            expect(holdAttempt.statusCode).toBe(423);
            expect(holdAttempt.code).toBe('TABLE_LOCKED');
        });

        it('releases table to available only after buffer AND fresh State === 0 confirmation', async () => {
            const now = Date.now();
            memoryDb.sessions.set(tableId, {
                id: 'sess-release-test',
                table_id: tableId,
                status: 'active',
                expiresAt: now - 6000
            });

            // Auto-respond to probe with State === 0
            const table = memoryDb.tableConfigs.get(tableId);
            const reconcilePromise = reconcileTableState(tableId, table, null, true);

            await new Promise(r => setTimeout(r, 40));
            const client = activeClients.find(c => c.prefix === 'probe');
            if (client) {
                client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                    Time: new Date().toISOString(),
                    Outputs: [{ ID: 1, State: 0, Action: 6, Delay: 0 }]
                }, { retain: false });
            }

            await reconcilePromise;

            // Table must be safely released to available and session cleared
            expect(table.lock_state).toBe('available');
            expect(memoryDb.sessions.has(tableId)).toBe(false);
        });

        it('transitions to maintenance_locked if pending_maintenance_lock is true upon verified OFF', async () => {
            const now = Date.now();
            const table = memoryDb.tableConfigs.get(tableId);
            table.pending_maintenance_lock = true;

            memoryDb.sessions.set(tableId, {
                id: 'sess-maint-test',
                table_id: tableId,
                status: 'active',
                expiresAt: now - 6000
            });

            const reconcilePromise = reconcileTableState(tableId, table, null, true);

            await new Promise(r => setTimeout(r, 40));
            const client = activeClients.find(c => c.prefix === 'probe');
            if (client) {
                client.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                    Time: new Date().toISOString(),
                    Outputs: [{ ID: 1, State: 0, Action: 6, Delay: 0 }]
                }, { retain: false });
            }

            await reconcilePromise;

            expect(table.lock_state).toBe('maintenance_locked');
            expect(table.pending_maintenance_lock).toBe(false);
        });
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. REAL WEBHOOK IDEMPOTENCY & DUPLICATE PLAY PREVENTION
    // ──────────────────────────────────────────────────────────────────────────
    describe('6. Real Stripe Webhook Idempotency & Hardware Command Protection', () => {
        const tableId = 'test-webhook-table';
        const orderId = 'ord-test-idem-999';

        beforeEach(() => {
            memoryDb.tableConfigs.set(tableId, {
                table_id: tableId,
                lock_state: 'available',
                switch_type: 'mqtt',
                switch_output_id: 1,
                lights_output_id: 3,
                device_serial: 'TEST-NETIO-SN',
                is_enabled: true
            });

            // Set up valid order hold in memory
            memoryDb.orders.set(orderId, {
                orderId,
                tableId,
                durationMinutes: 5,
                durationSeconds: 300,
                amountCents: 500,
                currency: 'eur',
                clientToken: 'tok-idem-123',
                status: 'holding',
                holdExpiresAt: Date.now() + 180000
            });
            memoryDb.holds.set(tableId, orderId);
        });

        it('dispatches hardware play on first webhook, and ignores repeated webhook without double-dispatch', async () => {
            const webhookEvent = {
                httpMethod: 'POST',
                headers: {},
                body: JSON.stringify({
                    type: 'payment_intent.succeeded',
                    data: {
                        object: {
                            id: 'pi_test_idem_123',
                            amount: 500,
                            currency: 'eur',
                            metadata: {
                                order_id: orderId,
                                table_id: tableId
                            }
                        }
                    }
                })
            };

            // Launch 1st Webhook
            const firstCallPromise = webhookHandler(webhookEvent, {});

            // Simulate NETIO activation confirmation
            await new Promise(r => setTimeout(r, 40));
            const dispatchClient = activeClients.find(c => c.prefix === 'dispatch');
            expect(dispatchClient).toBeDefined();

            dispatchClient.simulateMessage('subsoccer/test-TEST-NETIO-SN/status', {
                Time: new Date().toISOString(),
                Outputs: [
                    { ID: 1, State: 1, Action: 6, Delay: 0 },
                    { ID: 3, State: 0, Action: 6, Delay: 0 }
                ]
            }, { retain: false });

            const firstRes = await firstCallPromise;
            expect(firstRes.statusCode).toBe(200);
            const firstBody = JSON.parse(firstRes.body);
            expect(firstBody.activation.success).toBe(true);

            // Record published commands count
            const initialPublishedCommands = dispatchClient.publishedMessages.length;
            expect(initialPublishedCommands).toBe(1);

            // Launch 2nd Webhook (REPEATED WEBHOOK - network retry)
            const secondRes = await webhookHandler(webhookEvent, {});
            expect(secondRes.statusCode).toBe(200);
            const secondBody = JSON.parse(secondRes.body);

            // Idempotent replay recognized
            expect(secondBody.activation.isIdempotentReplay).toBe(true);

            // Hardware commands count MUST NOT increase! (Zero additional commands dispatched)
            expect(dispatchClient.publishedMessages.length).toBe(initialPublishedCommands);
        });

        it('does NOT re-dispatch play if first activation failed with timeout and left table uncertain', async () => {
            const failOrderId = 'ord-test-fail-888';
            memoryDb.orders.set(failOrderId, {
                orderId: failOrderId,
                tableId,
                durationMinutes: 5,
                durationSeconds: 300,
                amountCents: 500,
                currency: 'eur',
                clientToken: 'tok-fail-123',
                status: 'holding',
                holdExpiresAt: Date.now() + 180000
            });
            memoryDb.holds.set(tableId, failOrderId);

            const webhookEvent = {
                httpMethod: 'POST',
                headers: {},
                body: JSON.stringify({
                    type: 'payment_intent.succeeded',
                    data: {
                        object: {
                            id: 'pi_test_fail_123',
                            amount: 500,
                            currency: 'eur',
                            metadata: {
                                order_id: failOrderId,
                                table_id: tableId
                            }
                        }
                    }
                })
            };

            // First webhook: NETIO sends NO telemetry (times out after 80ms)
            process.env.TEST_DISPATCH_TIMEOUT_MS = '80';
            const firstRes = await webhookHandler(webhookEvent, {});
            expect(firstRes.statusCode).toBe(200);
            const firstBody = JSON.parse(firstRes.body);
            expect(firstBody.activation.success).toBe(false);

            const order = memoryDb.orders.get(failOrderId);
            expect(['hardware_uncertain', 'activation_failed']).toContain(order.status);

            // Repeated webhook on failed order does NOT re-dispatch
            const clientCountBefore = activeClients.length;
            const secondRes = await webhookHandler(webhookEvent, {});
            expect(secondRes.statusCode).toBe(200);
            const secondBody = JSON.parse(secondRes.body);
            expect(secondBody.activation.isIdempotentReplay).toBe(true);
        });
    });
});
