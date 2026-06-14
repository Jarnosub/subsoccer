// ============================================================
// SUBSOCCER AUDIO ENGINE - Acoustic Goal Detection
// Patented Technology: Dual-frequency goal detection system
// + Speech Recognition: Voice-based goal detection ("Red"/"Blue")
// ============================================================

// Audio context and analyzer nodes
let audioContext = null;
let analyserNode = null;
let microphoneStream = null;
let sourceNode = null;
let isListening = false;
let detectionInterval = null;

// Goal-specific audio signatures (Hz)
let GOAL_1_FREQUENCY = 2000; // Player 1's goal emits 2000 Hz → Player 2 scores
let GOAL_2_FREQUENCY = 3500; // Player 2's goal emits 3500 Hz → Player 1 scores
let FREQUENCY_TOLERANCE = 200; // ±200 Hz detection window
let DETECTION_THRESHOLD = 0.65; // Sensitivity (0.0 - 1.0), higher = less sensitive
try {
    const savedThreshold = localStorage.getItem('subsoccer_audio_threshold');
    if (savedThreshold !== null) {
        const val = parseFloat(savedThreshold);
        if (!isNaN(val) && val >= 0 && val <= 1) DETECTION_THRESHOLD = val;
    }
} catch (e) { }
const MIN_DURATION_MS = 50; // Reduced for sharper impact detection
const COOLDOWN_MS = 1500; // Cooldown between goal detections

// Detection state
let lastDetectionTime = 0;
let detectionStartTime = 0;
let currentDetectedGoal = null;

// ============================================================
// SPEECH RECOGNITION - Voice Goal Detection
// ============================================================
let speechRecognition = null;
let isSpeechActive = false;
let lastSpeechGoalTime = 0;
const SPEECH_COOLDOWN_MS = 1200; // Cooldown between voice-detected goals
let voiceEnabled = true; // Can be toggled independently

// Word-to-player mapping
const VOICE_COMMANDS = {
    // English
    'red': 2,       // Red → Player 2 scores (Right side)
    'read': 2,      // Common misheard variant
    'bread': 2,     // Common misheard variant
    'ret': 2,       // Finnish-accented "red"
    'blue': 1,      // Blue → Player 1 scores (Left side)
    'boo': 1,       // Common misheard variant
    'blew': 1,      // Homophone
    'glue': 1,      // Common misheard variant
    // Finnish
    'punainen': 2,  // Punainen → Player 2 scores
    'punanen': 2,   // Colloquial Finnish
    'puna': 2,      // Shortened form
    'sininen': 1,   // Sininen → Player 1 scores
    'sininen': 1,
    'sinine': 1,    // Colloquial
    'sini': 1,      // Shortened form
};

// Debug/Fine-tuning state
let peakGoal1 = 0;
let peakGoal2 = 0;
let currentG1 = 0;
let currentG2 = 0;

// HUD Elements Cache
let hudBarP1 = null;
let hudBarP2 = null;

/**
 * Initialize audio context (must be called after user interaction)
 */
