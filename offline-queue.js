/**
 * Offline Queue — Tallentaa pelitulokset paikallisesti IndexedDB:hen
 * kun verkkoyhteys puuttuu, ja synkronoi ne automaattisesti kun yhteys palaa.
 */

const DB_NAME = 'subsoccer-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-matches';

let _db = null;

/**
 * Avaa tai luo IndexedDB-tietokanta.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        if (_db) return resolve(_db);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('status', 'status', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            _db = event.target.result;
            resolve(_db);
        };

        request.onerror = (event) => {
            console.error('[OfflineQueue] IndexedDB open error:', event.target.error);
            reject(event.target.error);
        };
    });
}

export const OfflineQueue = {
    /**
     * Alustaa tietokannan. Kutsu kerran sovelluksen käynnistyksessä.
     */
    async init() {
        try {
            await openDB();
            console.log('[OfflineQueue] ✅ IndexedDB initialized');
            return true;
        } catch (err) {
            console.error('[OfflineQueue] Init failed:', err);
            return false;
        }
    },

    /**
     * Lisää pelituloksen offline-jonoon.
     * @param {Object} matchData - Pelitiedot (samat parametrit kuin MatchService.recordMatch)
     * @returns {Object} Tallennettu jono-alkio
     */
    async enqueue(matchData) {
        try {
            const db = await openDB();
            const entry = {
                id: crypto.randomUUID ? crypto.randomUUID() : ('offline-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
                timestamp: Date.now(),
                status: 'pending',
                retryCount: 0,
                matchData: { ...matchData }
            };

            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.add(entry);

                request.onsuccess = () => {
                    console.log('[OfflineQueue] 📥 Match queued:', entry.id);
                    // Päivitä UI-badge
                    OfflineQueue.updateBadge();
                    resolve(entry);
                };
                request.onerror = (e) => {
                    console.error('[OfflineQueue] Enqueue error:', e.target.error);
                    reject(e.target.error);
                };
            });
        } catch (err) {
            console.error('[OfflineQueue] Enqueue failed:', err);
            // Fallback: tallenna localStorageen
            try {
                const fallback = JSON.parse(localStorage.getItem('offline-matches') || '[]');
                fallback.push({ ...matchData, timestamp: Date.now() });
                localStorage.setItem('offline-matches', JSON.stringify(fallback));
                console.log('[OfflineQueue] Saved to localStorage fallback');
            } catch (e) {}
            return null;
        }
    },

    /**
     * Palauttaa kaikki jonossa olevat pelit.
     */
    async getAll() {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.error('[OfflineQueue] getAll failed:', err);
            return [];
        }
    },

    /**
     * Palauttaa synkronoimattomien pelien lukumäärän.
     */
    async getPendingCount() {
        try {
            const all = await this.getAll();
            return all.filter(m => m.status === 'pending' || m.status === 'failed').length;
        } catch (err) {
            return 0;
        }
    },

    /**
     * Poistaa yksittäisen alkion jonosta (onnistuneen synkronoinnin jälkeen).
     */
    async remove(id) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.delete(id);

                request.onsuccess = () => resolve(true);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.error('[OfflineQueue] Remove failed:', err);
            return false;
        }
    },

    /**
     * Päivittää alkion statuksen.
     */
    async updateStatus(id, status, retryCount) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const getReq = store.get(id);

                getReq.onsuccess = () => {
                    const entry = getReq.result;
                    if (entry) {
                        entry.status = status;
                        if (retryCount !== undefined) entry.retryCount = retryCount;
                        store.put(entry);
                    }
                    resolve(entry);
                };
                getReq.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.error('[OfflineQueue] updateStatus failed:', err);
            return null;
        }
    },

    /**
     * Synkronoi kaikki jonossa olevat pelit palvelimelle.
     * Kutsuu MatchService.recordMatch() -funktiota jokaiselle pelille.
     * @returns {Object} { synced: number, failed: number }
     */
    async syncAll() {
        if (!navigator.onLine) {
            console.log('[OfflineQueue] Still offline, skipping sync');
            return { synced: 0, failed: 0 };
        }

        const pending = await this.getAll();
        const toSync = pending.filter(m => m.status === 'pending' || m.status === 'failed');

        if (toSync.length === 0) return { synced: 0, failed: 0 };

        console.log(`[OfflineQueue] 🔄 Syncing ${toSync.length} offline matches...`);

        if (window.showNotification) {
            window.showNotification(`Syncing ${toSync.length} offline match${toSync.length > 1 ? 'es' : ''}...`, 'success');
        }

        let synced = 0;
        let failed = 0;

        for (const entry of toSync) {
            try {
                await this.updateStatus(entry.id, 'syncing');

                // Kutsu MatchServicen alkuperäistä tallennuslogiikkaa
                // (MatchService tarkistaa _offlineSync-lipun, jotta ei tallenna uudelleen jonoon)
                const result = await window.MatchService._originalRecordMatch(entry.matchData);

                if (result && result.success) {
                    await this.remove(entry.id);
                    synced++;
                    console.log(`[OfflineQueue] ✅ Synced: ${entry.id}`);
                } else {
                    // Pysyvä virhe (esim. pelaajaa ei löydy) — merkitään epäonnistuneeksi
                    await this.updateStatus(entry.id, 'failed', (entry.retryCount || 0) + 1);
                    failed++;
                    console.warn(`[OfflineQueue] ❌ Sync failed for ${entry.id}:`, result?.error);
                }
            } catch (err) {
                // Verkkovirhe — yritetään uudelleen myöhemmin
                await this.updateStatus(entry.id, 'failed', (entry.retryCount || 0) + 1);
                failed++;
                console.error(`[OfflineQueue] ❌ Sync error for ${entry.id}:`, err);
            }
        }

        if (synced > 0 && window.showNotification) {
            window.showNotification(`✅ ${synced} offline match${synced > 1 ? 'es' : ''} synced!`, 'success');
        }
        if (failed > 0 && window.showNotification) {
            window.showNotification(`⚠️ ${failed} match${failed > 1 ? 'es' : ''} failed to sync`, 'error');
        }

        // Päivitä UI-badge
        this.updateBadge();

        return { synced, failed };
    },

    /**
     * Päivittää UI-badgen, joka näyttää jonossa olevien pelien määrän.
     */
    async updateBadge() {
        try {
            const count = await this.getPendingCount();
            const badge = document.getElementById('offline-sync-badge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
            // Myös offline-bar teksti
            const bar = document.getElementById('offline-bar');
            if (bar && count > 0 && !navigator.onLine) {
                bar.querySelector('.offline-bar-text').textContent = 
                    `📡 Offline – ${count} match${count > 1 ? 'es' : ''} saved locally`;
            }
        } catch (e) {}
    }
};

// Globaali viittaus synkronointia varten
window.OfflineQueue = OfflineQueue;
