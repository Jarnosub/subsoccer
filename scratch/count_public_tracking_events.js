const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  console.log("Checking total counts in public_tracking...");
  
  // Total rows
  const { count: totalCount } = await supabase.from('public_tracking').select('*', { count: 'exact', head: true });
  console.log("Total rows in public_tracking:", totalCount);

  // Group by event_type
  const eventTypes = ['app_opened', 'game_start', 'game_finished', 'tournament_finished', 'tournament_match_finished', 'avatar_generated'];
  for (const et of eventTypes) {
    const { count } = await supabase.from('public_tracking').select('*', { count: 'exact', head: true }).eq('event_type', et);
    console.log(`Count for event_type '${et}':`, count);
  }
}
test();
