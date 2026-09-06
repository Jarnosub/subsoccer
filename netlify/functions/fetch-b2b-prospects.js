/**
 * fetch-b2b-prospects.js
 * Netlify Function — B2B AI Prospector
 *
 * Calls Google Places API (New) Text Search with a series of queries
 * across categories and cities, calculates match scores, and returns
 * a deduplicated list of enriched prospects.
 *
 * Secured via GOOGLE_PLACES_API_KEY environment variable (never exposed to browser).
 * Rate: ~100 requests per run, ~$1.70 per full batch.
 *
 * GET /.netlify/functions/fetch-b2b-prospects
 *   ?category=activity_parks   (optional filter)
 *   ?limit=200                 (optional, default 500)
 */

const { createClient } = require('@supabase/supabase-js');

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.id,places.types,places.shortFormattedAddress,places.location';

// Supabase client for telemetry enrichment
const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(SUPA_URL, SUPA_KEY);

// ── Lookalike Search Query Bank ──────────────────────────────────────────────
const SEARCH_QUERIES = {
    arcade_lounges: [
        'venues like NQ64 arcade bar',
        'retro arcade bar craft beer',
        'barcade social gaming lounge',
        'competitive socialising gaming bar',
        'sports bar arcade interactive games',
        'venues like Dave & Busters entertainment',
    ],
    event_rentals: [
        'corporate event games hire company',
        'interactive sports games entertainment rental',
        'event attractions and games hire',
        'party games rental corporate fun days',
        'interactive exhibition stand games hire',
    ],
    sports_clubs: [
        'indoor 5-a-side football center lounge',
        'fan zone sports bar with games',
        'venues like Urban Soccer clubhouse',
        'padel club social lounge',
        'football entertainment arena bar',
    ],
    malls_outlets: [
        'designer outlet shopping centre leisure',
        'shopping mall family entertainment zone',
        'venues like Westfield shopping centre',
        'premium outlet village dining entertainment',
        'shopping centre pop up brand activation',
    ],
    activity_parks: [
        'venues like SuperPark indoor activity',
        'indoor adventure trampoline park family',
        'venues like JumpYard trampoline park',
        'family entertainment center indoor games',
        'clip n climb adventure center',
    ],
    social_bars: [
        'venues like Flight Club social darts',
        'venues like Puttshack mini golf bar',
        'venues like Lane7 bowling social bar',
        'venues like Roxy Ball Room games bar',
        'social competitive gaming bar',
    ],
};

const CITIES = [
    // UK
    { name: 'London', country: 'United Kingdom', region: 'UK' },
    { name: 'Manchester', country: 'United Kingdom', region: 'UK' },
    { name: 'Birmingham', country: 'United Kingdom', region: 'UK' },
    { name: 'Glasgow', country: 'United Kingdom', region: 'UK' },
    { name: 'Edinburgh', country: 'United Kingdom', region: 'UK' },
    // Nordics
    { name: 'Stockholm', country: 'Sweden', region: 'NORDICS' },
    { name: 'Gothenburg', country: 'Sweden', region: 'NORDICS' },
    { name: 'Helsinki', country: 'Finland', region: 'NORDICS' },
    { name: 'Oslo', country: 'Norway', region: 'NORDICS' },
    { name: 'Copenhagen', country: 'Denmark', region: 'NORDICS' },
    // Europe
    { name: 'Amsterdam', country: 'Netherlands', region: 'EUROPE' },
    { name: 'Rotterdam', country: 'Netherlands', region: 'EUROPE' },
    { name: 'Berlin', country: 'Germany', region: 'EUROPE' },
    { name: 'Munich', country: 'Germany', region: 'EUROPE' },
    { name: 'Hamburg', country: 'Germany', region: 'EUROPE' },
    { name: 'Paris', country: 'France', region: 'EUROPE' },
    { name: 'Barcelona', country: 'Spain', region: 'EUROPE' },
    { name: 'Madrid', country: 'Spain', region: 'EUROPE' },
    { name: 'Dublin', country: 'Ireland', region: 'UK' },
    { name: 'Brussels', country: 'Belgium', region: 'EUROPE' },
    // North America
    { name: 'New York', country: 'United States', region: 'NORTH_AMERICA' },
    { name: 'Chicago', country: 'United States', region: 'NORTH_AMERICA' },
    { name: 'Los Angeles', country: 'United States', region: 'NORTH_AMERICA' },
    { name: 'Miami', country: 'United States', region: 'NORTH_AMERICA' },
    { name: 'Toronto', country: 'Canada', region: 'NORTH_AMERICA' },
    { name: 'Dubai', country: 'UAE', region: 'MIDDLE_EAST' },
];

