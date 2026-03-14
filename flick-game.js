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

    // Goalie and Goal entities
    let goalie = {
        x: 0,
        y: -100, // Above ground
        z: 1400, // Just in front of the goal
        w: 150,
        h: 200,
        vx: 10,
        img: new Image()
    };
    goalie.img.src = 'goalie.png';

    const goal = {
        x: 0,
        y: -150,
        z: 1500, // Back wall
        w: 500,
        h: 300
    };

    function spawnObstacles() {
        // We only use the goalie and goal now.
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

        // Horizon and Floor
        const horizonY = canvas.height * 0.5;
        
        // Draw Sky (over video feed)
        ctx.fillStyle = '#6ab8f2';
        ctx.fillRect(0, 0, canvas.width, horizonY);
        
        // Draw Grass (over video feed)
        ctx.fillStyle = '#398b26';
        ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

        // Draw Field Lines (perspective)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width*0.3, canvas.height); ctx.lineTo(canvas.width*0.45, horizonY);
        ctx.moveTo(canvas.width*0.7, canvas.height); ctx.lineTo(canvas.width*0.55, horizonY);
        ctx.moveTo(0, canvas.height*0.8); ctx.lineTo(canvas.width, canvas.height*0.8);
        ctx.stroke();

        // Draw Goal Net at Z=1500
        const gp = project(goal.x, goal.y, goal.z);
        if (gp.scale > 0) {
            const gw = goal.w * gp.scale;
            const gh = goal.h * gp.scale;
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(gp.x - gw/2, gp.y - gh/2, gw, gh);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 5 * gp.scale;
            ctx.strokeRect(gp.x - gw/2, gp.y - gh/2, gw, gh);
            
            // Goal posts
            ctx.lineWidth = 10 * gp.scale;
            ctx.beginPath();
            ctx.moveTo(gp.x - gw/2, gp.y + gh/2); ctx.lineTo(gp.x - gw/2, gp.y - gh/2); ctx.lineTo(gp.x + gw/2, gp.y - gh/2); ctx.lineTo(gp.x + gw/2, gp.y + gh/2);
            ctx.stroke();
        }

        // Update and Draw Goalie
        goalie.x += goalie.vx;
        if (goalie.x > 200 || goalie.x < -200) {
            goalie.vx *= -1; // Move side to side
        }
        
        const gop = project(goalie.x, goalie.y, goalie.z);
        if (gop.scale > 0 && goalie.img.complete) {
            const gow = goalie.w * gop.scale;
            const goh = goalie.h * gop.scale;
            ctx.drawImage(goalie.img, gop.x - gow/2, gop.y - goh/2, gow, goh);
        }

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

            // Collisions with Goalie
            if (Math.abs(b.z - goalie.z) < 50) {
                if (b.x > goalie.x - goalie.w/2 && b.x < goalie.x + goalie.w/2 &&
                    b.y > goalie.y - goalie.h/2 && b.y < goalie.y + goalie.h/2) {
                    
                    // SAVED!
                    b.active = false;
                    const proj = project(goalie.x, goalie.y, goalie.z);
                    createParticles(proj.x, proj.y, proj.scale * 2);
                    
                    document.body.style.background = 'rgba(255, 0, 0, 0.3)';
                    setTimeout(() => document.body.style.background = '', 100);
                }
            }

            // Collisions with Goal / Back Wall
            if (b.active && b.z > goal.z) {
                b.active = false;
                if (b.x > goal.x - goal.w/2 && b.x < goal.x + goal.w/2 &&
                    b.y > goal.y - goal.h/2 && b.y < goal.y + goal.h/2) {
                        
                    // GOAL SCORED!
                    const proj = project(b.x, b.y, goal.z);
                    createParticles(proj.x, proj.y, proj.scale * 3);
                    
                    score += 500;
                    scoreDisplay.textContent = score;
                    scoreDisplay.style.transform = 'scale(1.5)';
                    scoreDisplay.style.color = '#00FFCC';
                    setTimeout(() => {
                        scoreDisplay.style.transform = '';
                        scoreDisplay.style.color = '';
                    }, 400);
                }
            }

            // Destroy when far away or behind camera
            if (b.z > 2000 || p.scale < 0) {
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
