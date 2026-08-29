const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const UGC_WEBHOOK_SECRET = process.env.UGC_WEBHOOK_SECRET || 'subsoccer-pro-ugc-2026';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-subsoccer-key, x-api-key, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// In-memory ring buffer for recent incoming webhook posts across serverless invocations
let _RECENT_WEBHOOK_POSTS = [];

const UGC_KNOWN_VENUES = [
  { match: /lauttasaari|melkonkatu|@originalsubsoccer/i, name: 'Subsoccer HQ (Melkonkatu 24, Lauttasaari)', lat: 60.1555, lng: 24.8870, code: 'PUBLIC-APP', isHq: true },
  { match: /superpark|glasgow/i, name: 'SuperPark Glasgow, Scotland, UK', lat: 55.8642, lng: -4.2518, code: 'PUBLIC-APP' },
  { match: /tripla|pasila/i, name: 'Mall of Tripla (Pasila, Helsinki)', lat: 60.1989, lng: 24.9317, code: 'PUBLIC-APP' },
  { match: /trnava/i, name: 'Trnava, Slovakia', lat: 48.3762, lng: 17.5829, code: 'DOCK-1-SERIE001' },
  { match: /midlands|mcarthurglen/i, name: 'East Midlands Designer Outlet, UK', lat: 53.1076, lng: -1.3106, code: 'COMMUNITY-69590614-d9aa-44f0-a8cf-2b1fe404559c' },
  { match: /philadelphia|fashion district/i, name: 'Fashion District Philadelphia, US', lat: 39.9526, lng: -75.1592, code: 'PUBLIC-APP' },
  { match: /kingston|princess st/i, name: 'Princess Street (Downtown Kingston, Ontario, Canada)', lat: 44.2312, lng: -76.4860, code: 'PUBLIC-APP' },
  { match: /limajuega|lima juega|@jugonesperu/i, name: 'Lima Juega Festival (Lima, Peru)', lat: -12.0464, lng: -77.0428, code: 'PUBLIC-APP' },
  { match: /katowice|gksgieksakatowice/i, name: 'GKS Katowice Fan Zone (Katowice, Poland)', lat: 50.2649, lng: 19.0238, code: 'PUBLIC-APP' },
  { match: /ostrava|banik/i, name: 'FC Banik Ostrava Stadium FanZone (Ostrava, Czech Republic)', lat: 49.8209, lng: 18.2625, code: 'PUBLIC-APP' },
  { match: /panamacityfc|panama/i, name: 'Panama City FC Stadium (Panama City, Panama)', lat: 8.9824, lng: -79.5199, code: 'PUBLIC-APP' },
  { match: /malta|footballstoremalta/i, name: 'Football Store Malta (Malta)', lat: 35.8989, lng: 14.5146, code: 'PUBLIC-APP' },
  { match: /luxembourg|scuderiaferrariclubluxembourg/i, name: 'Scuderia Ferrari Club (Luxembourg)', lat: 49.6116, lng: 6.1319, code: 'PUBLIC-APP' },
  { match: /providence|wpri/i, name: 'World Cup FanZone (Providence, Rhode Island, US)', lat: 41.8240, lng: -71.4128, code: 'PUBLIC-APP' }
];

