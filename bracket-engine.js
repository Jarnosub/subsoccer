// ============================================================
// SUBSOCCER BRACKET ENGINE
// Handles tournament logic, pairing, and progression
// ============================================================

export class BracketEngine {
    constructor(options = {}) {
        this.participants = [];
        this.rounds = []; // Array of rounds, each containing matches
        this.currentRoundIndex = 0;
        this.isActive = false;
        
        // Options
        this.containerId = options.containerId || 'bracket-area';
        this.onMatchUpdate = options.onMatchUpdate || null; // Callback when match updates
        this.enableSaveButton = options.enableSaveButton !== false; // Default true
    }

    /**
     * Initialize a new tournament
     * @param {Array} playerNames - List of player names
     * @param {Boolean} shuffle - Whether to shuffle players (default true)
     */
    generateBracket(playerNames, shuffle = true) {
        if (playerNames.length < 2) {
            alert("Need at least 2 players to start a tournament.");
            return;
        }

        this.participants = shuffle ? this.shuffleArray([...playerNames]) : [...playerNames];
        this.rounds = [];
        this.isActive = true;

        // 1. Calculate bracket size (next power of 2)
        // e.g., 5 players -> size 8. 3 players get BYEs.
        const size = Math.pow(2, Math.ceil(Math.log2(this.participants.length)));
        const byesCount = size - this.participants.length;

        // 2. Create Round 1 pairings
        // We mix real players and "BYE" placeholders
        let round1Matches = [];
        let pIndex = 0;

        // Strategy: Distribute BYEs evenly or just at the end. 
        // Simple approach: Add BYEs to the end of the list before pairing, 
        // but usually top seeds get BYEs. Since we shuffle, random is fine.
        
        // Let's create a padded list first
        let paddedList = [...this.participants];
        for (let i = 0; i < byesCount; i++) {
            paddedList.push("BYE");
        }

        // Create Match Objects for Round 1
        for (let i = 0; i < size / 2; i++) {
            const p1 = paddedList[i];
            const p2 = paddedList[size - 1 - i]; // Fold method (first plays last)

            const match = {
                id: `r0_m${i}`,
                p1: p1,
                p2: p2,
                winner: null,
                nextMatchId: `r1_m${Math.floor(i / 2)}`, // Logic for next round link
                nextSlot: i % 2 === 0 ? 'p1' : 'p2' // Even matches go to p1 slot, odd to p2
            };

            // Auto-advance if opponent is BYE
            if (p2 === "BYE") match.winner = p1;
            if (p1 === "BYE") match.winner = p2; // Should not happen with this sort, but safe to have

            round1Matches.push(match);
        }

        this.rounds.push(round1Matches);

        // 3. Generate subsequent empty rounds
        let currentSize = size / 2;
        let roundIdx = 1;

        while (currentSize > 1) {
            currentSize = currentSize / 2;
            let roundMatches = [];
            for (let i = 0; i < currentSize; i++) {
                roundMatches.push({
                    id: `r${roundIdx}_m${i}`,
                    p1: null, // Waiting for winner
                    p2: null, // Waiting for winner
                    winner: null,
                    nextMatchId: currentSize > 1 ? `r${roundIdx + 1}_m${Math.floor(i / 2)}` : null,
                    nextSlot: i % 2 === 0 ? 'p1' : 'p2'
                });
            }
            this.rounds.push(roundMatches);
            roundIdx++;
        }

        // 4. Propagate initial BYE winners to Round 2
        this.propagateWinners();
        
        // 5. Render
        this.render();
    }

    /**
     * Restore tournament state from existing matches (for Events)
     */
    restoreState(matches) {
        if (!matches || matches.length === 0) return;

        const findAndSetWinner = (p1, p2, winner) => {
            // Check regular rounds
            for (let r = 0; r < this.rounds.length; r++) {
                for (let m = 0; m < this.rounds[r].length; m++) {
                    const match = this.rounds[r][m];
                    if ((match.p1 === p1 && match.p2 === p2) || (match.p1 === p2 && match.p2 === p1)) {
                        this.setMatchWinner(r, m, winner, true); // true = silent (no callback/vibrate)
                        return;
                    }
                }
            }
        };

        matches.forEach(m => {
            const p1 = m.player1 || m.p1;
            const p2 = m.player2 || m.p2;
            if (m.winner && p1 && p2) {
                findAndSetWinner(p1, p2, m.winner);
            }
        });
    }

    /**
     * Move winners to the next round's slots
     */
    propagateWinners() {
        for (let r = 0; r < this.rounds.length - 1; r++) {
            const currentRound = this.rounds[r];
            const nextRound = this.rounds[r + 1];

            currentRound.forEach(match => {
                if (match.winner) {
                    // Find target match in next round
                    // We parsed nextMatchId earlier, but simpler math is:
                    // Match i in Round r goes to Match floor(i/2) in Round r+1
                    const matchIndex = parseInt(match.id.split('_m')[1]);
                    const targetMatchIndex = Math.floor(matchIndex / 2);
                    const targetSlot = matchIndex % 2 === 0 ? 'p1' : 'p2';

                    if (nextRound[targetMatchIndex]) {
                        nextRound[targetMatchIndex][targetSlot] = match.winner;
                    }
                }
            });
        }
    }

