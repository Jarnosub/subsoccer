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

document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btn-start');
    const btnRestart = document.getElementById('btn-restart');

    // UI Elements
    const timerDisplay = document.getElementById('timer-value');
    const scoreDisplay = document.getElementById('score-value');
    const comboDisplay = document.getElementById('combo-display');
    const endOverlay = document.getElementById('end-overlay');
    const finalScoreDisplay = document.getElementById('final-score');

    // Mic indicator
    const micDot = document.getElementById('mic-indicator');
    const micText = document.getElementById('mic-text');

    // Make sure audio context can be initialized on user tap
    btnStart.addEventListener('click', startGame);
    btnRestart.addEventListener('click', () => {
        endOverlay.style.display = 'none';
        startGame();
    });

    // Check mic status periodically
    setInterval(() => {
        if (!window.audioEngine) return;
        const status = window.audioEngine.getStatus();
        if (status.isListening) {
            micDot.classList.add('active');
            micText.textContent = "Mic Active";
            micText.style.color = "#00FFCC";
        } else {
            micDot.classList.remove('active');
            micText.textContent = "Mic Standby";
            micText.style.color = "#666";
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

        // Try starting the audio engine
        if (window.audioEngine) {
            const result = await window.audioEngine.startListening();
            if (!result.success) {
                alert("Microphone is required for this game mode!");
                btnStart.style.display = 'inline-block';
                return;
            }
        }

        isPlaying = true;

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

        if (window.audioEngine) {
            window.audioEngine.stopListening();
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

    // Global goal detection handler bound to the audio engine
    window.handleGoalDetected = function (playerNumber) {
        if (!isPlaying) return;

        const now = Date.now();

        // Visual flash
        document.body.classList.add('hit-flash');
        setTimeout(() => document.body.classList.remove('hit-flash'), 300);

        // Combo Logic: Hit same target within timeout = multiplier goes up
        if (playerNumber === lastTargetHit && (now - lastHitTime < COMBO_TIMEOUT_MS)) {
            currentCombo++;
            showCombo();
        } else {
            currentCombo = 1;
            comboDisplay.classList.remove('active');
        }

        lastTargetHit = playerNumber;
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
});
