const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const days = 7;
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - days);
  const startDateStr = pastDate.toISOString();

  const { data: track } = await supabase
    .from('public_tracking')
    .select('*')
    .eq('event_type', 'tournament_finished')
    .gte('client_time', startDateStr);

  let guest = 0, registered = 0;
  (track || []).forEach(d => {
    if (d.source_partner === 'guest') guest++;
    else registered++;
  });

  const { count: hist } = await supabase
    .from('tournament_history')
    .select('*', { count: 'exact', head: true })
    .gte('start_datetime', startDateStr);

  console.log("Last 7 Days Breakdown:");
  console.log("  public_tracking tournament_finished total:", (track || []).length);
  console.log("    Guest:", guest);
  console.log("    Registered:", registered);
  console.log("  tournament_history total rows:", hist);
}
test();
