/**
 * Subsoccer Location Data Normalizer
 * 
 * Fixes:
 * 1. London boroughs → actual cities (Glasgow, Edinburgh etc stay separate)
 * 2. Jakarta districts → Jakarta, ID
 * 3. Fake timezones (Europe/Liverpool) → proper format
 * 4. Old timezone-only → keep but mark as timezone-only (can't determine city)
 * 
 * IMPORTANT: Only actual London boroughs get merged to London.
 * Glasgow, Edinburgh, Leeds etc are REAL cities, not London boroughs.
 */

const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_ANON = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;

// Use service key for writes, anon for reads
const readHeaders = {
    'apikey': SUPABASE_ANON,
    'Authorization': 'Bearer ' + SUPABASE_ANON,
};
const writeHeaders = {
    'apikey': SUPABASE_SERVICE || SUPABASE_ANON,
    'Authorization': 'Bearer ' + (SUPABASE_SERVICE || SUPABASE_ANON),
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
};

// ============================================
// NORMALIZATION RULES
// ============================================

// London boroughs → "London, GB (Europe/London)"
// ONLY actual London boroughs - NOT other UK cities!
const LONDON_BOROUGHS = new Set([
    'Walworth', 'Hackney', 'Leytonstone', 'Shepperton', 'Islington',
    'Morden', 'Raynes Park', 'Walthamstow', 'Camden', 'City of London',
    'Woolwich', 'Fulham', 'Hemel Hempstead', 'Walton on Thames',
    'Sutton', 'Croydon', 'Thornton Heath', 'Ilford', 'Kensington',
    'Streatham', 'Sudbury', 'Leyton', 'Enfield', 'Horley', 'Brent',
    'Lewisham', 'Lambeth', 'Watford', 'Greenford', 'Orpington',
    'Waltham Cross', 'Dagenham', 'Tower Hamlets', 'Hounslow',
    'Wokingham', 'High Wycombe', 'Havant', 'Hayling Island'
]);

// UK cities that are NOT London — keep as-is
const UK_REAL_CITIES = new Set([
    'Glasgow', 'Edinburgh', 'Leeds', 'Manchester', 'Liverpool',
    'Birmingham', 'Nottingham', 'Leicester', 'Southampton', 'Oxford',
    'Portsmouth', 'Southsea', 'Derby', 'Salford', 'Solihull',
    'Rotherham', 'Letchworth Garden City', 'Basingstoke', 'Luton',
    'Falkirk', 'Rochester', 'Dudley', 'Greenock', 'Stockport',
    'Truro', 'Wednesbury', 'Caerphilly', 'Gateshead', 'Dundee',
    'Hamilton', 'Telford', 'Guildford', 'Chorley', 'Swanley'
]);

// Jakarta districts → "Jakarta, ID (Asia/Jakarta)"
const JAKARTA_DISTRICTS = new Set([
    'Central Jakarta', 'East Jakarta', 'West Jakarta', 'North Jakarta',
    'South Jakarta', 'South Tangerang', 'Tangerang', 'Ancol', 'Bogor'
]);

