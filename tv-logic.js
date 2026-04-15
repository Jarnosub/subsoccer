import { _supabase } from './config.js';
import { BracketEngine } from './bracket-engine.js';
import { arcadeSocket } from './socket-service.js';

// --- TIMEOUT TRACKING ---
let tvTimeouts = [];
function clearAllTvTimeouts() {
    tvTimeouts.forEach(clearTimeout);
    tvTimeouts = [];
}
function addTvTimeout(fn, ms) {
    tvTimeouts.push(setTimeout(fn, ms));
}

// --- STATE & UTILS ---
const globalUrlParams = new URLSearchParams(window.location.search);
const tableId = globalUrlParams.get('game_id') || 'table-04';
window.tableId = tableId; // Attach to window so it can be picked up globally

let timerInterval;
const cfg = JSON.parse(localStorage.getItem('subsoccer_table_config')) || {};
let remainingSeconds = cfg.matchTime || 90;
let isTimerTicking = false;
let lastP1 = "PLAYER 1";
let lastP2 = "PLAYER 2";

// --- CACHED AUDIO (prevent memory leak from new Audio() per goal) ---
const cachedGoalHorn = new Audio('/goal_horn.mp3');
const cachedSwoosh = new Audio('/swoosh.mp3');
const cachedVictoryTheme = new Audio('sounds/victory_theme.m4a');

function playCachedAudio(audioObj) {
    const enabled = window.tableConfig && window.tableConfig.audioEnabled !== undefined ? window.tableConfig.audioEnabled : true;
    const vol = window.tableConfig && window.tableConfig.audioVolume !== undefined ? (window.tableConfig.audioVolume / 100) : 1.0;
    if (!enabled || vol <= 0) return;
    audioObj.volume = vol;
    audioObj.currentTime = 0;
    audioObj.play().catch(() => {});
}

const L = {
    lobby: document.getElementById('layer-lobby'),
    intro: document.getElementById('layer-intro'),
    sessionLobby: document.getElementById('layer-session-lobby'),
    game: document.getElementById('layer-game'),
    victory: document.getElementById('layer-victory'),
    tournament: document.getElementById('layer-tournament'),
    elo: document.getElementById('layer-elo')
};

// P1 & P2 Cache so we can populate the Session Lobby screen
let playerRatings = {};
let playerSessionWins = {};

async function calculateElo(p1Name, p2Name, winnerName, p1Score = 0, p2Score = 0) {
    if (!p1Name || !p2Name || p1Name === "BYE" || p2Name === "BYE") return;
    if (winnerName === "DRAW") return;

    const { data: p1Data } = await _supabase.from('players').select('id, elo').ilike('username', p1Name).maybeSingle();
    const { data: p2Data } = await _supabase.from('players').select('id, elo').ilike('username', p2Name).maybeSingle();

    if (!playerRatings[p1Name]) playerRatings[p1Name] = p1Data ? p1Data.elo : 1000;
    if (!playerRatings[p2Name]) playerRatings[p2Name] = p2Data ? p2Data.elo : 1000;

    const r1 = Math.pow(10, playerRatings[p1Name] / 400);
    const r2 = Math.pow(10, playerRatings[p2Name] / 400);

    const e1 = r1 / (r1 + r2);
    const e2 = r2 / (r1 + r2);

    const K = 32;
    const s1 = winnerName === p1Name ? 1 : 0;
    const s2 = winnerName === p2Name ? 1 : 0;

    const newP1Elo = Math.round(playerRatings[p1Name] + K * (s1 - e1));
    const newP2Elo = Math.round(playerRatings[p2Name] + K * (s2 - e2));

    playerRatings[p1Name] = newP1Elo;
    playerRatings[p2Name] = newP2Elo;

    // Track session wins for the Local Leaderboard
    if (!playerSessionWins[p1Name]) playerSessionWins[p1Name] = 0;
    if (!playerSessionWins[p2Name]) playerSessionWins[p2Name] = 0;

    if (winnerName === p1Name) {
        playerSessionWins[p1Name]++;
    } else if (winnerName === p2Name) {
        playerSessionWins[p2Name]++;
    }

    // Record the match in the global analytics engine
    await _supabase.rpc('record_quick_match_v1', {
        p1_id: p1Data ? p1Data.id : null,
        p2_id: p2Data ? p2Data.id : null,
        p1_new_elo: newP1Elo,
        p2_new_elo: newP2Elo,
        p1_won: winnerName === p1Name,
        match_data: {
            player1: p1Name,
            player2: p2Name,
            winner: winnerName,
            player1_score: p1Score,
            player2_score: p2Score,
            tournament_name: 'Subsoccer Go Arcade',
            is_verified_table: true, // Arcade sessions are official Subsoccer tables
            game_id: window.tableId || null,
            elo_capped: false
        }
    });

    // The RPC will update the player elos automatically if p1_id/p2_id are provided
    // Fallback if the RPC fails: we could manually update, but RPC handles it safely.
}

