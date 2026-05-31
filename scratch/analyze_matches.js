const fs = require('fs');
const path = require('path');

const matchesFile = path.join(__dirname, '../backups/matches_latest.json');
const playersFile = path.join(__dirname, '../backups/players_latest.json');

if (!fs.existsSync(matchesFile)) {
    console.error("Matches file not found at:", matchesFile);
    process.exit(1);
}

const matches = JSON.parse(fs.readFileSync(matchesFile, 'utf8'));
const players = fs.existsSync(playersFile) ? JSON.parse(fs.readFileSync(playersFile, 'utf8')) : [];

console.log(`Analyzing ${matches.length} total matches from backups...`);
console.log(`Registered players in backups: ${players.length}`);

// 1. Analyze Player Names in Matches
const allPlayerNames = new Set();
const playerFrequencies = {};

matches.forEach(m => {
    if (m.player1) {
        allPlayerNames.add(m.player1);
        playerFrequencies[m.player1] = (playerFrequencies[m.player1] || 0) + 1;
    }
    if (m.player2) {
        allPlayerNames.add(m.player2);
        playerFrequencies[m.player2] = (playerFrequencies[m.player2] || 0) + 1;
    }
});

console.log(`Total unique player names in matches: ${allPlayerNames.size}`);

// Print top active players
console.log("\n🔝 TOP 20 MOST ACTIVE PLAYER NAMES IN MATCH HISTORY:");
Object.entries(playerFrequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, count]) => {
        console.log(`  - [${count}x matches] ${name}`);
    });

// 2. Analyze Tournament names
const tournamentCounts = {};
matches.forEach(m => {
    const t = m.tournament_name || 'None';
    tournamentCounts[t] = (tournamentCounts[t] || 0) + 1;
});

console.log("\n🏆 TOP TOURNAMENTS/SESSIONS:");
Object.entries(tournamentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([t, count]) => {
        console.log(`  - [${count}x matches] ${t}`);
    });

// 3. Find matches with game_id (verified tables)
let verifiedCount = 0;
const gameIdDistribution = {};
matches.forEach(m => {
    if (m.game_id) {
        verifiedCount++;
        gameIdDistribution[m.game_id] = (gameIdDistribution[m.game_id] || 0) + 1;
    }
});

console.log(`\nVerified matches: ${verifiedCount} / ${matches.length} (${((verifiedCount/matches.length)*100).toFixed(1)}%)`);
console.log("Game ID Distribution (Top 10):");
Object.entries(gameIdDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([gId, count]) => {
        console.log(`  - [${count}x matches] ${gId}`);
    });

// 4. Check for default names "PLAYER 1" vs "PLAYER 2" or "GUEST" vs "GUEST"
let defaultVSDefault = 0;
let defaultVSReal = 0;
let realVSReal = 0;

const defaultNames = ['PLAYER 1', 'PLAYER 2', 'GUEST', 'PELAAJA 1', 'PELAAJA 2', 'PLAYER', 'PELAAJA'];

matches.forEach(m => {
    const p1Default = defaultNames.includes(m.player1);
    const p2Default = defaultNames.includes(m.player2);
    
    if (p1Default && p2Default) {
        defaultVSDefault++;
    } else if (p1Default || p2Default) {
        defaultVSReal++;
    } else {
        realVSReal++;
    }
});

console.log("\n🎭 PLAYER NAME STYLES:");
console.log(`  - Default vs Default (e.g. PLAYER 1 vs PLAYER 2): ${defaultVSDefault} (${((defaultVSDefault/matches.length)*100).toFixed(1)}%)`);
console.log(`  - Default vs Custom (e.g. PLAYER 1 vs MATTI): ${defaultVSReal} (${((defaultVSReal/matches.length)*100).toFixed(1)}%)`);
console.log(`  - Custom vs Custom (e.g. JONNE vs PEKKA): ${realVSReal} (${((realVSReal/matches.length)*100).toFixed(1)}%)`);

// Let's print some custom vs custom examples
console.log("\nSome custom player match examples:");
const customMatches = matches.filter(m => !defaultNames.includes(m.player1) && !defaultNames.includes(m.player2));
customMatches.slice(0, 15).forEach(m => {
    console.log(`  - ${m.player1} vs ${m.player2} (Winner: ${m.winner}) | Score: ${m.player1_score}-${m.player2_score} | Tournament: ${m.tournament_name}`);
});
