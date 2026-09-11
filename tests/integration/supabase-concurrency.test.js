import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL || 'https://mock-test-project.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || 'mock-anon-key';

const hasRealTestDb = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);

describe.runIf(hasRealTestDb)('Supabase Atomic RPC & Concurrency Integration Tests', () => {
    let adminClient;
    let anonClient;
    const createdTableIds = [];

    beforeEach(async () => {
        adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        anonClient = createClient(SUPABASE_URL, ANON_KEY);
    });

    afterEach(async () => {
        if (!hasRealTestDb || createdTableIds.length === 0) return;
        // Clean up test data in correct dependency order
        for (const tid of createdTableIds) {
            await adminClient.from('arcade_events').delete().eq('table_id', tid);
            await adminClient.from('arcade_orders').delete().eq('table_id', tid);
            await adminClient.from('arcade_sessions').delete().eq('table_id', tid);
            await adminClient.from('arcade_table_configs').delete().eq('table_id', tid);
        }
        createdTableIds.length = 0;
    });

    async function createIsolatedTable(prefix = 'tbl') {
        const tableId = `test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const { error } = await adminClient.from('arcade_table_configs').insert({
            table_id: tableId,
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 1,
            is_free_play_allowed: false
        });
        if (error) throw new Error(`Table setup failed for ${tableId}: ${error.message}`);
        createdTableIds.push(tableId);
        return tableId;
    }

    it('1. Rejects unauthorized RPC calls from public / anon key (Security Definer RLS)', async () => {
        const tableId = await createIsolatedTable('rls');
        const { data, error } = await anonClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'test-hash-unauthorized'
        });

        expect(error).not.toBeNull();
        expect(error.message.toLowerCase()).toMatch(/permission denied|not found/);
    });

    it('2. Rejects calls with NULL or empty parameters with 400 INVALID_PARAMETERS', async () => {
        const { data } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: '',
            p_order_id: null,
            p_payment_intent_id: '',
            p_amount_cents: -5,
            p_currency: '',
            p_worker_id: null
        });

        expect(data).toMatchObject({
            success: false,
            code: 'INVALID_PARAMETERS',
            statusCode: 400,
            refund_required: true
        });
    });

    it('3. Rejects payment with PAYMENT_INTENT_MISMATCH, AMOUNT_MISMATCH, and TABLE_MISMATCH without mutating legitimate order', async () => {
        const tableA = await createIsolatedTable('mismatch-a');
        const tableB = await createIsolatedTable('mismatch-b');

        // Create hold on table A
        const { data: hold, error: holdErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableA,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'test-token-hash-1'
        });
        expect(holdErr).toBeNull();
        expect(hold.success).toBe(true);
        const orderId = hold.order_id;

        // Bind PaymentIntent
        const { data: bind, error: bindErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableA,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_correct_123'
        });
        expect(bindErr).toBeNull();
        expect(bind.success).toBe(true);

        // A. Wrong Amount (Order must NOT be cancelled!)
        const { data: wrongAmount } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableA,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_correct_123',
            p_amount_cents: 9999,
            p_currency: 'eur',
            p_worker_id: 'worker-1'
        });
        expect(wrongAmount.success).toBe(false);
        expect(wrongAmount.code).toBe('AMOUNT_MISMATCH');
        expect(wrongAmount.refund_required).toBe(true);

        // B. Wrong Table (tableB instead of tableA - both exist)
        const { data: wrongTable } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableB,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_correct_123',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-1'
        });
        expect(wrongTable.success).toBe(false);
        expect(wrongTable.code).toBe('TABLE_MISMATCH');
        expect(wrongTable.refund_required).toBe(true);

        // C. Wrong PaymentIntent
        const { data: wrongPI } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableA,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_WRONG_999',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-1'
        });
        expect(wrongPI.success).toBe(false);
        expect(wrongPI.code).toBe('PAYMENT_INTENT_MISMATCH');
        expect(wrongPI.refund_required).toBe(true);

        // Varmistetaan, että oikea tilaus on edelleen holding-tilassa eikä sitä korruptoitu
        const { data: checkOrder } = await adminClient
            .from('arcade_orders')
            .select('status')
            .eq('order_id', orderId)
            .single();
        expect(checkOrder.status).toBe('holding');
    });

    it('4. Rejects NULL OFF value in arcade_release_reconciled_table (IF p_confirmed_off IS NOT TRUE)', async () => {
        const tableId = await createIsolatedTable('null-off');

        const { data: releaseNull } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: 'ord-dummy-123',
            p_session_id: '00000000-0000-0000-0000-000000000000',
            p_confirmed_off: null // NULL must NOT bypass OFF check!
        });

        expect(releaseNull.success).toBe(false);
        expect(releaseNull.code).toBe('TABLE_NOT_FOUND');
    });

    it('5. Rejects contradictory parameters in arcade_finalize_activation', async () => {
        const tableId = await createIsolatedTable('contradictory');

        const { data } = await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: 'ord-dummy',
            p_session_id: '00000000-0000-0000-0000-000000000000',
            p_worker_id: 'worker-1',
            p_success: true,
            p_hardware_uncertain: true // Contradictory: cannot be both success AND uncertain!
        });

        expect(data.success).toBe(false);
        expect(data.code).toBe('CONTRADICTORY_PARAMETERS');
        expect(data.statusCode).toBe(400);
    });

    it('6. Stale release replay during a NEW active game does NOT release or change the new game table lock', async () => {
        const tableId = await createIsolatedTable('stale-release');

        // Customer 1: Hold, claim, dispatch, finalize
        const { data: hold1 } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 1, // 1 s for test speed
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'cust-1-hash',
            p_hold_seconds: 30
        });
        const orderId1 = hold1.order_id;

        await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_payment_intent_id: 'pi_cust_1'
        });

        await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_payment_intent_id: 'pi_cust_1',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-c1'
        });

        const { data: guard1 } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_worker_id: 'worker-c1',
            p_client_session_token: 'tok-c1'
        });
        const sessionId1 = guard1.session_id;

        await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_session_id: sessionId1,
            p_worker_id: 'worker-c1',
            p_success: true,
            p_hardware_uncertain: false
        });

        // Wait 2 s for playtime to expire
        await new Promise(r => setTimeout(r, 2000));

        // Release Customer 1 safely
        const { data: rel1 } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_session_id: sessionId1,
            p_confirmed_off: true
        });
        expect(rel1.success).toBe(true);
        expect(rel1.lock_state).toBe('available');

        // Customer 2 starts a NEW game on the same table
        const { data: hold2 } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 15,
            p_duration_seconds: 900,
            p_amount_cents: 500,
            p_currency: 'eur',
            p_client_token_hash: 'cust-2-hash'
        });
        expect(hold2.success).toBe(true);

        // STALE CALL: Old release request for Customer 1 is replayed
        const { data: staleReplay } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_session_id: sessionId1,
            p_confirmed_off: true
        });

        expect(staleReplay.success).toBe(true);
        expect(staleReplay.already_resolved).toBe(true);

        // CRITICAL CHECK: Table lock must STILL belong to Customer 2 (pending_payment), NOT reset to available!
        const { data: tableCheck } = await adminClient
            .from('arcade_table_configs')
            .select('lock_state')
            .eq('table_id', tableId)
            .single();

        expect(tableCheck.lock_state).toBe('pending_payment');
    });

    it('7. Uncertain session safely releases after deadline + confirmed OFF and frees table for new hold', async () => {
        const tableId = await createIsolatedTable('uncertain-release');

        // Setup order & dispatch
        const { data: hold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 1, // 1 s deadline
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'cust-unc-hash'
        });
        const orderId = hold.order_id;

        await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_unc_1'
        });

        await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_unc_1',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-unc'
        });

        const { data: guard } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_worker_id: 'worker-unc',
            p_client_session_token: 'tok-unc'
        });
        const sessionId = guard.session_id;

        // Finalize as HARDWARE_UNCERTAIN (relay failed/uncertain)
        await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_worker_id: 'worker-unc',
            p_success: false,
            p_hardware_uncertain: true,
            p_error_reason: 'Emergency cut unconfirmed'
        });

        // Table is now error_locked
        const { data: lockedCheck } = await adminClient
            .from('arcade_table_configs')
            .select('lock_state')
            .eq('table_id', tableId)
            .single();
        expect(lockedCheck.lock_state).toBe('error_locked');

        // Wait 2 s for 1 s deadline + margin to elapse
        await new Promise(r => setTimeout(r, 2000));

        // Reconcile and safely release with confirmed OFF
        const { data: release } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: true
        });
        expect(release.success).toBe(true);
        expect(release.lock_state).toBe('available');

        // Order status must be resolved_uncertain with refund_status = refund_required preserved
        const { data: orderRow } = await adminClient
            .from('arcade_orders')
            .select('status, refund_status')
            .eq('order_id', orderId)
            .single();
        expect(orderRow.status).toBe('resolved_uncertain');
        expect(orderRow.refund_status).toBe('refund_required');

        // A NEW hold can now be successfully created on this table!
        const { data: newHold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'new-player-hash'
        });
        expect(newHold.success).toBe(true);
    });

    it('8. Webhook retry after refund_completed does not revert refund_status backwards', async () => {
        const tableId = await createIsolatedTable('no-refund-revert');

        const { data: hold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'hash-ref-rev',
            p_hold_seconds: 1
        });
        const orderId = hold.order_id;

        // Wait for expiry
        await new Promise(r => setTimeout(r, 1200));

        // Manually simulate that admin has already processed and completed the refund
        await adminClient
            .from('arcade_orders')
            .update({ status: 'hold_expired', refund_status: 'refund_completed' })
            .eq('order_id', orderId);

        // Webhook retry arrives
        await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_ref_rev_123',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-ref'
        });

        // Refund status must STILL be refund_completed, NOT reverted to refund_required!
        const { data: orderCheck } = await adminClient
            .from('arcade_orders')
            .select('refund_status')
            .eq('order_id', orderId)
            .single();

        expect(orderCheck.refund_status).toBe('refund_completed');
    });

    it('9. Concurrency: 5 parallel webhooks on same order yield exactly one processing winner and 4 replays', async () => {
        const tableId = await createIsolatedTable('webhook-race');

        const { data: hold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'race-hash'
        });
        const orderId = hold.order_id;

        await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_race_123'
        });

        // Fire 5 concurrent claim requests simultaneously
        const claims = await Promise.all(
            Array.from({ length: 5 }, (_, i) => {
                return adminClient.rpc('arcade_claim_order_for_activation', {
                    p_table_id: tableId,
                    p_order_id: orderId,
                    p_payment_intent_id: 'pi_race_123',
                    p_amount_cents: 250,
                    p_currency: 'eur',
                    p_worker_id: `worker-thread-${i}`
                });
            })
        );

        const freshClaims = claims.filter(c => c.data?.success && c.data?.is_idempotent_replay === false);
        const replayClaims = claims.filter(c => c.data?.success && c.data?.is_idempotent_replay === true);

        expect(freshClaims.length).toBe(1);
        expect(replayClaims.length).toBe(4);
    });

    it('10. Crash reconciliation: reconciles stuck orders correctly for both dispatched and undispatched branches', async () => {
        const tableDispatched = await createIsolatedTable('stuck-disp');
        const tableUndispatched = await createIsolatedTable('stuck-undisp');

        // Order A: Stuck in processing WITH hardware_dispatched_at
        const { data: holdA } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableDispatched,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'hash-stuck-a'
        });
        await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableDispatched,
            p_order_id: holdA.order_id,
            p_payment_intent_id: 'pi_stuck_a'
        });
        await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableDispatched,
            p_order_id: holdA.order_id,
            p_payment_intent_id: 'pi_stuck_a',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-dead-a'
        });
        await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableDispatched,
            p_order_id: holdA.order_id,
            p_worker_id: 'worker-dead-a',
            p_client_session_token: 'tok-dead-a'
        });

        // Artificially age updated_at to simulate server timeout
        await adminClient
            .from('arcade_orders')
            .update({ updated_at: new Date(Date.now() - 70000).toISOString() })
            .eq('order_id', holdA.order_id);

        // Order B: Stuck in processing WITHOUT hardware_dispatched_at
        const { data: holdB } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableUndispatched,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'hash-stuck-b'
        });
        await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableUndispatched,
            p_order_id: holdB.order_id,
            p_payment_intent_id: 'pi_stuck_b'
        });
        await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableUndispatched,
            p_order_id: holdB.order_id,
            p_payment_intent_id: 'pi_stuck_b',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-dead-b'
        });

        await adminClient
            .from('arcade_orders')
            .update({ updated_at: new Date(Date.now() - 70000).toISOString() })
            .eq('order_id', holdB.order_id);

        // Run reconciliation
        const { data: reconcileResults } = await adminClient.rpc('arcade_reconcile_stuck_orders', {
            p_timeout_seconds: 60
        });

        expect(reconcileResults).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    reconciled_order_id: holdA.order_id,
                    action_taken: 'MARKED_HARDWARE_UNCERTAIN_AND_LOCKED',
                    table_id: tableDispatched
                }),
                expect.objectContaining({
                    reconciled_order_id: holdB.order_id,
                    action_taken: 'CANCELLED_SAFE_AVAILABLE',
                    table_id: tableUndispatched
                })
            ])
        );

        // Table A is error_locked
        const { data: checkTableA } = await adminClient.from('arcade_table_configs').select('lock_state').eq('table_id', tableDispatched).single();
        expect(checkTableA.lock_state).toBe('error_locked');

        // Table B is available
        const { data: checkTableB } = await adminClient.from('arcade_table_configs').select('lock_state').eq('table_id', tableUndispatched).single();
        expect(checkTableB.lock_state).toBe('available');
    });
});
