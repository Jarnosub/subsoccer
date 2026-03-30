document.addEventListener('DOMContentLoaded', () => {
    let       playerGoals = 0;
        oppGoals = 0;
        currentTurn = "player";
        turnDelayTimer = 0;
        aiBallSpawned = false;
        matchOver = false;
        isFlicking = false;
        updateScoreboard();
        showTurnAnnouncement("YOUR TURN!");
        balls = [];
        particles = [];
        spawnObstacles();
        
        /* Timer loop removed for turn based mode */
    }

    if(btnStartTouch) {
        btnStartTouch.addEventListener('click', () => {
            if(window.soundEffects) window.soundEffects.resume();
            if (window.flickNetwork) {
                window.flickNetwork.requestGame(false);
            } else {
                window.startCountdownAndGame(false);
            }
        });
    }
    if(btnStartTrackman) {
        btnStartTrackman.addEventListener('click', async () => {
            if(window.soundEffects) window.soundEffects.resume();
            
            // Request camera permissions immediately upon user gesture
            if (window.visionEngine) {
                startMenu.style.display = 'none'; // Temporary hide while waiting for permission
                const success = await window.visionEngine.startCamera();
                if (!success) {
                    alert("Camera access is required to play Subsoccer AR.");
                    startMenu.style.display = 'flex';
                    return;
                }
                // Stop rendering target boxes in AR mode immediately
                window.visionEngine.showTargets = false;
            }

            if (window.flickNetwork) {
                window.flickNetwork.requestGame(true);
            } else {
                window.startCountdownAndGame(true);
            }
        });
    }

    // Sound toggle logic
    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    if (btnSoundToggle) {
        // Init state
        btnSoundToggle.innerHTML = window.soundEffects && window.soundEffects.enabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
        
        btnSoundToggle.addEventListener('click', () => {
            if (window.soundEffects) {
                window.soundEffects.resume();
                const isEnabled = window.soundEffects.toggle();
                btnSoundToggle.innerHTML = isEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
                
                // If toggled during gameplay, start or stop music
                if (window.isPlaying) {
                    if (isEnabled) window.soundEffects.playGameplayTheme();
                    else window.soundEffects.stopMusic();
                }
            }
        });
    }

    // Start background loop only after stadium image loads to prevent green grass flash
    let gameLoopStarted = false;
    function startGameLoop() {
        if (!gameLoopStarted) {
            gameLoopStarted = true;
            requestAnimationFrame(gameLoop);
        }
    }

    if (stadiumImg.complete && stadiumImg.naturalHeight !== 0) {
        startGameLoop();
    } else {
        stadiumImg.addEventListener('load', startGameLoop);
        stadiumImg.addEventListener('error', startGameLoop);
    }
});

window.closeVictoryAndReset = function() {
    const vOverlay = document.getElementById('victory-overlay');
    if (vOverlay) vOverlay.style.display = 'none';
    const startMenu = document.getElementById('start-menu');
    if (startMenu) startMenu.style.display = 'flex';
    if(window.gameLoopInterval) cancelAnimationFrame(window.gameLoopInterval);
};
