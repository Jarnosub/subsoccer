import { _supabase, state, isAdmin } from './config.js';
import { showNotification } from './ui-utils.js';
import { MatchService } from './match-service.js';

/**
 * ============================================================
 * QUICK MATCH & PRO MODE LOGIC
 * ============================================================
 */

const PRO_MODE_WIN_SCORE = 3;
let isMatchEnding = false;

export async function handleQuickSearch(input, slot) {
    const v = input.value.trim().toUpperCase();
    const resDiv = document.getElementById(`${slot}-results`);
    if (!v) { resDiv.style.display = 'none'; return; }

    try {
        const { data: foundPlayers, error } = await _supabase
            .from('players')
            .select('username')
            .ilike('username', `%${v}%`)
            .limit(5);

        if (error) throw error;

        const dbNames = foundPlayers ? foundPlayers.map(p => p.username) : [];
        
        const guestMatches = state.sessionGuests
            .filter(g => g.includes(v) && !dbNames.includes(g))
            .slice(0, 5);

        const combined = [...dbNames, ...guestMatches];

        resDiv.innerHTML = combined.map(n => `<div class="search-item" data-action="select-quick-player" data-player="${n}" data-slot="${slot}">${n}</div>`).join('') + 
                           `<div class="search-item" style="color:var(--sub-gold);" data-action="select-quick-player" data-player="${v}" data-slot="${slot}">Add: "${v}"</div>`;
        resDiv.style.display = 'block';
    } catch (e) {
        console.error("Quick search failed:", e);
    }
}

export async function selectQuickPlayer(name, slot) {
    const inputId = slot === 'claim' ? 'claim-opponent-search' : `${slot}-quick-search`;
    const resultsId = slot === 'claim' ? 'claim-results' : `${slot}-results`;
    
    const input = document.getElementById(inputId);
    if (input) input.value = name;
    
    const results = document.getElementById(resultsId);
    if (results) results.style.display = 'none';

    if (slot === 'claim') {
        state.quickP2 = name;
        return;
    }
    if (slot === 'p1') state.quickP1 = name; else state.quickP2 = name;
    if (state.quickP1 && state.quickP2) {
        updateEloPreview();
        if (state.proModeEnabled) {
            document.getElementById('audio-status-panel').style.display = 'block';
            document.getElementById('audio-test-panel').style.display = 'block';
        }
    }
}

export async function updateEloPreview() {
    if (!state.quickP1 || !state.quickP2) return;
    const { data: p1 } = await _supabase.from('players').select('id, elo').ilike('username', state.quickP1.trim()).maybeSingle();
    const { data: p2 } = await _supabase.from('players').select('id, elo').ilike('username', state.quickP2.trim()).maybeSingle();
    const elo1 = p1 ? p1.elo : 1300, elo2 = p2 ? p2.elo : 1300;
    const id1 = p1 ? p1.id : 'guest1', id2 = p2 ? p2.id : 'guest2';
    const result = MatchService.calculateNewElo({ id: id1, elo: elo1 }, { id: id2, elo: elo2 }, id1);
    const gain = result.newEloA - elo1;
    document.getElementById('elo-prediction-text').innerHTML = `<span class="highlight">${state.quickP1}</span> gains <span class="highlight">+${gain} ELO</span> if they win`;
    document.getElementById('elo-preview').style.display = 'block';
}

export async function startQuickMatch() {
    document.querySelectorAll('input').forEach(input => input.blur());
    state.quickP1 = document.getElementById('p1-quick-search').value.trim().toUpperCase();
    state.quickP2 = document.getElementById('p2-quick-search').value.trim().toUpperCase();
    if (!state.quickP1 || !state.quickP2) return showNotification("Select both players!", "error");
    if (state.quickP1 === state.quickP2) return showNotification("Select different players!", "error");
    
    if (state.proModeEnabled) { startProMatch(); return; }
    
    state.proScoreP1 = 0; state.proScoreP2 = 0; state.proGoalHistory = [];
    state.proModeActive = true;
    
    document.getElementById('pro-p1-name').textContent = state.quickP1;
    document.getElementById('pro-p2-name').textContent = state.quickP2;
    updateProScore();
    
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('pro-mode-view').style.display = 'flex';
}

