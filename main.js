import { initApp } from './auth.js';
import { checkLiveEventParam } from './events.js';
import './ui.js';
import './script.js';
import './tournament.js';
import './audio-engine.js';
import './sound-effects.js';

console.log('🚀 Subsoccer App Starting...');

// Käynnistä sovellus kun sivu on ladattu
const start = () => {
    console.log('📱 DOM Ready - Initializing App...');
    checkLiveEventParam();
    initApp();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}