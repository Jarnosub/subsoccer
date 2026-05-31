const { createClient } = require('@supabase/supabase-js');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

function parseCity(locationStr) {
    if (!locationStr || locationStr === 'Unknown') return null;
    
    if (locationStr.includes('(')) {
        const commaIndex = locationStr.indexOf(',');
        if (commaIndex > -1) {
            return locationStr.substring(0, commaIndex).trim().replace(/_/g, ' ');
        }
        const parenIndex = locationStr.indexOf('(');
        return locationStr.substring(0, parenIndex).trim().replace(/_/g, ' ');
    }
    
    const parts = locationStr.split('/');
    return parts.length > 1 ? parts[parts.length - 1].replace(/_/g, ' ').trim() : locationStr.trim();
}

async function checkSpike() {
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: pageData } = await supabase
            .from('public_tracking')
            .select('client_time, location')
            .not('location', 'is', null)
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
    
    const cityFirstSeen = {};
    allRecords.forEach(r => {
        if (!r.client_time) return;
        const city = parseCity(r.location);
        if (!city || city === 'Unknown') return;
        
        const dateStr = r.client_time.split('T')[0];
        const timeVal = new Date(dateStr).getTime();
        
        if (!cityFirstSeen[city] || timeVal < cityFirstSeen[city].time) {
            cityFirstSeen[city] = { dateStr, time: timeVal };
        }
    });
    
    // Print new cities by date for the last few days
    const spikeDates = ['2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'];
    
    spikeDates.forEach(date => {
        const newCities = Object.keys(cityFirstSeen).filter(city => cityFirstSeen[city].dateStr === date);
        console.log(`\nNew cities on ${date} (Count: ${newCities.length}):`);
        console.log(newCities.join(', '));
    });
}

checkSpike();
