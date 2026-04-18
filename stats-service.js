import { _supabase, state, FLAGS } from './config.js';
import { showLoading, hideLoading, safeHTML, unsafeHTML } from './ui-utils.js';

/**
 * ============================================================
 * STATS SERVICE
 * Handles Leaderboard and Match History
 * ============================================================
 */

let lbMode = 'players'; // 'players' or 'teams'

export async function fetchLB() {
    showLoading('Fetching Rankings...');
    try {
        const lbData = document.getElementById('lb-data');
        if (!lbData) return;

        let html = `
            <div style="text-align:center; margin-bottom:15px;">
                <h2 style="font-family:var(--sub-name-font); font-size:1.5rem; color:var(--sub-gold); margin:0; letter-spacing:2px;">GLOBAL RANKING</h2>
            </div>`;

        if (FLAGS.ENABLE_TEAMS) {
            html += `
            <div style="display:flex; justify-content:center; gap: 10px; margin-bottom: 25px;">
                <button id="lb-toggle-players" style="flex:1; padding: 10px; font-family:'Russo One'; font-size: 0.9rem; border:none; border-radius:4px; cursor:pointer; background: ${lbMode === 'players' ? 'var(--sub-gold)' : '#222'}; color: ${lbMode === 'players' ? '#000' : '#888'}; transition: background 0.3s;">TOP PLAYERS</button>
                <button id="lb-toggle-teams" style="flex:1; padding: 10px; font-family:'Russo One'; font-size: 0.9rem; border:none; border-radius:4px; cursor:pointer; background: ${lbMode === 'teams' ? 'var(--sub-gold)' : '#222'}; color: ${lbMode === 'teams' ? '#000' : '#888'}; transition: background 0.3s;">TOP TEAMS</button>
            </div>`;
        } else {
            html += `<div style="font-size:0.7rem; color:#666; letter-spacing:3px; margin-top:5px; margin-bottom: 25px; text-align: center;">TOP PLAYERS</div>`;
            lbMode = 'players'; // Force players mode
        }

        html += `<div id="lb-content"></div>`;
        lbData.innerHTML = html;

        if (FLAGS.ENABLE_TEAMS) {
            document.getElementById('lb-toggle-players').addEventListener('click', () => { lbMode = 'players'; fetchLB(); });
            document.getElementById('lb-toggle-teams').addEventListener('click', () => { lbMode = 'teams'; fetchLB(); });
        }

        const contentDiv = document.getElementById('lb-content');

        if (lbMode === 'players') {
            await renderPlayersLB(contentDiv);
        } else {
            await renderTeamsLB(contentDiv);
        }
    } finally {
        hideLoading();
    }
}

async function renderPlayersLB(container) {
    const { data } = await _supabase.from('players').select('*, team_data:teams!players_team_id_fkey(*)').or('wins.gt.0,losses.gt.0').order('elo', { ascending: false });

    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">No players yet</div>';
        return;
    }

    let html = '';

    // Top 3 Podium
    if (data.length >= 1) {
        html += '<div class="podium-section">';
        const top3 = data.slice(0, 3);

        top3.forEach((player, i) => {
            const rank = i + 1;
            const imageSrc = player.avatar_url || 'placeholder-silhouette-5-wide.png';
            const flag = player.country ? player.country.toLowerCase() : 'fi';
            const teamTag = player.team_data ? unsafeHTML(`<div style="color:var(--sub-gold); font-size:0.6rem; margin-bottom:2px; font-weight:bold;">[${player.team_data.tag}]</div>`) : '';

            html += safeHTML`
            <div class="podium-place p-${rank}">
                <div class="podium-card" data-username="${player.username}" style="cursor:pointer;">
                    <img src="${imageSrc}" alt="${player.username}" onerror="this.src='placeholder-silhouette-5-wide.png'">
                    <div class="podium-card-overlay">
                        ${teamTag}
                        <img src="https://flagcdn.com/w40/${flag}.png" style="width:16px; height:auto; margin-bottom:3px; border-radius:1px; box-shadow:0 1px 3px rgba(0,0,0,0.5);">
                        <div class="podium-name">${player.username}</div>
                        <div class="podium-elo">${Math.round(player.elo)}</div>
                    </div>
                </div>
                <div class="podium-step">${rank}</div>
            </div>`;
        });
        html += '</div>';
    }

    // Rest of the players (4+)
    if (data.length > 3) {
        html += '<h3 style="font-family:var(--sub-name-font); color:#444; margin:20px 0 15px 0; font-size:0.75rem; text-transform:uppercase; letter-spacing:3px; text-align:center;">CONTENDERS</h3>';
        html += data.slice(3).map((p, i) => {
            const flag = p.country ? p.country.toLowerCase() : 'fi';
            const rank = i + 4;
            const teamTag = p.team_data ? unsafeHTML(`<span style="color:var(--sub-gold); font-size:0.7rem; margin-right:5px; font-weight:bold;">[${p.team_data.tag}]</span>`) : '';
            return safeHTML`
            <div class="ranking-row" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:#0a0a0a; border-radius:var(--sub-radius); margin-bottom:10px; border:1px solid #222; border-left:2px solid #333; transition:all 0.3s ease;" data-username="${p.username}">
                <div style="display:flex; align-items:center; gap:15px;">
                    <span style="color:#444; font-family:var(--sub-name-font); font-size:0.8rem; min-width:30px;">#${rank}</span>
                    <img src="https://flagcdn.com/w40/${flag}.png" style="height:12px; width:auto; border-radius:1px;">
                    <span class="lb-name" style="font-size:1rem !important;">${teamTag}${p.username}</span>
                </div>
                <span class="lb-elo" style="font-size:1.1rem !important;">${p.elo}</span>
            </div>`;
        }).join('');
    }

    container.innerHTML = html;
}

