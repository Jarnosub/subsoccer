const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const msgOverlay = document.getElementById('message-overlay');
const mainMsg = document.getElementById('main-msg');
const subMsg = document.getElementById('sub-msg');
const scoreVal = document.getElementById('score-val');
const frameVal = document.getElementById('frame-val');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 3D Projection
function project(x, y, z) {
    // Camera is slightly above the ground, looking forward
    let perspective = 600 / (z + 200);
    // Move projection down mostly to lower half of screen for portrait layout
    return {
        x: (x * perspective) + canvas.width / 2,
        y: (y * perspective) + canvas.height * 0.45,
        scale: perspective
    };
}

let gameState = 'IDLE'; // IDLE, BOWL, RESOLVE
let frame = 1;
let throwNum = 1;
let score = 0;
let pinsHit = 0;

// Arena bounds
const FIELD_WIDTH = 600; 
const FIELD_LENGTH = 1200;

// Entities
let ball = { x: 0, y: 150, z: 0, vx: 0, vy: 0, vz: 0, active: false, radius: 45, spin: 0 };
let pins = [];

function setupPins() {
    pins = [];
    // Standard 10-pin triangle setup at the far end (z = 1000)
    const pinZ = 1000;
    const pinY = 150; // ground height
    const rowSpacing = 60;
    const colSpacing = 45;

    let id = 1;
    for(let row = 0; row < 4; row++) {
        let cols = row + 1;
        let startX = -((cols - 1) * colSpacing) / 2;
        for(let col = 0; col < cols; col++) {
            // Pin objects
            pins.push({
                id: id++,
                x: startX + col * colSpacing,
                y: pinY - 10,
                z: pinZ + row * rowSpacing, // Triangle pointing towards camera
                active: true,
                vx: 0, vy: 0, vz: 0,
                radius: 20
            });
        }
    }
}

function startFrame() {
    ball.active = false;
    goalieX = 0; // if we want a goalie
    gameState = 'IDLE';
    pinsHit = 0;
    msgOverlay.style.opacity = 1;
    mainMsg.textContent = "KICK TO BOWL";
    mainMsg.style.color = "#FFF";
    subMsg.textContent = "(Flick forward/sides)";
    frameVal.textContent = frame;
}

window.resetThrow = function() {
    if (gameState === 'RESOLVE') {
        if(throwNum === 2 || checkAllDown()) {
            // Next frame
            frame++;
            throwNum = 1;
            if(frame > 10) {
                // Game Over
                mainMsg.textContent = "GAME OVER";
                subMsg.textContent = "SCORE: " + score;
                return;
            }
            setupPins();
        } else {
            throwNum++;
        }
        startFrame();
    }
}

function checkAllDown() {
    return pins.filter(p => p.active).length === 0;
}

// Input via flick (Simulate physical kick)
let tY = 0, tX = 0, tTime = 0;
canvas.addEventListener('touchstart', e => {
    if(gameState === 'IDLE') {
        tX = e.touches[0].clientX;
        tY = e.touches[0].clientY;
        tTime = Date.now();
    }
});

canvas.addEventListener('touchend', e => {
    if(gameState === 'IDLE') {
        let touch = e.changedTouches[0];
        let dx = touch.clientX - tX;
        let dy = touch.clientY - tY;
        let dt = Date.now() - tTime;
        
        if (dy < -20 && dt < 500) {
            // Fire ball
            let speed = Math.max(10, Math.min(35, -dy / dt * 15));
            ball.x = 0;
            ball.y = 150;
            ball.z = 0;
            ball.vx = (dx / dt) * 8; // lateral speed
            ball.vz = speed;
            ball.spin = 0;
            ball.active = true;
            
            gameState = 'BOWL';
            msgOverlay.style.opacity = 0;
        }
    }
});

