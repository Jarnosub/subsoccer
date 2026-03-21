import re

with open('single-game.js', 'r') as f:
    js = f.read()

# Add image preloading and mapping
preload = """
    // --- GOALIE ANIMATION LOGIC ---
    const goalieImages = {
        idle: 'goalie.png',
        'top-left': 'goalie/goalie_0006_Layer-1.png',
        'top-right': 'goalie/goalie_0005_Layer-2.png',
        'bottom-left': 'goalie/goalie_0004_Layer-5.png',
        'bottom-right': 'goalie/goalie_0003_Generative-Fill.png',
        react1: 'goalie/goalie_0002_Layer-6.png',
        react2: 'goalie/goalie_0001_Layer-7.png',
        react3: 'goalie/goalie_0000_Layer-8.png'
    };

    // Preload
    Object.values(goalieImages).forEach(src => {
        const img = new Image();
        img.src = src;
    });

    function setGoaliePose(pose) {
        const charImg = document.getElementById('game-character');
        if (charImg && goalieImages[pose]) {
            charImg.src = goalieImages[pose];
        }
    }
"""

js = js.replace('// --- RANDOM TARGET GENERATOR ---', preload + '\n    // --- RANDOM TARGET GENERATOR ---')

# Update setNewRandomTarget to set goalie pose
target_logic = """
        window.visionEngine.activeZoneId = nextTargetId;
        setGoaliePose(nextTargetId); // Goalie reagoi syttyvään tauluun!
"""
js = js.replace('window.visionEngine.activeZoneId = nextTargetId;', target_logic)

# Update triggerCharacterAnimation
anim_logic = """
    function triggerCharacterAnimation() {
        const charImg = document.getElementById('game-character');
        if (charImg) {
            // Arvo hit-reaktio
            const reacts = ['react1', 'react2', 'react3'];
            const randomReact = reacts[Math.floor(Math.random() * reacts.length)];
            setGoaliePose(randomReact);
            
            charImg.style.transform = 'translate(-50%, -50%) scale(1.1)';
            charImg.style.filter = 'drop-shadow(0 0 50px rgba(0, 255, 204, 0.8))';
            
            setTimeout(() => {
                charImg.style.transform = 'translate(-50%, -50%) scale(1)';
                charImg.style.filter = 'drop-shadow(0 0 30px rgba(0, 136, 204, 0.3))';
                // Palautus hoidetaan setNewRandomTarget:ssa hetken päästä
            }, 300);
        }
    }
"""
js = re.sub(r'function triggerCharacterAnimation\(\) \{[\s\S]*?\}\n', anim_logic, js)

with open('single-game.js', 'w') as f:
    f.write(js)

print("Goaliet isketty koodiin!")
