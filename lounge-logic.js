import { arcadeSocket } from './socket-service.js';
import { BracketEngine } from './bracket-engine.js';

// STRIPE DELETED: Pure Free-to-Play Arcade Web Logic
const tableId = 'table-04';
arcadeSocket.connect();

// Kysy TV:ltä tuoreimmat konfiguraatiot
let cfgInterval = setInterval(() => {
    if (arcadeSocket.isConnected) {
        arcadeSocket.send('request_table_config', {});
    }
}, 500);

const urlParams = new URLSearchParams(window.location.search);

if (urlParams.get('reconnect') === 'true') {
    // RECONNECT FLOW
    setTimeout(() => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        arcadeSocket.send('ping_reconnect', {});
        
        // Timeout if TV didn't answer in time, default to instructions
        setTimeout(() => {
            if (!gameState.isTournament) {
                document.getElementById('s-onboarding').classList.add('active');
            }
        }, 3000);
    }, 500);
} else {
    // Normal init
    setTimeout(() => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('s-onboarding').classList.add('active'); // Start with onboarding!
    }, 50);
}

// --- APPLICATION STATE ---
let gameState = {
    p1Score: 0,
    p2Score: 0,
    p1Name: "PLAYER 1",
    p2Name: "PLAYER 2",
    isTournament: false
};

window.tableConfig = JSON.parse(localStorage.getItem('subsoccer_table_config')) || {
    matchTime: 90,
    tiebreaker: 'coin',
    basePrice: 2.00,
    freePlay: true
};

if (window.tableConfig.freePlay === undefined) {
    window.tableConfig.freePlay = true; // Fallback for arcade demo
}

arcadeSocket.on('update_table_config', (payload) => {
    if (cfgInterval) {
        clearInterval(cfgInterval);
        cfgInterval = null;
    }
    window.tableConfig = { ...window.tableConfig, ...payload };
    localStorage.setItem('subsoccer_table_config', JSON.stringify(window.tableConfig));
    
    // Always update dynamic pricing and UI visibility no matter what screen we are on,
    // so if a user just opened the QR code they see Free Play immediately!
    if (window.updateDynamicPrice) {
        window.updateDynamicPrice();
    }
});

arcadeSocket.on('tourny_state_recovery', (payload) => {
    if (!payload.players || payload.players.length === 0) return;
    
    // We rebuild the local engine from the TV Master State
    gameState.isTournament = true;
    let dummy = document.getElementById('dummy-bracket-area');
    if (!dummy) {
        dummy = document.createElement('div');
        dummy.id = 'dummy-bracket-area';
        dummy.style.display = 'none';
        document.body.appendChild(dummy);
    }
    localEngine = new BracketEngine({ containerId: 'dummy-bracket-area', enableSaveButton: false });
    localEngine.generateBracket(payload.players, false); // false = DON'T SHUFFLE, PRESERVE TV ORDER
    if (payload.matches) {
       localEngine.restoreState(payload.matches);
    }
    nextTournyMatch();
});

arcadeSocket.on('active_match_recovery', (payload) => {
    // If the TV is currently in the middle of a match when we reconnect, jump straight to the controller!
    gameState.isTournament = payload.isTournament;
    gameState.p1Name = payload.p1Name;
    gameState.p2Name = payload.p2Name;
    gameState.p1Score = payload.p1Score;
    gameState.p2Score = payload.p2Score;

    document.getElementById('lbl-p1').innerText = gameState.p1Name;
    document.getElementById('lbl-p2').innerText = gameState.p2Name;
    document.getElementById('lbl-score-p1').innerText = gameState.p1Score;
    document.getElementById('lbl-score-p2').innerText = gameState.p2Score;

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('s-controller').classList.add('active');
    
    // Resume a local timer instance just in case
    startRemoteTimer();
});

let localEngine = null;
let pMatchProcessing = false;
let remoteTimerInterval;
let isOnboardingDone = false;

window.startFreeTournament = function () {
    const inputs = document.querySelectorAll('.player-input');
    const players = Array.from(inputs).map(i => i.value.trim() || 'UNKNOWN');
    localStorage.setItem('subsoccer_saved_roster', JSON.stringify(players));

    const btn = document.getElementById('btn-start-free');
    if (btn) {
        btn.style.opacity = '0.5';
        btn.innerHTML = '<span><i class="fas fa-spinner fa-spin mr-2"></i> PROCESSING...</span>';
    }

    // Aktivoi Pöydän Releet heti
    arcadeSocket.send('payment_success', { mode: 'tournament' });

    setTimeout(() => {
        switchScreen('s-tourny-setup');
        generateTournament();
    }, 300);
};



