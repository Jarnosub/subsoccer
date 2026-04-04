import { arcadeSocket } from './socket-service.js';
import { BracketEngine } from './bracket-engine.js';

const tableId = 'table-04';
arcadeSocket.connect();

// STRIPE PAYMENT REDIRECT LISTENER
const urlParams = new URLSearchParams(window.location.search);
const paymentMode = urlParams.get('mode');

if (urlParams.get('payment') === 'success') {
    // Siistitä URL, ettei refresh aktivoi maksua uudestaan
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Aktivoi Pöydän Releet ja pelitila livenä
    setTimeout(() => {
        arcadeSocket.send('payment_success', { mode: paymentMode });
        
        if (paymentMode === 'single') {
            document.getElementById('setup-title').innerText = "SINGLE MATCH SETUP";
            document.getElementById('setup-subtitle').innerText = "Enter precisely 2 players.";
            if(document.getElementById('btn-add-player')) document.getElementById('btn-add-player').style.display = 'none';
            // Ensure only 2 rows exist
            const list = document.getElementById('tourny-players-list');
            while(list.children.length > 2) { list.lastElementChild.remove(); }
            switchScreen('s-tourny-setup');
        } else {
            document.getElementById('setup-title').innerText = "TOURNAMENT SETUP";
            document.getElementById('setup-subtitle').innerText = "Add 4 to 8 players.";
            if(document.getElementById('btn-add-player')) document.getElementById('btn-add-player').style.display = 'block';
            switchScreen('s-tourny-setup');
        }
    }, 500);
}

// --- APPLICATION STATE ---
let gameState = {
    p1Score: 0,
    p2Score: 0,
    p1Name: "PLAYER 1",
    p2Name: "PLAYER 2",
    isTournament: false
};

let localEngine = null;
let pMatchProcessing = false;
let remoteTimerInterval;

function startStripeCheckout(mode) {
    // Piilota molemmat painikkeet
    document.querySelectorAll('.screen.active button').forEach(b => b.style.display = 'none');
    document.getElementById('payment-spinner').classList.remove('hidden');
    document.getElementById('payment-spinner').classList.add('flex');
    
    const checkoutUrl = "https://buy.stripe.com/test_XXXXXXXXXXXX"; // Odottaa oikeaa!
    
    setTimeout(() => {
        // Simuloidaan selaimen ohjautumista Stripen läpi ja palaamista Success-lipulla
        window.location.href = window.location.pathname + "?payment=success&mode=" + mode;
    }, 1500);
}
window.startStripeCheckout = startStripeCheckout;


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

let remaining = 15 * 60;
let isTimerStarted = false;
function startRemoteTimer() {
    if (isTimerStarted) return;
    isTimerStarted = true;
    clearInterval(remoteTimerInterval);
    document.getElementById('remote-timer').style.color = "";
    remoteTimerInterval = setInterval(() => {
        if(remaining <= 0) {
            resetSystem();
            return;
        }
        remaining--;
        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        document.getElementById('remote-timer').innerHTML = `<i class="fas fa-clock mr-1"></i> ${m}:${s}`;
        if(remaining <= 60) document.getElementById('remote-timer').style.color = "var(--subsoccer-red)";
    }, 1000);
}

// --- TOURNAMENT LOGIC ---

window.addPlayerInput = function() {
    const container = document.getElementById('tourny-players-list');
    const num = container.children.length + 1;
    // Tournaments support 4 to 8 players, single supports 2
    if (num > 8) return; 
    let div = document.createElement('div');
    div.className = "flex items-center bg-[#111] p-2 rounded-lg border border-[#333] mb-3 player-row relative";
    div.innerHTML = `<span class="player-num text-gray-500 font-bold px-2 w-8">#${num}</span><input type="text" autocomplete="off" onfocus="this.select()" oninput="broadcastRoster()" value="PLAYER ${num}" class="player-input text-white w-full p-2 font-bold bg-transparent focus:outline-none placeholder-gray-600"><button onclick="removePlayer(this)" class="text-red-500 px-3 py-1"><i class="fas fa-times"></i></button>`;
    container.appendChild(div);
    broadcastRoster();
};

window.removePlayer = function(btn) {
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
};

