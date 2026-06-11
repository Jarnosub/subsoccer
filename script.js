import { _supabase, state } from './config.js';
import { OfflineQueue } from './offline-queue.js';

// XSS protection: escape user-controlled strings before inserting into HTML
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
};

// ============================================================
// OFFLINE QUEUE INITIALIZATION
// ============================================================
OfflineQueue.init().then(() => {
    // Päivitä UI-badge heti alustuksen jälkeen
    OfflineQueue.updateBadge();
});

// ============================================================
// 2. PELAAJAPOOLIN HALLINTA (haku, lisäys, poisto)
// ============================================================

export async function handleSearch(v) {
    const r = document.getElementById('search-results');
    if (!v) { r.style.display = 'none'; return; }
    
    const q = v.trim().toUpperCase();
    let dbNames = [];

    // FIX: Haetaan pelaajat suoraan tietokannasta (state.allDbNames poistettiin optimoinnin vuoksi)
    try {
        const { data } = await _supabase.from('players').select('username').ilike('username', `%${q}%`).limit(5);
        if (data) dbNames = data.map(p => p.username);
    } catch (e) { console.error(e); }

    const combined = [...new Set([...dbNames, ...state.sessionGuests])];
    const f = combined.filter(n => n.toUpperCase().includes(q) && !state.pool.includes(n));
    
    r.innerHTML = f.map(n => `<div class="search-item" data-action="direct-add" data-name="${escapeHTML(n)}">${escapeHTML(n)}</div>`).join('') + 
                  `<div class="search-item" style="color:var(--sub-gold);" data-action="direct-add" data-name="${escapeHTML(q)}">Add: "${escapeHTML(q)}"</div>`;
    r.style.display = 'block';
}

export function addP() {
    const i = document.getElementById('add-p-input');
    const n = i.value.trim().toUpperCase();
    if (n && !state.pool.includes(n)) { state.pool = [...state.pool, n]; }
    i.value = '';
    document.getElementById('search-results').style.display = 'none';
}

export function directAdd(n) {
    const nameUpper = n.toUpperCase();
    if (!state.pool.includes(nameUpper)) { state.pool = [...state.pool, nameUpper]; }
    document.getElementById('add-p-input').value = '';
    document.getElementById('search-results').style.display = 'none';
}

// ============================================================
// 10. CONNECTION WATCHDOG + OFFLINE SYNC
// ============================================================

let wasOffline = false;
const checkConnection = async () => {
    const dot = document.getElementById('conn-dot');
    if (!dot) return;

    // Näytä/piilota offline-palkki
    const offlineBar = document.getElementById('offline-bar');

    if (!navigator.onLine) {
        if (!wasOffline) {
            if (window.showNotification) window.showNotification("No internet connection", "error");
            wasOffline = true;
        }
        dot.classList.add('dot-offline');
        if (offlineBar) offlineBar.classList.add('visible');
        return;
    }

    // Piilota offline-palkki kun yhteys palaa
    if (offlineBar) offlineBar.classList.remove('visible');

    try {
        // Tehdään kevyt haku vain jos oltiin offline-tilassa
        if (wasOffline) {
            const { error } = await _supabase.from('players').select('id').limit(1);
            if (!error) {
                if (window.showNotification) window.showNotification("Connection restored", "success");
                wasOffline = false;
                dot.classList.remove('dot-offline');
                
                // 🔄 Synkronoi offline-jono automaattisesti
                const pendingCount = await OfflineQueue.getPendingCount();
                if (pendingCount > 0) {
                    console.log(`[ConnectionWatchdog] 🔄 Connection restored — syncing ${pendingCount} offline matches`);
                    await OfflineQueue.syncAll();
                }
            }
        }
    } catch (e) {}
};

setInterval(checkConnection, 30000);
window.addEventListener('online', checkConnection);
window.addEventListener('offline', checkConnection);

// ============================================================
// 11. GLOBAALIT KYTKENNÄT (window-objekti)
// ============================================================
window.handleSearch = handleSearch;
window.addP = addP;
window.directAdd = directAdd;