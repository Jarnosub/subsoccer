const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const items = JSON.parse(event.body || '[]');

  let processed = 0;
  let errors = [];

  for (const item of items) {
    if (!item.reel_id) continue;
    const row = {
      reel_id: item.reel_id,
      url: item.url || `https://www.instagram.com/reel/${item.reel_id}/`,
      platform: item.platform || 'instagram',
      caption: item.caption || null,
      taken_at: item.taken_at || null,
      event_name: item.author ? (item.author.startsWith('@') ? item.author : '@' + item.author) : null,
      active: true,
      updated_at: new Date().toISOString()
    };
    if (item.likes !== undefined && item.likes !== null) row.likes = item.likes;
    if (item.views !== undefined && item.views !== null) row.views = item.views;
    if (item.tags) row.tags = item.tags;

    const { error } = await supabase
      .from('social_content')
      .upsert(row, { onConflict: 'reel_id' });

    if (error) {
      errors.push({ reel_id: item.reel_id, msg: error.message });
    } else {
      processed++;
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, processed, errors: errors.slice(0, 5) })
  };
};
