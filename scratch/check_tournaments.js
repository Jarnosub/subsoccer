const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCounts() {
    // 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDateStr = sevenDaysAgo.toISOString();

    const [historyRes, trackingRes] = await Promise.all([
        supabase.from('tournament_history').select('id', { count: 'exact' }).gte('start_datetime', startDateStr),
        supabase.from('public_tracking').select('id', { count: 'exact' }).eq('event_type', 'tournament_finished').gte('client_time', startDateStr)
    ]);

    console.log('--- TOURNAMENT COUNTS (LAST 7 DAYS) ---');
    console.log('tournament_history count:', historyRes.count);
    console.log('public_tracking (tournament_finished) count:', trackingRes.count);
}

checkCounts();