// ── Base Match Score Calculator (Google Places data only) ────────────────────
function calcBaseScore(place, category) {
    let score = 0;

    // Rating quality
    if (place.rating >= 4.5) score += 20;
    else if (place.rating >= 4.0) score += 14;
    else if (place.rating >= 3.5) score += 8;

    // Review volume (social proof = foot traffic)
    const reviews = place.userRatingCount || 0;
    if (reviews >= 1000) score += 18;
    else if (reviews >= 500) score += 14;
    else if (reviews >= 200) score += 10;
    else if (reviews >= 100) score += 6;

    // Has a website (professional operation)
    if (place.websiteUri) score += 8;

    // Has phone (contactable)
    if (place.nationalPhoneNumber) score += 4;

    // Category-specific bonus
    const types = place.types || [];
    if (category === 'event_rentals' && types.some(t => ['event_venue', 'point_of_interest', 'general_contractor'].includes(t))) score += 15;
    else if (category === 'arcade_lounges' && types.some(t => ['amusement_center', 'bar', 'bowling_alley', 'night_club'].includes(t))) score += 15;
    else if (category === 'activity_parks' && types.some(t => ['amusement_center', 'sports_complex', 'gym'].includes(t))) score += 15;
    else if (category === 'malls_outlets' && types.some(t => ['shopping_mall', 'department_store'].includes(t))) score += 15;
    else if (category === 'social_bars' && types.some(t => ['bar', 'restaurant', 'night_club'].includes(t))) score += 15;
    else if (category === 'sports_clubs' && types.some(t => ['sports_club', 'gym', 'stadium'].includes(t))) score += 15;
    else score += 5; // partial category match

    return Math.min(score, 65); // max 65 from base
}

// ── AI Smart Score: Telemetry + Social Enrichment ────────────────────────────
// Adds up to 35 bonus points based on real Subsoccer performance data
function calcSmartScore(baseScore, category, city, telemetryInsights) {
    let bonus = 0;
    const reasons = [];

    // 1. Category Performance Bonus (0-12 pts)
    // Categories where existing venues perform best get higher scores
    const catPerf = telemetryInsights.categoryPerformance[category];
    if (catPerf) {
        if (catPerf.avgRetention >= 30) { bonus += 12; reasons.push(`🔥 ${catPerf.avgRetention}% retention in ${category.replace(/_/g, ' ')}`); }
        else if (catPerf.avgRetention >= 15) { bonus += 8; reasons.push(`📈 ${catPerf.avgRetention}% retention in category`); }
        else if (catPerf.totalScans > 0) { bonus += 4; reasons.push(`✅ Proven category`); }
    }

    // 2. City Proximity Bonus (0-10 pts)
    // If we already have a successful venue in the same city → social proof
    const cityVenue = telemetryInsights.activeVenues.find(v => 
        v.city && city && v.city.toLowerCase() === city.toLowerCase()
    );
    if (cityVenue && cityVenue.total_scans > 100) {
        bonus += 10;
        reasons.push(`📍 ${cityVenue.venue_name} (${cityVenue.total_scans} scans) already active in ${city}`);
    } else if (cityVenue) {
        bonus += 5;
        reasons.push(`📍 Active venue exists in ${city}`);
    }

    // 3. Social Viral Proof Bonus (0-8 pts)
    // Categories with strong UGC / viral content perform better
    const socialProof = telemetryInsights.socialByCategory[category];
    if (socialProof && socialProof.totalViews >= 100000000) {
        bonus += 8;
        reasons.push(`🎬 ${Math.round(socialProof.totalViews / 1000000)}M+ viral views in category`);
    } else if (socialProof && socialProof.totalViews >= 10000000) {
        bonus += 5;
        reasons.push(`📱 ${Math.round(socialProof.totalViews / 1000000)}M views in category`);
    }

    // 4. Market Penetration Signal (0-5 pts)
    // Region with existing customers → warmer market
    const regionVenues = telemetryInsights.activeVenues.filter(v => v.total_scans > 50);
    if (regionVenues.length >= 3) {
        bonus += 5;
        reasons.push(`🌍 ${regionVenues.length} active venues in network — warm market`);
    } else if (regionVenues.length >= 1) {
        bonus += 3;
        reasons.push(`🌱 Growing market presence`);
    }

    const smartScore = Math.min(baseScore + bonus, 100);
    return { smartScore, reasons, baseScore, bonus };
}

