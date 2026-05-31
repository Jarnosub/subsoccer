const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

// Helper to parse city from old location format
function extractCity(loc) {
    if (!loc || loc === 'Unknown') return 'Unknown';
    const parts = loc.split('/');
    const city = parts.length > 1 ? parts[parts.length - 1].replace(/_/g, ' ') : loc;
    return city.trim();
}

async function exportData() {
    console.log("Fetching telemetry data from Supabase public_tracking...");
    
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
            .from('public_tracking')
            .select('client_time, location, event_type')
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (pageError) {
            console.error("Error paging data:", pageError);
            break;
        }
        
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
    
    // Filter for active game events
    const gameEvents = allRecords.filter(r => r.event_type === 'game_finished');
    console.log(`Filtered to ${gameEvents.length} 'game_finished' events.`);
    
    // 1. Global Daily Aggregation
    const globalDaily = {};
    // 2. City Daily Aggregation
    const cityDaily = {};
    
    gameEvents.forEach(r => {
        if (!r.client_time) return;
        const dateStr = r.client_time.split('T')[0]; // Format: YYYY-MM-DD
        const city = extractCity(r.location);
        
        // Global daily count
        globalDaily[dateStr] = (globalDaily[dateStr] || 0) + 1;
        
        // City daily count
        if (!cityDaily[city]) cityDaily[city] = {};
        cityDaily[city][dateStr] = (cityDaily[city][dateStr] || 0) + 1;
    });
    
    // Sort dates
    const allDates = Object.keys(globalDaily).sort();
    const startDate = allDates[0];
    const endDate = allDates[allDates.length - 1];
    console.log(`Date range: ${startDate} to ${endDate} (${allDates.length} unique dates with games)`);
    
    // Create global CSV: unique_id, ds, y
    let globalCSV = "unique_id,ds,y\n";
    allDates.forEach(date => {
        globalCSV += `global,${date},${globalDaily[date]}\n`;
    });
    
    const globalFilePath = path.join(__dirname, 'subsoccer_daily_games.csv');
    fs.writeFileSync(globalFilePath, globalCSV, 'utf-8');
    console.log(`\nSaved global daily games data to: ${globalFilePath}`);
    
    // Create city-level CSV: unique_id, ds, y
    let cityCSV = "unique_id,ds,y\n";
    // Filter to cities with at least 15 games total to keep it clean
    const activeCities = Object.entries(cityDaily)
        .map(([city, dates]) => {
            const total = Object.values(dates).reduce((a, b) => a + b, 0);
            return { city, dates, total };
        })
        .filter(c => c.total >= 15 && c.city !== 'Unknown')
        .sort((a, b) => b.total - a.total);
        
    console.log(`\nTop cities with >= 15 games:`);
    activeCities.forEach(c => {
        console.log(`- ${c.city}: ${c.total} games`);
        // Fill dates for active cities
        allDates.forEach(date => {
            const count = c.dates[date] || 0;
            // Commas in city names should be escaped or removed
            const cleanCityName = c.city.replace(/,/g, '');
            cityCSV += `${cleanCityName},${date},${count}\n`;
        });
    });
    
    const cityFilePath = path.join(__dirname, 'subsoccer_city_daily_games.csv');
    fs.writeFileSync(cityFilePath, cityCSV, 'utf-8');
    console.log(`Saved city-level daily games data to: ${cityFilePath}`);
}

exportData();
