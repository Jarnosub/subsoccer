const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

const supabase = createClient(SUPA_URL, SUPA_KEY);

async function test() {
    const { data, error } = await supabase
        .from('players')
        .select('username, display_name, elo, wins, losses')
        .order('elo', { ascending: false })
        .limit(10);
    console.log("Error:", error);
    console.log("Data:", data);
}

test();