function initAudioContext() {
    if (audioContext) return true;
    try {
        // Yritetään käyttää olemassa olevaa contextia (SoundEffects), jotta säästetään resursseja mobiilissa
        if (window.soundEffects && window.soundEffects.audioContext) {
            audioContext = window.soundEffects.audioContext;
            console.log("AudioEngine: Reusing SoundEffects AudioContext");
        } else {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048; // Higher FFT for better frequency resolution
        analyserNode.smoothingTimeConstant = 0.8;
        return true;
    } catch (e) {
        console.error("AudioContext initialization failed:", e);
        return false;
    }
}

/**
 * Request microphone access and start listening for goal sounds
 */
async function startListening() {
    if (isListening) {
        return { success: true, message: "Already active" };
    }

    try {
        // Initialize audio context if not already done
        if (!audioContext) {
            const initialized = initAudioContext();
            if (!initialized) {
                return { success: false, message: "Failed to initialize audio system" };
            }
        }

        // Varmistetaan että audioyhteys on aktiivinen (tärkeää suspend/resume-logiikassa)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Request microphone access
        const constraints = {
            audio: {
                echoCancellation: { ideal: false },
                noiseSuppression: { ideal: false },
                autoGainControl: { ideal: false }
            }
        };

        microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
        sourceNode = audioContext.createMediaStreamSource(microphoneStream);
        sourceNode.connect(analyserNode);

        isListening = true;
        lastDetectionTime = 0;
        detectionStartTime = 0;
        currentDetectedGoal = null;

        // Cache HUD elements for performance
        hudBarP1 = document.getElementById('hud-bar-p1');
        hudBarP2 = document.getElementById('hud-bar-p2');

        // Start frequency analysis loop
        startDetectionLoop();

        // Voice recognition is NOT auto-started here.
        // It requires its own UI toggle (not yet implemented).
        // Call window.audioEngine.startVoiceRecognition() manually when ready.

        updateUIStatus(true);
        return { success: true, message: "Goal detection activated" };

    } catch (error) {
        console.error("Microphone access denied or failed:", error);
        return { success: false, message: "Microphone access required for goal detection" };
    }
}

/**
 * Stop listening and release microphone
 */
function stopListening() {
    if (!isListening) return;

    // Stop speech recognition if it was manually started
    if (isSpeechActive) stopVoiceRecognition();

    // Stop detection loop
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }

    // Disconnect audio nodes
    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
    }

    // Disconnect analyser to be safe
    if (analyserNode) {
        analyserNode.disconnect();
    }

    // Stop microphone stream
    if (microphoneStream) {
        microphoneStream.getTracks().forEach(track => track.stop());
        microphoneStream = null;
    }

    // Älä sulje (close) kontekstia, vaan keskeytä se, jotta se voidaan aktivoida uudelleen
    if (audioContext && audioContext.state === 'running') {
        audioContext.suspend();
    }

    isListening = false;
    updateUIStatus(false);
}

/**
 * Main detection loop - analyzes frequencies in real-time
 */
function startDetectionLoop() {
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const sampleRate = audioContext.sampleRate;

    detectionInterval = setInterval(() => {
        if (!isListening) return;

        // Get frequency data
        analyserNode.getByteFrequencyData(dataArray);

        // Check for goal signatures
        const detectedGoal = analyzeFrequencies(dataArray, sampleRate);

        // Käytetään handleGoalSound-funktiota, joka hoitaa keston tarkistuksen ja nollauksen
        handleGoalSound(detectedGoal);

    }, 30); // Faster polling for better transient capture
}

/**
 * Analyze frequency spectrum to detect goal sounds
 * @param {Uint8Array} dataArray - Frequency data from analyser
 * @param {number} sampleRate - Audio context sample rate
 * @returns {number|null} - Goal number (1 or 2) or null
 */