// ── Fetch Telemetry Insights from Supabase ───────────────────────────────────
async function fetchTelemetryInsights() {
    const insights = {
        activeVenues: [],
        categoryPerformance: {},
        socialByCategory: {}
    };

    try {
        // 1. Active venues with KPIs
        const { data: venues } = await supabase
            .from('venue_kpis')
            .select('venue_name, venue_type, city, country_code, total_scans, total_matches, conversion_pct, retention_pct');
        
        if (venues) {
            insights.activeVenues = venues.filter(v => v.venue_name && v.total_scans > 0);
            
            // Aggregate by venue_type → category performance
            const catMap = {
                'sports_club': 'sports_clubs',
                'activity_park': 'activity_parks',
                'mall': 'malls_outlets',
                'arcade': 'arcade_lounges',
                'social_bar': 'social_bars',
                'event_rental': 'event_rentals'
            };
            
            for (const v of insights.activeVenues) {
                const cat = catMap[v.venue_type];
                if (!cat) continue;
                if (!insights.categoryPerformance[cat]) {
                    insights.categoryPerformance[cat] = { totalScans: 0, totalMatches: 0, venues: 0, retentionSum: 0 };
                }
                const cp = insights.categoryPerformance[cat];
                cp.totalScans += v.total_scans || 0;
                cp.totalMatches += v.total_matches || 0;
                cp.venues += 1;
                cp.retentionSum += v.retention_pct || 0;
            }
            
            for (const [cat, cp] of Object.entries(insights.categoryPerformance)) {
                cp.avgRetention = cp.venues > 0 ? Math.round(cp.retentionSum / cp.venues) : 0;
            }
        }

        // 2. Social content stats by category keywords
        const { data: social } = await supabase
            .from('social_content')
            .select('views, likes, caption')
            .eq('active', true);
        
        if (social) {
            // Map social content to categories by keyword matching
            const catKeywords = {
                arcade_lounges: ['arcade', 'gaming', 'bar', 'lounge', 'retroids', 'haymaker'],
                sports_clubs: ['stadium', 'football', 'soccer', 'fc', 'fan zone', 'match'],
                activity_parks: ['superpark', 'jumpyard', 'trampoline', 'activity', 'park'],
                malls_outlets: ['mall', 'outlet', 'shopping', 'eastmidlands'],
                social_bars: ['bar', 'pub', 'darts', 'bowling', 'lane7', 'flight club'],
                event_rentals: ['event', 'corporate', 'hire', 'rental']
            };
            
            for (const [cat, keywords] of Object.entries(catKeywords)) {
                const matching = social.filter(s => {
                    const text = (s.caption || '').toLowerCase();
                    return keywords.some(kw => text.includes(kw));
                });
                insights.socialByCategory[cat] = {
                    totalViews: matching.reduce((sum, s) => sum + (s.views || 0), 0),
                    totalLikes: matching.reduce((sum, s) => sum + (s.likes || 0), 0),
                    count: matching.length
                };
            }
        }

    } catch (err) {
        console.warn('Telemetry insights fetch failed (non-fatal):', err.message);
    }

    return insights;
}


