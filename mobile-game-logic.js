// ============================================================
// SUBSOCCER MOBILE GAME LOGIC
// Standalone tournament engine for phone-only play (no TV)
// Uses BracketEngine directly, no arcadeSocket dependency
// ============================================================

import { BracketEngine } from './bracket-engine.js';

// --- AUTH STATE ---
let isLoggedIn = false;
const MAX_PLAYERS_GUEST = 2;
const MAX_PLAYERS_LOGGED = 8;

(async function checkMobileAuth() {
    try {
        const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
        const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
        const sb = supabase.createClient(SUPA_URL, SUPA_KEY);
        const { data: { session } } = await sb.auth.getSession();
        if (session && session.user) {
            isLoggedIn = true;
            updateAddPlayerButton();
        }
    } catch(e) { console.log('Auth check:', e.message); }
})();

function getMaxPlayers() {
    return isLoggedIn ? MAX_PLAYERS_LOGGED : MAX_PLAYERS_GUEST;
}

function updateAddPlayerButton() {
    const container = document.getElementById('m-players-list');
    const addBtn = document.getElementById('m-add-player-btn');
    if (!container || !addBtn) return;
    const count = container.children.length;
    const max = getMaxPlayers();
    // Always show the button
    addBtn.style.display = 'block';
    // Show/hide login upsell
    const upsell = document.getElementById('m-login-upsell');
    if (upsell) {
        upsell.style.display = (!isLoggedIn && count >= MAX_PLAYERS_GUEST) ? 'block' : 'none';
    }
    // Hide button only when logged in and at max
    if (isLoggedIn && count >= max) {
        addBtn.style.display = 'none';
    }
}

// --- GAME STATE ---
let gameState = {
    p1Score: 0,
    p2Score: 0,
    p1Name: "PLAYER 1",
    p2Name: "PLAYER 2",
    isTournament: false
};

let localEngine = null;
let matchTimerInterval = null;
let matchRemaining = 90;
let pMatchProcessing = false;
let currentPendingMatch = null;
let matchResults = []; // Track all match results for leaderboard

const GOALS_TO_WIN = 3; // Best of 5: first to 3 wins

// ============================================================
// LAYER SWITCHING
// ============================================================

function showLayer(layerId) {
    document.querySelectorAll('.m-layer').forEach(l => {
        l.style.display = 'none';
    });
    const target = document.getElementById(layerId);
    if (target) {
        target.style.display = 'flex';
    }
}

// ============================================================
// SETUP: Read players and start tournament
// ============================================================

window.mobileStartTournament = function() {
    const inputs = document.querySelectorAll('.player-input');
    const players = [];
    inputs.forEach(i => {
        if (i.value.trim()) players.push(i.value.trim());
    });

    if (players.length < 2 || players.length > 8) {
        alert("Tournament requires 2 to 8 players.");
        return;
    }

    gameState.isTournament = true;

    // Initialize BracketEngine
    localEngine = new BracketEngine({ 
        containerId: 'mobile-bracket-area', 
        enableSaveButton: false 
    });
    localEngine.generateBracket(players, true); // shuffle

    // Render bracket view
    renderMobileBracket();
    
    // Move to first match
    nextTournyMatch();
};

// ============================================================
// BRACKET RENDERING (Mobile-optimized)
// ============================================================

function renderMobileBracket() {
    const container = document.getElementById('mobile-bracket-area');
    if (!container || !localEngine) return;
    
    // BracketEngine render() method builds the DOM into the container
    localEngine.containerId = 'mobile-bracket-area';
    localEngine.render();
}

// ============================================================
// TOURNAMENT MATCH FLOW
// ============================================================

function getPendingMatch() {
    if (!localEngine) return null;
    const roundIdx = localEngine.getActiveRoundIndex();
    if (roundIdx >= localEngine.rounds.length) return null;

    const round = localEngine.rounds[roundIdx];
    for (let i = 0; i < round.length; i++) {
        const m = round[i];
        if (m.p1 && m.p2 && !m.winner && m.p1 !== 'BYE' && m.p2 !== 'BYE') {
            return { 
                rIndex: roundIdx, 
                mIndex: i, 
                p1: m.p1, 
                p2: m.p2, 
                roundName: localEngine.getRoundName(roundIdx, localEngine.rounds.length) 
            };
        }
    }
    return null;
}

