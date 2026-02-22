import { state, _supabase, subscribe, isAdmin } from './config.js';
import { CardGenerator } from './card-generator.js';
import { showNotification, showLoading, hideLoading, handleAsync, showModal, closeModal } from './ui-utils.js';
import { handleSearch, addP, directAdd } from './script.js';
import { fetchLB, fetchHist } from './stats-service.js';
import { fetchMyGames, cancelEdit, registerGame, updateGame, viewOwnershipRequests } from './game-service.js';
import { fetchPublicGamesMap, initGameMap, searchLocation } from './map.js';
import {
    loadEventsPage, viewTournamentBracket, pickEventWinner, pickEventBronzeWinner,
    advanceEventRound, finishEventTournament, closeBracketModal, viewTournamentParticipants,
    showCreateEventForm, viewEventDetails, editTournament, deleteTournament, unregisterFromTournament,
    registerForTournament, showCreateTournamentForm, editEvent, deleteEvent, shareLiveEventLink, closeEventModal,
    addParticipantFromSearch, removeTournamentParticipant, selectParticipantFromDropdown, createTournament,
    closeTournamentForm, saveTournamentEdit, clearEventImage, updateEventForm, handleParticipantSearch,
    hideCreateEventForm, clearBrandLogo, previewBrandLogo, previewEventImage, createNewEvent, closeEmailPrompt, saveEmailAndRegister,
    addModerator, removeModerator, searchModerators
} from './events-v3-final.js';
import {
    handleQuickSearch, startQuickMatch, clearQuickMatchPlayers,
    handleProModeClick, toggleAudioDetection, recordGoalSound, acceptRulesAndStart,
    addManualGoal, exitProMode, undoLastGoal, initProModeUI, initClaimResult, toggleSoundEffects, selectQuickPlayer, saveClaimedResult, cancelClaimResult, closeVictoryOverlay
} from './quick-match.js';
import { saveProfile, previewAvatarFile, populateCountries } from './auth.js';
import { startTournament, advanceRound, saveTour, replayTournament, pickWin, pickBronzeWinner } from './tournament.js';
import { showPartnerLinkGenerator, viewAllUsers, downloadSystemLogs, resetGlobalLeaderboard } from './moderator-service.js';

// Swipe-toiminnallisuus muuttujat (siirretty alkuun ReferenceErrorin välttämiseksi)
let touchStartX = 0;
let touchEndX = 0;
const pages = ['profile', 'tournament', 'events', 'map', 'leaderboard', 'moderator'];
let currentPageIndex = 1; // Aloitetaan tournament-sivulta

/**
 * Näyttää voittoanimaation overlayn.
 * @param {string} winnerName - Voittajan nimi
 * @param {number|string} newElo - Uusi ELO-luku
 * @param {number|string} eloGain - ELO-muutos
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
 * Vaihtaa näkyvän sivun (section) ja aktivoi vastaavan välilehden.
 * @param {string} p - Näytettävän sivun ID ilman 'section-'-etuliitettä.
 */
export function showPage(p) {
    state.currentPage = p;
}

