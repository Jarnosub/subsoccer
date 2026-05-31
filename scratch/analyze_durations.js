const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../backups/public_tracking_latest.json');
console.log(`Reading database data from: ${dataPath}`);

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Filter only game_finished events
const finishedGames = data.filter(d => d.event_type === 'game_finished');
console.log(`Total 'game_finished' events in tracking: ${finishedGames.length}`);

const gamesWithDuration = finishedGames.filter(d => d.session_duration !== null && d.session_duration !== undefined);
console.log(`Games containing 'session_duration': ${gamesWithDuration.length}`);

if (gamesWithDuration.length === 0) {
    console.log("No game duration data found.");
    process.exit(0);
}

const durations = gamesWithDuration.map(d => Number(d.session_duration)).sort((a, b) => a - b);

// Basic Statistics
const min = durations[0];
const max = durations[durations.length - 1];
const sum = durations.reduce((a, b) => a + b, 0);
const avg = sum / durations.length;
const median = durations[Math.floor(durations.length / 2)];

console.log("\n=== ALL GAMES STATS (No filtering) ===");
console.log(`Min duration: ${min}s`);
console.log(`Max duration: ${max}s (${(max/60).toFixed(1)}m)`);
console.log(`Average duration: ${avg.toFixed(1)}s (${Math.floor(avg/60)}m ${Math.round(avg%60)}s)`);
console.log(`Median duration: ${median}s`);

// Distribution bins
const bins = [
    { name: '< 15s', test: (v) => v < 15 },
    { name: '15s - 29s', test: (v) => v >= 15 && v < 30 },
    { name: '30s - 59s', test: (v) => v >= 30 && v < 60 },
    { name: '1m - 1m 59s', test: (v) => v >= 60 && v < 120 },
    { name: '2m - 2m 59s', test: (v) => v >= 120 && v < 180 },
    { name: '3m - 3m 59s', test: (v) => v >= 180 && v < 240 },
    { name: '4m - 4m 59s', test: (v) => v >= 240 && v < 300 },
    { name: '5m - 9m 59s', test: (v) => v >= 300 && v < 600 },
    { name: '10m - 29m 59s', test: (v) => v >= 600 && v < 1800 },
    { name: '>= 30m', test: (v) => v >= 1800 }
];

console.log("\n=== FREQUENCY DISTRIBUTION ===");
bins.forEach(bin => {
    const count = durations.filter(bin.test).length;
    const percentage = ((count / durations.length) * 100).toFixed(1);
    console.log(`${bin.name.padEnd(15)}: ${count.toString().padStart(4)} games (${percentage}%)`);
});

// Compare filtering strategies
console.log("\n=== FILTERING STRATEGY COMPARISON ===");

const strategies = [
    {
        name: "Original (> 15s & < 1h)",
        test: (v) => v > 15 && v < 3600
    },
    {
        name: "Previous user request (30s to 5m)",
        test: (v) => v >= 30 && v <= 300
    },
    {
        name: "User estimate (1m to 5m)",
        test: (v) => v >= 60 && v <= 300
    },
    {
        name: "Intermediate (45s to 5m)",
        test: (v) => v >= 45 && v <= 300
    },
    {
        name: "Tight range (30s to 4m)",
        test: (v) => v >= 30 && v <= 240
    },
    {
        name: "Intermediate (45s to 4m)",
        test: (v) => v >= 45 && v <= 240
    }
];

strategies.forEach(strat => {
    const filtered = durations.filter(strat.test);
    const count = filtered.length;
    const pctKept = ((count / durations.length) * 100).toFixed(1);
    
    if (count > 0) {
        const sSum = filtered.reduce((a, b) => a + b, 0);
        const sAvg = sSum / count;
        const sMins = Math.floor(sAvg / 60);
        const sSecs = Math.round(sAvg % 60);
        
        console.log(`${strat.name.padEnd(35)} -> Avg: ${sMins}m ${sSecs}s (${sAvg.toFixed(1)}s) | Kept: ${count} (${pctKept}%)`);
    } else {
        console.log(`${strat.name.padEnd(35)} -> No games matched.`);
    }
});
