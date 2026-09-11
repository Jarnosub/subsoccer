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
        for (const tid of createdTableIds) {
            try {
                const { error: errEvents } = await adminClient.from('arcade_events').delete().eq('table_id', tid);
                if (errEvents) console.warn(`Cleanup error arcade_events for ${tid}:`, errEvents.message);

                const { error: errOrders } = await adminClient.from('arcade_orders').delete().eq('table_id', tid);
                if (errOrders) console.warn(`Cleanup error arcade_orders for ${tid}:`, errOrders.message);

                const { error: errSessions } = await adminClient.from('arcade_sessions').delete().eq('table_id', tid);
                if (errSessions) console.warn(`Cleanup error arcade_sessions for ${tid}:`, errSessions.message);

                const { error: errTables } = await adminClient.from('arcade_table_configs').delete().eq('table_id', tid);
                if (errTables) console.warn(`Cleanup error arcade_table_configs for ${tid}:`, errTables.message);
            } catch (err) {
                console.warn(`Cleanup exception for ${tid}:`, err.message);
            }
        }
        createdTableIds.length = 0;
    });

    function generateUniqueId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    async function createIsolatedTable(prefix = 'tbl') {
        const tableId = `test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const { data, error } = await adminClient.from('arcade_table_configs').insert({
            table_id: tableId,
            is_enabled: true,
            lock_state: 'available',
            switch_output_id: 1,
            is_free_play_allowed: false
        }).select().single();

        expect(error).toBeNull();
        expect(data).not.toBeNull();
        createdTableIds.push(tableId);
        return tableId;
    }

    it('1. Rejects unauthorized RPC calls from anon/public key (verifying function exists first with service_role)', async () => {
        const tableId = await createIsolatedTable('rls');
        const tokenHashAdmin = generateUniqueId('hash_admin');
        const tokenHashAnon = generateUniqueId('hash_anon');

        // Step 1: Varmistetaan ensin service_role-kutsulla, että RPC-funktio on olemassa ja suoritettavissa
        const { data: adminData, error: adminErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: tokenHashAdmin
        });

        expect(adminErr).toBeNull();
        expect(adminData.success).toBe(true);

        // Step 2: Kutsutaan täsmälleen samaa olemassa olevaa funktiota kelvollisella anon-avaimella
        const { data: anonData, error: anonErr } = await anonClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: tokenHashAnon
        });

        // Step 3: Varmistetaan, että hylkäys johtuu nimenomaan käyttöoikeuksien puuttumisesta eikä "function not found" -virheestä
        expect(anonErr).not.toBeNull();
        expect(anonErr.message).not.toMatch(/function .* does not exist|not found/i);
        expect(anonErr.message).toMatch(/permission denied|insufficient_privilege/i);
    });

    it('2. Rejects calls with NULL or empty parameters with 400 INVALID_PARAMETERS', async () => {
        const { data, error } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: '',
            p_order_id: null,
            p_payment_intent_id: '',
            p_amount_cents: -5,
            p_currency: '',
            p_worker_id: null
        });

        expect(error).toBeNull();
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
        const paymentIntentId = generateUniqueId('pi_valid');

        // Luodaan varaus pöydälle A
        const { data: hold, error: holdErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableA,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('token_hash')
        });
        expect(holdErr).toBeNull();
        expect(hold.success).toBe(true);
        const orderId = hold.order_id;

        // Sidotaan PaymentIntent
        const { data: bind, error: bindErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableA,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId
        });
        expect(bindErr).toBeNull();
        expect(bind.success).toBe(true);

        // A. Väärä summa (Tilausta EI saa perua!)
        const { data: wrongAmount, error: wrongAmountErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableA,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_amount_cents: 9999,
            p_currency: 'eur',
            p_worker_id: 'worker-test-1'
        });
        expect(wrongAmountErr).toBeNull();
        expect(wrongAmount.success).toBe(false);
        expect(wrongAmount.code).toBe('AMOUNT_MISMATCH');
        expect(wrongAmount.refund_required).toBe(true);

        // B. Väärä pöytä (tableB pöydän tableA sijaan)
        const { data: wrongTable, error: wrongTableErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableB,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-test-1'
        });
        expect(wrongTableErr).toBeNull();
        expect(wrongTable.success).toBe(false);
        expect(wrongTable.code).toBe('TABLE_MISMATCH');
        expect(wrongTable.refund_required).toBe(true);

        // C. Väärä PaymentIntent
        const { data: wrongPI, error: wrongPIErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableA,
            p_order_id: orderId,
            p_payment_intent_id: generateUniqueId('pi_fraud'),
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-test-1'
        });
        expect(wrongPIErr).toBeNull();
        expect(wrongPI.success).toBe(false);
        expect(wrongPI.code).toBe('PAYMENT_INTENT_MISMATCH');
        expect(wrongPI.refund_required).toBe(true);

        // Varmistetaan, että oikea tilaus on edelleen holding-tilassa eikä sitä korruptoitu
        const { data: checkOrder, error: checkOrderErr } = await adminClient
            .from('arcade_orders')
            .select('status')
            .eq('order_id', orderId)
            .single();
        expect(checkOrderErr).toBeNull();
        expect(checkOrder.status).toBe('holding');
    });

    it('4. Rejects release when p_confirmed_off is NULL or false on real expired order and session', async () => {
        const tableId = await createIsolatedTable('null-off-real');
        const paymentIntentId = generateUniqueId('pi_null_off');

        // Luodaan oikea tilaus ja viedään se aktiiviseksi
        const { data: hold, error: holdErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_null_off')
        });
        expect(holdErr).toBeNull();
        expect(hold.success).toBe(true);
        const orderId = hold.order_id;

        const { data: bind, error: bindErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId
        });
        expect(bindErr).toBeNull();
        expect(bind.success).toBe(true);

        const { data: claim, error: claimErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-null-off'
        });
        expect(claimErr).toBeNull();
        expect(claim.success).toBe(true);

        const { data: guard, error: guardErr } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_worker_id: 'worker-null-off',
            p_client_session_token: generateUniqueId('tok_null_off')
        });
        expect(guardErr).toBeNull();
        expect(guard.success).toBe(true);
        const sessionId = guard.session_id;

        const { data: final, error: finalErr } = await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_worker_id: 'worker-null-off',
            p_success: true,
            p_hardware_uncertain: false
        });
        expect(finalErr).toBeNull();
        expect(final.success).toBe(true);

        // Asetetaan peliaika ja turvamarginaali päättyneeksi menneisyyteen
        const expiredPastTimestamp = new Date(Date.now() - 10000).toISOString();
        const { error: updOrderErr } = await adminClient
            .from('arcade_orders')
            .update({ expires_at: expiredPastTimestamp })
            .eq('order_id', orderId);
        expect(updOrderErr).toBeNull();

        const { error: updSessErr } = await adminClient
            .from('arcade_sessions')
            .update({ expires_at: expiredPastTimestamp })
            .eq('id', sessionId);
        expect(updSessErr).toBeNull();

        // A. Kutsu p_confirmed_off: NULL -> Estää vapautuksen koodilla RELE_STILL_ON_OR_UNCONFIRMED
        const { data: releaseNull, error: releaseNullErr } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: null,
            p_confirmed_off_at: new Date().toISOString()
        });
        expect(releaseNullErr).toBeNull();
        expect(releaseNull.success).toBe(false);
        expect(releaseNull.code).toBe('RELE_STILL_ON_OR_UNCONFIRMED');

        // B. Kutsu p_confirmed_off: false -> Estää vapautuksen koodilla RELE_STILL_ON_OR_UNCONFIRMED
        const { data: releaseFalse, error: releaseFalseErr } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: false,
            p_confirmed_off_at: new Date().toISOString()
        });
        expect(releaseFalseErr).toBeNull();
        expect(releaseFalse.success).toBe(false);
        expect(releaseFalse.code).toBe('RELE_STILL_ON_OR_UNCONFIRMED');

        // C. Kutsu ilman havaintoaikaa p_confirmed_off_at: null -> Estää vapautuksen koodilla MISSING_OFF_CONFIRMATION_TIME
        const { data: releaseNoTime, error: releaseNoTimeErr } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: true,
            p_confirmed_off_at: null
        });
        expect(releaseNoTimeErr).toBeNull();
        expect(releaseNoTime.success).toBe(false);
        expect(releaseNoTime.code).toBe('MISSING_OFF_CONFIRMATION_TIME');

        // Pöytä on edelleen lukittuna aktiiviseksi
        const { data: tableCheck, error: tableCheckErr } = await adminClient
            .from('arcade_table_configs')
            .select('lock_state')
            .eq('table_id', tableId)
            .single();
        expect(tableCheckErr).toBeNull();
        expect(tableCheck.lock_state).toBe('active');
    });

    it('5. Rejects contradictory parameters in arcade_finalize_activation', async () => {
        const tableId = await createIsolatedTable('contradictory');

        const { data, error } = await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: 'ord-dummy',
            p_session_id: '00000000-0000-0000-0000-000000000000',
            p_worker_id: 'worker-1',
            p_success: true,
            p_hardware_uncertain: true
        });

        expect(error).toBeNull();
        expect(data.success).toBe(false);
        expect(data.code).toBe('CONTRADICTORY_PARAMETERS');
        expect(data.statusCode).toBe(400);
    });

    it('6. Release respects deadline + 4s margin; stale replay does NOT alter new customer active game', async () => {
        const tableId = await createIsolatedTable('stale-replay-active');
        const piCust1 = generateUniqueId('pi_cust_1');
        const piCust2 = generateUniqueId('pi_cust_2');

        // Asiakas 1: 1 sekunnin peliaika (kokonaisaika marginaalin kanssa 1s + 4s = 5s)
        const { data: hold1, error: hold1Err } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 1,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_c1'),
            p_hold_seconds: 60
        });
        expect(hold1Err).toBeNull();
        expect(hold1.success).toBe(true);
        const orderId1 = hold1.order_id;

        const { error: bind1Err } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_payment_intent_id: piCust1
        });
        expect(bind1Err).toBeNull();

        const { error: claim1Err } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_payment_intent_id: piCust1,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-c1'
        });
        expect(claim1Err).toBeNull();

        const { data: guard1, error: guard1Err } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_worker_id: 'worker-c1',
            p_client_session_token: generateUniqueId('tok_c1')
        });
        expect(guard1Err).toBeNull();
        const sessionId1 = guard1.session_id;

        const { error: final1Err } = await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_session_id: sessionId1,
            p_worker_id: 'worker-c1',
            p_success: true,
            p_hardware_uncertain: false
        });
        expect(final1Err).toBeNull();

        // A. Vapautuksen estyminen ENNEN aikarajaa ja 4s turvamarginaalia
        const { data: earlyRel, error: earlyRelErr } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_session_id: sessionId1,
            p_confirmed_off: true,
            p_confirmed_off_at: new Date().toISOString()
        });
        expect(earlyRelErr).toBeNull();
        expect(earlyRel.success).toBe(false);
        expect(earlyRel.code).toBe('DEADLINE_NOT_ELAPSED');

        // B. Odotetaan että 1s peliaika + 4s turvamarginaali kuluvat (5200 ms)
        await new Promise(r => setTimeout(r, 5200));

        // Vapautuksen onnistuminen aikarajan ja marginaalin jälkeen
        const nowOffTime = new Date().toISOString();
        const { data: rel1, error: rel1Err } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_session_id: sessionId1,
            p_confirmed_off: true,
            p_confirmed_off_at: nowOffTime
        });
        expect(rel1Err).toBeNull();
        expect(rel1.success).toBe(true);
        expect(rel1.lock_state).toBe('available');

        // C. Asiakas 2: Vie toisen asiakkaan tilaus AKTIIVISEKSI peliksi
        const { data: hold2, error: hold2Err } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 10,
            p_duration_seconds: 600,
            p_amount_cents: 400,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_c2')
        });
        expect(hold2Err).toBeNull();
        expect(hold2.success).toBe(true);
        const orderId2 = hold2.order_id;

        const { error: bind2Err } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId2,
            p_payment_intent_id: piCust2
        });
        expect(bind2Err).toBeNull();

        const { error: claim2Err } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId2,
            p_payment_intent_id: piCust2,
            p_amount_cents: 400,
            p_currency: 'eur',
            p_worker_id: 'worker-c2'
        });
        expect(claim2Err).toBeNull();

        const { data: guard2, error: guard2Err } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableId,
            p_order_id: orderId2,
            p_worker_id: 'worker-c2',
            p_client_session_token: generateUniqueId('tok_c2')
        });
        expect(guard2Err).toBeNull();
        const sessionId2 = guard2.session_id;

        const { error: final2Err } = await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: orderId2,
            p_session_id: sessionId2,
            p_worker_id: 'worker-c2',
            p_success: true,
            p_hardware_uncertain: false
        });
        expect(final2Err).toBeNull();

        // Vahvistetaan Asiakkaan 2 aktiiviset tilat
        const { data: tableCheckActive } = await adminClient.from('arcade_table_configs').select('lock_state').eq('table_id', tableId).single();
        expect(tableCheckActive.lock_state).toBe('active');

        // D. STALE REPLAY: Vanha vapautuspyyntö Asiakkaalle 1 uusitaan
        const { data: staleReplay, error: staleReplayErr } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId1,
            p_session_id: sessionId1,
            p_confirmed_off: true,
            p_confirmed_off_at: new Date().toISOString()
        });

        expect(staleReplayErr).toBeNull();
        expect(staleReplay.success).toBe(true);
        expect(staleReplay.already_resolved).toBe(true);

        // E. VARMISTUS: Asiakkaan 2 tilaus, sessio ja pöytälukko ovat edelleen 'active'!
        const { data: order2Check } = await adminClient.from('arcade_orders').select('status').eq('order_id', orderId2).single();
        expect(order2Check.status).toBe('active');

        const { data: session2Check } = await adminClient.from('arcade_sessions').select('status').eq('id', sessionId2).single();
        expect(session2Check.status).toBe('active');

        const { data: table2Check } = await adminClient.from('arcade_table_configs').select('lock_state').eq('table_id', tableId).single();
        expect(table2Check.lock_state).toBe('active');
    });

    it('7. Uncertain session safely releases after deadline + confirmed OFF and frees table for new hold', async () => {
        const tableId = await createIsolatedTable('uncertain-release');
        const paymentIntentId = generateUniqueId('pi_unc');

        const { data: hold, error: holdErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 1, // 1s peliaika + 4s turvamarginaali
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_unc')
        });
        expect(holdErr).toBeNull();
        const orderId = hold.order_id;

        const { error: bindErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId
        });
        expect(bindErr).toBeNull();

        const { error: claimErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-unc'
        });
        expect(claimErr).toBeNull();

        const { data: guard, error: guardErr } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_worker_id: 'worker-unc',
            p_client_session_token: generateUniqueId('tok_unc')
        });
        expect(guardErr).toBeNull();
        const sessionId = guard.session_id;

        // Finalisoidaan epävarmaksi
        const { error: finalErr } = await adminClient.rpc('arcade_finalize_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_worker_id: 'worker-unc',
            p_success: false,
            p_hardware_uncertain: true,
            p_error_reason: 'Emergency cut unconfirmed'
        });
        expect(finalErr).toBeNull();

        const { data: lockedCheck } = await adminClient.from('arcade_table_configs').select('lock_state').eq('table_id', tableId).single();
        expect(lockedCheck.lock_state).toBe('error_locked');

        // A. Estyminen ennen aikarajaa
        const { data: earlyRel, error: earlyRelErr } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: true,
            p_confirmed_off_at: new Date().toISOString()
        });
        expect(earlyRelErr).toBeNull();
        expect(earlyRel.success).toBe(false);
        expect(earlyRel.code).toBe('DEADLINE_NOT_ELAPSED');

        // B. Odotetaan 1s + 4s marginaali
        await new Promise(r => setTimeout(r, 5200));

        // Purku tuoreella OFF-havainnolla
        const nowOffTime = new Date().toISOString();
        const { data: release, error: relErr } = await adminClient.rpc('arcade_release_reconciled_table', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_session_id: sessionId,
            p_confirmed_off: true,
            p_confirmed_off_at: nowOffTime
        });
        expect(relErr).toBeNull();
        expect(release.success).toBe(true);
        expect(release.lock_state).toBe('available');

        // Tila on resolved_uncertain ja refund_required säilyy
        const { data: orderRow } = await adminClient.from('arcade_orders').select('status, refund_status').eq('order_id', orderId).single();
        expect(orderRow.status).toBe('resolved_uncertain');
        expect(orderRow.refund_status).toBe('refund_required');

        // Uusi tilaus onnistuu nyt samalle pöydälle
        const { data: newHold, error: newHoldErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_new_player')
        });
        expect(newHoldErr).toBeNull();
        expect(newHold.success).toBe(true);
    });

    it('8. Webhook retry on bound order preserves refund_completed after processed retry', async () => {
        const tableId = await createIsolatedTable('bound-refund-preserved');
        const paymentIntentId = generateUniqueId('pi_refund_test');

        const { data: hold, error: holdErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_ref'),
            p_hold_seconds: 1
        });
        expect(holdErr).toBeNull();
        const orderId = hold.order_id;

        // Sidotaan PaymentIntent tilaukseen ENNEN webhook-kutsua
        const { error: bindErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId
        });
        expect(bindErr).toBeNull();

        // Odotetaan että hold raukeaa ja simuloidaan, että ylläpito on jo palauttanut maksun
        await new Promise(r => setTimeout(r, 1200));

        const { error: updErr } = await adminClient
            .from('arcade_orders')
            .update({ status: 'hold_expired', refund_status: 'refund_completed' })
            .eq('order_id', orderId);
        expect(updErr).toBeNull();

        // Webhook-kutsu saapuu uudelleen samalla sidotulla PaymentIntentillä
        const { data: webhookResult, error: webhookErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-ref-retry'
        });

        // Tarkistetaan kutsun tulos: maksu ohjataan hylkäykseen ja hyvitysvaatimukseen
        expect(webhookErr).toBeNull();
        expect(webhookResult.success).toBe(false);
        expect(webhookResult.code).toBe('hold_expired');
        expect(webhookResult.refund_required).toBe(true);

        // Varmistetaan että refund_status säilyy refund_completed -tilassa
        const { data: orderCheck, error: orderCheckErr } = await adminClient
            .from('arcade_orders')
            .select('refund_status')
            .eq('order_id', orderId)
            .single();

        expect(orderCheckErr).toBeNull();
        expect(orderCheck.refund_status).toBe('refund_completed');
    });

    it('9. Concurrency: 10 parallel holds from different customers yield exactly one winner and 9 rejections', async () => {
        const tableId = await createIsolatedTable('concurrent-holds');
        const attempts = 10;

        const promises = Array.from({ length: attempts }, (_, i) => {
            return adminClient.rpc('arcade_create_payment_hold', {
                p_table_id: tableId,
                p_duration_minutes: 5,
                p_duration_seconds: 300,
                p_amount_cents: 250,
                p_currency: 'eur',
                p_client_token_hash: generateUniqueId(`cust_${i}`)
            });
        });

        const results = await Promise.all(promises);
        results.forEach(r => expect(r.error).toBeNull());

        const successes = results.filter(r => r.data?.success && !r.data?.is_replay);
        const failures = results.filter(r => !r.data?.success && (r.data?.code === 'TABLE_HELD' || r.data?.code === 'TABLE_BUSY'));

        expect(successes.length).toBe(1);
        expect(failures.length).toBe(attempts - 1);
    });

    it('10. Concurrency: 5 parallel webhooks on same order yield exactly one processing winner and 4 replays', async () => {
        const tableId = await createIsolatedTable('webhook-race');
        const paymentIntentId = generateUniqueId('pi_race');

        const { data: hold, error: holdErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableId,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('race_hash')
        });
        expect(holdErr).toBeNull();
        const orderId = hold.order_id;

        const { error: bindErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableId,
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId
        });
        expect(bindErr).toBeNull();

        // 5 rinnakkaista claim-pyyntöä samanaikaisesti
        const claims = await Promise.all(
            Array.from({ length: 5 }, (_, i) => {
                return adminClient.rpc('arcade_claim_order_for_activation', {
                    p_table_id: tableId,
                    p_order_id: orderId,
                    p_payment_intent_id: paymentIntentId,
                    p_amount_cents: 250,
                    p_currency: 'eur',
                    p_worker_id: `worker-thread-${i}`
                });
            })
        );

        claims.forEach(c => expect(c.error).toBeNull());

        const freshClaims = claims.filter(c => c.data?.success && c.data?.is_idempotent_replay === false);
        const replayClaims = claims.filter(c => c.data?.success && c.data?.is_idempotent_replay === true);

        expect(freshClaims.length).toBe(1);
        expect(replayClaims.length).toBe(4);
    });

    it('11. Crash reconciliation: reconciles stuck orders correctly for both dispatched and undispatched branches', async () => {
        const tableDispatched = await createIsolatedTable('stuck-disp');
        const tableUndispatched = await createIsolatedTable('stuck-undisp');
        const piA = generateUniqueId('pi_stuck_a');
        const piB = generateUniqueId('pi_stuck_b');

        // Tilaus A: Jumiutunut processing-tilaan lähetetyn relekäskyn jälkeen
        const { data: holdA, error: holdAErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableDispatched,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_a')
        });
        expect(holdAErr).toBeNull();

        const { error: bindAErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableDispatched,
            p_order_id: holdA.order_id,
            p_payment_intent_id: piA
        });
        expect(bindAErr).toBeNull();

        const { error: claimAErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableDispatched,
            p_order_id: holdA.order_id,
            p_payment_intent_id: piA,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-dead-a'
        });
        expect(claimAErr).toBeNull();

        const { error: guardAErr } = await adminClient.rpc('arcade_pre_dispatch_guard', {
            p_table_id: tableDispatched,
            p_order_id: holdA.order_id,
            p_worker_id: 'worker-dead-a',
            p_client_session_token: generateUniqueId('tok_dead_a')
        });
        expect(guardAErr).toBeNull();

        const { error: updAErr } = await adminClient
            .from('arcade_orders')
            .update({ updated_at: new Date(Date.now() - 70000).toISOString() })
            .eq('order_id', holdA.order_id);
        expect(updAErr).toBeNull();

        // Tilaus B: Jumiutunut processing-tilaan ennen relekäskyn lähetystä
        const { data: holdB, error: holdBErr } = await adminClient.rpc('arcade_create_payment_hold', {
            p_table_id: tableUndispatched,
            p_duration_minutes: 5,
            p_duration_seconds: 300,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_client_token_hash: generateUniqueId('hash_b')
        });
        expect(holdBErr).toBeNull();

        const { error: bindBErr } = await adminClient.rpc('arcade_bind_payment_intent', {
            p_table_id: tableUndispatched,
            p_order_id: holdB.order_id,
            p_payment_intent_id: piB
        });
        expect(bindBErr).toBeNull();

        const { error: claimBErr } = await adminClient.rpc('arcade_claim_order_for_activation', {
            p_table_id: tableUndispatched,
            p_order_id: holdB.order_id,
            p_payment_intent_id: piB,
            p_amount_cents: 250,
            p_currency: 'eur',
            p_worker_id: 'worker-dead-b'
        });
        expect(claimBErr).toBeNull();

        const { error: updBErr } = await adminClient
            .from('arcade_orders')
            .update({ updated_at: new Date(Date.now() - 70000).toISOString() })
            .eq('order_id', holdB.order_id);
        expect(updBErr).toBeNull();

        // Ajetaan palautusfunktio
        const { data: reconcileResults, error: reconcileErr } = await adminClient.rpc('arcade_reconcile_stuck_orders', {
            p_timeout_seconds: 60
        });
        expect(reconcileErr).toBeNull();

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

        const { data: checkTableA, error: checkTableAErr } = await adminClient.from('arcade_table_configs').select('lock_state').eq('table_id', tableDispatched).single();
        expect(checkTableAErr).toBeNull();
        expect(checkTableA.lock_state).toBe('error_locked');

        const { data: checkTableB, error: checkTableBErr } = await adminClient.from('arcade_table_configs').select('lock_state').eq('table_id', tableUndispatched).single();
        expect(checkTableBErr).toBeNull();
        expect(checkTableB.lock_state).toBe('available');
    });
});
