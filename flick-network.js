// flick-network.js
const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

let supabaseClient;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = supabaseClient;
}

let flickChannel = null;
let myNetworkId = Math.random().toString(36).substring(7);
window.myNetworkScore = 0;

let myName = "PLAYER";
window.myName = myName;
try {
    const lsData = localStorage.getItem('subsoccer-user');
    if (lsData) {
        const user = JSON.parse(lsData);
        if (user.username) {
            myName = user.username.toUpperCase();
            window.myName = myName;
        }
    }
} catch(e) {}

window.onlinePlayers = {};

function trackPlayer(id, name) {
    if (!name || id === myNetworkId) return;
    window.onlinePlayers[id] = { name: name, lastSeen: Date.now() };
    renderOnlinePlayers();
}

function renderOnlinePlayers() {
    const list = document.getElementById('online-players-list');
    if (!list) return;
    
    // Clean up older than 15s
    const now = Date.now();
    for (const id in window.onlinePlayers) {
        if (now - window.onlinePlayers[id].lastSeen > 15000) {
            delete window.onlinePlayers[id];
        }
    }
    
    // Render list
    list.innerHTML = '';
    const players = Object.values(window.onlinePlayers);
    players.forEach(p => {
        const badge = document.createElement('div');
        badge.className = 'online-player-badge';
        badge.innerHTML = `<i class="fa-solid fa-wifi" style="margin-right: 4px;"></i> ${p.name}`;
        list.appendChild(badge);
    });
}

// Clean up loop for visual display
setInterval(renderOnlinePlayers, 5000);

function updateOpponentName(name) {
    if (!name) return;
    const oppLabel = document.querySelector('#opp-score-box .stat-label');
    if(oppLabel) oppLabel.textContent = name;
}

