// ============================================================
// SUBSOCCER MOBILE GAME LOGIC
// Standalone tournament engine for phone-only play (no TV)
// Uses BracketEngine directly, no arcadeSocket dependency
// ============================================================

import { BracketEngine } from './bracket-engine.js';

// --- AUTH STATE ---
let isLoggedIn = false;
let currentUserId = null;
let _sb = null;
const MAX_PLAYERS_GUEST = 4;
const MAX_PLAYERS_LOGGED = 8;

// --- SMART MIRROR (TV CAST) ---
let tvRoomCode = null;
let tvChannel = null;
window.isTvMode = false;


// --- GEOLOCATION ---
let userLat = null;
let userLng = null;

function captureGeolocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => { userLat = pos.coords.latitude; userLng = pos.coords.longitude; },
            () => { /* silently ignore denial */ },
            { enableHighAccuracy: false, timeout: 5000 }
        );
    }
}

(async function checkMobileAuth() {
    try {
        const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
        const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
        _sb = supabase.createClient(SUPA_URL, SUPA_KEY);
        
        // 1. Fetch Auth State
        const { data: { session } } = await _sb.auth.getSession();
        if (session && session.user) {
            isLoggedIn = true;
            currentUserId = session.user.id;
            updateAddPlayerButton();
        }

        // Note: Pricing logic removed from here since mobile standalone flow is always free.
    } catch(e) { console.log('Init check:', e.message); }
    
    // Check if we are a TV Receiver
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tv')) {
        window.isTvMode = true;
        tvRoomCode = urlParams.get('tv');
        document.body.classList.add('is-tv-mode');
        initTvReceiver();
    }

    // Always restore player names from sessionStorage (if any) before updating UI
    if (window.restoreMobilePlayers) {
        window.restoreMobilePlayers();
    }
    updateAddPlayerButton();
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
    broadcastTvState();
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
    broadcastTvState();
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
    
    broadcastTvState();
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
    broadcastTvState();

    // Auto-advance after 4 seconds
    setTimeout(() => {
        pMatchProcessing = false;
        nextTournyMatch();
    }, 4000);
}

// ============================================================
// TOURNAMENT COMPLETE
// ============================================================

async function trackTournamentAnonymously(results) {
    // Zero-friction tracking: fires for ALL tournaments (guest + logged-in)
    // Uses public_tracking table which allows anonymous inserts (no auth needed)
    if (!_sb) return;
    try {
        const participants = localEngine.participants.filter(p => p !== 'BYE');
        await _sb.from('public_tracking').insert({
            event_type: 'tournament_finished',
            game_code: 'MOBILE-TOURNAMENT',
            match_score: `${participants.length}p`,
            source_partner: isLoggedIn ? 'registered' : 'guest',
            user_agent: navigator.userAgent,
            browser_lang: navigator.language || 'Unknown'
        });
    } catch (_) { /* silent */ }
}

