import { initApp } from './auth.js';
import { checkLiveEventParam } from './live-view-service.js';
import './bracket-engine.js';
import './match-service.js';
import { setupGlobalErrorHandling, setupUIListeners, applyBranding } from './ui.js';
import './script.js';
import './tournament.js';
import './quick-match.js';
import './map.js';
import './game-service.js';
import './audio-engine.js';
import './stats-service.js';
import './card-generator.js';
import './sound-effects.js';
import './live-view-service.js';

// Käynnistä sovellus kun sivu on ladattu
const start = () => {
    setupGlobalErrorHandling();
    checkLiveEventParam();
    applyBranding();
    setupUIListeners();
    initApp();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}