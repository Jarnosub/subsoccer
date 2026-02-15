import { state, _supabase } from './config.js';
import { CardGenerator } from './card-generator.js';

// Swipe-toiminnallisuus muuttujat (siirretty alkuun ReferenceErrorin välttämiseksi)
let touchStartX = 0;
let touchEndX = 0;
const pages = ['profile', 'tournament', 'events', 'map', 'leaderboard'];
let currentPageIndex = 1; // Aloitetaan tournament-sivulta

/**
 * Näyttää toast-tyyppisen ilmoituksen ruudun yläreunassa.
 * @param {string} message - Näytettävä viesti.
 * @param {string} [type='error'] - Ilmoituksen tyyppi ('success' tai 'error').
 */
export function showNotification(message, type = 'error') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `toast-notification ${type}`;
    notification.innerText = message;
    container.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 4000); // Ilmoitus poistuu 4 sekunnin kuluttua
}

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
    
    // Soita äänet
    if (window.soundEffects && typeof window.soundEffects.playCrowdCheer === 'function') {
        window.soundEffects.playCrowdCheer();
    }
}

/**
 * Vaihtaa näkyvän sivun (section) ja aktivoi vastaavan välilehden.
 * @param {string} p - Näytettävän sivun ID ilman 'section-'-etuliitettä.
 */
export function showPage(p) {
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
        if(document.getElementById('profile-games-ui')) 
            document.getElementById('profile-games-ui').style.display = 'none';
        if(document.getElementById('profile-dashboard-ui')) 
            document.getElementById('profile-dashboard-ui').style.display = 'block';
        loadUserProfile();
        if (typeof updateProfileCard === 'function') updateProfileCard();
    }
    if (p === 'leaderboard' && window.fetchLB) window.fetchLB();
    if (p === 'history' && window.fetchHist) window.fetchHist();
    if (p === 'games' && window.fetchMyGames) window.fetchMyGames();
    if (p !== 'games' && window.cancelEdit) window.cancelEdit(); 
    if (p !== 'profile') cancelEditProfile();
    if (p === 'map' && window.fetchPublicGamesMap) window.fetchPublicGamesMap();
    if (p === 'events' && window.loadEventsPage) window.loadEventsPage();

    // Alustaa kartan 'games'-sivulla
    if (p === 'games') {
        setTimeout(() => {
            if (!state.gameMap && window.initGameMap) window.initGameMap();
            else state.gameMap.invalidateSize();
        }, 200);
    }
}

/**
 * Hakee maat Supabasesta ja täyttää pudotusvalikon.
 */
export async function populateCountries() {
    const select = document.getElementById('country-input');
    if (!select) return;

    try {
        const { data, error } = await _supabase.from('countries').select('name, code').order('name');
        if (error) throw error;

        if (data && data.length > 0) {
            select.innerHTML = '<option value="" disabled selected>Select Country</option>';
            data.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.code.toLowerCase();
                opt.innerText = c.name;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Maiden haku epäonnistui:", e);
        select.innerHTML = '<option value="fi">Finland</option>'; // Fallback
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
                .or(`player1.eq.${state.user.username},player2.eq.${state.user.username}`);
            matchesEl.innerText = count || 0;
        } catch(e) {
            matchesEl.innerText = '0';
        }
    }
    
    // Lataa pelit
    if (window.fetchMyGames) window.fetchMyGames();
}

/**
 * Näyttää profiilin muokkauslomakkeen
 */
export function showEditProfile() {
    const fields = document.getElementById('profile-edit-fields'); 
    if(!fields) return;
    fields.style.display = 'block';
    document.getElementById('profile-dashboard-ui').style.display = 'none'; // Piilota napit
    
    // Haetaan arvot state.userista (joka on nyt ladattu auth.js:ssä)
    const mapping = {
        'edit-full-name': state.user.full_name,
        'edit-email': state.user.email,
        'edit-phone': state.user.phone,
        'edit-city': state.user.city,
        'country-input': state.user.country
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
}

/**
 * Keskitetty Modal-järjestelmä
 */
export function showModal(title, content, options = {}) {
    const modalId = options.id || 'generic-modal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        document.body.appendChild(modal);
    }
    
    modal.className = 'modal-overlay';
    const maxWidth = options.maxWidth || '500px';
    const borderColor = options.borderColor || 'var(--sub-gold)';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: ${maxWidth}; border-color: ${borderColor};">
            <div class="modal-header">
                <h3 style="color: ${borderColor};">${title}</h3>
                <button class="modal-close" onclick="closeModal('${modalId}')">&times;</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Sulje klikkaamalla taustaa
    modal.onclick = (e) => {
        if (e.target === modal) closeModal(modalId);
    };

    // Estä skrollaus taustalla
    document.body.style.overflow = 'hidden';
}