// ── Category → Peer Benchmark Lookup ─────────────────────────────────────────
function getPeerBenchmark(category) {
    const peerMap = {
        arcade_lounges: {
            peerAccount: '@retroids_arcade_bar & @haymaker_arcade',
            peerProof: '248M+ views on #SubsoccerArcade reels',
            benchmark: 'Proven by Retroids Arcade Bar & Haymaker Arcade Lounges'
        },
        event_rentals: {
            peerAccount: '@gameon.rentals & @ballsportz_hire',
            peerProof: '10+ corporate activations, 2 min setup, ROI in 2–3 hires',
            benchmark: 'Proven by Game On Rentals & Ball Sportz Event Fleets'
        },
        sports_clubs: {
            peerAccount: '@charlottefc, @sportingkc & @slbenfica',
            peerProof: 'Official fan zone activations & viral player locker challenges',
            benchmark: 'Proven by Charlotte FC & Leicester City Matchday Fan Zones'
        },
        malls_outlets: {
            peerAccount: '@southcentremall & @eastmidlandsoutlet',
            peerProof: '10,000+ weekend dwell-time customer interactions',
            benchmark: 'Proven by Southcentre Mall & East Midlands Designer Outlet'
        },
        activity_parks: {
            peerAccount: 'SuperPark (@superparkmy, @superparksg) & JumpYard',
            peerProof: '500+ daily matches per table with automated digital leaderboard',
            benchmark: 'Proven by SuperPark & JumpYard Activity Parks'
        },
        social_bars: {
            peerAccount: 'Flight Club, Lane7 & Bradley\'s Bar (@bradleysbarandgrill)',
            peerProof: '500M+ global video views driving viral guest sharing',
            benchmark: 'Proven by Bradley\'s Bar & European Competitive Socialising Hubs'
        }
    };
    return peerMap[category] || peerMap.social_bars;
}

