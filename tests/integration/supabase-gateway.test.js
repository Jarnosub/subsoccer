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

describe.runIf(hasRealTestDb)('Supabase Gateway Queue & Scoped Token Permissions (Live DB)', { timeout: 30000 }, () => {
    let adminClient;
    let anonClient;
    const createdVenueIds = [];
    const createdTableIds = [];
    const createdOrderIds = [];

    const TEST_TOKEN = 'test_gateway_secret_token_12345';
    const TEST_TOKEN_HASH = crypto.createHash('sha256').update(TEST_TOKEN).digest('hex');

    beforeEach(async () => {
        adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
        anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    });

    afterEach(async () => {
        if (!hasRealTestDb) return;
        for (const oid of createdOrderIds) {
            try {
                await adminClient.from('arcade_gateway_commands').delete().eq('order_id', oid);
                await adminClient.from('arcade_orders').delete().eq('order_id', oid);
            } catch (err) {
                console.warn('Cleanup error order:', oid, err.message);
            }
        }
        for (const tid of createdTableIds) {
            try {
                await adminClient.from('arcade_events').delete().eq('table_id', tid);
                await adminClient.from('arcade_table_configs').delete().eq('table_id', tid);
            } catch (err) {
                console.warn('Cleanup error table:', tid, err.message);
            }
        }
        for (const vid of createdVenueIds) {
            try {
                await adminClient.from('arcade_events').delete().eq('venue_id', vid);
                await adminClient.from('arcade_venues').delete().eq('venue_id', vid);
            } catch (err) {
                console.warn('Cleanup error venue:', vid, err.message);
            }
        }
        createdOrderIds.length = 0;
        createdTableIds.length = 0;
        createdVenueIds.length = 0;
    });

    function uniqueId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    async function setupTestVenueAndTable() {
        const venueId = uniqueId('ven');
        const tableId = uniqueId('tbl');

        const { error: vErr } = await adminClient.from('arcade_venues').insert({
            venue_id: venueId,
            name: 'Test Gateway Venue',
            gateway_token_hash: TEST_TOKEN_HASH
        });
        expect(vErr).toBeNull();
        createdVenueIds.push(venueId);

        const { error: tErr } = await adminClient.from('arcade_table_configs').insert({
            table_id: tableId,
            venue_id: venueId,
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 1,
            is_free_play_allowed: true
        });
        expect(tErr).toBeNull();
        createdTableIds.push(tableId);

        return { venueId, tableId };
    }

    it('1. Enforces Least Privilege: anon role CANNOT directly query or mutate tables', async () => {
        const { error: ordersErr } = await anonClient.from('arcade_orders').select('*').limit(1);
        expect(ordersErr).not.toBeNull();
        expect(ordersErr.message).toMatch(/permission denied|row-level security/i);

        const { data: updateData, error: updateErr } = await anonClient
            .from('arcade_table_configs')
            .update({ lock_state: 'available' })
            .eq('table_id', 'nonexistent');
        // Either explicit permission error or 0 rows modified due to RLS
        if (!updateErr) {
            expect(updateData).toBeNull();
        } else {
            expect(updateErr.message).toMatch(/permission denied|row-level security/i);
        }
    });

    it('2. Rejects unauthorized gateway tokens in arcade_gateway_claim_command', async () => {
        const { venueId } = await setupTestVenueAndTable();

        const { data: res } = await anonClient.rpc('arcade_gateway_claim_command', {
            p_venue_id: venueId,
            p_gateway_id: 'gw-test-01',
            p_gateway_token: 'wrong_invalid_token'
        });

        expect(res).toBeDefined();
        expect(res.success).toBe(false);
        expect(res.code).toBe('UNAUTHORIZED');
    });

    it('3. Atomically claims queued commands without double-pickup between parallel gateways', async () => {
        const { venueId, tableId } = await setupTestVenueAndTable();
        const orderId = uniqueId('ord');
        createdOrderIds.push(orderId);

        // Create order
        await adminClient.from('arcade_orders').insert({
            order_id: orderId,
            table_id: tableId,
            status: 'holding',
            amount_cents: 250,
            currency: 'eur',
            duration_minutes: 5,
            hold_expires_at: new Date(Date.now() + 180000).toISOString()
        });

        // Queue command (service_role only)
        const { data: qRes, error: qErr } = await adminClient.rpc('arcade_queue_gateway_command', {
            p_venue_id: venueId,
            p_table_id: tableId,
            p_order_id: orderId,
            p_duration_seconds: 60,
            p_dispatch_deadline_seconds: 15
        });
        expect(qErr).toBeNull();
        expect(qRes.success).toBe(true);

        // Two parallel gateway workers attempt to claim the exact same command
        const [claim1, claim2] = await Promise.all([
            anonClient.rpc('arcade_gateway_claim_command', {
                p_venue_id: venueId,
                p_gateway_id: 'gw-worker-A',
                p_gateway_token: TEST_TOKEN
            }),
            anonClient.rpc('arcade_gateway_claim_command', {
                p_venue_id: venueId,
                p_gateway_id: 'gw-worker-B',
                p_gateway_token: TEST_TOKEN
            })
        ]);

        const winner = claim1.data?.command ? claim1.data : claim2.data;
        const loser = claim1.data?.command ? claim2.data : claim1.data;

        expect(winner.success).toBe(true);
        expect(winner.command).not.toBeNull();
        expect(winner.command.order_id).toBe(orderId);

        expect(loser.success).toBe(true);
        expect(loser.command).toBeNull(); // Exactly one winner, second gets null!
    });

    it('4. Rejects early off-report and preserves pending_maintenance_lock on valid off-report', async () => {
        const { venueId, tableId } = await setupTestVenueAndTable();
        const orderId = uniqueId('ord');
        createdOrderIds.push(orderId);

        await adminClient.from('arcade_orders').insert({
            order_id: orderId,
            table_id: tableId,
            status: 'holding',
            amount_cents: 250,
            duration_minutes: 1,
            hold_expires_at: new Date(Date.now() + 180000).toISOString()
        });

        const { data: qRes } = await adminClient.rpc('arcade_queue_gateway_command', {
            p_venue_id: venueId,
            p_table_id: tableId,
            p_order_id: orderId,
            p_duration_seconds: 60,
            p_dispatch_deadline_seconds: 15
        });
        const commandId = qRes.command_id;

        // Claim
        const { data: claimRes } = await anonClient.rpc('arcade_gateway_claim_command', {
            p_venue_id: venueId,
            p_gateway_id: 'gw-worker-A',
            p_gateway_token: TEST_TOKEN
        });
        expect(claimRes.command).not.toBeNull();

        // Dispatch attempt with immutable deadline (now + 60s)
        const dispatchTime = new Date();
        const expiresTime = new Date(dispatchTime.getTime() + 60000);

        const { data: dispRes } = await anonClient.rpc('arcade_gateway_report_dispatch_attempt', {
            p_venue_id: venueId,
            p_gateway_id: 'gw-worker-A',
            p_gateway_token: TEST_TOKEN,
            p_command_id: commandId,
            p_hardware_dispatched_at: dispatchTime.toISOString(),
            p_game_expires_at: expiresTime.toISOString()
        });
        expect(dispRes.success).toBe(true);

        // Activate
        await anonClient.rpc('arcade_gateway_report_activation_success', {
            p_venue_id: venueId,
            p_gateway_id: 'gw-worker-A',
            p_gateway_token: TEST_TOKEN,
            p_command_id: commandId
        });

        // Set pending maintenance lock on table
        await adminClient.from('arcade_table_configs').update({
            pending_maintenance_lock: true
        }).eq('table_id', tableId);

        // Attempt early OFF report (e.g. at 20 seconds)
        const earlyTime = new Date(dispatchTime.getTime() + 20000);
        const { data: earlyOffRes } = await anonClient.rpc('arcade_gateway_report_off', {
            p_venue_id: venueId,
            p_gateway_id: 'gw-worker-A',
            p_gateway_token: TEST_TOKEN,
            p_command_id: commandId,
            p_off_observed_at: earlyTime.toISOString()
        });
        expect(earlyOffRes.success).toBe(false);
        expect(earlyOffRes.code).toBe('EARLY_OFF_REJECTED');

        // Valid OFF report after 60s
        const validTime = new Date(dispatchTime.getTime() + 61000);
        const { data: validOffRes } = await anonClient.rpc('arcade_gateway_report_off', {
            p_venue_id: venueId,
            p_gateway_id: 'gw-worker-A',
            p_gateway_token: TEST_TOKEN,
            p_command_id: commandId,
            p_off_observed_at: validTime.toISOString()
        });
        expect(validOffRes.success).toBe(true);
        expect(validOffRes.table_lock_state).toBe('maintenance_locked'); // Preserved!
    });
});
