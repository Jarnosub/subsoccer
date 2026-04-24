const fs = require('fs');
let code = fs.readFileSync('mobile-game-logic.js', 'utf-8');

const persistCode = `
// ============================================================
// TOURNAMENT PERSISTENCE
// ============================================================

function saveTournyState() {
    if (!localEngine || !gameState.isTournament) return;
    const state = {
        gameState: gameState,
        currentPendingMatch: currentPendingMatch,
        matchResults: matchResults,
        activeLayer: getCurrentLayer(),
        engine: {
            participants: localEngine.participants,
            rounds: localEngine.rounds,
            currentRoundIndex: localEngine.currentRoundIndex,
            isActive: localEngine.isActive
        }
    };
    localStorage.setItem('subsoccer_mobile_tourny', JSON.stringify(state));
}

function getCurrentLayer() {
    const layers = document.querySelectorAll('.m-layer');
    for (let l of layers) {
        if (l.style.display === 'flex' || l.style.display === 'block') {
            return l.id;
        }
    }
    return 'm-layer-setup';
}

function restoreTournyState() {
    const raw = localStorage.getItem('subsoccer_mobile_tourny');
    if (!raw) return false;
    
    try {
        const state = JSON.parse(raw);
        if (!state.engine || !state.engine.isActive) return false;

        // Restore vars
        gameState = state.gameState;
        currentPendingMatch = state.currentPendingMatch;
        matchResults = state.matchResults || [];

        // Restore Engine
        localEngine = new BracketEngine({ 
            containerId: 'mobile-bracket-area', 
            enableSaveButton: false 
        });
        localEngine.participants = state.engine.participants;
        localEngine.rounds = state.engine.rounds;
        localEngine.currentRoundIndex = state.engine.currentRoundIndex;
        localEngine.isActive = state.engine.isActive;

        // Render bracket
        renderMobileBracket();

        // Restore UI state based on layer
        if (state.activeLayer === 'm-layer-game' && currentPendingMatch) {
            // Restore match in progress
            document.getElementById('m-p1-name').innerText = gameState.p1Name;
            document.getElementById('m-p2-name').innerText = gameState.p2Name;
            document.getElementById('m-score-p1').innerText = gameState.p1Score;
            document.getElementById('m-score-p2').innerText = gameState.p2Score;
            updateGoalVisual('m-goals-p1', gameState.p1Score);
            updateGoalVisual('m-goals-p2', gameState.p2Score);
            showLayer('m-layer-game');
            pMatchProcessing = false;
        } else if (state.activeLayer === 'm-layer-nextmatch' && currentPendingMatch) {
            // Restore next match screen
            document.getElementById('m-round-name').innerText = currentPendingMatch.roundName;
            document.getElementById('m-matchup-p1').innerText = currentPendingMatch.p1;
            document.getElementById('m-matchup-p2').innerText = currentPendingMatch.p2;
            showLayer('m-layer-nextmatch');
        } else {
            // Fallback to bracket
            showLayer('m-layer-bracket');
        }

        return true;
    } catch(e) {
        console.warn("Failed to restore tourny:", e);
        return false;
    }
}
`;

// Insert the persistence blocks right after var declarations
code = code.replace('const GOALS_TO_WIN = 3; // Best of 5: first to 3 wins', 'const GOALS_TO_WIN = 3;\n' + persistCode);

// Hook into init flow
code = code.replace('updateAddPlayerButton();\n})();', 'if (restoreTournyState()) { updateAddPlayerButton(); return; }\n    updateAddPlayerButton();\n})();');

// Hook into state changes
code = code.replace('nextTournyMatch();\n};', 'nextTournyMatch();\n    saveTournyState();\n};');

// Finish match hooking
code = code.replace('matchResults.push({', 'saveTournyState();\n    matchResults.push({');

code = code.replace('window.mobileGoal = function(playerNumber) {\n    if (pMatchProcessing) return;', 'window.mobileGoal = function(playerNumber) {\n    if (pMatchProcessing) return;\n    saveTournyState();');
code = code.replace('broadcastTvState();\n};', 'saveTournyState();\n    broadcastTvState();\n};');

code = code.replace('function showTournamentComplete() {', 'function showTournamentComplete() {\n    localStorage.removeItem("subsoccer_mobile_tourny");');

code = code.replace('window.mobileStartMatch = function() {', 'window.mobileStartMatch = function() {\n    saveTournyState();');

fs.writeFileSync('mobile-game-logic.js', code);
console.log("Patched mobile-game-logic.js");
