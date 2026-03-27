import { _supabase, state, isAdmin } from './config.js';
import { showNotification, safeHTML } from './ui-utils.js';
import { MatchService } from './match-service.js';
import { BroadcastService } from './broadcast-service.js';
import { requestConsentSequence } from './anti-cheat.js';

/**
 * ============================================================
 * QUICK MATCH & PRO MODE LOGIC
 * ============================================================
 */

const PRO_MODE_WIN_SCORE = 3;
let isMatchEnding = false;
let finishMatchTimer = null;

export async function handleQuickSearch(input, slot) {
    const v = input.value.trim().toUpperCase();
    const resDiv = document.getElementById(`${slot}-results`);
    if (!v) { if (resDiv) resDiv.style.display = 'none'; return; }

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

        if (resDiv) {
            resDiv.innerHTML = safeHTML`
                ${combined.map(n => safeHTML`<div class="search-item" data-action="select-quick-player" data-player="${n}" data-slot="${slot}">${n}</div>`)}
                <div class="search-item" style="color:var(--sub-gold);" data-action="select-quick-player" data-player="${v}" data-slot="${slot}">Add: "${v}"</div>
            `.toString();
            resDiv.style.display = 'block';
        }
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

    requestConsentSequence(state.quickP1, state.quickP2, startProMatch);
}

