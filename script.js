import { _supabase, state } from './config.js';

// ============================================================
// 2. PELAAJAPOOLIN HALLINTA (haku, lisäys, poisto)
// ============================================================

export async function handleSearch(v) {
    const r = document.getElementById('search-results');
    if (!v) { r.style.display = 'none'; return; }
    
    const q = v.trim().toUpperCase();
    let dbNames = [];

    // SECURITY/UX PATCH: Do not allow searching the entire DB for online players.
    // Online players must join via QR. Manual additions are for Local Guests only.
    // We keep dbNames empty so only sessionGuests and raw manual names are used.

    const combined = [...new Set([...dbNames, ...state.sessionGuests])];
    const f = combined.filter(n => n.toUpperCase().includes(q) && !state.pool.includes(n));
    
    r.innerHTML = f.map(n => `<div class="search-item" data-action="direct-add" data-name="${n}">${n}</div>`).join('') + 
                  `<div class="search-item" style="color:var(--sub-gold);" data-action="direct-add" data-name="${q}">Add: "${q}"</div>`;
    r.style.display = 'block';
}

export function addP() {
    const i = document.getElementById('add-p-input');
    let raw = i.value.trim().toUpperCase();
    if (!raw) return;
    
    // Prefix with \u200B (Zero-Width Space) to ensure it fails exact DB username matched in MatchService
    const n = '\u200B' + raw;
    if (!state.pool.includes(n)) { state.pool = [...state.pool, n]; }
    i.value = '';
    document.getElementById('search-results').style.display = 'none';
}

export function directAdd(n) {
    const nameUpper = n.toUpperCase();
    // Prefix with \u200B if not already there, guaranteeing it fails DB ilike lookups
    const finalName = nameUpper.startsWith('\u200B') ? nameUpper : ('\u200B' + nameUpper);
    if (!state.pool.includes(finalName)) { state.pool = [...state.pool, finalName]; }
    const i = document.getElementById('add-p-input');
    if (i) i.value = '';
    const r = document.getElementById('search-results');
    if (r) r.style.display = 'none';
}

// ============================================================
// 10. CONNECTION WATCHDOG
// ============================================================

let wasOffline = false;
const checkConnection = async () => {
    const dot = document.getElementById('conn-dot');
    if (!dot) return;

    if (!navigator.onLine) {
        if (!wasOffline) {
            if (window.showNotification) window.showNotification("No internet connection", "error");
            wasOffline = true;
        }
        dot.classList.add('dot-offline');
        return;
    }

    try {
        // Tehdään kevyt haku vain jos oltiin offline-tilassa
        if (wasOffline) {
            const { error } = await _supabase.from('players').select('id').limit(1);
            if (!error) {
                if (window.showNotification) window.showNotification("Connection restored", "success");
                wasOffline = false;
                dot.classList.remove('dot-offline');
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