/**
 * Näyttää toast-tyyppisen ilmoituksen ruudun yläreunassa.
 * @param {string} message - Näytettävä viesti.
 * @param {string} [type='error'] - Ilmoituksen tyyppi ('success' tai 'error').
 */
function showNotification(message, type = 'error') {
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
 * Vaihtaa näkyvän sivun (section) ja aktivoi vastaavan välilehden.
 * @param {string} p - Näytettävän sivun ID ilman 'section-'-etuliitettä.
 */
function showPage(p) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('section-' + p).classList.add('active');
    const t = document.getElementById('tab-' + p);
    if (t) {
        t.classList.add('active');
    }
    
    // Update currentPageIndex for swipe navigation
    const pages = ['profile', 'tournament', 'events', 'map', 'leaderboard'];
    const pageIdx = pages.indexOf(p);
    if (pageIdx !== -1) {
        currentPageIndex = pageIdx;
    }
    
    // Funktiot, jotka suoritetaan sivun vaihdon yhteydessä
    if (p === 'profile') loadUserProfile();
    if (p === 'leaderboard') fetchLB();
    if (p === 'history') fetchHist();
    if (p === 'games') fetchMyGames();
    if (p !== 'games') cancelEdit(); // Reset edit mode when leaving tab
    if (p === 'map') fetchPublicGamesMap();
    if (p === 'events') loadEventsPage();

    // Alustaa kartan 'games'-sivulla
    if (p === 'games') {
        setTimeout(() => {
            if (!gameMap) initGameMap();
            else gameMap.invalidateSize();
        }, 200);
    }
}

/**
 * Hakee maat Supabasesta ja täyttää pudotusvalikon.
 */
async function populateCountries() {
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
function populateGameSelect() {
    const sel = document.getElementById('tournament-game-select');
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>Select Game Table</option>';
    allGames.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.game_name;
        sel.appendChild(opt);
    });
}

/**
 * Vaihtaa Quick Match ja Tournament osioiden välillä.
 */
function showMatchMode(mode) {
    const quickSection = document.getElementById('quick-match-section');
    const tournamentSection = document.getElementById('tournament-section');
    const quickBtn = document.getElementById('btn-quick-match-mode');
    const tournamentBtn = document.getElementById('btn-tournament-mode');
    
    if (mode === 'quick') {
        quickSection.style.display = 'block';
        tournamentSection.style.display = 'none';
        
        // Quick Match - active (red gradient)
        quickBtn.style.background = 'linear-gradient(135deg, #E30613 0%, #c00510 100%)';
        quickBtn.style.color = '#fff';
        quickBtn.style.border = 'none';
        quickBtn.style.boxShadow = '0 4px 15px rgba(227,6,19,0.3)';
        quickBtn.querySelector('div:last-child').style.color = 'rgba(255,255,255,0.7)';
        
        // Tournament - inactive (dark)
        tournamentBtn.style.background = '#1a1a1a';
        tournamentBtn.style.color = '#888';
        tournamentBtn.style.border = '2px solid #333';
        tournamentBtn.style.boxShadow = 'none';
        tournamentBtn.querySelector('div:last-child').style.color = '#666';
    } else {
        quickSection.style.display = 'none';
        tournamentSection.style.display = 'block';
        
        // Quick Match - inactive (dark)
        quickBtn.style.background = '#1a1a1a';
        quickBtn.style.color = '#888';
        quickBtn.style.border = '2px solid #333';
        quickBtn.style.boxShadow = 'none';
        quickBtn.querySelector('div:last-child').style.color = '#666';
        
        // Tournament - active (gold gradient)
        tournamentBtn.style.background = 'linear-gradient(135deg, #FFD700 0%, #d4af37 100%)';
        tournamentBtn.style.color = '#000';
        tournamentBtn.style.border = 'none';
        tournamentBtn.style.boxShadow = '0 4px 15px rgba(255,215,0,0.3)';
        tournamentBtn.querySelector('div:last-child').style.color = 'rgba(0,0,0,0.6)';
    }
}

/**
 * Näyttää tai piilottaa turnauksen lisäasetukset.
 */
function toggleTournamentMode() {
    const el = document.getElementById('advanced-tour-settings');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/**
 * Swipe-toiminnallisuus välilehtien vaihtamiseen
 */
let touchStartX = 0;
let touchEndX = 0;
const pages = ['profile', 'tournament', 'events', 'map', 'leaderboard'];
let currentPageIndex = 1; // Aloitetaan tournament-sivulta

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

// Globaalit kytkennät HTML:ää varten
window.showPage = showPage;
window.showNotification = showNotification;
window.showMatchMode = showMatchMode;
window.toggleTournamentMode = toggleTournamentMode;
window.populateCountries = populateCountries;
window.loadUserProfile = loadUserProfile;
window.showEditProfile = showEditProfile;
window.cancelEditProfile = cancelEditProfile;

/**
 * Lataa ja näyttää käyttäjän profiilin tiedot
 */
async function loadUserProfile() {
    if (!user || !user.id) return;
    
    // Päivitä avatar
    const avatarEl = document.getElementById('profile-avatar-display');
    const previewEl = document.getElementById('avatar-preview');
    if (avatarEl && user.avatar) {
        avatarEl.src = user.avatar;
    }
    if (previewEl && user.avatar) {
        previewEl.src = user.avatar;
    }
    
    // Päivitä nimi
    const usernameEl = document.getElementById('profile-username');
    if (usernameEl) {
        usernameEl.innerText = user.username || 'Player';
    }
    
    // Päivitä maa
    const countryEl = document.getElementById('profile-country');
    if (countryEl && user.country) {
        countryEl.innerText = '🌍 ' + user.country.toUpperCase();
    } else if (countryEl) {
        countryEl.innerText = '🌍 Set your country';
    }
    
    // Päivitä ELO
    const eloEl = document.getElementById('profile-elo');
    if (eloEl) {
        eloEl.innerText = user.elo || 1000;
    }
    
    // Hae otteluiden määrä
    const matchesEl = document.getElementById('profile-matches');
    if (matchesEl && user.id !== 'guest') {
        try {
            const { count } = await _supabase
                .from('matches')
                .select('*', { count: 'exact', head: true })
                .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`);
            matchesEl.innerText = count || 0;
        } catch(e) {
            matchesEl.innerText = '0';
        }
    }
    
    // Lataa pelit
    fetchMyGames();
}

/**
 * Näyttää profiilin muokkauslomakkeen
 */
function showEditProfile() {
    const editFields = document.getElementById('profile-edit-fields');
    if (editFields) {
        editFields.style.display = 'block';
        
        // Täytä lomake nykyisillä tiedoilla
        const countryInput = document.getElementById('country-input');
        const emailInput = document.getElementById('email-input');
        
        if (countryInput && user.country) {
            countryInput.value = user.country;
        }
        if (emailInput && user.email) {
            emailInput.value = user.email;
        }
    }
}

/**
 * Piilottaa profiilin muokkauslomakkeen
 */
function cancelEditProfile() {
    const editFields = document.getElementById('profile-edit-fields');
    if (editFields) {
        editFields.style.display = 'none';
    }
}