export async function finalizeQuickMatch(winnerName, context = null) {
    try {
        const player1Name = state.quickP1;
        const player2Name = state.quickP2;

        const result = await MatchService.recordMatch({
            player1Name,
            player2Name,
            winnerName,
            p1Score: state.proScoreP1,
            p2Score: state.proScoreP2,
            tournamentName: context
        });
        
        if (result.success) {
            if (window.audioEngine) window.audioEngine.stopListening();
            showVictory(winnerName, result.newElo, result.gain, result.isGuest);
        }
    } catch (error) {
        console.error('Error finalizing Quick Match:', error);
        showNotification('Failed to save match results', 'error');
    }
}

export function showVictory(name, newElo, gain, isGuest = false) {
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('victory-player-name').innerText = name;
    document.getElementById('victory-elo-count').innerText = newElo;
    document.getElementById('victory-elo-gain').innerText = `+${gain} POINTS`;
    const overlay = document.getElementById('victory-overlay');
    
    // Etsitään napit ja lisätään Pro-luokat
    const buttons = overlay.querySelectorAll('button');
    if (buttons.length >= 2) {
        buttons[0].className = 'btn-red btn-victory-primary'; // New Game
        buttons[0].innerText = 'NEW GAME';
        buttons[1].className = 'btn-red btn-victory-secondary'; // End Game
        buttons[1].innerText = 'END GAME';
    }

    const oldMsg = document.getElementById('guest-upsell');
    if (oldMsg) oldMsg.remove();
    if (isGuest) {
        const msg = document.createElement('div');
        msg.id = 'guest-upsell';
        msg.className = 'fade-in';
        msg.style = "margin-top: 25px; color: #fff; font-size: 0.85rem; max-width: 280px; background: rgba(255,215,0,0.1); padding: 15px; border-radius: var(--sub-radius); border: 1px solid rgba(255,215,0,0.2); text-align:center; line-height:1.4;";
        msg.innerHTML = "<span style='color:var(--sub-gold); font-weight:bold; display:block; margin-bottom:5px;'>🔥 GREAT WIN!</span> Create a free account to save your progress and climb the Global Leaderboard.";
        
        // Lisätään viesti ennen nappeja
        const controls = overlay.querySelector('.victory-controls') || overlay.querySelector('button').parentElement;
        controls.before(msg);
    }
    overlay.style.display = 'flex';

    // Soita yleisön hurraus kun ELO-pisteet ilmoitetaan
    if (window.soundEffects && typeof window.soundEffects.playCrowdCheer === 'function') {
        window.soundEffects.playCrowdCheer();
    }
}

export function cancelQuickMatch() {
    if (window.audioEngine && typeof window.audioEngine.stopListening === 'function') {
        window.audioEngine.stopListening();
    }
    document.getElementById('app-content').style.display = 'flex';
}

export function closeVictoryOverlay() {
    document.getElementById('victory-overlay').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    document.getElementById('audio-status-panel').style.display = 'none';
    document.getElementById('audio-test-panel').style.display = 'none';
    if (window.fetchLB) window.fetchLB();
    if (window.fetchHist) window.fetchHist();
    state.currentPage = 'tournament';
}

export function handleQuickWinner(winnerName, btn) {
    btn.parentElement.remove();
    finalizeQuickMatch(winnerName);
}

export function clearQuickMatchPlayers() {
    document.getElementById('p1-quick-search').value = '';
    document.getElementById('p2-quick-search').value = '';
    state.quickP1 = null; state.quickP2 = null;
    document.getElementById('elo-preview').style.display = 'none';
    document.getElementById('audio-status-panel').style.display = 'none';
    document.getElementById('audio-test-panel').style.display = 'none';
    document.getElementById('p1-quick-search').focus();
}

/**
 * PRO MODE LOGIC
 */

export function handleProModeClick() {
    if (!isAdmin()) {
        showNotification('Pro Mode is currently in beta', 'error');
        return;
    }
    toggleProMode();
}

export function initProModeUI() {
    const proSection = document.getElementById('pro-mode-section');
    if (!proSection) return;
    if (!isAdmin()) {
        proSection.classList.add('disabled');
    } else {
        proSection.classList.remove('disabled');
    }
}

