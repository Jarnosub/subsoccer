const assert = require('assert');
const { NetioAdapter } = require('../../netlify/functions/utils/netio-adapter.js');

describe('NETIO PowerBOX 3PF Adapter', () => {
    it('initializes in simulation mode when no hardware endpoint is provided', async () => {
        const adapter = new NetioAdapter({ isMock: true });
        assert.strictEqual(adapter.isMock, true);

        const status = await adapter.getStatus();
        assert.strictEqual(status.success, true);
        assert.strictEqual(status.mode, 'simulation');
        assert.strictEqual(status.device.model, 'NETIO PowerBOX 3PF');
        assert.strictEqual(status.outputs.length, 3);
    });

    it('calculates millisecond delay correctly for timed play (Action 3: Short ON)', async () => {
        const adapter = new NetioAdapter({ isMock: true });
        
        // 15 min -> 900,000 ms
        const res15 = await adapter.startTimedPlay(15, 1);
        assert.strictEqual(res15.success, true);
        assert.strictEqual(res15.outletId, 1);
        assert.strictEqual(res15.action, 3);
        assert.strictEqual(res15.delayMs, 900000);
        assert.strictEqual(res15.autoOffSecs, 900);

        // 30 min -> 1,800,000 ms
        const res30 = await adapter.startTimedPlay(30, 1);
        assert.strictEqual(res30.delayMs, 1800000);

        // 60 min -> 3,600,000 ms
        const res60 = await adapter.startTimedPlay(60, 1);
        assert.strictEqual(res60.delayMs, 3600000);
    });

    it('handles moderator outlet switching (Action 1 / Action 0)', async () => {
        const adapter = new NetioAdapter({ isMock: true });

        // Turn on attract lights (Outlet 2)
        const lightsOn = await adapter.setOutletState(2, true);
        assert.strictEqual(lightsOn.outletId, 2);
        assert.strictEqual(lightsOn.state, 1);

        // Turn off screen (Outlet 3)
        const screenOff = await adapter.setOutletState(3, false);
        assert.strictEqual(screenOff.outletId, 3);
        assert.strictEqual(screenOff.state, 0);
    });

    it('executes emergency force stop on table outlet', async () => {
        const adapter = new NetioAdapter({ isMock: true });
        const stop = await adapter.emergencyStop(1);
        assert.strictEqual(stop.outletId, 1);
        assert.strictEqual(stop.state, 0);
    });

    it('checks if an output is active using isOutputActive', async () => {
        const adapter = new NetioAdapter({ isMock: true });
        const isOff = await adapter.isOutputActive(1);
        assert.strictEqual(isOff, false); // mock outlet 1 state is 0 initially

        const isOn = await adapter.isOutputActive(2);
        assert.strictEqual(isOn, true); // mock outlet 2 state is 1
    });

    it('throws error when hardware endpoint responds with invalid JSON or missing Outputs', async () => {
        const adapter = new NetioAdapter({ endpoint: 'http://localhost:9999', isMock: false });
        
        // Mock global fetch to return malformed non-JSON response
        const origFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new Error('Unexpected token < in JSON'); }
        });

        try {
            await assert.rejects(
                async () => adapter.startTimedPlay(15, 1),
                /invalid non-JSON payload/
            );
        } finally {
            global.fetch = origFetch;
        }
    });

    it('throws error when hardware response is missing Outputs array', async () => {
        const adapter = new NetioAdapter({ endpoint: 'http://localhost:9999', isMock: false });
        
        const origFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ Status: 'OK' }) // missing Outputs array!
        });

        try {
            await assert.rejects(
                async () => adapter.startTimedPlay(15, 1),
                /missing required 'Outputs' confirmation array/
            );
        } finally {
            global.fetch = origFetch;
        }
    });

    it('throws error when cutoff command returns state still ON (State !== 0)', async () => {
        const adapter = new NetioAdapter({ endpoint: 'http://localhost:9999', isMock: false });
        
        const origFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                Outputs: [
                    { ID: 1, Action: 0, State: 1 } // Action was 0 (OFF), but State is 1 (still ON!)
                ]
            })
        });

        try {
            await assert.rejects(
                async () => adapter.emergencyStop(1),
                /cutoff command for Outlet 1 failed: device reported State=1/
            );
        } finally {
            global.fetch = origFetch;
        }
    });

    it('throws error when isOutputActive is called for missing outlet ID', async () => {
        const adapter = new NetioAdapter({ endpoint: 'http://localhost:9999', isMock: false });
        
        const origFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                Outputs: [
                    { ID: 1, Name: 'Table 1', State: 1 } // Only outlet 1 exists
                ]
            })
        });

        try {
            // Asking for outlet 99 must throw, not return false!
            await assert.rejects(
                async () => adapter.isOutputActive(99),
                /Outlet 99 not found in NETIO status response/
            );
        } finally {
            global.fetch = origFetch;
        }
    });

    it('throws CUTOFF_REJECTED error when cutoff is attempted during active Short ON in mock mode', async () => {
        const adapter = new NetioAdapter({ isMock: true, mockActiveShortOn: true });
        try {
            await adapter.emergencyStop(1);
            assert.fail('Should have thrown CUTOFF_REJECTED');
        } catch (err) {
            assert.strictEqual(err.code, 'CUTOFF_REJECTED');
            assert.strictEqual(err.status, 400);
            assert.ok(err.message.includes('400 Bad request'));
        }
    });

    it('classifies HTTP 400 cutoff response as CUTOFF_REJECTED in hardware mode', async () => {
        const adapter = new NetioAdapter({ endpoint: 'http://localhost:9999', isMock: false });
        const origFetch = global.fetch;
        global.fetch = async () => ({
            ok: false,
            status: 400,
            statusText: 'Bad request',
            json: async () => ({ error: 'Bad request' })
        });

        try {
            await assert.rejects(
                async () => adapter.emergencyStop(1),
                (err) => err.code === 'CUTOFF_REJECTED' && err.status === 400
            );
        } finally {
            global.fetch = origFetch;
        }
    });

    it('classifies cutoff returning State 1 as CUTOFF_STILL_ON in mock mode', async () => {
        const adapter = new NetioAdapter({ isMock: true, mockCutoffReturnsState1: true });
        try {
            await adapter.emergencyStop(1);
            assert.fail('Should have thrown CUTOFF_STILL_ON');
        } catch (err) {
            assert.strictEqual(err.code, 'CUTOFF_STILL_ON');
            assert.ok(err.message.includes('State=1'));
        }
    });

    it('classifies AbortError as TIMEOUT in hardware mode', async () => {
        const adapter = new NetioAdapter({ endpoint: 'http://localhost:9999', isMock: false, timeoutMs: 50 });
        const origFetch = global.fetch;
        global.fetch = async () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            throw err;
        };

        try {
            await assert.rejects(
                async () => adapter.startTimedPlay(15, 1),
                (err) => err.code === 'TIMEOUT'
            );
        } finally {
            global.fetch = origFetch;
        }
    });

    it('strictly verifies confirmed OFF status with verifyConfirmedOff', async () => {
        const adapter = new NetioAdapter({ isMock: true });
        
        // Initially outlet 1 is 0
        const isOffInitial = await adapter.verifyConfirmedOff(1);
        assert.strictEqual(isOffInitial, true);

        // Turn ON
        await adapter.startTimedPlay(15, 1);
        const isOffAfterStart = await adapter.verifyConfirmedOff(1);
        assert.strictEqual(isOffAfterStart, false);

        // Turn OFF
        await adapter.emergencyStop(1);
        const isOffAfterStop = await adapter.verifyConfirmedOff(1);
        assert.strictEqual(isOffAfterStop, true);
    });

    it('returns false in verifyConfirmedOff if status probe fails', async () => {
        const adapter = new NetioAdapter({ isMock: true, mockStatusFails: true });
        const isOff = await adapter.verifyConfirmedOff(1);
        assert.strictEqual(isOff, false);
    });

    it('strictly confirms OFF only for numerical State === 0 (Codex verification)', async () => {
        const adapter = new NetioAdapter({ endpoint: 'http://localhost:9999', isMock: false });
        const origFetch = global.fetch;

        try {
            // Case 1: missing state (outputs: [{ id: 1 }]) -> false
            global.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => ({ Outputs: [{ ID: 1, Name: 'Table' }] })
            });
            assert.strictEqual(await adapter.verifyConfirmedOff(1), false);

            // Case 2: state: 2 (unknown / transitional) -> false
            global.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => ({ Outputs: [{ ID: 1, Name: 'Table', State: 2 }] })
            });
            assert.strictEqual(await adapter.verifyConfirmedOff(1), false);

            // Case 3: state: null -> false
            global.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => ({ Outputs: [{ ID: 1, Name: 'Table', State: null }] })
            });
            assert.strictEqual(await adapter.verifyConfirmedOff(1), false);

            // Case 4: state: "0" (string instead of number) -> false
            global.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => ({ Outputs: [{ ID: 1, Name: 'Table', State: '0' }] })
            });
            assert.strictEqual(await adapter.verifyConfirmedOff(1), false);

            // Case 5: missing output ID 1 -> false
            global.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => ({ Outputs: [{ ID: 2, Name: 'Screen', State: 0 }] })
            });
            assert.strictEqual(await adapter.verifyConfirmedOff(1), false);

            // Case 6: strictly numerical State === 0 -> true
            global.fetch = async () => ({
                ok: true,
                status: 200,
                json: async () => ({ Outputs: [{ ID: 1, Name: 'Table', State: 0 }] })
            });
            assert.strictEqual(await adapter.verifyConfirmedOff(1), true);
        } finally {
            global.fetch = origFetch;
        }
    });
});

