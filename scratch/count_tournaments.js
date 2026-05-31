const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  console.log("Fetching tournament_history counts...");
  const { data: histData, error: histError, count: histCount } = await supabase
    .from('tournament_history')
    .select('id, tournament_name, status, start_datetime', { count: 'exact' });

  if (histError) {
    console.error("Error fetching tournament_history:", histError);
  } else {
    console.log("tournament_history total rows:", histCount || histData.length);
    console.log("tournament_history sample rows:", histData.slice(0, 10));
  }

  console.log("\nFetching public_tracking tournament_finished events...");
  const { data: trackData, error: trackError, count: trackCount } = await supabase
    .from('public_tracking')
    .select('id, event_type, location, source_partner, client_time', { count: 'exact' })
    .eq('event_type', 'tournament_finished');

  if (trackError) {
    console.error("Error fetching public_tracking:", trackError);
  } else {
    console.log("public_tracking tournament_finished total rows:", trackCount || trackData.length);
    console.log("public_tracking sample rows:", trackData.slice(0, 10));
  }
}
test();
