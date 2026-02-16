import { _supabase, state } from './config.js';
import { showNotification, showLoading, hideLoading } from './ui-utils.js';

/**
 * Keskitetty palvelu otteluiden hallintaan ja ELO-laskentaan.
 */
const isUuid = (val) => val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val));

export const MatchService = {
    /**
     * Laskee uudet ELO-pisteet kahdelle pelaajalle.
     */
    calculateNewElo(playerA, playerB, winnerId) {
        const eloA = playerA.elo || 1300;
        const eloB = playerB.elo || 1300;
        const kFactor = 32;
        
        const expectedScoreA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
        const expectedScoreB = 1 / (1 + Math.pow(10, (eloA - eloB) / 400));
        
        const actualScoreA = winnerId === playerA.id ? 1 : 0;
        const actualScoreB = winnerId === playerB.id ? 1 : 0;
        
        let newEloA = Math.round(eloA + kFactor * (actualScoreA - expectedScoreA));
        let newEloB = Math.round(eloB + kFactor * (actualScoreB - expectedScoreB));

        // Varmistetaan vähintään 1 pisteen muutos (estetään +0 tai -0 tilanteet)
        if (actualScoreA === 1 && newEloA <= eloA) newEloA = eloA + 1;
        if (actualScoreB === 1 && newEloB <= eloB) newEloB = eloB + 1;
        if (actualScoreA === 0 && newEloA >= eloA) newEloA = Math.max(0, eloA - 1);
        if (actualScoreB === 0 && newEloB >= eloB) newEloB = Math.max(0, eloB - 1);
        
        return { newEloA, newEloB };
    },

    /**
     * Tallentaa ottelun, päivittää ELO-pisteet ja voittotilastot.
     */
    async recordMatch({ player1Name, player2Name, winnerName, p1Score = null, p2Score = null, tournamentId = null, tournamentName = null }) {
        try {
            showLoading('Recording match...');
            
            // Haetaan pelaajien tiedot tietokannasta
            let { data: p1Data } = await _supabase.from('players').select('*').ilike('username', player1Name).maybeSingle();
            let { data: p2Data } = await _supabase.from('players').select('*').ilike('username', player2Name).maybeSingle();

            // Käsitellään vieraspelaajat (ei tietokannassa)
            const p1 = p1Data || { id: 'guest_' + player1Name, username: player1Name, elo: 1300, isGuest: true };
            const p2 = p2Data || { id: 'guest_' + player2Name, username: player2Name, elo: 1300, isGuest: true };
            
            const winnerData = winnerName === player1Name ? p1 : p2;
            const { newEloA, newEloB } = this.calculateNewElo(p1, p2, winnerData.id);
            const newElo = (winnerName === player1Name ? newEloA : newEloB);
            const gain = newElo - winnerData.elo;

            const p1EloFinal = parseInt(newEloA) || 1300;
            const p2EloFinal = parseInt(newEloB) || 1300;

            // Käytetään RPC-kutsua atomisuuden varmistamiseksi (SQL-funktio record_quick_match_v1)
            const { error: rpcError } = await _supabase.rpc('record_quick_match_v1', {
                p1_id: (p1.isGuest || !isUuid(p1.id)) ? null : p1.id,
                p2_id: (p2.isGuest || !isUuid(p2.id)) ? null : p2.id,
                p1_new_elo: p1EloFinal,
                p2_new_elo: p2EloFinal,
                p1_won: winnerName === player1Name,
                match_data: {
                    player1: player1Name,
                    player2: player2Name,
                    winner: winnerName,
                    player1_score: p1Score,
                    player2_score: p2Score,
                    tournament_id: isUuid(tournamentId) ? tournamentId : null,
                    tournament_name: tournamentName
                }
            });

            if (rpcError) throw rpcError;

            // Tallennetaan globaalisti animaatioita varten
            window.lastTournamentEloGain = gain;
            window.lastTournamentWinner = winnerName;

            // Check for Level Up Milestones
            const oldElo = winnerData.elo || 1300;
            if (Math.floor(newElo / 100) > Math.floor(oldElo / 100) || (oldElo < 1600 && newElo >= 1600)) {
                setTimeout(() => { if (window.showLevelUpCard) window.showLevelUpCard(winnerName, newElo); }, 2000);
            }

            return { success: true, newElo, gain, isGuest: winnerData.isGuest };
        } catch (error) {
            console.error('MatchService Error:', error);
            showNotification('Failed to record match', 'error');
            return { success: false, error };
        } finally {
            hideLoading();
        }
    }
};

window.MatchService = MatchService;