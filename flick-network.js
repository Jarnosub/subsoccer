// flick-network.js
const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

let supabaseClient;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let flickChannel = null;
let myNetworkId = Math.random().toString(36).substring(7);
window.myNetworkScore = 0;

let myName = "PLAYER";
try {
    const lsData = localStorage.getItem('subsoccer-user');
    if (lsData) {
        const user = JSON.parse(lsData);
        if (user.username) myName = user.username.toUpperCase();
    }
} catch(e) {}

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

    const btnAccept = document.getElementById('btn-accept-challenge');
    if (btnAccept) {
        btnAccept.addEventListener('click', () => {
            document.getElementById('challenge-popup').style.display = 'none';
            if (window.startGame) window.startGame(false);
        });
    }

    const btnDecline = document.getElementById('btn-decline-challenge');
    if (btnDecline) {
        btnDecline.addEventListener('click', () => {
            document.getElementById('challenge-popup').style.display = 'none';
        });
    }

    flickChannel.on('broadcast', { event: 'score_update' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
            updateOpponentName(payload.payload.username);
            const oppDisplay = document.getElementById('opp-score-value');
            if (oppDisplay) {
                oppDisplay.textContent = payload.payload.score;
            }
            // Flash effect for opponent score box
            const oppBox = document.getElementById('opp-score-box');
            if(oppBox) {
                oppBox.style.backgroundColor = 'rgba(227, 6, 19, 0.4)';
                setTimeout(() => {
                    oppBox.style.backgroundColor = 'transparent';
                }, 300);
            }
        }
    });

    flickChannel.on('broadcast', { event: 'game_start' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
            updateOpponentName(payload.payload.username);
            // Opponent started the game! Show popup instead of forcing auto-start
            if (window.startGame && !window.isPlaying) {
                const popup = document.getElementById('challenge-popup');
                if (popup) {
                    popup.style.display = 'flex';
                } else {
                    console.log("Opponent started the game! Starting automatically...");
                    window.startGame(false);
                }
            } else if (!window.startGame) {
                console.error("Opponent started but window.startGame is not attached!");
            }
        }
    });
    
    flickChannel.on('broadcast', { event: 'hello' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
             console.log("A new player joined the battle!");
             updateOpponentName(payload.payload.username);
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

    flickChannel.subscribe((status) => {
        console.log("Supabase Network Status:", status);
        if (status === 'SUBSCRIBED') {
            // Let others know we are here
            flickChannel.send({
                type: 'broadcast',
                event: 'hello',
                payload: { id: myNetworkId, username: myName }
            });
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

document.addEventListener('DOMContentLoaded', initNetwork);

window.flickNetwork = {
    broadcastScore,
    broadcastGameStart
};
