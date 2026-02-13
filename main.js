import { initApp } from './auth.js';
import './ui.js';
import './events.js';
import './script.js';
import './audio-engine.js';
import './sound-effects.js';

console.log('🚀 Subsoccer App Starting...');

// Käynnistä sovellus kun sivu on ladattu
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});