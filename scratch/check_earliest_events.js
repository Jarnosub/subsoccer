const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  console.log("Fetching earliest 10 tracking events...");
  const { data, error } = await supabase
    .from('public_tracking')
    .select('client_time, event_type')
    .order('client_time', { ascending: true })
    .limit(10);

  if (error) {
    console.error("Error:", error);
    return;
  }

  data.forEach((d, idx) => {
    console.log(`${idx + 1}. Time: ${d.client_time}, Event: ${d.event_type}`);
  });
}
test();
