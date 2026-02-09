// ============================================================
// SUBSOCCER AUDIO ENGINE - Acoustic Goal Detection
// Patented Technology: Dual-frequency goal detection system
// ============================================================

// Audio context and analyzer nodes
let audioContext = null;
let analyserNode = null;
let microphoneStream = null;
let sourceNode = null;
let isListening = false;
let detectionInterval = null;

// Goal-specific audio signatures (Hz)
const GOAL_1_FREQUENCY = 2000; // Player 1's goal emits 2000 Hz → Player 2 scores
const GOAL_2_FREQUENCY = 3500; // Player 2's goal emits 3500 Hz → Player 1 scores
const FREQUENCY_TOLERANCE = 200; // ±200 Hz detection window
const DETECTION_THRESHOLD = 0.65; // Sensitivity (0.0 - 1.0), higher = less sensitive
const MIN_DURATION_MS = 100; // Minimum sound duration to avoid false positives
const COOLDOWN_MS = 1500; // Cooldown between goal detections

// Detection state
let lastDetectionTime = 0;
let detectionStartTime = 0;
let currentDetectedGoal = null;

/**
 * Initialize audio context (must be called after user interaction)
 */
function initAudioContext() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
        console.log("Already listening");
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

        // Request microphone access
        const constraints = {
            audio: {
                echoCancellation: false, // We want to hear the goal sounds clearly
                noiseSuppression: false,
                autoGainControl: false
            }
        };

        microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
        sourceNode = audioContext.createMediaStreamSource(microphoneStream);
        sourceNode.connect(analyserNode);

        isListening = true;
        lastDetectionTime = 0;
        detectionStartTime = 0;
        currentDetectedGoal = null;

        // Start frequency analysis loop
        startDetectionLoop();

        console.log("🎙️ Acoustic goal detection ACTIVE");
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

    // Stop microphone stream
    if (microphoneStream) {
        microphoneStream.getTracks().forEach(track => track.stop());
        microphoneStream = null;
    }

    // Close audio context (optional, can be reused)
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
        analyserNode = null;
    }

    isListening = false;
    console.log("🎙️ Acoustic goal detection STOPPED");
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

        if (detectedGoal) {
            handleGoalSound(detectedGoal);
        } else {
            // Reset if no detection
            currentDetectedGoal = null;
            detectionStartTime = 0;
        }

    }, 50); // Check every 50ms
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

    // Calculate average intensity in each frequency range
    let goal1Intensity = 0;
    let goal2Intensity = 0;
    
    for (let i = goal1BinStart; i <= goal1BinEnd && i < bufferLength; i++) {
        goal1Intensity += dataArray[i];
    }
    goal1Intensity /= (goal1BinEnd - goal1BinStart + 1);
    
    for (let i = goal2BinStart; i <= goal2BinEnd && i < bufferLength; i++) {
        goal2Intensity += dataArray[i];
    }
    goal2Intensity /= (goal2BinEnd - goal2BinStart + 1);

    // Normalize to 0-1 range
    goal1Intensity /= 255;
    goal2Intensity /= 255;

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
    
    console.log(`🚨 GOAL DETECTED! Goal ${goalNumber} emitted sound → Player ${scoringPlayer} scores!`);

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
 * Get current listening status
 */
function getStatus() {
    return {
        isListening,
        hasMicrophone: microphoneStream !== null,
        settings: {
            goal1Frequency: GOAL_1_FREQUENCY,
            goal2Frequency: GOAL_2_FREQUENCY,
            threshold: DETECTION_THRESHOLD,
            cooldown: COOLDOWN_MS
        }
    };
}

/**
 * Update detection threshold (sensitivity adjustment)
 * @param {number} newThreshold - Value between 0.0 (very sensitive) and 1.0 (less sensitive)
 */
function setThreshold(newThreshold) {
    if (newThreshold >= 0 && newThreshold <= 1) {
        DETECTION_THRESHOLD = newThreshold;
        console.log(`Sensitivity adjusted: ${newThreshold}`);
        return true;
    }
    return false;
}

// Export functions to window object
window.audioEngine = {
    startListening,
    stopListening,
    getStatus,
    setThreshold
};

console.log("🎵 Subsoccer Audio Engine loaded - Patented acoustic goal detection ready");
