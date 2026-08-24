const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  try {
    // ─── GET: Fetch Today's Leaderboard ───────────────────
    if (event.httpMethod === 'GET') {
      const mode = (event.queryStringParameters && event.queryStringParameters.mode) || 'today';
      
      let query = supabase
        .from('digital_game_plays')
        .select('id, winner, score_player, score_cpu, duration_s, player_name, country, created_at')
        .eq('winner', 'player')
        .gt('duration_s', 0)
        .order('duration_s', { ascending: true })
        .limit(10);

      if (mode === 'today') {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        query = query.gte('created_at', startOfDay.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        // If player_name or country column is missing, query standard columns
        let fallbackQuery = supabase
          .from('digital_game_plays')
          .select('id, winner, score_player, score_cpu, duration_s, created_at')
          .eq('winner', 'player')
          .gt('duration_s', 0)
          .order('duration_s', { ascending: true })
          .limit(10);
          
        if (mode === 'today') {
          const startOfDay = new Date();
          startOfDay.setUTCHours(0, 0, 0, 0);
          fallbackQuery = fallbackQuery.gte('created_at', startOfDay.toISOString());
        }
        
        const fb = await fallbackQuery;
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ leaderboard: fb.data || [] })
        };
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ leaderboard: data || [] })
      };
    }

    // ─── POST: Submit Game Result ─────────────────────────
    if (event.httpMethod === 'POST') {
      let body = {};
      try {
        body = JSON.parse(event.body || '{}');
      } catch (e) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
      }

      const {
        winner,
        score_player,
        score_cpu,
        duration_s,
        player_name,
        country
      } = body;

      const user_agent = (event.headers['user-agent'] || '').slice(0, 120);
      const rawDuration = Number(duration_s);
      // DB column is now numeric(6,1) — store with one decimal precision (e.g. 15.8s stays 15.8)
      const durVal = !isNaN(rawDuration) && rawDuration > 0 ? Math.round(rawDuration * 10) / 10 : null;

      const payload = {
        winner: winner || 'player',
        score_player: Number(score_player) || 0,
        score_cpu: Number(score_cpu) || 0,
        duration_s: durVal,
        user_agent
      };

      if (player_name) payload.player_name = String(player_name).slice(0, 24).trim();
      if (country) payload.country = String(country).slice(0, 4).toUpperCase();

      const postToSupabase = async (body) => fetch(`${SUPABASE_URL}/rest/v1/digital_game_plays`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(body)
      });

      let res = await postToSupabase(payload);

      // Fallback 1: remove optional columns (player_name / country may not exist yet)
      if (!res.ok) {
        const p2 = { winner: payload.winner, score_player: payload.score_player, score_cpu: payload.score_cpu, duration_s: payload.duration_s, user_agent };
        res = await postToSupabase(p2);
      }

      // Fallback 2: remove duration_s too (in case column type mismatch)
      if (!res.ok) {
        const p3 = { winner: payload.winner, score_player: payload.score_player, score_cpu: payload.score_cpu, user_agent };
        res = await postToSupabase(p3);
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: res.ok })
      };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Leaderboard error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
