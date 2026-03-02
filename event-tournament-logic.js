import { _supabase, state } from './config.js';
import { showNotification, showModal, closeModal } from './ui-utils.js';
import { viewEventDetails } from './event-service.js';
import { BracketEngine } from './bracket-engine.js';
import { MatchService } from './match-service.js';

/**
 * ============================================================
 * EVENT TOURNAMENT LOGIC
 * Handles bracket generation, in-progress matches, and results
 * ============================================================
 */

let eventBracketEngine = null;
let currentEventTournamentId = null;
let currentEventTournamentName = null;
let currentEventId = null;

export async function viewTournamentBracket(tournamentId, tournamentName, eventId) {
    try {
        currentEventTournamentId = tournamentId;
        currentEventTournamentName = tournamentName;
        currentEventId = eventId;

        const { data: tournament } = await _supabase.from('tournament_history').select('*').eq('id', tournamentId).single();
        if (tournament?.status === 'completed') {
            const names = [tournament.winner_name, tournament.second_place_name, tournament.third_place_name].filter(n => n);
            const { data: players } = names.length > 0 ? await _supabase.from('players').select('username, elo, country, avatar_url').in('username', names) : { data: [] };
            showCompletedTournamentBracket(tournament, players || []);
            return;
        }

        if (tournament?.status === 'scheduled') {
            await _supabase.from('tournament_history').update({ status: 'ongoing' }).eq('id', tournamentId);
        }

        const { data: registrations } = await _supabase.from('event_registrations').select('player_id, players:player_id(username)').eq('tournament_id', tournamentId).eq('status', 'registered');
        if (!registrations || registrations.length < 2) {
            showNotification('At least 2 players required', 'error');
            return;
        }

        const players = registrations.map(r => r.players.username);
        const { data: matches } = await _supabase.from('matches').select('*').eq('tournament_id', tournamentId);

        showEventBracketModal();
        eventBracketEngine = new BracketEngine({
            containerId: 'event-bracket-container',
            enableSaveButton: false,
            onMatchUpdate: async (match, winner) => {
                await MatchService.recordMatch({
                    player1Name: match.p1,
                    player2Name: match.p2,
                    winnerName: winner,
                    tournamentId: currentEventTournamentId,
                    tournamentName: currentEventTournamentName
                });
                showNotification(`${winner} wins!`, 'success');
                updateEventBracketControls();
            }
        });

        const hasMatches = matches && matches.length > 0;
        eventBracketEngine.generateBracket(players, !hasMatches);
        if (hasMatches) eventBracketEngine.restoreState(matches);
        updateEventBracketControls();
    } catch (e) {
        showNotification('Failed to load bracket', 'error');
    }
}

function showEventBracketModal() {
    showModal(currentEventTournamentName, `
        <div id="event-bracket-container" style="width:100%; display:flex; flex-direction:column; align-items:center;"></div>
        <div style="text-align:center; margin-top:20px; padding-top:20px; border-top:1px solid #333;">
            <div id="event-bracket-controls"></div>
        </div>
    `, { id: 'bracket-modal', maxWidth: '600px' });
}

function updateEventBracketControls() {
    const controls = document.getElementById('event-bracket-controls');
    if (!controls || !eventBracketEngine) return;
    const results = eventBracketEngine.getTournamentResults();
    if (results && results.winner) {
        controls.innerHTML = '<button onclick="finishEventTournament()" class="btn-red" style="padding:15px 40px;"><i class="fa fa-trophy"></i> FINISH TOURNAMENT</button>';
    } else {
        controls.innerHTML = '<small style="color:#666;">Select winners to proceed</small>';
    }
}

export async function finishEventTournament() {
    if (!eventBracketEngine) return;
    try {
        const results = eventBracketEngine.getTournamentResults();
        if (!results) return;

        const { error } = await _supabase.from('tournament_history').update({
            winner_name: results.winner,
            second_place_name: results.second,
            third_place_name: results.third,
            status: 'completed',
            end_datetime: new Date().toISOString()
        }).eq('id', currentEventTournamentId);

        if (error) throw error;
        showNotification('Tournament completed!', 'success');
        closeBracketModal();
        if (currentEventId) viewEventDetails(currentEventId);
    } catch (e) {
        showNotification('Failed to finish', 'error');
    }
}

export function closeBracketModal() {
    closeModal('bracket-modal');
    eventBracketEngine = null;
}

function showCompletedTournamentBracket(tournament, players) {
    // Simplified podium view
    const getP = (name) => players.find(p => p.username === name) || { username: name, elo: '-' };
    const w = getP(tournament.winner_name);
    const s = getP(tournament.second_place_name);
    const t = getP(tournament.third_place_name);

    const html = `
        <div style="text-align:center; padding:20px;">
            <h3 style="color:var(--sub-gold); margin-bottom:30px;">🏆 TOURNAMENT COMPLETED</h3>
            <div style="display:flex; justify-content:center; align-items:flex-end; gap:20px;">
                <div style="text-align:center;">🥈<br>${s.username}<br><span style="color:#666;">${s.elo}</span></div>
                <div style="text-align:center; font-size:1.2rem;">🏆<br><strong>${w.username}</strong><br><span style="color:var(--sub-gold);">${w.elo}</span></div>
                <div style="text-align:center;">🥉<br>${t.username}<br><span style="color:#666;">${t.elo}</span></div>
            </div>
            <button onclick="closeBracketModal()" class="btn-red" style="margin-top:40px;">CLOSE</button>
        </div>
    `;
    showModal(currentEventTournamentName, html, { id: 'bracket-modal', maxWidth: '500px' });
}

// Global Exports
window.viewTournamentBracket = viewTournamentBracket;
window.finishEventTournament = finishEventTournament;
window.closeBracketModal = closeBracketModal;