async function renderTeamsLB(container) {
    const { data } = await _supabase.from('teams').select('*').order('combined_elo', { ascending: false });

    if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">No teams founded yet</div>';
        return;
    }

    let html = '';

    // Top 3 Podium for Teams
    if (data.length >= 1) {
        html += '<div class="podium-section">';
        const top3 = data.slice(0, 3);

        top3.forEach((team, i) => {
            const rank = i + 1;
            const imageSrc = team.logo_url || 'placeholder-silhouette-5-wide.png';

            html += `
            <div class="podium-place p-${rank}">
                <div class="podium-card" style="cursor:default; border: 2px solid var(--sub-gold);">
                    <img src="${imageSrc}" alt="${team.name}" onerror="this.src='placeholder-silhouette-5-wide.png'">
                    <div class="podium-card-overlay">
                        <div style="color:var(--sub-gold); font-size:0.6rem; margin-bottom:2px; font-weight:bold;">[${team.tag}]</div>
                        <div class="podium-name" style="font-size:0.65rem;">${team.name}</div>
                        <div class="podium-elo">${team.combined_elo}</div>
                    </div>
                </div>
                <div class="podium-step">${rank}</div>
            </div>`;
        });
        html += '</div>';
    }

    // Rest of the teams (4+)
    if (data.length > 3) {
        html += '<h3 style="font-family:var(--sub-name-font); color:#444; margin:20px 0 15px 0; font-size:0.75rem; text-transform:uppercase; letter-spacing:3px; text-align:center;">CONTENDERS</h3>';
        html += data.slice(3).map((t, i) => {
            const rank = i + 4;
            const logoHtml = t.logo_url
                ? `<img src="${t.logo_url}" style="width:24px; height:24px; border-radius: 4px; object-fit: cover;">`
                : `<div style="width:24px; height:24px; border-radius:4px; background:#222; display:flex; justify-content:center; align-items:center; color: var(--sub-gold); font-size: 0.6rem;"><i class="fa-solid fa-shield"></i></div>`;

            return `
            <div class="ranking-row" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:#0a0a0a; border-radius:var(--sub-radius); margin-bottom:10px; border:1px solid #222; border-left:2px solid var(--sub-gold); transition:all 0.3s ease;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <span style="color:#444; font-family:var(--sub-name-font); font-size:0.8rem; min-width:30px;">#${rank}</span>
                    ${logoHtml}
                    <div>
                        <div class="lb-name" style="font-size:0.9rem !important;">${t.name}</div>
                        <div style="color:var(--sub-gold); font-size:0.7rem; font-weight:bold;">[${t.tag}]</div>
                    </div>
                </div>
                <span class="lb-elo" style="font-size:1.1rem !important; color:var(--sub-gold);">${t.combined_elo}</span>
            </div>`;
        }).join('');
    }

    container.innerHTML = html;
}