function analyzeFrequencies(dataArray, sampleRate) {
    const bufferLength = dataArray.length;

    // Calculate which bins correspond to our target frequencies
    const binWidth = sampleRate / (analyserNode.fftSize);

    const goal1BinStart = Math.floor((GOAL_1_FREQUENCY - FREQUENCY_TOLERANCE) / binWidth);
    const goal1BinEnd = Math.ceil((GOAL_1_FREQUENCY + FREQUENCY_TOLERANCE) / binWidth);

    const goal2BinStart = Math.floor((GOAL_2_FREQUENCY - FREQUENCY_TOLERANCE) / binWidth);
    const goal2BinEnd = Math.ceil((GOAL_2_FREQUENCY + FREQUENCY_TOLERANCE) / binWidth);

    // Find peak intensity in each frequency range (more robust for impact sounds)
    let goal1Intensity = 0;
    let goal2Intensity = 0;

    for (let i = goal1BinStart; i <= goal1BinEnd && i < bufferLength; i++) {
        if (dataArray[i] > goal1Intensity) goal1Intensity = dataArray[i];
    }

    for (let i = goal2BinStart; i <= goal2BinEnd && i < bufferLength; i++) {
        if (dataArray[i] > goal2Intensity) goal2Intensity = dataArray[i];
    }

    // Normalize to 0-1 range
    goal1Intensity /= 255;
    goal2Intensity /= 255;

    // Store for UI monitoring
    currentG1 = goal1Intensity;
    currentG2 = goal2Intensity;

    // Track peaks for fine-tuning
    if (goal1Intensity > peakGoal1) peakGoal1 = goal1Intensity;
    if (goal2Intensity > peakGoal2) peakGoal2 = goal2Intensity;

    // Update Telemetry HUD (Visual Feedback)
    if (hudBarP1 && hudBarP2) {
        // Calculate percentage absolute (0-100%)
        const p1Percent = Math.min(100, goal1Intensity * 100);
        const p2Percent = Math.min(100, goal2Intensity * 100);

        hudBarP1.style.height = `${p1Percent}%`;
        hudBarP2.style.height = `${p2Percent}%`;

        // Update threshold marker position via CSS variable
        const thresholdPct = Math.min(100, DETECTION_THRESHOLD * 100);
        hudBarP1.parentElement.style.setProperty('--threshold', `${thresholdPct}%`);
        hudBarP2.parentElement.style.setProperty('--threshold', `${thresholdPct}%`);
    }

    // Determine which goal (if any) exceeded threshold
    if (goal1Intensity > DETECTION_THRESHOLD && goal1Intensity > goal2Intensity) {
        return 1; // Goal 1 sound detected → Player 2 scores
    } else if (goal2Intensity > DETECTION_THRESHOLD && goal2Intensity > goal1Intensity) {
        return 2; // Goal 2 sound detected → Player 1 scores
    }

    return null;
}

/**
 * Handle detected goal sound with duration and cooldown checks
 * @param {number} goalNumber - Which goal emitted the sound (1 or 2)
 */
function handleGoalSound(goalNumber) {
    const now = Date.now();

    // Jos ääntä ei tunnisteta, nollataan tunnistustila
    if (goalNumber === null) {
        currentDetectedGoal = null;
        detectionStartTime = 0;
        return;
    }

    // Check cooldown period
    if (now - lastDetectionTime < COOLDOWN_MS) {
        return; // Still in cooldown, ignore
    }

    // Track detection duration
    if (currentDetectedGoal !== goalNumber) {
        // New detection started
        currentDetectedGoal = goalNumber;
        detectionStartTime = now;
        return;
    }

    // Same goal detected continuously
    const detectionDuration = now - detectionStartTime;

    if (detectionDuration >= MIN_DURATION_MS) {
        // Valid goal detected!
        confirmGoal(goalNumber);
        lastDetectionTime = now;
        detectionStartTime = 0;
        currentDetectedGoal = null;
    }
}

/**
 * Confirm and register the goal
 * @param {number} goalNumber - Which goal was scored (1 or 2)
 */
function confirmGoal(goalNumber) {
    // Goal numbering logic:
    // If Goal 1 emits sound → Player 2 scored (opponent scored on Player 1)
    // If Goal 2 emits sound → Player 1 scored (opponent scored on Player 2)

    const scoringPlayer = goalNumber === 1 ? 2 : 1;

    // Call global handler if it exists
    if (typeof window.handleGoalDetected === 'function') {
        window.handleGoalDetected(scoringPlayer);
    } else {
        console.warn("window.handleGoalDetected not found. Make sure it's defined in script.js");
    }

    // Visual/audio feedback (optional - can be enhanced)
    playConfirmationSound();
}

/**
 * Play confirmation beep when goal is detected
 */
function playConfirmationSound() {
    try {
        if (!audioContext || audioContext.state === 'closed') return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800; // Confirmation beep
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
        // Silent fail - confirmation sound is not critical
    }
}

/**
 * Play a test sound matching the goal frequency (for debugging/testing)
 * @param {number} goalNumber - 1 or 2
 */
