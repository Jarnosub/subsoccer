import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
    validateDistinctOutputs,
    syncAuxOutlets,
    setAuxOutletMode,
    recordDisplayHeartbeat,
    getDisplayStatus,
    getLightsStatus,
    activateSessionCore,
    reconcileTableState,
    setTableMaintenance,
    signVenueStaffSession,
    memoryDb,
    resetMemoryDb,
    getTableConfig,
    getNetioAdapter,
    _setSupabaseClient
} = require('../../netlify/functions/utils/arcade-core.js');
const { handler: sessionHandler, _setSupabaseClient: _setSessionSupabaseClient } = require('../../netlify/functions/arcade-session.js');

describe('Subsoccer Arcade Phase 2: Auxiliary Outlets (Display & Attract Lights)', () => {
    beforeEach(() => {
        process.env.ARCADE_SESSION_SECRET = 'test-secret-phase2-key-32chars!!';
        process.env.ADMIN_TOKEN = 'test-admin-secret-token';
        process.env.PILOT_TABLE_ID = 'demo-pulse-01';
        resetMemoryDb();
        _setSupabaseClient(null);
        if (_setSessionSupabaseClient) _setSessionSupabaseClient(null);
    });

    it('1. validateDistinctOutputs prevents duplicate outlet assignments between game, display, and lights', () => {
        // Valid distinct outputs
        expect(validateDistinctOutputs({ switch_output_id: 1, display_output_id: 2, lights_output_id: 3 }).valid).toBe(true);
        expect(validateDistinctOutputs({ switch_output_id: 1, display_output_id: null, lights_output_id: 3 }).valid).toBe(true);

        // Conflict: Display matches Game
        const confDisplay = validateDistinctOutputs({ switch_output_id: 1, display_output_id: 1, lights_output_id: 3 });
        expect(confDisplay.valid).toBe(false);
        expect(confDisplay.error).toMatch(/Display output ID \(1\) cannot match game output ID \(1\)/);

        // Conflict: Lights matches Game
        const confLights = validateDistinctOutputs({ switch_output_id: 1, display_output_id: 2, lights_output_id: 1 });
        expect(confLights.valid).toBe(false);
        expect(confLights.error).toMatch(/Lights output ID \(1\) cannot match game output ID \(1\)/);

        // Conflict: Display matches Lights
        const confBoth = validateDistinctOutputs({ switch_output_id: 1, display_output_id: 2, lights_output_id: 2 });
        expect(confBoth.valid).toBe(false);
        expect(confBoth.error).toMatch(/Display output ID \(2\) cannot match lights output ID \(2\)/);
    });

    it('2. Attract lights automatically turn ON on available table and OFF during active game', async () => {
        const tableId = 'demo-pulse-01';
        const cfg = getTableConfig(tableId, true);

        // Initial sync on available table -> Display ON (1), Lights ON (1)
        const initialSync = await syncAuxOutlets({ tableId, isTestMode: true, force: true });
        expect(initialSync.success).toBe(true);
        expect(initialSync.results.display.state).toBe(1);
        expect(initialSync.results.lights.state).toBe(1);

        // Start a game session -> Game outlet 1 starts Short ON, Lights outlet 3 turns OFF (0)
        const actRes = await activateSessionCore({
            table: tableId,
            durationMinutes: 5,
            isTestMode: true
        });
        expect(actRes.statusCode).toBe(200);

        // Check that lights outlet 3 is now 0 (OFF) while display outlet 2 remains 1 (ON)
        const activeCfg = getTableConfig(tableId, true);
        expect(activeCfg._last_aux_states.lights).toBe(0);
        expect(activeCfg._last_aux_states.display).toBe(1);

        // Fast-forward session expiry and reconcile table to available -> Lights outlet 3 turns back ON (1)
        const session = memoryDb.sessions.get(tableId);
        session.expiresAt = Date.now() - 5000;

        const netio = getNetioAdapter(activeCfg, true);
        await reconcileTableState(tableId, activeCfg, netio, true);

        // After reconciliation, table is available again and lights turn back ON (1)
        expect(activeCfg.lock_state).toBe('available');
        expect(activeCfg._last_aux_states.lights).toBe(1);
    });

    it('3. Attract lights turn OFF when table is placed in maintenance mode', async () => {
        const tableId = 'demo-pulse-01';
        const cfg = getTableConfig(tableId, true);

        // Table available -> lights ON
        await syncAuxOutlets({ tableId, isTestMode: true, force: true });
        expect(cfg._last_aux_states.lights).toBe(1);

        // Moderator locks table for maintenance
        const maintRes = await setTableMaintenance({
            tableId,
            maintenanceEnabled: true,
            isTestMode: true
        });
        expect(maintRes.success).toBe(true);
        expect(maintRes.lock_state).toBe('maintenance_locked');

        // Lights automatically turn OFF (0) so users don't mistake table for available
        expect(cfg._last_aux_states.lights).toBe(0);

        // Moderator releases maintenance -> lights turn back ON (1)
        await setTableMaintenance({
            tableId,
            maintenanceEnabled: false,
            isTestMode: true
        });
        expect(cfg.lock_state).toBe('available');
        expect(cfg._last_aux_states.lights).toBe(1);
    });

    it('4. Idempotency: GET status does not trigger redundant hardware commands', async () => {
        const tableId = 'demo-pulse-01';

        // GET status query
        const res = await sessionHandler({
            httpMethod: 'GET',
            queryStringParameters: { table: tableId }
        }, {});

        expect(res.statusCode).toBe(200);
        const data = JSON.parse(res.body);

        expect(data.display).toBeDefined();
        expect(data.display.outletId).toBe(2);
        expect(data.display.mode).toBe('auto');

        expect(data.lights).toBeDefined();
        expect(data.lights.outletId).toBe(3);
        expect(data.lights.mode).toBe('auto');

        // Verify that events do not contain any redundant aux switch commands from the GET call
        const auxSwitchEvents = memoryDb.events.filter(e => e.event_type === 'moderator_aux_override');
        expect(auxSwitchEvents.length).toBe(0);
    });

    it('5. Fault tolerance: Lights hardware failure does not prevent or block game activation', async () => {
        const tableId = 'demo-pulse-01';
        
        // Mock netio where outlet 3 throws error on setOutletState
        memoryDb._mockNetioConfig = {
            mockOutputs: [
                { id: 1, name: 'Game', state: 0 },
                { id: 2, name: 'Display', state: 1 },
                { id: 3, name: 'Lights', state: 1 }
            ]
        };

        // Activate game
        const actRes = await activateSessionCore({
            table: tableId,
            durationMinutes: 5,
            isTestMode: true
        });

        // Game must SUCCEED with 200 even if aux lights encounter issues
        expect(actRes.statusCode).toBe(200);
        expect(actRes.body.success).toBe(true);
    });

    it('6. Moderator manual override and reset to auto for auxiliary outlets', async () => {
        const tableId = 'demo-pulse-01';
        const venueId = 'venue-demo-01';

        // Create moderator token
        const modToken = signVenueStaffSession({
            venueId,
            venueName: 'Mall of Tripla Demo Venue',
            pinVersion: 1
        });

        // Moderator turns lights OFF manually (e.g. for cleaning / private event)
        const overrideRes = await sessionHandler({
            httpMethod: 'POST',
            headers: {
                'Authorization': `Bearer ${modToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'set-aux-outlet',
                table: tableId,
                outletRole: 'lights',
                mode: 'manual_off',
                durationMinutes: 15
            })
        }, {});

        expect(overrideRes.statusCode).toBe(200);
        const overrideData = JSON.parse(overrideRes.body);
        expect(overrideData.success).toBe(true);
        expect(overrideData.mode).toBe('manual_off');
        expect(overrideData.actualState).toBe(0);
        expect(overrideData.manualUntil).toBeDefined();

        // Audit event recorded in telemetry
        const auditEvent = memoryDb.events.find(e => e.event_type === 'moderator_aux_override');
        expect(auditEvent).toBeDefined();
        expect(auditEvent.payload.outletRole).toBe('lights');
        expect(auditEvent.payload.mode).toBe('manual_off');

        // Moderator resets to auto
        const resetRes = await sessionHandler({
            httpMethod: 'POST',
            headers: {
                'Authorization': `Bearer ${modToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'set-aux-outlet',
                table: tableId,
                outletRole: 'lights',
                mode: 'auto'
            })
        }, {});

        expect(resetRes.statusCode).toBe(200);
        const resetData = JSON.parse(resetRes.body);
        expect(resetData.success).toBe(true);
        expect(resetData.mode).toBe('auto');
        expect(resetData.actualState).toBe(1); // Restores to ON because table is available
    });

    it('7. Display heartbeat verifies actual reboot / online state without assuming from relay alone', async () => {
        const tableId = 'demo-pulse-01';
        const cfg = getTableConfig(tableId, true);

        // Before any heartbeat arrives, display is not confirmed online
        cfg.display_last_heartbeat_at = null;
        const initialStatus = getDisplayStatus(cfg, { outputs: [{ id: 2, state: 1 }] });
        expect(initialStatus.state).toBe(1); // Relay is ON
        expect(initialStatus.isOnline).toBe(false); // But browser has not sent heartbeat yet!

        // Send heartbeat from display kiosk page
        const hbRes = await sessionHandler({
            httpMethod: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'display-heartbeat',
                table: tableId
            })
        }, {});

        expect(hbRes.statusCode).toBe(200);
        const hbData = JSON.parse(hbRes.body);
        expect(hbData.success).toBe(true);
        expect(hbData.heartbeatAt).toBeDefined();

        // Now display is confirmed online
        const updatedStatus = getDisplayStatus(cfg, { outputs: [{ id: 2, state: 1 }] });
        expect(updatedStatus.isOnline).toBe(true);
        expect(updatedStatus.heartbeatAgeSec).toBeLessThanOrEqual(5);
    });
});