function nextTournyMatch() {
    const pending = getPendingMatch();
    
    if (!pending) {
        // Tournament is complete!
        showTournamentComplete();
        return;
    }

    currentPendingMatch = pending;

    // Update the "next match" display
    document.getElementById('m-round-name').innerText = pending.roundName;
    document.getElementById('m-matchup-p1').innerText = pending.p1;
    document.getElementById('m-matchup-p2').innerText = pending.p2;

    // Update bracket rendering
    renderMobileBracket();

    // Show the "next match" layer
    showLayer('m-layer-nextmatch');
}

// ============================================================
// SCOREBOARD / GAME CONTROLS
// ============================================================

window.mobileStartMatch = function() {
    if (!currentPendingMatch) return;
    
    gameState.p1Score = 0;
    gameState.p2Score = 0;
    gameState.p1Name = currentPendingMatch.p1;
    gameState.p2Name = currentPendingMatch.p2;
    gameState.isTournament = true;
    pMatchProcessing = false;

    // Update scoreboard UI
    document.getElementById('m-p1-name').innerText = gameState.p1Name;
    document.getElementById('m-p2-name').innerText = gameState.p2Name;
    document.getElementById('m-score-p1').innerText = '0';
    document.getElementById('m-score-p2').innerText = '0';
    document.getElementById('m-goals-p1').innerText = '○○○';
    document.getElementById('m-goals-p2').innerText = '○○○';

    showLayer('m-layer-game');
};

window.mobileGoal = function(playerNumber) {
    if (pMatchProcessing) return;

    if (playerNumber === 1) {
        gameState.p1Score++;
        document.getElementById('m-score-p1').innerText = gameState.p1Score;
        updateGoalVisual('m-goals-p1', gameState.p1Score);
    }
    if (playerNumber === 2) {
        gameState.p2Score++;
        document.getElementById('m-score-p2').innerText = gameState.p2Score;
        updateGoalVisual('m-goals-p2', gameState.p2Score);
    }

    if (navigator.vibrate) navigator.vibrate(50);

    // Check if someone reached 3 goals
    if (gameState.p1Score >= GOALS_TO_WIN) {
        pMatchProcessing = true;
        setTimeout(() => finishMatch(gameState.p1Name, 1), 800);
    } else if (gameState.p2Score >= GOALS_TO_WIN) {
        pMatchProcessing = true;
        setTimeout(() => finishMatch(gameState.p2Name, 2), 800);
    }
};

function updateGoalVisual(elementId, score) {
    const filled = Math.min(score, GOALS_TO_WIN);
    const empty = GOALS_TO_WIN - filled;
    document.getElementById(elementId).innerText = '●'.repeat(filled) + '○'.repeat(empty);
}

window.mobileSkipMatch = function(winnerNumber) {
    if (pMatchProcessing) return;
    pMatchProcessing = true;
    clearInterval(matchTimerInterval);
    
    if (winnerNumber === 1) gameState.p1Score++;
    if (winnerNumber === 2) gameState.p2Score++;

    const winnerName = winnerNumber === 1 ? gameState.p1Name : gameState.p2Name;
    finishMatch(winnerName, winnerNumber);
};

// No timer needed - game ends when someone reaches 3 goals

// ============================================================
// MATCH FINISH & VICTORY
// ============================================================

function finishMatch(winnerName, winnerIndex) {
    // Record match in bracket
    if (localEngine && currentPendingMatch) {
        localEngine.setMatchWinner(
            currentPendingMatch.rIndex, 
            currentPendingMatch.mIndex, 
            winnerName, 
            true
        );
    }

    // Track result for leaderboard
    matchResults.push({
        p1: gameState.p1Name,
        p2: gameState.p2Name,
        p1Score: gameState.p1Score,
        p2Score: gameState.p2Score,
        winner: winnerName,
        round: currentPendingMatch ? currentPendingMatch.roundName : 'Match'
    });

    // Show victory screen
    document.getElementById('m-winner-name').innerText = winnerName;
    document.getElementById('m-victory-score').innerText = `${gameState.p1Score} - ${gameState.p2Score}`;
    document.getElementById('m-victory-round').innerText = 
        currentPendingMatch ? currentPendingMatch.roundName : 'MATCH CONCLUDED';
    
    showLayer('m-layer-victory');

    // Auto-advance after 4 seconds
    setTimeout(() => {
        pMatchProcessing = false;
        nextTournyMatch();
    }, 4000);
}