function playTestSound(goalNumber) {
    if (!audioContext) {
        if (!initAudioContext()) return;
    }
    if (audioContext.state === 'suspended') audioContext.resume();

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    const freq = goalNumber === 1 ? GOAL_1_FREQUENCY : GOAL_2_FREQUENCY;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioContext.currentTime);

    gain.gain.setValueAtTime(0, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);

    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.5);

    console.log(`🔊 Playing test sound for Goal ${goalNumber}: ${freq}Hz`);
}

/**
 * Update UI indicator if it exists in the DOM
 */
function updateUIStatus(active) {
    const toggleBtn = document.getElementById('toggle-audio-btn');
    const freqDisplay = document.getElementById('audio-frequency-display');
    const meterWrapper = document.getElementById('audio-meter-wrapper');
    const instantMeter = document.getElementById('audio-meter-container');
    const telemetry = document.getElementById('audio-telemetry');

    if (toggleBtn) {
        toggleBtn.textContent = active ? 'DEACTIVATE' : 'ACTIVATE';
        toggleBtn.style.backgroundColor = active ? '#c62828' : '#333';
    }

    if (freqDisplay) {
        freqDisplay.style.display = active ? 'block' : 'none';
    }

    if (meterWrapper) {
        meterWrapper.style.display = active ? 'block' : 'none';
    }

    if (instantMeter) {
        instantMeter.style.display = active ? 'block' : 'none';
    }

    if (telemetry) {
        telemetry.style.display = active ? 'flex' : 'none';
    }
}

// ============================================================
// SPEECH RECOGNITION FUNCTIONS
// ============================================================

/**
 * Start Web Speech API voice recognition
 * Listens for color words to detect goals
 */
function startVoiceRecognition() {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('🎙️ Speech Recognition not supported in this browser');
        if (typeof window.onVoiceStatusChange === 'function') {
            window.onVoiceStatusChange({ active: false, supported: false, enabled: voiceEnabled });
        }
        return false;
    }

    if (isSpeechActive && speechRecognition) {
        return true; // Already running
    }

    try {
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;       // Keep listening
        speechRecognition.interimResults = true;   // Get partial results for faster response
        speechRecognition.maxAlternatives = 3;     // More alternatives = better chance of catching the word
        speechRecognition.lang = 'en-US';          // Primary language

        speechRecognition.onstart = () => {
            isSpeechActive = true;
            console.log('🎙️ Voice goal detection: ACTIVE');
            if (typeof window.onVoiceStatusChange === 'function') {
                window.onVoiceStatusChange({ active: true, supported: true, enabled: voiceEnabled });
            }
        };

        speechRecognition.onresult = (event) => {
            if (!voiceEnabled) return;

            const now = Date.now();
            // Cooldown check
            if (now - lastSpeechGoalTime < SPEECH_COOLDOWN_MS) return;

            // Check the latest result(s)
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                // Check all alternatives for best matching
                for (let j = 0; j < result.length; j++) {
                    const transcript = result[j].transcript.trim().toLowerCase();
                    const words = transcript.split(/\s+/);

                    // Check each word against our command map
                    for (const word of words) {
                        const cleanWord = word.replace(/[^a-zäöüå]/gi, '').toLowerCase();
                        const player = VOICE_COMMANDS[cleanWord];

                        if (player) {
                            lastSpeechGoalTime = now;
                            console.log(`🎙️ VOICE GOAL! Heard "${cleanWord}" → Player ${player} scores`);

                            // Call global handler (same as acoustic detection)
                            if (typeof window.handleGoalDetected === 'function') {
                                window.handleGoalDetected(player);
                            }

                            // Notify UI about the detected word
                            if (typeof window.onVoiceGoalDetected === 'function') {
                                window.onVoiceGoalDetected(cleanWord, player);
                            }

                            playConfirmationSound();
                            return; // Only one goal per result batch
                        }
                    }
                }
            }
        };

        speechRecognition.onerror = (event) => {
            // 'no-speech' is normal when nobody is talking
            if (event.error === 'no-speech') return;
            // 'aborted' happens on intentional stop
            if (event.error === 'aborted') return;

            console.warn('🎙️ Speech recognition error:', event.error);

            // Auto-restart on recoverable errors
            if (event.error === 'network' || event.error === 'audio-capture') {
                isSpeechActive = false;
                // Retry after a short delay
                setTimeout(() => {
                    if (isListening && voiceEnabled) {
                        startVoiceRecognition();
                    }
                }, 1000);
            }
        };

        speechRecognition.onend = () => {
            isSpeechActive = false;
            console.log('🎙️ Voice recognition ended');

            // Auto-restart if we're still supposed to be listening
            // (Speech API stops after silence periods on some browsers)
            if (isListening && voiceEnabled) {
                setTimeout(() => {
                    if (isListening && voiceEnabled) {
                        try {
                            speechRecognition.start();
                        } catch (e) {
                            // Ignore "already started" errors
                        }
                    }
                }, 300);
            } else {
                if (typeof window.onVoiceStatusChange === 'function') {
                    window.onVoiceStatusChange({ active: false, supported: true, enabled: voiceEnabled });
                }
            }
        };

        speechRecognition.start();
        return true;

    } catch (e) {
        console.error('🎙️ Failed to start speech recognition:', e);
        return false;
    }
}

