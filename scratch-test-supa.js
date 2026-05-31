const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  console.log("Connecting to Supabase...");
  const { data, error } = await supabase.from('public_tracking').select('id, event_type, browser_lang').not('browser_lang', 'is', null).limit(10);
  if (error) {
    console.error("Error fetching public_tracking:", error);
  } else {
    console.log("Successfully fetched tracking:", data);
  }
}
test();
