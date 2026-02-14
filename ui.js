import { state, _supabase } from './config.js';

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
        div.style = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; background: #0a0a0a; padding: 10px 15px; border-radius: var(--sub-radius); border: 1px solid #222;";
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #444; font-family: var(--sub-name-font); font-size: 0.8rem; width: 20px;">${index + 1}.</span>
                <span style="color: white; text-transform: uppercase; font-size: 0.9rem; font-family: var(--sub-name-font); letter-spacing:1px;">${name}</span>
            </div>
            <button onclick="removeFromPool(${index})" style="background: #333; color: #888; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-weight: bold;">-</button>
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
    container.innerHTML = `
        <div class="topps-collectible-card">
            <img src="${u.avatar_url || 'https://via.placeholder.com/400x600'}" class="card-hero-image">
            <div class="card-overlay"></div>
            <div style="position:absolute; top:15px; left:15px; z-index:11; font-family:'SubsoccerLogo'; font-size:0.8rem; color:var(--sub-gold); opacity:0.8;">PRO CARD // 2026</div>
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
        <p style="text-align:center; color:#555; font-size:0.7rem; margin-top:10px;">DESIGNED FOR THE SUBSOCCER PRO ECOSYSTEM</p>
    `;
}

export function updateAvatarPreview(url) {
    const img = document.getElementById('avatar-preview');
    if (img) {
        img.src = url || 'placeholder-silhouette-5-wide.png';
        img.onerror = () => { img.src = 'placeholder-silhouette-5-wide.png'; };
    }
}

export async function viewPlayerCard(targetUsername) {
    const modal = document.getElementById('card-modal');
    const container = document.getElementById('modal-card-container');
    modal.style.display = 'flex';
    container.innerHTML = '<p style="font-family:\'Russo One\'">LOADING CARD...</p>';
    const { data: p } = await _supabase.from('players').select('*').eq('username', targetUsername).maybeSingle();
    const { count: totalGames } = await _supabase.from('matches').select('*', { count: 'exact', head: true }).or(`player1.eq.${targetUsername},player2.eq.${targetUsername}`);
    if (!p) return;
    const wins = p.wins || 0;
    const losses = Math.max(0, (totalGames || 0) - wins);
    const ratio = losses > 0 ? (wins / losses).toFixed(2) : (wins > 0 ? "1.00" : "0.00");
    const rank = p.elo > 1600 ? "PRO" : "ROOKIE";
    const avatarUrl = p.avatar_url ? p.avatar_url : 'placeholder-silhouette-5-wide.png';
    container.innerHTML = `<div class="pro-card" style="margin:0;"><div class="card-inner-frame"><div class="card-header-stripe">${rank} CARD</div><div class="card-image-area"><img src="${avatarUrl}" referrerpolicy="no-referrer" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder-silhouette-5-wide.png'"></div><div class="card-name-strip">${p.username}</div><div class="card-info-area"><div class="card-stats-row"><div class="card-stat-item"><div class="card-stat-label">RANK</div><div class="card-stat-value">${p.elo}</div></div><div class="card-stat-item"><div class="card-stat-label">WINS</div><div class="card-stat-value">${wins}</div></div><div class="card-stat-item"><div class="card-stat-label">LOSS</div><div class="card-stat-value">${losses}</div></div><div class="card-stat-item"><div class="card-stat-label">W/L</div><div class="card-stat-value">${ratio}</div></div></div><div class="card-bottom-row" style="border-top: 1px solid #222; padding-top: 4px; display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:5px;"><img src="https://flagcdn.com/w20/${(p.country || 'fi').toLowerCase()}.png" width="16"><span style="color:#888; font-size:0.55rem; font-family:'Russo One';">REPRESENTING</span></div><div style="color:var(--sub-gold); font-size:0.55rem; font-family:'Russo One';">CLUB: PRO</div></div></div></div></div>`;
}

export function closeCardModal() { document.getElementById('card-modal').style.display = 'none'; }

export async function downloadFanCard() {
    const cardElement = document.querySelector('.pro-card');
    if (!cardElement) return showNotification("Card element not found", "error");
    await document.fonts.load('1em Resolve');
    showNotification("Generating high-res card...", "success");
    try {
        const canvas = await html2canvas(cardElement, { useCORS: true, allowTaint: true, backgroundColor: "#000000", scale: 4, logging: false });
        const link = document.createElement('a');
        link.download = `Subsoccer_ProCard_${state.user.username}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        showNotification("Card saved to your device!", "success");
    } catch (err) { console.error("Canvas error:", err); showNotification("Download failed. Check image permissions.", "error"); }
}

window.updatePoolUI = updatePoolUI;
window.removeFromPool = removeFromPool;
window.clearPool = clearPool;
window.updateGuestUI = updateGuestUI;
window.updateProfileCard = updateProfileCard;
window.updateAvatarPreview = updateAvatarPreview;
window.viewPlayerCard = viewPlayerCard;
window.closeCardModal = closeCardModal;
window.downloadFanCard = downloadFanCard;