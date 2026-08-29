const https = require('https');

const UGC_WEBHOOK_SECRET = process.env.UGC_WEBHOOK_SECRET || 'subsoccer-pro-ugc-2026';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-subsoccer-key, x-api-key, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

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

  // ─── GET: Health & Status Check ────────────────────────
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        status: 'active',
        service: 'Subsoccer Pro UGC Webhook & Social Listening Ingestion API',
        endpoint: '/.netlify/functions/ugc-webhook',
        supported_platforms: ['instagram', 'tiktok', 'youtube', 'facebook', 'x'],
        known_venues_count: UGC_KNOWN_VENUES.length,
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

      if (!author) author = '@community';
      if (!title) title = 'Subsoccer Social Match Highlight';

      const combinedText = `${url} ${caption} ${title} ${author}`;
      const matched = matchVenue(combinedText);

      const processedPost = {
        id: 'ugc-auto-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5),
        url,
        platform,
        author,
        title: title.split('\n')[0].substring(0, 120),
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
