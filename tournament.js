import { _supabase, state } from './config.js';
import { showNotification, showPage, showVictoryAnimation, updatePoolUI, updateProfileCard } from './ui.js';

console.log('🏆 Tournament Module Loaded');

/**
 * ============================================================
 * TOURNAMENT ENGINE (Bracket System)
 * ============================================================
 */

let rP = [], rW = [], finalists = [], bronzeContenders = [], bronzeWinner = null, initialPlayerCount = 0;

export function startTournament() {
    if (state.pool.length < 2) return showNotification("Min 2 players for a tournament!", "error");
    try {
        // Fallback jos uuid-kirjastoa ei ole ladattu globaalisti
        state.currentTournamentId = (typeof uuid !== 'undefined') 
            ? uuid.v4() 
            : Math.random().toString(36).substring(2) + Date.now().toString(36);
            
        initialPlayerCount = state.pool.length;
        document.getElementById('tour-setup').style.display = 'none';
        document.getElementById('tour-engine').style.display = 'flex';
        document.getElementById('save-btn').style.display = 'none';
        const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(state.pool.length)));
        const byes = nextPowerOfTwo - state.pool.length;
        let shuffledPlayers = [...state.pool].sort(() => Math.random() - 0.5);
        rP = shuffledPlayers;
        rW = []; finalists = []; bronzeContenders = []; bronzeWinner = null;
        drawRound(byes);
    } catch (e) {
        showNotification("Error starting tournament: " + e.message, "error");
        console.error(e);
    }
}