async function fetchGlobalRanking() {
    const { data, error } = await _supabase.from('players')
        .select('username, elo')
        .order('elo', { ascending: false })
        .limit(10);

    if (data && !error) {
        data.forEach(p => {
            if (!playerRatings[p.username]) {
                playerRatings[p.username] = p.elo;
            }
        });
        renderEloBoard();
    }
}

function renderEloBoard() {
    const sorted = Object.keys(playerSessionWins).map(k => ({ name: k, wins: playerSessionWins[k] })).sort((a, b) => b.wins - a.wins);
    const list = document.getElementById('history-elo');
    if (!list) return;

    if (sorted.length === 0) {
        list.innerHTML = `<div class="text-gray-500 text-center py-4">NO MATCHES PLAYED YET</div>`;
        return;
    }

    list.innerHTML = sorted.slice(0, 10).map((p, index) => `
        <div class="flex justify-between py-4 border-b border-gray-800 items-center">
            <span class="text-gray-500 w-12 text-2xl font-sans font-bold">#${index + 1}</span>
            <span class="flex-1 text-white font-bold font-sans tracking-wide text-3xl text-shadow-sm uppercase">${p.name}</span>
            <span class="font-black text-gray-400 text-xl font-sans tracking-wider mr-4">WINS</span>
            <span class="font-black text-[#FFD700] text-5xl font-sans text-shadow-md tracking-wider">${p.wins}</span>
        </div>
    `).join('');
}

function switchLayer(targetId) {
    Object.values(L).forEach(el => el.style.display = 'none');
    const target = L[targetId];
    if (target) {
        if (targetId !== 'intro') {
            const vid = document.getElementById('intro-video');
            if (vid) vid.pause();
        }

        // RPi Performance: pause/resume background video based on layer visibility
        const bgVideo = document.querySelector('body > video');
        if (bgVideo) {
            if (targetId === 'lobby') {
                bgVideo.play().catch(() => {});
            } else {
                bgVideo.pause();
            }
        }

        // Pause Trophy.mp4 videos when not on victory/elo layers
        document.querySelectorAll('#layer-victory video, #layer-elo video').forEach(v => {
            if (targetId === 'victory' || targetId === 'elo') {
                v.play().catch(() => {});
            } else {
                v.pause();
            }
        });

        target.style.display = targetId === 'game' ? 'flex' : 'flex';
        if (targetId === 'game') target.style.flexDirection = 'row';
        else target.style.flexDirection = 'column';
    }
}

// --- IOT ---
let shellyIP = localStorage.getItem('shelly_ip') || null;
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('shelly')) {
    shellyIP = urlParams.get('shelly');
    localStorage.setItem('shelly_ip', shellyIP);
}

function triggerShelly(turnOn) {
    if (window.tableConfig?.basicMode) return; // Completely disabled in Basic Mode

    const iotDot = document.getElementById('iot-dot');
    const iotText = document.getElementById('iot-text');

    if (turnOn) {
        iotDot.className = "w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]";
        iotText.className = "text-green-500 font-sans text-sm";
        iotText.innerText = "POWER SYNCED (ON)";
    } else {
        iotDot.className = "w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_red]";
        iotText.className = "text-red-500 font-sans text-sm";
        iotText.innerText = "OFF LINE";
    }

    if (shellyIP) {
        fetch(`http://${shellyIP}/relay/0?turn=${turnOn ? 'on' : 'off'}`, { mode: 'no-cors' }).catch(() => { });
        fetch(`http://${shellyIP}/rpc/Switch.Set?id=0&on=${turnOn ? 'true' : 'false'}`, { mode: 'no-cors' }).catch(() => { });
    }
}

