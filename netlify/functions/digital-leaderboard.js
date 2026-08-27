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
    // ─── GET: Fetch Leaderboard ───────────────────────────
    if (event.httpMethod === 'GET') {
      const mode = (event.queryStringParameters && event.queryStringParameters.mode) || 'cup';
      const filterRound = event.queryStringParameters && event.queryStringParameters.round && event.queryStringParameters.round !== 'all'
        ? Number(event.queryStringParameters.round)
        : null;
      
      let query = supabase
        .from('digital_game_plays')
        .select('id, winner, score_player, score_cpu, duration_s, player_name, country, user_agent, created_at')
        .eq('winner', 'player')
        .gt('duration_s', 0);

      if (mode === 'today') {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        query = query.gte('created_at', startOfDay.toISOString());
      }

      if (filterRound) {
        if (filterRound >= 2) {
          // Explicit round: must match CUP:R{filterRound}
          query = query.ilike('user_agent', `CUP:R${filterRound}%`);
        } else if (filterRound === 1) {
          // Round 1 includes all legacy plays plus CUP:R1 plays (exclude higher rounds R2-R5)
          query = query
            .not('user_agent', 'ilike', 'CUP:R2%')
            .not('user_agent', 'ilike', 'CUP:R3%')
            .not('user_agent', 'ilike', 'CUP:R4%')
            .not('user_agent', 'ilike', 'CUP:R5%');
        }
        query = query.order('duration_s', { ascending: true }).limit(30);
      } else {
        // Overall: get recent & top plays and sort by highest round then fastest time
        query = query.order('duration_s', { ascending: true }).limit(200);
      }

      const { data, error } = await query;
      let rawList = data || [];

      // Parse round number from user_agent
      let processed = rawList.map(item => {
        let round = 1;
        if (item.user_agent && item.user_agent.startsWith('CUP:R')) {
          const match = item.user_agent.match(/^CUP:R(\d+)/);
          if (match) round = parseInt(match[1], 10);
        } else if (item.round_reached) {
          round = Number(item.round_reached);
        }
        return {
          ...item,
          round: round || 1
        };
      });

      // Filter by specific round in case fallback legacy rows were included
      if (filterRound) {
        processed = processed.filter(item => item.round === filterRound);
      }

      // Sort by: Highest Round DESC, then Duration ASC (or if single round, purely Duration ASC)
      processed.sort((a, b) => {
        if (!filterRound && b.round !== a.round) return b.round - a.round;
        return (Number(a.duration_s) || 999) - (Number(b.duration_s) || 999);
      });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ leaderboard: processed.slice(0, 15) })
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
        country,
        round_reached
      } = body;

      const baseUA = (event.headers['user-agent'] || '').slice(0, 80);
      const cupRound = Number(round_reached) || 1;
      const user_agent = `CUP:R${cupRound}|${baseUA}`.slice(0, 120);

      const rawDuration = Number(duration_s);
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
        body: JSON.stringify({ ok: res.ok, round: cupRound })
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
