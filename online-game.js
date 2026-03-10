// Subsoccer Arcade - Online Multiplayer Logic
const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const arcadeDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let myId = Math.random().toString(36).substring(7);
let myName = "PLAYER";
let oppScore = 0;
let oppName = "OPPONENT";
let supabaseChannel = null;
let peerConnection = null;
let isReady = false;
let oppReady = false;
let score = 0;
let timeLeft = 45;
let timerInterval = null;
let isPlaying = false;

// Combo mechanics
let lastTargetHit = null;
let lastHitTime = 0;
let currentCombo = 1;
const COMBO_TIMEOUT_MS = 2500; // 2.5 seconds to keep combo alive
const BASE_POINTS = 100;

// Web Audio API Context
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// C64 Style Synthesizer
function playC64Sound(type = 'hit') {
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'hit') {
        // C64 'Coin' tai blip-ääni: Kaksi nopeaa nousevaa taajuutta neliö-aallolla
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.setValueAtTime(880, now + 0.1); // Jump to A5

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'combo') {
        // C64 'Powerup' ääni: Arpeggio
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(349.23, now); // F4
        osc.frequency.setValueAtTime(440, now + 0.05); // A4
        osc.frequency.setValueAtTime(523.25, now + 0.1); // C5
        osc.frequency.setValueAtTime(698.46, now + 0.15); // F5

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btn-start');
    const btnRestart = document.getElementById('btn-restart');

    // UI Elements
    const timerDisplay = document.getElementById('timer-value');
    const scoreDisplay = document.getElementById('score-value');
    const comboDisplay = document.getElementById('combo-display');
    const endOverlay = document.getElementById('end-overlay');
    const finalScoreDisplay = document.getElementById('final-score');

    // Camera indicator
    const camDot = document.getElementById('cam-indicator');
    const camText = document.getElementById('cam-text');

    // Status Text
    const statusText = document.getElementById('status-text');

    // Restore user profile
    const userJson = localStorage.getItem('subsoccer_user');
    if (userJson) {
        try { myName = JSON.parse(userJson).username || "PLAYER"; } catch (e) { }
    }

    // WebRTC Setup
    function initWebRTC() {
        if (peerConnection) return;
        peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

        // Add our face stream
        if (window.visionEngine && window.visionEngine.stream) {
            window.visionEngine.stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, window.visionEngine.stream);
            });
        }

        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.style.display = 'block';
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate && supabaseChannel) {
                supabaseChannel.send({ type: 'broadcast', event: 'rtc_candidate', payload: { candidate: event.candidate, id: myId } });
            }
        };
    }

    // Init Network Connection
    function initNetwork() {
        supabaseChannel = arcadeDb.channel('arcade_global_battle', {
            config: {
                broadcast: { self: false },
            },
        });

        // 1. Someone joins
        supabaseChannel.on('broadcast', { event: 'hello' }, async (payload) => {
            if (payload.payload.id !== myId && !isPlaying) {
                statusText.textContent = "OPPONENT IN LOBBY! CONNECTING VIDEO...";
                initWebRTC();
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                supabaseChannel.send({ type: 'broadcast', event: 'rtc_offer', payload: { offer, id: myId } });
            }
        });

        // 2. We got an Offer
        supabaseChannel.on('broadcast', { event: 'rtc_offer' }, async (payload) => {
            if (payload.payload.id !== myId && !isPlaying) {
                initWebRTC();
                await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.payload.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                supabaseChannel.send({ type: 'broadcast', event: 'rtc_answer', payload: { answer, id: myId } });
            }
        });

        // 3. We got an Answer
        supabaseChannel.on('broadcast', { event: 'rtc_answer' }, async (payload) => {
            if (payload.payload.id !== myId && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.payload.answer));
            }
        });

        // 4. ICE Candidates
        supabaseChannel.on('broadcast', { event: 'rtc_candidate' }, async (payload) => {
            if (payload.payload.id !== myId && peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
            }
        });

        // Game logic syncing
        supabaseChannel.on('broadcast', { event: 'score_update' }, (payload) => {
            if (payload.payload.id !== myId && isPlaying) {
                oppScore = payload.payload.score;
                document.getElementById('opp-score-value').textContent = oppScore;
                document.getElementById('opp-score-value').style.transform = 'scale(1.2)';
                setTimeout(() => { document.getElementById('opp-score-value').style.transform = 'scale(1)'; }, 150);
            }
        });

        supabaseChannel.on('broadcast', { event: 'player_ready' }, (payload) => {
            if (payload.payload.id !== myId && !isPlaying) {
                oppReady = true;
                statusText.textContent = "OPPONENT READY. PRESS READY TO START.";
                if (isReady) {
                    supabaseChannel.send({ type: 'broadcast', event: 'game_start', payload: { id: myId } });
                    triggerCountdown();
                }
            }
        });

        supabaseChannel.on('broadcast', { event: 'game_start' }, (payload) => {
            if (payload.payload.id !== myId && !isPlaying) {
                triggerCountdown();
            }
        });

        supabaseChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                statusText.textContent = "Awaiting opponent in the Lobby. Say Hi in the camera!";
                supabaseChannel.send({ type: 'broadcast', event: 'hello', payload: { id: myId } });
            }
        });
    }

    function triggerCountdown() {
        if (isPlaying) return;
        isPlaying = true;
        btnStart.style.display = 'none';

        let counter = 3;
        statusText.style.fontSize = '3rem';
        statusText.style.color = '#fff';

        const countInterval = setInterval(() => {
            if (counter > 0) {
                playC64Sound('hit');
                statusText.textContent = counter;
                counter--;
            } else {
                clearInterval(countInterval);
                playC64Sound('combo');
                statusText.textContent = "PLAY!";
                setTimeout(() => {
                    statusText.style.fontSize = '0.9rem';
                    statusText.style.color = '#aaa';
                    startGameSequence();
                }, 1000);
            }
        }, 1000);
    }

    // Make sure vision starts on tap and initialize Audio
    btnStart.addEventListener('click', () => {
        initAudio(); // Required to unlock audio on first user gesture
        if (!isReady) {
            isReady = true;
            btnStart.style.display = 'none';
            statusText.textContent = "WAITING FOR OPPONENT TO READY UP...";

            if (supabaseChannel) {
                supabaseChannel.send({ type: 'broadcast', event: 'player_ready', payload: { id: myId } });
            }

            if (oppReady && supabaseChannel) {
                supabaseChannel.send({ type: 'broadcast', event: 'game_start', payload: { id: myId } });
                triggerCountdown();
            }
        }
    });

    btnRestart.addEventListener('click', () => {
        endOverlay.style.display = 'none';
        isReady = false;
        oppReady = false;
        isPlaying = false;
        btnStart.style.display = 'inline-block';
        btnStart.textContent = "READY FOR BATTLE";
        statusText.textContent = "Awaiting opponent...";
        initSelfieCamera();
        document.getElementById('remote-video').style.display = 'block';
    });

    initNetwork();

    // Start selfie camera for player intro before match
    async function initSelfieCamera() {
        if (window.visionEngine) {
            await window.visionEngine.startCamera('user');
            if (supabaseChannel && supabaseChannel.state === 'joined') {
                supabaseChannel.send({ type: 'broadcast', event: 'hello', payload: { id: myId } });
            }
        }
    }
    initSelfieCamera();

    // Check camera status periodically
    setInterval(() => {
        if (!window.visionEngine) return;
        if (window.visionEngine.isScanning) {
            camDot.classList.add('active');
            camText.textContent = "Camera Active";
            camText.style.color = "#FFD700";
        } else {
            camDot.classList.remove('active');
            camText.textContent = "Camera Standby";
            camText.style.color = "#666";
        }
    }, 1000);

    async function startGameSequence() {
        // Sulje Faceoff video jotta säästyy tehoa
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        document.getElementById('remote-video').style.display = 'none';

        // Reset state
        score = 0;
        oppScore = 0;
        timeLeft = 45;
        currentCombo = 1;
        lastTargetHit = null;
        lastHitTime = 0;

        updateDisplays();
        comboDisplay.classList.remove('active');
        btnStart.style.display = 'none';

        // Start the vision engine (Camera) in environment mode for game
        if (window.visionEngine && window.visionEngine.facingMode !== 'environment') {
            const success = await window.visionEngine.startCamera('environment');
            if (!success) {
                alert("Back camera access is required for gameplay!");
                btnStart.style.display = 'inline-block';
                return;
            }

            // Re-bind the vision engine hit callback
            window.visionEngine.onTargetHit = window.handleGoalDetected;
        }

        isPlaying = true;
        setNewRandomTarget(); // RANDOM GENERATOR MODE: Arpoo ensimmäisen maalin
        statusText.textContent = "BATTLE IN PROGRESS!";

        // Start countdown
        timerInterval = setInterval(() => {
            timeLeft--;
            updateDisplays();

            // Check combo timeout visually
            if (Date.now() - lastHitTime > COMBO_TIMEOUT_MS) {
                if (currentCombo > 1) {
                    currentCombo = 1;
                    comboDisplay.classList.remove('active');
                }
            }

            if (timeLeft <= 0) {
                endGame();
            }
        }, 1000);
    }

    function endGame() {
        isPlaying = false;
        clearInterval(timerInterval);

        if (window.visionEngine) {
            window.visionEngine.activeZoneId = null; // Näytä kaikki valot kun peli on ohi
            window.visionEngine.stopCamera();
        }

        finalScoreDisplay.textContent = `${score} - ${oppScore}`;
        endOverlay.style.display = 'flex';
        btnStart.style.display = 'inline-block';
        btnStart.textContent = "REMATCH";
        statusText.textContent = "MATCH FINISHED!";

        // Handle ELO update if user is registered and scored
        const userJson = localStorage.getItem('subsoccer_user');
        const eloContainer = document.getElementById('elo-container');

        if (userJson && score > 0) {
            try {
                const user = JSON.parse(userJson);
                const currentElo = user.elo || 1000;

                // Pisteiden perusteella ELO:a: esim. 1 ELO per 200 pistettä
                const eloGained = Math.max(1, Math.floor(score / 200));
                user.elo = currentElo + eloGained;

                // Päivitetään Storageen
                localStorage.setItem('subsoccer_user', JSON.stringify(user));

                // Animaation UI elementit
                eloContainer.style.display = 'flex';
                const eloValueEl = document.getElementById('elo-value');
                const eloGainedEl = document.getElementById('elo-gained');
                const eloPlayerEl = document.getElementById('elo-player-name');

                eloValueEl.style.color = '#fff';
                eloValueEl.style.textShadow = 'none';
                eloValueEl.style.transform = 'scale(1)';

                eloPlayerEl.textContent = user.username || "PLAYER";
                eloValueEl.textContent = currentElo;
                eloGainedEl.textContent = `+${eloGained}`;
                eloGainedEl.style.opacity = '0'; // Reset
                eloGainedEl.style.transform = 'translateY(10px)'; // Reset

                // Animaatiosekvenssi
                setTimeout(() => {
                    playC64Sound('hit');
                    eloGainedEl.style.opacity = '1';
                    eloGainedEl.style.transform = 'translateY(0)';

                    // Numerolaskuri nousee
                    let startElo = currentElo;
                    const finalElo = currentElo + eloGained;
                    const duration = 1500;
                    const startTime = performance.now();

                    function updateCounter(currentTime) {
                        const elapsed = currentTime - startTime;
                        const progress = Math.min(elapsed / duration, 1);

                        // easeOutQuad
                        const easeProgress = progress * (2 - progress);
                        const currentVal = Math.floor(startElo + (finalElo - startElo) * easeProgress);

                        eloValueEl.textContent = currentVal;

                        if (progress < 1) {
                            requestAnimationFrame(updateCounter);
                        } else {
                            // Tadaa!
                            eloValueEl.style.color = '#00FFCC';
                            eloValueEl.style.textShadow = '0 0 20px #00FFCC';
                            eloValueEl.style.transform = 'scale(1.1)';
                            playC64Sound('combo');
                            setTimeout(() => {
                                eloValueEl.style.transform = 'scale(1)';
                            }, 300);
                        }
                    }
                    setTimeout(() => {
                        requestAnimationFrame(updateCounter);
                    }, 600);

                }, 800);

            } catch (e) {
                console.error("Error parsing user data for ELO", e);
                eloContainer.style.display = 'none';
            }
        } else {
            // Joko vieras tai ei saanut yhtään pistettä
            eloContainer.style.display = 'none';
        }
    }

    function updateDisplays() {
        timerDisplay.textContent = timeLeft;
        scoreDisplay.textContent = score;

        if (timeLeft <= 10) {
            timerDisplay.style.color = '#E30613';
            if (timeLeft % 2 === 0) {
                timerDisplay.style.textShadow = '0 0 20px #E30613';
            } else {
                timerDisplay.style.textShadow = 'none';
            }
        } else {
            timerDisplay.style.color = '#FFD700';
            timerDisplay.style.textShadow = '0 0 15px currentColor';
        }
    }

    // Global goal detection handler bound to the vision engine
    window.handleGoalDetected = function (zoneId, index) {
        if (!isPlaying) return;

        const now = Date.now();

        // Visual flash
        document.body.classList.add('hit-flash');
        setTimeout(() => document.body.classList.remove('hit-flash'), 300);

        // Combo Logic: Hit same target within timeout = multiplier goes up
        if (zoneId === lastTargetHit && (now - lastHitTime < COMBO_TIMEOUT_MS)) {
            currentCombo++;
            playC64Sound('combo'); // Retro combo arpeggio
            showCombo();
        } else {
            currentCombo = 1;
            playC64Sound('hit'); // Retro hit blip
            comboDisplay.classList.remove('active');
        }

        lastTargetHit = zoneId;
        lastHitTime = now;

        // Add points
        const pointsEarned = BASE_POINTS * currentCombo;
        score += pointsEarned;

        // Broadcast to opponent
        if (supabaseChannel) {
            supabaseChannel.send({
                type: 'broadcast',
                event: 'score_update',
                payload: { id: myId, score: score, name: myName }
            });
        }

        // Pop effect on score
        scoreDisplay.style.transform = 'scale(1.2)';
        scoreDisplay.style.color = '#00FFCC';
        setTimeout(() => {
            scoreDisplay.style.transform = 'scale(1)';
            scoreDisplay.style.color = '#fff';
        }, 150);

        updateDisplays();
        setNewRandomTarget(); // Arvo uusi palava kohde vasta onnistuneen osuman jälkeen!
    };

    function showCombo() {
        comboDisplay.textContent = `${currentCombo}X COMBO!`;
        comboDisplay.classList.remove('active');
        // Force reflow
        void comboDisplay.offsetWidth;
        comboDisplay.classList.add('active');

        // Optional: haptic feedback via vibration api if on mobile
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    // --- RANDOM TARGET GENERATOR ---
    const ZONES = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

    function setNewRandomTarget() {
        if (!window.visionEngine) return;

        let nextTargetId = null;
        do {
            nextTargetId = ZONES[Math.floor(Math.random() * ZONES.length)];
        } while (nextTargetId === window.visionEngine.activeZoneId && ZONES.length > 1);

        window.visionEngine.activeZoneId = nextTargetId;
    }
});
