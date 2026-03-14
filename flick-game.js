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
        y: -100,
        z: 1150, // Just in front of the goal
        w: 1200,
        h: 1200,
        vx: 5, // Calm, smooth sliding speed
        img: new Image(),
        frame: 0,
        tick: 0,
        diveTimer: 0, // Keeps track of how long to hold the dive
        totalFrames: 4,     // The sprite sheet has 4 frames
        animCols: 2,        // It's a 2x2 grid
        frameWidth: 320,    // Default, will be updated onload
        frameHeight: 320,
        direction: 1        // 1 = Right, -1 = Left (Mirror)
    };
    
    // Load and process image to remove magenta "green screen"
    const rawImg = new Image();
    rawImg.crossOrigin = "Anonymous";
    rawImg.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rawImg.width;
        tempCanvas.height = rawImg.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(rawImg, 0, 0);
        
        // Remove magenta colored background AND pure black grid lines
        const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Magenta filter
            if (data[i] > 200 && data[i+1] < 100 && data[i+2] > 200) {
                data[i+3] = 0; // Make transparent
            }
            // Black grid lines filter
            if (data[i] < 30 && data[i+1] < 30 && data[i+2] < 30) {
                data[i+3] = 0; // Make transparent
            }
        }
        tCtx.putImageData(imgData, 0, 0);
        
        goalie.img.src = tempCanvas.toDataURL('image/png');
        goalie.frameWidth = rawImg.width / 2;
        goalie.frameHeight = rawImg.height / 2;
    };
    rawImg.src = 'goalie_sprite_v2.png';

    const stadiumImg = new Image();
    stadiumImg.src = 'stadium.png';

    const ballImg = new Image();
    const rawBallImg = new Image();
    rawBallImg.crossOrigin = "Anonymous";
    rawBallImg.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = rawBallImg.width;
        tempCanvas.height = rawBallImg.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(rawBallImg, 0, 0);
        
        // Remove white background and make it transparent
        const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) {
                data[i+3] = 0; 
            }
        }
        tCtx.putImageData(imgData, 0, 0);
        ballImg.src = tempCanvas.toDataURL('image/png');
    };
    rawBallImg.src = 'ball.png';

    const goal = {
        x: 0,
        y: -300, // Center of goal Y
        z: 1200, // Far back wall
        w: 2400,  // Width of goal
        h: 1000   // Height of goal
    };

    function spawnObstacles() {
        // We only use the goalie and goal now.
    }

    // Called when Vision Engine detects a real-life physical shot hitting the back wall
    window.handleGoalDetected = function(zoneId, index) {
        if (!isPlaying) return;

        // We map the physical camera hit to a target point on the 3D Goal far away
        let targetX = goal.x;
        let targetY = goal.y;
        
        if (zoneId === 'top-left') { targetX = goal.x - goal.w/2 + 200; targetY = goal.y - goal.h/2 + 200; }
        else if (zoneId === 'top-right') { targetX = goal.x + goal.w/2 - 200; targetY = goal.y - goal.h/2 + 200; }
        else if (zoneId === 'bottom-left') { targetX = goal.x - goal.w/2 + 200; targetY = goal.y + goal.h/2 - 150; }
        else if (zoneId === 'bottom-right') { targetX = goal.x + goal.w/2 - 200; targetY = goal.y + goal.h/2 - 150; }

        // Add some nice random scatter
        targetX += (Math.random() - 0.5) * 150;
        targetY += (Math.random() - 0.5) * 150;

        // Tell AI Goalie which way to dive
        goalie.direction = (targetX > 0) ? 1 : -1;

        // Get the actual physical speed from our new radar logic
        let speedKmh = 40; // default
        if(window.visionEngine && window.visionEngine.currentBallSpeedKmh) {
            speedKmh = window.visionEngine.currentBallSpeedKmh;
            if (speedKmh < 20) speedKmh = 20;
        }
        
        // Shoot from bottom center of the screen
        let startX = 0;
        let startY = 300; 
        
        // Calculate velocities to hit the target
        let vz = speedKmh * 1.5 + 15; 
        let t = goal.z / vz; // time to reach goal plane
        let gravity = 0.8;
        
        let vx = (targetX - startX) / t;
        let vy = (targetY - startY) / t - 0.5 * gravity * t; // Calculate arc so it lands on target

        // Virtual ball starts at the screen plane (Z = 0) and flies backwards into the 3D space
        balls.push({
            x: startX,
            y: startY,
            z: 0,
            vx: vx,
            vy: vy,
            vz: vz,
            radius: 30, // Base size
            active: true,
            history: [] // for the ball trail
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
        const horizonY = canvas.height * 0.55;
        
        if (stadiumImg.complete) {
            ctx.drawImage(stadiumImg, 0, 0, canvas.width, canvas.height);
        } else {
            // Draw Solid Sky Background
            let skyGradient = ctx.createLinearGradient(0, 0, 0, horizonY);
            skyGradient.addColorStop(0, '#0a0f1a'); // Dark top
            skyGradient.addColorStop(1, '#1e3c5a'); // Lighter horizon
            ctx.fillStyle = skyGradient;
            ctx.fillRect(0, 0, canvas.width, horizonY);
            
            // Draw Solid Grass Floor
            let grassGradient = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
            grassGradient.addColorStop(0, '#2b8a21'); // Deep green horizon
            grassGradient.addColorStop(1, '#4caf50'); // Bright green bottom
            ctx.fillStyle = grassGradient;
            ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);
        }

        // Hide targets from vision-engine for clean view
        if(window.visionEngine) {
            window.visionEngine.showTargets = false;
        }

        // Draw Field Lines (perspective) ON GRASS
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(canvas.width*0.25, canvas.height); ctx.lineTo(canvas.width*0.42, horizonY);
        ctx.moveTo(canvas.width*0.75, canvas.height); ctx.lineTo(canvas.width*0.58, horizonY);
        ctx.moveTo(0, canvas.height*0.85); ctx.lineTo(canvas.width, canvas.height*0.85);
        ctx.moveTo(0, canvas.height*0.7); ctx.lineTo(canvas.width, canvas.height*0.7);
        ctx.stroke();

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

        // --- Draw 3D Goal at distance ---
        const f_tl = project(goal.x - goal.w/2, goal.y - goal.h/2, goal.z);
        const f_tr = project(goal.x + goal.w/2, goal.y - goal.h/2, goal.z);
        const f_bl = project(goal.x - goal.w/2, goal.y + goal.h/2, goal.z);
        const f_br = project(goal.x + goal.w/2, goal.y + goal.h/2, goal.z);

        const b_tl = project(goal.x - goal.w/2, goal.y - goal.h/2 + 50, goal.z + 200);
        const b_tr = project(goal.x + goal.w/2, goal.y - goal.h/2 + 50, goal.z + 200);
        const b_bl = project(goal.x - goal.w/2, goal.y + goal.h/2, goal.z + 200);
        const b_br = project(goal.x + goal.w/2, goal.y + goal.h/2, goal.z + 200);

        // Draw Net Fill (semi-transparent white)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        // Back Net
        ctx.beginPath(); ctx.moveTo(b_tl.x, b_tl.y); ctx.lineTo(b_tr.x, b_tr.y); ctx.lineTo(b_br.x, b_br.y); ctx.lineTo(b_bl.x, b_bl.y); ctx.fill();
        // Left Net
        ctx.beginPath(); ctx.moveTo(f_tl.x, f_tl.y); ctx.lineTo(b_tl.x, b_tl.y); ctx.lineTo(b_bl.x, b_bl.y); ctx.lineTo(f_bl.x, f_bl.y); ctx.fill();
        // Right Net
        ctx.beginPath(); ctx.moveTo(f_tr.x, f_tr.y); ctx.lineTo(b_tr.x, b_tr.y); ctx.lineTo(b_br.x, b_br.y); ctx.lineTo(f_br.x, f_br.y); ctx.fill();
        // Top Net
        ctx.beginPath(); ctx.moveTo(f_tl.x, f_tl.y); ctx.lineTo(b_tl.x, b_tl.y); ctx.lineTo(b_tr.x, b_tr.y); ctx.lineTo(f_tr.x, f_tr.y); ctx.fill();

        // Draw Net Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(f_tl.x, f_tl.y); ctx.lineTo(b_tl.x, b_tl.y);
        ctx.moveTo(f_tr.x, f_tr.y); ctx.lineTo(b_tr.x, b_tr.y);
        ctx.moveTo(b_tl.x, b_tl.y); ctx.lineTo(b_tr.x, b_tr.y);
        ctx.moveTo(b_tl.x, b_tl.y); ctx.lineTo(b_bl.x, b_bl.y);
        ctx.moveTo(b_tr.x, b_tr.y); ctx.lineTo(b_br.x, b_br.y);
        ctx.stroke();

        // Front Goal Posts (Thick White)
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(f_bl.x, f_bl.y); ctx.lineTo(f_tl.x, f_tl.y); ctx.lineTo(f_tr.x, f_tr.y); ctx.lineTo(f_br.x, f_br.y);
        ctx.stroke();

        // Goal Line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(f_bl.x, f_bl.y); ctx.lineTo(f_br.x, f_br.y);
        ctx.stroke();

        // Update and Draw Goalie Sprite
        // Goalie slides calmly side-to-side
        goalie.x += goalie.vx;
        const maxGoaliX = goal.w / 2 - goalie.w / 2; 
        if (goalie.x > maxGoaliX) {
            goalie.x = maxGoaliX;
            goalie.vx *= -1; 
        } else if (goalie.x < -maxGoaliX) {
            goalie.x = -maxGoaliX;
            goalie.vx *= -1;
        }

        // Sprite Animation Logic: Trigger dive and hold it after ball disappears
        if (balls.some(b => b.active)) {
            goalie.diveTimer = 60; // Hold dive for 1 second total
        }
        
        if (goalie.diveTimer > 0) {
            goalie.diveTimer--;
            goalie.tick++;
            if (goalie.tick > 4) { // Fast, visible animation
                goalie.tick = 0;
                goalie.frame++;
                if (goalie.frame >= goalie.totalFrames) {
                    goalie.frame = goalie.totalFrames - 1; // Stay on the last dive frame
                }
            }
        } else {
            goalie.frame = 0; // Reset to ready stance
            goalie.tick = 0;
        }

        const gop = project(goalie.x, goalie.y, goalie.z);
        if (gop.scale > 0 && goalie.img.complete) {
            const gow = goalie.w * gop.scale;
            const goh = goalie.h * gop.scale;
            
            // Calculate which sub-image (frame) to clip from the sprite sheet
            const col = goalie.frame % goalie.animCols;
            const row = Math.floor(goalie.frame / goalie.animCols);
            
            // Add a 2 pixel inset crop to remove any outline artifacts from the bounding box of the frames
            const cropOffset = 4;
            const srcX = col * goalie.frameWidth + cropOffset;
            const srcY = row * goalie.frameHeight + cropOffset;
            const drawW = goalie.frameWidth - (cropOffset * 2);
            const drawH = goalie.frameHeight - (cropOffset * 2);

            // Draw only that specific frame using the 9-argument drawImage format with Mirroring Support
            ctx.save();
            ctx.translate(gop.x, gop.y);
            ctx.scale(goalie.direction, 1);
            ctx.drawImage(
                goalie.img, 
                srcX, srcY, drawW, drawH, // Source clipping rect (cropped!)
                -gow/2, -goh/2, gow, goh // Destination projection rect relative to center
            );
            ctx.restore();
        }

        // Update Balls (Physics in 3D)
        balls = balls.filter(b => b.active);
        balls.forEach(b => {
             // Record history for trail drawing
            b.history.push({ x: b.x, y: b.y, z: b.z });
            if (b.history.length > 50) b.history.shift(); // Max trail length

            b.x += b.vx;
            b.y += b.vy;
            b.z += b.vz;

            // Gravity in 3D (Y goes down)
            b.vy += 0.8; // slightly heavier gravity

            // Simple floor bounce
            if(b.y > canvas.height * 0.55 - 50) { // relative down ground level
                b.y = canvas.height * 0.55 - 50;
                b.vy *= -0.6; 
            }

            // Project to screen
            const p = project(b.x, b.y, b.z);

            // Draw glowing orange Trail
            if (b.history.length > 1) {
                ctx.beginPath();
                const firstP = project(b.history[0].x, b.history[0].y, b.history[0].z);
                ctx.moveTo(firstP.x, firstP.y);
                for (let i = 1; i < b.history.length; i++) {
                    const hp = project(b.history[i].x, b.history[i].y, b.history[i].z);
                    if (hp.scale > 0) ctx.lineTo(hp.x, hp.y);
                }
                ctx.strokeStyle = 'rgba(255, 120, 0, 0.8)';
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#FF5500';
                ctx.lineWidth = 15 * p.scale; 
                ctx.stroke();
                // Reset shadow
                ctx.shadowBlur = 0;
            }

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
            if (b.z > 1500 || p.scale < 0) {
                b.active = false;
            }

            // Draw Virtual Ball Graphic
            if (p.scale > 0) {
                if (ballImg && ballImg.complete) {
                    const bw = b.radius * 2 * p.scale;
                    ctx.drawImage(ballImg, p.x - bw/2, p.y - bw/2, bw, bw);
                } else {
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
            speedDisplay.innerHTML = `${Math.round(window.visionEngine.currentBallSpeedKmh)}<span style="font-size:1rem; margin-left:4px; color:#fff; text-shadow: none;">KM/H</span>`;
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
