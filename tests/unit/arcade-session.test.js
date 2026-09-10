const assert = require('assert');
const { handler } = require('../../netlify/functions/arcade-session.js');

describe('Arcade Session Netlify Function', () => {
    it('handles GET request and returns table status and hardware mode', async () => {
        const event = {
            httpMethod: 'GET',
            queryStringParameters: { table: 'test-table-01' }
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.tableId, 'test-table-01');
        assert.strictEqual(body.state, 'available');
        assert.strictEqual(body.hardware.mode, 'simulation');
        assert.deepStrictEqual(body.packages, [15, 30, 60]);
    });

    it('activates session and commands Netio adapter', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-02',
                durationMinutes: 15,
                clientToken: 'tok-test-123'
            })
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.durationMinutes, 15);
        assert.strictEqual(body.hardware.action, 3);
        assert.strictEqual(body.hardware.delayMs, 900000);
        assert.ok(body.expiresAt);
    });

    it('prevents concurrent activation on active table', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-02', // Already active from previous test
                durationMinutes: 30
            })
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 409);

        const body = JSON.parse(res.body);
        assert.ok(body.error.includes('currently active'));
    });

    it('executes emergency cut', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'emergency-cut',
                table: 'test-table-02'
            })
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.action, 'emergency-cut');
    });

    it('controls moderator outlets (Outlet 2: Lights, Outlet 3: Screen)', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'set-outlet',
                table: 'test-table-01',
                outletId: 2,
                state: true
            })
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.action, 'set-outlet');
        assert.strictEqual(body.outletId, 2);
        assert.strictEqual(body.state, true);
    });
});
