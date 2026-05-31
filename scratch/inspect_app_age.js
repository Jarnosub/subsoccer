const { createClient } = require('@supabase/supabase-js');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

async function inspectAppAge() {
    console.log("Inspecting database to find the earliest records...");
    
    // 1. Earliest public_tracking event
    const { data: tracking } = await supabase
        .from('public_tracking')
        .select('client_time, created_at')
        .order('client_time', { ascending: true })
        .limit(1);
        
    // 2. Earliest player profile
    const { data: players } = await supabase
        .from('players')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);
        
    // 3. Earliest game registration
    const { data: games } = await supabase
        .from('games')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);
        
    // 4. Earliest tournament record
    const { data: tournaments } = await supabase
        .from('tournament_history')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);

    console.log("\n==========================================");
    console.log("APPLICATION AGE & HISTORICAL TIMELINE");
    console.log("==========================================");
    
    if (players && players[0]) {
        console.log(`- Earliest Player Registered   : ${new Date(players[0].created_at).toLocaleDateString('fi-FI')} (${players[0].created_at})`);
    } else {
        console.log("- Earliest Player Registered   : No data");
    }
    
    if (games && games[0]) {
        console.log(`- Earliest Game Table Created  : ${new Date(games[0].created_at).toLocaleDateString('fi-FI')} (${games[0].created_at})`);
    } else {
        console.log("- Earliest Game Table Created  : No data");
    }
    
    if (tournaments && tournaments[0]) {
        console.log(`- Earliest Tournament Recorded : ${new Date(tournaments[0].created_at).toLocaleDateString('fi-FI')} (${tournaments[0].created_at})`);
    } else {
        console.log("- Earliest Tournament Recorded : No data");
    }
    
    if (tracking && tracking[0]) {
        const time = tracking[0].client_time || tracking[0].created_at;
        console.log(`- Earliest Telemetry Log (QR)  : ${new Date(time).toLocaleDateString('fi-FI')} (${time})`);
    } else {
        console.log("- Earliest Telemetry Log (QR)  : No data");
    }
    
    // Calculate total days
    if (players && players[0]) {
        const firstDate = new Date(players[0].created_at);
        const now = new Date();
        const diffDays = Math.floor((now - firstDate) / (1000 * 60 * 60 * 24));
        console.log(`\nApp Age: The database has been active for approximately ${diffDays} days (~${(diffDays/30).toFixed(1)} months).`);
    }
}

inspectAppAge();
