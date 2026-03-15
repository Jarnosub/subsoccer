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

function initNetwork() {
    if (!supabaseClient) return;

    // Use a specific topic for the flick games. 
    // This allows connecting multiple flick-games or arcade setups together!
    flickChannel = supabaseClient.channel('arcade_global_battle', {
        config: { broadcast: { self: false } }
    });

    flickChannel.on('broadcast', { event: 'score_update' }, (payload) => {
        if (payload.payload.id !== myNetworkId) {
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
            // Opponent started the game, we should start too!
            if (window.startGame && !window.isPlaying) {
                console.log("Opponent started the game! Starting automatically...");
                window.startGame(false);
            }
        }
    });

    flickChannel.subscribe((status) => {
        console.log("Supabase Network Status:", status);
    });
}

function broadcastScore(newScore) {
    if (flickChannel) {
        window.myNetworkScore = newScore;
        flickChannel.send({
            type: 'broadcast',
            event: 'score_update',
            payload: { id: myNetworkId, score: newScore }
        });
    }
}

function broadcastGameStart() {
    if (flickChannel) {
        flickChannel.send({
            type: 'broadcast',
            event: 'game_start',
            payload: { id: myNetworkId }
        });
    }
}

document.addEventListener('DOMContentLoaded', initNetwork);

window.flickNetwork = {
    broadcastScore,
    broadcastGameStart
};
