import { state, _supabase, subscribe, isAdmin, APP_VERSION, ENABLE_EVENTS, KIOSK_MODE } from './config.js';
import { applyBranding, injectFooterLink } from './branding-service.js';
import { CardGenerator } from './card-generator.js';
import { showNotification, showLoading, hideLoading, handleAsync, showModal, closeModal } from './ui-utils.js';
import { handleSearch, addP, directAdd } from './script.js';
import { fetchLB, fetchHist } from './stats-service.js';
import { fetchMyGames, cancelEdit, registerGame, updateGame, viewOwnershipRequests } from './game-service.js';
import { fetchPublicGamesMap, initGameMap, searchPublicMap, filterMap, flyToLocation, searchLocation } from './map.js';
import {
    loadEventsPage, viewTournamentBracket,
    finishEventTournament, closeBracketModal, viewTournamentParticipants,
    showCreateEventForm, viewEventDetails, editTournament, deleteTournament, unregisterFromTournament,
    registerForTournament, showCreateTournamentForm, editEvent, deleteEvent, closeEventModal,
    addParticipantFromSearch, removeTournamentParticipant, selectParticipantFromDropdown, createTournament,
    closeTournamentForm, saveTournamentEdit, clearEventImage, updateEventForm, handleParticipantSearch,
    hideCreateEventForm, clearBrandLogo, previewBrandLogo, previewEventImage, createNewEvent, closeEmailPrompt, saveEmailAndRegister,
    addModerator, removeModerator, searchModerators, shareTournamentLink
} from './events-v3-final.js';
import {
    handleQuickSearch, startQuickMatch, clearQuickMatchPlayers,
    handleProModeClick, toggleAudioDetection, acceptRulesAndStart,
    addManualGoal, exitProMode, undoLastGoal, resetProMatch, initProModeUI, initClaimResult, toggleSoundEffects, selectQuickPlayer, saveClaimedResult, cancelClaimResult, closeVictoryOverlay
} from './quick-match.js';
import { shareLiveEventLink } from './live-view-service.js';
import { saveProfile, previewAvatarFile, populateCountries } from './auth.js';
import { startTournament, advanceRound, saveTour, replayTournament, populateEventDropdown } from './tournament.js';
import { showPartnerLinkGenerator, viewAllUsers, downloadSystemLogs, resetGlobalLeaderboard } from './moderator-service.js';

// Swipe-toiminnallisuus muuttujat (siirretty alkuun ReferenceErrorin välttämiseksi)
let touchStartX = null;
let touchEndX = 0;
const pages = ['profile', 'tournament', 'events', 'map', 'leaderboard', 'moderator'];
let currentPageIndex = 0; // Aloitetaan profile/dashboard-sivulta

/**
 * Shows the victory animation overlay.
 * @param {string} winnerName - Winner's name
 * @param {number|string} newElo - New ELO score
 * @param {number|string} eloGain - ELO change
 */
export function showVictoryAnimation(winnerName, newElo, eloGain) {
    const overlay = document.getElementById('victory-overlay');
    if (!overlay) return;

    const nameEl = document.getElementById('victory-player-name');
    const eloEl = document.getElementById('victory-elo-count');
    const gainEl = document.getElementById('victory-elo-gain');

    if (nameEl) nameEl.innerText = winnerName || 'Winner';
    if (eloEl) eloEl.innerText = newElo || '';
    if (gainEl) {
        const val = parseInt(eloGain);
        if (!isNaN(val)) {
            const prefix = val >= 0 ? '+' : '';
            gainEl.innerText = `${prefix}${val} POINTS`;
        }
    }

    overlay.style.display = 'flex';
}

/**
 * Changes the active page (section) and updates the navigation tabs.
 * @param {string} p - The ID of the page (without 'section-' prefix).
 */
export function showPage(p) {
    state.currentPage = p;
}

/**
 * Manages authentication page states and app content visibility.
 * @param {string} mode - 'login', 'signup' or 'app'
 */
export function showAuthPage(mode = 'login') {
    const authPage = document.getElementById('auth-page');
    const appContent = document.getElementById('app-content');
    const navTabs = document.getElementById('nav-tabs');
    const menuBtn = document.getElementById('menu-toggle-btn');

    if (mode === 'app') {
        if (authPage) authPage.style.display = 'none';
        if (appContent) appContent.style.display = 'flex';
        if (navTabs) navTabs.style.display = 'flex';
        // Ensure auth page doesn't hide other UI elements
        return;
    }

    if (authPage) authPage.style.display = 'block';
    if (appContent) appContent.style.display = 'none';
    if (navTabs) navTabs.style.display = 'none';
    if (menuBtn) menuBtn.style.display = 'none';

    if (mode === 'signup') {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
    } else {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('signup-form').style.display = 'none';
    }
}

window.showAuthPage = showAuthPage;

function updatePageUI(p) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('section-' + p).classList.add('active');

    // FIX: Hide the sticky save button when leaving the tournament view
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn && saveBtn.classList.contains('sticky-bottom-action')) {
        saveBtn.style.display = (p === 'tournament') ? 'block' : 'none';
    }

    // Map sub-pages to main tabs
    let tabId = 'tab-' + p;
    if (p === 'map' || p === 'leaderboard' || p === 'history') {
        tabId = 'tab-profile'; // Map and Rank are now under Profile context
    }

    const t = document.getElementById(tabId);
    if (t) {
        t.classList.add('active');
    }

    // Update currentPageIndex for swipe navigation
    const pageIdx = pages.indexOf(p);
    if (pageIdx !== -1) {
        currentPageIndex = pageIdx;
    }


    // Funktiot, jotka suoritetaan sivun vaihdon yhteydessä
    if (p === 'profile') {
        cancelEditProfile(); // Piilottaa lomakkeen aina kun välilehti vaihtuu
        const profileGamesUi = document.getElementById('profile-games-ui');
        if (profileGamesUi)
            profileGamesUi.style.display = 'none'; // Piilotettu oletuksena, näytetään vain muokkaustilassa
        if (document.getElementById('profile-dashboard-ui'))
            document.getElementById('profile-dashboard-ui').style.display = 'block';
        loadUserProfile();
        if (typeof updateProfileCard === 'function') updateProfileCard();
    }
    if (p === 'leaderboard') fetchLB();
    if (p === 'history') fetchHist();
    if (p === 'games') fetchMyGames();
    if (p !== 'games') cancelEdit();
    if (p !== 'profile') cancelEditProfile();
    if (p === 'map') fetchPublicGamesMap();
    if (p === 'events') loadEventsPage();

    // Alustaa kartan 'games'-sivulla
    if (p === 'games') {
        setTimeout(() => {
            if (!state.gameMap) initGameMap();
            else state.gameMap.invalidateSize();
        }, 200);
    }
}

/**
 * Täyttää turnauksen pelipöytien pudotusvalikon.
 */
export function populateGameSelect() {
    const sel = document.getElementById('tournament-game-select');
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select Game Table</option>';
    state.allGames.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.game_name;
        sel.appendChild(opt);
    });
}

/**
 * Vaihtaa Quick Match ja Tournament osioiden välillä.
 */
export function showMatchMode(mode) {
    const quickSection = document.getElementById('quick-match-section');
    const tournamentSection = document.getElementById('tournament-section');
    const quickBtn = document.getElementById('btn-quick-match-mode');
    const tournamentBtn = document.getElementById('btn-tournament-mode');
    const tourIcon = document.getElementById('tournament-icon-status');

    if (mode === 'quick') {
        quickSection.style.display = 'block';
        tournamentSection.style.display = 'none';

        // Quick Match - active
        quickBtn.style.background = 'linear-gradient(135deg, #E30613 0%, #c00510 100%)';
        quickBtn.style.color = '#fff';
        quickBtn.style.border = 'none';
        quickBtn.style.boxShadow = 'none';

        // Tournament - inactive
        tournamentBtn.style.background = '#1a1a1a';
        tournamentBtn.style.color = '#888';
        tournamentBtn.style.border = '2px solid #333';
        tournamentBtn.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.3)'; // Keltainen hohde
        if (tourIcon) tourIcon.style.color = '#666';
    } else {
        quickSection.style.display = 'none';
        tournamentSection.style.display = 'block';

        // Quick Match - inactive
        quickBtn.style.background = '#1a1a1a';
        quickBtn.style.color = '#888';
        quickBtn.style.border = '2px solid #333';
        quickBtn.style.boxShadow = '0 0 15px rgba(227, 6, 19, 0.3)'; // Punainen hohde

        // Tournament - active (Kultainen teema)
        tournamentBtn.style.background = 'linear-gradient(135deg, #FFD700 0%, #d4af37 100%)';
        tournamentBtn.style.color = '#000';
        tournamentBtn.style.border = 'none';
        tournamentBtn.style.boxShadow = 'none';
        if (tourIcon) tourIcon.style.color = '#000'; // Ikoni mustaksi kultaa vasten
        populateEventDropdown();
    }
}

