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

    let goalie = {
        x: 0,
        y: -50, // Above ground
        z: 550, // Just in front of the goal
        w: 200,
        h: 250,
        vx: 8,
        img: new Image()
    };
    goalie.img.src = 'goalie.png';

    const goal = {
        x: 0,
        y: -100,
        z: 600, // Back wall (closer)
        w: 600,
        h: 400
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

        // Add slight dark gradient at the bottom for contrast
        const horizonY = canvas.height * 0.5;
        
        // Hide targets from vision-engine for clean view
        if(window.visionEngine) {
            window.visionEngine.showTargets = false;
        }

        let trackPos = null;
        if(window.visionEngine && window.visionEngine.lastBallPos) {
            trackPos = window.visionEngine.lastBallPos;
        }

        // Draw live real ball tracker
        if (trackPos) {
            ctx.beginPath();
            ctx.arc(trackPos.x, trackPos.y, 25, 0, Math.PI*2);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 255, 204, 0.8)';
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(trackPos.x, trackPos.y, 5, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(0, 255, 204, 0.8)';
            ctx.fill();
            
            ctx.font = '12px "Russo One"';
            ctx.fillStyle = '#00FFCC';
            ctx.fillText("LOCKED", trackPos.x + 30, trackPos.y);
        }

        // Real-world target mapping to 3D Goal Dimensions at Z=0 (Front of goal)
        const gw3d = canvas.width * 0.44; // From x=0.28 to x=0.72 = 0.44
        const gh3d = canvas.height * 0.37; // From y=0.15 to y=0.52 = 0.37
        const gy3d = (canvas.height * 0.67) / 2 - (canvas.height / 2); // Center of that Y space

        const f_tl = project(-gw3d/2, gy3d - gh3d/2, 0);       // Front top left
        const f_tr = project(gw3d/2, gy3d - gh3d/2, 0);        // Front top right
        const f_bl = project(-gw3d/2, gy3d + gh3d/2, 0);       // Front bottom left
        const f_br = project(gw3d/2, gy3d + gh3d/2, 0);        // Front bottom right

        const b_tl = project(-gw3d/2, gy3d - gh3d/2, goal.z);  // Back top left
        const b_tr = project(gw3d/2, gy3d - gh3d/2, goal.z);   // Back top right
        const b_bl = project(-gw3d/2, gy3d + gh3d/2, goal.z);  // Back bottom left
        const b_br = project(gw3d/2, gy3d + gh3d/2, goal.z);   // Back bottom right

        // Draw Front Goal Line (Maaliviiva)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(f_bl.x, f_bl.y); ctx.lineTo(f_br.x, f_br.y);
        ctx.stroke();

        // Draw Front Goal Posts (Thick White)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(f_bl.x, f_bl.y); // Bottom left
        ctx.lineTo(f_tl.x, f_tl.y); // Top left
        ctx.lineTo(f_tr.x, f_tr.y); // Top right
        ctx.lineTo(f_br.x, f_br.y); // Bottom right
        ctx.stroke();

        // Update and Draw Goalie
        goalie.x += goalie.vx;
        const maxGoaliX = gw3d / 2; // Keep goalie inside goal width
        if (goalie.x > maxGoaliX || goalie.x < -maxGoaliX) {
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
                if (b.x > -gw3d/2 && b.x < gw3d/2 &&
                    b.y > gy3d - gh3d/2 && b.y < gy3d + gh3d/2) {
                        
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
            if (b.z > 1500 || p.scale < 0) {
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

        // Update speed HUD
        if(window.visionEngine && window.visionEngine.measureBallSpeed) {
            speedDisplay.innerHTML = `${Math.round(window.visionEngine.currentBallSpeedKmh)}<span style="font-size:1rem; margin-left:2px; color:#aaa;">KMH</span>`;
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
            window.visionEngine.showTargets = false; // Add it here too just to be sure
        }

        isPlaying = true;
        balls = [];
        particles = [];
        spawnObstacles();
        gameLoop();
    });
});
