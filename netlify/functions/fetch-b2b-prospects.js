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

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.id,places.types,places.shortFormattedAddress';

// ── Search query bank ────────────────────────────────────────────────────────
const SEARCH_QUERIES = {
    activity_parks: [
        'trampoline park indoor',
        'activity park indoor family',
        'adventure park indoor climbing',
        'JumpYard trampoline',
        'SuperPark activity',
        'Clip n Climb indoor',
    ],
    malls_outlets: [
        'designer outlet shopping centre',
        'premium outlet village',
        'Westfield shopping centre',
        'McArthurGlen outlet',
        'luxury retail mall',
    ],
    social_bars: [
        'competitive socialising bar',
        'Flight Club darts bar',
        'Junkyard Golf bar',
        'Puttshack mini golf bar',
        'social entertainment venue bar',
        'bowling alley bar entertainment',
    ],
    sports_clubs: [
        'padel centre indoor',
        'indoor football centre five-a-side',
        'sports lounge bar football',
        'table football venue bar',
        'foosball bar venue',
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
    { name: 'Toronto', country: 'Canada', region: 'NORTH_AMERICA' },
    { name: 'Dubai', country: 'UAE', region: 'MIDDLE_EAST' },
];

// ── Match Score Calculator ───────────────────────────────────────────────────
function calcMatchScore(place, category) {
    let score = 0;

    // Rating quality
    if (place.rating >= 4.5) score += 30;
    else if (place.rating >= 4.0) score += 20;
    else if (place.rating >= 3.5) score += 10;

    // Review volume (social proof = foot traffic)
    const reviews = place.userRatingCount || 0;
    if (reviews >= 1000) score += 25;
    else if (reviews >= 500) score += 20;
    else if (reviews >= 200) score += 15;
    else if (reviews >= 100) score += 8;

    // Has a website (professional operation)
    if (place.websiteUri) score += 15;

    // Has phone (contactable)
    if (place.nationalPhoneNumber) score += 5;

    // Category-specific bonus
    const types = place.types || [];
    if (category === 'activity_parks' && types.some(t => ['amusement_center', 'sports_complex', 'gym'].includes(t))) score += 25;
    else if (category === 'malls_outlets' && types.some(t => ['shopping_mall', 'department_store'].includes(t))) score += 25;
    else if (category === 'social_bars' && types.some(t => ['bar', 'restaurant', 'night_club'].includes(t))) score += 25;
    else if (category === 'sports_clubs' && types.some(t => ['sports_club', 'gym', 'stadium'].includes(t))) score += 25;
    else score += 10; // partial category match

    return Math.min(score, 100);
}

// ── Category → chain/benchmark lookup ───────────────────────────────────────
function getBenchmark(category) {
    const benchmarks = {
        activity_parks: 'High foot-traffic indoor family activity — similar to SuperPark / JumpYard model',
        malls_outlets:  'Premium retail destination — similar to Westfield / McArthurGlen with dining & entertainment',
        social_bars:    'Competitive socialising venue — similar to Flight Club / Puttshack social entertainment model',
        sports_clubs:   'Indoor sports facility with lounge — similar to padel centres and 5-a-side clubs',
    };
    return benchmarks[category] || 'High-traffic entertainment venue';
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
    const limitParam = parseInt(params.limit || '300', 10);

    const categoriesToFetch = categoryFilter
        ? { [categoryFilter]: SEARCH_QUERIES[categoryFilter] || [] }
        : SEARCH_QUERIES;

    const seen = new Set();
    const results = [];
    let totalRequests = 0;

    for (const [category, queries] of Object.entries(categoriesToFetch)) {
        for (const baseQuery of queries) {
            // Only run against a subset of cities to stay within quota
            const citiesToUse = CITIES.slice(0, 20);

            for (const city of citiesToUse) {
                if (results.length >= limitParam) break;

                const query = `${baseQuery} in ${city.name}`;
                try {
                    const places = await fetchPlaces(query, apiKey);
                    totalRequests++;

                    for (const place of places) {
                        const placeId = place.id;
                        if (!placeId || seen.has(placeId)) continue;
                        seen.add(placeId);

                        const score = calcMatchScore(place, category);
                        if (score < 30) continue; // skip very low quality

                        results.push({
                            id: placeId,
                            name: place.displayName?.text || 'Unknown',
                            chain: place.displayName?.text?.split(' ').slice(0, 2).join(' ') || 'Unknown',
                            city: city.name,
                            country: city.country,
                            region: city.region,
                            category,
                            matchScore: score,
                            rating: place.rating || null,
                            reviewCount: place.userRatingCount || 0,
                            website: place.websiteUri || null,
                            phone: place.nationalPhoneNumber || null,
                            address: place.shortFormattedAddress || place.formattedAddress || null,
                            benchmark: getBenchmark(category),
                            description: `${place.displayName?.text || 'Venue'} — ${place.shortFormattedAddress || city.name}. Rating: ${place.rating || 'N/A'} (${place.userRatingCount || 0} reviews).`,
                            source: 'google_places',
                        });
                    }

                    // Polite rate limiting — 200ms between requests
                    await sleep(200);

                } catch (err) {
                    console.error(`Error fetching "${query}":`, err.message);
                    // Continue to next query instead of failing completely
                }

                if (results.length >= limitParam) break;
            }

            if (results.length >= limitParam) break;
        }
    }

    // Sort by match score descending
    results.sort((a, b) => b.matchScore - a.matchScore);

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
            prospects: results,
        }),
    };
};