// --- TIMER ---
function updateTimerUI() {
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;
    
    if (window.tableConfig?.basicMode) {
        timerEl.innerText = "FIRST TO 3 WINS";
        timerEl.style.color = "white"; 
        timerEl.style.fontSize = "1.5vw";
        timerEl.style.letterSpacing = "4px";
        timerEl.style.whiteSpace = "nowrap";
        return;
    }

    timerEl.style.fontSize = ""; // Reset
    timerEl.style.letterSpacing = ""; // Reset
    const s = remainingSeconds.toString();
    timerEl.innerText = s;
    if (remainingSeconds <= 10) timerEl.style.color = "red";
    else timerEl.style.color = "white";
}

function setTimer(seconds) {
    clearInterval(timerInterval);
    
    if (window.tableConfig?.basicMode) {
        isTimerTicking = false;
        updateTimerUI();
        return; // Basic mode has no countdown!
    }

    isTimerTicking = true;
    remainingSeconds = seconds;
    updateTimerUI();

    timerInterval = setInterval(() => {
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            isTimerTicking = false;
            return;
        }
        remainingSeconds--;
        updateTimerUI();
    }, 1000);
}

function resetSystem() {
    clearAllTvTimeouts();
    clearInterval(timerInterval);
    isTimerTicking = false;
    document.getElementById('timer').innerText = "00:00";
    document.getElementById('timer').style.color = "white";
    
    // Restore tiebreak font sizes if they were altered
    document.getElementById('game-p1-score').style.fontSize = "";
    document.getElementById('game-p2-score').style.fontSize = "";
    
    switchLayer('lobby');
    triggerShelly(false);

    document.querySelectorAll('.v-anim').forEach(el => {
        el.style.opacity = "";
        el.style.transform = "";
        if (el.getAnimations) {
            el.getAnimations().forEach(anim => anim.cancel());
        }
    });
    
    if (reconContainer) reconContainer.style.display = 'none';
}

// --- GLOBAL INACTIVITY TIMEOUT ---
let inactivityTimer = null;
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minuuttia

function resetInactivityTimeout() {
    clearTimeout(inactivityTimer);
    
    // Only engage inactivity timer if we are NOT in the attract mode lobby
    if (document.getElementById('layer-lobby').style.display === 'none') {
        inactivityTimer = setTimeout(() => {
            console.log("[TV] Inactivity timeout reached! Resetting system to prevent stuck UI.");
            resetSystem();
        }, INACTIVITY_LIMIT_MS);
    }
}

// --- BOOTSTRAP ---
window.tableConfig = JSON.parse(localStorage.getItem('subsoccer_table_config')) || {};
applyTvFreePlayLogic();

// Inactivity Listeners to prevent ghosting
window.addEventListener('arcade_activity', resetInactivityTimeout);
window.addEventListener('pointerdown', resetInactivityTimeout);
window.addEventListener('keydown', resetInactivityTimeout);

fetchGlobalRanking();
updateTimerUI();

// Determine QR target: if TV runs locally (Raspberry Pi), point QR to the public Netlify URL
// so phones can always reach the remote controller over the internet.
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname) || /^192\.168\./.test(window.location.hostname) || /^10\./.test(window.location.hostname);
const qrBaseUrl = isLocalHost 
    ? 'https://subsoccer-sandbox.netlify.app' 
    : `${window.location.protocol}//${window.location.host}`;
const remoteAppUrl = `${qrBaseUrl}/lounge-remote.html?v=19`;
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&color=ffffff&bgcolor=000000&margin=10&data=${encodeURIComponent(remoteAppUrl)}`;
const reconnectQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=ffffff&bgcolor=000000&margin=8&data=${encodeURIComponent(remoteAppUrl + '&reconnect=true')}`;