export function drawRound(byes = 0) {
    const a = document.getElementById('bracket-area'); a.innerHTML = "";
    if (finalists.length === 0) rW = [];

    if (finalists.length === 2) {
        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:15px; font-size:0.8rem; color:#555; letter-spacing:2px;">Bronze Match</h3>`;
        const bMatch = document.createElement('div');
        bMatch.className = "bracket-match";
        bMatch.style = "background:#0a0a0a; border:1px solid #222; border-radius:var(--sub-radius); margin-bottom:25px; width:100%; overflow:hidden;";
        bMatch.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); text-transform:uppercase;" onclick="pickBronzeWinner('${bronzeContenders[0]}', this)">${bronzeContenders[0]}</div><div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); border-top:1px solid #222; text-transform:uppercase;" onclick="pickBronzeWinner('${bronzeContenders[1]}', this)">${bronzeContenders[1]}</div>`;
        a.appendChild(bMatch);
        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:15px; font-size:0.8rem; color:var(--sub-gold); letter-spacing:2px;">Final</h3>`;
        const fMatch = document.createElement('div');
        fMatch.className = "bracket-match";
        fMatch.style = "background:#0a0a0a; border:1px solid var(--sub-gold); border-radius:var(--sub-radius); width:100%; overflow:hidden;";
        fMatch.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); text-transform:uppercase;" onclick="pickWin(0, '${finalists[0]}', this)">${finalists[0]}</div><div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); border-top:1px solid #222; text-transform:uppercase;" onclick="pickWin(0, '${finalists[1]}', this)">${finalists[1]}</div>`;
        a.appendChild(fMatch);
        checkCompletion();
        return;
    }

    if (rP.length === 1 && finalists.length === 0) {
        a.innerHTML = `<div class="container" style="text-align:center;"><h2>🏆 WINNER: ${rP[0]}</h2></div>`;
        if (bronzeWinner) a.innerHTML += `<div class="container" style="text-align:center; margin-top:10px;"><h3>🥉 Bronze: ${bronzeWinner}</h3></div>`;
        document.getElementById('save-btn').style.display = 'block';
        document.getElementById('next-rd-btn').style.display = 'none';
        return;
    }

    const matches = [];
    const playersWithBye = rP.slice(0, byes);
    const playersInMatches = rP.slice(byes);
    playersWithBye.forEach(p => rW.push(p));
    for (let i = 0; i < playersInMatches.length; i += 2) matches.push([playersInMatches[i], playersInMatches[i+1]]);

    matches.forEach((match, index) => {
        const [p1, p2] = match;
        const m = document.createElement('div');
        m.className = "bracket-match";
        m.style.background = "#0a0a0a"; m.style.border = "1px solid #222"; m.style.borderRadius = "var(--sub-radius)"; m.style.marginBottom = "10px"; m.style.width = "100%"; m.style.overflow = "hidden";
        const winnerIndex = byes + index;
        if (!p2) { m.innerHTML = `<div style="padding:15px; opacity:0.5; font-family:var(--sub-name-font); text-transform:uppercase;">${p1} (BYE)</div>`; rW[winnerIndex] = p1; }
        else { m.innerHTML = `<div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); text-transform:uppercase;" onclick="pickWin(${winnerIndex}, '${p1}', this)">${p1}</div><div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); border-top:1px solid #222; text-transform:uppercase;" onclick="pickWin(${winnerIndex}, '${p2}', this)">${p2}</div>`; }
        a.appendChild(m);
    });

    if (playersWithBye.length > 0) {
        a.innerHTML += `<h4 style="font-family:'Russo One'; text-transform:uppercase; margin: 20px 0 10px 0; opacity: 0.7;">Byes (Next Round)</h4>`;
        playersWithBye.forEach(p => {
            const byeEl = document.createElement('div');
            byeEl.innerHTML = `<div style="padding:10px 15px; background: #0a0a0a; border:1px solid #222; border-radius:10px; margin-bottom:10px; width:100%; font-family:'Russo One'; opacity:0.7;">${p}</div>`;
            a.appendChild(byeEl);
        });
    }
    checkCompletion();
}

export function pickWin(idx, n, e) {
    let p1, p2;
    if (finalists.length === 2) { p1 = finalists[0]; p2 = finalists[1]; }
    else {
        const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(rP.length || 1)));
        const byes = nextPowerOfTwo - rP.length;
        const playersInMatches = rP.slice(byes);
        const matchIndex = idx - byes;
        p1 = playersInMatches[matchIndex * 2]; p2 = playersInMatches[matchIndex * 2 + 1];
    }
    if (p1 && p2) { const tournamentName = "Tournament"; if (window.saveMatch) window.saveMatch(p1, p2, n, tournamentName); }
    rW[idx] = n;
    e.parentElement.querySelectorAll('div').forEach(d => { d.style.background = "transparent"; d.style.opacity = "0.5"; });
    e.style.background = "rgba(227, 6, 19, 0.4)"; e.style.opacity = "1";
    checkCompletion();
}

export function pickBronzeWinner(n, e) {
    const tournamentName = "Tournament";
    if (window.saveMatch) window.saveMatch(bronzeContenders[0], bronzeContenders[1], n, tournamentName + " (Bronze)");
    bronzeWinner = n;
    e.parentElement.querySelectorAll('div').forEach(d => { d.style.background = "transparent"; d.style.opacity = "0.5"; });
    e.style.background = "rgba(255, 215, 0, 0.3)"; e.style.opacity = "1";
    checkCompletion();
}

export function checkCompletion() {
    const nextBtn = document.getElementById('next-rd-btn');
    if (!nextBtn) return;
    const byes = Math.pow(2, Math.ceil(Math.log2(rP.length || 1))) - rP.length;
    const matchesToPlay = (rP.length - byes) / 2;
    const expectedWinners = byes + matchesToPlay;
    const pickedWinners = rW.filter(w => w).length;
    if (finalists.length === 2) {
        if (rW[0] && bronzeWinner) { nextBtn.innerText = 'FINISH TOURNAMENT'; nextBtn.style.display = 'block'; }
        else { nextBtn.style.display = 'none'; }
    } else if (pickedWinners === expectedWinners && matchesToPlay > 0) { nextBtn.innerText = 'NEXT ROUND'; nextBtn.style.display = 'block'; }
    else { nextBtn.style.display = 'none'; }
}

export function advanceRound() {
    const nextBtn = document.getElementById('next-rd-btn');
    if (!nextBtn) return;
    if (nextBtn.innerText === 'FINISH TOURNAMENT') { rP = rW.filter(w => w); saveTour(); return; }
    if (rP.length === 4) {
        const losers = rP.filter(p => !rW.includes(p));
        bronzeContenders = [...losers];
        finalists = [...rW.filter(w => w)];
        drawRound(); return;
    }
    rP = rW.filter(w => w);
    const nextByes = Math.pow(2, Math.ceil(Math.log2(rP.length || 1))) - rP.length;
    nextBtn.style.display = 'none';
    drawRound(nextByes);
}

export async function saveTour() {
    try {
        const winnerName = rP[0];
        const tournamentName = "Tournament";
        const dataToInsert = { tournament_name: tournamentName, winner_name: winnerName, tournament_id: state.currentTournamentId };
        if (bronzeWinner) dataToInsert.third_place_name = bronzeWinner;
        
        const { error } = await _supabase.from('tournament_history').insert([dataToInsert]);
        if (error) throw error;

        state.pool = []; 
        updatePoolUI();
        document.getElementById('tour-engine').style.display = 'none';
        document.getElementById('tour-setup').style.display = 'block';
        showPage('history');
        showNotification('Tournament saved successfully!', 'success');
        
        if (typeof showVictoryAnimation === 'function') showVictoryAnimation(winnerName, 0, 0);
    } catch (error) {
        console.error('Error saving tournament:', error);
        showNotification('Failed to save tournament: ' + error.message, 'error');
    }
}

export function replayTournament(players, tourName) {
    state.pool = [...players];
    showPage('tournament');
    updatePoolUI();
    showNotification(`Players for "${tourName}" loaded!`, 'success');
}

window.startTournament = startTournament;
window.drawRound = drawRound;
window.pickWin = pickWin;
window.pickBronzeWinner = pickBronzeWinner;
window.checkCompletion = checkCompletion;
window.advanceRound = advanceRound;
window.saveTour = saveTour;
window.replayTournament = replayTournament;