// ============================================================
// TOURNAMENT COMPLETE
// ============================================================

function showTournamentComplete() {
    const results = localEngine.getTournamentResults();
    const winner = results.winner || 'UNKNOWN';

    // Show champion name
    document.getElementById('m-champion-name').innerText = winner;

    // Build leaderboard from ALL participants
    const wins = {};
    // Initialize all participants with 0 wins
    localEngine.participants.forEach(p => {
        if (p !== 'BYE') wins[p] = 0;
    });
    // Count actual wins
    matchResults.forEach(r => {
        wins[r.winner] = (wins[r.winner] || 0) + 1;
    });
    
    // Sort by wins
    const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    
    const leaderboardEl = document.getElementById('m-leaderboard-list');
    leaderboardEl.innerHTML = '';
    sorted.forEach(([name, w], idx) => {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px; border-radius: 8px; margin-bottom: 8px;
            background: ${idx === 0 ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)'};
            border: 1px solid ${idx === 0 ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.05)'};
        `;
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="color: ${idx === 0 ? '#D4AF37' : '#666'}; font-weight: 900; width: 24px;">#${idx + 1}</span>
                <span style="color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${name}</span>
            </div>
            <span style="color: ${idx === 0 ? '#D4AF37' : '#888'}; font-weight: 700;">${w} ${w === 1 ? 'WIN' : 'WINS'}</span>
        `;
        leaderboardEl.appendChild(row);
    });

    showLayer('m-layer-leaderboard');
}

// ============================================================
// SETUP UI HELPERS (Player add/remove for setup screen)
// ============================================================

window.mobileAddPlayer = function() {
    const container = document.getElementById('m-players-list');
    const num = container.children.length + 1;
    
    // Guest trying to add 3rd player → show upsell
    if (!isLoggedIn && num > MAX_PLAYERS_GUEST) {
        const upsell = document.getElementById('m-login-upsell');
        if (upsell) {
            upsell.style.display = 'block';
            upsell.style.animation = 'none';
            upsell.offsetHeight; // trigger reflow
            upsell.style.animation = 'fadeInUp 0.3s ease forwards';
            upsell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }
    
    if (num > getMaxPlayers()) return;

    const div = document.createElement('div');
    div.className = 'player-row';
    div.style.cssText = 'display: flex; align-items: center; background: #111; padding: 8px; border-radius: 8px; border: 1px solid #333; margin-bottom: 8px;';
    div.innerHTML = `
        <span class="player-num" style="color: #666; font-weight: 700; padding: 0 8px; width: 32px;">#${num}</span>
        <input type="text" autocomplete="off" onfocus="this.select()" value="PLAYER ${num}" 
               class="player-input" 
               style="color: white; width: 100%; padding: 8px; font-weight: 700; background: transparent; border: none; outline: none; font-family: 'Resolve', sans-serif; letter-spacing: 1px;">
        <button onclick="mobileRemovePlayer(this)" style="color: #E30613; padding: 4px 12px; background: none; border: none; cursor: pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
    updateAddPlayerButton();
};

window.mobileRemovePlayer = function(btn) {
    const row = btn.closest('.player-row');
    const container = document.getElementById('m-players-list');
    
    if (container.querySelectorAll('.player-row').length <= 2) {
        row.querySelector('.player-input').value = "";
        return;
    }
    
    row.remove();
    
    // Re-number
    const rows = container.querySelectorAll('.player-row');
    rows.forEach((r, idx) => {
        r.querySelector('.player-num').innerText = '#' + (idx + 1);
    });
    updateAddPlayerButton();
};

// ============================================================
// RESTART
// ============================================================

window.mobileRestart = function() {
    // Reset everything
    matchResults = [];
    localEngine = null;
    currentPendingMatch = null;
    pMatchProcessing = false;
    clearInterval(matchTimerInterval);
    
    showLayer('m-layer-setup');
};

// ============================================================
// INIT
// ============================================================

showLayer('m-layer-setup');
