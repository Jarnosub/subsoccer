import { _supabase, state } from './config.js';
import { showNotification, showLoading, hideLoading } from './ui-utils.js';

/**
 * Keskitetty palvelu otteluiden hallintaan ja ELO-laskentaan.
 */
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
            let { data: p1Data } = await _supabase.from('players').select('*').eq('username', player1Name).maybeSingle();
            let { data: p2Data } = await _supabase.from('players').select('*').eq('username', player2Name).maybeSingle();

            // Käsitellään vieraspelaajat (ei tietokannassa)
            const p1 = p1Data || { id: 'guest_' + player1Name, username: player1Name, elo: 1300, isGuest: true };
            const p2 = p2Data || { id: 'guest_' + player2Name, username: player2Name, elo: 1300, isGuest: true };
            
            const winnerData = winnerName === player1Name ? p1 : p2;
            const { newEloA, newEloB } = this.calculateNewElo(p1, p2, winnerData.id);
            
            const gain = (winnerName === player1Name ? newEloA : newEloB) - winnerData.elo;

            // Päivitetään pelaajien tiedot (ELO + voitot/häviöt) yhdellä kutsulla
            if (!p1.isGuest) {
                const p1Updates = { elo: parseInt(newEloA) };
                if (winnerName === player1Name) p1Updates.wins = (p1.wins || 0) + 1;
                else p1Updates.losses = (p1.losses || 0) + 1;
                const { error: p1Err } = await _supabase.from('players').update(p1Updates).eq('id', p1.id);
                if (p1Err) console.error("Error updating player 1 stats:", p1Err);
            }
            if (!p2.isGuest) {
                const p2Updates = { elo: parseInt(newEloB) };
                if (winnerName === player2Name) p2Updates.wins = (p2.wins || 0) + 1;
                else p2Updates.losses = (p2.losses || 0) + 1;
                const { error: p2Err } = await _supabase.from('players').update(p2Updates).eq('id', p2.id);
                if (p2Err) console.error("Error updating player 2 stats:", p2Err);
            }

            // Lisätään ottelutallenne - yritetään ensin kaikilla tiedoilla
            const matchData = {
                player1: player1Name,
                player2: player2Name,
                winner: winnerName,
                created_at: new Date().toISOString()
            };

            // Lisätään valinnaiset kentät vain jos ne on määritelty
            if (p1Score !== null) matchData.player1_score = p1Score;
            if (p2Score !== null) matchData.player2_score = p2Score;
            if (tournamentId) matchData.tournament_id = tournamentId;
            if (tournamentName) matchData.tournament_name = tournamentName;

            const { error: matchError } = await _supabase.from('matches').insert([matchData]);

            if (matchError) {
                console.warn("Primary match record failed (likely missing columns), trying fallback:", matchError);
                // Fallback: yritetään tallentaa vain perusmääritelmät jos uudet sarakkeet puuttuvat
                const { error: fallbackError } = await _supabase.from('matches').insert([{
                    player1: player1Name,
                    player2: player2Name,
                    winner: winnerName,
                    created_at: new Date().toISOString()
                }]);
                if (fallbackError) throw fallbackError;
            }

            // Tallennetaan globaalisti animaatioita varten
            window.lastTournamentEloGain = gain;
            window.lastTournamentWinner = winnerName;

            // Check for Level Up Milestones
            const oldElo = winnerData.elo || 1300;
            const newElo = (winnerName === player1Name ? newEloA : newEloB);
            if (Math.floor(newElo / 100) > Math.floor(oldElo / 100) || (oldElo < 1600 && newElo >= 1600)) {
                setTimeout(() => { if (window.showLevelUpCard) window.showLevelUpCard(winnerName, newElo); }, 2000);
            }

            return { success: true, newElo: (winnerName === player1Name ? newEloA : newEloB), gain, isGuest: winnerData.isGuest };
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