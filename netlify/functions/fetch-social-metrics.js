/**
 * fetch-social-metrics.js
 * Netlify Function — Social Media Metrics Fetcher
 *
 * Fetches view counts, likes, and comments for YouTube and TikTok videos
 * stored in ugc_posts table, and syncs metrics back to social_content.
 *
 * YouTube: Uses YouTube Data API v3 (requires YOUTUBE_API_KEY env var)
 * TikTok:  Uses free oEmbed endpoint (no auth required)
 *
 * GET /.netlify/functions/fetch-social-metrics
 *   ?platform=youtube|tiktok|all  (optional, default: all)
 */

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPA_URL, SUPA_KEY);

// ── YouTube Data API v3 ──────────────────────────────────────────────────────
async function fetchYouTubeMetrics(videoIds, apiKey) {
    const results = [];
    // API allows up to 50 IDs per request
    const chunks = [];
    for (let i = 0; i < videoIds.length; i += 50) {
        chunks.push(videoIds.slice(i, i + 50));
    }

    for (const chunk of chunks) {
        const ids = chunk.map(v => v.videoId).join(',');
        const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids}&key=${apiKey}`;
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`YouTube API error: ${response.status}`);
                continue;
            }
            const data = await response.json();
            
            for (const item of (data.items || [])) {
                const stats = item.statistics || {};
                const snippet = item.snippet || {};
                const original = chunk.find(v => v.videoId === item.id);
                
                results.push({
                    videoId: item.id,
                    platform: 'youtube',
                    title: snippet.title || '',
                    author: snippet.channelTitle || '',
                    views: parseInt(stats.viewCount || '0', 10),
                    likes: parseInt(stats.likeCount || '0', 10),
                    comments: parseInt(stats.commentCount || '0', 10),
                    publishedAt: snippet.publishedAt || null,
                    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || null,
                    postId: original?.postId || null,
                    url: original?.url || null,
                });
            }
        } catch (err) {
            console.error('YouTube fetch error:', err.message);
        }
    }
    return results;
}

// ── TikTok oEmbed (free, no auth) ────────────────────────────────────────────
async function fetchTikTokMetrics(videos) {
    const results = [];
    
    for (const video of videos) {
        try {
            const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(video.url)}`;
            const response = await fetch(oembedUrl, {
                headers: { 'User-Agent': 'Subsoccer-Analytics/1.0' }
            });
            
            if (!response.ok) {
                console.warn(`TikTok oEmbed failed for ${video.url}: ${response.status}`);
                continue;
            }
            
            const data = await response.json();
            
            results.push({
                videoId: video.videoId,
                platform: 'tiktok',
                title: data.title || '',
                author: data.author_name || '',
                authorUrl: data.author_url || '',
                thumbnail: data.thumbnail_url || null,
                // oEmbed doesn't return view counts directly, but we store what we get
                views: null, // TikTok oEmbed doesn't expose this
                likes: null,
                comments: null,
                postId: video.postId,
                url: video.url,
                embedHtml: data.html || null,
            });
        } catch (err) {
            console.warn(`TikTok oEmbed error for ${video.url}:`, err.message);
        }
        // Rate limit
        await new Promise(r => setTimeout(r, 200));
    }
    return results;
}

// ── Extract video ID from URL ────────────────────────────────────────────────
function extractYouTubeId(url) {
    if (!url) return null;
    // youtube.com/watch?v=ID
    const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];
    // youtu.be/ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    // youtube.com/shorts/ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
    // youtube.com/embed/ID
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];
    return null;
}

function extractTikTokId(url) {
    if (!url) return null;
    const match = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
    return match ? match[1] : null;
}