// Fake timezones → proper city format
const FAKE_TIMEZONE_MAP = {
    'Europe/Vigo': 'Vigo, ES (Europe/Madrid)',
    'Europe/Liverpool': 'Liverpool, GB (Europe/London)',
    'Europe/Lambeth': 'London, GB (Europe/London)',
    'America/Renton': 'Renton, US (America/Los_Angeles)',
    'Europe/Chorley': 'Chorley, GB (Europe/London)',
    'America/San_Bernardino': 'San Bernardino, US (America/Los_Angeles)',
    'America/Seattle': 'Seattle, US (America/Los_Angeles)',
    'Europe/Naaldwijk': 'Naaldwijk, NL (Europe/Amsterdam)',
    'Europe/Swanley': 'Swanley, GB (Europe/London)',
    'Europe/Birmingham': 'Birmingham, GB (Europe/London)',
    'America/Henderson': 'Henderson, US (America/Los_Angeles)',
    'Europe/Croydon': 'London, GB (Europe/London)',
    'America/Brooklyn': 'Brooklyn, US (America/New_York)',
    'Europe/Islington': 'London, GB (Europe/London)',
    'Europe/Leeds': 'Leeds, GB (Europe/London)',
    'Europe/Espoo': 'Espoo, FI (Europe/Helsinki)',
    'Europe/Basingstoke': 'Basingstoke, GB (Europe/London)',
    'Europe/Bracknell': 'Bracknell, GB (Europe/London)',
    'Europe/Portsmouth': 'Portsmouth, GB (Europe/London)',
    'Europe/Nottingham': 'Nottingham, GB (Europe/London)',
    'Europe/Glasgow': 'Glasgow, GB (Europe/London)',
    'Europe/Leipzig': 'Leipzig, DE (Europe/Berlin)',
    'Europe/Szigetszentmiklós': 'Szigetszentmiklós, HU (Europe/Budapest)',
    'Asia/East_Jakarta': 'Jakarta, ID (Asia/Jakarta)',
    'Asia/Central_Jakarta': 'Jakarta, ID (Asia/Jakarta)',
    'Asia/West_Jakarta': 'Jakarta, ID (Asia/Jakarta)',
    'Asia/Caloocan': 'Caloocan, PH (Asia/Manila)',
    'Asia/Pasig': 'Pasig, PH (Asia/Manila)',
    'Asia/Quezon_City': 'Quezon City, PH (Asia/Manila)',
    'Asia/Pangil': 'Pangil, PH (Asia/Manila)',
    'Asia/Gangnam-gu': 'Seoul, KR (Asia/Seoul)',
    'Asia/San_Juan': 'San Juan, PH (Asia/Manila)',
    'Asia/Mumbai': 'Mumbai, IN (Asia/Kolkata)',
    'Asia/Petaling_Jaya': 'Petaling Jaya, MY (Asia/Kuala_Lumpur)',
    'America/El_Segundo': 'El Segundo, US (America/Los_Angeles)',
    'America/Minneapolis': 'Minneapolis, US (America/Chicago)',
    'America/San_Diego': 'San Diego, US (America/Los_Angeles)',
    'America/Detroit': 'Detroit, US (America/New_York)',
    'Europe/Podgorica': 'Podgorica, ME (Europe/Podgorica)',
};

// ============================================
// NORMALIZE FUNCTION
// ============================================
function normalizeLocation(loc) {
    if (!loc) return null;

    // 1. Fake timezone → proper format
    if (FAKE_TIMEZONE_MAP[loc]) {
        return FAKE_TIMEZONE_MAP[loc];
    }

    // 2. Check GB cities
    const gbMatch = loc.match(/^([^,]+),\s*GB\s*\(Europe\/London\)/);
    if (gbMatch) {
        const cityName = gbMatch[1].trim();
        if (LONDON_BOROUGHS.has(cityName)) {
            return 'London, GB (Europe/London)';
        }
        // Real UK cities stay as-is
        return loc;
    }

    // 3. Jakarta districts
    const jaMatch = loc.match(/^([^,]+),\s*ID\s*\(Asia\/Jakarta\)/);
    if (jaMatch) {
        const district = jaMatch[1].trim();
        if (JAKARTA_DISTRICTS.has(district)) {
            return 'Jakarta, ID (Asia/Jakarta)';
        }
        return loc;
    }

    // 4. "GB (Europe/London)" country-only → keep as "GB (Europe/London)"
    // These can't be resolved to a city

    // 5. Pure timezone strings are left as-is (can't determine city)

    return loc;
}