/**
 * Näyttää tai piilottaa turnauksen lisäasetukset.
 */
export function toggleTournamentMode() {
    const el = document.getElementById('advanced-tour-settings');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/**
 * Swipe-toiminnallisuus välilehtien vaihtamiseen
 */
function handleSwipe() {
    const swipeThreshold = 50; // Minimimatka pikseleinä
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Swipe vasemmalle -> seuraava sivu
            if (currentPageIndex < pages.length - 1) {
                currentPageIndex++;
                showPage(pages[currentPageIndex]);
            }
        } else {
            // Swipe oikealle -> edellinen sivu
            if (currentPageIndex > 0) {
                currentPageIndex--;
                showPage(pages[currentPageIndex]);
            }
        }
    }
}

function initSwipeListener() {
    const appContent = document.getElementById('app-content');
    if (!appContent) return;

    appContent.addEventListener('touchstart', (e) => {
        // Estä sivun vaihto jos käyttäjä on kartan päällä tai elementissä jossa on 'no-swipe'
        if (e.target.closest('.leaflet-container') || e.target.closest('.no-swipe') || e.target.closest('input[type="range"]')) {
            touchStartX = null;
            return;
        }
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    appContent.addEventListener('touchend', (e) => {
        if (touchStartX === null) return;
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
}

// Alusta swipe kun DOM on valmis
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSwipeListener);
} else {
    initSwipeListener();
}

/**
 * Lataa ja näyttää käyttäjän profiilin tiedot
 */
export async function loadUserProfile() {
    if (!state.user || !state.user.id) return;

    // Päivitä avatar
    const avatarEl = document.getElementById('profile-avatar-display');
    const previewEl = document.getElementById('avatar-preview');
    if (avatarEl && state.user.avatar_url) {
        avatarEl.src = state.user.avatar_url;
    }
    if (previewEl && state.user.avatar_url) {
        previewEl.src = state.user.avatar_url;
    }

    // Päivitä nimi
    const usernameEl = document.getElementById('profile-username');
    if (usernameEl) {
        usernameEl.innerText = state.user.username || 'Player';
    }

    // Päivitä nimi headeriin
    const headerNameEl = document.getElementById('user-display-name');
    if (headerNameEl) {
        headerNameEl.innerText = state.user.username || 'Player';
    }

    // Päivitä maa
    const countryEl = document.getElementById('profile-country');
    if (countryEl && state.user.country) {
        countryEl.innerText = '🌍 ' + state.user.country.toUpperCase();
    } else if (countryEl) {
        countryEl.innerText = '🌍 Set your country';
    }

    // Päivitä ELO
    const eloEl = document.getElementById('profile-elo');
    if (eloEl) {
        eloEl.innerText = state.user.elo || 1000;
    }

    // Hae otteluiden määrä
    const matchesEl = document.getElementById('profile-matches');
    if (matchesEl && state.user.id !== 'guest') {
        try {
            const { count } = await _supabase
                .from('matches')
                .select('*', { count: 'exact', head: true })
                .or(`player1.eq.${state.user.username}, player2.eq.${state.user.username} `);
            matchesEl.innerText = count || 0;
        } catch (e) {
            matchesEl.innerText = '0';
        }
    }

    // Lataa pelit
    fetchMyGames();
}

/**
 * Näyttää profiilin muokkauslomakkeen
 */
export function showEditProfile() {
    const fields = document.getElementById('profile-edit-fields');
    if (!fields) return;
    fields.style.display = 'block';
    document.getElementById('profile-dashboard-ui').style.display = 'none'; // Piilota napit

    // Näytetään pelipöydät vain muokkaustilassa
    const profileGamesUi = document.getElementById('profile-games-ui');
    if (profileGamesUi) profileGamesUi.style.display = state.user?.id === 'guest' ? 'none' : 'block';

    populateCountries();

    // Haetaan arvot state.userista (joka on nyt ladattu auth.js:ssä)
    const mapping = {
        'edit-full-name': state.user.full_name,
        'edit-email': state.user.email,
        'edit-phone': state.user.phone,
        'edit-city': state.user.city,
        'country-input': state.user.country,
        'edit-password': '' // Tyhjennetään salasanakenttä aina avattaessa
    };

    Object.entries(mapping).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    });
}

/**
 * Piilottaa profiilin muokkauslomakkeen
 */
export function cancelEditProfile() {
    const editFields = document.getElementById('profile-edit-fields');
    if (editFields) {
        editFields.style.display = 'none';
    }
    document.getElementById('profile-dashboard-ui').style.display = 'block'; // Tuo napit takaisin

    // Piilotetaan pelipöydät kun poistutaan muokkaustilasta
    const profileGamesUi = document.getElementById('profile-games-ui');
    if (profileGamesUi) profileGamesUi.style.display = 'none';
}

/**
 * Globaali virheidenhallinta
 */
export function setupGlobalErrorHandling() {
    window.onerror = function (message, source, lineno, colno, error) {
        console.error("🚀 Subsoccer Global Error:", message, error);
        // Estetään spämmäys, näytetään vain kriittiset
        if (message.includes('Script error') || message.includes('ResizeObserver')) return false;
        showNotification("An unexpected error occurred. Please refresh if the app behaves strangely.", "error");
        return false;
    };

    window.onunhandledrejection = function (event) {
        console.error("🚀 Subsoccer Promise Rejection:", event.reason);
        const msg = event.reason?.message || "Network or Database error occurred.";
        if (msg.includes('fetch')) showNotification("Connection lost. Please check your internet.", "error");
        else showNotification(msg, "error");
    };
}

/**
 * Alustaa 3D-tilt ja kiiltoefektin kortille
 */
export function initTiltEffect(card) {
    if (!card) return;

    // Lisää kiilto-elementti jos sitä ei ole
    if (!card.querySelector('.card-shine')) {
        const shine = document.createElement('div');
        shine.className = 'card-shine';
        card.appendChild(shine);
    }

    let ticking = false;

    const handleMove = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        if (!ticking) {
            window.requestAnimationFrame(() => {
                const rect = card.getBoundingClientRect();
                const x = clientX - rect.left;
                const y = clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = (centerY - y) / 12;
                const rotateY = (x - centerX) / 12;

                card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
                card.style.setProperty('--x', `${x} px`);
                card.style.setProperty('--y', `${y} px`);

                ticking = false;
            });
            ticking = true;
        }
    };

    const handleReset = () => {
        card.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    };

    card.addEventListener('mousemove', handleMove);
    card.addEventListener('mouseleave', handleReset);
    card.addEventListener('touchmove', handleMove, { passive: true });
    card.addEventListener('touchend', handleReset);
}

/**
 * Vaihtaa vaalean ja tumman teeman välillä
 */
export function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('subsoccer-theme', isLight ? 'light' : 'dark');
    if (typeof updateProfileCard === 'function') updateProfileCard();
}

export function toggleSettingsMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('settings-menu');
    if (menu) menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
}