export async function finalizeQuickMatch(winnerName, context = null) {
    try {
        const player1Name = state.quickP1;
        const player2Name = state.quickP2;

        // Extract gameId from context if it's an Instant Play claim
        let gameId = null;
        if (context && context.startsWith('Instant Play: ')) {
            gameId = context.replace('Instant Play: ', '');
        }

        const result = await MatchService.recordMatch({
            player1Name,
            player2Name,
            winnerName,
            p1Score: state.proScoreP1,
            p2Score: state.proScoreP2,
            tournamentName: context,
            gameId: gameId
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

    // FIX: Piilotetaan sticky-tallenna-nappi, koska se on body-elementin alla
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.style.display = 'none';

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
    if (window.fetchLB) window.fetchLB();
    if (window.fetchHist) window.fetchHist();

    // Jos turnausnäkymä (tour-engine) on auki, nollataan se takaisin setup-tilaan
    const tourEngine = document.getElementById('tour-engine');
    if (tourEngine && tourEngine.style.display !== 'none') {
        tourEngine.style.display = 'none';
        const tourSetup = document.getElementById('tour-setup');
        if (tourSetup) tourSetup.style.display = ''; // Palauttaa CSS-määrityksen (flex)

        const bracketArea = document.getElementById('bracket-area');
        if (bracketArea) bracketArea.innerHTML = '';

        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.style.display = 'none';
            saveBtn.classList.remove('sticky-bottom-action');
            if (saveBtn.parentNode !== tourEngine) {
                tourEngine.appendChild(saveBtn);
            }
        }
    }

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
    document.getElementById('p1-quick-search').focus();
}

/**
 * PRO MODE LOGIC
 */

export function handleProModeClick() {
    toggleProMode();
}

export function initProModeUI() {
    const proSection = document.getElementById('pro-mode-section');
    if (!proSection) return;
    proSection.classList.remove('disabled');
}

export function toggleProMode() {
    const checkbox = document.getElementById('pro-mode-toggle');
    const proSection = document.getElementById('pro-mode-section');
    checkbox.checked = !checkbox.checked;
    state.proModeEnabled = checkbox.checked;

    const startBtn = document.getElementById('start-quick-match');
    const audioPanels = document.getElementById('pro-mode-audio-panels');

    if (state.proModeEnabled) {
        startBtn.textContent = 'START MATCH';
        startBtn.style.background = 'linear-gradient(135deg, var(--sub-gold), #d4a017)';
        startBtn.style.color = '#000';
        proSection.style.borderColor = 'var(--sub-gold)';
        proSection.style.borderStyle = 'solid';
    } else {
        startBtn.textContent = 'START MATCH';
        startBtn.style.background = 'var(--sub-red)';
        startBtn.style.color = 'white';
        proSection.style.borderColor = '#1a1a1a';
        proSection.style.borderStyle = 'dashed';
    }
}

export async function startProMatch() {
    state.proScoreP1 = 0; state.proScoreP2 = 0; state.proGoalHistory = [];
    isMatchEnding = false; state.proModeActive = true;

    await BroadcastService.startBroadcasting();

    document.getElementById('pro-p1-name').textContent = state.quickP1;
    document.getElementById('pro-p2-name').textContent = state.quickP2;
    updateProScore(false);

    document.getElementById('app-content').style.display = 'none';

    // Update control bar states
    const micBtn = document.getElementById('btn-pro-mic');
    const soundBtn = document.getElementById('btn-pro-sound');
    if (micBtn && window.audioEngine) {
        const isListening = window.audioEngine.getStatus().isListening;
        micBtn.classList.toggle('active', isListening);
        micBtn.innerHTML = isListening ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    }
    if (soundBtn && window.soundEffects) soundBtn.classList.toggle('active', window.soundEffects.enabled);

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
    state.proGoalHistory = [...state.proGoalHistory, { player: playerNumber }];
    updateProScore(true);

    const side = playerNumber === 1 ? '.pro-player-left' : '.pro-player-right';
    document.querySelector(side).classList.add('goal-flash');
    setTimeout(() => document.querySelector(side).classList.remove('goal-flash'), 500);

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    if (window.soundEffects) window.soundEffects.playGoalSound();

    if (state.proScoreP1 >= PRO_MODE_WIN_SCORE) {
        isMatchEnding = true;
        finishMatchTimer = setTimeout(() => finishProMatch(state.quickP1), 1500);
    } else if (state.proScoreP2 >= PRO_MODE_WIN_SCORE) {
        isMatchEnding = true;
        finishMatchTimer = setTimeout(() => finishProMatch(state.quickP2), 1500);
    }
}

function updateProScore(isGoal = false) {
    document.getElementById('pro-p1-score').textContent = state.proScoreP1;
    document.getElementById('pro-p2-score').textContent = state.proScoreP2;
    document.getElementById('pro-p1-goals').textContent = '●'.repeat(state.proScoreP1) + '○'.repeat(PRO_MODE_WIN_SCORE - state.proScoreP1);
    document.getElementById('pro-p2-goals').textContent = '●'.repeat(state.proScoreP2) + '○'.repeat(PRO_MODE_WIN_SCORE - state.proScoreP2);

    const undoBtn = document.getElementById('btn-pro-undo');
    if (undoBtn) undoBtn.style.opacity = state.proGoalHistory.length > 0 ? '1' : '0.3';

    const p1Status = document.getElementById('pro-p1-status');
    const p2Status = document.getElementById('pro-p2-status');

    if (state.proScoreP1 === state.proScoreP2) {
        p1Status.textContent = 'TIE'; p2Status.textContent = 'TIE';
    } else if (state.proScoreP1 > state.proScoreP2) {
        p1Status.textContent = 'LEADING'; p2Status.textContent = (state.proScoreP2 === PRO_MODE_WIN_SCORE - 1) ? 'MATCH POINT' : '';
    } else {
        p1Status.textContent = (state.proScoreP1 === PRO_MODE_WIN_SCORE - 1) ? 'MATCH POINT' : ''; p2Status.textContent = 'LEADING';
    }

    BroadcastService.sendScoreUpdate(state.quickP1, state.quickP2, state.proScoreP1, state.proScoreP2, isGoal);
}

export function undoLastGoal() {
    // Sallitaan undo vaikka peli olisi päättymässä (isMatchEnding), jotta virheellisen voittomaalin voi perua
    if (!state.proModeActive || state.proGoalHistory.length === 0) return;

    // Jos peli oli päättymässä, perutaan lopetus
    if (isMatchEnding) {
        clearTimeout(finishMatchTimer);
        isMatchEnding = false;
    }

    const lastGoal = state.proGoalHistory.pop();
    if (lastGoal.player === 1) state.proScoreP1 = Math.max(0, state.proScoreP1 - 1);
    else state.proScoreP2 = Math.max(0, state.proScoreP2 - 1);
    updateProScore(false);
    if (navigator.vibrate) navigator.vibrate(50);
}

export function resetProMatch() {
    if (!confirm('Restart match? Score will be reset to 0-0.')) return;
    state.proScoreP1 = 0;
    state.proScoreP2 = 0;
    state.proGoalHistory = [];
    updateProScore(false);
}

async function finishProMatch(winnerName) {
    state.proModeActive = false; isMatchEnding = false;
    if (window.audioEngine) window.audioEngine.stopListening();
    BroadcastService.stopBroadcasting();
    document.getElementById('pro-mode-view').style.display = 'none';
    document.getElementById('pro-audio-meter').style.display = 'none';
    await finalizeQuickMatch(winnerName);
}

export function exitProMode() {
    if (!confirm('Exit current match? Result will not be saved.')) return;
    state.proModeActive = false; isMatchEnding = false; state.proGoalHistory = [];
    if (window.audioEngine) window.audioEngine.stopListening();
    BroadcastService.stopBroadcasting();
    document.getElementById('pro-mode-view').style.display = 'none';
    document.getElementById('pro-audio-meter').style.display = 'none';
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
    const proBtn = document.getElementById('btn-pro-mic');

    if (status.isListening) {
        window.audioEngine.stopListening();
        btn.textContent = 'ACTIVATE'; btn.style.background = '#333';
        if (proBtn) {
            proBtn.classList.remove('active');
            proBtn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i>';
            document.getElementById('pro-audio-meter').style.display = 'none';
        }
        document.getElementById('audio-frequency-display').style.display = 'none';
    } else {
        const result = await window.audioEngine.startListening();
        if (result.success) {
            btn.textContent = 'DEACTIVATE'; btn.style.background = 'var(--sub-red)';
            if (proBtn) {
                proBtn.classList.add('active');
                proBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                document.getElementById('pro-audio-meter').style.display = 'block';
            }

            // Initialize Threshold Slider
            const slider = document.getElementById('audio-threshold-slider');
            const label = document.getElementById('audio-threshold-value');
            if (slider && label) {
                slider.value = window.audioEngine.getStatus().settings.threshold * 100;
                label.textContent = slider.value + '%';
                slider.oninput = (e) => {
                    const val = parseInt(e.target.value);
                    label.textContent = val + '%';
                    window.audioEngine.setThreshold(val / 100);
                };
            }

            startFrequencyMonitor();
        } else showNotification(result.message, 'error');
    }
}

function startFrequencyMonitor() {
    const interval = setInterval(() => {
        if (!window.audioEngine || !window.audioEngine.getStatus().isListening) { clearInterval(interval); return; }
        const status = window.audioEngine.getStatus();

        // Update visual meter
        const meterBar = document.getElementById('audio-meter-bar');
        const thresholdLine = document.getElementById('audio-threshold-line');
        const proMeterFill = document.getElementById('pro-audio-meter-fill');
        const proThresholdLine = document.getElementById('pro-audio-threshold-marker');

        const maxIntensity = Math.max(status.debug.currentG1, status.debug.currentG2);
        const thresholdPct = status.settings.threshold * 100;

        if (meterBar && thresholdLine) {
            meterBar.style.width = (maxIntensity * 100) + '%';
            thresholdLine.style.left = thresholdPct + '%';

            // Change color to green if it hits the threshold
            if (maxIntensity >= status.settings.threshold) {
                meterBar.style.background = '#4CAF50';
            } else {
                meterBar.style.background = 'var(--sub-gold)';
            }
        }

        // Update Pro Mode in-game meter
        if (proMeterFill && proThresholdLine) {
            proMeterFill.style.width = (maxIntensity * 100) + '%';
            proThresholdLine.style.left = thresholdPct + '%';

            if (maxIntensity >= status.settings.threshold) {
                proMeterFill.style.background = '#4CAF50';
            } else {
                proMeterFill.style.background = 'var(--sub-gold)';
            }
        }
    }, 100);
}

// Removed audio recording logic in favor of simplified UX

export function toggleSoundEffects() {
    if (!window.soundEffects) return showNotification('Sound system not loaded', 'error');
    const enabled = window.soundEffects.toggle();
    const btn = document.getElementById('sound-toggle-btn');
    const proBtn = document.getElementById('btn-pro-sound');

    if (!btn) return;
    if (enabled) {
        btn.innerHTML = '🔊 SOUNDS';
        btn.style.background = '#333';
        btn.style.color = '#fff';
        if (proBtn) proBtn.classList.add('active');
        showNotification('🔊 Sound effects enabled', 'success');
        setTimeout(() => { window.soundEffects.playGoalSound(); }, 300);
    } else {
        btn.innerHTML = '🔇 MUTED';
        btn.style.background = '#666';
        btn.style.color = '#aaa';
        if (proBtn) proBtn.classList.remove('active');
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

        const isGuest = state.user.id === 'guest';

        claimUI.className = 'sub-card fade-in';
        claimUI.style.display = 'block';
        claimUI.style.borderColor = isGuest ? '#666' : 'var(--sub-gold)';
        claimUI.style.marginTop = '20px';
        claimUI.style.background = isGuest ? 'linear-gradient(135deg, #111, #222)' : 'linear-gradient(135deg, #1a1500, #332600)';

        // Gamified Card Element
        const cardGlint = isGuest
            ? 'linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.05) 50%, transparent 60%)'
            : 'linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)';

        const cardIcon = isGuest ? 'fa-lock' : 'fa-trophy';
        const cardIconColor = isGuest ? '#666' : 'var(--sub-gold)';
        const cardTitle = isGuest ? 'ROOKIE CARD' : 'PRO CARD UPGRADE';
        const cardTitleColor = isGuest ? '#888' : '#fff';
        const cardDesc = isGuest
            ? "You are playing as an Anonymous Guest.<br><br><span style='color:var(--sub-gold); font-weight:bold;'>UNLOCK YOUR PRO CARD</span><br>to claim this victory and enter the Global Top 100!"
            : "Great win! Save this result to boost your global rank and update your digital Pro Card.";

        const gamifiedCard = `
            <div style="background:rgba(0,0,0,0.5); border:1px dashed ${cardIconColor}; border-radius:10px; padding:20px; margin: 0 auto 20px auto; position:relative; overflow:hidden;">
                <div style="position:absolute; top:-50%; left:-50%; width:200%; height:200%; background:${cardGlint}; animation: shimmer 3s infinite;"></div>
                <i class="fa-solid ${cardIcon}" style="color:${cardIconColor}; font-size:2rem; margin-bottom:10px;"></i>
                <h3 style="font-family:'Resolve'; color:${cardTitleColor}; font-size:1.2rem; letter-spacing:2px; margin-bottom:15px; text-transform:uppercase;">${cardTitle}</h3>
                <p style="color:#aaa; font-size:0.8rem; line-height:1.4; margin-bottom:5px;">${cardDesc}</p>
            </div>
        `;

        claimUI.innerHTML = `
            <div style="text-align:center; padding-bottom:10px;">
                <div style="font-family:'Russo One'; color:var(--sub-gold); font-size:1.5rem; letter-spacing:2px; margin-bottom:5px;">VICTORY CONFIRMED</div>
                <div style="font-size:3.5rem; font-family:'Subsoccer', sans-serif; color:#fff; line-height:1; text-shadow:0 0 20px rgba(255,215,0,0.3); margin-bottom: 20px;">${uScore} - ${oScore}</div>
                ${gamifiedCard}
                <div style="color:#aaa; font-size:0.85rem; margin-top:20px; line-height:1.5; padding:0 15px;">Who did you defeat today? Enter their name below to finalize the match.</div>
            </div>
            
            <div style="position:relative; margin:20px 0;">
                <input type="text" id="claim-opponent-search" placeholder="OPPONENT'S NAME / GUEST" style="margin-bottom:0; background:rgba(255,255,255,0.05); border:1px solid #333; text-align:center; font-family:'Russo One'; letter-spacing:1px; text-transform:uppercase; font-size:1.1rem; padding:15px; color:#fff;">
                <div id="claim-results" class="quick-results"></div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:25px;">
                <button class="btn-red" id="btn-confirm-claim" data-score1="${uScore}" data-score2="${oScore}" data-game-id="${gameId}" style="flex:1; background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:1.1rem; padding:18px; box-shadow:0 5px 15px rgba(255,215,0,0.3);">
                    ${isGuest ? "CREATE ACCOUNT & SAVE RANK" : "<i class='fa-solid fa-floppy-disk' style='margin-right:10px;'></i> SAVE RESULT"}
                </button>
                
                <button class="btn-red" id="btn-cancel-claim" style="flex:1; padding:15px; font-size:0.9rem; background:transparent; border: 1px dashed #444; color:#666;">
                    DISCARD MATCH
                </button>
            </div>
        `;

        // Tallennetaan väliaikaisesti, että voimme palata tähän kirjautumisen jälkeen
        if (isGuest) {
            state.pendingMatch = { p1Score: uScore, p2Score: oScore, gameId };
            localStorage.setItem('subsoccer_pending_match', JSON.stringify(state.pendingMatch));
        }

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

export function copyTvLink() {
    const roomId = BroadcastService.getRoomId();
    if (!roomId) return showNotification("Broadcast not active yet.", "error");
    const link = `${window.location.origin}/tv.html?room=${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
        showNotification("📺 TV Link copied to clipboard!", "success");
    }).catch(err => {
        showNotification("Failed to copy link", "error");
    });
}

export function copyVipLink() {
    const roomId = BroadcastService.getRoomId();
    if (!roomId) return showNotification("Broadcast not active yet.", "error");
    const link = `${window.location.origin}/tv.html?room=${roomId}&role=caster`;
    navigator.clipboard.writeText(link).then(() => {
        showNotification("🎤 VIP Caster Link copied!", "success");
    }).catch(err => {
        showNotification("Failed to copy link", "error");
    });
}

// Globaalit kytkennät
// NOTE: Functions imported as ES modules in ui.js do NOT need window.* here.
// These are kept because they are called from audio-engine.js, inline onclick HTML,
// or other places that cannot use ES module imports directly.
window.handleGoalDetected = handleGoalDetected;   // audio-engine.js calls this
window.toggleProMode = toggleProMode;             // called from pro mode UI buttons
window.cancelQuickMatch = cancelQuickMatch;       // called from non-module contexts
window.handleQuickWinner = handleQuickWinner;     // called from dynamic HTML
window.toggleSoundEffects = toggleSoundEffects;   // called from settings menu
window.initClaimResult = initClaimResult;         // called from game result flow
window.copyTvLink = copyTvLink;                   // exposed mainly for consistency
window.copyVipLink = copyVipLink;                 // exposed mainly for consistency

export function setupQuickMatchListeners() {
    // Quick Match Section
    document.getElementById('p1-quick-search')?.addEventListener('input', (e) => handleQuickSearch(e.target, 'p1'));
    document.getElementById('p2-quick-search')?.addEventListener('input', (e) => handleQuickSearch(e.target, 'p2'));
    document.getElementById('btn-clear-quick-players')?.addEventListener('click', () => clearQuickMatchPlayers());
    document.getElementById('start-quick-match')?.addEventListener('click', () => startQuickMatch());

    // Pro Mode & Audio
    document.getElementById('pro-mode-section')?.addEventListener('click', () => handleProModeClick());
    document.getElementById('toggle-audio-btn')?.addEventListener('click', () => toggleAudioDetection());
    document.getElementById('btn-accept-rules')?.addEventListener('click', () => acceptRulesAndStart());
    document.getElementById('pro-player-left')?.addEventListener('click', () => addManualGoal(1));
    document.getElementById('pro-player-right')?.addEventListener('click', () => addManualGoal(2));
    document.getElementById('btn-exit-pro-mode')?.addEventListener('click', () => exitProMode());
    document.getElementById('btn-pro-undo')?.addEventListener('click', () => undoLastGoal());
    document.getElementById('btn-pro-reset')?.addEventListener('click', () => resetProMatch());
    document.getElementById('btn-pro-mic')?.addEventListener('click', () => toggleAudioDetection());
    document.getElementById('btn-pro-sound')?.addEventListener('click', () => toggleSoundEffects());
    document.getElementById('btn-pro-tv')?.addEventListener('click', () => copyTvLink());
    document.getElementById('btn-pro-vip')?.addEventListener('click', () => copyVipLink());

    // Victory Overlay
    document.getElementById('btn-victory-new-game')?.addEventListener('click', closeVictoryOverlay);
    document.getElementById('btn-victory-end-game')?.addEventListener('click', closeVictoryOverlay);

    // Event Delegation for dynamic elements inside Quick Match
    document.addEventListener('click', (e) => {
        // Quick Search Selection
        const searchItem = e.target.closest('[data-action="select-quick-player"]');
        if (searchItem) {
            selectQuickPlayer(searchItem.dataset.player, searchItem.dataset.slot);
            return;
        }

        // Claim Result Buttons
        if (e.target.id === 'btn-confirm-claim') {
            saveClaimedResult(parseInt(e.target.dataset.score1), parseInt(e.target.dataset.score2), e.target.dataset.gameId);
            return;
        }
        if (e.target.id === 'btn-cancel-claim') {
            cancelClaimResult();
            return;
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target.id === 'claim-opponent-search') {
            handleQuickSearch(e.target, 'claim');
        }
    });
}