export async function fetchHist() {
    showLoading('Fetching History...');
    try {
        const { data: tourData } = await _supabase.from('tournament_history').select('*, events(event_name)').order('created_at', { ascending: false });
        const { data: matchData } = await _supabase.from('matches').select('*').order('created_at', { ascending: false });

        const histList = document.getElementById('hist-list');
        if (!histList) return;

        if ((!tourData || tourData.length === 0) && (!matchData || matchData.length === 0)) {
            histList.innerHTML = "No history.";
            return;
        }

        const events = {};

        // Group regular tournaments
        if (tourData) {
            tourData.forEach(h => {
                const eventName = h.events?.event_name || h.event_name || 'Individual Tournaments';
                if (!events[eventName]) events[eventName] = [];
                events[eventName].push(h);
            });
        }

        // Group standalone matches (Arcade mode, Quick matches)
        const standaloneMatches = matchData ? matchData.filter(m => !m.tournament_id) : [];
        if (standaloneMatches.length > 0) {
            events['Free Play & Arcade'] = [{ is_standalone_group: true, name: 'Recent Matches', matches: standaloneMatches, created_at: standaloneMatches[0].created_at }];
        }

        let html = "";
        for (const eventName in events) {
            html += `<div class="event-group"><h2 class="event-title">${eventName}</h2>`;
            
            html += events[eventName].map((h) => {
                if (h.is_standalone_group) {
                    // Render standalone arcade/quick matches
                    const matchesHtml = h.matches.map(m => {
                        const date = new Date(m.created_at);
                        const fDate = `${date.getDate()}.${date.getMonth() + 1}. ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
                        const tName = m.tournament_name || 'Verified Session';
                        const scoreStr = (m.player1_score !== null && m.player2_score !== null) ? `${m.player1_score} - ${m.player2_score}` : 'WIN';
                        return `
                        <div style="background:#111; padding:10px; border-radius:5px; margin-top:5px; font-size:0.8rem; border-left:2px solid var(--sub-red); position:relative;">
                            <div style="color:var(--sub-gold); font-size:0.7rem; margin-bottom:5px; font-weight:bold;">[${tName}]</div>
                            <b>${m.winner}</b> defeated ${m.winner === m.player1 ? m.player2 : m.player1} <span style="color:#aaa;">(${scoreStr})</span>
                            <div style="position: absolute; bottom: 10px; right: 10px; font-size: 0.6rem; color: #666;">${fDate}</div>
                        </div>`;
                    }).join('');

                    return `
                    <div class="ranking-row" style="background:#0a0a0a; padding:15px; border-radius:var(--sub-radius); border:1px solid #222; border-left:2px solid var(--sub-gold); margin-bottom:10px;">
                        <div style="font-family: var(--sub-name-font); font-size: 1rem; margin-bottom: 8px; text-transform:uppercase; color:var(--sub-gold);">${h.name}</div>
                        <div style="margin-top:10px;">${matchesHtml}</div>
                    </div>`;
                } else {
                    // Render traditional tournament history
                    const tourMatches = matchData ? matchData.filter(m => m.tournament_id === h.id) : [];
                    const tourPlayers = [...new Set(tourMatches.flatMap(m => [m.player1, m.player2]))];
                    const playersJsonString = JSON.stringify([...new Set(tourPlayers)]);
                    const matchesHtml = tourMatches.map(m => `<div style="background:#111; padding:10px; border-radius:5px; margin-top:5px; font-size:0.8rem;"><b>${m.winner}</b> defeated ${m.winner === m.player1 ? m.player2 : m.player1}</div>`).join('');
                    const date = new Date(h.created_at);
                    const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;

                    let podiumHtml = `<div style="font-family: var(--sub-body-font); font-size:0.85rem; color:#fff;">`;
                    if (h.winner_name) podiumHtml += `<div>🏆 ${h.winner_name}</div>`;
                    if (h.second_place_name) podiumHtml += `<div style="color:#ccc; font-size:0.8rem; margin-top:2px;">🥈 ${h.second_place_name}</div>`;
                    if (h.third_place_name) podiumHtml += `<div style="color:#cd7f32; font-size:0.8rem; margin-top:2px;">🥉 ${h.third_place_name}</div>`;
                    podiumHtml += `</div>`;

                    return `<div class="ranking-row" style="background:#0a0a0a; padding:15px; border-radius:var(--sub-radius); border:1px solid #222; border-left:2px solid var(--sub-gold); margin-bottom:10px; position: relative; display:block; text-align:left;">
                    <div style="position: absolute; top: 15px; right: 15px; cursor: pointer; font-size: 1rem; z-index: 5; opacity:0.6;" data-replay-players='${playersJsonString}' data-replay-name="${h.tournament_name}">🔄</div>
                    <div style="cursor:pointer;" data-toggle-tournament="${h.id}"><div style="font-family: var(--sub-name-font); font-size: 1rem; margin-bottom: 8px; text-transform:uppercase; color:var(--sub-gold);">${h.tournament_name}</div>${podiumHtml}</div>
                    <div id="tour-matches-${h.id}" style="display:none; margin-top:10px;">${matchesHtml}</div>
                    <div style="position: absolute; bottom: 10px; right: 10px; font-size: 0.6rem; color: #666;">${formattedDate}</div>
                </div>`;
                }
            }).join('');
            
            html += `</div>`;
        }
        histList.innerHTML = html;
    } finally {
        hideLoading();
    }
}