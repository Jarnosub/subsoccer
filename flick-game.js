document.addEventListener('DOMContentLoaded', () => {
    let score = 0;
    let isPlaying = false;
    let requestID = null;

    const btnStart = document.getElementById('btn-start');
    const scoreDisplay = document.getElementById('score-value');
    const speedDisplay = document.getElementById('speed-value');
    
    // Setup Physics Canvas
    const canvas = document.getElementById('physics-canvas');
    const ctx = canvas.getContext('2d');
    
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // 3D Perspective settings
    const focalLength = 300; // Defines perspective depth

    // Greybox entities
    let balls = [];     // Balls that fly into the screen
    let obstacles = []; // Boxes acting as targets in the distance
    let particles = []; // Destroy visual FX

    function spawnObstacles() {
        obstacles = [];
        // Spawn obstacles at different Z depths
        for(let i=0; i < 5; i++) {
            obstacles.push({
                id: i,
                x: (Math.random() - 0.5) * canvas.width * 2, // Physical span
                y: -Math.random() * canvas.height * 0.5, // Height
                z: 200 + Math.random() * 800, // Distance into the screen
                w: 120,
                h: 120,
                active: true,
                color: `hsl(${Math.random()*360}, 100%, 50%)` // Colorful to see pseudo-3D
            });
        }
        // Specific far away targets (Gulf holes / Bullseyes)
        obstacles.push({
            id: 'bullseye',
            x: 0,
            y: 0,
            z: 1500,
            w: 200,
            h: 200,
            active: true,
            color: '#FFD700',
            isBullseye: true
        });
    }

    // Called when Vision Engine detects a real-life physical shot hitting the back wall
    window.handleGoalDetected = function(zoneId, index) {
        if (!isPlaying) return;

        // Where did it hit on the screen plane?
        let hitX = canvas.width / 2;
        let hitY = canvas.height / 2;
        
        const zone = window.visionEngine.zones.find(z => z.id === zoneId);
        if (zone) {
            hitX = canvas.width * (zone.x + zone.width/2);
            hitY = canvas.height * (zone.y + zone.height/2);
        }

        // Get the actual physical speed from our new radar logic
        let speedKmh = 30; // default
        if(window.visionEngine && window.visionEngine.currentBallSpeedKmh) {
            speedKmh = window.visionEngine.currentBallSpeedKmh;
        }
        
        // Z-velocity correlates to real speed
        let vz = speedKmh * 1.5 + 5; 
        
        // Add lateral drift based on where it hit (if it hit left, it drifts left)
        let vx = (hitX - canvas.width / 2) * 0.05;
        let vy = (hitY - canvas.height / 2) * 0.05 - 10; // Kick it slightly upwards

        // Virtual ball starts at the screen plane (Z = 0) and flies backwards into the 3D space
        balls.push({
            x: hitX - canvas.width / 2, // Center origin
            y: hitY - canvas.height / 2, // Center origin
            z: 0,
            vx: vx,
            vy: vy,
            vz: vz,
            radius: 30, // Base size
            active: true
        });

        document.body.style.background = 'rgba(0, 255, 204, 0.2)';
        setTimeout(() => document.body.style.background = '', 100);
    };

    function createParticles(x, y, scale) {
        for(let i = 0; i < 20; i++) {
            particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 15 * scale,
                vy: (Math.random() - 0.5) * 15 * scale,
                life: 1.0,
                color: '#fff'
            });
        }
    }

    // Convert 3D coords to 2D screen coords
    function project(x, y, z) {
        const scale = focalLength / (focalLength + z);
        return {
            x: (x * scale) + (canvas.width / 2),
            y: (y * scale) + (canvas.height / 2),
            scale: scale
        };
    }

    function gameLoop() {
        if (!isPlaying) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Sort obstacles by Z (painter's algorithm)
        obstacles.sort((a,b) => b.z - a.z);

        // Draw targets/obstacles
        obstacles = obstacles.filter(o => o.active);
        obstacles.forEach(o => {
            const p = project(o.x, o.y, o.z);
            if (p.scale > 0) {
                const drawW = o.w * p.scale;
                const drawH = o.h * p.scale;

                if (o.isBullseye) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, drawW/2, 0, Math.PI*2);
                    ctx.fillStyle = o.color;
                    ctx.fill();
                    ctx.lineWidth = 3 * p.scale;
                    ctx.strokeStyle = '#fff';
                    ctx.stroke();
                } else {
                    ctx.fillStyle = o.color;
                    ctx.fillRect(p.x - drawW/2, p.y - drawH/2, drawW, drawH);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2 * p.scale;
                    ctx.strokeRect(p.x - drawW/2, p.y - drawH/2, drawW, drawH);
                }
            }
        });

        // Update Balls (Physics in 3D)
        balls = balls.filter(b => b.active);
        balls.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;
            b.z += b.vz;

            // Gravity in 3D (Y goes down)
            b.vy += 0.5;

            // Simple floor bounce
            if(b.y > canvas.height * 0.5) {
                b.y = canvas.height * 0.5;
                b.vy *= -0.6; 
            }

            // Project to screen
            const p = project(b.x, b.y, b.z);

            // Collisions with obstacles
            obstacles.forEach(o => {
                if(o.active && Math.abs(b.z - o.z) < 50) { // Z-axis collision depth
                    if(b.x > o.x - o.w/2 && b.x < o.x + o.w/2 &&
                       b.y > o.y - o.h/2 && b.y < o.y + o.h/2) {
                        
                        o.active = false;
                        
                        // Impact effect
                        const proj = project(o.x, o.y, o.z);
                        createParticles(proj.x, proj.y, proj.scale);
                        
                        let pts = o.isBullseye ? 500 : 100;
                        score += pts;
                        scoreDisplay.textContent = score;
                        scoreDisplay.style.transform = 'scale(1.3)';
                        scoreDisplay.style.color = '#00FFCC';
                        setTimeout(() => {
                            scoreDisplay.style.transform = '';
                            scoreDisplay.style.color = '';
                        }, 200);

                        if(obstacles.filter(ob=>ob.active).length === 0) {
                            spawnObstacles();
                        }
                    }
                }
            });

            // Destroy when far away
            if (b.z > 2500 || p.scale < 0) {
                b.active = false;
            }

            // Draw Virtual Ball
            if (p.scale > 0) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, b.radius * p.scale, 0, Math.PI*2);
                ctx.fillStyle = '#E30613';
                ctx.fill();
                
                // Ball highlight/specular
                ctx.beginPath();
                ctx.arc(p.x - (b.radius*0.3)*p.scale, p.y - (b.radius*0.3)*p.scale, b.radius*0.3*p.scale, 0, Math.PI*2);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fill();
            }
        });

        // 2D screen particles
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.05;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
            ctx.fillRect(p.x, p.y, 4, 4);
        });

        // Display current radar speed
        if(window.visionEngine && window.visionEngine.measureBallSpeed) {
            speedDisplay.innerHTML = `${Math.round(window.visionEngine.currentBallSpeedKmh)}<span style="font-size:1.5rem">KMH</span>`;
        }

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
                alert("Camera access is required");
                btnStart.style.display = 'inline-block';
                return;
            }
            window.visionEngine.onTargetHit = window.handleGoalDetected;
            window.visionEngine.measureBallSpeed = true;
        }

        isPlaying = true;
        balls = [];
        particles = [];
        spawnObstacles();
        gameLoop();
    });
});
