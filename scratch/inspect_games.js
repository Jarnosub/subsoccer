const { createClient } = require('@supabase/supabase-js');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

async function inspectGames() {
    console.log("Fetching registered tables from the 'games' database table...");
    
    const { data: games, error } = await supabase
        .from('games')
        .select('*');
        
    if (error) {
        console.error("Error fetching games:", error);
        return;
    }
    
    console.log(`Fetched total ${games.length} registered games/tables.`);
    
    // Group and categorize based on game names and addresses
    console.log("\n==========================================");
    console.log("ANALYSIS OF REGISTERED SUBSOCCER TABLES");
    console.log("==========================================");
    
    let publicCount = 0;
    let verifiedCount = 0;
    const categories = {
        'School / University': 0,
        'Office / Workspace': 0,
        'Sport Club / Bar / Pub': 0,
        'Retail / Costco': 0,
        'Home / Private': 0,
        'Other / Unknown': 0
    };
    
    const keywords = {
        'School / University': ['koulu', 'skola', 'school', 'lukio', 'yliopisto', 'opisto', 'gymnasia', 'college', 'uni'],
        'Office / Workspace': ['toimisto', 'office', 'hq', 'work', 'arena', 'lounge', 'studio'],
        'Sport Club / Bar / Pub': ['club', 'bar', 'pub', 'sports', 'seura', 'ry', 'ryhmä', 'areena', 'stadium', 'cafe', 'kahvila', 'ravintola'],
        'Retail / Costco': ['costco', 'retail', 'kauppa', 'store', 'showroom'],
        'Home / Private': ['koti', 'home', 'house', 'olohuone', 'garage', 'terassi', 'piha', 'villa', 'mökki']
    };
    
    games.forEach(g => {
        if (g.is_public) publicCount++;
        if (g.verified) verifiedCount++;
        
        const name = (g.game_name || '').toLowerCase();
        const loc = (g.location || '').toLowerCase();
        let categorized = false;
        
        for (const [cat, kws] of Object.entries(keywords)) {
            const matchesName = kws.some(kw => name.includes(kw));
            const matchesLoc = kws.some(kw => loc.includes(kw));
            
            if (matchesName || matchesLoc) {
                categories[cat]++;
                categorized = true;
                break;
            }
        }
        
        if (!categorized) {
            categories['Other / Unknown']++;
        }
    });
    
    console.log(`Publicly visible tables on map: ${publicCount}`);
    console.log(`Verified tables: ${verifiedCount}`);
    
    console.log("\nEstimated Venue Type Distribution:");
    Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
            console.log(`- ${cat.padEnd(25)}: ${count} tables (${((count / games.length) * 100).toFixed(1)}%)`);
        });
        
    console.log("\nTop 30 Registered Table Names and Locations:");
    games.slice(0, 30).forEach((g, idx) => {
        console.log(`  ${idx+1}. Name: "${g.game_name || 'N/A'}" | Loc: "${g.location || 'N/A'}" | Public: ${g.is_public} | Verified: ${g.verified}`);
    });
}

inspectGames();
