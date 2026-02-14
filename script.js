import { _supabase, state } from './config.js';
import { updatePoolUI, showNotification } from './ui.js';

// ============================================================
// 2. PELAAJAPOOLIN HALLINTA (haku, lisäys, poisto)
// ============================================================

export function handleSearch(v) {
    const r = document.getElementById('search-results');
    if (!v) { r.style.display = 'none'; return; }
    const q = v.toUpperCase(), combined = [...new Set([...state.allDbNames, ...state.sessionGuests])], f = combined.filter(n => n.includes(q) && !state.pool.includes(n));
    r.innerHTML = f.map(n => `<div class="search-item" onclick="directAdd('${n}')">${n}</div>`).join('') + `<div class="search-item" onclick="directAdd('${q}')">Add: "${q}"</div>`;
    r.style.display = 'block';
}

export function addP() {
    const i = document.getElementById('add-p-input');
    const n = i.value.trim().toUpperCase();
    if (n && !state.pool.includes(n)) { state.pool.push(n); updatePoolUI(); }
    i.value = '';
    document.getElementById('search-results').style.display = 'none';
}

export function directAdd(n) {
    if (!state.pool.includes(n)) { state.pool.push(n); updatePoolUI(); }
    document.getElementById('add-p-input').value = '';
    document.getElementById('search-results').style.display = 'none';
}

    const serialNumber = document.getElementById('game-serial-input').value.trim();
// ============================================================
// 10. CONNECTION WATCHDOG
// ============================================================

let wasOffline = false;
setInterval(async () => {
    const dot = document.getElementById('conn-dot');
    if (!dot) return;
    try {
        const { error } = await _supabase.from('players').select('username').limit(1);
        if (error) throw error;
        
        if (wasOffline) {
            showNotification("Connection restored", "success");
            wasOffline = false;
        }
        dot.classList.remove('dot-offline');
    } catch (e) {
        if (!wasOffline) {
            showNotification("Connection lost. Retrying...", "error");
            wasOffline = true;
        }
        dot.classList.add('dot-offline');
    }
}, 30000);

// ============================================================
// 11. GLOBAALIT KYTKENNÄT (window-objekti)
// ============================================================
window.handleSearch = handleSearch;
window.addP = addP;
window.directAdd = directAdd;