async function saveTournamentToDatabase(results) {
    // Only save if user is logged in and we have a Supabase client
    if (!isLoggedIn || !_sb || !currentUserId) return;

    try {
        const participants = localEngine.participants.filter(p => p !== 'BYE');
        const now = new Date().toISOString();

        // Capture geolocation NOW (only logged-in users see the prompt,
        // and only when their tournament actually finishes)
        let lat = userLat;
        let lng = userLng;
        if (!lat && navigator.geolocation) {
            try {
                const pos = await new Promise((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
                );
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
                userLat = lat; userLng = lng;
            } catch (_) { /* user denied or timeout — save without coords */ }
        }

        const { error } = await _sb.from('tournament_history').insert({
            tournament_name: `Mobile Tournament ${new Date().toLocaleDateString()}`,
            organizer_id: currentUserId,
            status: 'completed',
            winner_name: results.winner,
            second_place_name: results.second || null,
            start_datetime: now,
            end_datetime: now,
            max_participants: participants.length,
            tournament_type: 'elimination',
            latitude: lat,
            longitude: lng
        });

        if (error) {
            console.warn('Failed to save tournament:', error.message);
        } else {
            console.log('Tournament saved to database with geolocation:', lat, lng);
        }
    } catch (e) {
        console.warn('Tournament save error:', e.message);
    }
}

function showTournamentComplete() {
    const results = localEngine.getTournamentResults();
    const winner = results.winner || 'UNKNOWN';

    // 1. Always track anonymously (zero friction, all users)
    trackTournamentAnonymously(results);
    // 2. Save full details only if logged in
    saveTournamentToDatabase(results);

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
    broadcastTvState();
}

// ============================================================
// SETUP UI HELPERS (Player add/remove for setup screen)
// ============================================================

window.mobileAddPlayer = function(defaultName) {
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
    div.style.cssText = 'display: flex; align-items: center; background: rgba(20, 20, 25, 0.85); padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px; backdrop-filter: blur(10px);';
    div.innerHTML = `
        <span class="player-num" style="color: #888; font-weight: 700; padding: 0 8px; width: 32px;">#${num}</span>
        <input type="text" autocomplete="off" onfocus="this.select()" onkeyup="this.setAttribute('value', this.value); if(window.broadcastTvState) window.broadcastTvState();" value="${defaultName || ('PLAYER ' + num)}" 
               class="player-input" 
               style="color: white; width: 100%; padding: 8px; font-weight: 700; background: transparent; border: none; outline: none; font-family: 'Resolve', sans-serif; letter-spacing: 1px;">

        <button onclick="mobileRemovePlayer(this)" style="color: #E30613; padding: 4px 12px; background: none; border: none; cursor: pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
    updateAddPlayerButton();
    broadcastTvState();
};

let qrJoinChannel = null;
window.openQrJoin = function() {
    // Luodaan satunnainen 4-numeroinen huonekoodi
    const joinCode = Math.floor(1000 + Math.random() * 9000).toString();
    const joinUrl = `${window.location.origin}/join.html?code=${joinCode}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}&margin=0`;

    // Kuunnellaan uusia pelaajia tässä kanavassa
    if (qrJoinChannel) _sb.removeChannel(qrJoinChannel);
    qrJoinChannel = _sb.channel('qr-join-' + joinCode);
    qrJoinChannel.on('broadcast', { event: 'player-join' }, ({ payload }) => {
        if (payload.name) {
            window.mobileAddPlayer(payload.name.toUpperCase());
            // Play a ding sound optionally or just flash screen?
            const addBtn = document.getElementById('m-add-player-btn');
            if(addBtn) {
                const origBg = addBtn.style.background;
                addBtn.style.background = '#4CAF50';
                setTimeout(() => { if(addBtn) addBtn.style.background = origBg; }, 500);
            }
        }
    });
    qrJoinChannel.subscribe();

    // Rakennetaan visuaalinen pop-up yhdellä isolla QR-koodilla
    let existing = document.getElementById('qr-join-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'qr-join-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; display:flex; justify-content:center; align-items:center; flex-direction:column; padding: 20px; font-family:"Subsoccer",sans-serif; text-align:center; backdrop-filter:blur(8px);';
    
    overlay.innerHTML = `
        <div style="background:rgba(20,20,25,0.9); border:1px solid rgba(255,255,255,0.1); padding:40px; border-radius:12px; backdrop-filter:blur(10px); max-width:90%; width: 500px; box-shadow:0 10px 40px rgba(0,0,0,0.8);">
            <h2 style="color:white; margin-bottom:12px; font-size:2rem; letter-spacing:1px; font-family:'Resolve',sans-serif;"><i class="fas fa-qrcode" style="color:#E30613; margin-right:12px;"></i> JOIN TOURNAMENT</h2>
            <p style="color:#aaa; font-size:1rem; margin-bottom:30px; font-family:'Inter',sans-serif; letter-spacing:1px; text-transform:uppercase;">Scan code with your phone camera</p>
            
            <div style="background:white; display:inline-block; padding:15px; border-radius:12px; margin-bottom:25px; border:4px solid #E30613;">
                <img src="${qrImageUrl}" alt="Join QR Code" style="width: 250px; height: 250px; display:block;">
            </div>
            
            <div style="color:#666; font-size:0.8rem; font-family:monospace; margin-bottom:30px;">
                room code: ${joinCode}
            </div>
            
            <button onclick="document.getElementById('qr-join-overlay').remove(); if(qrJoinChannel) { _sb.removeChannel(qrJoinChannel); qrJoinChannel = null; }" style="background:transparent; color:#888; border:1px solid rgba(255,255,255,0.2); padding:15px; font-family:'Resolve',sans-serif; font-size:1rem; border-radius:6px; cursor:pointer; font-weight:bold; letter-spacing:1px; width:100%; transition:0.2s;">
                <i class="fas fa-times" style="margin-right:8px;"></i> SULJE (CLOSE)
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
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
    broadcastTvState();
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
    broadcastTvState();
};

