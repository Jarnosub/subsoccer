document.addEventListener('DOMContentLoaded', () => {
    let score = 0;
    let isPlaying = false;
    let requestID = null;

    const btnStart = document.getElementById('btn-start');
    const scoreDisplay = document.getElementById('score-value');
    
    // Setup Physics Canvas
    const canvas = document.getElementById('physics-canvas');
    const ctx = canvas.getContext('2d');
    
    // Resize canvas to fill the screen
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // Greybox entities
    let balls = [];     // Balls that the player "shoots"
    let obstacles = []; // Boxes acting as targets/blockers
    let particles = []; // Destroy visual FX

    function spawnObstacles() {
        obstacles = [];
        // Spawn simple grey rectangle obstacles in the opponent's area
        // In Vision Engine terms this would be Y: 0.1 to 0.4
        for(let i=0; i < 4; i++) {
            obstacles.push({
                id: i,
                x: canvas.width * (0.2 + (i * 0.2)),
                y: canvas.height * (0.2 + Math.random() * 0.2),
                w: 60,
                h: 80,
                active: true,
                color: '#666'
            });
        }
    }

    // Called when Vision Engine detects a real-life physical shot
    window.handleGoalDetected = function(zoneId, index) {
        if (!isPlaying) return;

        // Based on where the user shot on the real table, we want to launch the virtual ball there
        let targetX = canvas.width / 2;
        let targetY = canvas.height * 0.2; // default top
        
        // Find center of the shot zone in canvas coords
        const zone = window.visionEngine.zones.find(z => z.id === zoneId);
        if (zone) {
            targetX = canvas.width * (zone.x + zone.width/2);
            targetY = canvas.height * (zone.y + zone.height/2);
        }

        // Shoot ball from bottom center of the screen
        balls.push({
            x: canvas.width / 2,
            y: canvas.height * 0.9,
            vx: (targetX - canvas.width/2) * 0.05,
            vy: (targetY - canvas.height*0.9) * 0.05,
            radius: 20,
            active: true
        });

        // Flash screen logic or sound
        document.body.style.background = 'rgba(0, 255, 204, 0.2)';
        setTimeout(() => document.body.style.background = '', 100);
    };

    function createParticles(x, y) {
        for(let i = 0; i < 15; i++) {
            particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: '#fff'
            });
        }
    }

    function gameLoop() {
        if (!isPlaying) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update & Draw Obstacles
        obstacles = obstacles.filter(o => o.active);
        obstacles.forEach(o => {
            ctx.fillStyle = o.color;
            ctx.fillRect(o.x - o.w/2, o.y - o.h/2, o.w, o.h);
            
            // Draw subtle wireframe on top to emphasize "greybox"
            ctx.strokeStyle = '#999';
            ctx.strokeRect(o.x - o.w/2, o.y - o.h/2, o.w, o.h);
        });

        // Update & Draw Balls
        balls = balls.filter(b => b.active);
        balls.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;

            // Apply slight curve (flick curve prototype)
            b.vx *= 0.98;

            // Collision with obstacles
            obstacles.forEach(o => {
                if(o.active && 
                   b.x > o.x - o.w/2 && b.x < o.x + o.w/2 &&
                   b.y > o.y - o.h/2 && b.y < o.y + o.h/2) {
                    
                    // Hit!
                    o.active = false;
                    b.active = false; // Destroy ball too
                    
                    createParticles(o.x, o.y);
                    
                    score += 100;
                    scoreDisplay.textContent = score;
                    scoreDisplay.style.transform = 'scale(1.2)';
                    setTimeout(() => scoreDisplay.style.transform = '', 150);

                    if(obstacles.filter(ob=>ob.active).length === 0) {
                        spawnObstacles(); // New wave
                    }
                }
            });

            // Destroy out of bounds
            if (b.y < -50 || b.x < -50 || b.x > canvas.width + 50) {
                b.active = false;
            }

            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
            ctx.fillStyle = '#00FFCC';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.closePath();
        });

        // Particles
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
            ctx.fillRect(p.x, p.y, 4, 4);
        });

        requestID = requestAnimationFrame(gameLoop);
    }

    btnStart.addEventListener('click', async () => {
        if (isPlaying) return;
        
        score = 0;
        scoreDisplay.textContent = score;
        btnStart.style.display = 'none';

        if (window.visionEngine) {
            const success = await window.visionEngine.startCamera();
            if (!success) {
                alert("Camera access is required for this game mode!");
                btnStart.style.display = 'inline-block';
                return;
            }
            // Bind collision loop
            window.visionEngine.onTargetHit = window.handleGoalDetected;
        }

        isPlaying = true;
        balls = [];
        particles = [];
        spawnObstacles();
        gameLoop();
    });
});
