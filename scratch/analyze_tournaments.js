const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  console.log("Fetching all tournament_history rows...");
  const { data: hist, error: err1 } = await supabase
    .from('tournament_history')
    .select('*');

  if (err1) {
    console.error("Error:", err1);
    return;
  }

  console.log("Total tournament_history rows:", hist.length);
  
  // Count with event_id vs without event_id
  let withEvent = 0;
  let withoutEvent = 0;
  let mobileName = 0;
  let completed = 0;
  let scheduled = 0;
  let ongoing = 0;

  hist.forEach(t => {
    if (t.event_id) withEvent++;
    else withoutEvent++;

    if (t.tournament_name && t.tournament_name.startsWith('Mobile Tournament')) mobileName++;
    
    if (t.status === 'completed') completed++;
    else if (t.status === 'scheduled') scheduled++;
    else if (t.status === 'ongoing') ongoing++;
  });

  console.log("tournament_history breakdown:");
  console.log("  With event_id:", withEvent);
  console.log("  Without event_id:", withoutEvent);
  console.log("  Name starts with 'Mobile Tournament':", mobileName);
  console.log("  Status completed:", completed);
  console.log("  Status scheduled:", scheduled);
  console.log("  Status ongoing:", ongoing);

  console.log("\nFetching all public_tracking tournament_finished events...");
  const { data: track, error: err2 } = await supabase
    .from('public_tracking')
    .select('*')
    .eq('event_type', 'tournament_finished');

  if (err2) {
    console.error("Error:", err2);
    return;
  }

  console.log("Total public_tracking tournament_finished rows:", track.length);

  let guestCount = 0;
  let registeredCount = 0;
  track.forEach(d => {
    if (d.source_partner === 'guest') guestCount++;
    else if (d.source_partner === 'registered') registeredCount++;
  });

  console.log("public_tracking tournament_finished breakdown:");
  console.log("  source_partner guest:", guestCount);
  console.log("  source_partner registered:", registeredCount);
}
test();
