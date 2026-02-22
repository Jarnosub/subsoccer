import { _supabase, state } from './config.js';
import { showNotification } from './ui-utils.js';
import { BracketEngine } from './bracket-engine.js';
import { MatchService } from './match-service.js';

console.log('🏆 Tournament Module Loaded');

/**
 * ============================================================
 * TOURNAMENT ENGINE (Bracket System)
 * ============================================================
 */

let rP = [], rW = [], finalists = [], bronzeContenders = [], bronzeWinner = null, initialPlayerCount = 0;
let tournamentSessionGains = {}; // Seuraa kunkin pelaajan kokonaispisteitä turnauksen aikana
let tournamentSessionElos = {};  // Seuraa pelaajien viimeisintä ELO-lukua

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
        const byes = BracketEngine.calculateByes(state.pool.length);
        let shuffledPlayers = [...state.pool].sort(() => Math.random() - 0.5);
        rP = shuffledPlayers;
        rW = []; finalists = []; bronzeContenders = []; bronzeWinner = null;
        tournamentSessionGains = {};
        tournamentSessionElos = {};
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
        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:15px; font-size:0.8rem; color:#555; letter-spacing:2px; text-align:center;">Bronze Match</h3>`;
        a.appendChild(BracketEngine.renderMatch(
            bronzeContenders[0], 
            bronzeContenders[1], 
            0, 
            bronzeWinner, 
            'pickBronzeWinner', 
            { isBronze: true }
        ));

        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:15px; font-size:0.8rem; color:var(--sub-gold); letter-spacing:2px; text-align:center;">Final</h3>`;
        a.appendChild(BracketEngine.renderMatch(
            finalists[0], 
            finalists[1], 
            0, 
            rW[0], 
            'pickWin', 
            { isFinal: true }
        ));
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
        const winnerIndex = byes + index;
        
        a.appendChild(BracketEngine.renderMatch(
            p1, 
            p2, 
            winnerIndex, 
            rW[winnerIndex], 
            'pickWin'
        ));
        
        if (!p2) rW[winnerIndex] = p1;
    });

    if (playersWithBye.length > 0) {
        a.innerHTML += `<h4 style="font-family:var(--sub-name-font); text-transform:uppercase; margin: 20px 0 10px 0; opacity: 0.7; text-align:center;">Byes (Next Round)</h4>`;
        playersWithBye.forEach(p => {
            const byeEl = document.createElement('div');
            byeEl.innerHTML = `<div style="padding:10px 15px; background: #0a0a0a; border:1px solid #222; border-radius:10px; margin-bottom:10px; width:100%; max-width:400px; font-family:var(--sub-name-font); opacity:0.7; margin:0 auto 10px;">${p}</div>`;
            a.appendChild(byeEl);
        });
    }
    checkCompletion();
}

export async function pickWin(idx, n, e) {
    let p1, p2;
    if (finalists.length === 2) { p1 = finalists[0]; p2 = finalists[1]; }
    else {
        const match = BracketEngine.getMatchPlayers(rP, rW, idx);
        p1 = match.p1; p2 = match.p2;
    }
    if (p1 && p2) { 
        const result = await MatchService.recordMatch({
            player1Name: p1, player2Name: p2, winnerName: n, 
            tournamentId: state.currentTournamentId, tournamentName: "Tournament"
        });

        if (result.success) {
            // Kumuloidaan pisteet ja päivitetään viimeisin ELO
            tournamentSessionGains[n] = (tournamentSessionGains[n] || 0) + result.gain;
            tournamentSessionElos[n] = result.newElo;
        }
    }
    rW[idx] = n;
    e.parentElement.querySelectorAll('div').forEach(d => { d.style.background = "transparent"; d.style.opacity = "0.5"; });
    e.style.background = "rgba(227, 6, 19, 0.4)"; e.style.opacity = "1";
    checkCompletion();
}

export async function pickBronzeWinner(idx, n, e) {
    const result = await MatchService.recordMatch({
        player1Name: bronzeContenders[0], player2Name: bronzeContenders[1], winnerName: n,
        tournamentId: state.currentTournamentId, tournamentName: "Tournament (Bronze)"
    });
    if (result.success) {
        tournamentSessionGains[n] = (tournamentSessionGains[n] || 0) + result.gain;
    }
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
        rW = []; // Tyhjennetään voittajat, jotta finaaliin ei tule esivalittua voittajaa
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
        // Fix: Use 'id' to match the UUID used in matches, and add organizer_id
        const dataToInsert = { id: state.currentTournamentId, tournament_name: tournamentName, winner_name: winnerName };
        
        if (state.user && state.user.id && state.user.id !== 'guest') {
            dataToInsert.organizer_id = state.user.id;
        }
        
        if (bronzeWinner) dataToInsert.third_place_name = bronzeWinner;
        
        const { error } = await _supabase.from('tournament_history').insert([dataToInsert]);
        if (error) throw error;

        // Haetaan voittajan todellinen ELO ja saatu pistemäärä animaatiota varten
        let winnerElo = 0;
        let winnerGain = 0;
        if (winnerName) {
            // Haetaan tuorein ELO tietokannasta (rekisteröidyt) tai käytetään finaalin tulosta (vieraat)
            const { data: p } = await _supabase.from('players').select('elo').eq('username', winnerName).maybeSingle();
            
            winnerElo = p ? p.elo : (tournamentSessionElos[winnerName] || 0);
            winnerGain = tournamentSessionGains[winnerName] || 0;
        }

        state.pool = []; 
        document.getElementById('tour-engine').style.display = 'none';
        document.getElementById('tour-setup').style.display = 'block';
        state.currentPage = 'history';
        showNotification('Tournament saved successfully!', 'success');
        
        state.victoryData = { winnerName, winnerElo, winnerGain };

        // Päivitetään kirjautuneen käyttäjän tila, jos hän voitti
        if (state.user && winnerName === state.user.username) {
            const { data } = await _supabase.from('players').select('*').eq('id', state.user.id).maybeSingle();
            if (data) { state.user = data; }
        }
    } catch (error) {
        console.error('Error saving tournament:', error);
        showNotification('Failed to save tournament: ' + error.message, 'error');
    }
}

export function replayTournament(players, tourName) {
    state.pool = [...players];
    state.currentPage = 'tournament';
    showNotification(`Players for "${tourName}" loaded!`, 'success');
}