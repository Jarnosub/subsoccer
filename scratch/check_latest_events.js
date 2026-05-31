const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  console.log("Fetching most recent 20 tracking events...");
  const { data, error } = await supabase
    .from('public_tracking')
    .select('event_type, client_time, location, source_partner, match_score')
    .order('client_time', { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error:", error);
    return;
  }

  data.forEach((d, idx) => {
    console.log(`${idx + 1}. Time: ${d.client_time}, Event: ${d.event_type}, Location: ${d.location}, Partner: ${d.source_partner}, Score: ${d.match_score}`);
  });
}
test();