// ============================================================
// TV SPECTATOR BROADCAST (SMART MIRROR)
// ============================================================

window.startTvCast = function() {
    if (!tvRoomCode) {
        tvRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
        tvChannel = _sb.channel('tv-' + tvRoomCode);
        tvChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("Broadcasting to TV...");
                broadcastTvState();
                const castBtn = document.getElementById('cast-btn');
                if (castBtn) { castBtn.style.color = '#4CAF50'; castBtn.innerHTML = `<i class="fas fa-tv mr-2"></i> CASTING: ${tvRoomCode}`; }
            }
        });
    }

    const castUrl = `${window.location.origin}${window.location.pathname}?tv=${tvRoomCode}`;
    
    // Try native share UI first, mostly for mobile devices
    if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
        navigator.share({
            title: 'Subsoccer Tournament Stream',
            text: 'Open this link on the big screen to see the live tournament stats:',
            url: castUrl
        }).catch(err => {
            showCastModal(castUrl);
        });
    } else {
        showCastModal(castUrl);
    }
};

window.showCastModal = function(url) {
    let existing = document.getElementById('cast-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cast-modal-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; justify-content:center; align-items:center; flex-direction:column; padding: 20px; font-family:"Subsoccer",sans-serif; text-align:center; backdrop-filter:blur(5px);';
    
    overlay.innerHTML = `
        <div style="background:rgba(20,20,25,0.85); border:1px solid rgba(255,255,255,0.1); padding:24px; border-radius:12px; backdrop-filter:blur(10px); max-width:90%; width: 340px; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
            <h2 style="color:white; margin-bottom:8px; font-size:1.2rem; letter-spacing:1px; font-family:'Resolve',sans-serif;"><i class="fas fa-tv" style="color:#E30613; margin-right:8px;"></i> SPECTATOR MODE</h2>
            <p style="color:#888; font-size:0.8rem; margin-bottom:16px; font-family:'Resolve',sans-serif; letter-spacing:1px;">OPEN THIS LINK ON ANY SCREEN</p>
            
            <div style="background:rgba(0,0,0,0.5); color:#fff; padding:12px; border-radius:6px; word-break:break-all; font-family:monospace; margin-bottom:20px; border:1px solid rgba(255,255,255,0.05); user-select:all; cursor:pointer;" id="cast-url-box">
                ${url}
            </div>
            
            <div style="display:flex; gap:8px; flex-direction:column;">
                <button id="cast-copy-btn" style="background:transparent; color:#E30613; border:1px solid rgba(227,6,19,0.3); padding:12px; font-family:'Resolve',sans-serif; font-size:0.9rem; border-radius:6px; cursor:pointer; font-weight:bold; letter-spacing:1px; width:100%; transition:0.2s;">
                    <i class="fas fa-copy" style="margin-right:8px;"></i> COPY LINK
                </button>
                <button onclick="document.getElementById('cast-modal-overlay').remove()" style="background:transparent; color:#666; border:none; padding:12px; font-family:'Resolve',sans-serif; font-size:0.8rem; border-radius:6px; cursor:pointer; font-weight:bold; letter-spacing:1px; width:100%;">
                    CLOSE
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const copyBtn = document.getElementById('cast-copy-btn');
    const urlBox = document.getElementById('cast-url-box');

    const copyFn = async () => {
        try {
            await navigator.clipboard.writeText(url);
            copyBtn.innerHTML = '<i class="fas fa-check" style="margin-right:8px;"></i> COPIED!';
            copyBtn.style.color = '#4CAF50';
            copyBtn.style.borderColor = 'rgba(76, 175, 80, 0.3)';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy" style="margin-right:8px;"></i> COPY LINK';
                copyBtn.style.color = '#E30613';
                copyBtn.style.borderColor = 'rgba(227,6,19,0.3)';
            }, 3000);
        } catch(e) {
            const textArea = document.createElement("textarea");
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            copyBtn.innerHTML = '<i class="fas fa-check" style="margin-right:8px;"></i> COPIED!';
            copyBtn.style.color = '#4CAF50';
            copyBtn.style.borderColor = 'rgba(76, 175, 80, 0.3)';
        }
    };

    copyBtn.onclick = copyFn;
    urlBox.onclick = copyFn;
};

function broadcastTvState() {
    if (!tvChannel || window.isTvMode) return; // TV mode doesn't broadcast!
    
    let activeLayer = null;
    document.querySelectorAll('.m-layer').forEach(l => {
        if(l.style.display && l.style.display !== 'none') activeLayer = l.id;
    });

    const state = {
        layer: activeLayer,
        setupHtml: document.getElementById('m-players-list') ? document.getElementById('m-players-list').innerHTML : '',
        bracketHtml: document.getElementById('mobile-bracket-area') ? document.getElementById('mobile-bracket-area').innerHTML : '',
        titleText: document.getElementById('m-tourny-title') ? document.getElementById('m-tourny-title').innerHTML : '',
        standingsHtml: document.getElementById('m-leaderboard-list') ? document.getElementById('m-leaderboard-list').innerHTML : '',
        p1Score: document.getElementById('m-score-p1') ? document.getElementById('m-score-p1').innerText : '',
        p2Score: document.getElementById('m-score-p2') ? document.getElementById('m-score-p2').innerText : '',
        p1Goals: document.getElementById('m-goals-p1') ? document.getElementById('m-goals-p1').innerText : '',
        p2Goals: document.getElementById('m-goals-p2') ? document.getElementById('m-goals-p2').innerText : '',
        p1NameGame: document.getElementById('m-p1-name') ? document.getElementById('m-p1-name').innerText : '',
        p2NameGame: document.getElementById('m-p2-name') ? document.getElementById('m-p2-name').innerText : '',
        nxtRound: document.getElementById('m-round-name') ? document.getElementById('m-round-name').innerText : '',
        nxtP1: document.getElementById('m-matchup-p1') ? document.getElementById('m-matchup-p1').innerText : '',
        nxtP2: document.getElementById('m-matchup-p2') ? document.getElementById('m-matchup-p2').innerText : '',
        vicName: document.getElementById('m-winner-name') ? document.getElementById('m-winner-name').innerText : '',
        vicScore: document.getElementById('m-victory-score') ? document.getElementById('m-victory-score').innerText : '',
        champName: document.getElementById('m-champion-name') ? document.getElementById('m-champion-name').innerHTML : ''
    };
    
    tvChannel.send({ type: 'broadcast', event: 'tv-update', payload: state });
}

window.broadcastTvState = broadcastTvState;

function initTvReceiver() {
    tvChannel = _sb.channel('tv-' + tvRoomCode);
    tvChannel.on('broadcast', { event: 'tv-update' }, ({ payload }) => {
        console.log("Received TV Sync:", payload);
        
        // 1. Sync innerTexts and HTMLs safely
        const e = (id, html) => { if(document.getElementById(id) && html !== undefined) document.getElementById(id).innerHTML = html; };
        const t = (id, text) => { if(document.getElementById(id) && text !== undefined) document.getElementById(id).innerText = text; };

        e('m-players-list', payload.setupHtml);
        e('mobile-bracket-area', payload.bracketHtml);
        e('m-tourny-title', payload.titleText);
        e('m-leaderboard-list', payload.standingsHtml);
        e('m-champion-name', payload.champName);
        
        t('m-score-p1', payload.p1Score);
        t('m-score-p2', payload.p2Score);
        t('m-goals-p1', payload.p1Goals);
        t('m-goals-p2', payload.p2Goals);
        t('m-p1-name', payload.p1NameGame);
        t('m-p2-name', payload.p2NameGame);
        
        t('m-round-name', payload.nxtRound);
        t('m-matchup-p1', payload.nxtP1);
        t('m-matchup-p2', payload.nxtP2);
        
        t('m-winner-name', payload.vicName);
        t('m-victory-score', payload.vicScore);
        
        // 2. Switch layer
        if (payload.layer) {
            document.querySelectorAll('.m-layer').forEach(l => {
                l.style.display = (l.id === payload.layer) ? 'flex' : 'none';
            });
        }
    }).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log("TV Spectator Connected!");
        }
    });
}

if (!window.isTvMode) {
    showLayer('m-layer-setup');
}
