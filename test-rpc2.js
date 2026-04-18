const { createClient } = require('@supabase/supabase-js');
const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

async function run() {
  const { data, error } = await supabase.rpc('record_quick_match_v1', {
    p1_id: null, p2_id: null, p1_new_elo: 1000, p2_new_elo: 1000, p1_won: true, 
    match_data: { player1: "TEST_ROBOT", player2: "KRIS", winner: "TEST_ROBOT", player1_score: 3, player2_score: 0 }
  });
  console.log("RPC Error:", error ? error.message : "None", "Data:", data);
}
run();
