const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  console.log("Fetching status distribution of tournament_history...");
  const { data, error } = await supabase
    .from('tournament_history')
    .select('status, start_datetime');

  if (error) {
    console.error("Error:", error);
    return;
  }

  const counts = {};
  data.forEach(t => {
    counts[t.status] = (counts[t.status] || 0) + 1;
  });
  console.log("Status distribution:", counts);
}
test();
