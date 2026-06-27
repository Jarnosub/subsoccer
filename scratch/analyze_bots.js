const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const client = createClient(SUPA_URL, SUPA_KEY);

async function run() {
    console.log("Fetching data for deep audit...");
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    while (page < 10) {
        const { data: pageData, error } = await client
            .from('public_tracking')
            .select('*')
            .order('client_time', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error(error);
            break;
        }
        if (!pageData || pageData.length === 0) break;
        allData.push(...pageData);
        if (pageData.length < pageSize) break;
        page++;
    }

    console.log(`Loaded ${allData.length} total tracking rows.`);

    const finishedGames = allData.filter(d => d.event_type === 'game_finished');
    console.log(`Total finished games: ${finishedGames.length}`);

    // Parse OS from user_agent
    const parseOS = (ua) => {
        if (!ua) return 'Unknown';
        if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('Windows')) return 'Windows';
        if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'macOS';
        if (ua.includes('Linux')) return 'Linux';
        return 'Other/Bot';
    };

    // Parse Country from location (e.g. "Angeles City, PH (Asia/Manila)" or "IE (Europe/Dublin)")
    const parseCountry = (loc) => {
        if (!loc) return 'Unknown';
        // Match country code before parentheses or comma: e.g. "PH" or "IE"
        // Location format examples:
        // "Angeles City, PH (Asia/Manila)"
        // "IE (Europe/Dublin)"
        // Let's use regex to find 2-letter uppercase codes
        const match = loc.match(/(?:\s|,|^)([A-Z]{2})(?:\s|\(|$)/);
        return match ? match[1] : 'Unknown';
    };

    const parsedGames = finishedGames.map(g => ({
        id: g.id,
        duration: g.session_duration,
        score: g.match_score,
        os: parseOS(g.user_agent),
        country: parseCountry(g.location),
        time: new Date(g.client_time),
        session: g.session_id,
        ua: g.user_agent
    }));

    // Audit 1: Fast test clicks vs. organic play
    // Very fast games (< 20 seconds) with score 3-0 or 0-3
    const extremelyFastWins = parsedGames.filter(g => g.duration < 15 && (g.score === '3-0' || g.score === '0-3'));
    console.log(`\n--- Audit 1: Duration & Score Analysis ---`);
    console.log(`Extremely fast games (<15s) with 3-0 / 0-3 scores: ${extremelyFastWins.length} (${((extremelyFastWins.length / finishedGames.length)*100).toFixed(1)}%)`);
    console.log(`-> These are highly likely developer test taps or bots running click tests.`);

    // Audit 2: User Agent Fingerprint duplicates
    // If the exact same User Agent, Country, and session_id performs many actions within seconds
    console.log(`\n--- Audit 2: session_id Frequency ---`);
    const sessionCounts = {};
    parsedGames.forEach(g => {
        sessionCounts[g.session] = (sessionCounts[g.session] || 0) + 1;
    });

    const multiGameSessions = Object.entries(sessionCounts).filter(s => s[1] > 1);
    console.log(`Sessions with more than 1 finished game: ${multiGameSessions.length}`);
    const heavySessions = Object.entries(sessionCounts).filter(s => s[1] >= 5).sort((a,b) => b[1]-a[1]);
    console.log(`Sessions with 5 or more finished games (Heavy play or bots): ${heavySessions.length}`);
    if (heavySessions.length > 0) {
        console.log("Top repetitive sessions:");
        heavySessions.slice(0, 5).forEach(([sess, count]) => {
            const sample = parsedGames.find(g => g.session === sess);
            if (sample) {
                console.log(`- Session: ${sess} | Games played: ${count} | OS: ${sample.os} | Country: ${sample.country} | UA: ${sample.ua ? sample.ua.slice(0, 60) : 'N/A'}...`);
            } else {
                console.log(`- Session: ${sess} | Games played: ${count} (No sample details)`);
            }
        });
    }

    // Audit 3: Location / Country Breakdown of finished games
    console.log(`\n--- Audit 3: Geographic Distribution ---`);
    const countryCounts = {};
    parsedGames.forEach(g => {
        countryCounts[g.country] = (countryCounts[g.country] || 0) + 1;
    });
    console.log("Top countries for finished games:");
    console.log(Object.entries(countryCounts).sort((a,b) => b[1]-a[1]).slice(0, 10));

    // Audit 4: OS Breakdown
    console.log(`\n--- Audit 4: Operating System Distribution ---`);
    const osCounts = {};
    parsedGames.forEach(g => {
        osCounts[g.os] = (osCounts[g.os] || 0) + 1;
    });
    console.log(osCounts);

    // Audit 5: Fast successive play patterns
    let suspiciousBurstCount = 0;
    const sortedGames = [...parsedGames].sort((a, b) => b.time - a.time);
    for (let i = 0; i < sortedGames.length - 1; i++) {
        const timeDiff = Math.abs(sortedGames[i].time - sortedGames[i+1].time);
        // If two games are finished in the same country, same OS, within 5 seconds of each other
        if (timeDiff < 5000 && sortedGames[i].country === sortedGames[i+1].country && sortedGames[i].os === sortedGames[i+1].os) {
            suspiciousBurstCount++;
        }
    }
    console.log(`\n--- Audit 5: Burst Patterns ---`);
    console.log(`Suspicious bursts (games completed in same location & OS within 5 seconds of each other): ${suspiciousBurstCount}`);
}

run();
