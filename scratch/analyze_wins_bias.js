const { createClient } = require('@supabase/supabase-js');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

// Helper to parse city and check if it is Finland
function isFinland(locationStr) {
    if (!locationStr) return false;
    const loc = locationStr.toLowerCase();
    
    // Check new format "Espoo, FI"
    if (loc.includes('fi')) return true;
    
    // Check old format "Europe/Helsinki" or "Europe/Espoo"
    if (loc.includes('helsinki') || loc.includes('espoo') || loc.includes('tampere') || loc.includes('finland')) return true;
    
    return false;
}

async function analyzeWins() {
    console.log("Fetching game finished events from Supabase...");
    
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: pageData } = await supabase
            .from('public_tracking')
            .select('client_time, location, event_type, match_score')
            .eq('event_type', 'game_finished')
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (!pageData || pageData.length === 0) {
            hasMore = false;
        } else {
            allRecords = allRecords.concat(pageData);
            page++;
            if (pageData.length < pageSize) {
                hasMore = false;
            }
        }
    }
    
    console.log(`Fetched total ${allRecords.length} game finished records.`);
    
    // Stats accumulators
    const stats = {
        global: { p1: 0, p2: 0, draw: 0, scores: {} },
        finland: { p1: 0, p2: 0, draw: 0, scores: {} },
        international: { p1: 0, p2: 0, draw: 0, scores: {} }
    };
    
    allRecords.forEach(r => {
        const score = r.match_score;
        if (!score || !score.includes('-')) return;
        
        const parts = score.split('-');
        const s1 = parseInt(parts[0]);
        const s2 = parseInt(parts[1]);
        if (isNaN(s1) || isNaN(s2)) return;
        
        const isFI = isFinland(r.location);
        const group = isFI ? 'finland' : 'international';
        
        // Determine winner
        let winner = 'draw';
        if (s1 > s2) winner = 'p1';
        else if (s2 > s1) winner = 'p2';
        
        // Increment global
        stats.global[winner]++;
        stats.global.scores[score] = (stats.global.scores[score] || 0) + 1;
        
        // Increment group (finland or international)
        stats[group][winner]++;
        stats[group].scores[score] = (stats[group].scores[score] || 0) + 1;
    });
    
    console.log("\n==========================================");
    console.log("PLAYER 1 VS PLAYER 2 WIN RATIO ANALYSIS");
    console.log("==========================================");
    
    const printStats = (title, data) => {
        const total = data.p1 + data.p2 + data.draw;
        if (total === 0) {
            console.log(`\n--- ${title} (No games) ---`);
            return;
        }
        const p1Pct = ((data.p1 / total) * 100).toFixed(1);
        const p2Pct = ((data.p2 / total) * 100).toFixed(1);
        
        console.log(`\n--- ${title} (${total} games) ---`);
        console.log(`  Player 1 (Left/Score Button 1) Wins: ${data.p1} (${p1Pct}%)`);
        console.log(`  Player 2 (Right/Score Button 2) Wins: ${data.p2} (${p2Pct}%)`);
        
        // Print top 3 scores
        const sortedScores = Object.entries(data.scores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
            
        console.log("  Top Scores:");
        sortedScores.forEach(([sc, count]) => {
            console.log(`    - ${sc}: ${count}x (${((count / total) * 100).toFixed(1)}%)`);
        });
    };
    
    printStats("GLOBAL DATA", stats.global);
    printStats("FINNISH DATA (Includes developer testing)", stats.finland);
    printStats("INTERNATIONAL DATA (Real games in wild)", stats.international);
    
    console.log("\n🕵️ ANALYSIS ANALYSIS:");
    const fiRatio = stats.finland.p1 / stats.finland.p2;
    const intlRatio = stats.international.p1 / stats.international.p2;
    console.log(`  - Finland Win Bias (P1/P2): ${fiRatio.toFixed(2)} (P1 wins ${fiRatio.toFixed(1)}x more than P2)`);
    console.log(`  - International Win Bias  : ${intlRatio.toFixed(2)} (P1 wins ${intlRatio.toFixed(1)}x more than P2)`);
}

analyzeWins();
