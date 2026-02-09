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
    } else if (p === 'history' || p === 'games') {
        const tm = document.getElementById('tab-more');
        if (tm) tm.classList.add('active');
    }
    // Funktiot, jotka suoritetaan sivun vaihdon yhteydessä
    if (p === 'leaderboard') fetchLB();
    if (p === 'history') fetchHist();
    if (p === 'games') fetchMyGames();
    if (p !== 'games') cancelEdit(); // Reset edit mode when leaving tab
    if (p === 'map') fetchPublicGamesMap();

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
 * Näyttää tai piilottaa turnauksen lisäasetukset.
 */
function toggleTournamentMode() {
    const el = document.getElementById('advanced-tour-settings');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// Globaalit kytkennät HTML:ää varten
window.showPage = showPage;
window.showNotification = showNotification;
window.toggleTournamentMode = toggleTournamentMode;
window.populateCountries = populateCountries;