function drawNeonGrid() {
    // Draw Subsoccer physical table bounding box as neon grid
    const floorY = 150;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#2b8a21'; // Grass grid
    
    // Draw floor grid
    for(let z = 0; z <= FIELD_LENGTH; z+=100) {
        let p1 = project(-FIELD_WIDTH/2, floorY, z);
        let p2 = project(FIELD_WIDTH/2, floorY, z);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for(let x = -FIELD_WIDTH/2; x <= FIELD_WIDTH/2; x+=100) {
        let p1 = project(x, floorY, 0);
        let p2 = project(x, floorY, FIELD_LENGTH);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    // Side Nets (The Secret Sauce for Curve!)
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)'; // Neon Side Nets
    for(let y = 100; y < floorY; y+=20) {
        let p1 = project(-FIELD_WIDTH/2, y, 0); let p2 = project(-FIELD_WIDTH/2, y, FIELD_LENGTH);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        p1 = project(FIELD_WIDTH/2, y, 0); p2 = project(FIELD_WIDTH/2, y, FIELD_LENGTH);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
}

function updatePhysics() {
    if (gameState !== 'BOWL' && gameState !== 'RESOLVE') return;

    // Ball physics
    if (ball.active) {
        ball.z += ball.vz;
        ball.x += ball.vx;
        
        // Include spin
        ball.x += ball.spin;
        // Spin decay
        ball.spin *= 0.98; 

        let boundary = FIELD_WIDTH / 2 - 30;

        // SIDE NET COLLISION (This translates to digital curve!)
        if (ball.x < -boundary) {
            ball.x = -boundary;
            ball.vx *= -0.4; // Bounce back slightly
            ball.spin = 3.5; // Gain positive (rightward) curve off the left net!
            createSideSparks(-boundary, ball.z);
        }
        else if (ball.x > boundary) {
            ball.x = boundary;
            ball.vx *= -0.4;
            ball.spin = -3.5; // Gain negative (leftward) curve off the right net!
            createSideSparks(boundary, ball.z);
        }

        // Pin Collisions
        for(let p of pins) {
            if (p.active) {
                let dx = p.x - ball.x;
                let dz = p.z - ball.z;
                let dist = Math.sqrt(dx*dx + dz*dz);
                if (dist < ball.radius + p.radius) {
                    // Strike pin
                    p.active = false;
                    pinsHit++;
                    score++;
                    scoreVal.textContent = score;
                    // Deflect ball slightly
                    ball.vx -= (dx * 0.1);
                    // Pin flying particles (visual text)
                    p.vz = ball.vz * 0.8;
                    p.vx = ball.vx + (Math.random()*10 - 5);
                }
            }
        }

        // Ball out of bounds (past pins)
        if (ball.z > FIELD_LENGTH + 200) {
            ball.active = false;
            resolveThrow();
        }
    }

    // Move kicked pins
    for(let p of pins) {
        if (!p.active && p.z < FIELD_LENGTH + 500) {
            p.z += p.vz;
            p.x += p.vx;
            p.y -= 2; // fly up
            p.vz *= 0.95;
            p.vx *= 0.95;
        }
    }
}

let sparks = [];
function createSideSparks(x, z) {
    // Screen flash
    document.body.style.background = 'rgba(0, 255, 204, 0.3)';
    setTimeout(() => document.body.style.background = 'var(--sub-black)', 50);
}

function resolveThrow() {
    gameState = 'RESOLVE';
    msgOverlay.style.opacity = 1;
    if(checkAllDown()) {
        mainMsg.textContent = throwNum === 1 ? "STRIKE!" : "SPARE!";
        mainMsg.style.color = "#FFD700";
    } else {
        mainMsg.textContent = pinsHit + " PINS";
        mainMsg.style.color = "#FFF";
    }
    subMsg.textContent = "(Tap to Continue)";
}

function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawNeonGrid();

    // Draw Pins (sort by Z for painter's algorithm)
    let renderList = [];
    
    if (ball.active) {
        renderList.push({...ball, type: 'ball'});
    }

    for(let p of pins) {
        if (p.active || p.z < FIELD_LENGTH + 300) {
            renderList.push({...p, type: 'pin'});
        }
    }

    renderList.sort((a, b) => b.z - a.z); // Render furthest first

    for(let item of renderList) {
        let proj = project(item.x, item.y, item.z);
        if (proj.scale <= 0) continue;

        if (item.type === 'ball') {
            // Draw Ball
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, item.radius * proj.scale, 0, Math.PI*2);
            ctx.fillStyle = '#E30613';
            ctx.fill();
            
            // Highlight
            ctx.beginPath();
            ctx.arc(proj.x - (10*proj.scale), proj.y - (10*proj.scale), item.radius * 0.3 * proj.scale, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fill();
        } else if (item.type === 'pin') {
            // Draw Pin
            let pRadius = item.radius * proj.scale;
            ctx.fillStyle = item.active ? '#FFF' : 'rgba(255, 255, 255, 0.3)';
            
            // Pin Body (cylinder look)
            ctx.beginPath();
            ctx.moveTo(proj.x - pRadius*0.6, proj.y + pRadius*2);
            ctx.lineTo(proj.x - pRadius, proj.y);
            ctx.lineTo(proj.x - pRadius*0.5, proj.y - pRadius*3);
            ctx.lineTo(proj.x + pRadius*0.5, proj.y - pRadius*3);
            ctx.lineTo(proj.x + pRadius, proj.y);
            ctx.lineTo(proj.x + pRadius*0.6, proj.y + pRadius*2);
            ctx.closePath();
            ctx.fill();
            
            // Red Stripe
            if (item.active) {
                ctx.fillStyle = '#E30613';
                ctx.fillRect(proj.x - pRadius*0.7, proj.y - pRadius*1.5, pRadius*1.4, pRadius*0.5);
                ctx.fillRect(proj.x - pRadius*0.6, proj.y - pRadius*2.2, pRadius*1.2, pRadius*0.3);
            }
        }
    }
}

function loop() {
    updatePhysics();
    drawScene();
    requestAnimationFrame(loop);
}

setupPins();
startFrame();
loop();
