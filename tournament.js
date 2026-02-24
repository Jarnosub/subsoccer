import { _supabase, state, ENABLE_EVENTS } from './config.js';
import { showNotification } from './ui-utils.js';
import { BracketEngine } from './bracket-engine.js';
import { MatchService } from './match-service.js';

/**
 * ============================================================
 * TOURNAMENT ENGINE (Bracket System)
 * ============================================================
 */

let rP = [], rW = [], finalists = [], bronzeContenders = [], bronzeWinner = null, initialPlayerCount = 0;
let tournamentSessionGains = {}; // Seuraa kunkin pelaajan kokonaispisteitä turnauksen aikana
let tournamentSessionElos = {};  // Seuraa pelaajien viimeisintä ELO-lukua
let currentTournamentEventId = null;
let currentTournamentEventName = null;

// Helper: Save local state to prevent data loss on refresh
function saveLocalState() {
    const data = {
        rP, rW, finalists, bronzeContenders, bronzeWinner, 
        tournamentSessionGains, tournamentSessionElos, 
        currentTournamentEventId,
        currentTournamentEventName,
        currentTournamentId: state.currentTournamentId,
        pool: state.pool,
        initialPlayerCount
    };
    localStorage.setItem('subsoccer_active_tour', JSON.stringify(data));
}

function clearLocalState() {
    localStorage.removeItem('subsoccer_active_tour');
}

// Check for active tournament on load
if (localStorage.getItem('subsoccer_active_tour')) {
    setTimeout(() => {
        const setupDiv = document.getElementById('tournament-section');
        if (setupDiv && !document.getElementById('resume-tournament-view')) {
            // Hide all existing setup elements to clean up the view
            const children = Array.from(setupDiv.children);
            children.forEach(c => c.style.display = 'none');

            // Create clean Resume UI
            const resumeDiv = document.createElement('div');
            resumeDiv.id = 'resume-tournament-view';
            resumeDiv.className = 'fade-in';
            resumeDiv.style.textAlign = 'center';
            resumeDiv.style.padding = '40px 20px';
            
            resumeDiv.innerHTML = `
                <div style="background:rgba(255, 215, 0, 0.05); border:1px solid var(--sub-gold); border-radius:12px; padding:30px; max-width:400px; margin:0 auto;">
                    <div style="font-size:3rem; margin-bottom:20px;">🏆</div>
                    <h3 style="font-family:'Resolve'; color:#fff; margin-bottom:10px; letter-spacing:2px;">TOURNAMENT PAUSED</h3>
                    <p style="color:#aaa; font-size:0.9rem; margin-bottom:30px;">You have an unfinished tournament in progress.</p>
                    
                    <button id="btn-resume-tour" class="btn-red" style="width:100%; background:var(--sub-gold); color:#000; font-weight:bold; padding:16px; font-size:1rem; margin-bottom:15px; box-shadow:0 4px 15px rgba(255, 215, 0, 0.2);">
                        CONTINUE TOURNAMENT
                    </button>
                    
                    <button id="btn-discard-tour" style="background:transparent; border:none; color:#666; text-decoration:underline; cursor:pointer; font-size:0.8rem; padding:10px;">
                        Discard & Start New
                    </button>
                </div>
            `;
            
            setupDiv.appendChild(resumeDiv);
            
            document.getElementById('btn-resume-tour').onclick = restoreTournament;
            document.getElementById('btn-discard-tour').onclick = () => {
                 if (confirm('Discard saved tournament? This cannot be undone.')) {
                    clearLocalState();
                    resumeDiv.remove();
                    // Restore visibility of setup elements
                    children.forEach(c => c.style.display = '');
                    showNotification("Saved tournament discarded", "info");
                }
            };
        }
    }, 500);
}

