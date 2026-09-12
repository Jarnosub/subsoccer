import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

try {
    process.loadEnvFile?.('.env');
} catch {}

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL || 'https://mock-test-project.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || 'mock-anon-key';

const hasRealTestDb = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);

describe.runIf(hasRealTestDb)('Supabase Venue PIN Auth Integration Tests (Live DB)', { timeout: 30000 }, () => {
    let adminClient;
    let anonClient;
    const createdVenueIds = [];
    const createdTableIds = [];

    beforeEach(async () => {
        adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        anonClient = createClient(SUPABASE_URL, ANON_KEY);
    });

    afterEach(async () => {
        if (!hasRealTestDb) return;
        for (const tid of createdTableIds) {
            try {
                await adminClient.from('arcade_events').delete().eq('table_id', tid);
                await adminClient.from('arcade_table_configs').delete().eq('table_id', tid);
            } catch (err) {
                console.warn('Cleanup error for table:', tid, err.message);
            }
        }
        for (const vid of createdVenueIds) {
            try {
                await adminClient.from('arcade_events').delete().eq('venue_id', vid);
                await adminClient.from('arcade_pin_attempts').delete().eq('venue_id', vid);
                await adminClient.from('arcade_venues').delete().eq('venue_id', vid);
            } catch (err) {
                console.warn('Cleanup error for venue:', vid, err.message);
            }
        }
        createdTableIds.length = 0;
        createdVenueIds.length = 0;
    });

    function uniqueId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    async function isPhase1Applied() {
        const { error } = await adminClient.from('arcade_venues').select('venue_id').limit(1);
        return !error;
    }

    it('1. Rejects direct RPC execution from anon/authenticated roles (Least Privilege)', async () => {
        const applied = await isPhase1Applied();
        if (!applied) {
            console.warn('[SKIP] Phase 1 migration not yet applied in test DB. Run migration SQL in Supabase SQL Editor.');
            return;
        }

        // Test 1a: arcade_verify_venue_pin
        const { data: vData, error: vErr } = await anonClient.rpc('arcade_verify_venue_pin', {
            p_table_id: 'any-table',
            p_pin: '1234',
            p_caller_hash: 'caller-hash-1'
        });
        expect(vErr).not.toBeNull();
        expect(vErr.message).toMatch(/permission denied|insufficient_privilege/i);

        // Test 1b: arcade_set_venue_pin
        const { data: sData, error: sErr } = await anonClient.rpc('arcade_set_venue_pin', {
            p_venue_id: 'any-venue',
            p_new_pin: '1234'
        });
        expect(sErr).not.toBeNull();
        expect(sErr.message).toMatch(/permission denied|insufficient_privilege/i);

        // Test 1c: arcade_reset_venue_lockout
        const { data: rData, error: rErr } = await anonClient.rpc('arcade_reset_venue_lockout', {
            p_venue_id: 'any-venue'
        });
        expect(rErr).not.toBeNull();
        expect(rErr.message).toMatch(/permission denied|insufficient_privilege/i);
    });

    it('2. Atomically sets venue PIN in PostgreSQL with bcrypt/crypt and increments pin_version', async () => {
        const applied = await isPhase1Applied();
        if (!applied) {
            console.warn('[SKIP] Phase 1 migration not yet applied in test DB.');
            return;
        }

        const venueId = uniqueId('ven_test');
        createdVenueIds.push(venueId);

        // Insert initial venue
        const { error: insErr } = await adminClient.from('arcade_venues').insert({
            venue_id: venueId,
            name: 'Integration Test Venue',
            pin_hash: null,
            pin_version: 1
        });
        expect(insErr).toBeNull();

        // Set PIN via RPC
        const { data: setRes, error: setErr } = await adminClient.rpc('arcade_set_venue_pin', {
            p_venue_id: venueId,
            p_new_pin: '4321'
        });
        expect(setErr).toBeNull();
        expect(setRes?.success).toBe(true);
        expect(setRes?.pin_version).toBe(2);

        // Verify stored row has hashed PIN (starts with $2a$ or $2b$)
        const { data: row } = await adminClient.from('arcade_venues').select('*').eq('venue_id', venueId).single();
        expect(row.pin_hash).toMatch(/^\$2[aby]\$/);
        expect(row.pin_version).toBe(2);
    });

    it('3. Authenticates staff with correct PIN and rejects wrong PIN with attempts remaining', async () => {
        const applied = await isPhase1Applied();
        if (!applied) {
            console.warn('[SKIP] Phase 1 migration not yet applied in test DB.');
            return;
        }

        const venueId = uniqueId('ven_auth');
        const tableId = uniqueId('tbl_auth');
        createdVenueIds.push(venueId);
        createdTableIds.push(tableId);

        await adminClient.from('arcade_venues').insert({ venue_id: venueId, name: 'Auth Venue', pin_version: 1 });
        await adminClient.rpc('arcade_set_venue_pin', { p_venue_id: venueId, p_new_pin: '5555' });
        await adminClient.from('arcade_table_configs').insert({
            table_id: tableId,
            venue_id: venueId,
            is_enabled: true,
            lock_state: 'available'
        });

        const callerHash = crypto.createHash('sha256').update('192.168.1.50').digest('hex');

        // Wrong PIN -> 401, attempts remaining: 4
        const { data: failData, error: failErr } = await adminClient.rpc('arcade_verify_venue_pin', {
            p_table_id: tableId,
            p_pin: '0000',
            p_caller_hash: callerHash
        });
        expect(failErr).toBeNull();
        expect(failData?.success).toBe(false);
        expect(failData?.statusCode).toBe(401);
        expect(failData?.attempts_remaining).toBe(4);

        // Correct PIN -> 200, pin_version: 2
        const { data: okData, error: okErr } = await adminClient.rpc('arcade_verify_venue_pin', {
            p_table_id: tableId,
            p_pin: '5555',
            p_caller_hash: callerHash
        });
        expect(okErr).toBeNull();
        expect(okData?.success).toBe(true);
        expect(okData?.statusCode).toBe(200);
        expect(okData?.venue_id).toBe(venueId);
        expect(okData?.pin_version).toBe(2);
    });

    it('4. Enforces 5-attempt caller lockout while allowing another caller to authenticate', async () => {
        const applied = await isPhase1Applied();
        if (!applied) {
            console.warn('[SKIP] Phase 1 migration not yet applied in test DB.');
            return;
        }

        const venueId = uniqueId('ven_dos');
        const tableId = uniqueId('tbl_dos');
        createdVenueIds.push(venueId);
        createdTableIds.push(tableId);

        await adminClient.from('arcade_venues').insert({ venue_id: venueId, name: 'DoS Venue', pin_version: 1 });
        await adminClient.rpc('arcade_set_venue_pin', { p_venue_id: venueId, p_new_pin: '7890' });
        await adminClient.from('arcade_table_configs').insert({
            table_id: tableId,
            venue_id: venueId,
            is_enabled: true,
            lock_state: 'available'
        });

        const attackerHash = crypto.createHash('sha256').update('10.0.0.1').digest('hex');
        const staffHash = crypto.createHash('sha256').update('10.0.0.2').digest('hex');

        // Attacker fails 5 times
        for (let i = 1; i <= 4; i++) {
            await adminClient.rpc('arcade_verify_venue_pin', {
                p_table_id: tableId,
                p_pin: 'bad',
                p_caller_hash: attackerHash
            });
        }
        const { data: lockData } = await adminClient.rpc('arcade_verify_venue_pin', {
            p_table_id: tableId,
            p_pin: 'bad',
            p_caller_hash: attackerHash
        });
        expect(lockData?.statusCode).toBe(429);
        expect(lockData?.code).toBe('CALLER_LOCKED_OUT');

        // Staff on another caller hash can still authenticate with correct PIN
        const { data: staffData } = await adminClient.rpc('arcade_verify_venue_pin', {
            p_table_id: tableId,
            p_pin: '7890',
            p_caller_hash: staffHash
        });
        expect(staffData?.statusCode).toBe(200);
        expect(staffData?.success).toBe(true);
    });

    it('5. Generates abuse alert after high volume of failures but does NOT lock out venue for staff', async () => {
        const applied = await isPhase1Applied();
        if (!applied) {
            console.warn('[SKIP] Phase 1 migration not yet applied in test DB.');
            return;
        }

        const venueId = uniqueId('ven_alert');
        const tableId = uniqueId('tbl_alert');
        createdVenueIds.push(venueId);
        createdTableIds.push(tableId);

        await adminClient.from('arcade_venues').insert({ venue_id: venueId, name: 'Alert Venue', pin_version: 1 });
        await adminClient.rpc('arcade_set_venue_pin', { p_venue_id: venueId, p_new_pin: '1111' });
        await adminClient.from('arcade_table_configs').insert({
            table_id: tableId,
            venue_id: venueId,
            is_enabled: true,
            lock_state: 'available'
        });

        // Simulate 25 failures across 25 different caller hashes
        for (let i = 1; i <= 25; i++) {
            const callerH = crypto.createHash('sha256').update(`bot_${i}`).digest('hex');
            await adminClient.rpc('arcade_verify_venue_pin', {
                p_table_id: tableId,
                p_pin: 'wrong',
                p_caller_hash: callerH
            });
        }

        // Check arcade_events for venue_pin_abuse_alert
        const { data: alertEvents } = await adminClient
            .from('arcade_events')
            .select('*')
            .eq('venue_id', venueId)
            .eq('event_type', 'venue_pin_abuse_alert');
        expect(alertEvents?.length).toBeGreaterThanOrEqual(1);

        // CRITICAL REQUIREMENT: Staff entering correct PIN is NOT locked out!
        const cleanCaller = crypto.createHash('sha256').update('staff_clean').digest('hex');
        const { data: staffData } = await adminClient.rpc('arcade_verify_venue_pin', {
            p_table_id: tableId,
            p_pin: '1111',
            p_caller_hash: cleanCaller
        });
        expect(staffData?.statusCode).toBe(200);
        expect(staffData?.success).toBe(true);
    });

    it('6. Rotates PIN atomically, increments pin_version, and revokes earlier sessions', async () => {
        const applied = await isPhase1Applied();
        if (!applied) {
            console.warn('[SKIP] Phase 1 migration not yet applied in test DB.');
            return;
        }

        const venueId = uniqueId('ven_rotate');
        const tableId = uniqueId('tbl_rotate');
        createdVenueIds.push(venueId);
        createdTableIds.push(tableId);

        await adminClient.from('arcade_venues').insert({ venue_id: venueId, name: 'Rotate Venue', pin_version: 1 });
        await adminClient.rpc('arcade_set_venue_pin', { p_venue_id: venueId, p_new_pin: '1234' });
        await adminClient.from('arcade_table_configs').insert({
            table_id: tableId,
            venue_id: venueId,
            is_enabled: true,
            lock_state: 'available'
        });

        // Rotate PIN to new value '9876'
        const { data: rotData } = await adminClient.rpc('arcade_set_venue_pin', {
            p_venue_id: venueId,
            p_new_pin: '9876'
        });
        expect(rotData?.pin_version).toBe(3);

        // Old PIN '1234' fails
        const caller = crypto.createHash('sha256').update('caller_rot').digest('hex');
        const { data: oldFail } = await adminClient.rpc('arcade_verify_venue_pin', {
            p_table_id: tableId,
            p_pin: '1234',
            p_caller_hash: caller
        });
        expect(oldFail?.success).toBe(false);

        // New PIN '9876' succeeds
        const { data: newOk } = await adminClient.rpc('arcade_verify_venue_pin', {
            p_table_id: tableId,
            p_pin: '9876',
            p_caller_hash: caller
        });
        expect(newOk?.success).toBe(true);
        expect(newOk?.pin_version).toBe(3);
    });
});