/**
 * Stop voice recognition
 */
function stopVoiceRecognition() {
    if (speechRecognition) {
        try {
            speechRecognition.abort();
        } catch (e) {
            // Ignore errors on abort
        }
        speechRecognition = null;
    }
    isSpeechActive = false;

    if (typeof window.onVoiceStatusChange === 'function') {
        window.onVoiceStatusChange({ active: false, supported: true, enabled: voiceEnabled });
    }
}

/**
 * Toggle voice recognition on/off independently
 * @param {boolean} enabled
 */
function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
    if (enabled && isListening && !isSpeechActive) {
        startVoiceRecognition();
    } else if (!enabled && isSpeechActive) {
        stopVoiceRecognition();
    }
    return voiceEnabled;
}

/**
 * Get voice recognition status
 */
function getVoiceStatus() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return {
        supported: !!SpeechRecognition,
        active: isSpeechActive,
        enabled: voiceEnabled,
        cooldown: SPEECH_COOLDOWN_MS
    };
}

// ============================================================
// STATUS & CONFIGURATION FUNCTIONS
// ============================================================

/**
 * Get current listening status
 */
function getStatus() {
    return {
        isListening,
        hasMicrophone: microphoneStream !== null,
        voice: getVoiceStatus(),
        settings: {
            goal1Frequency: GOAL_1_FREQUENCY,
            goal2Frequency: GOAL_2_FREQUENCY,
            threshold: DETECTION_THRESHOLD,
            cooldown: COOLDOWN_MS
        },
        debug: {
            peakGoal1: peakGoal1,
            peakGoal2: peakGoal2,
            currentG1: currentG1,
            currentG2: currentG2
        }
    };
}

/**
 * Reset peak tracking
 */
function resetPeaks() {
    peakGoal1 = 0;
    peakGoal2 = 0;
}

/**
 * Update target frequencies
 */
function setFrequencies(f1, f2) {
    if (f1 > 0) GOAL_1_FREQUENCY = f1;
    if (f2 > 0) GOAL_2_FREQUENCY = f2;
    return true;
}

/**
 * Update detection threshold (sensitivity adjustment)
 * @param {number} newThreshold - Value between 0.0 (very sensitive) and 1.0 (less sensitive)
 */
function setThreshold(newThreshold) {
    if (newThreshold >= 0 && newThreshold <= 1) {
        DETECTION_THRESHOLD = newThreshold;
        try {
            localStorage.setItem('subsoccer_audio_threshold', newThreshold);
        } catch (e) { }
        return true;
    }
    return false;
}

// Export functions to window object
window.audioEngine = {
    startListening,
    stopListening,
    getStatus,
    setThreshold,
    setFrequencies,
    resetPeaks,
    playTestSound,
    // Voice recognition
    startVoiceRecognition,
    stopVoiceRecognition,
    setVoiceEnabled,
    getVoiceStatus
};