export function toggleSensorTools() {
    const panel = document.getElementById('pro-mode-audio-panels');
    if (panel) {
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            showNotification('Sensor tools activated', 'success');
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

/**
 * Setup all UI event listeners to remove inline onclicks.
 */
let isUIInitialized = false;
export function setupUIListeners() {
    if (isUIInitialized) return;
    isUIInitialized = true;

    // FORCE REMOVE INDICATORS ON STARTUP
    const audioInd = document.getElementById('audio-indicator');
    if (audioInd) audioInd.remove();

    // RESTORE CONNECTION WATCHDOG UI
    // Ensure the connection dot exists so script.js can use it to show offline status
    let connDot = document.getElementById('conn-dot');
    if (!connDot) {
        connDot = document.createElement('div');
        connDot.id = 'conn-dot';
        connDot.style.cssText = "position:fixed; top:15px; left:15px; width:10px; height:10px; background:var(--sub-red); border-radius:50%; z-index:20000; display:none; box-shadow:0 0 10px var(--sub-red);";
        document.body.appendChild(connDot);

        // Add CSS for offline state if needed
        const style = document.createElement('style');
        style.innerHTML = `.dot-offline { display:block !important; animation: pulse-red 1s infinite; } @keyframes pulse-red { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`;
        document.head.appendChild(style);
    }

    const thresholdLine = document.getElementById('audio-threshold-line');
    if (thresholdLine) thresholdLine.remove();

    // Logo link to official site
    const logo = document.querySelector('.main-logo');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.title = 'Visit subsoccer.com';
        logo.addEventListener('click', () => window.open('https://www.subsoccer.com', '_blank'));

        // BETA: Inject Beta Label under logo
        // Remove old badges to ensure clean state and centering
        document.querySelectorAll('.beta-badge-container').forEach(el => el.remove());

        const betaBadge = document.createElement('div');
        betaBadge.className = 'beta-badge-container';
        betaBadge.style.cssText = "display:flex; justify-content:center; width:100%; margin-top:5px; margin-bottom:15px;";
        betaBadge.innerHTML = `
            <span class="beta-label" style="color:var(--sub-gold); font-size:0.7rem; letter-spacing:2px; font-weight:bold;">${APP_VERSION}</span>
        `;
        logo.after(betaBadge);
    }

    injectFooterLink();

    // BETA: Inject Feedback Button
    // Poistetaan kaikki vanhat napit varmuuden vuoksi (estää tuplat)
    document.querySelectorAll('#beta-feedback-btn').forEach(el => el.remove());

    // Poistetaan vanha Google Form -nappi jos sellainen on
    document.querySelectorAll('a[href*="docs.google.com/forms"]').forEach(el => el.remove());

    // Poistetaan myös mahdolliset muut "Feedback" napit tekstin perusteella (esim. keltainen nappi)
    document.querySelectorAll('a, button').forEach(el => {
        if (el.id !== 'beta-feedback-btn' && el.textContent && el.textContent.toUpperCase().includes('FEEDBACK')) {
            el.remove();
        }
    });

    const feedbackBtn = document.createElement('button');
    feedbackBtn.id = 'beta-feedback-btn';
    // Removed fixed positioning, placed in footer flow
    feedbackBtn.style.cssText = "display:block; margin:15px auto 0 auto; width:auto; padding:8px 20px; font-size:0.7rem; background:transparent; color:#fff; border:1px solid rgba(255,255,255,0.3); border-radius:30px; cursor:pointer; font-family:var(--sub-name-font); letter-spacing:1px; text-transform:uppercase; transition:all 0.2s;";
    feedbackBtn.innerHTML = '<i class="fa fa-comment-dots" style="margin-right:6px;"></i> FEEDBACK';

    feedbackBtn.onmouseover = () => { feedbackBtn.style.background = 'rgba(255,255,255,0.1)'; feedbackBtn.style.borderColor = '#fff'; };
    feedbackBtn.onmouseout = () => { feedbackBtn.style.background = 'transparent'; feedbackBtn.style.borderColor = 'rgba(255,255,255,0.3)'; };

    feedbackBtn.onclick = async () => {
        const msg = prompt("Describe the issue or suggestion:");
        if (msg) {
            try {
                showNotification("Sending...", "info");
                await _supabase.from('feedback').insert([{
                    message: msg,
                    user_id: state.user?.id || 'guest',
                    page: state.currentPage || 'unknown'
                }]);
                showNotification("Thanks for your feedback!", "success");
            } catch (e) {
                console.error(e);
                showNotification("Error sending feedback", "error");
            }
        }
    };

    const footer = document.getElementById('subsoccer-footer-link');
    if (footer) {
        footer.appendChild(feedbackBtn);
    }

    // Navigation Tabs
    document.querySelectorAll('.nav-tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const page = tab.getAttribute('data-page');
            if (page) showPage(page);
        });
    });

    // Settings Menu
    document.getElementById('menu-toggle-btn')?.addEventListener('click', (e) => toggleSettingsMenu(e));
    document.getElementById('menu-item-leaderboard')?.addEventListener('click', (e) => {
        showPage('leaderboard');
        toggleSettingsMenu(e);
    });
    document.getElementById('menu-item-map')?.addEventListener('click', (e) => {
        showPage('map');
        toggleSettingsMenu(e);
    });
    document.getElementById('menu-item-edit-profile')?.addEventListener('click', (e) => {
        showPage('profile');
        showEditProfile();
        toggleSettingsMenu(e);
    });
    document.getElementById('menu-item-shop')?.addEventListener('click', (e) => {
        showCardShop();
        toggleSettingsMenu(e);
    });
    document.getElementById('menu-item-sensors')?.addEventListener('click', (e) => {
        toggleSensorTools();
        toggleSettingsMenu(e);
    });
    document.getElementById('menu-item-moderator')?.addEventListener('click', (e) => {
        showPage('moderator');
        toggleSettingsMenu(e);
    });
    document.getElementById('btn-mod-partner-gen')?.addEventListener('click', () => {
        showPartnerLinkGenerator();
    });
    document.getElementById('btn-mod-view-users')?.addEventListener('click', () => {
        viewAllUsers();
    });
    document.getElementById('btn-mod-download-logs')?.addEventListener('click', () => {
        downloadSystemLogs();
    });
    document.getElementById('btn-mod-reset-lb')?.addEventListener('click', () => {
        resetGlobalLeaderboard();
    });
    document.getElementById('sound-toggle-btn')?.addEventListener('click', (e) => {
        toggleSoundEffects();
        toggleSettingsMenu(e);
    });

    // Victory Overlay
    document.getElementById('btn-victory-new-game')?.addEventListener('click', closeVictoryOverlay);
    document.getElementById('btn-victory-end-game')?.addEventListener('click', closeVictoryOverlay);

    // Profile Section
    document.getElementById('avatar-file-input')?.addEventListener('change', (e) => previewAvatarFile(e.target));
    document.getElementById('btn-save-profile')?.addEventListener('click', (e) => saveProfile(e));
    document.getElementById('btn-cancel-edit-profile')?.addEventListener('click', cancelEditProfile);
    document.getElementById('btn-profile-leaderboard')?.addEventListener('click', () => showPage('leaderboard'));
    document.getElementById('btn-dashboard-play')?.addEventListener('click', () => showPage('tournament'));
    document.getElementById('btn-dashboard-arena')?.addEventListener('click', () => showPage('map'));
    document.getElementById('btn-profile-history')?.addEventListener('click', () => showPage('history'));
    document.getElementById('btn-profile-register-game')?.addEventListener('click', () => showPage('games'));
    document.getElementById('menu-item-concept')?.addEventListener('click', () => {
        showAppConcept();
        document.getElementById('settings-menu').style.display = 'none';
    });

    // Games Section
    document.getElementById('btn-search-location')?.addEventListener('click', () => searchLocation());
    document.getElementById('btn-reg-game')?.addEventListener('click', () => registerGame());
    document.getElementById('btn-update-game')?.addEventListener('click', () => updateGame());
    document.getElementById('btn-cancel-edit-game')?.addEventListener('click', () => cancelEdit());
    document.getElementById('btn-view-transfer-requests')?.addEventListener('click', () => viewOwnershipRequests());

    // Visibility Selector Logic
    document.querySelectorAll('.visibility-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-value');
            document.getElementById('game-visibility-input').value = val;

            // Update active state
            document.querySelectorAll('.visibility-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update description
            const desc = document.getElementById('visibility-desc');
            if (val === 'public') desc.innerText = "Visible to all players on the global map.";
            else if (val === 'private') desc.innerText = "Hidden from others, but visible to you on your personal map.";
            else desc.innerText = "Completely hidden from the map. Only visible in your 'My Game Tables' list.";
        });
    });

    // Map Section
    document.getElementById('btn-search-public-map')?.addEventListener('click', () => searchPublicMap());

    // Quick Match Section
    document.getElementById('btn-quick-match-mode')?.addEventListener('click', () => showMatchMode('quick'));
    document.getElementById('btn-tournament-mode')?.addEventListener('click', () => showMatchMode('tournament'));
    document.getElementById('p1-quick-search')?.addEventListener('input', (e) => handleQuickSearch(e.target, 'p1'));
    document.getElementById('p2-quick-search')?.addEventListener('input', (e) => handleQuickSearch(e.target, 'p2'));
    document.getElementById('btn-clear-quick-players')?.addEventListener('click', () => clearQuickMatchPlayers());
    document.getElementById('start-quick-match')?.addEventListener('click', () => startQuickMatch());

    // Tournament Section
    document.getElementById('add-p-input')?.addEventListener('input', (e) => handleSearch(e.target.value));
    document.getElementById('add-p-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addP();
    });
    document.getElementById('btn-add-player')?.addEventListener('click', () => addP());
    document.getElementById('btn-clear-pool')?.addEventListener('click', () => clearPool());
    document.getElementById('btn-start-tournament')?.addEventListener('click', () => startTournament());

    // Pro Mode & Audio
    document.getElementById('pro-mode-section')?.addEventListener('click', () => handleProModeClick());
    document.getElementById('toggle-audio-btn')?.addEventListener('click', () => toggleAudioDetection());
    document.getElementById('btn-accept-rules')?.addEventListener('click', () => acceptRulesAndStart());
    document.getElementById('pro-player-left')?.addEventListener('click', () => addManualGoal(1));
    document.getElementById('pro-player-right')?.addEventListener('click', () => addManualGoal(2));
    document.getElementById('btn-exit-pro-mode')?.addEventListener('click', () => exitProMode());
    document.getElementById('btn-pro-undo')?.addEventListener('click', () => undoLastGoal());
    document.getElementById('btn-pro-reset')?.addEventListener('click', () => resetProMatch());
    document.getElementById('btn-pro-mic')?.addEventListener('click', () => toggleAudioDetection());
    document.getElementById('btn-pro-sound')?.addEventListener('click', () => toggleSoundEffects());

    // Bracket Engine
    document.getElementById('next-rd-btn')?.addEventListener('click', () => advanceRound());
    document.getElementById('save-btn')?.addEventListener('click', () => saveTour());
    document.getElementById('btn-close-card-modal')?.addEventListener('click', () => closeCardModal());

    // Close menu when clicking outside
    document.addEventListener('click', (event) => {
        const menu = document.getElementById('settings-menu');
        const btn = document.getElementById('menu-toggle-btn');
        if (menu && menu.style.display === 'flex' && !menu.contains(event.target) && !btn.contains(event.target)) {
            menu.style.display = 'none';
        }
    });

    // Event Delegation for dynamic elements
    document.addEventListener('click', (e) => {
        // 9. Quick Search Selection
        const searchItem = e.target.closest('[data-action="select-quick-player"]');
        if (searchItem) {
            selectQuickPlayer(searchItem.dataset.player, searchItem.dataset.slot);
            return;
        }

        // 10. Direct Add (Tournament Pool)
        const directAddItem = e.target.closest('[data-action="direct-add"]');
        if (directAddItem) {
            directAdd(directAddItem.dataset.name);
            return;
        }

        // 11. Claim Result Buttons
        if (e.target.id === 'btn-confirm-claim') {
            saveClaimedResult(parseInt(e.target.dataset.score1), parseInt(e.target.dataset.score2), e.target.dataset.gameId);
            return;
        }
        if (e.target.id === 'btn-cancel-claim') {
            cancelClaimResult();
            return;
        }


        // 13. View Tournament Bracket (Events)
        const viewBracketBtn = e.target.closest('[data-action="view-bracket"]');
        if (viewBracketBtn) {
            const { id, eventId, name, max } = viewBracketBtn.dataset;
            viewTournamentBracket(id, name, eventId);
            return;
        }

        // 14. Level Up Story Share
        const shareStoryBtn = e.target.closest('[data-action="share-story"]');
        if (shareStoryBtn) {
            (async () => {
                const url = await CardGenerator.captureStory('level-up-card-preview', shareStoryBtn.dataset.player);
                if (url) CardGenerator.share(url, shareStoryBtn.dataset.player);
            })();
            return;
        }

        // 15. Order Physical Card
        const orderBtn = e.target.closest('[data-action="order-physical-card"]');
        if (orderBtn) {
            showPhysicalOrderDialog();
            return;
        }

        // 14. View Participants (Events)
        const viewParticipantsBtn = e.target.closest('[data-action="view-participants"]');
        if (viewParticipantsBtn) {
            const { eventId, tourId, name } = viewParticipantsBtn.dataset;
            viewTournamentParticipants(eventId, tourId, name);
            return;
        }

        // 15. Event Bracket Controls
        const action = e.target.dataset.action;
        if (action === 'finish-event-tournament') finishEventTournament();
        if (action === 'close-bracket-modal') closeBracketModal();

        // 16. Event Management Delegation
        const eventAction = e.target.closest('[data-action]');
        if (eventAction) {
            const act = eventAction.dataset.action;
            const id = eventAction.dataset.id;
            const eventId = eventAction.dataset.eventId;
            const tourId = eventAction.dataset.tourId;
            const name = eventAction.dataset.name;
            const eventName = eventAction.dataset.eventName;

            if (act === 'show-create-event-form') { showCreateEventForm(); return; }
            if (act === 'hide-create-event-form') { hideCreateEventForm(); return; }
            if (act === 'view-event-details') { viewEventDetails(id); return; }
            if (act === 'edit-tournament') { editTournament(id, eventId, eventName); return; }
            if (act === 'delete-tournament') { deleteTournament(id, eventId); return; }
            if (act === 'unregister-tournament') { unregisterFromTournament(eventId, tourId); return; }
            if (act === 'register-tournament') { registerForTournament(eventId, tourId); return; }
            if (act === 'show-create-tournament-form') { showCreateTournamentForm(eventId, eventName); return; }
            if (act === 'edit-event') { editEvent(id); return; }
            if (act === 'delete-event') { deleteEvent(id); return; }
            if (act === 'open-public-display') { window.open(`?live=${id}`, '_blank'); return; }
            if (act === 'share-live-link') { shareLiveEventLink(id, name); return; }
            if (act === 'close-event-modal') { closeEventModal(); return; }
            if (act === 'add-participant') { addParticipantFromSearch(tourId); return; }
            if (act === 'remove-participant') { removeTournamentParticipant(eventAction.dataset.regId, tourId); return; }
            if (act === 'select-participant') { selectParticipantFromDropdown(tourId, name); return; }
            if (act === 'share-tournament') { shareTournamentLink(eventId, tourId, name); return; }
            if (act === 'create-tournament') { createTournament(eventId); return; }
            if (act === 'close-tournament-form') { closeTournamentForm(); return; }
            if (act === 'save-tournament-edit') { saveTournamentEdit(id, eventId); return; }
            if (act === 'clear-event-image') { clearEventImage(); return; }
            if (act === 'clear-brand-logo') { clearBrandLogo(); return; }
            if (act === 'create-event') { createNewEvent(); return; }
            if (act === 'update-event-form') { updateEventForm(id); return; }
            if (act === 'close-email-prompt') { closeEmailPrompt(); return; }
            if (act === 'save-email-register') { saveEmailAndRegister(eventId, tourId); return; }
            if (act === 'reload-page') { location.reload(); return; }
            if (act === 'select-all') { e.target.select(); return; }
            if (act === 'copy-live-link') {
                navigator.clipboard.writeText(eventAction.dataset.url).then(() => {
                    showNotification('Copied!', 'success');
                    eventAction.closest('div[style*="position:fixed"]').remove();
                });
                return;
            }
            if (act === 'close-share-modal') { eventAction.closest('div[style*="position:fixed"]').remove(); return; }
            if (act === 'toggle-moderator-search') {
                const container = document.getElementById('moderator-search-container');
                if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
                return;
            }
            if (act === 'add-moderator') {
                addModerator(eventId, eventAction.dataset.playerId, eventAction.dataset.username);
                return;
            }
            if (act === 'remove-moderator') {
                removeModerator(eventId, eventAction.dataset.playerId);
                return;
            }
        }

        // 1. Player Cards (Leaderboard, Podium)
        const playerTrigger = e.target.closest('[data-username]');
        if (playerTrigger) {
            viewPlayerCard(playerTrigger.dataset.username);
            return;
        }

        // 2. Pool Removal
        const removeBtn = e.target.closest('[data-remove-index]');
        if (removeBtn) {
            removeFromPool(parseInt(removeBtn.dataset.removeIndex));
            return;
        }

        // 3. Guest Quick Add
        const guestBadge = e.target.closest('[data-guest]');
        if (guestBadge) {
            directAdd(guestBadge.dataset.guest);
            return;
        }

        // 4. Tournament History Toggle
        const tourToggle = e.target.closest('[data-toggle-tournament]');
        if (tourToggle) {
            const el = document.getElementById(`tour-matches-${tourToggle.dataset.toggleTournament}`);
            if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
            return;
        }

        // 5. Tournament Replay
        const replayBtn = e.target.closest('[data-replay-players]');
        if (replayBtn) {
            replayTournament(JSON.parse(replayBtn.dataset.replayPlayers), replayBtn.dataset.replayName);
            return;
        }

        // 6. Card Actions (Upgrade & Download)
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            if (action === 'show-card-shop') showCardShop();
            if (action === 'download-card') downloadFanCard();
            return;
        }

        // 7. Purchase Edition
        const purchaseBtn = e.target.closest('[data-edition-id]');
        if (purchaseBtn) {
            purchaseEdition(purchaseBtn.dataset.editionId);
            return;
        }

        // 8. Share Level Up
        const shareBtn = e.target.closest('[data-share-level-up]');
        if (shareBtn) {
            const playerName = shareBtn.dataset.shareLevelUp;
            (async () => {
                const dataUrl = await CardGenerator.capture('level-up-container');
                if (dataUrl) CardGenerator.share(dataUrl, playerName);
            })();
            return;
        }

        // 17. Map Interactions
        const extLink = e.target.closest('[data-action="external-link"]');
        if (extLink) {
            e.stopPropagation(); // Stop bubbling if needed, though return is enough for our logic
            return;
        }

        const mapFilterBtn = e.target.closest('.map-filter-btn');
        if (mapFilterBtn) {
            filterMap(mapFilterBtn.dataset.filter);
            return;
        }

        const mapLocAction = e.target.closest('[data-action="fly-to-location"]');
        if (mapLocAction) {
            flyToLocation(parseFloat(mapLocAction.dataset.lat), parseFloat(mapLocAction.dataset.lng));
            return;
        }
    });

    // Dynamic Input Delegation
    document.addEventListener('input', (e) => {
        if (e.target.id === 'claim-opponent-search') {
            handleQuickSearch(e.target, 'claim');
        }
        // Participant search in events
        if (e.target.id && e.target.id.startsWith('participant-search-')) {
            const tourId = e.target.id.replace('participant-search-', '');
            handleParticipantSearch(tourId);
        }
        if (e.target.id === 'mod-search-input') {
            const eventId = e.target.closest('[data-event-id]')?.dataset.eventId;
            if (eventId) searchModerators(e.target.value, eventId);
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'brand-logo-input') previewBrandLogo(e.target);
        if (e.target.id === 'event-image-input') previewEventImage(e.target);
    });
}

