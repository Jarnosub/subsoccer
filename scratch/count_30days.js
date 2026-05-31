const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const days = 30;
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - days);
  const startDateStr = pastDate.toISOString();

  console.log(`Checking total rows in public_tracking for last 30 days (>= ${startDateStr}):`);
  
  const { count } = await supabase
    .from('public_tracking')
    .select('*', { count: 'exact', head: true })
    .gte('client_time', startDateStr);
    
  console.log("Total rows in last 30 days:", count);
}
test();