export function toggleProMode() {
    const checkbox = document.getElementById('pro-mode-toggle');
    const proSection = document.getElementById('pro-mode-section');
    checkbox.checked = !checkbox.checked;
    state.proModeEnabled = checkbox.checked;
    
    const startBtn = document.getElementById('start-quick-match');
    const audioPanels = document.getElementById('pro-mode-audio-panels');
    
    if (state.proModeEnabled) {
        startBtn.textContent = '⚡ START PRO MATCH';
        startBtn.style.background = 'linear-gradient(135deg, var(--sub-gold), #d4a017)';
        startBtn.style.color = '#000';
        audioPanels.style.display = 'block';
        proSection.style.borderColor = 'var(--sub-gold)';
        proSection.style.borderStyle = 'solid';
    } else {
        startBtn.textContent = 'START MATCH';
        startBtn.style.background = '';
        audioPanels.style.display = 'none';
        proSection.style.borderColor = '#444';
        proSection.style.borderStyle = 'dashed';
    }
}

export async function startProMatch() {
    state.proScoreP1 = 0; state.proScoreP2 = 0; state.proGoalHistory = [];
    isMatchEnding = false; state.proModeActive = true;
    
    document.getElementById('pro-p1-name').textContent = state.quickP1;
    document.getElementById('pro-p2-name').textContent = state.quickP2;
    updateProScore();
    
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('pro-mode-view').style.display = 'flex';
    
    const rulesOverlay = document.getElementById('pro-rules-overlay');
    if (rulesOverlay) { 
        rulesOverlay.style.display = 'flex'; 
        state.proModeActive = false; 
        const playBtn = rulesOverlay.querySelector('button');
        if (playBtn) playBtn.innerText = 'I UNDERSTAND - PLAY';
    }
    else { acceptRulesAndStart(); }
}

export function acceptRulesAndStart() {
    document.getElementById('pro-rules-overlay').style.display = 'none';
    state.proModeActive = true;
    isMatchEnding = false;
}

export function addManualGoal(playerNumber) {
    if (!state.proModeActive || isMatchEnding) return;
    handleGoalDetectedPro(playerNumber);
}

function handleGoalDetectedPro(playerNumber) {
    if (!state.proModeActive || isMatchEnding) return;
    if (playerNumber === 1) state.proScoreP1++; else state.proScoreP2++;
    state.proGoalHistory.push({ player: playerNumber });
    updateProScore();
    
    const side = playerNumber === 1 ? '.pro-player-left' : '.pro-player-right';
    document.querySelector(side).classList.add('goal-flash');
    setTimeout(() => document.querySelector(side).classList.remove('goal-flash'), 500);
    
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    if (window.soundEffects) window.soundEffects.playGoalSound();
    
    if (state.proScoreP1 >= PRO_MODE_WIN_SCORE) {
        isMatchEnding = true;
        setTimeout(() => finishProMatch(state.quickP1), 1500);
    } else if (state.proScoreP2 >= PRO_MODE_WIN_SCORE) {
        isMatchEnding = true;
        setTimeout(() => finishProMatch(state.quickP2), 1500);
    }
}

function updateProScore() {
    document.getElementById('pro-p1-score').textContent = state.proScoreP1;
    document.getElementById('pro-p2-score').textContent = state.proScoreP2;
    document.getElementById('pro-p1-goals').textContent = '●'.repeat(state.proScoreP1) + '○'.repeat(PRO_MODE_WIN_SCORE - state.proScoreP1);
    document.getElementById('pro-p2-goals').textContent = '●'.repeat(state.proScoreP2) + '○'.repeat(PRO_MODE_WIN_SCORE - state.proScoreP2);
    
    const undoBtn = document.getElementById('pro-undo-btn');
    if (undoBtn) undoBtn.style.display = state.proGoalHistory.length > 0 ? 'block' : 'none';
    
    const p1Status = document.getElementById('pro-p1-status');
    const p2Status = document.getElementById('pro-p2-status');
    
    if (state.proScoreP1 === state.proScoreP2) {
        p1Status.textContent = 'TIE'; p2Status.textContent = 'TIE';
    } else if (state.proScoreP1 > state.proScoreP2) {
        p1Status.textContent = 'LEADING'; p2Status.textContent = (state.proScoreP2 === PRO_MODE_WIN_SCORE - 1) ? 'MATCH POINT' : '';
    } else {
        p1Status.textContent = (state.proScoreP1 === PRO_MODE_WIN_SCORE - 1) ? 'MATCH POINT' : ''; p2Status.textContent = 'LEADING';
    }
}

