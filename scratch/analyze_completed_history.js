const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const { data: hist, error } = await supabase.from('tournament_history').select('*');
  if (error) {
    console.error("Error:", error);
    return;
  }

  const completedOther = hist.filter(t => t.status === 'completed' && !(t.tournament_name && t.tournament_name.startsWith('Mobile Tournament')));
  console.log("Count of other completed tournaments in tournament_history:", completedOther.length);
  console.log("Details of other completed tournaments:");
  completedOther.forEach(t => {
    console.log(`- ID: ${t.id}, Name: ${t.tournament_name}, EventID: ${t.event_id}, CreatedAt: ${t.created_at}, OrganizerID: ${t.organizer_id}`);
  });
}
test();
