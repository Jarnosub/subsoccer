document.addEventListener('DOMContentLoaded', () => {
    let score = 0;
    let isPlaying = false;
    let requestID = null;

    let timeLeft = 45;
    let timerInterval = null;

    const btnStart = document.getElementById('btn-start');
    const scoreDisplay = document.getElementById('score-value');
    const speedDisplay = document.getElementById('speed-value');
    const timeDisplay = document.getElementById('time-value');
    
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

    let movingTarget = {
        x: 0,
        y: -300,
        z: 1180, // Behind goalie (1150) but in front of back wall (1200)
        radius: 150, // Start size
        vx: 8,
        vy: 4,
        active: true,
        flipActive: false,
        flipTimer: 0
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
    rawImg.src = 'goalie_sprite_graphic.png';

    const stadiumImg = new Image();
    stadiumImg.src = 'stadium1920.jpg';

    const ballImg = new Image();
    const processedBall = document.createElement('canvas');
    ballImg.onload = () => {
        processedBall.width = ballImg.width;
        processedBall.height = ballImg.height;
        const bCtx = processedBall.getContext('2d');
        
        // Permanent circular mask for the ball
        bCtx.beginPath();
        bCtx.arc(ballImg.width/2, ballImg.height/2, (ballImg.width/2) * 0.95, 0, Math.PI*2);
        bCtx.clip();
        bCtx.drawImage(ballImg, 0, 0);
        ballImg.processed = true;
    };
    ballImg.src = 'ball.png';

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
    let lastShotTime = 0;
    
    window.handleGoalDetected = function(zoneId, index) {
        if (!isPlaying) return;

        // Anti-spam cooldown: prevent multiple rapid accidental shots
        const now = Date.now();
        if (now - lastShotTime < 1500) return;
        lastShotTime = now;

        // We map the physical camera hit to a target point on the 3D Goal far away
        let targetX = goal.x;
        let targetY = goal.y;
        
        // 1. Get horizontal position (X axis) based on the camera's actual ball position
        if (window.visionEngine && window.visionEngine.lastBallPos) {
            // Map camera width (assume innerWidth) to goal width (goal.w)
            const cw = window.innerWidth;
            const ballX = window.visionEngine.lastBallPos.x;
            targetX = goal.x + ((ballX / cw) * goal.w - (goal.w/2));
            
            // Constrain to the goal limits so it hits the net
            const maxW = goal.w/2 - 150;
            if (targetX < -maxW) targetX = -maxW;
            if (targetX > maxW) targetX = maxW;
        } else {
            // Fallback if we only have the hit zone
            if (zoneId.includes('left')) targetX = goal.x - goal.w/3;
            if (zoneId.includes('right')) targetX = goal.x + goal.w/3;
        }

        // 2. Get the actual physical speed
        let speedKmh = 40; // default
        if (window.visionEngine && window.visionEngine.currentBallSpeedKmh) {
            speedKmh = window.visionEngine.currentBallSpeedKmh;
            if (speedKmh < 20) speedKmh = 20;
        }

        // 3. Get vertical position (Y axis) based entirely on speed!
        const bottomY = goal.y + goal.h/2 - 150;
        const topY = goal.y - goal.h/2 + 200;
        
        // Let's cap logical flight speed between 25 and 80 km/h for the altitude mapping
        let flightPower = (speedKmh - 25) / (75 - 25);
        if (flightPower < 0) flightPower = 0;
        if (flightPower > 1) flightPower = 1;

        // Apply curve so really hard shots fly high into the roof
        flightPower = Math.pow(flightPower, 1.2); 
        targetY = bottomY - (bottomY - topY) * flightPower;

        // Add some nice random scatter (reduced slightly for more precision)
        targetX += (Math.random() - 0.5) * 80;
        targetY += (Math.random() - 0.5) * 80;

        // Limit Y finally just inside the mesh
        if (targetY < topY - 50) targetY = topY - 50;
        if (targetY > bottomY + 50) targetY = bottomY + 50;

        // Tell AI Goalie which way to dive
        goalie.direction = (targetX > 0) ? 1 : -1;
        
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
            radius: 70, // Increased base size so it's clearly visible in 3D distance
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



        let trackPos = null;
        if(window.visionEngine && window.visionEngine.lastBallPos) {
            trackPos = window.visionEngine.lastBallPos;
        }

        // Draw High-Tech Live Ball Tracker (E-Sports Reticle)
        if (trackPos) {
            ctx.save();
            ctx.translate(trackPos.x, trackPos.y);
            
            // Subtle pulse/spin effect based on time
            const t = Date.now() / 1000;
            
            // Outer dashed spinning ring
            ctx.beginPath();
            ctx.setLineDash([10, 15]);
            ctx.arc(0, 0, 35 + Math.sin(t*5)*3, 0, Math.PI*2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
            ctx.rotate(t);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Corner brackets
            ctx.rotate(-t); // Reset rotation for fixed brackets
            ctx.strokeStyle = '#00FFCC';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#00FFCC';
            ctx.shadowBlur = 10;
            
            const s = 25; // Size of bracket from center
            const l = 8; // Length of bracket arm
            
            // Top Left
            ctx.beginPath(); ctx.moveTo(-s, -s+l); ctx.lineTo(-s, -s); ctx.lineTo(-s+l, -s); ctx.stroke();
            // Top Right
            ctx.beginPath(); ctx.moveTo(s-l, -s); ctx.lineTo(s, -s); ctx.lineTo(s, -s+l); ctx.stroke();
            // Bottom Right
            ctx.beginPath(); ctx.moveTo(s, s-l); ctx.lineTo(s, s); ctx.lineTo(s-l, s); ctx.stroke();
            // Bottom Left
            ctx.beginPath(); ctx.moveTo(-s+l, s); ctx.lineTo(-s, s); ctx.lineTo(-s, s-l); ctx.stroke();
            
            // Solid Center Dot
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI*2);
            ctx.fillStyle = '#00FFCC';
            ctx.fill();
            
            // High Tech Data Text
            ctx.font = '10px "Russo One", monospace';
            ctx.fillStyle = '#00FFCC';
            ctx.fillText("TRK_LCK", 30, -10);
            
            ctx.font = '8px monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillText(`X:${Math.round(trackPos.x)} Y:${Math.round(trackPos.y)}`, 30, 0);
            
            ctx.restore();
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

        // Draw Net Grid (Horizontal / Depth lines)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 10; i++) {
            let f_y = f_tl.y + (f_bl.y - f_tl.y) * (i/10);
            let b_y = b_tl.y + (b_bl.y - b_tl.y) * (i/10);
            ctx.beginPath();
            ctx.moveTo(f_tl.x, f_y); ctx.lineTo(b_tl.x, b_y); ctx.lineTo(b_tr.x, b_y); ctx.lineTo(f_tr.x, f_y);
            ctx.stroke();
        }
        
        // Draw Net Grid (Vertical Back lines)
        for (let i = 1; i <= 20; i++) {
            let bx = b_tl.x + (b_tr.x - b_tl.x) * (i/20);
            ctx.beginPath();
            ctx.moveTo(bx, b_tl.y); ctx.lineTo(bx, b_bl.y);
            ctx.stroke();
        }

        // Draw Net Grid (Vertical Side lines)
        for (let i = 1; i <= 5; i++) {
            let lx = f_tl.x + (b_tl.x - f_tl.x) * (i/5);
            let ly = f_tl.y + (b_tl.y - f_tl.y) * (i/5);
            let lb = f_bl.y + (b_bl.y - f_bl.y) * (i/5);
            ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, lb); ctx.stroke();

            let rx = f_tr.x + (b_tr.x - f_tr.x) * (i/5);
            let r_y = f_tr.y + (b_tr.y - f_tr.y) * (i/5);
            let rb = f_br.y + (b_br.y - f_br.y) * (i/5);
            ctx.beginPath(); ctx.moveTo(rx, r_y); ctx.lineTo(rx, rb); ctx.stroke();
        }

        // Front Goal Posts (Thick 3D White Cylinders)
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'butt';
        
        // 1. Base thick beige post
        ctx.strokeStyle = 'rgb(213, 208, 203)';
        ctx.lineWidth = 15; // Make it thick enough to be clearly visible as a post
        ctx.beginPath();
        ctx.moveTo(f_bl.x, f_bl.y); ctx.lineTo(f_tl.x, f_tl.y); ctx.lineTo(f_tr.x, f_tr.y); ctx.lineTo(f_br.x, f_br.y);
        ctx.stroke();

        // 2. Inner shading to simulate cylinder rounding
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(f_bl.x + 4, f_bl.y); ctx.lineTo(f_tl.x + 4, f_tl.y + 4); ctx.lineTo(f_tr.x - 4, f_tr.y + 4); ctx.lineTo(f_br.x - 4, f_br.y);
        ctx.stroke();

        // Goal Line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, f_bl.y); ctx.lineTo(canvas.width, f_br.y);
        ctx.stroke();

        if (!isPlaying) {
            requestID = requestAnimationFrame(gameLoop);
            return;
        }

        // Update and Draw Moving Target (Behind Goalie)
        if (movingTarget.active) {
            movingTarget.x += movingTarget.vx;
            movingTarget.y += movingTarget.vy;
            
            // Bounce inside goal limits
            const maxTx = goal.w/2 - movingTarget.radius;
            const maxTy = goal.h/2 - movingTarget.radius;
            
            if (movingTarget.x > maxTx) { movingTarget.x = maxTx; movingTarget.vx *= -1; }
            if (movingTarget.x < -maxTx) { movingTarget.x = -maxTx; movingTarget.vx *= -1; }
            if (movingTarget.y > goal.y + maxTy) { movingTarget.y = goal.y + maxTy; movingTarget.vy *= -1; }
            if (movingTarget.y < goal.y - maxTy) { movingTarget.y = goal.y - maxTy; movingTarget.vy *= -1; }

            const tp = project(movingTarget.x, movingTarget.y, movingTarget.z);
            if (tp.scale > 0) {
                const tr = movingTarget.radius * tp.scale;
                ctx.save();
                ctx.translate(tp.x, tp.y);

                // Handle hit flip animation
                if (movingTarget.flipActive) {
                    movingTarget.flipTimer -= 0.05;
                    if (movingTarget.flipTimer <= 0) {
                        movingTarget.flipActive = false;
                        movingTarget.flipTimer = 0;
                    }
                    // Apply a 3D spin effect by scaling X axis based on cosine
                    // PI * 4 = 2 full rotations during the 1.0 timer
                    ctx.scale(Math.cos(movingTarget.flipTimer * Math.PI * 4), 1);
                }

                // Draw Classic Red/White Target
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = 15; // Drop shadow for popping off the net
                ctx.shadowOffsetY = 10;
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255,255,255,0.2)'; // Faint shine ring
                
                // Outer White Rim
                ctx.beginPath(); ctx.arc(0, 0, tr, 0, Math.PI*2);
                ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.stroke();
                
                // Outer Navy Blue
                ctx.beginPath(); ctx.arc(0, 0, tr * 0.92, 0, Math.PI*2);
                ctx.fillStyle = '#21314d'; ctx.fill(); ctx.stroke();
                
                // Reset shadow after outer circle
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;

                // Inner White
                ctx.beginPath(); ctx.arc(0, 0, tr * 0.6, 0, Math.PI*2);
                ctx.fillStyle = '#ebeced'; ctx.fill(); ctx.stroke();
                
                // Inner Red (Increased by 20%)
                ctx.beginPath(); ctx.arc(0, 0, tr * 0.3, 0, Math.PI*2);
                ctx.fillStyle = '#c92728'; ctx.fill(); ctx.stroke();
                
                ctx.restore();
            }
        }

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

            // Draw glowing cyan/white comet Trail
            if (b.history.length > 1) {
                for (let i = 1; i < b.history.length; i++) {
                    const prevP = project(b.history[i-1].x, b.history[i-1].y, b.history[i-1].z);
                    const currP = project(b.history[i].x, b.history[i].y, b.history[i].z);
                    
                    if (prevP.scale > 0 && currP.scale > 0) {
                        let alpha = i / b.history.length; // 0.0 at tail, 1.0 at head
                        
                        // Outer Cyan Glow
                        ctx.beginPath();
                        ctx.moveTo(prevP.x, prevP.y);
                        ctx.lineTo(currP.x, currP.y);
                        ctx.strokeStyle = `rgba(0, 255, 204, ${alpha * 0.6})`;
                        ctx.lineWidth = (20 * currP.scale) * alpha; 
                        ctx.stroke();

                        // Inner Bright White Core
                        ctx.beginPath();
                        ctx.moveTo(prevP.x, prevP.y);
                        ctx.lineTo(currP.x, currP.y);
                        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                        ctx.lineWidth = (8 * currP.scale) * Math.max(0.2, alpha); 
                        ctx.stroke();
                    }
                }
            }

            // Collisions with Goalie (Robust Z-depth cross check)
            if (b.active && b.z >= goalie.z - 50 && b.z <= goalie.z + b.vz + 50) {
                // Tighten the hitbox to match the actual visual body of the sprite (60% width, 80% height)
                const hitW = goalie.w * 0.6;
                const hitH = goalie.h * 0.8;
                if (b.x > goalie.x - hitW/2 && b.x < goalie.x + hitW/2 &&
                    b.y > goalie.y - hitH/2 && b.y < goalie.y + hitH/2) {
                    
                    // SAVED!
                    b.active = false;
                    const proj = project(goalie.x, goalie.y, goalie.z);
                    createParticles(proj.x, proj.y, proj.scale * 2);
                    
                    document.body.style.background = 'rgba(255, 0, 0, 0.3)';
                    setTimeout(() => document.body.style.background = '', 100);
                }
            }

            // Collisions with Moving Target
            if (b.active && movingTarget.active && b.z >= movingTarget.z - 50 && b.z <= movingTarget.z + b.vz + 50) {
                if (b.x > movingTarget.x - movingTarget.radius && b.x < movingTarget.x + movingTarget.radius &&
                    b.y > movingTarget.y - movingTarget.radius && b.y < movingTarget.y + movingTarget.radius) {
                    
                    // TARGET HIT!
                    b.active = false;
                    
                    // Trigger the spin animation
                    movingTarget.flipActive = true;
                    movingTarget.flipTimer = 1.0;
                    
                    const proj = project(movingTarget.x, movingTarget.y, movingTarget.z);
                    createParticles(proj.x, proj.y, proj.scale * 3);
                    createParticles(proj.x, proj.y, proj.scale * 3); // Extra explosion
                    
                    score += 1500;
                    scoreDisplay.textContent = score;
                    scoreDisplay.style.transform = 'scale(2.5)';
                    scoreDisplay.style.color = '#E30613'; // Match target red color
                    setTimeout(() => {
                        scoreDisplay.style.transform = '';
                        scoreDisplay.style.color = '';
                    }, 400);

                    // Flash background
                    document.body.style.background = 'rgba(227, 6, 19, 0.3)';
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
                if (ballImg && ballImg.processed) {
                    const bw = b.radius * 2 * p.scale;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    // Add cool rotation effect matching ball speed
                    ctx.rotate(b.z * 0.05); 
                    ctx.drawImage(processedBall, -bw/2, -bw/2, bw, bw);
                    ctx.restore();
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
        
        timeLeft = 45;
        if(timeDisplay) timeDisplay.textContent = timeLeft;
        if(timerInterval) clearInterval(timerInterval);
        
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
        // gameLoop was already started in background
        
        timerInterval = setInterval(() => {
            if (!isPlaying) return;
            timeLeft--;
            if (timeDisplay) timeDisplay.textContent = timeLeft;
            
            // Time is up
            if (timeLeft <= 0) {
                isPlaying = false;
                clearInterval(timerInterval);
                btnStart.style.display = 'inline-block';
                btnStart.textContent = "TIME OVER - RETRY";
            }
        }, 1000);
    });

    // Start background loop only after stadium image loads to prevent green grass flash
    if (stadiumImg.complete) {
        requestAnimationFrame(gameLoop);
    } else {
        stadiumImg.addEventListener('load', () => requestAnimationFrame(gameLoop));
    }
});
