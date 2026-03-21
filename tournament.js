import { state, _supabase } from './config.js';
import { showNotification, showLoading, hideLoading } from './ui-utils.js';
import { MatchService } from './match-service.js';
import { showVictory } from './quick-match.js';

let currentTournamentName = "Local Tournament";

/**
 * Starts the tournament using the current player pool.
 */
export function startTournament() {
    if (state.pool.length < 2) {
        showNotification("Add at least 2 players!", "error");
        return;
    }

    const nameInput = document.getElementById('local-tournament-name');
    currentTournamentName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : `Tournament ${new Date().toLocaleDateString()}`;

    if (window.bracketEngine) {
        window.bracketEngine.generateBracket(state.pool);
    } else {
        console.error("BracketEngine not loaded");
        showNotification("System error: Bracket Engine missing", "error");
    }
}

/**
 * Advances to the next round (if manual control is enabled).
 */
export function advanceRound() {
    console.log("Advance round requested");
    // Current BracketEngine propagates automatically, but this can be used for UI transitions
}

/**
 * Saves the tournament results.
 */
export async function saveTour() {
    const engine = window.bracketEngine;
    if (!engine) return;

    const results = engine.getTournamentResults();
    if (!results) {
        showNotification("Tournament not finished yet", "error");
        return;
    }

    showLoading("Saving tournament results...");
    try {
        // 0. Create Tournament Record in History (Standalone Tournament)
        let tournamentId = null;
        let organizerId = state.user ? state.user.id : null;

        // Fix: guest uses "guest" id which fails UUID validation in Postgres
        if (organizerId === 'guest' || organizerId === 'spectator') {
            organizerId = null;
        }

        if (organizerId !== null) {
            const { data: tourData, error: tourError } = await _supabase
                .from('tournament_history')
                .insert({
                    tournament_name: currentTournamentName,
                    organizer_id: organizerId,
                    status: 'completed',
                    winner_name: results.winner,
                    second_place_name: results.second,
                    third_place_name: results.third,
                    start_datetime: new Date().toISOString(),
                    end_datetime: new Date().toISOString(),
                    max_participants: engine.participants.length,
                    tournament_type: 'elimination'
                })
                .select()
                .single();

            if (!tourError && tourData) {
                tournamentId = tourData.id;
            } else {
                console.error("Failed to save tournament history:", tourError);
            }
        }

        // 1. Save all matches to get ELO updates
        const matches = engine.getAllMatches();
        let finalEloGain = 0;
        let finalNewElo = 0;

        for (const m of matches) {
            const res = await MatchService.recordMatch({
                player1Name: m.p1,
                player2Name: m.p2,
                winnerName: m.winner,
                tournamentName: currentTournamentName,
                tournamentId: tournamentId
            });

            // Capture the winner's stats from the final match
            if (m.winner === results.winner && !m.isBronze) {
                finalEloGain = res.gain;
                finalNewElo = res.newElo;
            }
        }

        // 2. Show Victory Screen
        showVictory(results.winner, finalNewElo, finalEloGain);

    } catch (e) {
        console.error(e);
        showNotification("Error saving tournament", "error");
    } finally {
        hideLoading();
    }
}

/**
 * Replays a tournament with the same players.
 */
export function replayTournament(players, name) {
    if (players && players.length > 0) {
        state.pool = players; // This triggers UI update via proxy
        const nameInput = document.getElementById('local-tournament-name');
        if (nameInput && name) nameInput.value = name;
        startTournament();
    }
}

// Placeholder exports to satisfy ui.js imports
export function populateEventDropdown() { }