// ── Sleep helper for rate limiting ───────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Main fetch with retry ────────────────────────────────────────────────────
async function fetchPlaces(query, apiKey) {
    const response = await fetch(PLACES_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify({
            textQuery: query,
            maxResultCount: 10,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Places API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.places || [];
}

// ── Netlify handler ──────────────────────────────────────────────────────────
exports.handler = async function(event) {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' },
            body: '',
        };
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }),
        };
    }

    const params = event.queryStringParameters || {};
    const categoryFilter = params.category || null; // optional filter
    const regionFilter = params.region || null;     // optional region filter (e.g. UK, NORDICS, EUROPE, USA)
    const limitParam = parseInt(params.limit || '300', 10);
    console.log(`[B2B AI Fetch] Category: ${categoryFilter || 'ALL'} | Region: ${regionFilter || 'ALL'} | Limit: ${limitParam}`);

    // ── Fetch telemetry insights ONCE (parallel with first Places call) ──
    const telemetryPromise = fetchTelemetryInsights();

    const categoriesToFetch = categoryFilter
        ? { [categoryFilter]: SEARCH_QUERIES[categoryFilter] || [] }
        : SEARCH_QUERIES;

    // Filter cities by region if requested
    let targetCities = CITIES;
    if (regionFilter && regionFilter !== 'ALL') {
        const matched = CITIES.filter(c => c.region === regionFilter || (regionFilter === 'USA' && c.region === 'NORTH_AMERICA'));
        if (matched.length > 0) targetCities = matched;
    }

    const seen = new Set();
    const rawResults = [];
    let totalRequests = 0;

    // Balanced Round-Robin: Pick queries across categories and top cities evenly
    const catKeys = Object.keys(categoriesToFetch);
    const maxRounds = 3; // up to 3 queries per category per city

    for (let round = 0; round < maxRounds; round++) {
        for (const city of targetCities) {
            if (rawResults.length >= limitParam) break;

            for (const category of catKeys) {
                if (rawResults.length >= limitParam) break;

                const queryList = categoriesToFetch[category];
                if (!queryList || round >= queryList.length) continue;

                const baseQuery = queryList[round];
                const query = `${baseQuery} in ${city.name}`;

                try {
                    const places = await fetchPlaces(query, apiKey);
                    totalRequests++;

                    const peerInfo = getPeerBenchmark(category);

                    for (const place of places) {
                        const placeId = place.id;
                        if (!placeId || seen.has(placeId)) continue;
                        seen.add(placeId);

                        const baseScore = calcBaseScore(place, category);
                        if (baseScore < 20) continue; // skip very low quality

                        rawResults.push({
                            id: placeId,
                            name: place.displayName?.text || 'Unknown',
                            chain: place.displayName?.text?.split(' ').slice(0, 2).join(' ') || 'Unknown',
                            city: city.name,
                            country: city.country,
                            region: city.region,
                            category,
                            baseScore,
                            rating: place.rating || null,
                            reviewCount: place.userRatingCount || 0,
                            website: place.websiteUri || null,
                            phone: place.nationalPhoneNumber || null,
                            address: place.shortFormattedAddress || place.formattedAddress || null,
                            lat: place.location?.latitude || null,
                            lng: place.location?.longitude || null,
                            benchmark: peerInfo.benchmark,
                            peerAccount: peerInfo.peerAccount,
                            peerProof: peerInfo.peerProof,
                            description: `${place.displayName?.text || 'Venue'} — ${place.shortFormattedAddress || city.name}. Verified Lookalike Peer: ${peerInfo.peerAccount} (${peerInfo.peerProof}).`,
                            source: 'google_places',
                        });
                    }

                    // Rate limit polite delay (150ms)
                    await sleep(150);

                } catch (err) {
                    console.error(`Error fetching "${query}":`, err.message);
                }
            }
        }
        if (rawResults.length >= limitParam) break;
    }

    // ── Apply AI Smart Scoring with telemetry data ──
    const telemetryInsights = await telemetryPromise;
    const results = rawResults.map(prospect => {
        const { smartScore, reasons, baseScore, bonus } = calcSmartScore(
            prospect.baseScore, prospect.category, prospect.city, telemetryInsights
        );
        return {
            ...prospect,
            matchScore: smartScore,         // backwards compatible field name
            aiSmartScore: smartScore,
            aiReasons: reasons,
            aiBaseScore: baseScore,
            aiBonus: bonus,
        };
    });

    // Sort by AI smart score descending
    results.sort((a, b) => b.matchScore - a.matchScore);
    
    const avgBonus = results.length > 0 
        ? Math.round(results.reduce((s, r) => s + r.aiBonus, 0) / results.length) 
        : 0;
    console.log(`[B2B AI Result] ${results.length} prospects | ${totalRequests} API calls | avg AI bonus: +${avgBonus}pts | telemetry venues: ${telemetryInsights.activeVenues.length}`);

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400', // cache 24h
        },
        body: JSON.stringify({
            success: true,
            count: results.length,
            totalApiRequests: totalRequests,
            generatedAt: new Date().toISOString(),
            aiEnriched: true,
            telemetryVenues: telemetryInsights.activeVenues.length,
            categoryPerformance: telemetryInsights.categoryPerformance,
            prospects: results,
        }),
    };
};