// ── Netlify Handler ──────────────────────────────────────────────────────────
exports.handler = async function(event) {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' };
    }

    const params = event.queryStringParameters || {};
    const platformFilter = params.platform || 'all';
    
    console.log(`[Social Metrics] Fetching metrics for platform: ${platformFilter}`);

    // 1. Read all UGC posts from Supabase
    const { data: ugcPosts, error: ugcError } = await supabase
        .from('ugc_posts')
        .select('post_id, url, platform, author, title');
    
    if (ugcError) {
        console.error('UGC posts fetch error:', ugcError.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to fetch UGC posts' }),
        };
    }

    const allResults = { youtube: [], tiktok: [], synced: 0, errors: 0 };

    // 2. YouTube metrics
    if (platformFilter === 'all' || platformFilter === 'youtube') {
        const youtubeApiKey = process.env.YOUTUBE_API_KEY;
        
        if (youtubeApiKey) {
            const ytVideos = (ugcPosts || [])
                .filter(p => p.platform === 'youtube' && p.url)
                .map(p => ({
                    postId: p.post_id,
                    url: p.url,
                    videoId: extractYouTubeId(p.url),
                }))
                .filter(v => v.videoId);

            console.log(`[Social Metrics] Found ${ytVideos.length} YouTube videos to fetch`);
            
            if (ytVideos.length > 0) {
                allResults.youtube = await fetchYouTubeMetrics(ytVideos, youtubeApiKey);
                
                // Sync to social_content table
                for (const yt of allResults.youtube) {
                    try {
                        await supabase.from('social_content').upsert({
                            reel_id: `yt-${yt.videoId}`,
                            url: yt.url || `https://www.youtube.com/watch?v=${yt.videoId}`,
                            platform: 'youtube',
                            caption: yt.title,
                            event_name: yt.author,
                            views: yt.views,
                            likes: yt.likes,
                            comments: yt.comments,
                            active: true,
                        }, { onConflict: 'reel_id' });
                        allResults.synced++;
                    } catch (e) {
                        console.warn('Social content sync error:', e.message);
                        allResults.errors++;
                    }
                }
            }
        } else {
            console.warn('[Social Metrics] YOUTUBE_API_KEY not configured — skipping YouTube');
        }
    }

    // 3. TikTok metrics (oEmbed, no API key needed)
    if (platformFilter === 'all' || platformFilter === 'tiktok') {
        const ttVideos = (ugcPosts || [])
            .filter(p => p.platform === 'tiktok' && p.url)
            .map(p => ({
                postId: p.post_id,
                url: p.url,
                videoId: extractTikTokId(p.url),
            }))
            .filter(v => v.videoId);

        console.log(`[Social Metrics] Found ${ttVideos.length} TikTok videos to fetch`);
        
        if (ttVideos.length > 0) {
            allResults.tiktok = await fetchTikTokMetrics(ttVideos);
            
            // Sync to social_content table
            for (const tt of allResults.tiktok) {
                try {
                    const upsertData = {
                        reel_id: `tt-${tt.videoId}`,
                        url: tt.url,
                        platform: 'tiktok',
                        caption: tt.title,
                        event_name: tt.author,
                        active: true,
                    };
                    // Only update numeric fields if oEmbed returned them
                    if (tt.views !== null) upsertData.views = tt.views;
                    if (tt.likes !== null) upsertData.likes = tt.likes;
                    if (tt.comments !== null) upsertData.comments = tt.comments;
                    
                    await supabase.from('social_content').upsert(upsertData, { onConflict: 'reel_id' });
                    allResults.synced++;
                } catch (e) {
                    console.warn('TikTok social content sync error:', e.message);
                    allResults.errors++;
                }
            }
        }
    }

    console.log(`[Social Metrics] Complete: YouTube=${allResults.youtube.length}, TikTok=${allResults.tiktok.length}, Synced=${allResults.synced}`);

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
            success: true,
            fetchedAt: new Date().toISOString(),
            youtube: {
                count: allResults.youtube.length,
                totalViews: allResults.youtube.reduce((s, v) => s + (v.views || 0), 0),
                videos: allResults.youtube.map(v => ({
                    videoId: v.videoId,
                    title: v.title,
                    author: v.author,
                    views: v.views,
                    likes: v.likes,
                })),
            },
            tiktok: {
                count: allResults.tiktok.length,
                videos: allResults.tiktok.map(v => ({
                    videoId: v.videoId,
                    title: v.title,
                    author: v.author,
                    url: v.url,
                })),
            },
            synced: allResults.synced,
            errors: allResults.errors,
        }),
    };
};