function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');

    if (screenId === 's-tourny-setup') {
        arcadeSocket.send('lobby_opened', { tableId });
        setTimeout(broadcastRoster, 100);
    } else if (screenId === 's-tourny-hub' || screenId === 's-controller') {
        arcadeSocket.send('lobby_closed', { tableId });
    }
}

function pushState(lastScorer = null) {
    arcadeSocket.send('state_update', { ...gameState, lastScorer });
}

let matchRemaining = 90;
let matchTimerInterval;

function startRemoteTimer() {
    clearInterval(matchTimerInterval);
    matchRemaining = window.tableConfig?.matchTime || 90;
    
    // Announce match start so TV can sync its timer
    const duration = window.tableConfig?.matchTime || 90;
    arcadeSocket.send('timer_start', { duration: duration });

    const remoteTimerEl = document.getElementById('remote-timer');
    if (window.tableConfig?.basicMode) {
        remoteTimerEl.innerHTML = `<i class="fas fa-trophy mr-1"></i> FIRST TO 3`;
        remoteTimerEl.style.color = "var(--subsoccer-gold)";
        return; // No countdown!
    }

    remoteTimerEl.style.color = "";
    const endTime = Date.now() + (duration * 1000);

    matchTimerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        
        if (remaining <= 0) {
            clearInterval(matchTimerInterval);
            handleMatchTimeUp();
            return;
        }
        
        const s = remaining.toString().padStart(2, '0');
        remoteTimerEl.innerHTML = `<i class="fas fa-clock mr-1"></i> ${s}`;
        if (remaining <= 10) remoteTimerEl.style.color = "var(--subsoccer-red)";
        else remoteTimerEl.style.color = "";
    }, 500); // Check faster to reduce 1 sec stutters returning from sleep
}

function handleMatchTimeUp(bypassLock = false) {
    if (pMatchProcessing && !bypassLock) return;
    pMatchProcessing = true;

    let wName = null;
    let wIndex = 0;

    if (gameState.p1Score > gameState.p2Score) {
        wName = gameState.p1Name; wIndex = 1;
        finishTournyMatch(wName, wIndex);
    } else if (gameState.p2Score > gameState.p1Score) {
        wName = gameState.p2Name; wIndex = 2;
        finishTournyMatch(wName, wIndex);
    } else {
        // TIEBREAKER!!
        document.getElementById('remote-timer').innerHTML = `<i class="fas fa-random mr-1"></i> TIEBREAK`;
        arcadeSocket.send('trigger_tiebreaker', { p1: gameState.p1Name, p2: gameState.p2Name });
        setTimeout(() => {
            const isP1 = Math.random() < 0.5;
            wName = isP1 ? gameState.p1Name : gameState.p2Name;
            wIndex = isP1 ? 1 : 2;
            finishTournyMatch(wName, wIndex);
        }, 5000); // 5s for TV to hype the draw
    }
}

// --- TOURNAMENT LOGIC ---

