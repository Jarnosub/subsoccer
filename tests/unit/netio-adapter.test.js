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
});