function fetchInstagramOembed(url) {
  return new Promise((resolve) => {
    if (!url.includes('instagram.com')) {
      return resolve(null);
    }
    const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;
    const req = https.get(endpoint, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
      timeout: 6000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            title: json.title || '',
            author_name: json.author_name ? `@${json.author_name}` : '',
            thumbnail_url: json.thumbnail_url || ''
          });
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function detectPlatform(url) {
  if (!url) return 'other';
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'x';
  return 'other';
}

function matchVenue(text) {
  if (!text) return null;
  for (const v of UGC_KNOWN_VENUES) {
    if (v.match.test(text)) {
      return v;
    }
  }
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  // ─── GET: Health, Status & List Webhook Posts ────────────────────────
  if (event.httpMethod === 'GET') {
    const action = event.queryStringParameters && event.queryStringParameters.action;

    // Try fetching from Supabase if table exists, otherwise return memory cache
    let dbPosts = [];
    try {
      const { data, error } = await supabase
        .from('ugc_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) {
        dbPosts = data;
      }
    } catch (e) {
      // Table may not exist yet in Supabase, will use memory cache
    }

    const combined = [..._RECENT_WEBHOOK_POSTS, ...dbPosts];
    // Deduplicate by URL
    const seen = new Set();
    const uniquePosts = [];
    for (const p of combined) {
      if (p && p.url && !seen.has(p.url)) {
        seen.add(p.url);
        uniquePosts.push(p);
      }
    }

    if (action === 'list') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          count: uniquePosts.length,
          posts: uniquePosts
        })
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        status: 'active',
        service: 'Subsoccer Pro UGC Webhook & Social Listening Ingestion API',
        endpoint: '/.netlify/functions/ugc-webhook',
        supported_platforms: ['instagram', 'tiktok', 'youtube', 'facebook', 'x'],
        known_venues_count: UGC_KNOWN_VENUES.length,
        stored_posts_count: uniquePosts.length,
        time: new Date().toISOString()
      })
    };
  }

  // ─── POST: Ingest Video Link(s) ────────────────────────
  if (event.httpMethod === 'POST') {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid JSON payload' })
      };
    }

    // Security check
    const reqSecret = (event.headers && (event.headers['x-subsoccer-key'] || event.headers['x-api-key'])) ||
                      body.secret ||
                      (event.queryStringParameters && event.queryStringParameters.secret);

    if (UGC_WEBHOOK_SECRET && reqSecret !== UGC_WEBHOOK_SECRET) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Unauthorized: invalid or missing webhook secret/key' })
      };
    }

    // Support single item or array
    const rawItems = Array.isArray(body.items) ? body.items : [body];
    const results = [];

    for (const item of rawItems) {
      const url = (item.url || '').trim();
      if (!url || !url.startsWith('http')) continue;

      const platform = item.platform || detectPlatform(url);
      const caption = item.caption || item.text || item.title || '';
      const source = item.source || 'webhook';

      let author = item.author || '';
      let title = caption;

      // Try fetching oEmbed if Instagram
      if (platform === 'instagram') {
        const oembed = await fetchInstagramOembed(url);
        if (oembed) {
          if (!author && oembed.author_name) author = oembed.author_name;
          if (!title && oembed.title) title = oembed.title;
        }
      }

      if (!author) author = (platform === 'youtube') ? '@youtube' : (platform === 'tiktok' ? '@tiktok' : '@community');
      if (!title) title = `${platform.toUpperCase()} Subsoccer Match Clip`;

      const combinedText = `${url} ${caption} ${title} ${author}`;
      const matched = matchVenue(combinedText);

      const processedPost = {
        id: 'ugc-auto-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5),
        url,
        platform,
        author,
        title: title.split('\n')[0].substring(0, 140),
        location: matched ? matched.name : 'Community / Creator Post',
        lat: matched ? matched.lat : null,
        lng: matched ? matched.lng : null,
        table_code: matched ? matched.code : null,
        post_date: item.post_date || new Date().toISOString().split('T')[0],
        status: matched ? (matched.isHq ? 'surge_verified' : 'verified') : 'pending_auto',
        source,
        ingested_at: new Date().toISOString(),
        notes: matched ? `Auto-matched to venue ${matched.name} via ${source}` : `Auto-ingested community clip via ${source}`
      };

      results.push(processedPost);
      _RECENT_WEBHOOK_POSTS.unshift(processedPost);
      if (_RECENT_WEBHOOK_POSTS.length > 500) _RECENT_WEBHOOK_POSTS.pop();

      // Try inserting into Supabase ugc_posts table
      try {
        await supabase.from('ugc_posts').insert([{
          post_id: processedPost.id,
          url: processedPost.url,
          platform: processedPost.platform,
          author: processedPost.author,
          title: processedPost.title,
          location: processedPost.location,
          latitude: processedPost.lat,
          longitude: processedPost.lng,
          table_code: processedPost.table_code,
          post_date: processedPost.post_date,
          status: processedPost.status,
          source: processedPost.source,
          notes: processedPost.notes
        }]);
      } catch (dbErr) {
        // Safe failover if table doesn't exist
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: true,
        count: results.length,
        posts: results,
        message: `Successfully processed ${results.length} video(s)`
      })
    };
  }

  return {
    statusCode: 405,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