window.broadcastRoster = function() {
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
    if(!player || !player.username) return;

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

window.generateTournament = function() {
    const inputs = document.querySelectorAll('.player-input');
    const players = [];
    inputs.forEach(i => {
        if(i.value.trim()) players.push(i.value.trim());
    });
    
    if (paymentMode === 'single') {
        if(players.length !== 2) {
            alert("This mode requires exactly 2 players.");
            return;
        }
        gameState.isTournament = false;
        gameState.p1Score = 0;
        gameState.p2Score = 0;
        gameState.p1Name = players[0];
        gameState.p2Name = players[1];
        
        arcadeSocket.send('start_1v1', { p1: players[0], p2: players[1] });
        startRemoteTimer();
        switchScreen('s-controller');
        setTimeout(() => pushState(), 1000);
    } else {
        if(players.length < 4 || players.length > 8) {
            alert("Tournament requires 4 to 8 players.");
            return;
        }
        gameState.isTournament = true;
        
        localEngine = new BracketEngine(players);
        const structure = localEngine.getJsonStructure();
        
        arcadeSocket.send('tournament_init', { players, structure });
        
        switchScreen('s-tourny-hub');
        renderNextTournamentMatchup();
    }
};

function syncTournyToTV() {
    arcadeSocket.send('tourny_state', {
            players: localEngine.participants,
            matches: localEngine.getAllMatches(),
        });
}

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
        const res = localEngine.getTournamentResults();
        document.getElementById("modes-title").innerText = `🏆 ${res.winner || 'PLAYER'} WINS TOURNAMENT!`;
        document.getElementById("modes-title").style.color = "var(--subsoccer-gold)";
        
        switchScreen('s-game-over');
        return;
    }

    window.currentPendingMatch = pending;
    document.getElementById('tourny-round-name').innerText = pending.roundName;
    document.getElementById('tourny-matchup').innerHTML = `${pending.p1}<br><span class="text-xs text-red-500">VS</span><br>${pending.p2}`;
    switchScreen('s-tourny-hub');
}

window.startTournyMatch = function() {
    if (!window.currentPendingMatch) return;
    gameState.p1Score = 0;
    gameState.p2Score = 0;
    gameState.p1Name = window.currentPendingMatch.p1;
    gameState.p2Name = window.currentPendingMatch.p2;
    gameState.isTournament = true;
    
    document.getElementById('lbl-p1').innerText = gameState.p1Name;
    document.getElementById('lbl-p2').innerText = gameState.p2Name;

    arcadeSocket.send('start_1v1', { p1: gameState.p1Name, p2: gameState.p2Name });
    switchScreen('s-controller');
    startRemoteTimer();
};

window.sendGoal = function(playerNumber) {
    if (pMatchProcessing) return;

    if (playerNumber === 1) gameState.p1Score++;
    if (playerNumber === 2) gameState.p2Score++;

    pushState();
    if (navigator.vibrate) navigator.vibrate(50);

    if (gameState.p1Score >= 3 || gameState.p2Score >= 3) {
        pMatchProcessing = true;
        const winnerIndex = gameState.p1Score >= 3 ? 1 : 2;
        const winnerName = winnerIndex === 1 ? gameState.p1Name : gameState.p2Name;
        if (gameState.isTournament) {
            finishTournyMatch(winnerName, winnerIndex);
        } else {
            finishMatch(winnerName, winnerIndex);
            setTimeout(() => { pMatchProcessing = false; }, 3000);
        }
    }
};

window.skipMatch = function(winnerNumber) {
    if (pMatchProcessing) return;
    
    if(winnerNumber === 1) gameState.p1Score = 3;
    if(winnerNumber === 2) gameState.p2Score = 3;
    
    pushState();
    
    pMatchProcessing = true;
    const winnerName = winnerNumber === 1 ? gameState.p1Name : gameState.p2Name;
    
    if (gameState.isTournament) {
        finishTournyMatch(winnerName, winnerNumber);
    } else {
        finishMatch(winnerName, winnerNumber);
        setTimeout(() => { pMatchProcessing = false; }, 3000);
    }
};

function finishTournyMatch(winnerName, winnerIndex = 0) {
    localEngine.setMatchWinner(window.currentPendingMatch.rIndex, window.currentPendingMatch.mIndex, winnerName, true);
    syncTournyToTV();
    
    const hasMoreMatches = getPendingMatch() !== null;

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
    
    const formatTime = `${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}`;
    document.getElementById("modes-subtitle").innerHTML = `Match Over! You have <strong class="text-red-500">${formatTime}</strong> remaining in your booking. What next?`;
    document.getElementById('btn-1v1-text').innerText = "NEW 1VS1 MATCH";
    
    switchScreen('s-game-over');
}

window.forceTVReload = function() {
    if(!channel) return;
    arcadeSocket.send('force_reload', {});
}

function resetSystem() {
    isTimerStarted = false;
    remaining = 15 * 60;
    arcadeSocket.send('reset_system', {});

    const p1 = document.getElementById('p1Name');
    const p2 = document.getElementById('p2Name');
    if(p1) p1.value = "PLAYER 1";
    if(p2) p2.value = "PLAYER 2";
    
    document.getElementById("modes-title").innerText = "";
    document.getElementById("modes-title").style.color = "#111";
    document.getElementById("modes-subtitle").innerHTML = "Your 15 minute free session is ready to begin.";
    
    
    switchScreen('s-welcome');
}

window.switchScreen = switchScreen;
window.finishMatch = finishMatch;
window.resetSystem = resetSystem;
