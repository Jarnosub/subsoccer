// ============================================================
// SUBSOCCER SOUND EFFECTS SYSTEM
// Handles goal sounds and crowd cheers
// ============================================================

class SoundEffects {
    constructor() {
        this.sounds = {};
        this.enabled = true;
        this.volume = 0.7; // 0.0 to 1.0
        
        // Initialize sounds
        this.initSounds();
    }
    
    /**
     * Initialize sound effects
     * These can be replaced with actual audio files in sounds/ folder
     */
    initSounds() {
        // For now, we'll use Web Audio API to create simple sounds
        // You can replace these with actual audio files later
        this.audioContext = null;
        
        // Check if browser supports Web Audio API
        if (window.AudioContext || window.webkitAudioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }
    
    /**
     * Load external audio file (MP3, WAV, etc.)
     * @param {string} name - Sound name (e.g., 'goal', 'crowd')
     * @param {string} url - Path to audio file
     */
    loadSound(name, url) {
        const audio = new Audio(url);
        audio.volume = this.volume;
        audio.preload = 'auto';
        this.sounds[name] = audio;
        console.log(`🔊 Loaded sound: ${name} from ${url}`);
    }
    
    /**
     * Play a pre-loaded sound
     * @param {string} name - Sound name
     */
    playSound(name) {
        if (!this.enabled) return;
        
        if (this.sounds[name]) {
            // Clone the audio to allow overlapping plays
            const sound = this.sounds[name].cloneNode();
            sound.volume = this.volume;
            sound.play().catch(e => console.log('Sound play failed:', e));
        } else {
            console.warn(`Sound not found: ${name}`);
        }
    }
    
    /**
     * Play goal sound effect
     */
    playGoalSound() {
        if (this.sounds['goal']) {
            this.playSound('goal');
        } else {
            // Fallback: synthesize goal sound
            this.synthesizeGoalSound();
        }
    }
    
    /**
     * Play crowd cheer sound
     */
    playCrowdCheer() {
        if (this.sounds['crowd']) {
            this.playSound('crowd');
        } else {
            // Fallback: synthesize crowd cheer
            this.synthesizeCrowdCheer();
        }
    }
    
    /**
     * Synthesize a goal sound using Web Audio API
     * Creates an exciting "goal horn" effect
     */
    synthesizeGoalSound() {
        if (!this.audioContext || !this.enabled) return;
        
        const now = this.audioContext.currentTime;
        
        // Create oscillator for horn sound
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Goal horn: deep powerful tone
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now); // A3
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
        
        // Volume envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        
        osc.start(now);
        osc.stop(now + 0.5);
        
        // Add a celebratory beep sequence
        setTimeout(() => this.playBeepSequence(), 200);
    }
    
    /**
     * Play a celebratory beep sequence
     */
    playBeepSequence() {
        if (!this.audioContext || !this.enabled) return;
        
        const beeps = [
            { freq: 523, time: 0 },      // C5
            { freq: 659, time: 0.15 },   // E5
            { freq: 784, time: 0.3 }     // G5
        ];
        
        const now = this.audioContext.currentTime;
        
        beeps.forEach(beep => {
            const osc = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            osc.frequency.value = beep.freq;
            osc.type = 'sine';
            
            const startTime = now + beep.time;
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(this.volume * 0.2, startTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
            
            osc.start(startTime);
            osc.stop(startTime + 0.15);
        });
    }
    
    /**
     * Synthesize crowd cheer sound
     * Creates a "roar" effect using filtered noise
     */
    synthesizeCrowdCheer() {
        if (!this.audioContext || !this.enabled) return;
        
        const now = this.audioContext.currentTime;
        const duration = 2.0;
        
        // Create noise buffer
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill with noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        // Create source
        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;
        
        // Filter to make it sound like crowd
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 1;
        
        // Gain envelope
        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.15, now + 0.1);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.15, now + 1.0);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);
        
        // Connect nodes
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        noise.start(now);
        noise.stop(now + duration);
        
        // Add some high-pitched cheers
        this.addCheerAccents(now);
    }
    
    /**
     * Add high-pitched accent sounds to crowd cheer
     */
    addCheerAccents(startTime) {
        if (!this.audioContext) return;
        
        const accents = [
            { freq: 800, time: 0.3 },
            { freq: 1000, time: 0.6 },
            { freq: 900, time: 1.0 },
            { freq: 1100, time: 1.3 }
        ];
        
        accents.forEach(accent => {
            const osc = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            osc.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            osc.type = 'sine';
            osc.frequency.value = accent.freq;
            
            const time = startTime + accent.time;
            gainNode.gain.setValueAtTime(0, time);
            gainNode.gain.linearRampToValueAtTime(this.volume * 0.1, time + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
            
            osc.start(time);
            osc.stop(time + 0.3);
        });
    }
    
    /**
     * Set volume (0.0 to 1.0)
     */
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
        Object.values(this.sounds).forEach(sound => {
            if (sound.volume !== undefined) {
                sound.volume = this.volume;
            }
        });
    }
    
    /**
     * Enable/disable all sounds
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    /**
     * Toggle sounds on/off
     */
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// Initialize global sound effects system
const soundEffects = new SoundEffects();

// Auto-load sounds if files exist
// Automatically loads sounds/goal.mp3 and sounds/crowd.mp3 if available
// Falls back to synthesized sounds if files not found
try {
    soundEffects.loadSound('goal', 'sounds/goal.mp3');
    soundEffects.loadSound('crowd', 'sounds/crowd.mp3');
    console.log("🔊 Custom sound files loaded");
} catch (e) {
    console.log("🔊 Using synthesized sounds (custom files not found)");
}

// Export to window
window.soundEffects = soundEffects;

console.log("🔊 Sound Effects System loaded");