window.addPlayerInput = function () {
    const container = document.getElementById('tourny-players-list');
    const num = container.children.length + 1;
    // Tournaments support 4 to 8 players, single supports 2
    if (num > 8) return;
    let div = document.createElement('div');
    div.className = "flex items-center bg-[#111] p-2 rounded-lg border border-[#333] mb-3 player-row relative";
    div.innerHTML = `<span class="player-num text-gray-500 font-bold px-2 w-8">#${num}</span><input type="text" autocomplete="off" onfocus="this.select()" oninput="broadcastRoster()" value="PLAYER ${num}" class="player-input text-white w-full p-2 text-lg uppercase font-bold bg-transparent focus:outline-none placeholder-gray-600"><button onclick="removePlayer(this)" class="text-red-500 px-3 py-1"><i class="fas fa-times"></i></button>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    broadcastRoster();
    if (window.updateDynamicPrice) window.updateDynamicPrice();
};

window.removePlayer = function (btn) {
    const row = btn.closest('.player-row');
    const container = document.getElementById('tourny-players-list');

    // Check if less than or equal to 2 players, then don't remove or allow it
    if (container.querySelectorAll('.player-row').length <= 2) {
        // Just clear the input name if they try to delete the last 2
        row.querySelector('.player-input').value = "";
    } else {
        row.remove();
        // Update numbers
        const rows = container.querySelectorAll('.player-row');
        rows.forEach((r, idx) => {
            r.querySelector('.player-num').innerText = "#" + (idx + 1);
        });
    }
    broadcastRoster();
    if (window.updateDynamicPrice) window.updateDynamicPrice();
};

window.broadcastRoster = function () {
    const players = [];
    document.querySelectorAll('.player-input').forEach(inp => {
        if (inp.value.trim()) players.push(inp.value.trim());
    });
    document.querySelectorAll('.verified-player-name').forEach(el => {
        if (el.innerText.trim()) players.push(el.innerText.trim());
    });
    arcadeSocket.send('roster_update', { players });
};

// --- LOBBY JOIN LISTENER ---
arcadeSocket.on('lobby_player_joined', (payload) => {
    const player = payload.payload;
    if (!player || !player.username) return;

    const container = document.getElementById('tourny-players-list');
    if (container.children.length >= 16) return;

    const li = document.createElement('div');
    li.className = "flex items-center bg-[#1a1a1a] p-2 rounded-lg border border-[#D4AF37] mb-3 relative player-row";
    li.innerHTML = `
        <span class="text-[#D4AF37] font-bold px-2 w-8"><i class="fas fa-check-circle"></i></span>
        <div class="verified-player-name text-white w-full p-2 font-bold font-sans tracking-widest uppercase">${player.username}</div>
        <div class="text-[10px] bg-[#D4AF37] text-black px-2 py-1 rounded font-bold font-sans tracking-widest absolute right-2">${player.elo} ELO</div>
    `;
    container.appendChild(li);

    li.style.transform = "scale(1.05)";
    li.style.transition = "transform 0.2s";
    setTimeout(() => { li.style.transform = "scale(1)"; }, 200);

    broadcastRoster();
});

window.generateTournament = function () {
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

    // BracketEngine needs a container
    let dummy = document.getElementById('dummy-bracket-area');
    if (!dummy) {
        dummy = document.createElement('div');
        dummy.id = 'dummy-bracket-area';
        dummy.style.display = 'none';
        document.body.appendChild(dummy);
    }

    localEngine = new BracketEngine({ containerId: 'dummy-bracket-area', enableSaveButton: false });
    localEngine.generateBracket(players, true);

    syncTournyToTV();
    nextTournyMatch();
};

window.syncTournyToTV = function (isComplete = false) {
    arcadeSocket.send('tourny_state', {
        players: localEngine.participants,
        matches: localEngine.getAllMatches(),
        isComplete: isComplete
    });
};

function getPendingMatch() {
    const roundIdx = localEngine.getActiveRoundIndex();
    if (roundIdx >= localEngine.rounds.length) return null;

    const round = localEngine.rounds[roundIdx];
    for (let i = 0; i < round.length; i++) {
        const m = round[i];
        if (m.p1 && m.p2 && !m.winner && m.p1 !== 'BYE' && m.p2 !== 'BYE') {
            return { rIndex: roundIdx, mIndex: i, p1: m.p1, p2: m.p2, roundName: localEngine.getRoundName(roundIdx, localEngine.rounds.length) };
        }
    }
    return null;
}

function nextTournyMatch() {
    const pending = getPendingMatch();
    if (!pending) {
        // Tournament is over!
        // Show winner briefly on the phone, then reload to start entirely fresh!
        const res = localEngine.getTournamentResults();
        const winner = res.winner || 'PLAYER';
        
        const hubHtml = document.getElementById('tourny-matchup');
        if(hubHtml) hubHtml.innerHTML = `<h2 class="text-3xl text-[#D4AF37] font-bold mb-4">🏆 ${winner}</h2><p class="text-white text-lg">WINS TOURNAMENT!</p><p class="text-gray-500 text-sm mt-4">Returning to start...</p>`;
        
        switchScreen('s-tourny-hub');
        
        // Reload after a very brief delay to wipe state and let them buy a new game
        setTimeout(() => {
            // Signal the Hardware Daemon to turn off the table power
            arcadeSocket.send('arcade_idle', { reason: 'tournament_over' });
            
            setTimeout(() => {
                window.location.reload(true);
            }, 1000);
        }, 8000);
        return;
    }

    window.currentPendingMatch = pending;
    document.getElementById('tourny-round-name').innerText = pending.roundName;
    document.getElementById('tourny-matchup').innerHTML = `${pending.p1}<br><span class="text-xs text-red-500">VS</span><br>${pending.p2}`;
    switchScreen('s-tourny-hub');
}

window.startTournyMatch = function () {
    if (!window.currentPendingMatch) return;
    gameState.p1Score = 0;
    gameState.p2Score = 0;
    gameState.p1Name = window.currentPendingMatch.p1;
    gameState.p2Name = window.currentPendingMatch.p2;
    gameState.isTournament = true;

    document.getElementById('lbl-p1').innerText = gameState.p1Name;
    document.getElementById('lbl-p2').innerText = gameState.p2Name;
    
    // Reset background scores
    document.getElementById('lbl-score-p1').innerText = "0";
    document.getElementById('lbl-score-p2').innerText = "0";

    arcadeSocket.send('start_1v1', { p1: gameState.p1Name, p2: gameState.p2Name });
    switchScreen('s-controller');
    startRemoteTimer();
};

window.startOnboardingSequence = function () {
    // Animoitus (vilkutus valoille)
    arcadeSocket.send('trigger_onboarding_flash', {});
    
    // Trigger preparation mode holding screen on TV
    arcadeSocket.send('trigger_preparation_mode', {});
    
    // Siirrytään Pelaajien lisäykseen välittömästi ilman viivettä
    switchScreen('s-tourny-setup');
};

window.sendGoal = function (playerNumber) {
    if (pMatchProcessing) return;

    if (playerNumber === 1) {
        gameState.p1Score++;
        document.getElementById('lbl-score-p1').innerText = gameState.p1Score;
    }
    if (playerNumber === 2) {
        gameState.p2Score++;
        document.getElementById('lbl-score-p2').innerText = gameState.p2Score;
    }

    pushState();
    if (navigator.vibrate) navigator.vibrate(50);
    
    if (window.tableConfig?.basicMode) {
        if (gameState.p1Score >= 3 || gameState.p2Score >= 3) {
            pMatchProcessing = true; // Prevent further button clicking!
            setTimeout(() => {
                handleMatchTimeUp(true);
            }, 1000);
        }
    }
};

window.skipMatch = function (winnerNumber) {
    if (pMatchProcessing) return;

    // Antaa voittajalle heti maalin ja päättää pelin
    if (winnerNumber === 1) gameState.p1Score++;
    if (winnerNumber === 2) gameState.p2Score++;

    pushState();

    pMatchProcessing = true;
    clearInterval(matchTimerInterval);
    const winnerName = winnerNumber === 1 ? gameState.p1Name : gameState.p2Name;

    finishTournyMatch(winnerName, winnerNumber);
};

function finishTournyMatch(winnerName, winnerIndex = 0) {
    localEngine.setMatchWinner(window.currentPendingMatch.rIndex, window.currentPendingMatch.mIndex, winnerName, true);
    const hasMoreMatches = getPendingMatch() !== null;
    syncTournyToTV(!hasMoreMatches);

    arcadeSocket.send('end_game', {
        winnerName: winnerName,
        winnerIndex: winnerIndex,
        p1Score: gameState.p1Score,
        p2Score: gameState.p2Score,
        mode: 'tournament',
        isBracketComplete: !hasMoreMatches
    });

    if (window.remoteTournyTimeout) clearTimeout(window.remoteTournyTimeout);
    window.remoteTournyTimeout = setTimeout(() => {
        pMatchProcessing = false;
        nextTournyMatch();
    }, 3000);
}

function finishMatch(winnerName = "DRAW", winnerIndex = 0) {
    arcadeSocket.send('end_game', {
        winnerName: winnerName,
        winnerIndex: winnerIndex,
        p1Score: gameState.p1Score,
        p2Score: gameState.p2Score,
        mode: 'freestyle',
        isBracketComplete: true
    });

    document.getElementById("modes-title").innerText = winnerName === "DRAW" ? "IT'S A DRAW!" : `${winnerName} WINS!`;
    document.getElementById("modes-title").style.color = "var(--subsoccer-red)";

    const formatTime = `${Math.floor(matchRemaining / 60)}:${(matchRemaining % 60).toString().padStart(2, '0')}`;
    document.getElementById("modes-subtitle").innerHTML = `Match Over! You have <strong class="text-red-500">${formatTime}</strong> remaining in your booking. What next?`;
    document.getElementById('btn-1v1-text').innerText = "NEW 1VS1 MATCH";

    switchScreen('s-tourny-setup');
}

window.forceTVReload = function () {
    if (!arcadeSocket.isConnected) return;
    arcadeSocket.send('force_reload', {});
}

function resetSystem() {
    clearInterval(matchTimerInterval);
    arcadeSocket.send('reset_system', {});

    const p1 = document.getElementById('p1Name');
    const p2 = document.getElementById('p2Name');
    if (p1) p1.value = "PLAYER 1";
    if (p2) p2.value = "PLAYER 2";

    document.getElementById("modes-title").innerText = "";
    document.getElementById("modes-title").style.color = "#111";
    document.getElementById("modes-subtitle").innerHTML = "Your 15 minute free session is ready to begin.";


    switchScreen('s-payment');
}

window.switchScreen = switchScreen;
window.finishMatch = finishMatch;
window.resetSystem = resetSystem;

// Wallet Logic for Demo
function checkWalletTickets() {
    const useBtn = document.getElementById('btn-use-ticket');
    const badge = document.getElementById('ticket-badge');
    if (!useBtn) return;
    
    let tickets = parseInt(localStorage.getItem('freeplay_tickets')) || 0;
    if (tickets > 0) {
        useBtn.style.display = 'flex';
        badge.innerText = `${tickets} LEFT`;
    } else {
        useBtn.style.display = 'none';
    }
}
window.checkWalletTickets = checkWalletTickets;

window.useFreeTicket = function() {
    let tickets = parseInt(localStorage.getItem('freeplay_tickets')) || 0;
    if (tickets <= 0) return;
    
    // Deduct one ticket
    tickets--;
    localStorage.setItem('freeplay_tickets', tickets.toString());
    
    // Save current players
    const inputs = document.querySelectorAll('.player-input');
    const players = Array.from(inputs).map(i => i.value.trim() || 'UNKNOWN');
    localStorage.setItem('subsoccer_saved_roster', JSON.stringify(players));
    
    // Simulate successful payment bypassing Shelly
    const startBtn = document.getElementById('btn-checkout');
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REDEEMING TICKET...';
    startBtn.style.backgroundColor = '#D4AF37';
    startBtn.style.color = '#000';
    
    // Check wallet count to update UI
    checkWalletTickets();
    
    setTimeout(() => {
        window.location.href = window.location.pathname + "?payment=success&mode=tournament";
    }, 1500);
}

window.useFreeTicketCode = async function(code) {
    if (!code) return;
    
    // UI Feedback
    const startBtn = document.getElementById('btn-checkout');
    const originalText = startBtn.innerHTML;
    startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> VERIFYING...';
    startBtn.style.pointerEvents = 'none';
    
    try {
        const { _supabase } = await import('./config.js');
        
        let voucherId = null;
        
        // 0. HARDCODED MASTER ADMIN CODE
        if (code.trim().toUpperCase() === "ADMIN-100-USES") {
             console.warn("MASTER CODE ACCEPTED. BYPASSING DB VERIFICATION.");
        } else {
            // 1. Verify code exists and is not redeemed
            const { data: voucher, error } = await _supabase
                .from('gift_cards')
                .select('*')
                .eq('code', code.trim().toUpperCase())
                .single();
                
            if (error || !voucher) {
                alert("Invalid promo code.");
                startBtn.innerHTML = originalText;
                startBtn.style.pointerEvents = 'auto';
                return;
            }
            
            if (voucher.is_redeemed) {
                alert("This promo code has already been used!");
                startBtn.innerHTML = originalText;
                startBtn.style.pointerEvents = 'auto';
                return;
            }
            
            voucherId = voucher.id;
        }
        
        if (voucherId) {
            // 2. Mark code as redeemed for normal DB codes
            const urlParams = new URLSearchParams(window.location.search);
            const gameIdParam = urlParams.get('game_id');
            
            await _supabase
                .from('gift_cards')
                .update({ 
                    is_redeemed: true, 
                    redeemed_at: new Date().toISOString(),
                    redeemed_game_id: gameIdParam || null
                })
                .eq('id', voucherId);
        }

        // Clear the saved promo from mobile wallet so it isn't used infinitely
        localStorage.removeItem('subsoccer_saved_promo');

        // Save current players as we are starting the match
        const inputs = document.querySelectorAll('.player-input');
        const players = Array.from(inputs).map(i => i.value.trim() || 'UNKNOWN');
        localStorage.setItem('subsoccer_saved_roster', JSON.stringify(players));
        
        // Success Feedback
        startBtn.innerHTML = '<i class="fas fa-check"></i> VIP CODE ACCEPTED';
        startBtn.style.backgroundColor = '#22c55e'; // green
        startBtn.style.color = '#fff';
        
        // Force redirect to start match bypassing Stripe
        setTimeout(() => {
            window.location.href = window.location.pathname + "?payment=success&mode=tournament";
        }, 1500);
        
    } catch (err) {
        console.error("Voucher error:", err);
        alert("Verification failed. Check network.");
        startBtn.innerHTML = originalText;
        startBtn.style.pointerEvents = 'auto';
    }
}

window.updateDynamicPrice();
