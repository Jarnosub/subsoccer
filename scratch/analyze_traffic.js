const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function checkEvents() {
  const fourDaysAgo = new Date("2026-05-22T00:00:00Z");

  console.log("Fetching recent tournaments...");
  const { data: tournaments, error: tourError } = await supabase
    .from('tournament_history')
    .select('*, events(event_name)')
    .gte('created_at', fourDaysAgo.toISOString());

  if (tourError) {
    console.error("Error fetching tournaments:", tourError);
  } else {
    console.log(`Recent tournaments (${tournaments.length}):`, tournaments.map(t => ({
      id: t.id,
      tournament_name: t.tournament_name,
      winner_name: t.winner_name,
      second_place_name: t.second_place_name,
      created_at: t.created_at,
      event_name: t.events?.event_name || t.event_name
    })));
  }

  console.log("\nFetching recent events...");
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('*')
    .gte('created_at', fourDaysAgo.toISOString());

  if (eventError) {
    console.error("Error fetching events:", eventError);
  } else {
    console.log(`Recent events (${events.length}):`, events.map(e => ({
      id: e.id,
      event_name: e.event_name,
      event_type: e.event_type,
      location: e.location,
      created_at: e.created_at,
      status: e.status
    })));
  }
}
checkEvents();
