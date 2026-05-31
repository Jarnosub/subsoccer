const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const { data: hist, error } = await supabase.from('tournament_history').select('*');
  if (error) {
    console.error("Error:", error);
    return;
  }

  const other = hist.filter(t => !t.event_id && !(t.tournament_name && t.tournament_name.startsWith('Mobile Tournament')));
  console.log("Count of other tournaments in tournament_history:", other.length);
  console.log("Sample of other tournaments (first 20):");
  other.slice(0, 20).forEach(t => {
    console.log(`- ID: ${t.id}, Name: ${t.tournament_name}, Status: ${t.status}, CreatedAt: ${t.created_at}, OrganizerID: ${t.organizer_id}`);
  });
}
test();
