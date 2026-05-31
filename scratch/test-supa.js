const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const client = createClient(SUPA_URL, SUPA_KEY);

async function testFetch() {
    console.log("Starting fetch from public_tracking using pagination...");
    let trackingData = [];
    let page = 0;
    const pageSize = 1000;
    
    while (true) {
        let pageQuery = client
            .from('public_tracking')
            .select('*')
            .order('client_time', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        const { data: pageData, error: pageError } = await pageQuery;
        if (pageError) {
            console.error(`Page ${page} Error:`, pageError);
            process.exit(1);
        }
        if (!pageData || pageData.length === 0) {
            console.log(`Page ${page} returned 0 rows. Breaking loop.`);
            break;
        }
        
        trackingData.push(...pageData);
        console.log(`Page ${page}: Fetched ${pageData.length} rows. Total so far: ${trackingData.length}`);
        
        if (pageData.length < pageSize) {
            console.log(`Page ${page} length (${pageData.length}) is less than pageSize (${pageSize}). Breaking loop.`);
            break;
        }
        page++;
        if (page > 30) {
            console.log("Safety threshold reached. Breaking.");
            break;
        }
    }
    
    console.log(`Finished. Total retrieved rows: ${trackingData.length}`);
    if (trackingData.length > 0) {
        const oldest = trackingData[trackingData.length - 1];
        const newest = trackingData[0];
        console.log(`Newest client_time: ${newest.client_time}`);
        console.log(`Oldest client_time: ${oldest.client_time}`);
    }
}

testFetch();
