const assert = require('assert');
const { handler, _resetMemoryDb } = require('../../netlify/functions/arcade-session.js');

describe('Arcade Session Netlify Function', () => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ARCADE_ADMIN_KEY || 'subsoccer-arcade-admin-2026';

    beforeEach(() => {
        if (_resetMemoryDb) _resetMemoryDb();
    });

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

    it('returns 400 if GET table parameter is missing', async () => {
        const event = {
            httpMethod: 'GET',
            queryStringParameters: {}
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 400);
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes("'table'"));
    });

    it('returns 400 if POST table parameter is missing', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                durationMinutes: 15
            })
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 400);
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes("'table'"));
    });

    it('returns 400 if durationMinutes is invalid (e.g. 45 or 0)', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-val',
                durationMinutes: 45 // Not in [15, 30, 60]
            })
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 400);
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes("'durationMinutes'"));
    });

    it('activates session and commands Netio adapter for valid duration', async () => {
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

    it('prevents concurrent activation on active table (returns 409)', async () => {
        // First activation
        await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-conflict',
                durationMinutes: 15
            })
        }, {});

        // Second activation immediately
        const event2 = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-conflict',
                durationMinutes: 30
            })
        };

        const res = await handler(event2, {});
        assert.strictEqual(res.statusCode, 409);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.code, 'SESSION_CONFLICT');
        assert.ok(body.error.includes('currently active'));
    });

    it('rejects emergency-cut without admin authorization (returns 401)', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'emergency-cut',
                table: 'test-table-02'
            }),
            headers: {}
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 401);
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes('Unauthorized'));
    });

    it('executes emergency cut when valid admin token is provided', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'emergency-cut',
                table: 'test-table-02',
                adminToken: ADMIN_TOKEN
            }),
            headers: {}
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.action, 'emergency-cut');
    });

    it('rejects set-outlet without admin authorization (returns 401)', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'set-outlet',
                table: 'test-table-01',
                outletId: 2,
                state: true
            }),
            headers: {}
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 401);
    });

    it('returns 400 if outletId is invalid (e.g. 5)', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'set-outlet',
                table: 'test-table-01',
                outletId: 5,
                state: true,
                adminToken: ADMIN_TOKEN
            }),
            headers: {}
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 400);
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes("'outletId'"));
    });

    it('controls moderator outlets when authorized (Outlet 2: Lights)', async () => {
        const event = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'set-outlet',
                table: 'test-table-01',
                outletId: 2,
                state: true
            }),
            headers: {
                'x-admin-token': ADMIN_TOKEN
            }
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.action, 'set-outlet');
        assert.strictEqual(body.outletId, 2);
        assert.strictEqual(body.state, true);
    });
});
