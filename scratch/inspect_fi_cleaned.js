const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../backups/public_tracking_latest.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Filter game_finished events
const finishedGames = data.filter(d => d.event_type === 'game_finished');

function isFinland(locationStr) {
    if (!locationStr) return false;
    const loc = locationStr.toLowerCase();
    if (loc.includes('fi')) return true;
    if (loc.includes('helsinki') || loc.includes('espoo') || loc.includes('tampere') || loc.includes('finland')) return true;
    return false;
}

const fiGames = finishedGames.filter(g => isFinland(g.location));
const cleanedFiGames = fiGames.filter(g => g.session_duration >= 30 && g.session_duration <= 300);

console.log(`Total raw Finnish games      : ${fiGames.length}`);
console.log(`Total cleaned Finnish games  : ${cleanedFiGames.length}`);

// Group by user agent
const uaStats = {};
cleanedFiGames.forEach(g => {
    const ua = g.user_agent || 'Unknown UA';
    if (!uaStats[ua]) {
        uaStats[ua] = { total: 0, p1: 0, p2: 0, average_duration: 0, durations: [] };
    }
    uaStats[ua].total++;
    const score = g.match_score || '';
    const parts = score.split('-');
    const s1 = parseInt(parts[0]);
    const s2 = parseInt(parts[1]);
    if (!isNaN(s1) && !isNaN(s2)) {
        if (s1 > s2) uaStats[ua].p1++;
        else if (s2 > s1) uaStats[ua].p2++;
    }
    if (g.session_duration) {
        uaStats[ua].durations.push(g.session_duration);
    }
});

console.log("\n==========================================");
console.log("FINNISH CLEANED GAMES USER AGENT BREAKDOWN");
console.log("==========================================");

Object.entries(uaStats)
    .sort((a,b) => b[1].total - a[1].total)
    .forEach(([ua, stats]) => {
        const avgDur = stats.durations.reduce((a,b)=>a+b, 0) / stats.total;
        console.log(`\nUser Agent: "${ua.substring(0, 100)}..."`);
        console.log(`  Total Games: ${stats.total}`);
        console.log(`  P1 Wins    : ${stats.p1} (${((stats.p1/stats.total)*100).toFixed(1)}%)`);
        console.log(`  P2 Wins    : ${stats.p2} (${((stats.p2/stats.total)*100).toFixed(1)}%)`);
        console.log(`  Avg Duration: ${avgDur.toFixed(1)}s`);
    });