document.getElementById('dynamic-qr').src = qrUrl;
document.getElementById('reconnect-qr').src = reconnectQrUrl;
const introVid = document.getElementById('intro-video');

function updateVideoOrientation() {
    if (!introVid) return;
    const isTall = window.innerHeight > window.innerWidth;
    const targetSrc = isTall ? 'lounge_intro_tall.mp4' : 'lounge_intro.mp4';
    // Only update and load if the source actually changed
    if (!introVid.getAttribute('src') || !introVid.getAttribute('src').endsWith(targetSrc)) {
        introVid.src = targetSrc;
        introVid.load();
    }
}

window.addEventListener('resize', updateVideoOrientation);
updateVideoOrientation();

if (introVid) {
    introVid.addEventListener('ended', () => {
        // After intro, default to tournament bracket view if we have data
        if (window.tvEngine && window.tvEngine.rounds.length > 0) {
            switchLayer('tournament');
        } else {
            switchLayer('sessionLobby');
        }
    });
}

// --- WEBSOCKET ENGINE ---
arcadeSocket.connect();

arcadeSocket.on('start_1v1', (payload) => {
    clearAllTvTimeouts();
    lastP1 = payload.p1 || 'PLAYER 1';
    lastP2 = payload.p2 || 'PLAYER 2';
    document.getElementById('game-p1-name').innerText = lastP1;
    document.getElementById('game-p2-name').innerText = lastP2;
    document.getElementById('game-p1-score').innerText = '0';
    document.getElementById('game-p2-score').innerText = '0';
    
    // Reset font sizes in case tiebreak shrunk them in a previous match
    document.getElementById('game-p1-score').style.fontSize = "";
    document.getElementById('game-p2-score').style.fontSize = "";

    switchLayer('game');
    triggerShelly(true);
});

arcadeSocket.on('timer_start', (payload) => {
    setTimer(payload.duration || remainingSeconds);
});

arcadeSocket.on('update_table_config', (payload) => {
    remainingSeconds = payload.matchTime || 90;
    
    // Save to window variable to use globally in tv-logic
    window.tableConfig = { ...window.tableConfig, ...payload };
    
    // Persist the synced config locally so TV survives a page reload without losing settings!
    localStorage.setItem('subsoccer_table_config', JSON.stringify(window.tableConfig));
    
    applyTvFreePlayLogic();

    // Update display if we are not currently ticking
    if (!isTimerTicking) {
        updateTimerUI();
    }
});

function applyTvFreePlayLogic() {
    const config = window.tableConfig || {};
    const priceEl = document.getElementById('tv-price-tag');
    const paymentMethodsEl = document.getElementById('tv-payment-methods');
    
    if (priceEl && paymentMethodsEl) {
        if (config.freePlay) {
            priceEl.innerText = "FREE TO PLAY";
            paymentMethodsEl.style.display = "none";
        } else {
            const base = (config.basePrice ?? 2.00).toFixed(2);
            priceEl.innerText = `GAMES FROM ${base} €`;
            paymentMethodsEl.style.display = "flex";
        }
    }
}

arcadeSocket.on('request_table_config', () => {
    // A remote control just connected and needs our latest settings (e.g. Free Play mode)!
    arcadeSocket.send('update_table_config', window.tableConfig);
});

arcadeSocket.on('trigger_preparation_mode', () => {
    const isGameActive = L.game.style.display !== 'none';
    console.log("[TV] Received trigger_preparation_mode! isGameActive:", isGameActive, "isTimerTicking:", isTimerTicking);
    // A remote control just accepted the instructions and is setting up the match!
    // We transition the TV from the idle video lobby to the "Get Ready" screen.
    // If a match is already ongoing or complete, we ignore this.
    if (!isGameActive && !isTimerTicking) {
        console.log("[TV] Executing layer transition to sessionLobby...");
        switchLayer('sessionLobby');
        
        // Auto-revert back to lobby if they never complete the setup (e.g. they abandoned their phone)
        setTimeout(() => {
            if (L.sessionLobby.style.display !== 'none') {
                console.log("[TV] Preparation mode timed out, reverting to lobby.");
                switchLayer('lobby');
            }
        }, 120000); // 2 minutes timeout
    } else {
        console.log("[TV] Ignored preparation mode because match is in progress or complete!");
    }
});

