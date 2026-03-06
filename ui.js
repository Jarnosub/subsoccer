import { state, _supabase, subscribe, isAdmin, APP_VERSION, ENABLE_EVENTS, KIOSK_MODE } from './config.js';
import { applyBranding, injectFooterLink } from './branding-service.js';
import { CardGenerator } from './card-generator.js';
import { viewPlayerCard, showLevelUpCard, showPhysicalOrderDialog, showCardShop, downloadFanCard, showAppConcept, purchaseEdition, setupPlayerCardListeners } from './player-card-ui.js';
import { loadUserProfile, showEditProfile, cancelEditProfile, updateProfileCard } from './profile-ui.js';
import { showNotification, showLoading, hideLoading, handleAsync, showModal, closeModal } from './ui-utils.js';
import { handleSearch, addP, directAdd } from './script.js';
import { fetchLB, fetchHist } from './stats-service.js';
import { fetchMyGames, cancelEdit, registerGame, updateGame, viewOwnershipRequests } from './game-service.js';
import { fetchPublicGamesMap, initGameMap, searchPublicMap, filterMap, flyToLocation, searchLocation } from './map.js';
import {
    loadEventsPage, viewTournamentBracket,
    finishEventTournament, closeBracketModal, viewTournamentParticipants,
    setupEventUIListeners
} from './events-v3-final.js';
import {
    initProModeUI, initClaimResult, toggleSoundEffects, setupQuickMatchListeners
} from './quick-match.js';
import { shareLiveEventLink } from './live-view-service.js';
import { saveProfile, previewAvatarFile, populateCountries } from './auth.js';
import { startTournament, advanceRound, saveTour, replayTournament, populateEventDropdown } from './tournament.js';
import { showPartnerLinkGenerator, viewAllUsers, downloadSystemLogs, resetGlobalLeaderboard, setupModeratorListeners } from './moderator-service.js';

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
    if (state.currentPage === p) {
        // Force refresh if the user clicks the same tab again (useful for retrying failed network loads)
        updatePageUI(p);
    }
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

    // Aina kun sivu vaihtuu, nollataan scrollaus ylös
    window.scrollTo(0, 0);
    const appContent = document.getElementById('app-content');
    if (appContent) appContent.scrollTo(0, 0);

    // FIX: Hide the sticky save button when leaving the tournament view
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn && saveBtn.classList.contains('sticky-bottom-action')) {
        saveBtn.style.display = (p === 'tournament') ? 'block' : 'none';
    }

    // Map sub-pages to main tabs
    let tabId = 'tab-' + p;
    if (p === 'leaderboard' || p === 'history') {
        tabId = 'tab-profile'; // Rank and History are under Profile context
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
        // Estä sivun vaihto jos käyttäjä on kartan päällä tai kortin päällä tai elementissä jossa on 'no-swipe'
        if (e.target.closest('.leaflet-container') || e.target.closest('.no-swipe') || e.target.closest('input[type="range"]') || e.target.closest('.pro-card')) {
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

    // 3D Hover Tilt is strictly for mouse devices to prevent mobile touch/click cancellations
    card.addEventListener('mousemove', handleMove);
    card.addEventListener('mouseleave', handleReset);
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
    showPage('sensors');
    showNotification('Sensor tools activated', 'success');
}

/**
 * Setup all UI event listeners to remove inline onclicks.
 */
let isUIInitialized = false;
export function setupUIListeners() {
    if (isUIInitialized) return;
    isUIInitialized = true;

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

        // VERSION: Inject Version Label under logo
        // Remove old badges to ensure clean state and centering
        document.querySelectorAll('.version-badge-container').forEach(el => el.remove());

        const versionBadge = document.createElement('div');
        versionBadge.className = 'version-badge-container';
        versionBadge.style.cssText = "display:flex; justify-content:center; width:100%; margin-top:5px; margin-bottom:5px;";
        versionBadge.innerHTML = `
            <span class="version-label" style="color:var(--sub-gold); font-size:0.7rem; letter-spacing:2px; font-weight:bold;">${APP_VERSION}</span>
        `;
        logo.after(versionBadge);
    }

    injectFooterLink();

    // FEEDBACK: Inject Feedback Button
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
    document.getElementById('sound-toggle-btn')?.addEventListener('click', (e) => {
        toggleSoundEffects();
        toggleSettingsMenu(e);
    });

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

    // Tournament Section
    document.getElementById('add-p-input')?.addEventListener('input', (e) => handleSearch(e.target.value));
    document.getElementById('add-p-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addP();
    });
    document.getElementById('btn-add-player')?.addEventListener('click', () => addP());
    document.getElementById('btn-clear-pool')?.addEventListener('click', () => clearPool());
    document.getElementById('btn-start-tournament')?.addEventListener('click', () => startTournament());

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
        // 10. Direct Add (Tournament Pool)
        const directAddItem = e.target.closest('[data-action="direct-add"]');
        if (directAddItem) {
            directAdd(directAddItem.dataset.name);
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

        // 16. Pro Card Dashboard Controls
        const shopBtn = e.target.closest('[data-action="show-card-shop"]');
        if (shopBtn) {
            showNotification('Pro Card Shop opens soon – keep ranking up to unlock borders!', 'info');
            return;
        }

        const dlCardBtn = e.target.closest('[data-action="download-card"]');
        if (dlCardBtn) {
            showNotification('Generating high-res image...', 'info');
            CardGenerator.capture('profile-card-container', state.user?.username || 'Player').catch(err => {
                console.error(err);
                showNotification('Failed to generate image', 'error');
            });
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
    // Initialize Event-specific listeners
    setupEventUIListeners();

    // Initialize Quick Match and Pro Mode listeners
    setupQuickMatchListeners();

    // Initialize Moderator listeners
    setupModeratorListeners();

    // Initialize Player Card listeners
    setupPlayerCardListeners();
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

// Profile UI imports handle updateProfileCard

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
            if (sensorMenu) sensorMenu.style.display = 'flex'; // Allow anyone to calibrate audio

            // Aggressively remove connection dot from DOM but keep audio indicator in its section

            const connDot = document.getElementById('conn-dot');
            if (connDot) connDot.remove();

            // Audio elements are now isolated in section-sensors, so removing them is no longer needed
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
// Branding logic moved to branding-service.js