// ============================================================
// MOVED FROM SCRIPT.JS TO BREAK CIRCULAR DEPENDENCIES
// ============================================================

export function updatePoolUI() {
    const list = document.getElementById('pool-list');
    const countSpan = document.getElementById('pool-count');
    if (!list) return;
    list.innerHTML = '';
    if (state.pool.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; color:#444; padding:30px 0; font-size:0.8rem;">
                <i class="fa fa-users" style="font-size:2rem; margin-bottom:10px; opacity:0.3;"></i><br>
                Add players to start
            </div>
        `;
        if (countSpan) countSpan.innerText = 0;
        return;
    }
    state.pool.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = "sub-item-row";
        div.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; background: #161616; padding: 10px 15px; border-radius: 4px; border: 1px solid #222;";
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #444; font-family: var(--sub-name-font); font-size: 0.8rem; width: 20px;">${index + 1}.</span>
                <span style="color: white; text-transform: uppercase; font-size: 0.9rem; font-family: var(--sub-name-font); letter-spacing:1px;">${name}</span>
            </div>
            <button class="pool-remove-btn" data-remove-index="${index}" style="background:none; border:none; color:#666; cursor:pointer; font-size:0.9rem; padding:5px; transition:color 0.2s;" onmouseover="this.style.color='var(--sub-red)'" onmouseout="this.style.color='#666'">
                <i class="fa fa-times"></i>
            </button>
        `;
        list.appendChild(div);
    });
    if (countSpan) countSpan.innerText = state.pool.length;
}

