const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const days = 7;
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - days);
  const startDateStr = pastDate.toISOString();

  console.log(`Checking tournament_history rows with created_at vs start_datetime in last 7 days (>= ${startDateStr}):`);

  // 1. By start_datetime
  const { count: countStart, data: dataStart } = await supabase
    .from('tournament_history')
    .select('id, tournament_name, created_at, start_datetime', { count: 'exact' })
    .gte('start_datetime', startDateStr);
  console.log("Found by start_datetime:", countStart);
  if (dataStart) {
    dataStart.forEach(t => console.log(`  - ID: ${t.id}, Name: ${t.tournament_name}, Start: ${t.start_datetime}, Created: ${t.created_at}`));
  }

  // 2. By created_at
  const { count: countCreated, data: dataCreated } = await supabase
    .from('tournament_history')
    .select('id, tournament_name, created_at, start_datetime', { count: 'exact' })
    .gte('created_at', startDateStr);
  console.log("\nFound by created_at:", countCreated);
  if (dataCreated) {
    dataCreated.forEach(t => console.log(`  - ID: ${t.id}, Name: ${t.tournament_name}, Start: ${t.start_datetime}, Created: ${t.created_at}`));
  }
}
test();
