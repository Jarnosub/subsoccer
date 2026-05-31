const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(_URL, _KEY);

// Timezone to Country Code mapping for historical compatibility
const TZ_TO_COUNTRY_CODE = {
    'Europe/Helsinki': 'FI', 'Europe/Prague': 'CZ', 'Europe/Madrid': 'ES',
    'Asia/Shanghai': 'CN', 'Asia/Jakarta': 'ID', 'Asia/Singapore': 'SG',
    'Europe/Berlin': 'DE', 'Europe/London': 'GB', 'Asia/Manila': 'PH',
    'Europe/Copenhagen': 'DK', 'America/New_York': 'US', 'Asia/Hong_Kong': 'HK',
    'Europe/Brussels': 'BE', 'America/Chicago': 'US', 'America/Los_Angeles': 'US',
    'America/Montevideo': 'UY', 'America/Denver': 'US', 'Europe/Paris': 'FR',
    'Europe/Warsaw': 'PL', 'Europe/Malta': 'MT', 'America/Bogota': 'CO',
    'Asia/Dubai': 'AE', 'Europe/Oslo': 'NO', 'Africa/Cairo': 'EG',
    'Europe/Sofia': 'BG', 'Asia/Baku': 'AZ', 'America/Sao_Paulo': 'BR',
    'Europe/Rome': 'IT', 'Asia/Calcutta': 'IN', 'America/Mazatlan': 'MX',
    'Europe/Istanbul': 'TR', 'Europe/Stockholm': 'SE', 'Europe/Dublin': 'IE',
    'UTC': 'GLOBAL', 'Europe/Zurich': 'CH', 'America/Detroit': 'US',
    'Africa/Nairobi': 'KE', 'America/Toronto': 'CA', 'America/Hermosillo': 'MX',
    'Europe/Lisbon': 'PT', 'Asia/Tokyo': 'JP', 'Europe/Amsterdam': 'NL',
    'Atlantic/Canary': 'ES', 'Africa/Accra': 'GH', 'Europe/Riga': 'LV',
    'America/Vancouver': 'CA', 'Europe/Kiev': 'UA', 'Africa/Luanda': 'AO',
    'Asia/Seoul': 'KR', 'Asia/Almaty': 'KZ', 'Asia/Beirut': 'LB',
    'Asia/Amman': 'JO', 'Africa/Lagos': 'NG', 'Asia/Taipei': 'TW',
    'Atlantic/Reykjavik': 'IS', 'America/Costa_Rica': 'CR', 'Asia/Saigon': 'VN',
    'America/Mexico_City': 'MX', 'Europe/Budapest': 'HU', 'Indian/Reunion': 'RE',
    'America/Indianapolis': 'US'
};

function parseCountry(locationStr) {
    if (!locationStr || locationStr === 'Unknown') return null;
    
    // New format: "Espoo, FI (Europe/Helsinki)"
    if (locationStr.includes('(')) {
        const commaIndex = locationStr.indexOf(',');
        if (commaIndex > -1) {
            const afterComma = locationStr.substring(commaIndex + 1).trim();
            const countryCode = afterComma.split(' ')[0].trim().toUpperCase();
            if (countryCode && countryCode.length === 2) {
                return countryCode;
            }
        }
    }
    
    // Old format: "Europe/Helsinki" - check timezone mapping
    const cleanTz = locationStr.trim();
    if (TZ_TO_COUNTRY_CODE[cleanTz]) {
        return TZ_TO_COUNTRY_CODE[cleanTz];
    }
    
    // Fallback: extract continent from timezone, e.g. "Europe" or "Asia"
    const continent = cleanTz.split('/')[0];
    if (['Europe', 'Asia', 'America', 'Africa', 'Australia', 'Pacific'].includes(continent)) {
        return continent.toUpperCase();
    }
    
    return null;
}

async function exportNewCountries() {
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
    
    // Track the first seen date for each country code
    const countryFirstSeen = {};
    
    allRecords.forEach(r => {
        if (!r.client_time) return;
        const country = parseCountry(r.location);
        if (!country || country === 'GLOBAL') return;
        
        const dateStr = r.client_time.split('T')[0]; // Format: YYYY-MM-DD
        const timeVal = new Date(dateStr).getTime();
        
        if (!countryFirstSeen[country] || timeVal < countryFirstSeen[country].time) {
            countryFirstSeen[country] = { dateStr, time: timeVal };
        }
    });
    
    const uniqueCountriesList = Object.keys(countryFirstSeen);
    console.log(`Identified ${uniqueCountriesList.length} unique countries/regions.`);
    
    // Group first-seen events by date
    const dailyNewCountries = {};
    uniqueCountriesList.forEach(country => {
        const dateStr = countryFirstSeen[country].dateStr;
        dailyNewCountries[dateStr] = (dailyNewCountries[dateStr] || 0) + 1;
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
        const newCountriesToday = dailyNewCountries[date] || 0;
        cumulativeCount += newCountriesToday;
        
        dailyCSV += `new_countries_rate,${date},${newCountriesToday}\n`;
        cumulativeCSV += `countries_cumulative,${date},${cumulativeCount}\n`;
    });
    
    const dailyFilePath = path.join(__dirname, 'subsoccer_new_countries_daily.csv');
    const cumulativeFilePath = path.join(__dirname, 'subsoccer_new_countries_cumulative.csv');
    
    fs.writeFileSync(dailyFilePath, dailyCSV, 'utf-8');
    fs.writeFileSync(cumulativeFilePath, cumulativeCSV, 'utf-8');
    
    console.log(`\nSaved daily new countries count to: ${dailyFilePath}`);
    console.log(`Saved cumulative unique countries count to: ${cumulativeFilePath}`);
    console.log(`Total countries reached by end of period: ${cumulativeCount}`);
}

exportNewCountries();
