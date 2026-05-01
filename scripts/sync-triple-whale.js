const { createClient } = require('@supabase/supabase-js');

// 1. CONFIGURATION
const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t'; // From dashboard
const TRIPLE_WHALE_API_KEY = '84425c70-c227-4cc5-8846-ebd58c8f75cf';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncDailyMetricsToTripleWhale(dateString) {
    console.log(`\n--- Starting Daily Sync for ${dateString} ---`);

    // 1. Date boundaries (00:00:00 to 23:59:59)
    const startDate = new Date(`${dateString}T00:00:00Z`).toISOString();
    const endDate = new Date(`${dateString}T23:59:59Z`).toISOString();

    // 2. Fetch data from Supabase for that day
    const { data: trackingData, error } = await supabase
        .from('public_tracking')
        .select('event_type')
        .gte('client_time', startDate)
        .lte('client_time', endDate);

    if (error) {
        console.error("Error fetching Supabase data:", error);
        return;
    }

    // 3. Aggregate Metrics
    const appOpens = trackingData.filter(d => d.event_type === 'app_opened').length;
    const tournaments = trackingData.filter(d => d.event_type === 'tournament_finished').length;
    
    console.log(`Aggregated Results:`);
    console.log(`- App Opens: ${appOpens}`);
    console.log(`- Tournaments Played: ${tournaments}`);

    // 4. Send to Triple Whale via Data-In API
    const shopDomain = "subsoccer-intl.myshopify.com";
    const timestamp = Math.floor(new Date(endDate).getTime() / 1000);

    // Event 1: App Opens
    const appOpensPayload = {
        shop: shopDomain,
        type: "custom",
        timestamp: timestamp,
        profileIdentifiers: { externalId: `daily_aggregate_${dateString}` },
        event_name: "total_app_opens",
        value: appOpens
    };

    // Event 2: Tournaments Played
    const tournamentsPayload = {
        shop: shopDomain,
        type: "custom",
        timestamp: timestamp,
        profileIdentifiers: { externalId: `daily_aggregate_${dateString}` },
        event_name: "tournaments_played",
        value: tournaments
    };

    console.log(`\n[API CALL] Pushing to Triple Whale...`);
    
    // Helper function to send event
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
            console.log(`- ${payload.event_name} -> HTTP ${response.status}: ${text}`);
        } catch (e) {
            console.error(`- Error sending ${payload.event_name}:`, e);
        }
    }

    await sendEvent(appOpensPayload);
    await sendEvent(tournamentsPayload);
    
    console.log("--- Sync Complete ---");
}

// Get yesterday's date (YYYY-MM-DD)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const targetDate = yesterday.toISOString().split('T')[0];

// Execute
syncDailyMetricsToTripleWhale(targetDate);
