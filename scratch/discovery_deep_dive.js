const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://ujxmmrsmdwrgcwatdhvx.supabase.co', 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t');

async function main() {
  console.log("🔍 MISTÄ IHMISET LÖYTÄVÄT instant-play.html?\n");
  console.log("=".repeat(80));

  // Fetch all tracking data
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  process.stdout.write("Haetaan dataa");
  while (true) {
    const { data, error } = await supabase
      .from('public_tracking')
      .select('client_time, location, game_code, source_partner, event_type, browser_lang, user_agent, utm_source, utm_medium, utm_campaign, is_returning, session_id')
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

  // Filter to only PUBLIC-APP (= instant-play without QR code)
  const publicApp = allData.filter(d => 
    (d.game_code || '').toUpperCase() === 'PUBLIC-APP'
  );
  const withQR = allData.filter(d => {
    const code = (d.game_code || '').toUpperCase();
    return code && code !== 'PUBLIC-APP' && code !== 'QUICK-PLAY' && code !== 'MOBILE-TOURNAMENT';
  });

  console.log(`📊 PUBLIC-APP (instant-play ilman QR): ${publicApp.length} eventtiä`);
  console.log(`🎯 QR-koodilla (fyysinen pöytä):       ${withQR.length} eventtiä`);
  console.log(`📱 MOBILE-TOURNAMENT:                   ${allData.filter(d => (d.game_code||'').toUpperCase() === 'MOBILE-TOURNAMENT').length} eventtiä\n`);

  // ============================================================
  // 1. UTM-lähteet — onko markkinointikampanjoita?
  // ============================================================
  console.log("📢 UTM-LÄHTEET (markkinointikampanjat)");
  console.log("=".repeat(80));

  const utmSources = {};
  const utmMediums = {};
  const utmCampaigns = {};
  let hasAnyUtm = 0;

  publicApp.forEach(d => {
    if (d.utm_source) { utmSources[d.utm_source] = (utmSources[d.utm_source] || 0) + 1; hasAnyUtm++; }
    if (d.utm_medium) { utmMediums[d.utm_medium] = (utmMediums[d.utm_medium] || 0) + 1; }
    if (d.utm_campaign) { utmCampaigns[d.utm_campaign] = (utmCampaigns[d.utm_campaign] || 0) + 1; }
  });

  if (hasAnyUtm > 0) {
    console.log(`  ${hasAnyUtm}/${publicApp.length} eventillä on UTM-parametrit (${Math.round(hasAnyUtm/publicApp.length*100)}%)\n`);
    console.log("  utm_source:");
    Object.entries(utmSources).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`    ${k.padEnd(25)} ${v}`));
    console.log("\n  utm_medium:");
    Object.entries(utmMediums).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`    ${k.padEnd(25)} ${v}`));
    console.log("\n  utm_campaign:");
    Object.entries(utmCampaigns).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`    ${k.padEnd(25)} ${v}`));
  } else {
    console.log("  ❌ NOLLA UTM-parametreja — kukaan ei tule merkityn linkin kautta");
    console.log("  → Tämä tarkoittaa: ei some-mainoksia, ei sähköpostikampanjoita, ei affiliate-linkkejä");
    console.log("  → Kaikki liikenne on ORGAANISTA (Google-haku tai suora URL)\n");
  }

  // ============================================================
  // 2. source_partner jakauma PUBLIC-APP:lle
  // ============================================================
  console.log("🏷️  SOURCE_PARTNER — Mikä URL-parametri oli mukana");
  console.log("=".repeat(80));

  const partnerMap = {};
  publicApp.forEach(d => {
    const p = (d.source_partner || 'tyhjä').toLowerCase();
    partnerMap[p] = (partnerMap[p] || 0) + 1;
  });
  Object.entries(partnerMap).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(5)} (${Math.round(v/publicApp.length*100)}%)`);
  });
  console.log(`  → 'social' = oletusarvo kun ?partner= puuttuu URL:sta (= suora avaus)\n`);

  // ============================================================
  // 3. Kielijakauma — mistä maista PUBLIC-APP liikenne tulee
  // ============================================================
  console.log("🗣️  KIELIJAKAUMA — PUBLIC-APP kävijöiden selainkieli");
  console.log("=".repeat(80));

  const langMap = {};
  publicApp.forEach(d => {
    const lang = (d.browser_lang || '?').toLowerCase();
    langMap[lang] = (langMap[lang] || 0) + 1;
  });
  Object.entries(langMap).sort((a,b) => b[1]-a[1]).slice(0, 20).forEach(([k,v]) => {
    const pct = Math.round(v/publicApp.length*100);
    console.log(`  ${k.padEnd(8)} ${String(v).padStart(5)} (${String(pct).padStart(2)}%)`);
  });

  // ============================================================
  // 4. Aikamalli — milloin PUBLIC-APP liikennettä tulee
  // ============================================================
  console.log("\n⏰ KELLONAIKAJAKAUMA (UTC) — Milloin PUBLIC-APP kävijät tulevat");
  console.log("=".repeat(80));

  const hourMap = new Array(24).fill(0);
  publicApp.filter(d => d.event_type === 'app_opened').forEach(d => {
    hourMap[new Date(d.client_time).getUTCHours()]++;
  });
  const maxHour = Math.max(...hourMap);
  hourMap.forEach((count, hour) => {
    const bar = '█'.repeat(Math.round(count / maxHour * 40));
    console.log(`  ${String(hour).padStart(2)}:00  ${String(count).padStart(4)}  ${bar}`);
  });

  // ============================================================
  // 5. Viikonpäivä — onko arkipäiväpainotteinen (työ) vai vkl (vapaa-aika)?
  // ============================================================
  console.log("\n📅 VIIKONPÄIVÄJAKAUMA — PUBLIC-APP");
  console.log("=".repeat(80));

  const dayNames = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
  const dayMap = new Array(7).fill(0);
  publicApp.filter(d => d.event_type === 'app_opened').forEach(d => {
    dayMap[new Date(d.client_time).getDay()]++;
  });
  const maxDay = Math.max(...dayMap);
  dayMap.forEach((count, day) => {
    const bar = '█'.repeat(Math.round(count / maxDay * 40));
    console.log(`  ${dayNames[day]}  ${String(count).padStart(4)}  ${bar}`);
  });

  // ============================================================
  // 6. Session depth — pelaako vai vain katsoo?
  // ============================================================
  console.log("\n🎮 SESSION DEPTH — Mitä PUBLIC-APP kävijät tekevät");
  console.log("=".repeat(80));

  const eventTypes = {};
  publicApp.forEach(d => {
    eventTypes[d.event_type] = (eventTypes[d.event_type] || 0) + 1;
  });
  Object.entries(eventTypes).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k.padEnd(30)} ${String(v).padStart(5)}`);
  });

  const opens = eventTypes['app_opened'] || 0;
  const games = eventTypes['game_finished'] || 0;
  const starts = eventTypes['game_start'] || 0;
  console.log(`\n  Conversion: ${opens} avasi → ${games} pelasi = ${opens > 0 ? Math.round(games/opens*100) : 0}%`);

  // ============================================================
  // 7. Returning rate — tulevatko takaisin?
  // ============================================================
  console.log("\n🔄 PALAAVAT vs. UUDET — PUBLIC-APP");
  console.log("=".repeat(80));

  let newU = 0, retU = 0;
  publicApp.filter(d => d.event_type === 'app_opened').forEach(d => {
    if (d.is_returning === true) retU++;
    else if (d.is_returning === false) newU++;
  });
  console.log(`  🆕 Ensikertalainen: ${newU} (${Math.round(newU/(newU+retU)*100)}%)`);
  console.log(`  🔁 Palaava:         ${retU} (${Math.round(retU/(newU+retU)*100)}%)`);

  // ============================================================
  // 8. Kasvutrendi per viikko
  // ============================================================
  console.log("\n📈 VIIKKOTRENDI — PUBLIC-APP app_opened eventit");
  console.log("=".repeat(80));

  const weekMap = {};
  publicApp.filter(d => d.event_type === 'app_opened').forEach(d => {
    const date = new Date(d.client_time);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    weekMap[key] = (weekMap[key] || 0) + 1;
  });

  const maxWeek = Math.max(...Object.values(weekMap));
  Object.keys(weekMap).sort().forEach(week => {
    const count = weekMap[week];
    const bar = '█'.repeat(Math.round(count / maxWeek * 40));
    console.log(`  ${week}  ${String(count).padStart(4)}  ${bar}`);
  });

  console.log("\n✅ Analyysi valmis.");
}

main().catch(console.error);
