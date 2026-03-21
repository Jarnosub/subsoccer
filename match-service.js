import { _supabase, state } from './config.js';
import { showNotification, showLoading, hideLoading, showModal } from './ui-utils.js';

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
     * Records a match, updates ELO, and handles statistics.
     * Includes Anti-Cheat / B2B logic: Non-verified/Private tables are capped at 1600 ELO.
     */
    async recordMatch({ player1Name, player2Name, winnerName, p1Score = null, p2Score = null, tournamentId = null, tournamentName = null, gameId = null }) {
        try {
            showLoading('Recording match...');

            // 1. Fetch player and game data
            let { data: p1Data } = await _supabase.from('players').select('*').ilike('username', player1Name).maybeSingle();
            let { data: p2Data } = await _supabase.from('players').select('*').ilike('username', player2Name).maybeSingle();

            // Try to find game info if gameId is provided
            let isVerifiedTable = false;
            let actualGameId = null;

            if (gameId && gameId !== 'QUICK-PLAY') {
                if (gameId.toUpperCase() === 'HQ') {
                    // Kova-koodattu Toimiston Pelipöytä
                    isVerifiedTable = true;
                } else {
                    const query = isUuid(gameId)
                        ? _supabase.from('games').select('id, verified, is_public').eq('id', gameId)
                        : _supabase.from('games').select('id, verified, is_public').eq('serial_number', gameId);

                    const { data: gData } = await query.maybeSingle();

                    if (gData) {
                        actualGameId = gData.id;
                        if (gData.verified && gData.is_public) {
                            isVerifiedTable = true;
                        }
                    }
                }
            } else if (tournamentId) {
                // Tournaments are usually considered official
                isVerifiedTable = true;
            }

            const p1 = p1Data || { id: 'guest_' + player1Name, username: player1Name, elo: 1300, isGuest: true };
            const p2 = p2Data || { id: 'guest_' + player2Name, username: player2Name, elo: 1300, isGuest: true };

            const winnerData = winnerName === player1Name ? p1 : p2;
            const winnerCurrentElo = winnerData.elo || 1300;

            // 2. Calculate ELO
            const { newEloA, newEloB } = this.calculateNewElo(p1, p2, winnerData.id);
            let newElo = (winnerName === player1Name ? newEloA : newEloB);

            // --- VAIHE 4: ELO Cap & Anti-Cheat ---
            const ELO_CAP = 1600;
            let wasCapped = false;

            if (!isVerifiedTable) {
                if (winnerCurrentElo >= ELO_CAP) {
                    newElo = winnerCurrentElo; // No gain above cap
                    wasCapped = true;
                } else if (newElo > ELO_CAP) {
                    newElo = ELO_CAP; // Cap the gain
                    wasCapped = true;
                }
            }

            const gain = newElo - winnerCurrentElo;
            const p1EloFinal = (winnerName === player1Name) ? newElo : (p1.isGuest ? 1300 : newEloA);
            const p2EloFinal = (winnerName === player2Name) ? newElo : (p2.isGuest ? 1300 : newEloB);

            // 3. Save to database
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
                    tournament_name: tournamentName,
                    is_verified_table: isVerifiedTable,
                    elo_capped: wasCapped
                }
            });

            if (rpcError) throw rpcError;

            // Stats for UI
            window.lastTournamentEloGain = gain;
            window.lastTournamentWinner = winnerName;

            if (wasCapped) {
                const html = `
                <div style="text-align:center; padding:10px;">
                    <i class="fa-solid fa-user-secret" style="font-size:4rem; color:var(--sub-red); margin-bottom:20px;"></i>
                    <h2 style="font-family:'Russo One'; color:var(--sub-red); margin-bottom:15px; text-transform:uppercase; letter-spacing:1px;">🚨 HUSTLER CAUGHT!</h2>
                    
                    <p style="color:#ccc; font-size:0.95rem; line-height:1.6; margin-bottom:20px;">
                        Impressive farming skills. We see you've reached the <strong>1600 ELO</strong> cap for Living Room tables. 
                    </p>
                    
                    <div style="background:rgba(227, 6, 19, 0.1); border:1px solid rgba(227, 6, 19, 0.3); border-radius:8px; padding:15px; margin-bottom:25px;">
                        <p style="color:#fff; font-size:0.85rem; line-height:1.5; margin:0;">
                            To climb the Global Leaderboard and reach the true <strong>Pro Ranks</strong>, you need to step outside. Find an official <span style="color:var(--sub-gold); font-weight:bold;">Verified Public Arena</span> and prove your skills against real challengers.
                        </p>
                    </div>

                    <button class="btn-red" style="width:100%; font-family:'Russo One'; font-size:1.1rem; padding:15px; border-radius:8px;" onclick="this.closest('.modal-overlay').style.display='none'">
                        CHALLENGE ACCEPTED
                    </button>
                </div>
                `;
                showModal('ANTI-CHEAT ACTIVE', html, { id: 'hacker-modal', maxWidth: '420px', borderColor: 'var(--sub-red)' });
            }

            // Check Level Up
            // ONLY show the Rank Up pop-up if the winner is actually logged in on THIS device (not for tournament hosts/moderators)
            const isWinnerLoggedInHere = state.user && state.user.id === winnerData.id;

            if (!wasCapped && isWinnerLoggedInHere && Math.floor(newElo / 100) > Math.floor(winnerCurrentElo / 100)) {
                setTimeout(() => { if (window.showLevelUpCard) window.showLevelUpCard(winnerName, newElo); }, 2000);
            }

            return { success: true, newElo, gain, isGuest: winnerData.isGuest, wasCapped };
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