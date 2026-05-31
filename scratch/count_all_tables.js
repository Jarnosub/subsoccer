const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const tables = [
    'public_tracking',
    'tournament_history',
    'players',
    'matches',
    'events',
    'event_registrations',
    'event_moderators',
    'games',
    'feedback',
    'teams'
  ];

  console.log("Checking row counts for all tables in Supabase...");
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error(`  Error counting ${table}:`, error.message);
    } else {
      console.log(`  Table '${table}': ${count} rows`);
    }
  }
}
test();