    /**
     * Handle a player click to set them as winner
     */
    setMatchWinner(roundIndex, matchIndex, winnerName, silent = false) {
        const match = this.rounds[roundIndex][matchIndex];
        
        // Prevent changing winner if it was a BYE auto-win
        if (match.p1 === "BYE" || match.p2 === "BYE") return;

        // Toggle winner or set new
        if (match.winner === winnerName) {
            match.winner = null; // Undo
        } else {
            match.winner = winnerName;
            if (!silent && navigator.vibrate) navigator.vibrate(50); // Haptic feedback
        }

        // Recalculate the whole tree flow
        // (Resetting downstream matches if a winner is changed)
        this.resetDownstream(roundIndex, matchIndex);
        this.propagateWinners();
        this.render();

        // Trigger callback if not silent (user action)
        if (!silent && this.onMatchUpdate && match.winner) {
            this.onMatchUpdate(match, match.winner);
        }
    }

    resetDownstream(roundIndex, matchIndex) {
        // If we change a winner in Round 1, we must clear the winner in Round 2 that depended on it
        // This is complex, so for MVP we just re-propagate. 
        // Ideally, we clear the 'winner' status of any future match this feeds into.
        let r = roundIndex + 1;
        let m = Math.floor(matchIndex / 2);
        
        while (r < this.rounds.length) {
            if (this.rounds[r][m]) {
                this.rounds[r][m].winner = null;
                // Also clear the slot that came from the previous match
                // But propagateWinners will overwrite the slot value anyway
            }
            m = Math.floor(m / 2);
            r++;
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    getRoundName(index, totalRounds) {
        if (index === totalRounds - 1) return "🏆 FINALS";
        if (index === totalRounds - 2) return "SEMI-FINALS";
        if (index === totalRounds - 3) return "QUARTER-FINALS";
        return `ROUND ${index + 1}`;
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        container.innerHTML = '';

        // Helper to render a round
        const renderRoundToContainer = (round, rIndex) => {
            const roundDiv = document.createElement('div');
            roundDiv.className = 'bracket-round';
            roundDiv.id = `bracket-round-${rIndex}`;
            
            const title = document.createElement('div');
            title.className = 'round-title';
            title.innerText = this.getRoundName(rIndex, this.rounds.length);
            roundDiv.appendChild(title);

            round.forEach((match, mIndex) => {
                const matchDiv = document.createElement('div');
                matchDiv.className = 'bracket-match';
                matchDiv.id = `match-${rIndex}-${mIndex}`;

                // Player 1 Button
                const btn1 = this.createPlayerBtn(match.p1, match, rIndex, mIndex);
                // VS separator
                const vs = document.createElement('div');
                vs.className = 'match-vs';
                vs.innerText = 'vs';
                // Player 2 Button
                const btn2 = this.createPlayerBtn(match.p2, match, rIndex, mIndex);

                matchDiv.appendChild(btn1);
                matchDiv.appendChild(vs);
                matchDiv.appendChild(btn2);
                roundDiv.appendChild(matchDiv);
            });

            container.appendChild(roundDiv);
        };

        // 1. Render Final (Last Round)
        if (this.rounds.length > 0) {
            renderRoundToContainer(this.rounds[this.rounds.length - 1], this.rounds.length - 1);
        }

        // 3. Render remaining rounds in reverse order (excluding Final)
        for (let i = this.rounds.length - 2; i >= 0; i--) {
            renderRoundToContainer(this.rounds[i], i);
        }

        // Check if tournament is complete (final match has winner)
        const finalRound = this.rounds[this.rounds.length - 1];
        const isComplete = finalRound && finalRound[0] && finalRound[0].winner;
        
        const saveBtn = document.getElementById('save-btn');
        const tourEngine = document.getElementById('tour-engine');

        if (saveBtn && this.enableSaveButton) {
            if (isComplete) {
                saveBtn.style.display = 'block';
                saveBtn.classList.add('sticky-bottom-action');
                saveBtn.innerHTML = '<i class="fa fa-trophy"></i> FINISH & SAVE';
                if (saveBtn.parentNode !== document.body) {
                    document.body.appendChild(saveBtn);
                }
            } else {
                saveBtn.style.display = 'none';
                saveBtn.classList.remove('sticky-bottom-action');
                if (tourEngine && saveBtn.parentNode !== tourEngine) {
                    tourEngine.appendChild(saveBtn);
                }
            }
        }

        // Show engine UI (Only if using default container, to avoid messing with Event modal)
        if (this.containerId === 'bracket-area') {
            document.getElementById('tour-engine').style.display = 'flex';
            document.getElementById('tour-setup').style.display = 'none';
        }

        // Auto-scroll to active round
        setTimeout(() => {
            const activeIdx = this.getActiveRoundIndex();
            const round = this.rounds[activeIdx];
            
            // Find LAST pending match in the active round (physically lowest)
            // This ensures we start from the bottom of the screen and move up
            let pendingMatchIndex = -1;
            for (let i = round.length - 1; i >= 0; i--) {
                const m = round[i];
                if (m.p1 && m.p2 && !m.winner && m.p1 !== 'BYE' && m.p2 !== 'BYE') {
                    pendingMatchIndex = i;
                    break;
                }
            }
            
            let targetEl;
            let scrollBlock = 'center';

            if (pendingMatchIndex !== -1) {
                targetEl = document.getElementById(`match-${activeIdx}-${pendingMatchIndex}`);
                // Käytetään aina center-kohdistusta otteluille, se on selkein mobiilissa
                scrollBlock = 'center';
            } else {
                targetEl = document.getElementById(`bracket-round-${activeIdx}`);
                // Jos kohdistetaan otsikkoon (kierroksen alkuun), center on myös turvallisempi
                // jotta otsikko ei jää piiloon yläpalkin alle
                scrollBlock = 'center';
            }

            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: scrollBlock });
            }
        }, 300); // Pidennetty viive (100ms -> 300ms) varmistaa että renderöinti on valmis
    }

    getActiveRoundIndex() {
        // Find the first round (from bottom up) that has pending matches
        for (let i = 0; i < this.rounds.length; i++) {
            const round = this.rounds[i];
            // Check if this round has any playable match that isn't finished
            const hasPending = round.some(m => m.p1 && m.p2 && !m.winner && m.p1 !== 'BYE' && m.p2 !== 'BYE');
            if (hasPending) return i;
        }
        return this.rounds.length - 1; // Default to final
    }

    createPlayerBtn(playerName, match, rIndex, mIndex) {
        const btn = document.createElement('div');
        btn.className = 'match-player';
        
        if (!playerName) {
            btn.innerText = '...';
            btn.classList.add('empty');
        } else if (playerName === "BYE") {
            btn.innerText = 'BYE';
            btn.classList.add('bye');
        } else {
            btn.innerText = playerName;
            btn.onclick = () => {
                this.setMatchWinner(rIndex, mIndex, playerName);
            };
        }

        if (match.winner === playerName && playerName) {
            btn.classList.add('winner');
        }

        return btn;
    }

    getTournamentResults() {
        const finalRound = this.rounds[this.rounds.length - 1];
        if (!finalRound || !finalRound[0] || !finalRound[0].winner) return null;
        
        const winner = finalRound[0].winner;
        const second = finalRound[0].p1 === winner ? finalRound[0].p2 : finalRound[0].p1;
        
        return { winner, second };
    }

    getAllMatches() {
        const matches = [];
        this.rounds.forEach(round => {
            round.forEach(m => {
                if (m.winner && m.p1 && m.p2 && m.p1 !== 'BYE' && m.p2 !== 'BYE') {
                    matches.push({ p1: m.p1, p2: m.p2, winner: m.winner });
                }
            });
        });
        return matches;
    }

    // Static helpers for Event System (events-v3-final.js)
    static calculateByes(playerCount) {
        let nextPow2 = 2;
        while (nextPow2 < playerCount) nextPow2 *= 2;
        return nextPow2 - playerCount;
    }

    static getMatchPlayers(players, winners, matchIndex) {
        return {
            p1: players[matchIndex * 2],
            p2: players[matchIndex * 2 + 1]
        };
    }

    static isRoundComplete(players, winners) {
        const required = Math.floor(players.length / 2);
        const current = winners.filter(w => w).length;
        return current === required;
    }

    static renderMatch(p1, p2, index, winner, handler, options = {}) {
        const div = document.createElement('div');
        div.className = 'bracket-match';
        div.style.marginBottom = '10px';
        
        const createBtn = (p) => {
            const btn = document.createElement('div');
            btn.className = `match-player ${winner === p && p ? 'winner' : ''}`;
            btn.innerText = p || '...';
            if (p) {
                btn.dataset.action = 'bracket-pick';
                btn.dataset.handler = handler;
                btn.dataset.index = index;
                btn.dataset.player = p;
            }
            return btn;
        };

        div.appendChild(createBtn(p1));
        div.innerHTML += `<div class="match-vs">${options.isBronze ? 'BRONZE' : (options.isFinal ? 'FINAL' : 'VS')}</div>`;
        div.appendChild(createBtn(p2));
        
        return div;
    }
}

// Initialize and Export
const bracketEngine = new BracketEngine();
window.bracketEngine = bracketEngine;