export function undoLastGoal() {
    if (!state.proModeActive || isMatchEnding || state.proGoalHistory.length === 0) return;
    const lastGoal = state.proGoalHistory.pop();
    if (lastGoal.player === 1) state.proScoreP1 = Math.max(0, state.proScoreP1 - 1);
    else state.proScoreP2 = Math.max(0, state.proScoreP2 - 1);
    updateProScore();
    if (navigator.vibrate) navigator.vibrate(50);
}

async function finishProMatch(winnerName) {
    state.proModeActive = false; isMatchEnding = false;
    if (window.audioEngine) window.audioEngine.stopListening();
    document.getElementById('pro-mode-view').style.display = 'none';
    await finalizeQuickMatch(winnerName);
}

export function exitProMode() {
    if (!confirm('Exit current match? Result will not be saved.')) return;
    state.proModeActive = false; isMatchEnding = false; state.proGoalHistory = [];
    if (window.audioEngine) window.audioEngine.stopListening();
    document.getElementById('pro-mode-view').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
}

export function handleGoalDetected(playerNumber) {
    if (state.proModeActive) { handleGoalDetectedPro(playerNumber); return; }
    const winnerName = playerNumber === 1 ? state.quickP1 : state.quickP2;
    if (!winnerName) return;
    showNotification(`🚨 GOAL! ${winnerName} scores!`, 'success');
    if (window.soundEffects) window.soundEffects.playGoalSound();
    setTimeout(() => finalizeQuickMatch(winnerName), 800);
}

export async function toggleAudioDetection() {
    if (!window.audioEngine) return showNotification('Audio engine not loaded', 'error');
    const status = window.audioEngine.getStatus();
    const btn = document.getElementById('toggle-audio-btn');
    const indicator = document.getElementById('audio-indicator');
    
    if (status.isListening) {
        window.audioEngine.stopListening();
        btn.textContent = 'ACTIVATE'; btn.style.background = '#333';
        indicator.style.background = '#666'; indicator.style.boxShadow = 'none';
        document.getElementById('audio-frequency-display').style.display = 'none';
    } else {
        const result = await window.audioEngine.startListening();
        if (result.success) {
            btn.textContent = 'DEACTIVATE'; btn.style.background = 'var(--sub-red)';
            indicator.style.background = '#4CAF50'; indicator.style.boxShadow = '0 0 10px #4CAF50';
            document.getElementById('audio-frequency-display').style.display = 'block';
            startFrequencyMonitor();
        } else showNotification(result.message, 'error');
    }
}

function startFrequencyMonitor() {
    const interval = setInterval(() => {
        if (!window.audioEngine || !window.audioEngine.getStatus().isListening) { clearInterval(interval); return; }
        const status = window.audioEngine.getStatus();
        document.getElementById('freq-goal1').textContent = status.settings.goal1Frequency;
        document.getElementById('freq-goal2').textContent = status.settings.goal2Frequency;
    }, 100);
}

export async function recordGoalSound(goalNumber) {
    const statusDiv = document.getElementById('recording-status');
    showNotification(`🔴 Recording Goal ${goalNumber} sound...`, 'info');
    // Tähän voisi lisätä varsinaisen tallennuslogiikan jos tarpeen, 
    // mutta pidetään se nyt yksinkertaisena.
}

export function toggleSoundEffects() {
    if (!window.soundEffects) return showNotification('Sound system not loaded', 'error');
    const enabled = window.soundEffects.toggle();
    const btn = document.getElementById('sound-toggle-btn');
    if (!btn) return;
    if (enabled) {
        btn.innerHTML = '🔊 SOUNDS';
        btn.style.background = '#333';
        btn.style.color = '#fff';
        showNotification('🔊 Sound effects enabled', 'success');
        setTimeout(() => { window.soundEffects.playGoalSound(); }, 300);
    } else {
        btn.innerHTML = '🔇 MUTED';
        btn.style.background = '#666';
        btn.style.color = '#aaa';
        showNotification('🔇 Sound effects muted', 'info');
    }
}

