import { state } from './config.js';

/**
 * SUBSOCCER BRACKET ENGINE
 * Shared logic for Tournament Mode and Event Brackets
 */

export const BracketEngine = {
    /**
     * Laskee vapaavuorojen (byes) määrän pelaajamäärän perusteella.
     * @param {number} playerCount - Pelaajien määrä.
     * @returns {number} Vapaavuorojen määrä.
     */
    calculateByes(playerCount) {
        if (playerCount <= 1) return 0;
        const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(playerCount)));
        return nextPowerOfTwo - playerCount;
    },

    /**
     * Palauttaa ottelun pelaajat indeksin perusteella.
     * @param {string[]} players - Kierroksen pelaajat.
     * @param {string[]} winners - Kierroksen voittajat.
     * @param {number} idx - Ottelun indeksi.
     * @returns {Object} {p1, p2}
     */
    getMatchPlayers(players, winners, idx) {
        const byes = this.calculateByes(players.length);
        const playersInMatches = players.slice(byes);
        const matchIndex = idx - byes;
        return {
            p1: playersInMatches[matchIndex * 2],
            p2: playersInMatches[matchIndex * 2 + 1]
        };
    },

    /**
     * Generoi HTML-rakenteen yhdelle ottelulle.
     * @param {string} p1 - Pelaaja 1 nimi.
     * @param {string} p2 - Pelaaja 2 nimi.
     * @param {number} winnerIndex - Indeksi voittajalistassa.
     * @param {string} currentWinner - Valitun voittajan nimi.
     * @param {string} onPick - Globaalin funktion nimi klikkausta varten.
     * @param {Object} options - UI-asetukset (isBronze, isFinal).
     * @returns {HTMLElement} Ottelun div-elementti.
     */
    renderMatch(p1, p2, winnerIndex, currentWinner, onPick, options = {}) {
        const isBronze = options.isBronze || false;
        const isFinal = options.isFinal || false;
        const themeColor = isBronze ? '#CD7F32' : (isFinal ? 'var(--sub-gold)' : '#333');
        const activeBg = isBronze ? 'rgba(205,127,50,0.3)' : 'rgba(227,6,19,0.4)';
        
        const m = document.createElement('div');
        m.className = "bracket-match";
        m.style = `background:#0a0a0a; border:1px solid ${themeColor}; border-radius:var(--sub-radius); margin-bottom:10px; width:100%; max-width:400px; overflow:hidden; margin:0 auto 10px;`;
        
        if (!p2 && !isBronze) {
            m.innerHTML = `<div style="padding:15px; opacity:0.5; font-family:var(--sub-name-font); text-transform:uppercase;">${p1} (BYE)</div>`;
            return m;
        }

        const p1Style = currentWinner === p1 ? `background:${activeBg};` : '';
        const p2Style = currentWinner === p2 ? `background:${activeBg};` : '';

        m.innerHTML = `
            <div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); text-transform:uppercase; transition:background 0.2s; ${p1Style}" 
                 onclick="${onPick}(${winnerIndex}, '${p1}', this)">
                ${p1} ${currentWinner === p1 ? '✓' : ''}
            </div>
            <div style="padding:15px; cursor:pointer; font-family:var(--sub-name-font); border-top:1px solid #222; text-transform:uppercase; transition:background 0.2s; ${p2Style}" 
                 onclick="${onPick}(${winnerIndex}, '${p2}', this)">
                ${p2} ${currentWinner === p2 ? '✓' : ''}
            </div>
        `;
        return m;
    },

    /**
     * Tarkistaa onko kierros valmis.
     * @param {string[]} players - Kierroksen pelaajat.
     * @param {string[]} winners - Kierroksen voittajat.
     * @param {number} finalistsCount - Finaalivaiheen pelaajamäärä.
     * @returns {boolean}
     */
    isRoundComplete(players, winners, finalistsCount) {
        const byes = this.calculateByes(players.length);
        const matchesToPlay = (players.length - byes) / 2;
        const expectedWinners = byes + matchesToPlay;
        const pickedWinners = winners.filter(w => w).length;

        if (finalistsCount === 2) {
            return winners[0] && winners.length > 0; 
        }
        
        return pickedWinners === expectedWinners && (matchesToPlay > 0 || players.length === 1);
    }
};

window.BracketEngine = BracketEngine;