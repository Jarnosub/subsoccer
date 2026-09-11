import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL || process.env.SUPABASE_URL || 'https://mock-test-project.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY || 'mock-anon-key';

const hasRealTestDb = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);

describe.runIf(hasRealTestDb)('Supabase Atomic RPC & Concurrency Integration Tests', () => {
    let adminClient;
    let anonClient;
    const testTableId = 'test-pulse-concurrency-' + Date.now();

    beforeEach(async () => {
        adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        anonClient = createClient(SUPABASE_URL, ANON_KEY);

        // Ensure clean test table exists
        await adminClient.from('arcade_table_configs').upsert({
            table_id: testTableId,
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 1,
            is_free_play_allowed: false
        });
    });

    it('1. Rejects unauthorized RPC calls from public / anon key (Security Definer RLS)', async () => {
        const { data, error } = await anonClient.rpc('arcade_create_payment_hold', {
            p_table_id: testTableId,
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

    it('3. Rejects payment with PAYMENT_INTENT_MISMATCH, AMOUNT_MISMATCH, and TABLE_MISMATCH without returning replay', async () => {
        // Create hold
        const { data: hold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: testTableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'test-token-hash-1'
        });
        expect(hold.success).toBe(true);
        const orderId = hold.order_id;

        // Bind PaymentIntent
        const { data: bind } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_correct_123'
        });
        expect(bind.success).toBe(true);

        // A. Wrong Amount
        const { data: wrongAmount } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_correct_123',
            p_amount_cents: 9999, // Mismatch
            p_currency: 'eur',
            p_worker_id: 'worker-1'
        });
        expect(wrongAmount.success).toBe(false);
        expect(wrongAmount.code).toBe('AMOUNT_MISMATCH');
        expect(wrongAmount.refund_required).toBe(true);

        // B. Wrong Table
        const { data: wrongTable } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: 'wrong-table-id',
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
            p_table_id: testTableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_WRONG_999',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-1'
        });
        expect(wrongPI.success).toBe(false);
        expect(wrongPI.code).toBe('PAYMENT_INTENT_MISMATCH');
        expect(wrongPI.refund_required).toBe(true);
    });

    it('4. Permanently records payment_status = succeeded and refund_status = refund_required when late payment arrives to already expired order', async () => {
        // Create hold
        const { data: hold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: testTableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'test-hash-late',
            p_hold_seconds: 1 // Expires in 1 second
        });
        const orderId = hold.order_id;

        // Wait 1.5 seconds so hold expires
        await new Promise(r => setTimeout(r, 1500));

        // Webhook arrives late
        const { data: lateClaim } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_late_payment_123',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-late'
        });

        expect(lateClaim.success).toBe(false);
        expect(lateClaim.code).toBe('HOLD_EXPIRED');
        expect(lateClaim.refund_required).toBe(true);

        // Verify permanent DB state
        const { data: orderRow } = await adminClient
            .from('arcade_orders')
            .select('*')
            .eq('order_id', orderId)
            .single();

        expect(orderRow.status).toBe('hold_expired');
        expect(orderRow.payment_status).toBe('succeeded');
        expect(orderRow.refund_status).toBe('refund_required');
        expect(orderRow.stripe_payment_intent_id).toBe('pi_late_payment_123');
    });

    it('5. Rejects finalization from stale handler or mismatched session ownership', async () => {
        // Create hold & claim
        const { data: hold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: testTableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'test-hash-stale'
        });
        const orderId = hold.order_id;

        const { data: claim } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_stale_123',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-legitimate-A'
        });
        expect(claim.success).toBe(true);

        // Pre-dispatch guard
        const { data: guard } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_worker_id: 'worker-legitimate-A',
            p_client_session_token: 'tok-stale-test-123'
        });
        expect(guard.success).toBe(true);
        const sessionId = guard.session_id;

        // Stale worker B tries to finalize
        const { data: staleFinalize } = await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_worker_id: 'worker-STALE-B', // Wrong worker
            p_success: true,
            p_hardware_uncertain: false
        });

        expect(staleFinalize.success).toBe(false);
        expect(staleFinalize.code).toBe('STALE_HANDLER_REJECTED');

        // Verify table was NOT released by stale worker
        const { data: tableRow } = await adminClient
            .from('arcade_table_configs')
            .select('lock_state')
            .eq('table_id', testTableId)
            .single();

        expect(tableRow.lock_state).toBe('pending_payment');
    });

    it('6. Safe release function requires confirmed OFF (State === 0) AND elapsed deadline', async () => {
        // Create hold, claim, dispatch, and activate
        const { data: hold } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: testTableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: 'test-hash-release'
        });
        const orderId = hold.order_id;

        await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_payment_intent_id: 'pi_release_123',
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-release'
        });

        const { data: guard } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_worker_id: 'worker-release',
            p_client_session_token: 'tok-release-123'
        });
        const sessionId = guard.session_id;

        await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_worker_id: 'worker-release',
            p_success: true,
            p_hardware_uncertain: false
        });

        // A. Attempt release without confirmed OFF
        const { data: unconfirmedOff } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: false // NOT OFF
        });
        expect(unconfirmedOff.success).toBe(false);
        expect(unconfirmedOff.code).toBe('RELE_STILL_ON_OR_UNCONFIRMED');

        // B. Attempt release before deadline has elapsed
        const { data: beforeDeadline } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: testTableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: true // Confirmed off but playtime not elapsed
        });
        expect(beforeDeadline.success).toBe(false);
        expect(beforeDeadline.code).toBe('DEADLINE_NOT_ELAPSED');
    });

    it('7. Concurrency: multiple simultaneous holds on same table yields exactly one winner', async () => {
        const attempts = 10;
        const promises = Array.from({ length: attempts }, (_, i) => {
            return adminClient.rpc('arcade_create_payment_hold', {
                p_table_id: testTableId,
                p_duration_minutes: 5,
                p_duration_seconds: 300,
                p_amount_cents: 250,
                p_currency: 'eur',
                p_client_token_hash: `token-hash-concurrent-${i}`
            });
        });

        const results = await Promise.all(promises);
        const successes = results.filter(r => r.data?.success && !r.data?.is_replay);
        const failures = results.filter(r => !r.data?.success && r.data?.code === 'TABLE_HELD');

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(attempts - 1);
    });
});
