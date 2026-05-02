const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { count, error } = await supabase.from('public_tracking').select('*', { count: 'exact', head: true });
    console.log("Total rows:", count);
}
check();
