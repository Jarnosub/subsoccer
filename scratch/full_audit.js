const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const client = createClient(SUPA_URL, SUPA_KEY);

async function run() {
    console.log("=== STARTING DEEP AUDIT ===");

    // 1. Fetch public tracking data
    let allTracking = [];
    let page = 0;
    const pageSize = 1000;
    while (page < 30) { // Fetch up to 30,000 rows
        const { data: pageData, error } = await client
            .from('public_tracking')
            .select('*')
            .order('client_time', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error(error);
            break;
        }
        if (!pageData || pageData.length === 0) break;
        allTracking.push(...pageData);
        if (pageData.length < pageSize) break;
        page++;
    }
    console.log(`Loaded ${allTracking.length} tracking records.`);

    // 2. Fetch players table
    const { data: players, error: playersErr } = await client
        .from('players')
        .select('username, elo, wins, losses');
    if (playersErr) {
        console.error("Error fetching players:", playersErr);
    } else {
        console.log(`Loaded ${players.length} players.`);
    }

    // --- AUDIT 1: PLAYER-WISE GAME DISTRIBUTION ---
    console.log("\n--- Audit 1: Player-Wise Game Distribution (Sessions) ---");
    // Since session_id can be null (anonymous guests), let's track session counts.
    // Let's also track active session ids that have finished games.
    const gameCounts = {};
    const finishedGames = allTracking.filter(t => t.event_type === 'game_finished');
    
    let anonymousCount = 0;
    finishedGames.forEach(g => {
        if (!g.session_id) {
            anonymousCount++;
        } else {
            gameCounts[g.session_id] = (gameCounts[g.session_id] || 0) + 1;
        }
    });

    const activeSessions = Object.values(gameCounts);
    
    const dist = {
        only_1_game: activeSessions.filter(c => c === 1).length,
        games_2_to_5: activeSessions.filter(c => c >= 2 && c <= 5).length,
        games_6_to_10: activeSessions.filter(c => c >= 6 && c <= 10).length,
        games_10_plus: activeSessions.filter(c => c > 10).length,
        games_100_plus: activeSessions.filter(c => c > 100).length
    };
    
    console.log(`Unique sessions (logged-in/tracked): ${activeSessions.length}`);
    console.log(`- Sessions with 1 game: ${dist.only_1_game}`);
    console.log(`- Sessions with 2-5 games: ${dist.games_2_to_5}`);
    console.log(`- Sessions with 6-10 games: ${dist.games_6_to_10}`);
    console.log(`- Sessions with 10+ games: ${dist.games_10_plus}`);
    console.log(`- Sessions with 100+ games: ${dist.games_100_plus}`);
    console.log(`- Anonymous guest games (no session cookie / private browsing): ${anonymousCount}`);

    // Check outliers in session plays
    const sortedSessions = Object.entries(gameCounts).sort((a,b) => b[1]-a[1]);
    if (sortedSessions.length > 0) {
        console.log("Top active sessions (outliers):");
        sortedSessions.slice(0, 5).forEach(([sess, count]) => {
            const sample = finishedGames.find(g => g.session_id === sess);
            console.log(`  - Session ${sess.slice(0,8)}... played ${count} games | Location: ${sample?.location || 'Unknown'} | UA: ${sample?.user_agent ? sample.user_agent.slice(0, 50) : 'N/A'}`);
        });
    }

    // --- AUDIT 2: GEOGRAPHIC DISTRIBUTION ---
    console.log("\n--- Audit 2: Geographic Distribution (Organic check) ---");
    const countryCounts = {};
    const parseCountry = (loc) => {
        if (!loc) return 'Unknown';
        const match = loc.match(/(?:\s|,|^)([A-Z]{2})(?:\s|\(|$)/);
        return match ? match[1] : 'Unknown';
    };

    finishedGames.forEach(g => {
        const country = parseCountry(g.location);
        countryCounts[country] = (countryCounts[country] || 0) + 1;
    });

    const sortedCountries = Object.entries(countryCounts).sort((a,b) => b[1]-a[1]);
    const totalFinished = finishedGames.length;
    console.log("Country distribution of finished games:");
    sortedCountries.forEach(([country, count]) => {
        console.log(`  - ${country}: ${count} games (${((count / totalFinished)*100).toFixed(1)}%)`);
    });

    // --- AUDIT 3: HOUR-OF-DAY DISTRIBUTION ---
    console.log("\n--- Audit 3: Hour-of-Day Distribution ---");
    const hourCounts = Array(24).fill(0);
    allTracking.forEach(t => {
        if (t.client_time) {
            const date = new Date(t.client_time);
            const hour = date.getUTCHours(); // Use UTC or local, let's group by client_time UTC hour
            hourCounts[hour]++;
        }
    });

    console.log("Activity counts by Hour of Day (UTC):");
    for (let h = 0; h < 24; h++) {
        const count = hourCounts[h];
        const bar = "*".repeat(Math.min(50, Math.round((count / allTracking.length) * 500)));
        console.log(`  - ${h.toString().padStart(2, '0')}h: ${count.toString().padStart(4, ' ')} actions | ${bar}`);
    }

    // --- AUDIT 4: WIN RATIOS ---
    console.log("\n--- Audit 4: Registered Player Win Ratios ---");
    if (players && players.length > 0) {
        const activePlayers = players.filter(p => (p.wins + p.losses) >= 10);
        console.log(`Active players with 10+ games: ${activePlayers.length}`);
        
        const winRates = activePlayers.map(p => {
            const total = p.wins + p.losses;
            const rate = p.wins / total;
            return {
                username: p.username,
                elo: p.elo,
                wins: p.wins,
                losses: p.losses,
                total: total,
                rate: rate
            };
        });

        // Sort by win rate descending
        const topWinners = [...winRates].sort((a,b) => b.rate - a.rate);
        console.log("\nTop players by Win Rate:");
        topWinners.slice(0, 10).forEach(p => {
            console.log(`  - ${p.username.padEnd(20)} | Win Rate: ${(p.rate * 100).toFixed(1)}% | Record: ${p.wins}W - ${p.losses}L | ELO: ${p.elo}`);
        });

        const suspiciousWinners = winRates.filter(p => p.rate >= 0.90 && p.total >= 20);
        console.log(`\nSuspicious players (90%+ win rate with 20+ games): ${suspiciousWinners.length}`);
        suspiciousWinners.forEach(p => {
            console.log(`  - WARNING: ${p.username} has a ${(p.rate * 100).toFixed(1)}% win rate (${p.wins}W - ${p.losses}L)`);
        });
    } else {
        console.log("No player data available.");
    }
}

run();
