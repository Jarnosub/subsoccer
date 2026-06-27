const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

// ============================================================
// CITY ORIGIN ANALYZER
// Selvittää mistä kanavasta uudet kaupungit tulevat
// ============================================================

function parseCity(locationStr) {
  if (!locationStr || locationStr === 'Unknown') return null;
  if (locationStr.includes('(') && locationStr.includes(')')) {
    const mainPart = locationStr.split('(')[0].trim();
    const commaIdx = mainPart.indexOf(',');
    if (commaIdx > 0) return mainPart.substring(0, commaIdx).trim().replace(/_/g, ' ');
    return mainPart.trim().replace(/_/g, ' ');
  }
  if (locationStr.includes('/')) {
    const parts = locationStr.split('/');
    return parts[parts.length - 1].replace(/_/g, ' ');
  }
  return locationStr.replace(/_/g, ' ');
}

function parseCountry(locationStr) {
  if (!locationStr || locationStr === 'Unknown') return null;
  if (locationStr.includes('(') && locationStr.includes(')')) {
    const mainPart = locationStr.split('(')[0].trim();
    const commaIdx = mainPart.indexOf(',');
    if (commaIdx > 0) return mainPart.substring(commaIdx + 1).trim();
  }
  // Timezone fallback
  const TZ_COUNTRY = {
    'Europe/Helsinki': 'FI', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO',
    'Europe/Copenhagen': 'DK', 'Europe/London': 'GB', 'Europe/Berlin': 'DE',
    'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
    'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH',
    'Europe/Vienna': 'AT', 'Europe/Prague': 'CZ', 'Europe/Warsaw': 'PL',
    'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Athens': 'GR',
    'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Europe/Tallinn': 'EE',
    'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Lisbon': 'PT',
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
    'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Buenos_Aires': 'AR',
    'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL',
    'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
    'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE', 'Asia/Kolkata': 'IN',
    'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
    'Africa/Lagos': 'NG', 'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG',
  };
  const tz = locationStr.includes('(') 
    ? locationStr.substring(locationStr.indexOf('(') + 1, locationStr.indexOf(')')).trim()
    : locationStr;
  return TZ_COUNTRY[tz] || null;
}

function classifyChannel(gameCode, sourcePartner) {
  const code = (gameCode || '').toUpperCase();
  const partner = (sourcePartner || '').toUpperCase();
  
  if (code === 'PUBLIC-APP' || code === 'QUICK-PLAY' || code === '') {
    return '🌐 Web (Google/linkki)';
  }
  if (code === 'MOBILE-TOURNAMENT') {
    return '📱 Mobile Tournament';
  }
  if (partner === 'COSTCO') return '🏬 Costco QR';
  if (partner === 'OLEARYS') return '🍺 O\'Learys QR';
  if (partner === 'EVENT') return '🎪 Event QR';
  if (partner === 'GUEST') return '👤 Guest';
  if (partner === 'REGISTERED') return '✅ Registered user';
  
  // If game_code looks like a serial number (specific table)
  if (code.match(/^[A-Z0-9]+-[A-Z0-9]+$/) || code.match(/^SOCIAL-/)) {
    return '🎯 Fyysinen QR (' + code + ')';
  }
  
  return '❓ Muu (' + code + '/' + partner + ')';
}