export function removeFromPool(index) {
    const removedPlayer = state.pool[index];
    state.pool.splice(index, 1);
    updatePoolUI();
    showNotification(`${removedPlayer} removed from pool`, 'error');
}

export function clearPool() {
    state.pool = [];
    updatePoolUI();
    showNotification('Player pool cleared', 'error');
}

export function updateGuestUI() {
    const el = document.getElementById('active-guests');
    if (el) el.innerHTML = state.sessionGuests.map(g => `<span class="guest-badge" style="background:#333; padding:5px 10px; border-radius:15px; font-size:0.7rem; cursor:pointer; margin:4px; display:inline-block; border:1px solid #444;" data-guest="${g}">${g}</span>`).join('');
}

export function updateProfileCard() {
    const container = document.getElementById('profile-card-container');
    if (!container || !state.user) return;
    const u = state.user;
    const editionClass = state.activeCardEdition !== 'standard' ? `card-${state.activeCardEdition}-edition` : '';
    const rookieClass = ((u.wins || 0) + (u.losses || 0)) < 5 ? 'status-rookie' : '';

    const labels = {
        'standard': 'PRO CARD',
        'elite': 'ELITE SERIES',
        'global': 'GLOBAL PRO',
        'legendary-gold': 'LEGENDARY GOLD'
    };
    const editionLabel = state.brand ? 'PARTNER EDITION' : (labels[state.activeCardEdition] || 'PRO CARD');
    const overlayBg = state.brand ? 'var(--sub-red)' : '#000';
    const overlayHeight = state.brand ? '30%' : '40%';

    // Game Ownership Badges
    const myGames = state.myGames || [];
    const badges = [];
    const checkGame = (g, type) => {
        const name = (g.game_name || '').toUpperCase();
        const serial = (g.serial_number || '').toUpperCase();
        return name.includes(type) || serial.includes(type);
    };

    if (myGames.some(g => checkGame(g, 'ARCADE'))) {
        badges.push({ icon: 'fa-crown', color: '#FFD700', title: 'ARCADE OWNER' }); // Gold
    }
    if (myGames.some(g => checkGame(g, 'S7') || checkGame(g, 'SUBSOCCER 7'))) {
        badges.push({ icon: 'fa-medal', color: '#C0C0C0', title: 'S7 OWNER' }); // Silver
    }
    if (myGames.some(g => checkGame(g, 'S3') || checkGame(g, 'SUBSOCCER 3'))) {
        badges.push({ icon: 'fa-shield', color: '#CD7F32', title: 'S3 OWNER' }); // Bronze
    }

    container.innerHTML = `
    <div class="topps-collectible-card ${editionClass} ${rookieClass}" style="background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%); background-size: 8px 8px; background-color: #0a0a0a;">
            <img src="${(u.avatar_url && u.avatar_url.trim() !== '') ? u.avatar_url : 'placeholder-silhouette-5-wide.png'}" class="card-hero-image" referrerpolicy="no-referrer" onerror="this.src='placeholder-silhouette-5-wide.png'">
            <div class="card-overlay" style="background: ${overlayBg}; height: ${overlayHeight}; border-top: ${state.brand ? '3px solid var(--sub-gold)' : 'none'}; box-shadow: 0 -5px 15px rgba(0,0,0,0.3);"></div>
            <div style="position:absolute; top:15px; left:15px; z-index:11; font-family:'SubsoccerLogo'; font-size:0.8rem; color:var(--sub-gold); opacity:0.8;">${editionLabel} // 2026</div>
            <div style="position:absolute; top:15px; right:15px; z-index:11; display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
                ${badges.map(b => `<div style="background:rgba(0,0,0,0.9); border:1px solid ${b.color}; color:${b.color}; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.9rem; box-shadow:0 0 10px ${b.color}40; backdrop-filter:blur(4px);" title="${b.title}"><i class="fa-solid ${b.icon}"></i></div>`).join('')}
            </div>
            <div class="card-content-bottom">
                <div style="color:var(--sub-gold); font-size:0.75rem; letter-spacing:2px; margin-bottom:4px; font-weight:bold; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);"><i class="fa-solid fa-location-dot"></i> ${u.city || 'HELSINKI'}</div>
                <div class="card-player-name">${u.username}</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:10px;">
                    <div class="card-elo-badge">${u.elo || 1300} ELO</div>
                    <div style="text-align:right;"><div style="color:white; font-size:0.6rem; text-transform:uppercase;">Win Ratio</div><div style="color:white; font-size:1rem;">${((u.wins / (Math.max(1, u.wins + (u.losses || 0)))) * 100).toFixed(0)}%</div></div>
                </div>
            </div>
            ${state.brandLogo ? `
                <img src="${state.brandLogo}" style="position:absolute; bottom: 80px; right: 15px; z-index: 11; max-width: 60px; max-height: 35px; object-fit: contain;">
            ` : `
                <div style="position:absolute; bottom:15px; right:15px; width:30px; height:30px; background:radial-gradient(circle, #ffd700, #b8860b); border-radius:50%; opacity:0.3; z-index:11; filter:blur(1px);"></div>
            `}
        </div>
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button class="btn-red" style="flex:1; background:#222; font-size:0.7rem;" data-action="show-card-shop">
                <i class="fa fa-shopping-cart"></i> UPGRADE CARD
            </button>
            <button class="btn-red" style="flex:1; font-size:0.7rem;" data-action="download-card">
                <i class="fa fa-download"></i> SAVE IMAGE
            </button>
        </div>
`;

    const card = container.querySelector('.topps-collectible-card');
    if (card) initTiltEffect(card);
}

