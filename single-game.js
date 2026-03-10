// Subsoccer Arcade - Single Game Logic
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

    // Make sure vision starts on tap and initialize Audio
    btnStart.addEventListener('click', () => {
        initAudio(); // Required to unlock audio on first user gesture
        startGame();
    });
    btnRestart.addEventListener('click', () => {
        endOverlay.style.display = 'none';
        startGame();
    });

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

    async function startGame() {
        if (isPlaying) return;

        // Reset state
        score = 0;
        timeLeft = 45;
        currentCombo = 1;
        lastTargetHit = null;
        lastHitTime = 0;

        updateDisplays();
        comboDisplay.classList.remove('active');
        btnStart.style.display = 'none';

        // Start the vision engine (Camera)
        if (window.visionEngine) {
            const success = await window.visionEngine.startCamera();
            if (!success) {
                alert("Camera access is required for this game mode!");
                btnStart.style.display = 'inline-block';
                return;
            }

            // Re-bind the vision engine hit callback
            window.visionEngine.onTargetHit = window.handleGoalDetected;
        }

        isPlaying = true;
        setNewRandomTarget(); // RANDOM GENERATOR MODE: Arpoo ensimmäisen maalin

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

        finalScoreDisplay.textContent = score;
        endOverlay.style.display = 'flex';
        btnStart.style.display = 'inline-block';
        btnStart.textContent = "PLAY AGAIN";
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
