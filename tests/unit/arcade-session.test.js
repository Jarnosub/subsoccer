process.env.ADMIN_TOKEN = 'test-subsoccer-admin-secret-2026';
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { handler, _resetMemoryDb, _memoryDb, _setSupabaseClient } = require('../../netlify/functions/arcade-session.js');
const { NetioAdapter } = require('../../netlify/functions/utils/netio-adapter.js');

describe('Arcade Session Netlify Function', () => {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

    beforeEach(() => {
        if (_setSupabaseClient) _setSupabaseClient(null);
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
        assert.deepStrictEqual(body.packages, [5, 10, 20]);
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
                durationMinutes: 5
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
                durationMinutes: 45 // Not in [5, 10, 20]
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
                durationMinutes: 5
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
                durationMinutes: 5
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
                durationMinutes: 5
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
                durationMinutes: 5
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
                durationMinutes: 5,
                clientToken: 'tok-test-123'
            })
        };

        const res = await handler(event, {});
        assert.strictEqual(res.statusCode, 200);

        const body = JSON.parse(res.body);
        assert.strictEqual(body.success, true);
        assert.strictEqual(body.durationMinutes, 5);
        assert.strictEqual(body.hardware.action, 3);
        assert.strictEqual(body.hardware.delayMs, 300000);
        assert.ok(body.expiresAt);
    });

    it('prevents concurrent activation on active table (returns 409)', async () => {
        // First activation
        await handler({
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-conflict',
                durationMinutes: 5
            })
        }, {});

        // Second activation immediately
        const event2 = {
            httpMethod: 'POST',
            body: JSON.stringify({
                action: 'activate',
                table: 'test-table-conflict',
                durationMinutes: 10
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
                durationMinutes: 5,
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
                durationMinutes: 5,
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
                durationMinutes: 5
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
                durationMinutes: 10
            })
        }, {});
        assert.strictEqual(res2.statusCode, 200);
        const body2 = JSON.parse(res2.body);
        assert.strictEqual(body2.success, true);
        assert.strictEqual(body2.durationMinutes, 10);
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
                    durationMinutes: 5
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
                    durationMinutes: 5
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
                durationMinutes: 5
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
                durationMinutes: 5,
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
                durationMinutes: 5,
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
                    durationMinutes: 10
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
        process.env.PILOT_TABLE_ID = 'test-table-01';
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
            delete process.env.PILOT_TABLE_ID;
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
                    durationMinutes: 5
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
                    durationMinutes: 5
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

    it('locks table and returns 502 HARDWARE_UNCERTAIN if startTimedPlay fails even when relay reports ON (does not assume lease)', async () => {
        const origStart = NetioAdapter.prototype.startTimedPlay;
        const origProbe = NetioAdapter.prototype.isOutputActive;
        const origVerify = NetioAdapter.prototype.verifyConfirmedOff;

        // Force timeout on start, and probe confirms relay is ON (not confirmed OFF)
        NetioAdapter.prototype.startTimedPlay = async () => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'AbortError';
            throw err;
        };
        NetioAdapter.prototype.isOutputActive = async () => true;
        NetioAdapter.prototype.verifyConfirmedOff = async () => false;

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-reconcile-on',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 502);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'HARDWARE_UNCERTAIN');

            // Table must remain locked because timed watchdog lease was not proven
            const followup = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-reconcile-on',
                    durationMinutes: 5
                })
            }, {});
            assert.ok(followup.statusCode === 409 || followup.statusCode === 423);
        } finally {
            NetioAdapter.prototype.startTimedPlay = origStart;
            NetioAdapter.prototype.isOutputActive = origProbe;
            NetioAdapter.prototype.verifyConfirmedOff = origVerify;
        }
    });

    it('retains lock and returns 502 HARDWARE_UNCERTAIN if command fails and probe also fails', async () => {
        const origStart = NetioAdapter.prototype.startTimedPlay;
        const origProbe = NetioAdapter.prototype.isOutputActive;
        const origVerify = NetioAdapter.prototype.verifyConfirmedOff;

        // Command fails and probe also fails
        NetioAdapter.prototype.startTimedPlay = async () => {
            throw new Error('Socket closed abruptly');
        };
        NetioAdapter.prototype.isOutputActive = async () => {
            throw new Error('Probe unreachable');
        };
        NetioAdapter.prototype.verifyConfirmedOff = async () => false;

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-uncertain',
                    durationMinutes: 5
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
                    durationMinutes: 5
                })
            }, {});

            // Should be rejected because table is locked in uncertain state
            assert.ok(resFollowup.statusCode === 409 || resFollowup.statusCode === 423);
        } finally {
            NetioAdapter.prototype.startTimedPlay = origStart;
            NetioAdapter.prototype.isOutputActive = origProbe;
            NetioAdapter.prototype.verifyConfirmedOff = origVerify;
        }
    });

    it('returns 503 PILOT_CONFIG_MISSING in production mode if PILOT_TABLE_ID is missing', async () => {
        process.env.ARCADE_ENV = 'production';
        delete process.env.PILOT_TABLE_ID;
        try {
            const res = await handler({
                httpMethod: 'GET',
                queryStringParameters: { table: 'subsoccer-tripla-live-01' }
            }, {});

            assert.strictEqual(res.statusCode, 503);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'PILOT_CONFIG_MISSING');
        } finally {
            delete process.env.ARCADE_ENV;
        }
    });

    it('performs emergency cut and returns 500 DB_UPDATE_FAILED if DB activate update fails after relay starts', async () => {
        _memoryDb._simulateDbErrorOnActivate = true;

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-db-fail',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 500);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'DB_UPDATE_FAILED');

            // Emergency cut safely cleaned up session, so retry works
            _memoryDb._simulateDbErrorOnActivate = false;
            const resRetry = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-db-fail',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(resRetry.statusCode, 200);
            const bodyRetry = JSON.parse(resRetry.body);
            assert.strictEqual(bodyRetry.success, true);
        } finally {
            _memoryDb._simulateDbErrorOnActivate = false;
        }
    });

    it('locks table to HARDWARE_UNCERTAIN if DB update fails AND emergency cut also fails', async () => {
        _memoryDb._simulateDbErrorOnActivate = true;
        const origStop = NetioAdapter.prototype.emergencyStop;
        NetioAdapter.prototype.emergencyStop = async () => {
            throw new Error('Emergency stop relay timeout');
        };

        try {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-double-fault',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 502);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'HARDWARE_UNCERTAIN');

            // Table MUST remain locked
            const resFollowup = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-table-double-fault',
                    durationMinutes: 5
                })
            }, {});

            assert.ok(resFollowup.statusCode === 409 || resFollowup.statusCode === 423);
        } finally {
            _memoryDb._simulateDbErrorOnActivate = false;
            NetioAdapter.prototype.emergencyStop = origStop;
        }
    });

    it('resolves table-specific device_endpoint from table configuration', async () => {
        _memoryDb.tableConfigs.set('test-custom-route', {
            table_id: 'test-custom-route',
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 2,
            is_free_play_allowed: true,
            device_endpoint: 'http://192.168.1.188'
        });

        const res = await handler({
            httpMethod: 'GET',
            queryStringParameters: { table: 'test-custom-route' }
        }, {});

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.hardware.endpoint, 'table_endpoint');
        assert.strictEqual(body.outputId, 2);
    });

    describe('NETIO Short ON Emergency Cut & Reconciliation State Machine', () => {
        it('1. locks session to hardware_uncertain and table to error_locked when DB update fails and emergency cut returns 400 CUTOFF_REJECTED', async () => {
            _memoryDb._simulateDbErrorOnActivate = true;
            _memoryDb._mockNetioConfig = { mockActiveShortOn: true };

            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-short-on-400',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 502);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'HARDWARE_UNCERTAIN');
            assert.strictEqual(body.tableLocked, true);
            assert.ok(body.expiresAt, 'ExpiresAt deadline must be preserved');

            // Verify session in memory
            const session = _memoryDb.sessions.get('test-short-on-400');
            assert.ok(session);
            assert.strictEqual(session.status, 'hardware_uncertain');
            assert.ok(session.expiresAt > Date.now());

            // Verify table config lock state
            const cfg = _memoryDb.tableConfigs.get('test-short-on-400');
            assert.strictEqual(cfg.lock_state, 'error_locked');

            // Follow-up booking MUST be rejected (409 or 423)
            const resRetry = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-short-on-400',
                    durationMinutes: 5
                })
            }, {});
            assert.ok(resRetry.statusCode === 409 || resRetry.statusCode === 423);
        });

        it('2. does not accept cutoff as successful when emergency cut returns State 1 (CUTOFF_STILL_ON)', async () => {
            _memoryDb._simulateDbErrorOnActivate = true;
            _memoryDb._mockNetioConfig = { mockCutoffReturnsState1: true };

            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-cutoff-state1',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 502);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'HARDWARE_UNCERTAIN');
            assert.strictEqual(body.tableLocked, true);

            const session = _memoryDb.sessions.get('test-cutoff-state1');
            assert.strictEqual(session.status, 'hardware_uncertain');

            const cfg = _memoryDb.tableConfigs.get('test-cutoff-state1');
            assert.strictEqual(cfg.lock_state, 'error_locked');
        });

        it('3. allows safe failed path (DB_UPDATE_FAILED 500) and releases table when emergency cut confirms State 0', async () => {
            _memoryDb._simulateDbErrorOnActivate = true;
            _memoryDb._mockNetioConfig = { mockActiveShortOn: false, mockCutoffReturnsState1: false };

            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-clean-cut',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 500);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'DB_UPDATE_FAILED');

            // Normal failed path allowed retry
            _memoryDb._simulateDbErrorOnActivate = false;
            const resRetry = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-clean-cut',
                    durationMinutes: 5
                })
            }, {});
            assert.strictEqual(resRetry.statusCode, 200);
        });

        it('4. does not release table before original expires_at time elapses even if background reconciliation runs', async () => {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-deadline-active',
                    durationMinutes: 5
                })
            }, {});
            assert.strictEqual(res.statusCode, 200);

            // Call GET status (runs reconciliation)
            const getRes = await handler({
                httpMethod: 'GET',
                queryStringParameters: { table: 'test-deadline-active' }
            }, {});
            const getBody = JSON.parse(getRes.body);
            assert.strictEqual(getBody.state, 'active');

            // Attempt concurrent activation must fail with 409
            const conflictRes = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-deadline-active',
                    durationMinutes: 10
                })
            }, {});
            assert.strictEqual(conflictRes.statusCode, 409);
        });

        it('5. releases table only after expires_at + margin has passed AND NETIO confirms State 0', async () => {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-reconcile-release',
                    durationMinutes: 5
                })
            }, {});
            assert.strictEqual(res.statusCode, 200);

            const session = _memoryDb.sessions.get('test-reconcile-release');
            assert.ok(session);

            // Fast-forward past expires_at + 4000ms
            session.expiresAt = Date.now() - 5000;

            // NETIO confirms State 0
            _memoryDb._mockNetioConfig = { mockStatusOutputState: 0 };

            // Query GET status -> reconciles and frees table
            const getRes = await handler({
                httpMethod: 'GET',
                queryStringParameters: { table: 'test-reconcile-release' }
            }, {});
            const getBody = JSON.parse(getRes.body);
            assert.strictEqual(getBody.state, 'available');

            // Next activation succeeds
            const nextRes = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-reconcile-release',
                    durationMinutes: 10
                })
            }, {});
            assert.strictEqual(nextRes.statusCode, 200);
        });

        it('6. retains table in error_locked if expires_at has passed but NETIO reports State 1 or probe fails', async () => {
            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-reconcile-stuck-on',
                    durationMinutes: 5
                })
            }, {});
            assert.strictEqual(res.statusCode, 200);

            const session = _memoryDb.sessions.get('test-reconcile-stuck-on');
            assert.ok(session);

            // Fast-forward past expires_at + 4000ms
            session.expiresAt = Date.now() - 5000;

            // But NETIO hardware reports State 1 (stuck relay!)
            _memoryDb._mockNetioConfig = { mockStatusOutputState: 1 };

            // GET status triggers reconciliation
            const getRes = await handler({
                httpMethod: 'GET',
                queryStringParameters: { table: 'test-reconcile-stuck-on' }
            }, {});
            const getBody = JSON.parse(getRes.body);
            assert.strictEqual(getBody.state, 'error_locked');

            // Subsequent activation MUST be rejected
            const nextRes = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-reconcile-stuck-on',
                    durationMinutes: 5
                })
            }, {});
            assert.ok(nextRes.statusCode === 409 || nextRes.statusCode === 423);
        });

        it('7. idempotent replay does not extend hardware deadline (immutable deadline)', async () => {
            const clientToken = 'tok-immutable-deadline-777';

            const res1 = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-idemp-immutable',
                    durationMinutes: 5,
                    clientToken
                })
            }, {});
            assert.strictEqual(res1.statusCode, 200);
            const body1 = JSON.parse(res1.body);
            const initialExpiresAt = body1.expiresAt;

            // Wait 50ms
            await new Promise(r => setTimeout(r, 50));

            // Replay identical token
            const res2 = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-idemp-immutable',
                    durationMinutes: 5,
                    clientToken
                })
            }, {});
            assert.strictEqual(res2.statusCode, 200);
            const body2 = JSON.parse(res2.body);
            assert.strictEqual(body2.isIdempotentReplay, true);
            assert.strictEqual(body2.expiresAt, initialExpiresAt, 'ExpiresAt must be exactly identical to initial dispatch');
        });

        it('8. second activation attempt during active lock returns 409 Conflict', async () => {
            const res1 = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-concurrent-block',
                    durationMinutes: 5,
                    clientToken: 'tok-user-1'
                })
            }, {});
            assert.strictEqual(res1.statusCode, 200);

            const res2 = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-concurrent-block',
                    durationMinutes: 10,
                    clientToken: 'tok-user-2'
                })
            }, {});
            assert.strictEqual(res2.statusCode, 409);
            const body2 = JSON.parse(res2.body);
            assert.strictEqual(body2.code, 'SESSION_CONFLICT');
        });

        it('rejects admin emergency-cut with 409 CUTOFF_REJECTED when cutoff is rejected by hardware', async () => {
            _memoryDb._mockNetioConfig = { mockActiveShortOn: true };

            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'emergency-cut',
                    table: 'test-table-01',
                    adminToken: ADMIN_TOKEN
                })
            }, {});

            assert.strictEqual(res.statusCode, 409);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'CUTOFF_REJECTED');
            assert.strictEqual(body.error, 'Katkaisukäsky hylättiin. Virran katkeamista ei ole vahvistettu.');
        });
    });

    describe('Supabase Atomic Hardware Dispatch Guard & Race Conditions', () => {
        let origNetioStart;
        let startTimedPlayCalled = false;

        beforeEach(() => {
            startTimedPlayCalled = false;
            origNetioStart = NetioAdapter.prototype.startTimedPlay;
            NetioAdapter.prototype.startTimedPlay = async function (...args) {
                startTimedPlayCalled = true;
                return { success: true, action: 3, delayMs: 300000 };
            };
        });

        afterEach(() => {
            NetioAdapter.prototype.startTimedPlay = origNetioStart;
            if (_setSupabaseClient) _setSupabaseClient(null);
        });

        function createMockSupabaseClient({
            tableConfig = { table_id: 'test-supabase-table', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true },
            existingSessions = [],
            insertSessionResult = { data: { id: 'sess-mock-001', table_id: 'test-supabase-table', status: 'requested', expires_at: new Date(Date.now() + 300000).toISOString() }, error: null },
            dispatchUpdateResult = { data: [{ id: 'sess-mock-001' }], error: null },
            activeUpdateResult = { data: [{ id: 'sess-mock-001', status: 'active' }], error: null }
        } = {}) {
            const events = [];
            const sessionUpdates = [];

            const client = {
                events,
                sessionUpdates,
                from(table) {
                    if (table === 'arcade_table_configs') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: tableConfig, error: null })
                                })
                            }),
                            update: (vals) => ({
                                eq: () => Promise.resolve({ data: [vals], error: null })
                            })
                        };
                    }
                    if (table === 'arcade_events') {
                        return {
                            insert: async (ev) => {
                                events.push(ev);
                                return { data: null, error: null };
                            }
                        };
                    }
                    if (table === 'arcade_sessions') {
                        return {
                            select: () => {
                                const selChain = {
                                    eq: () => selChain,
                                    in: () => selChain,
                                    order: () => selChain,
                                    maybeSingle: async () => ({ data: null, error: null }),
                                    single: async () => ({ data: null, error: null }),
                                    then: (resolve) => Promise.resolve({ data: existingSessions, error: null }).then(resolve)
                                };
                                return selChain;
                            },
                            insert: () => ({
                                select: () => ({
                                    single: async () => insertSessionResult
                                })
                            }),
                            update: (patch) => {
                                sessionUpdates.push(patch);
                                const chain = {
                                    eq: () => chain,
                                    in: () => chain,
                                    is: () => chain,
                                    lt: () => chain,
                                    select: (cols) => {
                                        if (patch.hardware_dispatched_at !== undefined) {
                                            return Promise.resolve(dispatchUpdateResult);
                                        }
                                        return Promise.resolve({ data: [patch], error: null });
                                    },
                                    then: (resolve) => {
                                        return Promise.resolve(activeUpdateResult).then(resolve);
                                    },
                                    catch: (reject) => {
                                        return Promise.resolve(activeUpdateResult).catch(reject);
                                    }
                                };
                                return chain;
                            }
                        };
                    }
                    throw new Error(`Unexpected table: ${table}`);
                }
            };
            return client;
        }

        it('aborts hardware execution and returns 500 DISPATCH_RECORDING_FAILED when Supabase dispatch update fails with error', async () => {
            const mockSupabase = createMockSupabaseClient({
                dispatchUpdateResult: {
                    data: null,
                    error: { message: 'Database connection timeout on update', code: 'P0001' }
                }
            });
            _setSupabaseClient(mockSupabase);

            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-supabase-table',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 500);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'DISPATCH_RECORDING_FAILED');
            assert.strictEqual(startTimedPlayCalled, false, 'NETIO startTimedPlay must NOT be called if dispatch record fails');

            // Audit switch_error must be logged
            const switchErrorEvent = mockSupabase.events.find(e => e.event_type === 'switch_error');
            assert.ok(switchErrorEvent, 'Must record switch_error audit event');
            assert.strictEqual(switchErrorEvent.payload.phase, 'pre_dispatch_guard');
        });

        it('aborts hardware execution and returns 500 DISPATCH_RECORDING_FAILED when Supabase dispatch update targets 0 rows', async () => {
            const mockSupabase = createMockSupabaseClient({
                dispatchUpdateResult: {
                    data: [], // 0 rows updated because session was cancelled/modified
                    error: null
                }
            });
            _setSupabaseClient(mockSupabase);

            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-supabase-table',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 500);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.code, 'DISPATCH_RECORDING_FAILED');
            assert.strictEqual(startTimedPlayCalled, false, 'NETIO startTimedPlay must NOT be called if 0 rows were updated');

            const switchErrorEvent = mockSupabase.events.find(e => e.event_type === 'switch_error');
            assert.ok(switchErrorEvent, 'Must record switch_error audit event for 0 rows updated');
        });

        it('executes hardware command only after successful atomic dispatch update (1 row)', async () => {
            const mockSupabase = createMockSupabaseClient({
                dispatchUpdateResult: {
                    data: [{ id: 'sess-mock-001' }],
                    error: null
                }
            });
            _setSupabaseClient(mockSupabase);

            const res = await handler({
                httpMethod: 'POST',
                body: JSON.stringify({
                    action: 'activate',
                    table: 'test-supabase-table',
                    durationMinutes: 5
                })
            }, {});

            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(res.body);
            assert.strictEqual(body.success, true);
            assert.strictEqual(startTimedPlayCalled, true, 'NETIO startTimedPlay must be called after 1 row dispatch confirmation');

            // Audit events in correct sequence: session_requested -> switch_cmd_sent -> switch_confirmed_on
            const eventTypes = mockSupabase.events.map(e => e.event_type);
            assert.ok(eventTypes.includes('session_requested'));
            assert.ok(eventTypes.includes('switch_cmd_sent'));
            assert.ok(eventTypes.includes('switch_confirmed_on'));
        });

        it('handles admin emergency-cut with mock Supabase on CUTOFF_REJECTED', async () => {
            const mockSupabase = createMockSupabaseClient();
            _setSupabaseClient(mockSupabase);

            const origStop = NetioAdapter.prototype.emergencyStop;
            NetioAdapter.prototype.emergencyStop = async () => {
                const err = new Error('NETIO cutoff rejected with HTTP 400 Bad request on Outlet 1');
                err.code = 'CUTOFF_REJECTED';
                err.status = 400;
                throw err;
            };

            try {
                const res = await handler({
                    httpMethod: 'POST',
                    body: JSON.stringify({
                        action: 'emergency-cut',
                        table: 'test-supabase-table',
                        adminToken: ADMIN_TOKEN
                    })
                }, {});

                assert.strictEqual(res.statusCode, 409);
                const body = JSON.parse(res.body);
                assert.strictEqual(body.code, 'CUTOFF_REJECTED');
                assert.strictEqual(body.error, 'Katkaisukäsky hylättiin. Virran katkeamista ei ole vahvistettu.');

                // Session must NOT be updated to force_stopped
                const forceStoppedUpdate = mockSupabase.sessionUpdates.find(u => u.status === 'force_stopped');
                assert.strictEqual(forceStoppedUpdate, undefined, 'Session must remain protected/locked when cutoff is rejected');
            } finally {
                NetioAdapter.prototype.emergencyStop = origStop;
            }
        });
    });

    describe('30-second local test mode', () => {
        beforeEach(() => {
            _resetMemoryDb();
        });

        it('allows 30-second test activation in test mode and commands NETIO with Action: 3, Delay: 30000', async () => {
            let capturedDelayMs = null;
            let capturedAction = null;
            const origStart = NetioAdapter.prototype.startTimedPlay;
            NetioAdapter.prototype.startTimedPlay = async function (durationMinutes, outletId, durationSeconds) {
                const res = await origStart.call(this, durationMinutes, outletId, durationSeconds);
                capturedDelayMs = res.delayMs;
                capturedAction = res.action;
                return res;
            };

            try {
                const beforeMs = Date.now();
                const res = await handler({
                    httpMethod: 'POST',
                    body: JSON.stringify({
                        action: 'activate',
                        table: 'demo-pulse-01',
                        durationSeconds: 30
                    })
                }, {});

                assert.strictEqual(res.statusCode, 200);
                const body = JSON.parse(res.body);
                assert.strictEqual(body.success, true);
                assert.strictEqual(body.durationSeconds, 30);
                assert.strictEqual(body.durationMinutes, 0.5);
                assert.strictEqual(capturedDelayMs, 30000, 'NETIO delay must be exactly 30000 ms');
                assert.strictEqual(capturedAction, 3, 'NETIO action must be 3 (Short ON)');

                const expiresAtMs = new Date(body.expiresAt).getTime();
                const diffSecs = (expiresAtMs - beforeMs) / 1000;
                assert.ok(diffSecs >= 29 && diffSecs <= 32, `expiresAt must be ~30s, got ${diffSecs}s`);
            } finally {
                NetioAdapter.prototype.startTimedPlay = origStart;
            }
        });

        it('strictly rejects 30-second test activation in production mode with 403 TEST_MODE_REQUIRED', async () => {
            const origEnv = process.env.ARCADE_ENV;
            const origNodeEnv = process.env.NODE_ENV;
            const origPilot = process.env.PILOT_TABLE_ID;
            const mockSupabase = {
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { table_id: 'demo-pulse-01', is_enabled: true, lock_state: 'available', switch_output_id: 1, is_free_play_allowed: true }
                            })
                        })
                    })
                })
            };
            _setSupabaseClient(mockSupabase);

            try {
                process.env.ARCADE_ENV = 'production';
                delete process.env.NODE_ENV;
                process.env.PILOT_TABLE_ID = 'demo-pulse-01';

                const res = await handler({
                    httpMethod: 'POST',
                    body: JSON.stringify({
                        action: 'activate',
                        table: 'demo-pulse-01',
                        durationSeconds: 30
                    })
                }, {});

                assert.strictEqual(res.statusCode, 403);
                const body = JSON.parse(res.body);
                assert.strictEqual(body.code, 'TEST_MODE_REQUIRED');
                assert.ok(body.error.includes('production mode'));
            } finally {
                process.env.ARCADE_ENV = origEnv;
                if (origNodeEnv) process.env.NODE_ENV = origNodeEnv;
                if (origPilot) process.env.PILOT_TABLE_ID = origPilot; else delete process.env.PILOT_TABLE_ID;
                _setSupabaseClient(null);
            }
        });

        it('does not alter commercial packages [5, 10, 20] in GET /arcade-session', async () => {
            const res = await handler({
                httpMethod: 'GET',
                queryStringParameters: { table: 'demo-pulse-01' }
            }, {});

            assert.strictEqual(res.statusCode, 200);
            const body = JSON.parse(res.body);
            assert.deepStrictEqual(body.packages, [5, 10, 20], 'Commercial packages must stay strictly [5, 10, 20]');
            assert.strictEqual(body.isTestMode, true);
            assert.strictEqual(body.allow30sTest, true);
        });
    });
});