function updatePageUI(p) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('section-' + p).classList.add('active');

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
    const pageIdx = ['profile', 'tournament', 'events', 'map', 'leaderboard'].indexOf(p);
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
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    appContent.addEventListener('touchend', (e) => {
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

    const handleMove = (e) => {
        const rect = card.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (centerY - y) / 12; // Säädä voimakkuutta tästä
        const rotateY = (x - centerX) / 12;

        card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        card.style.setProperty('--x', `${x} px`);
        card.style.setProperty('--y', `${y} px`);
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
    const connDot = document.getElementById('conn-dot');
    if (connDot) connDot.remove();
    const thresholdLine = document.getElementById('audio-threshold-line');
    if (thresholdLine) thresholdLine.remove();

    // Logo link to official site
    const logo = document.querySelector('.main-logo');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.title = 'Visit subsoccer.com';
        logo.addEventListener('click', () => window.open('https://www.subsoccer.com', '_blank'));
    }

    injectFooterLink();

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
    document.getElementById('btn-profile-map')?.addEventListener('click', () => showPage('map'));
    document.getElementById('btn-profile-history')?.addEventListener('click', () => showPage('history'));
    document.getElementById('btn-profile-register-game')?.addEventListener('click', () => showPage('games'));

    // Games Section
    document.getElementById('btn-search-location')?.addEventListener('click', () => searchLocation());
    document.getElementById('btn-reg-game')?.addEventListener('click', () => registerGame());
    document.getElementById('btn-update-game')?.addEventListener('click', () => updateGame());
    document.getElementById('btn-cancel-edit-game')?.addEventListener('click', () => cancelEdit());
    document.getElementById('btn-view-transfer-requests')?.addEventListener('click', () => viewOwnershipRequests());

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
    document.getElementById('btn-record-goal-1')?.addEventListener('click', () => recordGoalSound(1));
    document.getElementById('btn-record-goal-2')?.addEventListener('click', () => recordGoalSound(2));
    document.getElementById('btn-accept-rules')?.addEventListener('click', () => acceptRulesAndStart());
    document.getElementById('pro-player-left')?.addEventListener('click', () => addManualGoal(1));
    document.getElementById('pro-player-right')?.addEventListener('click', () => addManualGoal(2));
    document.getElementById('btn-exit-pro-mode')?.addEventListener('click', () => exitProMode());
    document.getElementById('pro-undo-btn')?.addEventListener('click', () => undoLastGoal());

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

        // 12. Bracket Pick
        const bracketItem = e.target.closest('[data-action="bracket-pick"]');
        if (bracketItem) {
            const { handler, index, player } = bracketItem.dataset;
            const idx = parseInt(index);
            if (handler === 'pickWin') pickWin(idx, player, bracketItem);
            else if (handler === 'pickBronzeWinner') pickBronzeWinner(idx, player, bracketItem);
            else if (handler === 'pickEventWinner') pickEventWinner(idx, player);
            else if (handler === 'pickEventBronzeWinner') pickEventBronzeWinner(idx, player);
            return;
        }

        // 13. View Tournament Bracket (Events)
        const viewBracketBtn = e.target.closest('[data-action="view-bracket"]');
        if (viewBracketBtn) {
            const { id, name, max } = viewBracketBtn.dataset;
            viewTournamentBracket(id, name, parseInt(max));
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
        if (action === 'advance-event-round') advanceEventRound();
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
            const el = document.getElementById(`tour - matches - ${tourToggle.dataset.toggleTournament} `);
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
        const emptyMessage = document.createElement('div');
        emptyMessage.innerText = "No players added.";
        list.appendChild(emptyMessage);
        if (countSpan) countSpan.innerText = 0;
        return;
    }
    state.pool.forEach((name, index) => {
        const div = document.createElement('div');
        div.className = "sub-item-row";
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #444; font-family: var(--sub-name-font); font-size: 0.8rem; width: 20px;">${index + 1}.</span>
                <span style="color: white; text-transform: uppercase; font-size: 0.9rem; font-family: var(--sub-name-font); letter-spacing:1px;">${name}</span>
            </div>
            <button class="pool-remove-btn" data-remove-index="${index}">-</button>
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
    const editionClass = state.activeCardEdition !== 'standard' ? `card - ${state.activeCardEdition} -edition` : '';
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

    container.innerHTML = `
    <div class="topps-collectible-card ${editionClass} ${rookieClass}" style="background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%); background-size: 8px 8px; background-color: #0a0a0a;">
            <img src="${(u.avatar_url && u.avatar_url.trim() !== '') ? u.avatar_url : 'placeholder-silhouette-5-wide.png'}" class="card-hero-image" referrerpolicy="no-referrer" onerror="this.src='placeholder-silhouette-5-wide.png'">
            <div class="card-overlay" style="background: ${overlayBg}; height: ${overlayHeight}; border-top: ${state.brand ? '3px solid var(--sub-gold)' : 'none'}; box-shadow: 0 -5px 15px rgba(0,0,0,0.3);"></div>
            <div style="position:absolute; top:15px; left:15px; z-index:11; font-family:'SubsoccerLogo'; font-size:0.8rem; color:var(--sub-gold); opacity:0.8;">${editionLabel} // 2026</div>
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

            const proModeSection = document.getElementById('pro-mode-section');
            if (proModeSection) proModeSection.style.display = isUserAdmin ? 'block' : 'none';

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
        if (menuBtn) menuBtn.style.display = 'block';

        // 2. Kontekstuaalinen UI (Vieraat vs Rekisteröityneet)
        const eventsTab = document.getElementById('tab-events');
        if (eventsTab) eventsTab.style.display = state.user.id === 'guest' ? 'none' : 'flex';

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
                const validPages = ['events', 'profile', 'map', 'leaderboard', 'history', 'tournament'];
                
                if (pageParam && validPages.includes(pageParam)) {
                    state.currentPage = pageParam;
                } else {
                    state.currentPage = 'tournament';
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

    const wins = p.wins || 0;
    const losses = p.losses || 0;
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = p.elo > 1600 ? "PRO" : "ROOKIE";
    const cardHeader = state.brand ? "PARTNER" : rank;
    const avatarUrl = (p.avatar_url && p.avatar_url.trim() !== '') ? p.avatar_url : 'placeholder-silhouette-5-wide.png';
    const rookieClass = (wins + losses) < 5 ? 'status-rookie' : '';

    const html = `<div class="pro-card ${rookieClass}" style="margin:0; width:100% !important; background-image: linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%); background-size: 8px 8px; background-color: #0a0a0a;"><div class="card-inner-frame"><div class="card-header-stripe">${cardHeader} CARD</div><div class="card-image-area"><img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'"></div><div class="card-name-strip">${p.username}</div><div class="card-info-area"><div class="card-stats-row"><div class="card-stat-item"><div class="card-stat-label">RANK</div><div class="card-stat-value">${p.elo}</div></div><div class="card-stat-item"><div class="card-stat-label">WINS</div><div class="card-stat-value">${wins}</div></div><div class="card-stat-item"><div class="card-stat-label">LOSS</div><div class="card-stat-value">${losses}</div></div><div class="card-stat-item"><div class="card-stat-label">W/L</div><div class="card-stat-value">${ratio}</div></div></div><div class="card-bottom-row" style="border-top: 1px solid #222; padding-top: 4px; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:5px;"><img src="https://flagcdn.com/w20/${(p.country || 'fi').toLowerCase()}.png" width="16"><span style="color:#888; font-size:0.55rem; font-family:'Resolve';">REPRESENTING</span></div>${state.brandLogo ? `<img src="${state.brandLogo}" style="height:22px; width:auto; object-fit:contain;">` : `<div style="color:var(--sub-gold); font-size:0.55rem; font-family:'Resolve';">CLUB: PRO</div>`}</div></div></div></div>`;

    const body = document.querySelector('#card-modal .modal-body');
    if (body) body.innerHTML = html;
    initTiltEffect(body.querySelector('.pro-card'));
}

export function closeCardModal() { closeModal('card-modal'); }

export async function showLevelUpCard(playerName, newElo) {
    const isPro = newElo >= 1600;
    const title = isPro ? "⭐ NEW PRO RANK REACHED!" : "📈 RANK UP!";

    const content = `
    <div id="level-up-container" class="level-up-anim">
            <div id="level-up-card-preview">
                <!-- We reuse the player card view here -->
                <p style="text-align:center; color:#888;">Generating your new card...</p>
            </div>
            <div style="margin-top:20px; display:flex; gap:10px;">
                <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" data-share-level-up="${playerName}">
                    <i class="fa fa-share-nodes"></i> SHARE CARD
                </button>
                <button class="btn-red" style="flex:1; background:#333;" onclick="closeModal('level-up-modal')">CLOSE</button>
            </div>
        </div>
    `;

    showModal(title, content, { id: 'level-up-modal', maxWidth: '400px', borderColor: 'var(--sub-gold)' });

    // Render the card inside the modal
    await viewPlayerCard(playerName);
    const cardHtml = document.querySelector('#card-modal .modal-body').innerHTML;
    document.getElementById('level-up-card-preview').innerHTML = cardHtml;
    closeModal('card-modal');

    const previewCard = document.querySelector('#level-up-card-preview .pro-card, #level-up-card-preview .topps-collectible-card');
    if (previewCard) initTiltEffect(previewCard);
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

/**
 * Personoi sovelluksen brändin mukaan (esim. Coca-Cola värit)
 * Käyttö: ?brand=partner
 */
export function applyBranding() {
    const params = new URLSearchParams(window.location.search);
    const brandFromUrl = params.get('brand');
    const logoFromUrl = params.get('logo');
    const colorFromUrl = params.get('color');

    const liveId = params.get('live');

    // Jos ollaan live-näkymässä, piilotetaan globaalit elementit heti ja poistutaan
    if (liveId) {
        document.body.classList.add('live-mode');
        const header = document.querySelector('header');
        const appContent = document.getElementById('app-content');
        const navTabs = document.getElementById('nav-tabs');
        const authPage = document.getElementById('auth-page');

        if (header) header.style.display = 'none';
        if (appContent) appContent.style.display = 'none';
        if (navTabs) navTabs.style.display = 'none';
        if (authPage) authPage.style.display = 'none';
        return; // Ei sovelleta globaalia brändäystä live-näkymään
    }

    // Mahdollisuus nollata brändäys (?brand=none)
    if (brandFromUrl === 'none') {
        localStorage.removeItem('subsoccer-brand');
        localStorage.removeItem('subsoccer-logo');
        localStorage.removeItem('subsoccer-color');
        state.brand = null;
        state.brandLogo = null;
        return;
    }

    // Haetaan tallennettu brändi tai käytetään URL-parametria
    const brandId = brandFromUrl || localStorage.getItem('subsoccer-brand');
    const logoUrl = logoFromUrl || localStorage.getItem('subsoccer-logo');
    const colorHex = colorFromUrl || localStorage.getItem('subsoccer-color');

    // Lisätään hienovarainen hiilikuitukuvio taustalle (Subtle Carbon Fiber)
    document.body.style.backgroundColor = '#0a0a0a';
    document.body.style.backgroundImage = `
        linear-gradient(45deg, #0d0d0d 25%, transparent 25%),
        linear-gradient(-45deg, #0d0d0d 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #0d0d0d 75%),
        linear-gradient(-45deg, transparent 75%, #0d0d0d 75%)
    `;
    document.body.style.backgroundSize = '8px 8px';

    if (brandFromUrl && brandFromUrl !== 'none') {
        localStorage.setItem('subsoccer-brand', brandFromUrl);
        state.brand = brandFromUrl;
    }
    if (logoFromUrl && logoFromUrl !== '') {
        localStorage.setItem('subsoccer-logo', logoFromUrl);
        state.brandLogo = logoFromUrl;
    }
    if (colorFromUrl && colorFromUrl !== '') {
        localStorage.setItem('subsoccer-color', colorFromUrl);
    }

    if (brandId) {
        state.brand = brandId;
        state.brandLogo = logoUrl;

        // Käytetään annettua väriä tai oletus-partner-punaista
        let primaryColor = colorHex ? (colorHex.startsWith('#') ? colorHex : '#' + colorHex) : null;
        if (!primaryColor && brandId === 'partner') primaryColor = '#F40009';

        if (primaryColor) {
            document.documentElement.style.setProperty('--sub-red', primaryColor);
            document.documentElement.style.setProperty('--sub-gold', '#FFFFFF');
        }

        const logo = document.querySelector('.main-logo');
        if (logo) {
            if (logoUrl) {
                logo.src = logoUrl;
                logo.style.filter = 'none';
            } else {
                logo.style.filter = 'brightness(0) invert(1)';
            }
            logo.style.opacity = '1';
            logo.style.display = 'block';
        }

        // Näytetään splash screen vain jos tultiin suoralla linkillä
        if (brandFromUrl) {
            showPartnerSplashScreen(logoUrl, primaryColor);
        }
        console.log(`🤝 Branding Applied: ${brandId} `);
    } else {
        // Palautetaan oletusilme (Subsoccer)
        document.documentElement.style.setProperty('--sub-red', '#E30613');
        document.documentElement.style.setProperty('--sub-gold', '#FFD700');
        const logo = document.querySelector('.main-logo');
        if (logo) {
            logo.src = 'logo.png';
            logo.style.filter = 'none';
        }
    }
}

function showPartnerSplashScreen(logoUrl, bgColor) {
    const splash = document.createElement('div');
    splash.id = 'partner-splash';
    splash.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: ${bgColor || '#F40009'}; z-index: 100000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-family: 'Resolve', sans-serif;
        transition: opacity 0.8s ease-out;
`;
    splash.innerHTML = `
    <div style="font-size: 1.2rem; letter-spacing: 4px; margin-bottom: 20px; opacity: 0.8;">SUBSOCCER</div>
        ${logoUrl ? `<img src="${logoUrl}" style="max-height: 80px; margin-bottom: 20px;">` : ''}
        <div style="font-size: 2.5rem; font-weight: bold; letter-spacing: 2px; text-align: center; padding: 0 20px; line-height: 1.1;">
            OFFICIAL<br>PARTNER
        </div>
        <div style="margin-top: 40px; width: 40px; height: 2px; background: white; opacity: 0.5;"></div>
`;
    document.body.appendChild(splash);
    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 800);
    }, 2000);
}

/**
 * Injects a small footer link to the official site
 */
function injectFooterLink() {
    const container = document.getElementById('app-content');
    if (!container || document.getElementById('subsoccer-footer-link')) return;

    const footer = document.createElement('div');
    footer.id = 'subsoccer-footer-link';
    footer.className = 'subsoccer-footer';
    footer.innerHTML = '<a href="https://www.subsoccer.com" target="_blank">WWW.SUBSOCCER.COM</a>';
    container.appendChild(footer);
}