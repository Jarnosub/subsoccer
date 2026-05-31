const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

// Helper to parse city from old and new location format
function parseCity(locationStr) {
    if (!locationStr || locationStr === 'Unknown') return null;
    
    // New format: "Espoo, FI (Europe/Helsinki)"
    if (locationStr.includes('(')) {
        const commaIndex = locationStr.indexOf(',');
        if (commaIndex > -1) {
            return locationStr.substring(0, commaIndex).trim().replace(/_/g, ' ');
        }
        const parenIndex = locationStr.indexOf('(');
        return locationStr.substring(0, parenIndex).trim().replace(/_/g, ' ');
    }
    
    // Old format: "Europe/Espoo"
    const parts = locationStr.split('/');
    return parts.length > 1 ? parts[parts.length - 1].replace(/_/g, ' ').trim() : locationStr.trim();
}

async function exportNewCities() {
    console.log("Fetching telemetry data from Supabase...");
    
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
            .from('public_tracking')
            .select('client_time, location')
            .not('location', 'is', null)
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
    
    console.log(`Fetched total ${allRecords.length} records with location.`);
    
    // Find the first seen date for each unique city
    const cityFirstSeen = {};
    
    allRecords.forEach(r => {
        if (!r.client_time) return;
        const city = parseCity(r.location);
        if (!city || city === 'Unknown') return;
        
        const dateStr = r.client_time.split('T')[0]; // Format: YYYY-MM-DD
        const timeVal = new Date(dateStr).getTime();
        
        if (!cityFirstSeen[city] || timeVal < cityFirstSeen[city].time) {
            cityFirstSeen[city] = { dateStr, time: timeVal };
        }
    });
    
    const uniqueCitiesList = Object.keys(cityFirstSeen);
    console.log(`Identified ${uniqueCitiesList.length} unique cities.`);
    
    // Group first-seen events by date
    const dailyNewCities = {};
    uniqueCitiesList.forEach(city => {
        const dateStr = cityFirstSeen[city].dateStr;
        dailyNewCities[dateStr] = (dailyNewCities[dateStr] || 0) + 1;
    });
    
    // Get all unique sorted dates
    const allDates = allRecords
        .map(r => r.client_time ? r.client_time.split('T')[0] : null)
        .filter(Boolean);
    const sortedDates = [...new Set(allDates)].sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];
    
    console.log(`Date range: ${startDate} to ${endDate}`);
    
    // Generate daily and cumulative counts
    let cumulativeCount = 0;
    let dailyCSV = "unique_id,ds,y\n";
    let cumulativeCSV = "unique_id,ds,y\n";
    
    sortedDates.forEach(date => {
        const newCitiesToday = dailyNewCities[date] || 0;
        cumulativeCount += newCitiesToday;
        
        dailyCSV += `new_cities_rate,${date},${newCitiesToday}\n`;
        cumulativeCSV += `cities_cumulative,${date},${cumulativeCount}\n`;
    });
    
    const dailyFilePath = path.join(__dirname, 'subsoccer_new_cities_daily.csv');
    const cumulativeFilePath = path.join(__dirname, 'subsoccer_new_cities_cumulative.csv');
    
    fs.writeFileSync(dailyFilePath, dailyCSV, 'utf-8');
    fs.writeFileSync(cumulativeFilePath, cumulativeCSV, 'utf-8');
    
    console.log(`\nSaved daily new cities count to: ${dailyFilePath}`);
    console.log(`Saved cumulative unique cities count to: ${cumulativeFilePath}`);
    console.log(`Total cities reached by end of period: ${cumulativeCount}`);
}

exportNewCities();
