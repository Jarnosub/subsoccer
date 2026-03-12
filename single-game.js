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

    // UI Elements
    const timerDisplay = document.getElementById('timer-value');
    const scoreDisplay = document.getElementById('score-value');
    const comboDisplay = document.getElementById('combo-display');

    // Camera indicator
    const camDot = document.getElementById('cam-indicator');
    const camText = document.getElementById('cam-text');

    // Make sure vision starts on tap and initialize Audio
    btnStart.addEventListener('click', () => {
        initAudio(); // Required to unlock audio on first user gesture
        if (window.soundEffects && window.soundEffects.sounds && window.soundEffects.sounds['victory']) {
            window.soundEffects.sounds['victory'].load();
        }
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

        // Start gameplay music
        if (window.soundEffects && typeof window.soundEffects.playGameplayTheme === 'function') {
            window.soundEffects.playGameplayTheme();
        }

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

        // Play victory/game over music
        if (window.soundEffects && typeof window.soundEffects.playVictoryTheme === 'function') {
            window.soundEffects.playVictoryTheme();
        }

        if (window.visionEngine) {
            window.visionEngine.activeZoneId = null; // Näytä kaikki valot kun peli on ohi
            window.visionEngine.stopCamera();
        }

        btnStart.style.display = 'none';

        const victoryOverlay = document.getElementById('victory-overlay');
        if (victoryOverlay) {
            victoryOverlay.style.display = 'flex';

            // Initialize Lasers
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
                        colorStr: i % 2 === 0 ? '227, 6, 19' : '0, 255, 204',
                        width: 30 + Math.random() * 50,
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

            // Handle ELO update if user is registered and scored
            const userJson = localStorage.getItem('subsoccer_user');
            if (userJson && score > 0) {
                try {
                    const user = JSON.parse(userJson);
                    const currentElo = user.elo || 1000;

                    // Pisteiden perusteella ELO:a: esim. 1 ELO per 200 pistettä
                    const eloGained = Math.max(1, Math.floor(score / 200));
                    user.elo = currentElo + eloGained;

                    // Päivitetään Storageen
                    localStorage.setItem('subsoccer_user', JSON.stringify(user));

                    const eloCount = document.getElementById('victory-elo-count');
                    const eloGain = document.getElementById('victory-elo-gain');
                    const cardName = document.getElementById('victory-card-name');
                    const cardAvatar = document.getElementById('victory-card-avatar');

                    if (cardName) cardName.textContent = (user.username || user.full_name || "PLAYER").toUpperCase();
                    if (cardAvatar && user.avatar_url) cardAvatar.src = user.avatar_url;

                    if (eloCount) eloCount.innerText = currentElo + " ELO";
                    if (eloGain) eloGain.innerText = `+${eloGained} ELO`;

                    // Animaatiosekvenssi ja Pistelaskuri
                    setTimeout(() => {
                        window.playC64Sound?.('hit');
                        const startElo = currentElo;
                        const finalElo = currentElo + eloGained;
                        const duration = 1500;
                        const startTime = performance.now();

                        function updateCounter(currentTime) {
                            const elapsed = currentTime - startTime;
                            const progress = Math.min(elapsed / duration, 1);
                            const easeProgress = progress * (2 - progress);
                            const currentVal = Math.floor(startElo + (finalElo - startElo) * easeProgress);

                            if (eloCount) eloCount.textContent = currentVal + " ELO";

                            if (progress < 1) {
                                requestAnimationFrame(updateCounter);
                            } else {
                                eloCount.style.color = '#00FFCC';
                                window.playC64Sound?.('combo');
                            }
                        }
                        requestAnimationFrame(updateCounter);
                    }, 500);
                } catch (e) {
                    console.error("Error parsing user data for ELO", e);
                }
            } else {
                const eloCount = document.getElementById('victory-elo-count');
                const eloGain = document.getElementById('victory-elo-gain');
                const cardName = document.getElementById('victory-card-name');
                const cardAvatar = document.getElementById('victory-card-avatar');

                if (cardName) cardName.textContent = "GUEST";
                if (eloCount) eloCount.innerText = score + " PTS";
                if (eloGain) eloGain.innerText = `${score} POINTS`;
                if (cardAvatar) cardAvatar.src = "goalie.png";

                setTimeout(() => {
                    window.playC64Sound?.('hit');
                }, 500);
            }
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

        // Pop effect on score
        scoreDisplay.style.transform = 'scale(1.2)';
        scoreDisplay.style.color = '#00FFCC';
        setTimeout(() => {
            scoreDisplay.style.transform = 'scale(1)';
            scoreDisplay.style.color = '#fff';
        }, 150);

        updateDisplays();
        triggerCharacterAnimation();
        setNewRandomTarget(); // Arvo uusi palava kohde vasta onnistuneen osuman jälkeen!
    };

    function triggerCharacterAnimation() {
        const charImg = document.getElementById('game-character');
        if (charImg) {
            // Pick a random hit reaction
            const reacts = ['react1', 'react2', 'react3'];
            const randomReact = reacts[Math.floor(Math.random() * reacts.length)];
            setGoaliePose(randomReact);
            
            charImg.style.transform = 'translate(-50%, -50%) scale(1.1)';
            charImg.style.filter = 'drop-shadow(0 0 50px rgba(0, 255, 204, 0.8))';
            
            setTimeout(() => {
                charImg.style.transform = '';
                charImg.style.filter = 'drop-shadow(0 0 30px rgba(0, 136, 204, 0.3))';
                // setNewRandomTarget() handles reverting the pose
            }, 300);
        }
    }

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

    
    // --- GOALIE ANIMATION LOGIC ---
    const goalieImages = {
        idle: 'goalie.png',
        'top-left': 'goalie/goalie_0004_Layer-5.png', // Fallback as jump images were removed
        'top-right': 'goalie/goalie_0003_Generative-Fill.png', // Fallback

        'bottom-left': 'goalie/goalie_0004_Layer-5.png',
        'bottom-right': 'goalie/goalie_0003_Generative-Fill.png',
        react1: 'goalie/goalie_0002_Layer-6.png',
        react2: 'goalie/goalie_0001_Layer-7.png',
        react3: 'goalie/goalie_0000_Layer-8.png'
    };

    // Preload
    Object.values(goalieImages).forEach(src => {
        const img = new Image();
        img.src = src;
    });

    function setGoaliePose(pose) {
        const charImg = document.getElementById('game-character');
        if (charImg && goalieImages[pose]) {
            charImg.src = goalieImages[pose];
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
        setGoaliePose(nextTargetId); // Goalie reagoi syttyvään tauluun!

    }
});
