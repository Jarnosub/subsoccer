import re

# 1. Update HTML
with open('pudgy-event-demo.html', 'r') as f:
    html = f.read()

html = html.replace('pudgy_penguins.png', 'goalie.png')
html = html.replace('pudgy-event-demo.js', 'single-game.js')
html = html.replace('Subsoccer Event Stream - Pudgy Penguins', 'Subsoccer - Single Player Arcade')
html = html.replace('END EVENT', 'LOBBY')
html = html.replace('pudgy-character', 'game-character')

with open('single-game.html', 'w') as f:
    f.write(html)

# 2. Update JS (single-game.js)
with open('single-game.js', 'r') as f:
    js = f.read()

animation_fn = """
    function triggerCharacterAnimation() {
        const charImg = document.getElementById('game-character');
        if (charImg) {
            charImg.style.transform = 'translate(-50%, -50%) scale(1.1)';
            charImg.style.filter = 'drop-shadow(0 0 50px rgba(0, 255, 204, 0.8))';
            
            setTimeout(() => {
                charImg.style.transform = '';
                charImg.style.filter = '';
            }, 300);
        }
    }
"""

if 'triggerCharacterAnimation' not in js:
    js = js.replace('function updateDisplays() {', animation_fn + '\n    function updateDisplays() {')

js = js.replace('updateDisplays();\n        setNewRandomTarget();', 'updateDisplays();\n        triggerCharacterAnimation();\n        setNewRandomTarget();')

# Update victory screen logic in single-game.js to match the new HTML elements
old_victory_logic = """                    const eloCount = document.getElementById('victory-elo-count');
                    const eloGain = document.getElementById('victory-elo-gain');
                    const cardDesc = document.getElementById('winner-card-desc');
                    const cardTitle = document.getElementById('winner-card-container').querySelector('.w-card-title');

                    eloCount.innerText = currentElo;
                    eloGain.innerText = `+${eloGained} ELO`;"""

new_victory_logic = """                    const eloCount = document.getElementById('victory-elo-count');
                    const eloGain = document.getElementById('victory-elo-gain');
                    const cardName = document.getElementById('victory-card-name');
                    const cardAvatar = document.getElementById('victory-card-avatar');

                    if (cardName) cardName.textContent = (user.username || user.full_name || "PLAYER").toUpperCase();
                    if (cardAvatar && user.avatar_url) cardAvatar.src = user.avatar_url;

                    if (eloCount) eloCount.innerText = currentElo + " ELO";
                    if (eloGain) eloGain.innerText = `+${eloGained} ELO`;"""

js = js.replace(old_victory_logic, new_victory_logic)

old_guest_logic = """                const eloCount = document.getElementById('victory-elo-count');
                const eloGain = document.getElementById('victory-elo-gain');
                const cardTitle = document.getElementById('winner-card-container').querySelector('.w-card-title');
                const cardDesc = document.getElementById('winner-card-desc');

                cardTitle.innerText = "GUEST";
                eloCount.innerText = score;
                eloGain.innerText = `${score} POINTS`;
                cardDesc.innerText = "Log in or create a profile to claim your ELO score.";"""

new_guest_logic = """                const eloCount = document.getElementById('victory-elo-count');
                const eloGain = document.getElementById('victory-elo-gain');
                const cardName = document.getElementById('victory-card-name');
                const cardAvatar = document.getElementById('victory-card-avatar');

                if (cardName) cardName.innerText = "GUEST";
                if (eloCount) eloCount.innerText = score + " PTS";
                if (eloGain) eloGain.innerText = `${score} POINTS`;
                if (cardAvatar) cardAvatar.src = "goalie.png";"""

js = js.replace(old_guest_logic, new_guest_logic)

# Re-enforce unlocking audio in single-game.js
if 'sounds[\\'victory\\'].load();' not in js:
    js = js.replace('initAudio(); // Required to unlock audio on first user gesture\\n        startGame();', \"\"\"initAudio(); // Required to unlock audio on first user gesture
        if (window.soundEffects && window.soundEffects.sounds && window.soundEffects.sounds['victory']) {
            window.soundEffects.sounds['victory'].load();
        }
        startGame();\"\"\")

with open('single-game.js', 'w') as f:
    f.write(js)

print("Done updates")