export function restoreTournament() {
    const saved = localStorage.getItem('subsoccer_active_tour');
    if (!saved) return;

    const data = JSON.parse(saved);

    // Palautetaan muuttujat
    rP = data.rP || [];
    rW = data.rW || [];
    finalists = data.finalists || [];
    bronzeContenders = data.bronzeContenders || [];
    bronzeWinner = data.bronzeWinner;
    tournamentSessionGains = data.tournamentSessionGains || {};
    tournamentSessionElos = data.tournamentSessionElos || {};
    currentTournamentEventId = data.currentTournamentEventId || null;
    currentTournamentEventName = data.currentTournamentEventName || null;
    state.currentTournamentId = data.currentTournamentId;
    state.pool = data.pool || [];
    initialPlayerCount = data.initialPlayerCount || state.pool.length;

    // Remove resume view if exists
    const resumeDiv = document.getElementById('resume-tournament-view');
    if (resumeDiv) resumeDiv.remove();

    // Päivitetään UI
    document.getElementById('tour-setup').style.display = 'none';
    document.getElementById('tour-engine').style.display = 'flex';
    document.getElementById('save-btn').style.display = 'none';

    // Lasketaan byes nykyisen kierroksen pelaajamäärän perusteella
    const byes = BracketEngine.calculateByes(rP.length);
    
    // Piirretään kaavio
    drawRound(byes);
    
    showNotification('Tournament restored successfully!', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function startTournament() {
    if (state.pool.length < 2) return showNotification("Min 2 players for a tournament!", "error");
    try {
        // Fallback jos uuid-kirjastoa ei ole ladattu globaalisti
        const eventSelect = document.getElementById('tour-event-select');
        currentTournamentEventId = eventSelect ? eventSelect.value : null;
        if (currentTournamentEventId === "") currentTournamentEventId = null;
        
        if (currentTournamentEventId && eventSelect.selectedIndex > -1) {
            currentTournamentEventName = eventSelect.options[eventSelect.selectedIndex].text;
        } else {
            currentTournamentEventName = null;
        }

        state.currentTournamentId = (typeof uuid !== 'undefined') 
            ? uuid.v4() 
            : Math.random().toString(36).substring(2) + Date.now().toString(36);
            
        initialPlayerCount = state.pool.length;
        document.getElementById('tour-setup').style.display = 'none';
        document.getElementById('tour-engine').style.display = 'flex';
        document.getElementById('save-btn').style.display = 'none';
        const byes = BracketEngine.calculateByes(state.pool.length);
        let shuffledPlayers = [...state.pool].sort(() => Math.random() - 0.5);
        rP = shuffledPlayers;
        rW = []; finalists = []; bronzeContenders = []; bronzeWinner = null;
        tournamentSessionGains = {};
        tournamentSessionElos = {};
        drawRound(byes);
        saveLocalState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
        showNotification("Error starting tournament: " + e.message, "error");
        console.error(e);
    }
}

export function drawRound(byes = 0) {
    const a = document.getElementById('bracket-area'); a.innerHTML = "";
    
    if (currentTournamentEventName) {
        a.innerHTML += `<div style="text-align:center; margin-bottom:15px;"><span style="background:rgba(255,215,0,0.1); color:var(--sub-gold); padding:4px 10px; border-radius:4px; font-size:0.7rem; border:1px solid rgba(255,215,0,0.3); letter-spacing:1px; font-family:var(--sub-name-font);">EVENT: ${currentTournamentEventName}</span></div>`;
    }

    if (finalists.length === 0) rW = [];

    if (finalists.length === 2) {
        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:15px; font-size:0.8rem; color:#555; letter-spacing:2px; text-align:center;">Bronze Match</h3>`;
        a.appendChild(BracketEngine.renderMatch(
            bronzeContenders[0], 
            bronzeContenders[1], 
            0, 
            bronzeWinner, 
            'pickBronzeWinner', 
            { isBronze: true }
        ));

        a.innerHTML += `<h3 style="font-family:var(--sub-name-font); text-transform:uppercase; margin-bottom:15px; font-size:0.8rem; color:var(--sub-gold); letter-spacing:2px; text-align:center;">Final</h3>`;
        a.appendChild(BracketEngine.renderMatch(
            finalists[0], 
            finalists[1], 
            0, 
            rW[0], 
            'pickWin', 
            { isFinal: true }
        ));
        checkCompletion();
        return;
    }

    if (rP.length === 1 && finalists.length === 0) {
        // Fix XSS vulnerability by using textContent
        a.innerHTML = '';
        const winDiv = document.createElement('div');
        winDiv.className = 'container';
        winDiv.style.textAlign = 'center';
        const h2 = document.createElement('h2');
        h2.textContent = `🏆 WINNER: ${rP[0]}`;
        winDiv.appendChild(h2);
        if (bronzeWinner) {
            const h3 = document.createElement('h3');
            h3.style.marginTop = '10px';
            h3.textContent = `🥉 Bronze: ${bronzeWinner}`;
            winDiv.appendChild(h3);
        }
        a.appendChild(winDiv);
        
        document.getElementById('save-btn').style.display = 'block';
        document.getElementById('next-rd-btn').style.display = 'none';
        return;
    }

    const matches = [];
    const playersWithBye = rP.slice(0, byes);
    const playersInMatches = rP.slice(byes);
    playersWithBye.forEach(p => rW.push(p));
    for (let i = 0; i < playersInMatches.length; i += 2) matches.push([playersInMatches[i], playersInMatches[i+1]]);

    matches.forEach((match, index) => {
        const [p1, p2] = match;
        const winnerIndex = byes + index;
        
        a.appendChild(BracketEngine.renderMatch(
            p1, 
            p2, 
            winnerIndex, 
            rW[winnerIndex], 
            'pickWin'
        ));
        
        if (!p2) rW[winnerIndex] = p1;
    });

    if (playersWithBye.length > 0) {
        a.innerHTML += `<h4 style="font-family:var(--sub-name-font); text-transform:uppercase; margin: 20px 0 10px 0; opacity: 0.7; text-align:center;">Byes (Next Round)</h4>`;
        playersWithBye.forEach(p => {
            const byeDiv = document.createElement('div');
            // Match BracketEngine.renderMatch style for consistency
            byeDiv.style.cssText = "padding:15px; background:#0a0a0a; border:1px solid #333; border-radius:var(--sub-radius); margin-bottom:10px; width:100%; max-width:400px; overflow:hidden; margin:0 auto 10px; text-align:center; font-family:var(--sub-name-font); text-transform:uppercase; opacity:0.7; box-sizing:border-box;";
            byeDiv.textContent = p;
            a.appendChild(byeDiv);
        });
    }
    saveLocalState();
    checkCompletion();
}

export async function pickWin(idx, n, e) {
    let p1, p2;
    if (finalists.length === 2) { p1 = finalists[0]; p2 = finalists[1]; }
    else {
        const match = BracketEngine.getMatchPlayers(rP, rW, idx);
        p1 = match.p1; p2 = match.p2;
    }
    if (p1 && p2) { 
        const result = await MatchService.recordMatch({
            player1Name: p1, player2Name: p2, winnerName: n, 
            tournamentId: state.currentTournamentId, tournamentName: "Tournament"
        });

        if (result.success) {
            // Kumuloidaan pisteet ja päivitetään viimeisin ELO
            tournamentSessionGains[n] = (tournamentSessionGains[n] || 0) + result.gain;
            tournamentSessionElos[n] = result.newElo;
        }
    }
    rW[idx] = n;
    
    // Visual update using classes instead of inline styles
    e.parentElement.querySelectorAll('div').forEach(d => { 
        d.classList.remove('match-winner');
        d.classList.add('match-loser');
        d.style.background = ""; // Clear old inline styles
        d.style.opacity = "";
    });
    e.classList.remove('match-loser');
    e.classList.add('match-winner');
    
    saveLocalState();
    checkCompletion();
}

export async function pickBronzeWinner(idx, n, e) {
    const result = await MatchService.recordMatch({
        player1Name: bronzeContenders[0], player2Name: bronzeContenders[1], winnerName: n,
        tournamentId: state.currentTournamentId, tournamentName: "Tournament (Bronze)"
    });
    if (result.success) {
        tournamentSessionGains[n] = (tournamentSessionGains[n] || 0) + result.gain;
    }
    bronzeWinner = n;
    
    e.parentElement.querySelectorAll('div').forEach(d => { 
        d.classList.remove('match-winner');
        d.classList.add('match-loser');
        d.style.background = "";
        d.style.opacity = "";
    });
    e.classList.remove('match-loser');
    e.classList.add('match-winner');
    
    saveLocalState();
    checkCompletion();
}

export function checkCompletion() {
    const nextBtn = document.getElementById('next-rd-btn');
    if (!nextBtn) return;
    const byes = Math.pow(2, Math.ceil(Math.log2(rP.length || 1))) - rP.length;
    const matchesToPlay = (rP.length - byes) / 2;
    const expectedWinners = byes + matchesToPlay;
    const pickedWinners = rW.filter(w => w).length;
    if (finalists.length === 2) {
        if (rW[0] && bronzeWinner) { nextBtn.innerText = 'FINISH TOURNAMENT'; nextBtn.style.display = 'block'; }
        else { nextBtn.style.display = 'none'; }
    } else if (pickedWinners === expectedWinners && matchesToPlay > 0) { nextBtn.innerText = 'NEXT ROUND'; nextBtn.style.display = 'block'; }
    else { nextBtn.style.display = 'none'; }
}

export function advanceRound() {
    const nextBtn = document.getElementById('next-rd-btn');
    if (!nextBtn) return;
    if (nextBtn.innerText === 'FINISH TOURNAMENT') { rP = rW.filter(w => w); saveTour(); return; }
    if (rP.length === 4) {
        const losers = rP.filter(p => !rW.includes(p));
        bronzeContenders = [...losers];
        finalists = [...rW.filter(w => w)];
        rW = []; // Tyhjennetään voittajat, jotta finaaliin ei tule esivalittua voittajaa
        drawRound(); return;
    }
    rP = rW.filter(w => w);
    const nextByes = Math.pow(2, Math.ceil(Math.log2(rP.length || 1))) - rP.length;
    nextBtn.style.display = 'none';
    drawRound(nextByes);
}

export async function saveTour() {
    try {
        const winnerName = rP[0];
        const secondPlaceName = finalists.find(p => p !== winnerName);
        
        // Generate a better name with time if none exists
        const timeStr = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
        const tournamentName = `Tournament ${timeStr}`;
        const now = new Date().toISOString();

        // Fix: Use 'id' to match the UUID used in matches, and add organizer_id
        const dataToInsert = { 
            id: state.currentTournamentId, 
            tournament_name: tournamentName, 
            winner_name: winnerName, 
            second_place_name: secondPlaceName,
            status: 'completed',
            start_datetime: now,
            end_datetime: now,
            max_participants: initialPlayerCount // Save actual player count
        };
        
        if (currentTournamentEventId) {
            dataToInsert.event_id = currentTournamentEventId;
        }

        if (state.user && state.user.id && state.user.id !== 'guest') {
            dataToInsert.organizer_id = state.user.id;
        }
        
        if (bronzeWinner) dataToInsert.third_place_name = bronzeWinner;
        
        const { error } = await _supabase.from('tournament_history').insert([dataToInsert]);
        if (error) throw error;

        // Haetaan voittajan todellinen ELO ja saatu pistemäärä animaatiota varten
        let winnerElo = 0;
        let winnerGain = 0;
        if (winnerName) {
            // Haetaan tuorein ELO tietokannasta (rekisteröidyt) tai käytetään finaalin tulosta (vieraat)
            const { data: p } = await _supabase.from('players').select('elo').eq('username', winnerName).maybeSingle();
            
            winnerElo = p ? p.elo : (tournamentSessionElos[winnerName] || 0);
            winnerGain = tournamentSessionGains[winnerName] || 0;
        }

        state.pool = []; 
        document.getElementById('tour-engine').style.display = 'none';
        document.getElementById('tour-setup').style.display = 'block';
        clearLocalState(); // Clear local storage after successful save
        state.currentPage = 'history';
        showNotification('Tournament saved successfully!', 'success');
        
        state.victoryData = { winnerName, winnerElo, winnerGain };

        // Päivitetään kirjautuneen käyttäjän tila, jos hän voitti
        if (state.user && winnerName === state.user.username) {
            const { data } = await _supabase.from('players').select('*').eq('id', state.user.id).maybeSingle();
            if (data) { state.user = data; }
        }
    } catch (error) {
        console.error('Error saving tournament:', error);
        showNotification('Failed to save tournament: ' + error.message, 'error');
    }
}

export function replayTournament(players, tourName) {
    state.pool = [...players];
    state.currentPage = 'tournament';
    showNotification(`Players for "${tourName}" loaded!`, 'success');
}

export async function populateEventDropdown() {
    // Don't show dropdown if events are disabled
    if (!ENABLE_EVENTS) return;

    let container = document.getElementById('advanced-tour-settings');
    if (!container) {
        // Auto-create container if missing from HTML
        container = document.createElement('div');
        container.id = 'advanced-tour-settings';
        container.style.cssText = "margin-bottom: 20px; text-align: left;";
        const startBtn = document.getElementById('btn-start-tournament');
        if (startBtn) startBtn.before(container);
        else return;
    }

    let select = document.getElementById('tour-event-select');
    if (!select) {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '15px';
        wrapper.innerHTML = `
            <label style="display:block; color:#555; font-size:0.7rem; margin-bottom:4px; font-family:var(--sub-name-font); letter-spacing:1px;">LINK TO EVENT (OPTIONAL)</label>
            <select id="tour-event-select" style="width:100%; padding:8px; background:#0a0a0a; border:1px solid #222; color:#888; border-radius:4px; font-family:var(--sub-body-font); font-size:0.85rem;">
                <option value="">-- NO EVENT --</option>
            </select>
        `;
        // Insert at the top of settings
        container.insertBefore(wrapper, container.firstChild);
        select = document.getElementById('tour-event-select');
    }

    // Fetch active events (upcoming or ongoing)
    const now = new Date().toISOString();
    
    const { data: events } = await _supabase
        .from('events')
        .select('id, event_name')
        .neq('status', 'cancelled')
        .gte('end_datetime', now)
        .order('start_datetime', { ascending: true });

    if (events) {
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- NO EVENT --</option>';
        events.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.event_name;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    }
}