const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const _URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const _KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

const supabase = createClient(_URL, _KEY);

async function analyze() {
    console.log("Fetching public_tracking records from Supabase...");
    
    // Fetch all records by paginating (since limit is 1000)
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
            .from('public_tracking')
            .select('*')
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
            // If we got less than the page size, it means we reached the end
            if (pageData.length < pageSize) {
                hasMore = false;
            }
        }
    }
    
    console.log(`Fetched total ${allRecords.length} records from public_tracking.`);
    
    // Analyze fields
    const userAgents = {};
    const locations = {};
    const eventTypes = {};
    const partners = {};
    const locationUAs = {}; // To see what user agents are used in each location
    const locationSessions = {};
    
    let botCount = 0;
    const botKeywords = ['bot', 'crawler', 'spider', 'headless', 'lighthouse', 'python', 'axios', 'curl', 'wget', 'go-http', 'java', 'preview', 'facebookexternalhit', 'twitterbot'];
    
    allRecords.forEach(r => {
        const ua = (r.user_agent || '').toLowerCase();
        const loc = r.location || 'Unknown';
        const event = r.event_type || 'Unknown';
        const partner = r.source_partner || 'Unknown';
        
        userAgents[r.user_agent] = (userAgents[r.user_agent] || 0) + 1;
        locations[loc] = (locations[loc] || 0) + 1;
        eventTypes[event] = (eventTypes[event] || 0) + 1;
        partners[partner] = (partners[partner] || 0) + 1;
        
        if (!locationUAs[loc]) locationUAs[loc] = [];
        locationUAs[loc].push(r.user_agent || 'EMPTY');
        
        if (!locationSessions[loc]) locationSessions[loc] = [];
        locationSessions[loc].push(r);
        
        // Detect bot based on User-Agent keyword
        const isBotUA = botKeywords.some(kw => ua.includes(kw));
        const isEmptyUA = !r.user_agent;
        
        if (isBotUA || isEmptyUA) {
            botCount++;
        }
    });
    
    console.log("\n==========================================");
    console.log(`DEEP ANALYSIS OF ALL ${allRecords.length} TELEMETRY RECORDS`);
    console.log("==========================================");
    
    console.log(`\n🤖 Bot/Crawler Detections by User-Agent: ${botCount} / ${allRecords.length} (${((botCount/allRecords.length)*100).toFixed(1)}%)`);
    console.log(`🌍 Total Unique Locations: ${Object.keys(locations).length}`);
    
    // Check for exact duplicate sessions from non-Helsinki locations
    console.log("\n🔎 ANOMALY DETECTION FOR REMOTE LOCATIONS (Non-FI):");
    
    const remoteLocs = Object.entries(locations)
        .filter(([loc]) => loc !== 'Europe/Helsinki' && loc !== 'Unknown');
        
    console.log(`Total Remote Locations: ${remoteLocs.length}`);
    
    // Group records by user agent to find duplicates
    const uaCount = {};
    allRecords.forEach(r => {
        if (r.user_agent) {
            uaCount[r.user_agent] = (uaCount[r.user_agent] || 0) + 1;
        }
    });
    
    console.log("\n🕵️ ANALYSIS OF SUSPICIOUS USER AGENTS (Highly frequent but remote):");
    const sortedUAs = Object.entries(userAgents).sort((a, b) => b[1] - a[1]);
    
    sortedUAs.slice(0, 5).forEach(([ua, totalCount]) => {
        // Find which locations use this user agent
        const uaLocs = {};
        const timeDiffs = [];
        let prevTime = null;
        
        allRecords.forEach(r => {
            if (r.user_agent === ua) {
                const loc = r.location || 'Unknown';
                uaLocs[loc] = (uaLocs[loc] || 0) + 1;
                
                const time = new Date(r.client_time || r.created_at);
                if (prevTime) {
                    timeDiffs.push(Math.abs(time - prevTime));
                }
                prevTime = time;
            }
        });
        
        console.log(`\nUser Agent: "${ua || 'EMPTY'}"`);
        console.log(`  Total occurrences: ${totalCount}`);
        console.log(`  Locations distribution:`);
        Object.entries(uaLocs)
            .sort((a, b) => b[1] - a[1])
            .forEach(([loc, count]) => {
                console.log(`    - ${loc}: ${count}x`);
            });
            
        // Calculate average time between events for this user agent
        if (timeDiffs.length > 0) {
            const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
            console.log(`  Average time between events: ${(avgDiff / 1000).toFixed(1)} seconds`);
        }
    });

    console.log("\n⏱️ ANALYSIS OF REPETITIVE PATTERNS (Timestamps):");
    // Sort records by client_time or client's insertion order (id)
    const sortedRecords = [...allRecords].sort((a, b) => a.id - b.id);
    let rapidSuccessions = 0;
    
    for (let i = 1; i < sortedRecords.length; i++) {
        const prev = sortedRecords[i-1];
        const curr = sortedRecords[i];
        
        if (prev.location === curr.location && prev.event_type === curr.event_type && prev.user_agent === curr.user_agent) {
            const t1 = new Date(prev.client_time || prev.created_at);
            const t2 = new Date(curr.client_time || curr.created_at);
            const diffMs = Math.abs(t2 - t1);
            if (diffMs < 3000) {
                rapidSuccessions++;
            }
        }
    }
    console.log(`  - Events from same user agent, same location, same type within 3 seconds: ${rapidSuccessions}`);
    
    // Hour of day analysis for all events
    const hourlyDistribution = Array(24).fill(0);
    allRecords.forEach(r => {
        const time = new Date(r.client_time || r.created_at);
        const hour = time.getUTCHours();
        if (!isNaN(hour)) {
            hourlyDistribution[hour]++;
        }
    });
    
    console.log("\n📈 HOURLY DISTRIBUTION (UTC):");
    hourlyDistribution.forEach((count, hour) => {
        console.log(`  Hour ${hour.toString().padStart(2, '0')}: ${count} events ${'#'.repeat(Math.min(50, Math.round(count / 10)))}`);
    });
    
    // Sort and print top Locations with their app_opened vs game_finished breakdown
    console.log("\n🌍 TOP 30 LOCATIONS WITH EVENT BREAKDOWN & SESSION DURATION:");
    const sortedLocs = Object.entries(locations).sort((a, b) => b[1] - a[1]).slice(0, 30);
    
    sortedLocs.forEach(([loc, total]) => {
        const events = locationSessions[loc] || [];
        const opens = events.filter(e => e.event_type === 'app_opened').length;
        const finishes = events.filter(e => e.event_type === 'game_finished').length;
        const starts = events.filter(e => e.event_type === 'game_start').length;
        const tourFinishes = events.filter(e => e.event_type === 'tournament_finished').length;
        
        const uas = new Set(events.map(e => e.user_agent));
        
        // Calculate average session duration for game_finished events
        const finishedEvents = events.filter(e => e.event_type === 'game_finished' && e.session_duration !== null);
        let avgDuration = 'N/A';
        if (finishedEvents.length > 0) {
            const sum = finishedEvents.reduce((acc, e) => acc + (e.session_duration || 0), 0);
            avgDuration = `${Math.round(sum / finishedEvents.length)}s`;
        }
        
        const codes = {};
        events.forEach(e => {
            if (e.game_code) {
                codes[e.game_code] = (codes[e.game_code] || 0) + 1;
            }
        });
        const topCodes = Object.entries(codes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([c, count]) => `${c}(${count}x)`)
            .join(', ');
            
        const topPartners = Object.entries(parts = {})
        events.forEach(e => {
            if (e.source_partner) {
                parts[e.source_partner] = (parts[e.source_partner] || 0) + 1;
            }
        });
        const topPartnersStr = Object.entries(parts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([p, count]) => `${p}(${count}x)`)
            .join(', ');
            
        console.log(`  - [${total}x] ${loc.padEnd(25)} | Opens: ${opens.toString().padEnd(4)} | Finishes: ${finishes.toString().padEnd(4)} | Avg Dur: ${avgDuration.padEnd(6)} | UAs: ${uas.size.toString().padEnd(3)} | Partners: ${topPartnersStr.padEnd(20)} | Codes: ${topCodes}`);
    });

    console.log("\n🌍 ALL UNIQUE LOCATIONS IN DATABASE:");
    const allLocs = Object.keys(locations).sort();
    console.log(allLocs.join(', '));
}

analyze();
