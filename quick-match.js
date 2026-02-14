import { _supabase, state } from './config.js';
import { showNotification, showPage, updateProfileCard, showMatchMode } from './ui.js';
import { MatchService } from './match-service.js';

/**
 * ============================================================
 * QUICK MATCH & PRO MODE LOGIC
 * ============================================================
 */

const PRO_MODE_WIN_SCORE = 3;
let isMatchEnding = false;

export function handleQuickSearch(input, slot) {
    const v = input.value.toUpperCase();
    const resDiv = document.getElementById(`${slot}-results`);
    if (!v) { resDiv.style.display = 'none'; return; }
    const combined = [...new Set([...state.allDbNames, ...state.sessionGuests])];
    const filtered = combined.filter(n => n.includes(v)).slice(0, 5);
    resDiv.innerHTML = filtered.map(n => `<div class="search-item" onclick="selectQuickPlayer('${n}', '${slot}')">${n}</div>`).join('');
    resDiv.style.display = 'block';
}

export async function selectQuickPlayer(name, slot) {
    document.getElementById(`${slot}-quick-search`).value = name;
    document.getElementById(`${slot}-results`).style.display = 'none';
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
            tournamentName: context
        });
        
        if (result.success) {
            if (window.audioEngine) window.audioEngine.stopListening();
            if (window.soundEffects) window.soundEffects.playCrowdCheer();
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
    const oldMsg = document.getElementById('guest-upsell');
    if (oldMsg) oldMsg.remove();
    if (isGuest) {
        const msg = document.createElement('div');
        msg.id = 'guest-upsell';
        msg.style = "margin-top: 20px; color: var(--sub-gold); font-family: 'Open Sans'; font-size: 0.85rem; max-width: 250px; background: rgba(255,215,0,0.1); padding: 10px; border-radius: 8px; border: 1px dashed var(--sub-gold);";
        msg.innerHTML = "🔥 <strong>Great win!</strong> Create a free account to start climbing the official Global Leaderboard.";
        overlay.querySelector('button').before(msg);
    }
    overlay.style.display = 'flex';
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
    showPage('tournament');
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
    if (!state.user || state.user.username !== 'JARNO SAARINEN') {
        showNotification('Pro Mode is currently in beta', 'error');
        return;
    }
    toggleProMode();
}

export function initProModeUI() {
    const proSection = document.getElementById('pro-mode-section');
    if (!proSection) return;
    if (!state.user || state.user.username !== 'JARNO SAARINEN') {
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
    if (rulesOverlay) { rulesOverlay.style.display = 'flex'; state.proModeActive = false; }
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
        if (window.soundEffects) window.soundEffects.playCrowdCheer();
        setTimeout(() => finishProMatch(state.quickP1), 1500);
    } else if (state.proScoreP2 >= PRO_MODE_WIN_SCORE) {
        isMatchEnding = true;
        if (window.soundEffects) window.soundEffects.playCrowdCheer();
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
    const userScore = Math.max(p1Score, p2Score);
    const opponentScore = Math.min(p1Score, p2Score);
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.style.display = 'flex';
    showMatchMode('quick');
    const p1Input = document.getElementById('p1-quick-search');
    const p2Input = document.getElementById('p2-quick-search');
    if (p1Input) {
        p1Input.value = state.user.username;
        p1Input.disabled = true;
        state.quickP1 = state.user.username;
    }
    if (p2Input) {
        p2Input.value = '';
        p2Input.placeholder = "Enter Opponent Name";
        p2Input.focus();
    }
    const startBtn = document.getElementById('start-quick-match');
    if (startBtn) {
        startBtn.textContent = `SAVE RESULT (${userScore}-${opponentScore})`;
        startBtn.onclick = function() { saveClaimedResult(userScore, opponentScore, gameId); };
        startBtn.style.background = 'linear-gradient(135deg, var(--sub-gold), #d4a017)';
        startBtn.style.color = '#000';
    }
    showNotification(`🏆 Victory! Who did you beat?`, 'success');
    const url = new URL(window.location);
    url.searchParams.delete('action');
    url.searchParams.delete('p1_score');
    url.searchParams.delete('p2_score');
    window.history.replaceState({}, document.title, url.pathname);
}

export async function saveClaimedResult(userScore, opponentScore, gameId) {
    const p2Input = document.getElementById('p2-quick-search');
    const opponentName = p2Input.value.trim().toUpperCase();
    if (!opponentName) return showNotification("Enter opponent name", "error");
    if (opponentName === state.user.username) return showNotification("Cannot play against yourself", "error");
    state.quickP2 = opponentName;
    await finalizeQuickMatch(state.user.username, gameId ? `Instant Play: ${gameId}` : 'Instant Play');
    const startBtn = document.getElementById('start-quick-match');
    if (startBtn) {
        startBtn.textContent = 'START GAME';
        startBtn.onclick = startQuickMatch;
        startBtn.style.background = '';
        startBtn.style.color = '';
    }
    const p1Input = document.getElementById('p1-quick-search');
    if (p1Input) p1Input.disabled = false;
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