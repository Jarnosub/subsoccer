const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function test() {
  const days = 7;
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - days);
  const startDateStr = pastDate.toISOString();

  console.log(`Checking counts with startDateStr = ${startDateStr} (last 7 days)`);

  // 1. tournament_history
  let historyQuery = supabase.from('tournament_history').select('*', { count: 'exact' });
  historyQuery = historyQuery.gte('start_datetime', startDateStr);
  const { count: histCount7, data: histData7 } = await historyQuery;
  console.log("tournament_history (last 7 days):", histCount7 || (histData7 ? histData7.length : 0));

  // 2. public_tracking
  let trackingQuery = supabase.from('public_tracking').select('*').order('client_time', { ascending: false }).limit(2000);
  trackingQuery = trackingQuery.gte('client_time', startDateStr);
  const { data: trackingData7 } = await trackingQuery;
  const trackingTournaments7 = (trackingData7 || []).filter(d => d.event_type === 'tournament_finished').length;
  console.log("public_tracking tournament_finished (last 7 days, limit 2000):", trackingTournaments7);

  // 30 days
  const pastDate30 = new Date();
  pastDate30.setDate(pastDate30.getDate() - 30);
  const startDateStr30 = pastDate30.toISOString();
  
  let historyQuery30 = supabase.from('tournament_history').select('*', { count: 'exact' });
  historyQuery30 = historyQuery30.gte('start_datetime', startDateStr30);
  const { count: histCount30 } = await historyQuery30;
  console.log("tournament_history (last 30 days):", histCount30);

  let trackingQuery30 = supabase.from('public_tracking').select('*').order('client_time', { ascending: false }).limit(2000);
  trackingQuery30 = trackingQuery30.gte('client_time', startDateStr30);
  const { data: trackingData30 } = await trackingQuery30;
  const trackingTournaments30 = (trackingData30 || []).filter(d => d.event_type === 'tournament_finished').length;
  console.log("public_tracking tournament_finished (last 30 days, limit 2000):", trackingTournaments30);

  // All time (startDateStr = null)
  let historyQueryAll = supabase.from('tournament_history').select('*', { count: 'exact' });
  const { count: histCountAll } = await historyQueryAll;
  console.log("tournament_history (all time):", histCountAll);

  let trackingQueryAll = supabase.from('public_tracking').select('*').order('client_time', { ascending: false }).limit(2000);
  const { data: trackingDataAll } = await trackingQueryAll;
  const trackingTournamentsAll = (trackingDataAll || []).filter(d => d.event_type === 'tournament_finished').length;
  console.log("public_tracking tournament_finished (all time, limit 2000):", trackingTournamentsAll);
  
  // What is the total count of tournament_finished in public_tracking without limit?
  const { count: trackingTournamentsAllNoLimit } = await supabase.from('public_tracking').select('*', { count: 'exact', head: true }).eq('event_type', 'tournament_finished');
  console.log("public_tracking tournament_finished (all time, no limit):", trackingTournamentsAllNoLimit);
}
test();