async function main() {
  console.log("🔍 CITY ORIGIN ANALYZER — Mistä uudet kaupungit tulevat?\n");
  console.log("=".repeat(80));

  // Fetch ALL tracking data
  let allData = [];
  let page = 0;
  const pageSize = 1000;

  process.stdout.write("Haetaan dataa");
  while (true) {
    const { data, error } = await supabase
      .from('public_tracking')
      .select('client_time, location, game_code, source_partner, event_type, browser_lang, user_agent, is_returning')
      .order('client_time', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) { console.error("\nError:", error); break; }
    if (!data || data.length === 0) break;
    allData.push(...data);
    process.stdout.write(".");
    if (data.length < pageSize) break;
    page++;
    if (page > 50) break;
  }
  console.log(` ${allData.length} riviä\n`);

  // ============================================================
  // 1. Selvitä jokaisen kaupungin ENSIMMÄINEN esiintymä
  // ============================================================
  const firstSeen = {}; // city → first record

  allData.forEach(d => {
    const city = parseCity(d.location);
    if (!city || city === 'Unknown' || city.length <= 2) return;
    
    if (!firstSeen[city]) {
      firstSeen[city] = {
        city,
        country: parseCountry(d.location),
        date: d.client_time,
        gameCode: d.game_code,
        sourcePartner: d.source_partner,
        eventType: d.event_type,
        lang: d.browser_lang,
        channel: classifyChannel(d.game_code, d.source_partner),
        ua: d.user_agent,
        isReturning: d.is_returning,
        location_raw: d.location
      };
    }
  });

  const cities = Object.values(firstSeen).sort((a, b) => new Date(a.date) - new Date(b.date));

  // ============================================================
  // 2. Kanavajakauma — mistä uudet kaupungit tulevat
  // ============================================================
  console.log("📊 KANAVAJAKAUMA — Mistä kanavasta kaupungit löytyivät ensimmäisen kerran");
  console.log("=".repeat(80));

  const channelCounts = {};
  cities.forEach(c => {
    channelCounts[c.channel] = (channelCounts[c.channel] || 0) + 1;
  });

  const sortedChannels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1]);

  const totalCities = cities.length;
  sortedChannels.forEach(([channel, count]) => {
    const pct = Math.round(count / totalCities * 100);
    const bar = '█'.repeat(Math.round(pct / 2));
    console.log(`  ${channel.padEnd(30)} ${String(count).padStart(4)} (${String(pct).padStart(2)}%) ${bar}`);
  });
  console.log(`${"".padEnd(32)} ${String(totalCities).padStart(4)} kaupunkia yhteensä\n`);

  // ============================================================
  // 3. Viimeisimmät 30 uutta kaupunkia — yksityiskohdat
  // ============================================================
  console.log("🆕 VIIMEISET 30 UUTTA KAUPUNKIA");
  console.log("=".repeat(80));
  console.log("PVM         KAUPUNKI                     MAA   KANAVA                         GAME_CODE        LANG");
  console.log("-".repeat(120));

  const latest30 = cities.slice(-30);
  latest30.forEach(c => {
    const date = new Date(c.date).toISOString().slice(0, 10);
    const cityStr = c.city.substring(0, 28).padEnd(28);
    const countryStr = (c.country || '??').padEnd(5);
    const channelStr = c.channel.substring(0, 30).padEnd(30);
    const codeStr = (c.gameCode || '-').substring(0, 16).padEnd(16);
    const langStr = c.lang || '?';
    console.log(`${date}  ${cityStr} ${countryStr} ${channelStr} ${codeStr} ${langStr}`);
  });

  // ============================================================
  // 4. Kuukausittainen trendi per kanava
  // ============================================================
  console.log("\n📈 KUUKAUSITTAINEN KASVU PER KANAVA");
  console.log("=".repeat(80));

  const monthlyChannels = {};
  cities.forEach(c => {
    const month = new Date(c.date).toISOString().slice(0, 7);
    if (!monthlyChannels[month]) monthlyChannels[month] = {};
    const ch = c.channel.includes('Web') ? 'Web' 
             : c.channel.includes('Mobile') ? 'Mobile'
             : c.channel.includes('QR') ? 'QR-koodi'
             : c.channel.includes('Fyysinen') ? 'Fyysinen QR'
             : c.channel.includes('Registered') ? 'Rekisteröity'
             : c.channel.includes('Guest') ? 'Guest'
             : 'Muu';
    monthlyChannels[month][ch] = (monthlyChannels[month][ch] || 0) + 1;
  });

  const allChannelNames = [...new Set(Object.values(monthlyChannels).flatMap(v => Object.keys(v)))].sort();
  
  console.log(`${"KUUKAUSI".padEnd(10)} ${allChannelNames.map(n => n.padStart(12)).join('')}  TOTAL`);
  console.log("-".repeat(10 + allChannelNames.length * 12 + 8));

  Object.keys(monthlyChannels).sort().forEach(month => {
    const row = monthlyChannels[month];
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const cols = allChannelNames.map(n => String(row[n] || 0).padStart(12));
    console.log(`${month}    ${cols.join('')}  ${String(total).padStart(5)}`);
  });

  // ============================================================
  // 5. Ei-suomalaiset kaupungit — mistä ne tulevat?
  // ============================================================
  console.log("\n🌍 EI-SUOMALAISET KAUPUNGIT — Kanavajakauma");
  console.log("=".repeat(80));

  const nonFI = cities.filter(c => c.country && c.country !== 'FI' && c.country !== 'Finland');
  const nonFIChannels = {};
  nonFI.forEach(c => {
    nonFIChannels[c.channel] = (nonFIChannels[c.channel] || 0) + 1;
  });

  Object.entries(nonFIChannels)
    .sort((a, b) => b[1] - a[1])
    .forEach(([channel, count]) => {
      const pct = Math.round(count / nonFI.length * 100);
      const bar = '█'.repeat(Math.round(pct / 2));
      console.log(`  ${channel.padEnd(30)} ${String(count).padStart(4)} (${String(pct).padStart(2)}%) ${bar}`);
    });
  console.log(`  Yhteensä ${nonFI.length} ei-suomalaista kaupunkia (kaikista ${totalCities})\n`);

  // ============================================================
  // 6. Mobiili vs. Desktop jakauma uusille kaupungeille
  // ============================================================
  console.log("📱 LAITEJAKAUMA — Ensimmäiset kaupunkien avaajat");
  console.log("=".repeat(80));

  let mobile = 0, desktop = 0, other = 0;
  cities.forEach(c => {
    const ua = (c.ua || '').toLowerCase();
    if (ua.includes('iphone') || ua.includes('android') || ua.includes('mobile')) mobile++;
    else if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) desktop++;
    else other++;
  });

  console.log(`  📱 Mobiili:   ${String(mobile).padStart(4)} (${Math.round(mobile/totalCities*100)}%)`);
  console.log(`  🖥️  Desktop:   ${String(desktop).padStart(4)} (${Math.round(desktop/totalCities*100)}%)`);
  console.log(`  ❓ Muu:       ${String(other).padStart(4)} (${Math.round(other/totalCities*100)}%)\n`);

  // ============================================================
  // 7. Returning vs. new user per kanava
  // ============================================================
  console.log("🔄 UUDET vs. PALAAVAT — Kuka avaa ensimmäisenä uudessa kaupungissa?");
  console.log("=".repeat(80));

  let newUsers = 0, returning = 0, unknown = 0;
  cities.forEach(c => {
    if (c.isReturning === true) returning++;
    else if (c.isReturning === false) newUsers++;
    else unknown++;
  });

  console.log(`  🆕 Ensikertalainen: ${String(newUsers).padStart(4)} (${Math.round(newUsers/totalCities*100)}%)`);
  console.log(`  🔁 Palaava:         ${String(returning).padStart(4)} (${Math.round(returning/totalCities*100)}%)`);
  console.log(`  ❓ Tuntematon:      ${String(unknown).padStart(4)} (${Math.round(unknown/totalCities*100)}%)\n`);

  // ============================================================
  // 8. Kielien jakauma
  // ============================================================
  console.log("🗣️  KIELET — Millä kielellä uudet kaupungit löytyvät");
  console.log("=".repeat(80));

  const langCounts = {};
  cities.forEach(c => {
    const lang = (c.lang || 'unknown').toLowerCase();
    langCounts[lang] = (langCounts[lang] || 0) + 1;
  });

  Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([lang, count]) => {
      const pct = Math.round(count / totalCities * 100);
      console.log(`  ${lang.padEnd(6)} ${String(count).padStart(4)} (${String(pct).padStart(2)}%)`);
    });

  console.log("\n✅ Analyysi valmis.");
}

main().catch(console.error);
