/**
 * ==============================================================================
 * SUBSOCCER ARCADE — Scheduled Independent Reconciliation (Cron)
 * ==============================================================================
 * 
 * Runs every minute in the published production deployment of subsoccer-sandbox.
 * Ensures that table sessions are authoritatively reconciled and released even if:
 * - The player closes their phone browser or puts it in their pocket
 * - No new customer scans the table QR code
 * - The venue computer (Mac) is completely turned off
 * 
 * Guarantees:
 * - Strict 4-second expiration margin (now > expires_at + 4s)
 * - Fresh probe via MQTT (discards retained packets, searches by ID)
 * - Authoritative atomic release via arcade_release_reconciled_table RPC
 * - Preserves pending maintenance locks
 */

const { getSupabase } = require('./utils/arcade-core');
const { probeOutletOffMqtt, setAuxOutletMqtt } = require('./utils/mqtt-cloud-bridge');

const handler = async (event) => {
    console.log('[RECONCILE CRON] Starting scheduled reconciliation check at', new Date().toISOString());

    const sb = getSupabase();
    if (!sb) {
        console.warn('[RECONCILE CRON] Supabase not configured. Skipping cron run.');
        return { statusCode: 200, body: JSON.stringify({ skipped: 'no_db' }) };
    }

    try {
        const nowIso = new Date().toISOString();
        const fourSecsAgo = new Date(Date.now() - 4000).toISOString();

        // 1. Find all active orders whose deadline has passed (+ 4s margin)
        const { data: expiredOrders, error: ordersErr } = await sb
            .from('arcade_orders')
            .select('order_id, table_id, session_id, expires_at, status')
            .eq('status', 'active')
            .lt('expires_at', fourSecsAgo);

        if (ordersErr) {
            console.error('[RECONCILE CRON] Error querying expired orders:', ordersErr.message);
            return { statusCode: 500, body: JSON.stringify({ error: ordersErr.message }) };
        }

        if (!expiredOrders || expiredOrders.length === 0) {
            console.log('[RECONCILE CRON] No expired active orders found.');
            return { statusCode: 200, body: JSON.stringify({ processed: 0 }) };
        }

        console.log(`[RECONCILE CRON] Found ${expiredOrders.length} expired active order(s) to reconcile.`);
        const results = [];

        for (const order of expiredOrders) {
            console.log(`[RECONCILE CRON] Reconciling order ${order.order_id} on table ${order.table_id}...`);

            // Enforce expires_at + 4000ms safety buffer
            const expiresAtMs = order.expires_at ? new Date(order.expires_at).getTime() : 0;
            const now = Date.now();
            if (expiresAtMs > 0 && now < (expiresAtMs + 4000)) {
                console.log(`[RECONCILE CRON] Order ${order.order_id} has not yet passed expires_at + 4s buffer. Skipping.`);
                continue;
            }

            // Fetch table config
            const { data: tableCfg } = await sb
                .from('arcade_table_configs')
                .select('*')
                .eq('table_id', order.table_id)
                .maybeSingle();

            const targetOutletId = tableCfg?.switch_output_id || 1;
            const lightsOutletId = tableCfg?.lights_output_id || 3;
            const deviceSn = tableCfg?.device_serial || process.env.HIVEMQ_DEVICE_SN;

            if (!deviceSn) {
                console.warn(`[RECONCILE CRON] Table ${order.table_id} missing device serial. Cannot probe.`);
                results.push({ orderId: order.order_id, success: false, error: 'DEVICE_SERIAL_MISSING' });
                continue;
            }

            // Probe hardware via fresh MQTT telemetry
            const probe = await probeOutletOffMqtt({
                deviceSn,
                targetOutletId,
                timeoutMs: 5000
            });

            console.log(`[RECONCILE CRON] Hardware probe for Outlet ${targetOutletId}:`, probe);

            if (probe.confirmedOff === true && probe.observedAt) {
                const confirmedOffAt = probe.observedAt;

                // Call atomic release RPC
                const { data: releaseData, error: releaseErr } = await sb.rpc('arcade_release_reconciled_table', {
                    p_table_id: order.table_id,
                    p_order_id: order.order_id,
                    p_session_id: order.session_id,
                    p_confirmed_off: true,
                    p_confirmed_off_at: confirmedOffAt
                });

                if (releaseErr || !releaseData?.success) {
                    console.error('[RECONCILE CRON] Release RPC failed:', releaseErr?.message || releaseData?.error);
                    results.push({ orderId: order.order_id, success: false, error: releaseErr?.message || releaseData?.error });
                } else {
                    console.log(`[RECONCILE CRON] Table ${order.table_id} successfully reconciled and released!`);

                    // Ensure attract light is on if table returned to available
                    if (releaseData.table_lock_state === 'available') {
                        try {
                            await setAuxOutletMqtt({ deviceSn, outletId: lightsOutletId, action: 1 });
                        } catch (e) {}
                    }

                    results.push({ orderId: order.order_id, success: true, releasedTo: releaseData.table_lock_state });
                }
            } else {
                console.warn(`[RECONCILE CRON] Outlet ${targetOutletId} NOT confirmed OFF (state: ${probe.state}, reason: ${probe.reason}). Keeping lock.`);
                results.push({ orderId: order.order_id, success: false, reason: probe.reason || 'NOT_CONFIRMED_OFF' });
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ processed: expiredOrders.length, results })
        };
    } catch (err) {
        console.error('[RECONCILE CRON] Unexpected error:', err.message);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

// Check if @netlify/functions schedule is available
try {
    const { schedule } = require('@netlify/functions');
    exports.handler = schedule('* * * * *', handler);
} catch (e) {
    exports.handler = handler;
}
