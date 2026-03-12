// Subsoccer Arcade - Event Game Logic (Pudgy Penguins Edition)
let score = 0;
let timeLeft = 45;
let timerInterval = null;
let isPlaying = false;

// Combo mechanics
let lastTargetHit = null;
let lastHitTime = 0;
let currentCombo = 1;
const COMBO_TIMEOUT_MS = 2500;
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

// Synth Sounds
function playC64Sound(type = 'hit') {
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'hit') {
        // Fast Sega ring style sound
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now); // Higher pitch for ring
        osc.frequency.setValueAtTime(1200, now + 0.05);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'combo') {
        // Chaos Emerald style sound
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, now); 
        osc.frequency.setValueAtTime(600, now + 0.05); 
        osc.frequency.setValueAtTime(800, now + 0.1); 
        osc.frequency.setValueAtTime(1000, now + 0.15); 

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.4);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btn-start');

    // UI Elements
    const timerDisplay = document.getElementById('timer-value');
    const scoreDisplay = document.getElementById('score-value');
    const comboDisplay = document.getElementById('combo-display');

    // Camera indicator
    const camDot = document.getElementById('cam-indicator');
    const camText = document.getElementById('cam-text');

    btnStart.addEventListener('click', () => {
        initAudio();
        startGame();
    });

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

        score = 0;
        timeLeft = 45;
        currentCombo = 1;
        lastTargetHit = null;
        lastHitTime = 0;

        updateDisplays();
        comboDisplay.classList.remove('active');
        btnStart.style.display = 'none';

        if (window.visionEngine) {
            const success = await window.visionEngine.startCamera('user');
            if (!success) {
                alert("Camera access is required for this game mode!");
                btnStart.style.display = 'inline-block';
                return;
            }

            window.visionEngine.onTargetHit = window.handleGoalDetected;
        }

        isPlaying = true;
        setNewRandomTarget(); 

        if (window.soundEffects && typeof window.soundEffects.playGameplayTheme === 'function') {
            window.soundEffects.playGameplayTheme();
        }

        timerInterval = setInterval(() => {
            timeLeft--;
            updateDisplays();

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

        if (window.soundEffects && typeof window.soundEffects.playVictoryTheme === 'function') {
            window.soundEffects.playVictoryTheme();
        }

        if (window.visionEngine) {
            window.visionEngine.activeZoneId = null;
            window.visionEngine.stopCamera();
        }

        btnStart.style.display = 'none';

        const victoryOverlay = document.getElementById('victory-overlay');
        if (victoryOverlay) {
            victoryOverlay.style.display = 'flex';

            const lasersCanvas = document.getElementById('lasers-canvas');
            if (lasersCanvas) {
                lasersCanvas.style.display = 'block';
                lasersCanvas.width = window.innerWidth;
                lasersCanvas.height = window.innerHeight;
                const ctx = lasersCanvas.getContext('2d');

                let lasers = [];
                for (let i = 0; i < 6; i++) {
                    lasers.push({
                        x: (lasersCanvas.width / 7) * (i + 1),
                        y: lasersCanvas.height + 50,
                        angle: Math.PI * 1.5 + (Math.random() - 0.5),
                        targetAngle: Math.PI * 1.5 + (Math.random() - 0.5) * 1.5,
                        speed: 0.002 + Math.random() * 0.005,
                        colorStr: i % 2 === 0 ? '0, 136, 204' : '255, 215, 0', // Pudgy Blue / Gold
                        width: 40 + Math.random() * 60,
                        alpha: 0
                    });
                }

                function updateLasers() {
                    if (victoryOverlay.style.display === 'none') return;
                    ctx.clearRect(0, 0, lasersCanvas.width, lasersCanvas.height);
                    ctx.globalCompositeOperation = 'screen';
                    lasers.forEach(laser => {
                        if (Math.abs(laser.angle - laser.targetAngle) < 0.02) {
                            laser.targetAngle = Math.PI * 1.5 + (Math.random() - 0.5) * 1.8;
                            laser.speed = 0.002 + Math.random() * 0.003;
                        }
                        laser.angle += (laser.targetAngle - laser.angle) * laser.speed;
                        if (laser.alpha < 0.5) laser.alpha += 0.005;
                        const length = lasersCanvas.height * 2;
                        const endX = laser.x + Math.cos(laser.angle) * length;
                        const endY = laser.y + Math.sin(laser.angle) * length;
                        const gradient = ctx.createLinearGradient(laser.x, laser.y, endX, endY);
                        gradient.addColorStop(0, `rgba(${laser.colorStr}, ${laser.alpha})`);
                        gradient.addColorStop(1, `rgba(${laser.colorStr}, 0)`);
                        ctx.beginPath();
                        ctx.moveTo(laser.x - laser.width / 2, laser.y);
                        ctx.lineTo(endX - laser.width * 4, endY);
                        ctx.lineTo(endX + laser.width * 4, endY);
                        ctx.lineTo(laser.x + laser.width / 2, laser.y);
                        ctx.closePath();
                        ctx.fillStyle = gradient;
                        ctx.fill();
                    });
                    ctx.globalCompositeOperation = 'source-over';
                    requestAnimationFrame(updateLasers);
                }
                updateLasers();
            }

            // Player Card Logic - Hardcoded for Event Demo
            document.getElementById('victory-card-name').textContent = "STEVE";
            document.getElementById('victory-elo-count').textContent = "1300 ELO";
            document.getElementById('victory-card-avatar').src = "pudgy_penguins.png";

            const eloGain = document.getElementById('victory-elo-gain');
            eloGain.innerText = `+${Math.floor(score/100)} EVENT POINTS`;

            setTimeout(() => {
                window.playC64Sound?.('hit');
                const startScore = 0;
                const finalScore = score;
                const duration = 1500;
                const startTime = performance.now();

                function updateCounter(currentTime) {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const easeProgress = progress * (2 - progress);
                    const currentVal = Math.floor(startScore + (finalScore - startScore) * easeProgress);

                    eloCount.textContent = currentVal;

                    if (progress < 1) {
                        requestAnimationFrame(updateCounter);
                    } else {
                        window.playC64Sound?.('combo');
                    }
                }
                requestAnimationFrame(updateCounter);
            }, 500);
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

    // Pudgy specific animation
    function triggerPudgyAnimation() {
        // We can do a small camera shake or glow on the central character
        const pudgy = document.getElementById('pudgy-character');
        if (pudgy) {
            pudgy.style.transform = 'translate(-50%, -50%) scale(1.1)';
            pudgy.style.filter = 'drop-shadow(0 0 50px rgba(0, 255, 204, 0.8))';
            
            try {
                if (Math.random() > 0.8) {
                    const s = new SpeechSynthesisUtterance("Pudgy!");
                    s.rate = 1.3;
                    window.speechSynthesis.speak(s);
                } else if (currentCombo > 3 && Math.random() > 0.6) {
                    const s = new SpeechSynthesisUtterance("Waddle on!");
                    s.rate = 1.6;
                    window.speechSynthesis.speak(s);
                }
            } catch (e) {}
            
            setTimeout(() => {
                pudgy.style.transform = ''; // Clear inline transform to revert to CSS stylesheet rules
                pudgy.style.filter = ''; // Clear inline filter to revert to CSS stylesheet rules
            }, 300);
        }
    }

    // Global goal detection
    window.handleGoalDetected = function (zoneId, index) {
        if (!isPlaying) return;

        const now = Date.now();

        document.body.classList.add('hit-flash');
        setTimeout(() => document.body.classList.remove('hit-flash'), 300);

        if (zoneId === lastTargetHit && (now - lastHitTime < COMBO_TIMEOUT_MS)) {
            currentCombo++;
            playC64Sound('combo'); 
            showCombo();
        } else {
            currentCombo = 1;
            playC64Sound('hit');
            comboDisplay.classList.remove('active');
        }

        lastTargetHit = zoneId;
        lastHitTime = now;

        const pointsEarned = BASE_POINTS * currentCombo;
        score += pointsEarned;

        scoreDisplay.style.transform = 'scale(1.3)';
        scoreDisplay.style.color = '#005CE6';
        setTimeout(() => {
            scoreDisplay.style.transform = 'scale(1)';
            scoreDisplay.style.color = '#fff';
        }, 150);

        updateDisplays();
        triggerPudgyAnimation();
        setNewRandomTarget();
    };

    function showCombo() {
        comboDisplay.textContent = `${currentCombo}X COMBO!`;
        comboDisplay.classList.remove('active');
        void comboDisplay.offsetWidth;
        comboDisplay.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(50);
    }

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
