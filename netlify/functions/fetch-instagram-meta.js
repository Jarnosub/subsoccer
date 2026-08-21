// netlify/functions/fetch-instagram-meta.js
// Fetches thumbnail, caption, and creator handle for Instagram Reels / Posts

exports.handler = async function(event, context) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    let url = '';
    try {
        const body = JSON.parse(event.body || '{}');
        url = (body.url || '').trim();
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Invalid JSON body' })
        };
    }

    if (!url) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'URL is required' })
        };
    }

    // Extract Instagram Shortcode
    const match = url.match(/\/(?:reel|p|reels)\/([A-Za-z0-9_-]+)/);
    const shortcode = match ? match[1] : '';

    if (!shortcode) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Invalid Instagram Reel / Post URL' })
        };
    }

    const canonicalUrl = `https://www.instagram.com/reel/${shortcode}/`;

    let thumbnailUrl = '';
    let title = '';
    let creatorHandle = '@subsoccer_official';

    const META_APP_ID = process.env.META_APP_ID || '4677371669026047';
    const META_APP_SECRET = process.env.META_APP_SECRET || 'd26c15075a9e44a744fd2fea9825031a';
    const metaToken = `${META_APP_ID}|${META_APP_SECRET}`;

    // 0. Try official Meta oEmbed API
    try {
        const oembedUrl = `https://graph.facebook.com/v20.0/instagram_oembed?url=${encodeURIComponent(canonicalUrl)}&access_token=${metaToken}`;
        const oembedRes = await fetch(oembedUrl);
        if (oembedRes.ok) {
            const oembedData = await oembedRes.json();
            if (oembedData) {
                if (oembedData.thumbnail_url) thumbnailUrl = oembedData.thumbnail_url;
                if (oembedData.author_name) creatorHandle = `@${oembedData.author_name}`;
                if (oembedData.title) title = decodeEntities(oembedData.title);
            }
        }
    } catch (oErr) {
        console.warn('Meta oEmbed attempt:', oErr.message);
    }

    // 1. Try fetching via facebookexternalhit User-Agent if thumbnail not found yet
    if (!thumbnailUrl || !title) {
        try {
            const response = await fetch(canonicalUrl, {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.html)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
            redirect: 'follow'
        });

        if (response.ok) {
            const html = await response.text();

            // Extract og:image
            const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                             html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
            if (imgMatch && imgMatch[1]) {
                thumbnailUrl = imgMatch[1].replace(/&amp;/g, '&');
            }

            // Extract og:title
            const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                              html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
            if (titleMatch && titleMatch[1]) {
                let rawTitle = decodeEntities(titleMatch[1]);
                // Often formatted as: "Handle on Instagram: "Caption...""
                const handleExtract = rawTitle.match(/^([A-Za-z0-9._]+)\s+on\s+Instagram:\s*["“]?([^"”]*)["”]?/i);
                if (handleExtract) {
                    creatorHandle = `@${handleExtract[1]}`;
                    if (handleExtract[2]) {
                        title = handleExtract[2].trim();
                    }
                } else {
                    title = rawTitle;
                }
            }

            // Extract og:description if title is short
            if (!title) {
                const descMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                                 html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
                if (descMatch && descMatch[1]) {
                    title = decodeEntities(descMatch[1]);
                }
            }
        }
    } catch (err) {
        console.warn('OpenGraph scrape warning:', err.message);
    }

    // 2. Fallback: if no thumbnail found, use Twitterbot UA
    if (!thumbnailUrl) {
        try {
            const twResponse = await fetch(canonicalUrl, {
                headers: {
                    'User-Agent': 'Twitterbot/1.0',
                    'Accept': 'text/html'
                }
            });
            if (twResponse.ok) {
                const twHtml = await twResponse.text();
                const twImgMatch = twHtml.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i) ||
                                  twHtml.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
                if (twImgMatch && twImgMatch[1]) {
                    thumbnailUrl = twImgMatch[1].replace(/&amp;/g, '&');
                }
            }
        } catch (e) {
            // Ignore fallback error
        }
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            url: canonicalUrl,
            instagram_id: shortcode,
            thumbnail_url: thumbnailUrl || '',
            title: title || '',
            creator_handle: creatorHandle || '@subsoccer_official'
        })
    };
};

function decodeEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
            try { return String.fromCodePoint(parseInt(hex, 16)); } catch(e) { return match; }
        })
        .replace(/&#([0-9]+);/g, (match, dec) => {
            try { return String.fromCodePoint(parseInt(dec, 10)); } catch(e) { return match; }
        })
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