arcadeSocket.on('trigger_tiebreaker', (payload) => {
    // VISUAL LOTTERY EFFECT ON TV
    document.getElementById('timer').innerText = "TIEBREAK";
    document.getElementById('timer').style.color = "var(--subsoccer-gold)";

    const p1ScoreEl = document.getElementById('game-p1-score');
    const p2ScoreEl = document.getElementById('game-p2-score');

    // Scale font size down temporarily to prevent 3-letter words from overlapping in narrow portrait displays
    p1ScoreEl.style.fontSize = "min(20vh, 18vw)";
    p2ScoreEl.style.fontSize = "min(20vh, 18vw)";

    // Animate the scores glitching!
    let flips = 0;
    const tiebreakInterval = setInterval(() => {
        flips++;
        p1ScoreEl.innerText = flips % 2 === 0 ? "WIN" : "???";
        p2ScoreEl.innerText = flips % 2 !== 0 ? "WIN" : "???";
        if (navigator.vibrate) navigator.vibrate(20);
        if (flips > 30) clearInterval(tiebreakInterval);
    }, 100);
});

arcadeSocket.on('payment_success', (payload) => {
    console.log("PAYMENT DETECTED! Awakening The Forge mechanics...");

    switchLayer('intro');
    const vid = document.getElementById('intro-video');
    if (vid) {
        vid.currentTime = 0;
        vid.play().catch(e => console.log("Video autoplay blocked:", e));
    }

    try {
        playCachedAudio(cachedVictoryTheme);
    } catch (e) { }
});

arcadeSocket.on('roster_update', (payload) => {
    const players = payload.players || [];
    const grid = document.getElementById('session-players-grid');
    const count = document.getElementById('registered-count');
    if (!grid || !count) return;

    count.innerText = `${players.length} / 16`;
    grid.innerHTML = '';

    players.forEach((pName, i) => {
        grid.innerHTML += `
            <div class="bg-[#111] border border-[#D4AF37] p-3 rounded-xl flex items-center gap-3">
                <span class="text-[#D4AF37] font-bold">#${i + 1}</span>
                <span class="text-white font-bold font-sans tracking-widest uppercase">${pName}</span>
            </div>
        `;
    });
});

arcadeSocket.on('lobby_opened', () => {
    // Sync remote device with the TV's state as the source of truth for the demo
    arcadeSocket.send('update_table_config', { matchTime: remainingSeconds });
    document.getElementById('dynamic-qr').classList.add('scale-[0.8]', 'opacity-20');
    
    // Show reconnect QR when lobby connects
    const reconContainer = document.getElementById('reconnect-qr-container');
    if (reconContainer) reconContainer.style.display = 'flex';
    
    // Only switch to sessionLobby if we are still on the main QR screen. 
    // If the intro video is already playing (post-payment), do not interrupt it!
    if (document.getElementById('layer-lobby').style.display !== 'none') {
        setTimeout(() => { switchLayer('sessionLobby'); }, 300);
    }
});

arcadeSocket.on('state_update', (payload) => {
    const oldP1 = parseInt(document.getElementById('game-p1-score').innerText) || 0;
    const oldP2 = parseInt(document.getElementById('game-p2-score').innerText) || 0;

    document.getElementById('game-p1-score').innerText = payload.p1Score || 0;
    document.getElementById('game-p2-score').innerText = payload.p2Score || 0;

    const newP1 = parseInt(payload.p1Score) || 0;
    const newP2 = parseInt(payload.p2Score) || 0;

    let scorer = payload.lastScorer || 0;
    if (!scorer) {
        if (newP1 > oldP1) scorer = 1;
        if (newP2 > oldP2) scorer = 2;
    }

    if (scorer === 1 || scorer === 2) {
        const sideEl = document.querySelector(scorer === 1 ? '.player-left' : '.player-right');
        if (sideEl) {
            sideEl.classList.remove('goal-flash');
            void sideEl.offsetWidth; // trigger reflow
            sideEl.classList.add('goal-flash');
        }

        const textEl = document.getElementById(scorer === 1 ? 'game-p1-score' : 'game-p2-score');
        if (textEl) {
            textEl.animate([
                { transform: 'scale(1) translateY(0)', color: 'white', textShadow: '0 0 40px rgba(255, 255, 255, 0.2)' },
                { transform: 'scale(1.5) translateY(-20px)', color: '#FFD700', textShadow: '0 0 60px rgba(255,215,0,0.8)' },
                { transform: 'scale(1) translateY(0)', color: 'white', textShadow: '0 0 40px rgba(255, 255, 255, 0.2)' }
            ], { duration: 1500, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });
        }
        
        try {
            playCachedAudio(cachedGoalHorn);
            setTimeout(() => { playCachedAudio(cachedSwoosh); }, 1000);
        } catch (e) {}
    }
});

