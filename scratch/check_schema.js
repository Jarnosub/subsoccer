const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const { data, error } = await supabase.from('games').select('*').limit(20);
  if (error) {
    console.error("Error fetching games:", error);
  } else {
    console.log("Registered games/tables:", data.map(g => ({
      id: g.id,
      game_name: g.game_name,
      serial_number: g.serial_number,
      is_public: g.is_public,
      verified: g.verified
    })));
  }
}
test();