// ============================================
// MAIN - DRY RUN + APPLY
// ============================================
async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const apply = process.argv.includes('--apply');

    if (!dryRun && !apply) {
        console.log('Usage: node normalize-cities.js --dry-run  (preview changes)');
        console.log('       SUPABASE_SERVICE_KEY=xxx node normalize-cities.js --apply  (apply to database)');
        return;
    }

    if (apply && !SUPABASE_SERVICE) {
        console.error('❌ SUPABASE_SERVICE_KEY env var tarvitaan kirjoitukseen!');
        console.log('   SUPABASE_SERVICE_KEY=xxx node normalize-cities.js --apply');
        console.log('   Avain: Supabase Dashboard → Settings → API → service_role (secret)');
        return;
    }

    console.log(dryRun ? '🔍 DRY RUN — esikatselu\n' : '🔧 APPLYING — päivitetään tietokantaa\n');

    // Fetch all records with location
    let all = []; let page = 0;
    while (true) {
        const res = await fetch(SUPABASE_URL + '/rest/v1/public_tracking?select=id,location&location=not.is.null&limit=1000&offset=' + (page * 1000), { headers: readHeaders });
        const d = await res.json();
        if (!d || d.length === 0) break;
        all.push(...d);
        if (d.length < 1000) break;
        page++; if (page > 50) break;
    }

    console.log('Rivejä yhteensä:', all.length);

    // Find changes
    const changes = [];
    all.forEach(row => {
        const normalized = normalizeLocation(row.location);
        if (normalized && normalized !== row.location) {
            changes.push({ id: row.id, from: row.location, to: normalized });
        }
    });

    console.log('Muutoksia:', changes.length);

    // Summary by change type
    const changeSummary = {};
    changes.forEach(c => {
        const key = c.from + ' → ' + c.to;
        changeSummary[key] = (changeSummary[key] || 0) + 1;
    });

    console.log('\nMuutokset:');
    Object.entries(changeSummary).sort((a, b) => b[1] - a[1]).forEach(([change, count]) => {
        console.log('  ' + count.toString().padStart(4) + '  ' + change);
    });

    // Count cities before and after
    const citiesBefore = new Set(all.map(r => r.location));
    const citiesAfter = new Set(all.map(r => normalizeLocation(r.location) || r.location));
    console.log('\nUniikit sijainnit ennen:', citiesBefore.size);
    console.log('Uniikit sijainnit jälkeen:', citiesAfter.size);

    // Count proper cities (format: "City, XX (timezone)")
    const properBefore = [...citiesBefore].filter(l => l.match(/^[^,]+,\s*\w{2}\s*\(/)).length;
    const allAfter = [...citiesAfter];
    const properAfter = allAfter.filter(l => l.match(/^[^,]+,\s*\w{2}\s*\(/)).length;
    console.log('Oikeita kaupunkeja ennen:', properBefore);
    console.log('Oikeita kaupunkeja jälkeen:', properAfter);

    if (apply && changes.length > 0) {
        console.log('\n🔧 Päivitetään tietokantaa...');
        let updated = 0;
        let errors = 0;

        // Batch by target value for efficiency
        const batches = {};
        changes.forEach(c => {
            if (!batches[c.from]) batches[c.from] = c.to;
        });

        for (const [fromLoc, toLoc] of Object.entries(batches)) {
            const res = await fetch(
                SUPABASE_URL + '/rest/v1/public_tracking?location=eq.' + encodeURIComponent(fromLoc),
                {
                    method: 'PATCH',
                    headers: writeHeaders,
                    body: JSON.stringify({ location: toLoc })
                }
            );
            if (res.ok) {
                const count = changeSummary[fromLoc + ' → ' + toLoc];
                updated += count;
                process.stdout.write('  ✅ ' + fromLoc + ' → ' + toLoc + ' (' + count + ' riviä)\n');
            } else {
                errors++;
                const text = await res.text();
                console.log('  ❌ ' + fromLoc + ': ' + res.status + ' ' + text);
            }
        }

        console.log('\n✅ Päivitetty:', updated, 'riviä');
        if (errors > 0) console.log('❌ Virheitä:', errors);
    }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
