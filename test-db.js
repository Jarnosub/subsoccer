const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

async function check() {
  // Let's just list tables or do a dummy query
  console.log("Checking schema...");
}
check();
