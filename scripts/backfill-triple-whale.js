const { createClient } = require('@supabase/supabase-js');

// 1. CONFIGURATION
const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const TRIPLE_WHALE_API_KEY = '84425c70-c227-4cc5-8846-ebd58c8f75cf';
const SHOP_DOMAIN = "subsoccer-intl.myshopify.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllTrackingData() {
    let allData = [];
    let start = 0;
    const limit = 1000;
    let hasMore = true;

    console.log("Fetching data from Supabase...");

    while (hasMore) {
        const { data, error } = await supabase
            .from('public_tracking')
            .select('client_time, event_type')
            .range(start, start + limit - 1);

        if (error) {
            console.error("Error fetching data:", error);
            break;
        }

        allData = allData.concat(data);
        console.log(`Fetched ${data.length} rows... (Total: ${allData.length})`);

        if (data.length < limit) {
            hasMore = false;
        } else {
            start += limit;
        }
    }
    
    return allData;
}

// Helper to delay between API calls to avoid rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sendEvent(payload) {
    try {
        const response = await fetch('https://api.triplewhale.com/api/v2/data-in/event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': TRIPLE_WHALE_API_KEY
            },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        if (response.status !== 200) {
            console.log(`- [ERROR] ${payload.event_name} for ${payload.profileIdentifiers.externalId} -> HTTP ${response.status}: ${text}`);
        }
    } catch (e) {
        console.error(`- Error sending ${payload.event_name}:`, e);
    }
}

async function backfillHistory() {
    const data = await fetchAllTrackingData();
    console.log(`\nAggregating ${data.length} total events by day...`);

    // Group by Date String (YYYY-MM-DD)
    const dailyAggregates = {};

    data.forEach(row => {
        if (!row.client_time) return;
        
        const dateObj = new Date(row.client_time);
        const dateStr = dateObj.toISOString().split('T')[0]; // "YYYY-MM-DD"

        // Skip 2026-04-30 (yesterday) because we already pushed it manually during our test!
        if (dateStr === '2026-04-30') return;
        
        // Skip today to let the daily cron job handle it tonight
        const todayStr = new Date().toISOString().split('T')[0];
        if (dateStr === todayStr) return;

        if (!dailyAggregates[dateStr]) {
            dailyAggregates[dateStr] = { appOpens: 0, tournaments: 0 };
        }

        if (row.event_type === 'app_opened') {
            dailyAggregates[dateStr].appOpens++;
        } else if (row.event_type === 'tournament_finished') {
            dailyAggregates[dateStr].tournaments++;
        }
    });

    const dates = Object.keys(dailyAggregates).sort();
    console.log(`Found data for ${dates.length} distinct historical days (excluding yesterday and today).`);
    console.log("Starting push to Triple Whale...\n");

    for (const dateStr of dates) {
        const agg = dailyAggregates[dateStr];
        
        // Only push if there is actually data
        if (agg.appOpens === 0 && agg.tournaments === 0) continue;

        // Approximate timestamp for the event (e.g. 23:59:59 of that day)
        const timestamp = Math.floor(new Date(`${dateStr}T23:59:59Z`).getTime() / 1000);

        console.log(`[${dateStr}] App Opens: ${agg.appOpens} | Tournaments: ${agg.tournaments}`);

        // Push App Opens
        if (agg.appOpens > 0) {
            await sendEvent({
                shop: SHOP_DOMAIN,
                type: "custom",
                timestamp: timestamp,
                profileIdentifiers: { externalId: `daily_aggregate_${dateStr}` },
                event_name: "total_app_opens",
                value: agg.appOpens
            });
            await sleep(100); // 100ms delay to respect API rate limits
        }

        // Push Tournaments
        if (agg.tournaments > 0) {
            await sendEvent({
                shop: SHOP_DOMAIN,
                type: "custom",
                timestamp: timestamp,
                profileIdentifiers: { externalId: `daily_aggregate_${dateStr}` },
                event_name: "tournaments_played",
                value: agg.tournaments
            });
            await sleep(100); 
        }
    }

    console.log("\n--- Historical Backfill Complete! ---");
}

backfillHistory();