export function initClaimResult(p1Score, p2Score, gameId) {
    const uScore = Math.max(p1Score, p2Score);
    const oScore = Math.min(p1Score, p2Score);
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.style.display = 'flex';
    showMatchMode('quick');
    
    const setupDiv = document.getElementById('quick-match-section');
    if (setupDiv) {
        // Piilotetaan normaali asetus ja näytetään Claim-näkymä
        Array.from(setupDiv.children).forEach(child => {
            if (child.id !== 'claim-result-container') child.style.display = 'none';
        });

        let claimUI = document.getElementById('claim-result-container');
        if (!claimUI) {
            claimUI = document.createElement('div');
            claimUI.id = 'claim-result-container';
            setupDiv.appendChild(claimUI);
        }
        
        claimUI.className = 'sub-card fade-in';
        claimUI.style.display = 'block';
        claimUI.style.borderColor = 'var(--sub-gold)';
        claimUI.style.marginTop = '20px';
        claimUI.innerHTML = `
            <div style="text-align:center; margin-bottom:20px;">
                <div style="font-family:var(--sub-name-font); color:var(--sub-gold); font-size:1.1rem; letter-spacing:2px; margin-bottom:10px;">CLAIM YOUR VICTORY</div>
                <div style="font-size:3.5rem; font-family:var(--sub-name-font); color:#fff; line-height:1;">${uScore} - ${oScore}</div>
                <div style="color:#666; font-size:0.8rem; margin-top:10px; text-transform:uppercase; letter-spacing:1px;">Who was your opponent?</div>
            </div>
            
            <div style="position:relative; margin-bottom:20px;">
                <input type="text" id="claim-opponent-search" placeholder="Search opponent name..." style="margin-bottom:0; border-color:var(--sub-gold);">
                <div id="claim-results" class="quick-results"></div>
            </div>
            
            <button class="btn-red" id="btn-confirm-claim" data-score1="${uScore}" data-score2="${oScore}" data-game-id="${gameId}" style="background:linear-gradient(135deg, var(--sub-gold), #d4a017); color:#000; font-size:1.1rem;">
                CONFIRM & SAVE RESULT
            </button>
            
            <button class="btn-red" id="btn-cancel-claim" style="background:transparent; border:1px solid #333; color:#555; margin-top:15px; font-size:0.8rem; padding:8px;">
                CANCEL & DISCARD
            </button>
        `;
        
        state.quickP1 = state.user.username;
        setTimeout(() => document.getElementById('claim-opponent-search')?.focus(), 500);
    }

    showNotification(`🏆 Victory! Enter opponent name to save.`, 'success');
    
    // Puhdistetaan URL
    const url = new URL(window.location);
    url.searchParams.delete('action');
    url.searchParams.delete('p1_score');
    url.searchParams.delete('p2_score');
    url.searchParams.delete('game_id');
    window.history.replaceState({}, document.title, url.pathname);
}

export async function saveClaimedResult(uScore, oScore, gameId) {
    const input = document.getElementById('claim-opponent-search');
    const opponentName = input?.value.trim().toUpperCase();
    if (!opponentName) return showNotification("Enter opponent name", "error");
    if (opponentName === state.user.username) return showNotification("Cannot play against yourself", "error");
    
    state.quickP2 = opponentName;
    state.proScoreP1 = uScore;
    state.proScoreP2 = oScore;
    
    await finalizeQuickMatch(state.user.username, gameId ? `Instant Play: ${gameId}` : 'Instant Play');
    
    cancelClaimResult();
}

export function cancelClaimResult() {
    const setupDiv = document.getElementById('quick-match-section');
    const claimUI = document.getElementById('claim-result-container');
    if (claimUI) claimUI.style.display = 'none';
    
    if (setupDiv) {
        Array.from(setupDiv.children).forEach(child => {
            if (child.id !== 'claim-result-container') child.style.display = '';
        });
    }
    
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Globaalit kytkennät
window.handleQuickSearch = handleQuickSearch;
window.selectQuickPlayer = selectQuickPlayer;
window.startQuickMatch = startQuickMatch;
window.clearQuickMatchPlayers = clearQuickMatchPlayers;
window.handleProModeClick = handleProModeClick;
window.initProModeUI = initProModeUI;
window.toggleProMode = toggleProMode;
window.acceptRulesAndStart = acceptRulesAndStart;
window.addManualGoal = addManualGoal;
window.undoLastGoal = undoLastGoal;
window.exitProMode = exitProMode;
window.toggleAudioDetection = toggleAudioDetection;
window.recordGoalSound = recordGoalSound;
window.closeVictoryOverlay = closeVictoryOverlay;
window.handleGoalDetected = handleGoalDetected;
window.cancelQuickMatch = cancelQuickMatch;
window.handleQuickWinner = handleQuickWinner;
window.toggleSoundEffects = toggleSoundEffects;
window.initClaimResult = initClaimResult;
window.saveClaimedResult = saveClaimedResult;
window.cancelClaimResult = cancelClaimResult;