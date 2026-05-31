const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const tables = ['matches', 'events', 'event_registrations', 'games', 'teams'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`Error ${table}:`, error.message);
    } else if (data && data.length > 0) {
      console.log(`Table '${table}' columns:`, Object.keys(data[0]));
    } else {
      console.log(`Table '${table}' has no rows to inspect columns.`);
    }
  }
}
test();
