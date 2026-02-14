import { _supabase, state } from './config.js';
import { viewPlayerCard, showLoading, hideLoading } from './ui.js';
import { replayTournament } from './tournament.js';

/**
 * ============================================================
 * STATS SERVICE
 * Handles Leaderboard and Match History
 * ============================================================
 */

export async function fetchLB() {
    showLoading('Fetching Rankings...');
    try {
    const { data } = await _supabase.from('players').select('*').order('elo', { ascending: false });
    
    if (!data || data.length === 0) {
        const lbData = document.getElementById('lb-data');
        if (lbData) lbData.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">No players yet</div>';
        return;
    }
    
    let html = '';
    
    // Top 3 Podium
    if (data.length >= 1) {
        const top3 = data.slice(0, 3);
        const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : 
                           top3.length === 2 ? [top3[1], top3[0]] : 
                           [top3[0]];
        
        html += '<div style="display:flex; align-items:flex-end; justify-content:center; gap:10px; margin-bottom:40px; padding:0 10px;">';
        
        podiumOrder.forEach((player, displayIndex) => {
            const actualRank = top3.indexOf(player);
            const flag = player.country ? player.country.toLowerCase() : 'fi';
            const medals = ['🥇', '🥈', '🥉'];
            const heights = ['160px', '120px', '100px'];
            const colors = ['var(--sub-gold)', '#C0C0C0', '#CD7F32'];
            
            if (player) {
                const rankIndex = top3.length === 2 && displayIndex === 0 ? 1 : 
                                 top3.length === 1 ? 0 : 
                                 actualRank;
                
                html += `
                    <div style="display:flex; flex-direction:column; align-items:center; flex:1; max-width:120px;">
                        <div style="font-size:2rem; margin-bottom:5px;">${medals[rankIndex]}</div>
                        <div style="background:#111; padding:10px; border-radius:var(--sub-radius); width:100%; text-align:center; margin-bottom:8px; border:1px solid ${colors[rankIndex]}; box-shadow: 0 10px 20px rgba(0,0,0,0.5);">
                            <img src="https://flagcdn.com/w40/${flag}.png" style="height:12px; width:auto; margin-bottom:5px; border-radius:1px;">
                            <div style="font-family:var(--sub-name-font); font-size:0.75rem; color:#fff; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-transform:uppercase;">${player.username}</div>
                            <div style="font-family:var(--sub-name-font); font-size:1.1rem; color:${colors[rankIndex]}; font-weight:bold;">${player.elo}</div>
                        </div>
                        <div style="background:linear-gradient(to bottom, ${colors[rankIndex]}, transparent); height:${heights[rankIndex]}; width:100%; border-radius:var(--sub-radius) var(--sub-radius) 0 0; opacity:0.4;"></div>
                    </div>
                `;
            }
        });
        html += '</div>';
    }
    
    // Rest of the players (4+)
    if (data.length > 3) {
        html += '<h3 style="font-family:var(--sub-name-font); color:#444; margin:20px 0 15px 0; font-size:0.75rem; text-transform:uppercase; letter-spacing:3px; text-align:center;">GLOBAL RANKINGS</h3>';
        html += data.slice(3).map((p, i) => {
            const flag = p.country ? p.country.toLowerCase() : 'fi';
            const rank = i + 4;
            return `
                <div class="ranking-row" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:#0a0a0a; border-radius:var(--sub-radius); margin-bottom:10px; border:1px solid #222; border-left:2px solid #333; transition:all 0.3s ease;" onclick="viewPlayerCard('${p.username}')">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <span style="color:#444; font-family:var(--sub-name-font); font-size:0.8rem; min-width:30px;">#${rank}</span>
                        <img src="https://flagcdn.com/w40/${flag}.png" style="height:12px; width:auto; border-radius:1px;">
                        <span class="lb-name" style="font-size:1rem !important;">${p.username}</span>
                    </div>
                    <span class="lb-elo" style="font-size:1.1rem !important;">${p.elo}</span>
                </div>
            `;
        }).join('');
    }
    
    const lbData = document.getElementById('lb-data');
    if (lbData) lbData.innerHTML = html;
    } finally {
        hideLoading();
    }
}

export async function fetchHist() {
    showLoading('Fetching History...');
    try {
    const { data: tourData } = await _supabase.from('tournament_history').select('*').order('created_at', { ascending: false });
    const { data: matchData } = await _supabase.from('matches').select('*').order('created_at', { ascending: false });
    
    if (!tourData || tourData.length === 0) { 
        const histList = document.getElementById('hist-list');
        if (histList) histList.innerHTML = "No history."; 
        return; 
    }

    const events = tourData.reduce((acc, h) => {
        const eventName = h.event_name || 'Individual Tournaments';
        if (!acc[eventName]) acc[eventName] = [];
        acc[eventName].push(h);
        return acc;
    }, {});

    let html = "";
    for (const eventName in events) {
        html += `<div class="event-group"><h2 class="event-title">${eventName}</h2>`;
        html += events[eventName].map((h) => {
            const tourMatches = matchData ? matchData.filter(m => m.tournament_id === h.tournament_id) : [];
            const tourPlayers = [...new Set(tourMatches.flatMap(m => [m.player1, m.player2]))];
            const playersJsonString = JSON.stringify([...new Set(tourPlayers)]);
            const matchesHtml = tourMatches.map(m => `<div style="background:#111; padding:10px; border-radius:5px; margin-top:5px; font-size:0.8rem;"><b>${m.winner}</b> defeated ${m.winner === m.player1 ? m.player2 : m.player1}</div>`).join('');
            const date = new Date(h.created_at);
            const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
            return `<div class="ranking-row" style="background:#0a0a0a; padding:15px; border-radius:var(--sub-radius); border:1px solid #222; border-left:2px solid var(--sub-gold); margin-bottom:10px; position: relative; display:block; text-align:left;"><div style="position: absolute; top: 15px; right: 15px; cursor: pointer; font-size: 1rem; z-index: 5; opacity:0.6;" onclick='event.stopPropagation(); replayTournament(${playersJsonString}, "${h.tournament_name}")'>🔄</div><div style="cursor:pointer;" onclick="const el = document.getElementById('tour-matches-${h.tournament_id}'); el.style.display = el.style.display === 'none' ? 'block' : 'none';"><div style="font-family: var(--sub-name-font); font-size: 1rem; margin-bottom: 8px; text-transform:uppercase; color:var(--sub-gold);">${h.tournament_name}</div><div style="font-family: var(--sub-body-font); font-size:0.85rem; color:#fff;">🏆 ${h.winner_name}</div></div><div id="tour-matches-${h.tournament_id}" style="display:none; margin-top:10px;">${matchesHtml}</div><div style="position: absolute; bottom: 10px; right: 10px; font-size: 0.6rem; color: #666;">${formattedDate}</div></div>`;
        }).join('');
        html += `</div>`;
    }
    const histList = document.getElementById('hist-list');
    if (histList) histList.innerHTML = html;
    } finally {
        hideLoading();
    }
}

window.fetchLB = fetchLB;
window.fetchHist = fetchHist;