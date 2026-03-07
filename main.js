import { initApp } from './auth.js';
import { checkLiveEventParam } from './live-view-service.js';
import './bracket-engine.js';
import './match-service.js';
import { setupGlobalErrorHandling, setupUIListeners } from './ui.js';
import { applyBranding } from './branding-service.js';
import { checkQRJoinParam } from './qr-lobby.js';
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
    checkQRJoinParam();

    // UI Enhancements for Tournament flow
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('page') === 'tournament') {
        const authMsg = document.getElementById('tour-auth-message');
        if (authMsg) authMsg.style.display = 'block';

        const guestSection = document.getElementById('guest-login-section');
        if (guestSection) guestSection.style.display = 'none';
    }

    applyBranding();
    setupUIListeners();
    initApp();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}