arcadeSocket.on('end_game', (payload) => {
    const winner = payload.winnerName || payload.winner;

    triggerShelly(false);

    document.querySelectorAll('.v-anim').forEach(el => {
        if (el.getAnimations) {
            el.getAnimations().forEach(anim => anim.cancel());
        }
        el.style.opacity = '0';
    });

    const winnerFinal = winner === "DRAW" ? "DRAW" : (payload.winnerName || payload.winner);
    calculateElo(lastP1, lastP2, winnerFinal, payload.p1Score || 0, payload.p2Score || 0).then(() => {
        renderEloBoard();
    });
    document.getElementById('v-winner').innerText = winnerFinal === "DRAW" ? "DRAW" : winnerFinal;
    const cardName = document.getElementById('v-card-name');
    if (cardName) cardName.innerText = winnerFinal === "DRAW" ? "-" : winnerFinal;

    // Set dynamic photo based on who won
    const cardPhoto = document.getElementById('v-card-photo');
    const cardIcon = document.getElementById('v-card-icon');
    if (cardPhoto && cardIcon) {
        if (winnerFinal === "DRAW" || !payload.winnerIndex) {
            cardPhoto.style.background = "#1a1a1a";
            cardIcon.style.display = 'block';
        } else {
            const imgTarget = payload.winnerIndex === 1 ? 'player_blue.png' : 'player_red.png';
            cardPhoto.style.background = `url('${imgTarget}') center/cover no-repeat`;
            cardIcon.style.display = 'none';
        }
    }

    document.getElementById('v-score').innerText = `${payload.p1Score || 0} - ${payload.p2Score || 0}`;

    const vHeader = document.getElementById('v-header');
    const vWinner = document.getElementById('v-winner');
    const vChampBg = document.getElementById('v-champion-bg');
    const vChampOverlay = document.getElementById('v-champion-overlay');

    // Dynamic Hype for the Tournament Final!
    if (payload.isBracketComplete && winnerFinal !== "DRAW") {
        vHeader.innerText = "🏆 TOURNAMENT CHAMPION 🏆";
        vHeader.classList.remove('text-[#E30613]');
        vHeader.classList.add('text-[#FFD700]');
        vHeader.style.textShadow = "0 0 30px rgba(255,215,0,0.4)";
        vWinner.style.color = "#FFD700";
        vWinner.style.textShadow = "0 0 40px rgba(255,215,0,0.6)";
        vWinner.style.transform = "scale(1.1)";
        if (vChampBg) vChampBg.style.opacity = "0.7";
        if (vChampOverlay) vChampOverlay.style.opacity = "1";
    } else {
        vHeader.innerText = "MATCH CONCLUDED";
        vHeader.classList.remove('text-[#FFD700]');
        vHeader.classList.add('text-[#E30613]');
        vHeader.style.textShadow = "none";
        vWinner.style.color = "white";
        vWinner.style.textShadow = "0 0 15px rgba(255,255,255,0.1)";
        vWinner.style.transform = "scale(1)";
        if (vChampBg) vChampBg.style.opacity = "0";
        if (vChampOverlay) vChampOverlay.style.opacity = "0";
    }

    const triggerVictoryAnimations = () => {
        const els = {
            h: document.getElementById('v-header'),
            t: document.getElementById('v-winner'),
            s: document.getElementById('v-score-box'),
            c: document.getElementById('v-card'),
            cta: document.getElementById('v-cta')
        };
        const springFast = 'cubic-bezier(0.2, 0.9, 0.3, 1.2)';
        if (els.c) els.c.animate([{ transform: 'translateY(50px) scale(0.9) rotateX(10deg)', opacity: 0 }, { transform: 'translateY(0) scale(1) rotateX(0deg)', opacity: 1 }], { duration: 800, easing: springFast, fill: 'forwards' });
        if (els.h) els.h.animate([{ transform: 'translateX(-30px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 600, delay: 100, easing: 'ease-out', fill: 'forwards' });
        if (els.t) els.t.animate([{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 500, delay: 250, easing: 'ease-out', fill: 'forwards' });
        if (els.s) els.s.animate([{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 400, delay: 400, easing: springFast, fill: 'forwards' });
        if (els.cta) els.cta.animate([{ transform: 'translateY(30px) translateX(-50%)', opacity: 0 }, { transform: 'translateY(0) translateX(-50%)', opacity: 1 }], { duration: 800, delay: 1500, easing: springFast, fill: 'forwards' });
    };

    if (payload.mode === 'tournament') {
        if (payload.isBracketComplete) {
            // 1. Show Tournament Champion card in all its glory (8s)
            switchLayer('victory');
            addTvTimeout(triggerVictoryAnimations, 50);

            // 2. Show event leaderboard / points (12s) -> Then Reload
            addTvTimeout(() => {
                renderEloBoard();
                switchLayer('elo');

                // 3. Return to Start Screen
                addTvTimeout(() => {
                    window.location.reload(true);
                }, 12000);
            }, 8000);
        } else {
            // Mid-tournament match: Victory card briefly, then back to Bracket tree
            switchLayer('victory');
            addTvTimeout(triggerVictoryAnimations, 50);

            addTvTimeout(() => {
                switchLayer('tournament');
            }, 8000);
        }
    } else {
        // Single Match: Show Victory card with CTA
        switchLayer('victory');
        addTvTimeout(triggerVictoryAnimations, 50);

        // Return to Start Screen after 15 seconds
        addTvTimeout(() => {
            window.location.reload(true);
        }, 15000);
    }
});

arcadeSocket.on('trigger_onboarding_flash', () => {
    // Vilkuta vain laitteen oikeita valoja (tai älylasia) - ei kosketa TV-ruudun käyttöliittymän opacityyn lainkaan!
    let flashes = 0;
    
    // Switch on Shelly initially
    triggerShelly(true);
    
    const interval = setInterval(() => {
        flashes++;
        const turnOn = flashes % 2 === 1 ? false : true;
        triggerShelly(turnOn);
        
        if (flashes >= 6) {
            clearInterval(interval);
            triggerShelly(false); // Palautetaan PIMEÄKSI setup-näyttöä varten
        }
    }, 700);
});

arcadeSocket.on('tourny_state', (payload) => {
    // If the tournament is complete (final match just ended), we ONLY quietly sync the bracket data
    // so we do NOT clear the victory animations or switch layers!
    if (!payload.isComplete) {
        clearAllTvTimeouts();
    }
    const tourny = payload;

    // Only switch layer if Intro is NOT actively playing and it's not the final match
    if (L.intro.style.display !== 'flex' && !payload.isComplete) {
        switchLayer('tournament');
    }
    
    triggerShelly(false);

    const tvLayer = document.getElementById('layer-tournament');
    tvLayer.classList.remove('large-bracket', 'xl-bracket');
    if (tourny.players && tourny.players.length > 8) {
        tvLayer.classList.add('xl-bracket');
    } else if (tourny.players && tourny.players.length > 4) {
        tvLayer.classList.add('large-bracket');
    }

    if (!window.tvEngine) {
        document.getElementById('bracket-tree').innerHTML = '<div id="tv-bracket-area" style="padding-top: 40px; padding-bottom: 40px; transform-origin: center center; transition: transform 0.3s ease;"></div>';
        window.tvEngine = new BracketEngine({ containerId: 'tv-bracket-area', enableSaveButton: false });
    }

    window.tvEngine.generateBracket(tourny.players, false);
    window.tvEngine.restoreState(tourny.matches);
    
    // Track participants specifically so TV can act as master on reconnect
    window.tvEngine.participants = tourny.players;
});

arcadeSocket.on('ping_reconnect', () => {
    // If we are currently IN THE MIDDLE of a match, recover the controller!
    if (L.game.style.display !== 'none' || L.victory.style.display !== 'none') {
        const p1Score = parseInt(document.getElementById('game-p1-score').innerText) || 0;
        const p2Score = parseInt(document.getElementById('game-p2-score').innerText) || 0;
        const p1Name = document.getElementById('game-p1-name').innerText || "PLAYER 1";
        const p2Name = document.getElementById('game-p2-name').innerText || "PLAYER 2";

        arcadeSocket.send('active_match_recovery', {
            p1Score, p2Score, p1Name, p2Name,
            isTournament: !!window.tvEngine
        });
    } else if (window.tvEngine && window.tvEngine.isActive) {
        // If we are just viewing the tournament bracket, recover the bracket!
        arcadeSocket.send('tourny_state_recovery', {
            players: window.tvEngine.participants,
            matches: window.tvEngine.rounds.flat()
        });
    } else if (L.sessionLobby.style.display !== 'none') {
        // If we are scanning for players... tell the remote to just reload?
        // It's technically covered by ?mode=tournament
    }
});

arcadeSocket.on('force_reload', () => window.location.reload(true));
arcadeSocket.on('reset_system', resetSystem);

// --- HARDWARE SENSOR INTEGRATION (Keyboard hooks) ---
window.addEventListener('keydown', (e) => {
    const isMatchActive = document.getElementById('layer-game').classList.contains('active'); // wait, the layer-game is visible directly via flex
    // Let's use computed style instead of active class for robustness in JS module
    if (L.game.style.display === 'none') return;

    let targetPlayer = null;
    if (e.key === '1') targetPlayer = 1;
    if (e.key === '2') targetPlayer = 2;

    if (targetPlayer) {
        let newP1Score = parseInt(document.getElementById('p1-score-layer2').innerText) || 0;
        let newP2Score = parseInt(document.getElementById('p2-score-layer2').innerText) || 0;
        const p1Name = document.getElementById('p1-name-layer2').innerText;
        const p2Name = document.getElementById('p2-name-layer2').innerText;

        if (targetPlayer === 1) newP1Score++;
        if (targetPlayer === 2) newP2Score++;

        const newP1ScoreEl = document.getElementById('game-p1-score');
        const newP2ScoreEl = document.getElementById('game-p2-score');

        if (targetPlayer === 1 && newP1ScoreEl) {
            newP1ScoreEl.innerText = newP1Score;
        }
        if (targetPlayer === 2 && newP2ScoreEl) {
            newP2ScoreEl.innerText = newP2Score;
        }

        // Fire Goal events here via Broadcast or trigger locally if you have global playGoalHorn
        // Note: We need a slight refactoring if playGoalHorn is heavily coupled, but it looks missing from this new JS context
        // Actually, playGoalHorn was not moved. Let's add it.
        try {
            playCachedAudio(cachedGoalHorn);
            setTimeout(() => { playCachedAudio(cachedSwoosh); }, 1000);
        } catch (e) { }

        // Trigger goal CSS
        const el = document.getElementById(targetPlayer === 1 ? 'game-p1-score' : 'game-p2-score');
        el.animate([
            { transform: 'scale(1) translateY(0)', color: 'white', textShadow: 'none' },
            { transform: 'scale(2.5) translateY(-20px)', color: '#FFD700', textShadow: '0 0 20px rgba(255,215,0,0.8)' },
            { transform: 'scale(1) translateY(0)', color: 'white', textShadow: 'none' }
        ], { duration: 1500, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });


        const updatedState = {
            view: newP1Score >= 3 || newP2Score >= 3 ? 'winner' : 'game',
            p1Score: newP1Score,
            p2Score: newP2Score,
            p1Name: p1Name,
            p2Name: p2Name,
            lastScorer: targetPlayer,
            matchStarted: Date.now()
        };

        arcadeSocket.send('state_update', updatedState);
    }
});