export function closeModal(id = 'generic-modal') {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Palauta skrollaus jos muita modaaleja ei ole auki
    const openModals = document.querySelectorAll('.modal-overlay[style*="display: flex"]');
    if (openModals.length === 0) {
        document.body.style.overflow = '';
    }
}

export function showLoading(message = 'Loading...') {
    let loader = document.getElementById('loading-overlay');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'loading-overlay';
        loader.innerHTML = '<div class="spinner"></div><div id="loading-text" style="font-family:var(--sub-name-font); color:var(--sub-gold); letter-spacing:2px; text-transform:uppercase; font-size:0.8rem;"></div>';
        document.body.appendChild(loader);
    }
    const textEl = document.getElementById('loading-text');
    if (textEl) textEl.innerText = message;
    loader.style.display = 'flex';
}

export function hideLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = 'none';
}

/**
 * Globaali virheidenhallinta
 */
export function setupGlobalErrorHandling() {
    window.onerror = function(message, source, lineno, colno, error) {
        console.error("🚀 Subsoccer Global Error:", message, error);
        // Estetään spämmäys, näytetään vain kriittiset
        if (message.includes('Script error') || message.includes('ResizeObserver')) return false;
        showNotification("An unexpected error occurred. Please refresh if the app behaves strangely.", "error");
        return false;
    };

    window.onunhandledrejection = function(event) {
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
        card.style.setProperty('--x', `${x}px`);
        card.style.setProperty('--y', `${y}px`);
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

// Globaalit kytkennät
window.showPage = showPage;
window.showNotification = showNotification;
window.showMatchMode = showMatchMode;
window.toggleTournamentMode = toggleTournamentMode;
window.populateCountries = populateCountries;
window.loadUserProfile = loadUserProfile;
window.showEditProfile = showEditProfile;
window.cancelEditProfile = cancelEditProfile;
window.showVictoryAnimation = showVictoryAnimation;
window.showModal = showModal;
window.closeModal = closeModal;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.setupGlobalErrorHandling = setupGlobalErrorHandling;
window.toggleTheme = toggleTheme;
window.initTiltEffect = initTiltEffect;

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
            <button class="pool-remove-btn" onclick="removeFromPool(${index})">-</button>
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
    if (el) el.innerHTML = state.sessionGuests.map(g => `<span class="guest-badge" style="background:#333; padding:5px 10px; border-radius:15px; font-size:0.7rem; cursor:pointer; margin:4px; display:inline-block; border:1px solid #444;" onclick="directAdd('${g}')">${g}</span>`).join('');
}

export function updateProfileCard() {
    const container = document.getElementById('profile-card-container');
    if (!container || !state.user) return;
    const u = state.user;
    const editionClass = state.activeCardEdition !== 'standard' ? `card-${state.activeCardEdition}-edition` : '';
    
    const labels = {
        'standard': 'PRO CARD',
        'elite': 'ELITE SERIES',
        'global': 'GLOBAL PRO',
        'legendary-gold': 'LEGENDARY GOLD'
    };
    const editionLabel = labels[state.activeCardEdition] || 'PRO CARD';

    container.innerHTML = `
        <div class="topps-collectible-card ${editionClass}">
            <img src="${u.avatar_url || 'placeholder-silhouette-5-wide.png'}" class="card-hero-image" onerror="this.src='placeholder-silhouette-5-wide.png'">
            <div class="card-overlay"></div>
            <div style="position:absolute; top:15px; left:15px; z-index:11; font-family:'SubsoccerLogo'; font-size:0.8rem; color:var(--sub-gold); opacity:0.8;">${editionLabel} // 2026</div>
            <div class="card-content-bottom">
                <div style="color:var(--sub-gold); font-size:0.7rem; letter-spacing:2px; margin-bottom:4px;"><i class="fa-solid fa-location-dot"></i> ${u.city || 'HELSINKI'}</div>
                <div class="card-player-name">${u.username}</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:10px;">
                    <div class="card-elo-badge">${u.elo || 1300} ELO</div>
                    <div style="text-align:right;"><div style="color:#666; font-size:0.6rem; text-transform:uppercase;">Win Ratio</div><div style="color:white; font-size:1rem;">${((u.wins / (Math.max(1, u.wins + (u.losses || 0)))) * 100).toFixed(0)}%</div></div>
                </div>
            </div>
            <div style="position:absolute; bottom:15px; right:15px; width:30px; height:30px; background:radial-gradient(circle, #ffd700, #b8860b); border-radius:50%; opacity:0.3; z-index:11; filter:blur(1px);"></div>
        </div>
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button class="btn-red" style="flex:1; background:#222; font-size:0.7rem;" onclick="showCardShop()">
                <i class="fa fa-shopping-cart"></i> UPGRADE CARD
            </button>
            <button class="btn-red" style="flex:1; font-size:0.7rem;" onclick="downloadFanCard()">
                <i class="fa fa-download"></i> SAVE IMAGE
            </button>
        </div>
    `;

    const card = container.querySelector('.topps-collectible-card');
    if (card) initTiltEffect(card);
}

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
    const { count: totalGames } = await _supabase.from('matches').select('*', { count: 'exact', head: true }).or(`player1.eq.${targetUsername},player2.eq.${targetUsername}`);
    
    if (!p) {
        const body = document.querySelector('#card-modal .modal-body');
        if (body) body.innerHTML = '<p>Player not found.</p>';
        return;
    }

    const wins = p.wins || 0;
    const losses = Math.max(0, (totalGames || 0) - wins);
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = p.elo > 1600 ? "PRO" : "ROOKIE";
    const avatarUrl = p.avatar_url ? p.avatar_url : 'placeholder-silhouette-5-wide.png';
    
    const html = `<div class="pro-card" style="margin:0; width:100% !important;"><div class="card-inner-frame"><div class="card-header-stripe">${rank} CARD</div><div class="card-image-area"><img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'"></div><div class="card-name-strip">${p.username}</div><div class="card-info-area"><div class="card-stats-row"><div class="card-stat-item"><div class="card-stat-label">RANK</div><div class="card-stat-value">${p.elo}</div></div><div class="card-stat-item"><div class="card-stat-label">WINS</div><div class="card-stat-value">${wins}</div></div><div class="card-stat-item"><div class="card-stat-label">LOSS</div><div class="card-stat-value">${losses}</div></div><div class="card-stat-item"><div class="card-stat-label">W/L</div><div class="card-stat-value">${ratio}</div></div></div><div class="card-bottom-row" style="border-top: 1px solid #222; padding-top: 4px; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:5px;"><img src="https://flagcdn.com/w20/${(p.country || 'fi').toLowerCase()}.png" width="16"><span style="color:#888; font-size:0.55rem; font-family:'Resolve';">REPRESENTING</span></div><div style="color:var(--sub-gold); font-size:0.55rem; font-family:'Resolve';">CLUB: PRO</div></div></div></div></div>`;
    
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
                <button class="btn-red" style="flex:1; background:var(--sub-gold); color:#000;" onclick="shareMyLevelUp('${playerName}')">
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

window.shareMyLevelUp = async (playerName) => {
    const dataUrl = await CardGenerator.capture('level-up-container');
    if (dataUrl) CardGenerator.share(dataUrl, playerName);
};

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
                    <button class="btn-red" style="width:auto; padding:8px 15px; font-size:0.8rem;" onclick="purchaseEdition('${e.id}')">
                        BUY NOW
                    </button>
                </div>
            `).join('')}
        </div>
    `;

    showModal('SUBSOCCER COLLECTIBLE SHOP', html, { maxWidth: '450px' });
}

window.purchaseEdition = async (editionId) => {
    // Tässä kohtaa tapahtuisi oikea maksuintegraatio (Stripe/PayPal)
    showLoading('Processing transaction...');
    
    setTimeout(() => {
        hideLoading();
        state.activeCardEdition = editionId;
        state.inventory.push(editionId);
        updateProfileCard();
        closeModal();
    }, 1500);
};

window.updatePoolUI = updatePoolUI;
window.removeFromPool = removeFromPool;
window.clearPool = clearPool;
window.updateGuestUI = updateGuestUI;
window.updateProfileCard = updateProfileCard;
window.updateAvatarPreview = updateAvatarPreview;
window.viewPlayerCard = viewPlayerCard;
window.closeCardModal = closeCardModal;
window.downloadFanCard = downloadFanCard;
window.showLevelUpCard = showLevelUpCard;
window.showCardShop = showCardShop;