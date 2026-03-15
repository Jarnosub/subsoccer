document.addEventListener('DOMContentLoaded', () => {
    let score = 0;
window.isPlaying = false;
    let requestID = null;

    let timeLeft = 45;
    let timerInterval = null;

    const btnStartTouch = document.getElementById('btn-start-touch');
    const btnStartTrackman = document.getElementById('btn-start-trackman');
    const startMenu = document.getElementById('start-menu');
    const scoreDisplay = document.getElementById('score-value');
    const speedDisplay = document.getElementById('speed-value');
    const timeDisplay = document.getElementById('time-value');
    
    // Setup Physics Canvas
    const canvas = document.getElementById('physics-canvas');
    const ctx = canvas.getContext('2d');
    
    const stadiumImg = new Image();

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const isPortrait = window.innerHeight > window.innerWidth;
        const expectedSrc = isPortrait ? 'stadium1080_night.jpg' : 'stadium1920_night.jpg';
        if (!stadiumImg.src.includes(expectedSrc)) {
            stadiumImg.src = expectedSrc;
        }
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

    // stadiumImg defined above to support resize handler

    const ballImg = new Image();
    const processedBall = document.createElement('canvas');
    ballImg.onload = () => {
        // The original ball.png has a large white padding. We crop into the actual ball texture.
        const actualBallSize = ballImg.width * 0.72; 
        
        processedBall.width = actualBallSize;
        processedBall.height = actualBallSize;
        const bCtx = processedBall.getContext('2d');
        
        // Permanent circular mask for the ball
        bCtx.beginPath();
        bCtx.arc(actualBallSize/2, actualBallSize/2, actualBallSize/2 - 1, 0, Math.PI*2);
        bCtx.clip();
        
        // Draw the source image shifted so the padding is outside the canvas
        const offset = (ballImg.width - actualBallSize) / 2;
        bCtx.drawImage(ballImg, -offset, -offset, ballImg.width, ballImg.height);
        
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
        if (!window.isPlaying) return;

        // Anti-spam cooldown: prevent multiple rapid accidental shots
        const now = Date.now();
        if (now - lastShotTime < 1500) return;
        lastShotTime = now;

        // We map the physical camera hit to a target point on the 3D Goal far away
        let targetX = goal.x;
        let targetY = goal.y;
        
        // 1. Get horizontal position (X axis) based on the camera's actual ball position
        if (window.visionEngine && window.visionEngine.lastBallPos) {
            // Map camera width (assume innerWidth) slightly wider than goal width (goal.w) to allow missing wide
            const cw = window.innerWidth;
            const ballX = window.visionEngine.lastBallPos.x;
            
            // Multiply mapping by 1.4 so shooting at the very edges goes wide of the goal posts!
            targetX = goal.x + ((ballX / cw) * (goal.w * 1.4) - (goal.w * 0.7));
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
        
        // Let's cap logical flight speed calculation. Do NOT cap maximum mapping so it can soar over!
        let flightPower = (speedKmh - 25) / (75 - 25);
        if (flightPower < 0) flightPower = 0;
        
        // Apply curve so really hard shots fly high
        flightPower = Math.pow(flightPower, 1.2); 
        targetY = bottomY - (bottomY - topY) * flightPower;

        // Add some nice random scatter (reduced slightly for more precision)
        targetX += (Math.random() - 0.5) * 80;
        targetY += (Math.random() - 0.5) * 80;

        // Prevent ball from going deep underground, but allow it to fly freely over the top!
        if (targetY > bottomY + 50) targetY = bottomY + 50;

        // Tell AI Goalie which way to dive
        goalie.direction = (targetX > 0) ? 1 : -1;
        
        shootVirtualBall(targetX, targetY, speedKmh);
    };

    function shootVirtualBall(targetX, targetY, speedKmh, spin = 0) {
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
            vz: vz,
            radius: 70, // Increased base size so it's clearly visible in 3D distance
            active: true,
            spin: spin, // Add spin for curve effect
            history: [] // for the ball trail
        });

        document.body.style.background = 'rgba(0, 255, 204, 0.2)';
        setTimeout(() => document.body.style.background = '', 100);
    }

    // --- Touch / Mouse 'Flick' Controls for Mobile Demo ---
    let flickStartX = 0;
    let flickStartY = 0;
    let flickCurrentX = 0;
    let flickCurrentY = 0;
    let flickStartTime = 0;
    let flickPoints = [];
    let isFlicking = false;

    function handleFlickStart(x, y) {
        if (!window.isPlaying || window.useTrackman) return;
        flickStartX = x;
        flickStartY = y;
        flickCurrentX = x;
        flickCurrentY = y;
        flickStartTime = Date.now();
        flickPoints = [{x, y}];
        isFlicking = true;
    }

    function handleFlickMove(x, y) {
        if (!window.isPlaying || !isFlicking) return;
        flickCurrentX = x;
        flickCurrentY = y;
        flickPoints.push({x, y});
    }

    function handleFlickEnd(x, y) {
        if (!window.isPlaying || !isFlicking) return;
        isFlicking = false;
        const dx = x - flickStartX;
        const dy = y - flickStartY;
        const dt = Date.now() - flickStartTime;
        flickPoints.push({x, y});

        // Must be a quick swipe upwards
        if (dt > 800 || dt < 10) return; 
        if (dy > -20) return; 

        // Simulate physical speed (resolution independent)
        const distanceObj = Math.sqrt(dx*dx + dy*dy);
        const screensPerSec = (distanceObj / window.innerHeight) / (dt / 1000);
        
        let simulatedSpeed = screensPerSec * 30; // 3 screens/sec = 90 km/h
        if (simulatedSpeed > 150) simulatedSpeed = 150;
        if (simulatedSpeed < 15) simulatedSpeed = 15;

        // Calculate Curve (Spin) by checking deviation from straight line
        let maxDeviation = 0;
        const lineLen = Math.sqrt(dx*dx + dy*dy);
        if (lineLen > 0) {
            flickPoints.forEach(p => {
                // Distance from point to line: cross product 
                let dev = ((x - flickStartX)*(flickStartY - p.y) - (flickStartX - p.x)*(y - flickStartY)) / lineLen;
                if (Math.abs(dev) > Math.abs(maxDeviation)) {
                    maxDeviation = dev;
                }
            });
        }
        
        // Convert screen pixel deviation to 3D spin force
        let spin = (maxDeviation / window.innerWidth) * 20; 
        // Cap maximum spin
        if (spin > 2.5) spin = 2.5;
        if (spin < -2.5) spin = -2.5;

        // Inverse Projection: Map swipe X & Y end position directly onto the 3D goal plane
        // This ensures the point your finger visually lands on screen matches the 3D target exactly!
        const perspective = focalLength / (focalLength + goal.z);
        const isPortrait = window.innerHeight > window.innerWidth;
        const refW = isPortrait ? 550 : 844;
        const refH = isPortrait ? 1200 : 390;
        const sx = canvas.width / refW;
        const sy = canvas.height / refH;

        const screenX = x - (canvas.width / 2);
        const screenY = y - (canvas.height / 2);
        
        let targetX = screenX / (perspective * sx);
        let pointedY = screenY / (perspective * sy);

        // Let's deduct the effect of curve from the initial shot target so it actually curves INTO the target, 
        // aiming slightly opposite to the curve direction.
        targetX -= spin * 300; 

        // Target height is basically where your finger stopped (pointedY).
        const bottomY = goal.y + goal.h/2 - 150; 
        
        let targetY = pointedY;

        // If flick is very slow, keep it closely grounded.
        if (simulatedSpeed < 35) {
            targetY = bottomY;
        } else if (simulatedSpeed > 90) {
            // Smash it: give it extra carry over what they aimed for
            const smashLift = (simulatedSpeed - 90) * 2;
            targetY -= smashLift; 
        }

        // Prevent it from diving weirdly into the floor
        if (targetY > bottomY) targetY = bottomY;

        // Scatter
        targetX += (Math.random() - 0.5) * 50;
        targetY += (Math.random() - 0.5) * 50;
        if (targetY > bottomY + 50) targetY = bottomY + 50;

        goalie.direction = (targetX > 0) ? 1 : -1;

        if(speedDisplay) {
            let curveText = "";
            if (spin > 0.5) curveText = " ↷";
            if (spin < -0.5) curveText = " ↶";
            speedDisplay.innerHTML = `${Math.round(simulatedSpeed)}<span style="font-size:1rem; margin-left:4px; color:#fff; text-shadow: none;">KM/H${curveText}</span>`;
        }
        
        shootVirtualBall(targetX, targetY, simulatedSpeed, spin);
        flickPoints = []; // reset
    }

    // Attach event listeners to physics canvas
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleFlickStart(e.touches[0].clientX, e.touches[0].clientY);
    }, {passive: false});

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        handleFlickMove(e.touches[0].clientX, e.touches[0].clientY);
    }, {passive: false});

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleFlickEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }, {passive: false});

    let isMouseDown = false;
    canvas.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        handleFlickStart(e.clientX, e.clientY);
    });
    canvas.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        handleFlickMove(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseup', (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;
        handleFlickEnd(e.clientX, e.clientY);
    });

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
        const perspective = focalLength / (focalLength + z);
        const isPortrait = window.innerHeight > window.innerWidth;
        
        // Calibration for responsive 3D projection against 100% stretched background images.
        // Landscape (stadium1920.jpg) aligns well at 844x390.
        // Portrait (stadium1080.jpg) aligns well around 550x1200 to prevent vertical goal stretching.
        const refW = isPortrait ? 550 : 844;
        const refH = isPortrait ? 1200 : 390;

        let sx = canvas.width / refW;
        let sy = canvas.height / refH;

        return {
            x: (x * perspective * sx) + (canvas.width / 2),
            y: (y * perspective * sy) + (canvas.height / 2),
            scale: perspective * Math.min(sx, sy) // uniform for round shapes (balls/sprites)
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

        // Front Goal Posts (Subsoccer Red with Black Outer Outline)
        ctx.lineJoin = 'round';
        ctx.lineCap = 'butt';
        
        // 1. Thick black outline (drawn first, behind the red)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 18; 
        ctx.beginPath();
        // Go from bottom-left up, across, and down to bottom-right (no bottom line)
        ctx.moveTo(f_bl.x, f_bl.y); ctx.lineTo(f_tl.x, f_tl.y); ctx.lineTo(f_tr.x, f_tr.y); ctx.lineTo(f_br.x, f_br.y);
        ctx.stroke();

        // 2. Base thick red post (drawn over the black line)
        ctx.strokeStyle = '#E30613';
        ctx.lineWidth = 12; 
        ctx.beginPath();
        // Go from bottom-left up, across, and down to bottom-right (no bottom line)
        ctx.moveTo(f_bl.x, f_bl.y); ctx.lineTo(f_tl.x, f_tl.y); ctx.lineTo(f_tr.x, f_tr.y); ctx.lineTo(f_br.x, f_br.y);
        ctx.stroke();

        // Goal Line (White)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, f_bl.y); ctx.lineTo(canvas.width, f_br.y);
        ctx.stroke();

        if (!window.isPlaying) {
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
            
            // Apply Magnus effect (Spin Curve) to horizontal velocity
            if (b.spin) {
                b.vx += b.spin; 
            }

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

                    if (window.soundEffects) window.soundEffects.playC64Sound('hit');
                    
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
                    
                    if(window.soundEffects) window.soundEffects.playGoalSound();
                    
                    score += 1500;
                    if (window.flickNetwork) window.flickNetwork.broadcastScore(score);
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
                    
                    if (window.soundEffects) {
                        window.soundEffects.playGoalSound();
                        window.soundEffects.playCrowdCheer();
                    }

                    score += 500;
                    if (window.flickNetwork) window.flickNetwork.broadcastScore(score);
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

        // Draw the flicking ball currently held by the finger
        if (isFlicking && ballImg && ballImg.processed) {
            ctx.save();
            ctx.translate(flickCurrentX, flickCurrentY);
            // Size of the ball while held on screen (smaller so it doesn't block view)
            const bw = 90; 
            ctx.drawImage(processedBall, -bw/2, -bw/2, bw, bw);
            ctx.restore();
        }

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
        if(window.useTrackman && window.visionEngine && window.visionEngine.measureBallSpeed) {
            speedDisplay.innerHTML = `${Math.round(window.visionEngine.currentBallSpeedKmh)}<span style="font-size:1rem; margin-left:4px; color:#fff; text-shadow: none;">KM/H</span>`;
        }

        requestID = requestAnimationFrame(gameLoop);
    }

    let countdownInterval = null;

    window.startCountdownAndGame = function(useCamera) {
        if(startMenu) startMenu.style.display = 'none';
        const waitingPopup = document.getElementById('waiting-popup');
        if(waitingPopup) waitingPopup.style.display = 'none';
        const challengePopup = document.getElementById('challenge-popup');
        if(challengePopup) challengePopup.style.display = 'none';

        const countdownPopup = document.getElementById('countdown-popup');
        const countdownValue = document.getElementById('countdown-value');
        if (countdownPopup && countdownValue) {
            countdownPopup.style.display = 'flex';
            let count = 3;
            countdownValue.textContent = count;
            // Play a beep
            if (window.soundEffects && window.soundEffects.playHitSound) window.soundEffects.playHitSound();
            
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownValue.textContent = count;
                    if (window.soundEffects && window.soundEffects.playHitSound) window.soundEffects.playHitSound();
                } else if (count === 0) {
                    countdownValue.textContent = "GO!";
                    // Play higher beep for GO!
                    if (window.soundEffects && window.soundEffects.playGoalSound) window.soundEffects.playGoalSound();
                } else {
                    clearInterval(countdownInterval);
                    countdownPopup.style.display = 'none';
                    window.actualStartGame(useCamera);
                }
            }, 1000);
        } else {
            window.actualStartGame(useCamera);
        }
    }

    window.actualStartGame = async function(useCamera) {
        if (window.isPlaying) return;
        window.useTrackman = useCamera;
        
        score = 0;
        if (window.flickNetwork) window.flickNetwork.broadcastScore(score);
        scoreDisplay.textContent = score;
        speedDisplay.innerHTML = `0<span style="font-size:1rem; margin-left:2px; color:#fff; text-shadow: none;">KM/H</span>`;
        
        timeLeft = 45;
        if(timeDisplay) timeDisplay.textContent = timeLeft;
        if(timerInterval) clearInterval(timerInterval);
        
        if(startMenu) startMenu.style.display = 'none';

        if (useCamera && window.visionEngine) {
            const success = await window.visionEngine.startCamera();
            if (!success) {
                alert("Camera access is required");
                if(startMenu) startMenu.style.display = 'flex';
                return;
            }
            window.visionEngine.onTargetHit = window.handleGoalDetected;
            window.visionEngine.measureBallSpeed = true;
            window.visionEngine.showTargets = false; 
        }

        window.isPlaying = true;
        
        if (window.soundEffects) window.soundEffects.playGameplayTheme();
        if (window.flickNetwork) window.flickNetwork.broadcastGameStart();

        balls = [];
        particles = [];
        spawnObstacles();
        
        timerInterval = setInterval(() => {
            if (!window.isPlaying) return;
            timeLeft--;
            if (timeDisplay) timeDisplay.textContent = timeLeft;
            
            // Time is up
            if (timeLeft <= 0) {
                window.isPlaying = false;
                clearInterval(timerInterval);
                

                if (window.soundEffects) {
                    window.soundEffects.fadeOutMusic(5);
                }
                
                // --- Show Victory Screen ---
                const vOverlay = document.getElementById('victory-overlay');
                const vName = document.getElementById('victory-player-name');
                const vEloGain = document.getElementById('victory-elo-gain');
                const vEloCount = document.getElementById('victory-elo-count');
                const vCardName = document.getElementById('victory-card-name');
                const vCanvas = document.getElementById('lasers-canvas');

                if (vOverlay) {
                    vOverlay.style.display = 'flex';
                    if (vEloGain) vEloGain.textContent = score + " POINTS";
                    if (vEloCount) vEloCount.textContent = score + " PTS";
                    if (vCardName) vCardName.textContent = window.myName || "PLAYER";
                    
                    if (vCanvas) {
                        vCanvas.style.display = 'block';
                        vCanvas.width = window.innerWidth;
                        vCanvas.height = window.innerHeight;
                        const ctx = vCanvas.getContext('2d');

                        let lasers = [];
                        for (let i = 0; i < 6; i++) {
                            lasers.push({
                                x: (vCanvas.width / 7) * (i + 1),
                                y: vCanvas.height + 50,
                                angle: Math.PI * 1.5 + (Math.random() - 0.5),
                                targetAngle: Math.PI * 1.5 + (Math.random() - 0.5) * 1.5,
                                speed: 0.002 + Math.random() * 0.005,
                                colorStr: i % 2 === 0 ? '227, 6, 19' : '0, 255, 204',
                                width: 30 + Math.random() * 50,
                                alpha: 0
                            });
                        }

                        function updateLasers() {
                            if (vOverlay.style.display === 'none') return;
                            ctx.clearRect(0, 0, vCanvas.width, vCanvas.height);
                            ctx.globalCompositeOperation = 'screen';
                            lasers.forEach(laser => {
                                if (Math.abs(laser.angle - laser.targetAngle) < 0.02) {
                                    laser.targetAngle = Math.PI * 1.5 + (Math.random() - 0.5) * 1.8;
                                    laser.speed = 0.002 + Math.random() * 0.003;
                                }
                                laser.angle += (laser.targetAngle - laser.angle) * laser.speed;
                                if (laser.alpha < 0.5) laser.alpha += 0.005;
                                const length = vCanvas.height * 2;
                                const endX = laser.x + Math.cos(laser.angle) * length;
                                const endY = laser.y + Math.sin(laser.angle) * length;
                                const gradient = ctx.createLinearGradient(laser.x, laser.y, endX, endY);
                                gradient.addColorStop(0, `rgba(${laser.colorStr}, ${laser.alpha})`);
                                gradient.addColorStop(1, `rgba(${laser.colorStr}, 0)`);
                                ctx.beginPath();
                                ctx.moveTo(laser.x - laser.width / 2, laser.y);
                                ctx.lineTo(endX - laser.width * 4, endY);
                                ctx.lineTo(endX + laser.width * 4, endY);
                                ctx.lineTo(laser.x + laser.width / 2, laser.y);
                                ctx.closePath();
                                ctx.fillStyle = gradient;
                                ctx.fill();
                            });
                            ctx.globalCompositeOperation = 'source-over';
                            requestAnimationFrame(updateLasers);
                        }
                        updateLasers();
                    }
                    
                    // Simple ELO animation based on score
                    let currentVal = 0;
                    const eloInterval = setInterval(() => {
                        currentVal += Math.ceil(score / 30);
                        if (currentVal >= score) {
                            currentVal = score;
                            clearInterval(eloInterval);
                            if (vEloCount) {
                                vEloCount.textContent = currentVal + " PTS";
                                vEloCount.style.transform = 'scale(1.2)';
                                vEloCount.style.background = '#00FFCC';
                                vEloCount.style.color = '#000';
                                setTimeout(() => { vEloCount.style.transform = 'scale(1)'; }, 300);
                            }
                        } else {
                            if (vEloCount) vEloCount.textContent = currentVal + " PTS";
                        }
                    }, 30);
                } else {
                    if(startMenu) startMenu.style.display = 'flex';
                    if(btnStartTouch) btnStartTouch.textContent = "PLAY AGAIN (TOUCH)";
                }

            }
        }, 1000);
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
        btnStartTrackman.addEventListener('click', () => {
            if(window.soundEffects) window.soundEffects.resume();
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