/**
 * Reactive UI: Automatically update components when state changes.
 */
subscribe('user', () => {
    try {
        if (!state.user) return;

        // Tarkistetaan ollaanko vasta kirjautumassa sisään (auth-sivu on vielä näkyvissä)
        const isInitialLogin = document.getElementById('auth-page').style.display !== 'none';

        const authPage = document.getElementById('auth-page');
        const appContent = document.getElementById('app-content');
        const navTabs = document.getElementById('nav-tabs');
        const menuBtn = document.getElementById('menu-toggle-btn');
        const header = document.querySelector('header');

        // Helper to update admin interface elements
        const updateAdminInterface = () => {
            const isUserAdmin = isAdmin();
            const modMenu = document.getElementById('menu-item-moderator');
            if (modMenu) modMenu.style.display = isUserAdmin ? 'flex' : 'none';

            const sensorMenu = document.getElementById('menu-item-sensors');
            if (sensorMenu) sensorMenu.style.display = isUserAdmin ? 'flex' : 'none';

            // Aggressively remove indicators from DOM
            const audioIndicator = document.getElementById('audio-indicator');
            if (audioIndicator) audioIndicator.remove();

            const connDot = document.getElementById('conn-dot');
            if (connDot) connDot.remove();

            // Remove audio meter elements based on user findings
            const thresholdLine = document.getElementById('audio-threshold-line');
            if (thresholdLine) thresholdLine.remove();
        };

        const params = new URLSearchParams(window.location.search);
        const liveId = params.get('live');

        // JOS OLLAAN LIVE-TILASSA: Piilotetaan kaikki muu ja poistutaan funktiosta
        if (liveId) {
            document.body.classList.add('live-mode');
            if (authPage) authPage.style.display = 'none';
            if (appContent) appContent.style.display = 'none';
            if (navTabs) navTabs.style.display = 'none';
            if (menuBtn) menuBtn.style.display = 'none';
            if (header) header.style.display = 'none';
            return; // Estetään normaalin UI:n latautuminen
        }

        // 1. Normaali käyttöliittymän siirtymä
        if (authPage) authPage.style.display = 'none';
        if (appContent) {
            appContent.style.display = 'flex';
            appContent.classList.remove('fade-in');
            void appContent.offsetWidth; // Pakotetaan reflow animaation uudelleenkäynnistämiseksi
            appContent.classList.add('fade-in');
        }
        if (navTabs) navTabs.style.setProperty('display', 'flex', 'important');

        // KIOSK MODE: Piilota asetusvalikko julkisessa käytössä
        if (menuBtn) menuBtn.style.display = KIOSK_MODE ? 'none' : 'block';

        // 2. Kontekstuaalinen UI (Vieraat vs Rekisteröityneet)
        const eventsTab = document.getElementById('tab-events');
        if (eventsTab) {
            eventsTab.style.display = (state.user.id !== 'guest' && ENABLE_EVENTS) ? 'flex' : 'none';
        }

        const regGameBtn = document.getElementById('btn-profile-register-game');
        if (regGameBtn) regGameBtn.style.display = (state.user.id === 'guest' || state.user.id === 'spectator') ? 'none' : 'block';

        updateAdminInterface();

        // 3. Quick Match -näkymän nollaus
        const startBtn = document.getElementById('start-quick-match');
        if (startBtn) {
            startBtn.textContent = 'START GAME';
            startBtn.style.background = '';
        }

        // 4. Instant Play -linkin päivitys
        const instantPlayLink = document.querySelector('a[href*="instant-play.html"]');
        if (instantPlayLink) {
            const userType = state.user.id === 'guest' ? 'guest' : 'registered';
            instantPlayLink.href = `instant-play.html?game_id=QUICK-PLAY&mode=casual&user_type=${userType}`;
        }

        // 5. Komponenttien päivitys
        updateProfileCard();
        updateGuestUI();
        initProModeUI();

        // 6. Navigointi (Vain ensimmäisellä kirjautumisella, ei profiilin päivityksen yhteydessä)
        if (isInitialLogin) {
            if (params.get('action') === 'claim_result') {
                const p1 = parseInt(params.get('p1_score')) || 0;
                const p2 = parseInt(params.get('p2_score')) || 0;
                const gameId = params.get('game_id');
                initClaimResult(p1, p2, gameId);
            } else {
                // Tarkistetaan onko URL:ssa määritelty sivu (?page=events)
                const pageParam = params.get('page');
                const eventIdParam = params.get('event_id');
                const validPages = ['events', 'profile', 'map', 'leaderboard', 'history', 'tournament'];

                if (pageParam && validPages.includes(pageParam)) {
                    state.currentPage = pageParam;
                    // Jos linkissä on event_id, avataan kyseinen tapahtuma automaattisesti
                    if (pageParam === 'events' && eventIdParam) {
                        // Pieni viive varmistaa että events-sivu on latautunut
                        setTimeout(() => viewEventDetails(eventIdParam), 800);
                    }
                } else {
                    state.currentPage = 'profile'; // Oletuksena näytetään Dashboard (Pro Card)
                }
            }
        }
    } catch (err) {
        console.error("Error in user state subscription:", err);
    }
});

subscribe('currentPage', (p) => {
    updatePageUI(p);

    // Päivitetään URL osoiteriville ilman sivun latausta
    const url = new URL(window.location);
    url.searchParams.set('page', p);
    window.history.replaceState({}, '', url);
});

