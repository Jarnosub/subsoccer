const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const { data, error } = await supabase
    .from('public_tracking')
    .select('*')
    .order('client_time', { ascending: false })
    .limit(10000);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Total rows fetched:", data.length);
  
  const daysMap = {};
  data.forEach(d => {
    const dateObj = new Date(d.client_time || new Date());
    const dateKey = ('0' + dateObj.getDate()).slice(-2) + '/' + ('0' + (dateObj.getMonth() + 1)).slice(-2);
    daysMap[dateKey] = (daysMap[dateKey] || 0) + 1;
  });

  const labels = Object.keys(daysMap).reverse();
  console.log("Total labels generated:", labels.length);
  console.log("First 10 labels:", labels.slice(0, 10));
  console.log("Last 10 labels:", labels.slice(-10));
}
test();
