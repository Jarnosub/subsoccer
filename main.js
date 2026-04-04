import { initApp } from './auth.js';
import { FLAGS } from './config.js';
import { checkLiveEventParam } from './live-view-service.js';
import './bracket-engine.js';
import './match-service.js';
import { setupGlobalErrorHandling, setupUIListeners, showMatchMode, showPage } from './ui.js';
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

        if (urlParams.get('tab') === 'tournament') {
            showMatchMode('tournament');
        }

        if (typeof window.showAuthPage === 'function' && !localStorage.getItem('sb-ujxmmrsmdwrgcwatdhvx-auth-token')) {
            window.showAuthPage('login');
        }
    } else if (urlParams.get('page') === 'analytics') {
        if (typeof window.showAuthPage === 'function' && !localStorage.getItem('sb-ujxmmrsmdwrgcwatdhvx-auth-token')) {
            window.showAuthPage('login');
        } else {
            setTimeout(() => {
                showPage('analytics');
            }, 500); // Give auth time to init
        }
    }

    applyBranding();
    setupUIListeners();
    initApp();

    // Apply MVP Feature Flags
    if (!FLAGS.ENABLE_EVENTS) {
        const eventsTab = document.getElementById('tab-events');
        if (eventsTab) eventsTab.style.display = 'none';

        const hostEventBtn = document.getElementById('btn-host-event');
        if (hostEventBtn) hostEventBtn.style.display = 'none';
    }

    if (!FLAGS.ENABLE_PRO_MODE) {
        const controlRoomBtn = document.querySelector('button[onclick*="control-room.html"]');
        if (controlRoomBtn) controlRoomBtn.style.display = 'none';
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}