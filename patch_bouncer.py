import re

with open('bouncer-game.js', 'r') as f:
    js = f.read()

# Remove ZONES and setNewRandomTarget
js = re.sub(r'// --- RANDOM TARGET GENERATOR ---[\s\S]*\}\n\}\);\n$', '});\n', js)

# Inject Bouncer variables and logic before window.handleGoalDetected
bouncer_logic = """
    // --- BOUNCER LOGIC ---
    let bouncers = [];
    let bouncerIdCounter = 0;
    let bouncerAnimId = null;

    function spawnBouncers() {
        if (!window.visionEngine) return;
        bouncers = [];
        window.visionEngine.activeZoneId = null; // Show all
        
        for (let i = 0; i < 3; i++) {
            let b = {
                id: 'bouncer_' + (bouncerIdCounter++),
                x: Math.random() * 0.6 + 0.1, // keep inside frame
                y: Math.random() * 0.6 + 0.1,
                width: 0.2, // vision engine scale relative to width
                height: 0.2,
                vx: (Math.random() > 0.5 ? 1 : -1) * (0.002 + Math.random() * 0.004),
                vy: (Math.random() > 0.5 ? 1 : -1) * (0.002 + Math.random() * 0.004),
                hitScale: 0.35,
                hitAnimationTime: 0
            };
            bouncers.push(b);
            window.visionEngine.lastDetections[b.id] = 0;
        }
        window.visionEngine.zones = bouncers;
    }

    function updateBouncers() {
        if (!isPlaying) return;

        bouncers.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;

            // Bounce X
            if (b.x <= 0 || b.x + b.width >= 1) {
                b.vx *= -1;
                b.x = Math.max(0, Math.min(b.x, 1 - b.width));
            }
            // Bounce Y
            if (b.y <= 0 || b.y + b.height >= 1) {
                b.vy *= -1;
                b.y = Math.max(0, Math.min(b.y, 1 - b.height));
            }
        });

        // Mutating the object properties reflects automatically since visionEngine holds the reference
        if (window.visionEngine) {
            window.visionEngine.zones = bouncers;
        }

        bouncerAnimId = requestAnimationFrame(updateBouncers);
    }
"""
js = js.replace('// Global goal detection handler bound to the vision engine', bouncer_logic + '\n    // Global goal detection handler bound to the vision engine')

# In startGame: replace setNewRandomTarget() with spawnBouncers() and updateBouncers()
js = js.replace('setNewRandomTarget(); // RANDOM GENERATOR MODE: Arpoo ensimmäisen maalin', 'spawnBouncers();\n        updateBouncers();')

# In endGame: add cancelAnimationFrame
js = js.replace('clearInterval(timerInterval);', 'clearInterval(timerInterval);\n        if (bouncerAnimId) cancelAnimationFrame(bouncerAnimId);')

# In handleGoalDetected: find hit bouncer, remove it
old_hit = """
        updateDisplays();
        triggerCharacterAnimation();
        setNewRandomTarget(); // Arvo uusi palava kohde vasta onnistuneen osuman jälkeen!
"""
new_hit = """
        updateDisplays();
        triggerCharacterAnimation();
        
        // Remove hit bouncer
        const hitIndex = bouncers.findIndex(b => b.id === zoneId);
        if (hitIndex > -1) {
            bouncers.splice(hitIndex, 1);
            if (window.visionEngine) {
                window.visionEngine.zones = bouncers;
            }
        }
        
        if (bouncers.length === 0) {
            spawnBouncers();
        }
"""
js = js.replace(old_hit, new_hit)

with open('bouncer-game.js', 'w') as f:
    f.write(js)

print("Done patching bouncer-game.js")
