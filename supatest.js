const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const { data, error } = await supabase.from('players').select('*, team_data:teams!players_team_id_fkey(*)').limit(1);


}
test();