subscribe('activeCardEdition', () => {
    updateProfileCard();
});

subscribe('pool', () => {
    updatePoolUI();
});

subscribe('allGames', () => {
    populateGameSelect();
});

subscribe('myGames', () => {
    updateProfileCard();
});

subscribe('victoryData', (data) => {
    if (data) showVictoryAnimation(data.winnerName, data.winnerElo, data.winnerGain);
});

export function updateAvatarPreview(url) {
    const img = document.getElementById('avatar-preview');
    if (img) {
        img.src = url || 'placeholder-silhouette-5-wide.png';
        img.onerror = () => { img.src = 'placeholder-silhouette-5-wide.png'; };
    }
}

export async function viewPlayerCard(targetUsername) {
    showModal('Player Card', '<p style="font-family:\'Resolve\'">LOADING CARD...</p>', { id: 'card-modal', maxWidth: '400px' });

    const { data: p } = await _supabase.from('players').select('*').eq('username', targetUsername).maybeSingle();

    if (!p) {
        const body = document.querySelector('#card-modal .modal-body');
        if (body) body.innerHTML = '<p>Player not found.</p>';
        return;
    }

    // Fetch Tournament History (Podiums)
    const { data: tournaments } = await _supabase
        .from('tournament_history')
        .select('tournament_name, winner_name, second_place_name, third_place_name, created_at')
        .or(`winner_name.eq.${targetUsername},second_place_name.eq.${targetUsername},third_place_name.eq.${targetUsername}`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

    // NEW: Fetch Recent Matches (Last 10 games played)
    const { data: recentMatches } = await _supabase
        .from('matches')
        .select('*')
        .or(`player1.eq.${targetUsername},player2.eq.${targetUsername}`)
        .order('created_at', { ascending: false })
        .limit(10);

    const wins = p.wins || 0;
    const losses = p.losses || 0;
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = p.elo > 1600 ? "PRO" : "ROOKIE";
    const cardHeader = state.brand ? "PARTNER" : rank;
    const avatarUrl = (p.avatar_url && p.avatar_url.trim() !== '') ? p.avatar_url : 'placeholder-silhouette-5-wide.png';
    const rookieClass = (wins + losses) < 5 ? 'status-rookie' : '';

    let historyHtml = '';
    if (tournaments && tournaments.length > 0) {
        historyHtml = `
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
                <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase;">🏆 Trophy Room</div>
                <div style="max-height: 150px; overflow-y: auto; padding-right:5px;">
                    ${tournaments.map(t => {
            let place = '';
            let color = '#666';
            let icon = '';
            if (t.winner_name === targetUsername) { place = 'WINNER'; color = 'var(--sub-gold)'; icon = '🥇'; }
            else if (t.second_place_name === targetUsername) { place = 'FINALIST'; color = '#C0C0C0'; icon = '🥈'; }
            else if (t.third_place_name === targetUsername) { place = '3RD PLACE'; color = '#CD7F32'; icon = '🥉'; }

            const date = new Date(t.created_at).toLocaleDateString();
            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:#111; margin-bottom:5px; border-radius:4px; border-left:2px solid ${color};">
                                <div>
                                    <div style="color:#fff; font-size:0.8rem; font-family:var(--sub-name-font); text-transform:uppercase;">${t.tournament_name || 'Tournament'}</div>
                                    <div style="color:#666; font-size:0.6rem;">${date}</div>
                                </div>
                                <div style="color:${color}; font-size:0.7rem; font-weight:bold; font-family:var(--sub-name-font);">${icon} ${place}</div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    } else {
        historyHtml = `
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px; text-align:center;">
                <div style="font-family:var(--sub-name-font); color:#444; font-size:0.7rem; letter-spacing:1px;">NO TOURNAMENT TROPHIES YET</div>
            </div>
        `;
    }

    let matchesHtml = '';
    if (recentMatches && recentMatches.length > 0) {
        matchesHtml = `
            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 15px;">
                <div style="font-family:var(--sub-name-font); color:#888; font-size:0.7rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase;">📜 Recent Matches</div>
                <div style="max-height: 200px; overflow-y: auto; padding-right:5px;">
                    ${recentMatches.map(m => {
            const isP1 = m.player1 === targetUsername;
            const opponent = isP1 ? m.player2 : m.player1;
            const isWinner = m.winner === targetUsername;
            const resultColor = isWinner ? 'var(--sub-gold)' : '#666';
            const score = (m.player1_score !== null && m.player2_score !== null)
                ? (isP1 ? `${m.player1_score}-${m.player2_score}` : `${m.player2_score}-${m.player1_score}`)
                : (isWinner ? 'WIN' : 'LOSS');

            const date = new Date(m.created_at).toLocaleDateString();

            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#111; margin-bottom:4px; border-radius:4px; border-left:2px solid ${resultColor};">
                                <div style="display:flex; flex-direction:column;">
                                    <div style="color:#fff; font-size:0.75rem; font-family:var(--sub-name-font);">vs ${opponent}</div>
                                    <div style="color:#666; font-size:0.6rem;">${date} • ${m.tournament_name || 'Quick Match'}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="color:${resultColor}; font-size:0.8rem; font-weight:bold; font-family:'Russo One';">${score}</div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    const html = `
    <div class="pro-card ${rookieClass}" style="margin:0; width:100% !important; background:transparent; box-shadow:none; cursor:pointer;" onclick="this.classList.toggle('flipped')">
        <div class="card-flipper">
            <!-- FRONT SIDE -->
            <div class="card-front" style="background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%); background-size: 8px 8px; background-color: #0a0a0a;">
                <div class="card-inner-frame">
                    <div class="card-header-stripe">${cardHeader} CARD</div>
                    <div class="card-image-area"><img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'"></div>
                    <div class="card-name-strip">${p.username}</div>
                    <div class="card-info-area">
                        <div class="card-stats-row">
                            <div class="card-stat-item"><div class="card-stat-label">RANK</div><div class="card-stat-value">${p.elo}</div></div>
                            <div class="card-stat-item"><div class="card-stat-label">WINS</div><div class="card-stat-value">${wins}</div></div>
                            <div class="card-stat-item"><div class="card-stat-label">LOSS</div><div class="card-stat-value">${losses}</div></div>
                            <div class="card-stat-item"><div class="card-stat-label">W/L</div><div class="card-stat-value">${ratio}</div></div>
                        </div>
                        <div class="card-bottom-row" style="border-top: 1px solid #222; padding-top: 4px; display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:5px;"><img src="https://flagcdn.com/w20/${(p.country || 'fi').toLowerCase()}.png" width="16"><span style="color:#888; font-size:0.55rem; font-family:'Resolve';">REPRESENTING</span></div>
                            ${state.brandLogo ? `<img src="${state.brandLogo}" style="height:22px; width:auto; object-fit:contain;">` : `<div style="color:var(--sub-gold); font-size:0.55rem; font-family:'Resolve';">CLUB: PRO</div>`}
                        </div>
                    </div>
                </div>
                <div class="flip-hint" style="position:absolute; bottom:5px; right:15px; color:#888; font-size:0.55rem; font-family:'Resolve';"><i class="fa-solid fa-rotate-right"></i> TAP TO FLIP</div>
            </div>
            
            <!-- BACK SIDE -->
            <div class="card-back" style="background-color: #0a0a0a; background-image: radial-gradient(circle at center, #1a0000 0%, #000 100%);">
                <div class="card-inner-frame" style="padding:15px; display:block; text-align:left; overflow-y:auto; overflow-x:hidden;">
                    <div style="text-align:center; padding-bottom:5px; border-bottom:1px solid #333; margin-bottom:5px;">
                        <h4 style="color:var(--sub-gold); font-family:'Russo One'; margin:0; letter-spacing:2px; font-size:1.1rem;">PLAYER DOSSIER</h4>
                        <div style="color:#fff; font-size:0.75rem; font-family:'Resolve'; margin-top:5px; text-transform:uppercase;">${p.username}</div>
                    </div>
                    ${historyHtml}
                    ${matchesHtml}
                </div>
                <div class="flip-hint" style="position:absolute; bottom:-25px; left:15px; color:#c0c0c0; font-size:0.55rem; font-family:'Resolve';"><i class="fa-solid fa-rotate-left"></i> TAP TO FLIP</div>
            </div>
        </div>
    </div>`;

    const body = document.querySelector('#card-modal .modal-body');
    if (body) body.innerHTML = html;
    initTiltEffect(body.querySelector('.pro-card'));
}

export function closeCardModal() { closeModal('card-modal'); }

export async function showLevelUpCard(playerName, newElo) {
    const isPro = newElo >= 1600;
    const title = isPro ? "⭐ NEW PRO RANK REACHED!" : "📈 RANK UP!";

    const content = `
        <div id="level-up-container" class="level-up-anim" style="text-align:center;">
            
            <div style="font-family:'Russo One'; color:var(--sub-gold); font-size:1.5rem; letter-spacing:2px; margin-bottom:10px; text-transform:uppercase; animation: pulse 1.5s infinite;">
                RANK CAP CROSSED
            </div>
            <p style="color:#aaa; font-size:0.85rem; margin-bottom:20px;">Your Official Pro Card has been updated.</p>

            <div id="level-up-card-preview" style="transform:scale(0.8); margin:-40px 0;">
                <p style="text-align:center; color:#888;">Updating Identity...</p>
            </div>
            
            <div style="margin-top:0; display:flex; flex-direction:column; gap:12px;">
                <button class="btn-red" style="background:var(--sub-gold); color:#000; font-family:'Russo One'; font-size:1.1rem; padding:18px; box-shadow:0 0 20px rgba(255,215,0,0.4);" data-action="share-story" data-player="${playerName}">
                    <i class="fa-brands fa-instagram" style="margin-right:8px; font-size:1.2rem;"></i> SHARE TO STORY
                    <div style="font-family:'Resolve'; font-size:0.6rem; letter-spacing:1px; margin-top:5px; color:#444;">UNLOCK 'GOLD' BORDER</div>
                </button>
                <div style="display:flex; gap:10px;">
                    <button class="btn-red" style="flex:1; background:#222; border:1px solid var(--sub-gold); color:var(--sub-gold); font-size:0.8rem; padding:12px;" data-action="order-physical-card">
                        <i class="fa-solid fa-gem"></i> ORDER PREMIUM CARD
                    </button>
                    <button class="btn-red" style="flex:1; background:#111; color:#666; font-size:0.8rem; padding:12px; border:1px solid #333;" onclick="closeModal('level-up-modal')">
                        CLOSE
                    </button>
                </div>
            </div>
        </div>
    `;

    showModal(title, content, { id: 'level-up-modal', maxWidth: '400px', borderColor: 'var(--sub-gold)' });

    // Render the card inside the modal
    await viewPlayerCard(playerName);
    const cardHtml = document.querySelector('#card-modal .modal-body').innerHTML;
    document.getElementById('level-up-card-preview').innerHTML = cardHtml;
    closeModal('card-modal');

    const previewCard = document.getElementById('level-up-card-preview').querySelector('.pro-card');
    if (previewCard) initTiltEffect(previewCard);
}

export function showPhysicalOrderDialog() {
    const html = `
    <div style="text-align:center; padding:10px;">
        <i class="fa-solid fa-truck-fast" style="font-size:3rem; color:var(--sub-gold); margin-bottom:20px;"></i>
        <h3 style="font-family:'Russo One'; margin-bottom:10px;">PREMIUM COLLECTIBLE</h3>
        <p style="color:#888; font-size:0.85rem; line-height:1.5; margin-bottom:20px;">
            Order your official high-quality PVC printed **Pro Card** delivered to your door. Includes NFC chip for instant login at Verified Arenas.
        </p>
        <div style="background:#111; padding:15px; border-radius:12px; border:1px solid #333; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; color:#fff;">
                <span>Pro Membership Edition</span>
                <span style="color:var(--sub-gold); font-weight:bold;">19.90 €</span>
            </div>
            <div style="font-size:0.7rem; color:#666; text-align:left; margin-top:5px;">+ Free shipping inside EU</div>
        </div>
        <button class="btn-red" style="width:100%; padding:15px; font-family:'Russo One';" onclick="showNotification('Store integration coming soon!', 'info')">
            SUBSCRIBE & ORDER NOW
        </button>
    </div>
    `;
    showModal('ORDER TO HOME', html, { maxWidth: '400px' });
}

export async function downloadFanCard() {
    const dataUrl = await CardGenerator.capture('profile-card-container');
    if (dataUrl) CardGenerator.share(dataUrl, state.user.username);
}

/**
 * Näyttää korttikaupan
 */
export function showCardShop() {
    const editions = [
        { id: 'elite', name: 'Elite Series Edition', price: '4.99€', color: '#003399' },
        { id: 'global', name: 'Global Pro Edition', price: '4.99€', color: '#006400' },
        { id: 'legendary-gold', name: 'Legendary Gold Edition', price: '9.99€', color: 'var(--sub-gold)' }
    ];

    const html = `
    <div style="display:grid; gap:15px;">
        ${editions.map(e => `
                <div class="sub-card" style="border-left: 4px solid ${e.color}; display:flex; justify-content:space-between; align-items:center; padding:15px;">
                    <div>
                        <div style="font-family:var(--sub-name-font); color:#fff;">${e.name}</div>
                        <div style="color:var(--sub-gold); font-size:0.9rem; font-weight:bold;">${e.price}</div>
                    </div>
                    <button class="btn-red" style="width:auto; padding:8px 15px; font-size:0.8rem;" data-edition-id="${e.id}">
                        BUY NOW
                    </button>
                </div>
            `).join('')
        }
        </div>
    `;

    showModal('SUBSOCCER COLLECTIBLE SHOP', html, { maxWidth: '450px' });
}

export function showAppConcept() {
    const html = `
    <div style="color: #fff; font-family: 'Resolve'; max-height: 75vh; overflow-y: auto; padding-right: 15px; scrollbar-width: thin;">
        <h2 style="color: var(--sub-gold); font-size: 1.1rem; margin-bottom: 25px; line-height: 1.4; font-family: 'Russo One'; text-transform: uppercase;">
            From Living Room to Virtual Arena
        </h2>

        <div style="margin-bottom: 25px; display: grid; gap: 20px;">
            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-bolt"></i> 1. ZERO FRICTION
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Scan the QR code, click play, and the AI-referee starts instantly. No apps, no registration required.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-id-card"></i> 2. IDENTITY: THE PRO CARD
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Your Subsoccer Pro Card is a collectible identity storing your ELO, titles, and match legacy.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-earth-europe"></i> 3. THE BALANCED ECOSYSTEM
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Practice at home (B2C), but rank up to "Legend" (1600+ ELO) by playing at official Verified Arenas (B2B).
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-shield-halved"></i> 4. ANTI-CHEAT & AUTHENTICITY
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Verified Equipment ensures the Global Leaderboard is honest. True pros prove their skills on official tables.
                </div>
            </div>

            <div class="concept-point">
                <div style="color: var(--sub-red); font-size: 0.9rem; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-share-nodes"></i> 5. VIRAL ENGAGEMENT
                </div>
                <div style="font-size: 0.8rem; color: #aaa; line-height: 1.5; padding-left: 20px;">
                    Every result is a shareable moment. The journey generates social currency for the player and the community.
                </div>
            </div>
        </div>

        <button onclick="closeModal()" class="btn-red" style="width: 100%; font-family: 'Russo One'; padding: 15px; margin-top: 10px; border-radius: 8px;">UNDERSTOOD</button>
    </div>
    `;
    showModal('DIGITAL CONCEPT', html, { maxWidth: '450px', borderColor: 'var(--sub-gold)' });
}

window.showAppConcept = showAppConcept;

export async function purchaseEdition(editionId) {
    await handleAsync(new Promise(resolve => {
        setTimeout(() => {
            state.activeCardEdition = editionId;
            state.inventory.push(editionId);
            closeModal();
            resolve(true);
        }, 1500);
    }), 'Edition purchased successfully!');
}

// Branding logic moved to branding-service.js