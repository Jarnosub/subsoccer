process.env.ADMIN_TOKEN = 'test-subsoccer-admin-secret-2026';
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { handler, _resetMemoryDb, _memoryDb } = require('../../netlify/functions/arcade-session.js');
const { NetioAdapter } = require('../../netlify/functions/utils/netio-adapter.js');

describe('Arcade Session Netlify Function', () => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    beforeEach(() => {
        if (_resetMemoryDb) _resetMemoryDb();
        delete process.env.PILOT_TABLE_ID;
        delete process.env.ARCADE_ENV;
        delete process.env.ARCADE_FREE_PLAY_APPROVED;
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

    it('returns 404 TABLE_NOT_FOUND on unknown table ID in GET and POST', async () => {
        const getRes = await handler({
            httpMethod: 'GET',
            queryStringParameters: { table: 'unknown-table-xyz' }
        }, {});
        assert.strictEqual(getRes.statusCode, 404);
        const getBody = JSON.parse(getRes.body);
        assert.strictEqual(getBody.code, 'TABLE_NOT_FOUND');

        const postRes = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'unknown-table-xyz',
                durationMinutes: 15
            })
        }, {});
        assert.strictEqual(postRes.statusCode, 404);
        const postBody = JSON.parse(postRes.body);
        assert.strictEqual(postBody.code, 'TABLE_NOT_FOUND');
    });

    it('returns 423 TABLE_LOCKED for disabled or maintenance-locked tables', async () => {
        const res = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'demo-locked-03',
                durationMinutes: 15
            })
        }, {});

        assert.strictEqual(res.statusCode, 423);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.code, 'TABLE_LOCKED');
        assert.strictEqual(body.lockState, 'maintenance_locked');
    });

    it('enforces single pilot table constraint when PILOT_TABLE_ID is configured', async () => {
        process.env.PILOT_TABLE_ID = 'demo-pulse-01';

        // Block non-pilot table
        const blockRes = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'demo-arcade-02',
                durationMinutes: 15
            })
        }, {});
        assert.strictEqual(blockRes.statusCode, 403);
        const blockBody = JSON.parse(blockRes.body);
        assert.strictEqual(blockBody.code, 'TABLE_NOT_IN_PILOT');

        // Allow configured pilot table
        const allowRes = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'demo-pulse-01',
                durationMinutes: 15
            })
        }, {});
        assert.strictEqual(allowRes.statusCode, 200);
        const allowBody = JSON.parse(allowRes.body);
        assert.strictEqual(allowBody.success, true);
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

    it('handles idempotent replay without re-issuing relay command', async () => {
        const clientToken = 'tok-idempotent-repeat-123';

        // 1st call
        const res1 = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-idemp',
                durationMinutes: 15,
                clientToken
            })
        }, {});
        assert.strictEqual(res1.statusCode, 200);
        const body1 = JSON.parse(res1.body);
        assert.strictEqual(body1.success, true);
        assert.ok(!body1.isIdempotentReplay);

        // 2nd call with identical clientToken
        const res2 = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-idemp',
                durationMinutes: 15,
                clientToken
            })
        }, {});
        assert.strictEqual(res2.statusCode, 200);
        const body2 = JSON.parse(res2.body);
        assert.strictEqual(body2.success, true);
        assert.strictEqual(body2.isIdempotentReplay, true);
        assert.strictEqual(body2.sessionId, body1.sessionId);
    });

    it('automatically cleans up expired sessions to allow subsequent bookings', async () => {
        const table = 'test-table-auto-expire';

        // Initial activation
        const res1 = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table,
                durationMinutes: 15
            })
        }, {});
        assert.strictEqual(res1.statusCode, 200);

        // Fast-forward session expiration past the 4s buffer
        const session = _memoryDb.sessions.get(table);
        assert.ok(session);
        session.expiresAt = Date.now() - 5000;

        // Subsequent booking should succeed immediately without 409
        const res2 = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table,
                durationMinutes: 30
            })
        }, {});
        assert.strictEqual(res2.statusCode, 200);
        const body2 = JSON.parse(res2.body);
        assert.strictEqual(body2.success, true);
        assert.strictEqual(body2.durationMinutes, 30);
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

    it('strictly validates boolean state for set-outlet (rejects string "false" or "true")', async () => {
        const resStr = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'set-outlet',
                table: 'test-table-01',
                outletId: 2,
                state: 'false',
                adminToken: ADMIN_TOKEN
            })
        }, {});

        assert.strictEqual(resStr.statusCode, 400);
        const bodyStr = JSON.parse(resStr.body);
        assert.ok(bodyStr.error.includes('boolean'));

        // Proper boolean succeeds
        const resBool = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'set-outlet',
                table: 'test-table-01',
                outletId: 2,
                state: false,
                adminToken: ADMIN_TOKEN
            })
        }, {});
        assert.strictEqual(resBool.statusCode, 200);
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

    it('rolls back session lock and returns 502 when NETIO hardware fails', async () => {
        const { NetioAdapter } = require('../../netlify/functions/utils/netio-adapter.js');
        const origStart = NetioAdapter.prototype.startTimedPlay;

        // Force hardware failure
        NetioAdapter.prototype.startTimedPlay = async () => {
            throw new Error('Hardware connection timeout (EHOSTUNREACH)');
        };

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-fail-rollback',
                    durationMinutes: 15
                })
            }, {});

            assert.strictEqual(res.statusCode, 502);
            const body = JSON.parse(res.body);
            assert.ok(body.error.includes('Failed to activate hardware relay'));

            // Verify rollback: lock is released, next attempt with working hardware succeeds (not 409)
            NetioAdapter.prototype.startTimedPlay = origStart;

            const resRetry = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-fail-rollback',
                    durationMinutes: 15
                })
            }, {});

            assert.strictEqual(resRetry.statusCode, 200);
            const bodyRetry = JSON.parse(resRetry.body);
            assert.strictEqual(bodyRetry.success, true);
        } finally {
            NetioAdapter.prototype.startTimedPlay = origStart;
        }
    });

    it('rejects activation on production table without admin token (returns 403 ACTIVATION_RESTRICTED)', async () => {
        const res = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'subsoccer-tripla-live-01', // Real production table name
                durationMinutes: 15
            }),
            headers: {}
        }, {});

        assert.strictEqual(res.statusCode, 403);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.code, 'ACTIVATION_RESTRICTED');
        assert.ok(body.error.includes('vaatii ylläpidon valtuutuksen'));
    });

    it('ignores client-supplied authSource (cannot bypass activation policy)', async () => {
        const res = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'subsoccer-tripla-live-01',
                durationMinutes: 15,
                authSource: 'stripe' // Client spoof attempt
            }),
            headers: {}
        }, {});

        assert.strictEqual(res.statusCode, 403);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.code, 'ACTIVATION_RESTRICTED');
    });

    it('allows activation on production table when admin token is provided', async () => {
        const res = await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'subsoccer-tripla-live-01',
                durationMinutes: 15,
                adminToken: ADMIN_TOKEN
            }),
            headers: {}
        }, {});

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.success, true);
    });

    it('allows activation on production table when ARCADE_FREE_PLAY_APPROVED is true', async () => {
        process.env.ARCADE_FREE_PLAY_APPROVED = 'true';
        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'subsoccer-freeplay-venue-01',
                    durationMinutes: 30
                }),
                headers: {}
            }, {});

            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.success, true);
        } finally {
            delete process.env.ARCADE_FREE_PLAY_APPROVED;
        }
    });

    it('returns 503 DB_CONFIG_MISSING in production mode if database credentials are missing', async () => {
        process.env.ARCADE_ENV = 'production';
        try {
            const res = await handler({
                httpMethod: 'GET',
                queryStringParameters: { table: 'test-table-01' }
            }, {});

            assert.strictEqual(res.statusCode, 503);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'DB_CONFIG_MISSING');
        } finally {
            delete process.env.ARCADE_ENV;
        }
    });

    it('rolls back session lock and returns 502 when NETIO hardware fails and probe confirms OFF', async () => {
        const origStart = NetioAdapter.prototype.startTimedPlay;
        const origProbe = NetioAdapter.prototype.isOutputActive;

        NetioAdapter.prototype.startTimedPlay = async () => {
            throw new Error('Hardware connection timeout (EHOSTUNREACH)');
        };
        NetioAdapter.prototype.isOutputActive = async () => false;

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-fail-rollback',
                    durationMinutes: 15
                })
            }, {});

            assert.strictEqual(res.statusCode, 502);
            const body = JSON.parse(res.body);
            assert.ok(body.error.includes('Failed to activate hardware relay'));

            // Verify rollback: lock is released, next attempt with working hardware succeeds (not 409)
            NetioAdapter.prototype.startTimedPlay = origStart;
            NetioAdapter.prototype.isOutputActive = origProbe;

            const resRetry = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-fail-rollback',
                    durationMinutes: 15
                })
            }, {});

            assert.strictEqual(resRetry.statusCode, 200);
            const bodyRetry = JSON.parse(resRetry.body);
            assert.strictEqual(bodyRetry.success, true);
        } finally {
            NetioAdapter.prototype.startTimedPlay = origStart;
            NetioAdapter.prototype.isOutputActive = origProbe;
        }
    });

    it('reconciles session to active if command times out but probe confirms relay is ON', async () => {
        const origStart = NetioAdapter.prototype.startTimedPlay;
        const origProbe = NetioAdapter.prototype.isOutputActive;

        // Force timeout on start, but probe confirms relay actually turned ON
        NetioAdapter.prototype.startTimedPlay = async () => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'AbortError';
            throw err;
        };
        NetioAdapter.prototype.isOutputActive = async () => true;

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-reconcile-on',
                    durationMinutes: 15
                })
            }, {});

            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.success, true);
            assert.strictEqual(body.reconciled, true);
            assert.ok(body.expiresAt);
        } finally {
            NetioAdapter.prototype.startTimedPlay = origStart;
            NetioAdapter.prototype.isOutputActive = origProbe;
        }
    });

    it('retains lock and returns 502 HARDWARE_UNCERTAIN if command fails and probe also fails', async () => {
        const origStart = NetioAdapter.prototype.startTimedPlay;
        const origProbe = NetioAdapter.prototype.isOutputActive;

        // Command fails and probe also fails
        NetioAdapter.prototype.startTimedPlay = async () => {
            throw new Error('Socket closed abruptly');
        };
        NetioAdapter.prototype.isOutputActive = async () => {
            throw new Error('Probe unreachable');
        };

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-uncertain',
                    durationMinutes: 15
                })
            }, {});

            assert.strictEqual(res.statusCode, 502);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'HARDWARE_UNCERTAIN');

            // Verify table remains locked to prevent conflicting bookings
            const resFollowup = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-uncertain',
                    durationMinutes: 15
                })
            }, {});

            // Should be rejected because table is locked in uncertain state
            assert.ok(resFollowup.statusCode === 409 || resFollowup.statusCode === 423);
        } finally {
            NetioAdapter.prototype.startTimedPlay = origStart;
            NetioAdapter.prototype.isOutputActive = origProbe;
        }
    });
});
