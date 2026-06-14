const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

// Timezone → Country mapping (simplified, same as analytics dashboard)
const TIMEZONE_TO_COUNTRY = {
  'Europe/Helsinki': 'Finland', 'Europe/Stockholm': 'Sweden', 'Europe/Oslo': 'Norway',
  'Europe/Copenhagen': 'Denmark', 'Europe/London': 'United Kingdom', 'Europe/Berlin': 'Germany',
  'Europe/Paris': 'France', 'Europe/Madrid': 'Spain', 'Europe/Rome': 'Italy',
  'Europe/Amsterdam': 'Netherlands', 'Europe/Brussels': 'Belgium', 'Europe/Zurich': 'Switzerland',
  'Europe/Vienna': 'Austria', 'Europe/Prague': 'Czech Republic', 'Europe/Warsaw': 'Poland',
  'Europe/Budapest': 'Hungary', 'Europe/Bucharest': 'Romania', 'Europe/Athens': 'Greece',
  'Europe/Istanbul': 'Turkey', 'Europe/Moscow': 'Russia', 'Europe/Tallinn': 'Estonia',
  'Europe/Riga': 'Latvia', 'Europe/Vilnius': 'Lithuania',
  'America/New_York': 'United States', 'America/Chicago': 'United States',
  'America/Denver': 'United States', 'America/Los_Angeles': 'United States',
  'America/Toronto': 'Canada', 'America/Vancouver': 'Canada',
  'Asia/Tokyo': 'Japan', 'Asia/Seoul': 'South Korea', 'Asia/Shanghai': 'China',
  'Asia/Singapore': 'Singapore', 'Asia/Dubai': 'UAE',
  'Australia/Sydney': 'Australia', 'Australia/Melbourne': 'Australia',
};

function parseCity(locationStr) {
  if (!locationStr || locationStr === 'Unknown') return null;
  
  // Format: "City, CC (Timezone)" or "Timezone"
  if (locationStr.includes('(') && locationStr.includes(')')) {
    const mainPart = locationStr.split('(')[0].trim();
    const commaIdx = mainPart.indexOf(',');
    if (commaIdx > 0) {
      return mainPart.substring(0, commaIdx).trim().replace(/_/g, ' ');
    }
    return mainPart.trim().replace(/_/g, ' ');
  }
  
  // Timezone format
  if (locationStr.includes('/')) {
    const parts = locationStr.split('/');
    return parts[parts.length - 1].replace(/_/g, ' ');
  }
  
  return locationStr.replace(/_/g, ' ');
}

async function main() {
  console.log("Fetching June 2026 tracking data...\n");

  // Fetch all June 2026 data
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  const startDate = '2026-06-01T00:00:00Z';

  while (true) {
    const { data, error } = await supabase
      .from('public_tracking')
      .select('client_time, location')
      .gte('client_time', startDate)
      .order('client_time', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) { console.error("Error:", error); break; }
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < pageSize) break;
    page++;
    if (page > 30) break;
  }

  console.log(`Total June records: ${allData.length}\n`);

  // Calculate cumulative unique cities per day
  const seenCities = new Set();
  const dailyData = {};

  allData.forEach(d => {
    const city = parseCity(d.location);
    if (!city || city === 'Unknown') return;

    const date = new Date(d.client_time);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { newCities: [], cumulativeTotal: 0 };
    }

    if (!seenCities.has(city)) {
      seenCities.add(city);
      dailyData[dateKey].newCities.push(city);
    }
  });

  // Fill cumulative totals
  let cumulative = 0;
  const sortedDays = Object.keys(dailyData).sort();
  
  // Also fill in days with no new cities
  if (sortedDays.length > 0) {
    const start = new Date(sortedDays[0]);
    const end = new Date(sortedDays[sortedDays.length - 1]);
    
    const allDays = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      allDays.push(key);
      if (!dailyData[key]) {
        dailyData[key] = { newCities: [], cumulativeTotal: 0 };
      }
    }

    allDays.sort().forEach(day => {
      cumulative += dailyData[day].newCities.length;
      dailyData[day].cumulativeTotal = cumulative;
    });

    // Print results
    console.log("DATE        | NEW  | TOTAL | NEW CITIES");
    console.log("------------|------|-------|------------------------------------------");
    
    allDays.forEach(day => {
      const d = dailyData[day];
      const shortDay = day.substring(5); // MM-DD
      const newCount = String(d.newCities.length).padStart(4);
      const total = String(d.cumulativeTotal).padStart(5);
      const cities = d.newCities.slice(0, 5).join(', ');
      const more = d.newCities.length > 5 ? ` +${d.newCities.length - 5} more` : '';
      console.log(`${shortDay}       | ${newCount} | ${total} | ${cities}${more}`);
    });

    console.log(`\n📊 TOTAL UNIQUE CITIES IN JUNE: ${cumulative}`);
    console.log(`📈 Average new cities per day: ${(cumulative / allDays.length).toFixed(1)}`);
    
    // Output JSON for charting
    const chartData = allDays.map(day => ({
      date: day,
      cumulative: dailyData[day].cumulativeTotal,
      newCities: dailyData[day].newCities.length
    }));
    
    const fs = require('fs');
    fs.writeFileSync(
      __dirname + '/city_growth_data.json',
      JSON.stringify(chartData, null, 2)
    );
    console.log('\n✅ Data saved to scratch/city_growth_data.json');
  }
}

main();