function initNetwork() {
    if (!supabaseClient) return;

    // Use a specific topic for the flick games. 
    // This allows connecting multiple flick-games or arcade setups together!
    flickChannel = supabaseClient.channel('arcade_global_battle', {
        config: { broadcast: { self: false } }
    });

    window._pendingUseCamera = false;
    window.isPracticeMode = false;

    const btnAccept = document.getElementById('btn-accept-challenge');
    if (btnAccept) {
        btnAccept.addEventListener('click', () => {
            document.getElementById('challenge-popup').style.display = 'none';
            if (flickChannel && flickChannel.state === 'joined') {
                flickChannel.send({
                    type: 'broadcast',
                    event: 'accept_challenge',
                    payload: { id: myNetworkId, username: myName }
                });
            }
            if (window.startCountdownAndGame) window.startCountdownAndGame(window._pendingUseCamera);
        });
    }

    const btnDecline = document.getElementById('btn-decline-challenge');
    if (btnDecline) {
        btnDecline.addEventListener('click', () => {
            document.getElementById('challenge-popup').style.display = 'none';
            const startMenu = document.getElementById('start-menu');
            if (startMenu) startMenu.style.display = 'flex';
        });
    }

    const btnCancelWaiting = document.getElementById('btn-cancel-waiting');
    if (btnCancelWaiting) {
        btnCancelWaiting.addEventListener('click', () => {
            document.getElementById('waiting-popup').style.display = 'none';
            const startMenu = document.getElementById('start-menu');
            if (startMenu) startMenu.style.display = 'flex';
        });
    }

    const btnPracticeMode = document.getElementById('btn-practice-mode');
    if (btnPracticeMode) {
        btnPracticeMode.addEventListener('click', () => {
            document.getElementById('waiting-popup').style.display = 'none';
            window.isPracticeMode = true;
            if (window.startCountdownAndGame) window.startCountdownAndGame(window._pendingUseCamera);
        });
    }

    flickChannel.on('broadcast', { event: 'challenge' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
            updateOpponentName(payload.payload.username);
            trackPlayer(payload.payload.id, payload.payload.username);
            const popup = document.getElementById('challenge-popup');
            if (popup && !window.isPlaying && !window.isPracticeMode && !window.isCountingDown) {
                const startMenu = document.getElementById('start-menu');
                if (startMenu) startMenu.style.display = 'none';
                popup.style.display = 'flex';
            }
        }
    });

    flickChannel.on('broadcast', { event: 'accept_challenge' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
            updateOpponentName(payload.payload.username);
            trackPlayer(payload.payload.id, payload.payload.username);
            const waitingPopup = document.getElementById('waiting-popup');
            if (waitingPopup) waitingPopup.style.display = 'none';
            
            // They accepted! Start the game countdown.
            if (window.startCountdownAndGame && !window.isPlaying && !window.isPracticeMode) {
                window.startCountdownAndGame(window._pendingUseCamera);
            }
        }
    });

    flickChannel.on('broadcast', { event: 'score_update' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
            updateOpponentName(payload.payload.username);
            trackPlayer(payload.payload.id, payload.payload.username);
            const oppDisplay = document.getElementById('opp-score-value');
            if (oppDisplay) {
                oppDisplay.textContent = payload.payload.score;
            }
            // Flash effect for opponent score box
            if (!window.isPracticeMode) {
                const oppBox = document.getElementById('opp-score-box');
                if(oppBox) {
                    oppBox.style.backgroundColor = 'rgba(227, 6, 19, 0.4)';
                    setTimeout(() => {
                        oppBox.style.backgroundColor = 'transparent';
                    }, 300);
                }
            }
        }
    });

    flickChannel.on('broadcast', { event: 'game_start' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
            updateOpponentName(payload.payload.username);
            // Fallback for older clients that don't do challenge handshake
            if (window.startCountdownAndGame && !window.isPlaying && !window.isPracticeMode && !window.isCountingDown) {
                const popup = document.getElementById('challenge-popup');
                if (popup) {
                    popup.style.display = 'flex';
                } else {
                    window.startCountdownAndGame(false);
                }
            }
        }
    });
    
    flickChannel.on('broadcast', { event: 'hello' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
             console.log("A new player joined the battle!");
             updateOpponentName(payload.payload.username);
             trackPlayer(payload.payload.id, payload.payload.username);
             const oppBox = document.getElementById('opp-score-box');
             if(oppBox) {
                 oppBox.style.backgroundColor = 'rgba(0, 255, 204, 0.4)'; // Flash green for connected
                 setTimeout(() => { oppBox.style.backgroundColor = 'transparent'; }, 800);
             }
             // Send our info back so they know who we are
             if (flickChannel && window.isPlaying) {
                 broadcastScore(window.myNetworkScore);
             }
        }
    });

    flickChannel.on('broadcast', { event: 'ping' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
             trackPlayer(payload.payload.id, payload.payload.username);
        }
    });

    flickChannel.subscribe((status) => {
        console.log("Supabase Network Status:", status);
        if (status === 'SUBSCRIBED') {
            // Let others know we are here
            flickChannel.send({
                type: 'broadcast',
                event: 'hello',
                payload: { id: myNetworkId, username: myName }
            });
            
            // Heartbeat
            setInterval(() => {
                if (flickChannel && flickChannel.state === 'joined') {
                    flickChannel.send({
                        type: 'broadcast',
                        event: 'ping',
                        payload: { id: myNetworkId, username: myName }
                    });
                }
            }, 5000);
        }
    });
}

function broadcastScore(newScore) {
    if (flickChannel) {
        window.myNetworkScore = newScore;
        flickChannel.send({
            type: 'broadcast',
            event: 'score_update',
            payload: { id: myNetworkId, score: newScore, username: myName }
        });
    }
}

function broadcastGameStart() {
    if (flickChannel) {
        flickChannel.send({
            type: 'broadcast',
            event: 'game_start',
            payload: { id: myNetworkId, username: myName }
        });
    }
}

function requestGame(useCamera) {
    window._pendingUseCamera = useCamera;
    window.isPracticeMode = false;
    
    // Auto-connect single player if no network
    if (!supabaseClient || !flickChannel || flickChannel.state !== 'joined') {
        window.isPracticeMode = true;
        if (window.startCountdownAndGame) window.startCountdownAndGame(useCamera);
        return;
    }

    flickChannel.send({
        type: 'broadcast',
        event: 'challenge',
        payload: { id: myNetworkId, username: myName }
    });

    const waitingPopup = document.getElementById('waiting-popup');
    if (waitingPopup) {
        const startMenu = document.getElementById('start-menu');
        if (startMenu) startMenu.style.display = 'none';
        waitingPopup.style.display = 'flex';
    } else {
        if (window.startCountdownAndGame) window.startCountdownAndGame(useCamera);
    }
}

document.addEventListener('DOMContentLoaded', initNetwork);

window.flickNetwork = {
    broadcastScore,
    broadcastGameStart,
    requestGame
};
