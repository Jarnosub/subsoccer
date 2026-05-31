const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

// Load local hardware sheet if available
function loadHardwareSheet() {
    const csvPath = path.join(__dirname, '../Subsoccer_sarjanumerot_Subsoccer_Dock.csv');
    if (!fs.existsSync(csvPath)) {
        return [];
    }
    
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',');
    
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split(',');
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h.trim()] = cols[idx] ? cols[idx].trim() : '';
        });
        records.push(obj);
    }
    return records;
}

async function inspectGameCodes() {
    console.log("Loading telemetry game codes from Supabase...");
    
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: pageData } = await supabase
            .from('public_tracking')
            .select('game_code, location, event_type')
            .not('game_code', 'is', null)
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
    
    console.log(`Fetched total ${allRecords.length} records.`);
    
    // Group by game_code
    const codeCounts = {};
    const codeLocations = {};
    
    allRecords.forEach(r => {
        const code = (r.game_code || '').toUpperCase().trim();
        // Skip generic ones
        if (['PUBLIC-APP', 'QUICK-PLAY', 'MOBILE-TOURNAMENT', 'N/A', 'UNKNOWN'].includes(code)) return;
        
        codeCounts[code] = (codeCounts[code] || 0) + 1;
        
        if (!codeLocations[code]) codeLocations[code] = {};
        if (r.location && r.location !== 'Unknown') {
            codeLocations[code][r.location] = (codeLocations[code][r.location] || 0) + 1;
        }
    });
    
    const activeCodes = Object.entries(codeCounts)
        .sort((a, b) => b[1] - a[1]);
        
    console.log(`\nIdentified ${activeCodes.length} active custom game codes (serial numbers) in telemetry.`);
    
    // Load local hardware registry sheet
    const hardwareSheet = loadHardwareSheet();
    console.log(`Loaded ${hardwareSheet.length} records from Subsoccer_sarjanumerot_Subsoccer_Dock.csv.`);
    
    console.log("\n==========================================");
    console.log("MOST ACTIVE PHYSICAL SUBSOCCER TABLES");
    console.log("==========================================");
    
    activeCodes.slice(0, 30).forEach(([code, count], idx) => {
        // Look up in hardware sheet
        // Check if serial number matches the code
        const matched = hardwareSheet.find(h => {
            const sn = (h['Sarjanumero'] || h['serial_number'] || '').toUpperCase();
            return sn.includes(code) || code.includes(sn);
        });
        
        const info = matched 
            ? `Client: "${matched['Asiakas'] || matched['client'] || 'N/A'}" | Model: "${matched['Tuote'] || matched['product'] || 'N/A'}"`
            : "No match in shipped hardware CSV";
            
        // Top location
        const locs = Object.entries(codeLocations[code] || {})
            .sort((a, b) => b[1] - a[1]);
        const topLoc = locs.length > 0 ? `${locs[0][0]} (${locs[0][1]}x)` : 'Unknown';
        
        console.log(`  ${idx+1}. Code: "${code}" (${count} events)`);
        console.log(`     - Location: ${topLoc}`);
        console.log(`     - Registry: ${info}`);
    });
}

inspectGameCodes();
