const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const msgOverlay = document.getElementById('message-overlay');
const levelVal = document.getElementById('level-val');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Game State
let gameState = 'START'; // START, PLAY, OVER, WIN
let level = 1;

let ball = {
    x: canvas.width / 2,
    y: canvas.height - 150,
    vx: 0,
    vy: 0,
    radius: 12,
    color: '#E30613',
    mass: 1
};

// Controls (Tilt)
let tilt = { x: 0, y: 0 }; 

// Level Data
let walls = [];
let holes = [];
let goal = null;

function loadLevel(lvl) {
    walls = [];
    holes = [];
    
    // Bounds
    const w = canvas.width;
    const h = canvas.height;
    const margin = 20;

    // Reset ball
    ball.x = w / 2;
    ball.y = h - 100;
    ball.vx = 0;
    ball.vy = 0;

    // Randomize some walls and holes based on level
    let rowCount = 3 + lvl;
    let colCount = 3;

    for(let r = 1; r < rowCount; r++) {
        let cellH = (h - 200) / rowCount;
        let yPos = 100 + r * cellH;
        
        // Add random wall gaps
        let gapX = margin + Math.random() * (w - margin * 2 - 100);
        
        walls.push({ x: margin, y: yPos, width: gapX - margin, height: 10 });
        walls.push({ x: gapX + 100, y: yPos, width: w - (gapX + 100) - margin, height: 10 });

        // Add some random holes
        holes.push({
            x: margin + Math.random() * (w - margin * 2),
            y: yPos - cellH / 2,
            radius: 18
        });
    }

    // Goal Area (top)
    goal = {
        x: w / 2 - 50,
        y: 20,
        width: 100,
        height: 30
    };

    levelVal.textContent = lvl;
    gameState = 'START';
    msgOverlay.innerHTML = "<div>KICK TO START</div><div style='font-size: 1rem; margin-top: 10px; color: #00FFCC;'>(Flick ball upwards)</div>";
    msgOverlay.style.opacity = 1;
}

// Flick logic (Kick)
let touchStartY = 0;
let touchStartX = 0;
let touchStartTime = 0;

canvas.addEventListener('touchstart', e => {
    if(gameState === 'START') {
        const touch = e.changedTouches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
    }
});

canvas.addEventListener('touchend', e => {
    if(gameState === 'START') {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const dt = Date.now() - touchStartTime;

        if (dy < -20 && dt < 500) {
            // Flicked upwards
            const speed = Math.min(25, -dy / dt * 10);
            ball.vy = -speed;
            ball.vx = (dx / dt) * 5;
            gameState = 'PLAY';
            msgOverlay.style.opacity = 0;
        }
    }
});

// Tilt Logic (Joystick anywhere on screen)
let activeTouchId = null;
let baseTouch = null;

const joypadArea = document.getElementById('joypad-area');

joypadArea.addEventListener('touchstart', e => {
    e.preventDefault();
    if(gameState !== 'PLAY') return;
    for(let i=0; i<e.changedTouches.length; i++) {
        if(activeTouchId === null) {
            let t = e.changedTouches[i];
            activeTouchId = t.identifier;
            baseTouch = {x: t.clientX, y: t.clientY};
            tilt.x = 0; tilt.y = 0;
        }
    }
});

joypadArea.addEventListener('touchmove', e => {
    e.preventDefault();
    if(gameState !== 'PLAY' || activeTouchId === null) return;
    for(let i=0; i<e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if(t.identifier === activeTouchId) {
            // Calculate tilt from base
            let dx = t.clientX - baseTouch.x;
            let dy = t.clientY - baseTouch.y;
            
            // Normalize clamp
            const maxTilt = 100;
            tilt.x = Math.max(-1, Math.min(1, dx / maxTilt));
            tilt.y = Math.max(-1, Math.min(1, dy / maxTilt));
        }
    }
});

function endTouch(e) {
    if(activeTouchId === null) return;
    for(let i=0; i<e.changedTouches.length; i++) {
        if(e.changedTouches[i].identifier === activeTouchId) {
            activeTouchId = null;
            tilt.x = 0;
            tilt.y = 0;
        }
    }
}
joypadArea.addEventListener('touchend', endTouch);
joypadArea.addEventListener('touchcancel', endTouch);


// Main Loop
function update() {
    if(gameState === 'PLAY') {
        // Apply friction
        ball.vx *= 0.99;
        ball.vy *= 0.99;

        // Apply tilt acceleration
        ball.vx += tilt.x * 0.4;
        ball.vy += tilt.y * 0.4;

        ball.x += ball.vx;
        ball.y += ball.vy;

        // Screen bounds bounce
        if(ball.x - ball.radius < 0) { ball.x = ball.radius; ball.vx *= -0.7; }
        if(ball.x + ball.radius > canvas.width) { ball.x = canvas.width - ball.radius; ball.vx *= -0.7; }
        if(ball.y - ball.radius < 0) { ball.y = ball.radius; ball.vy *= -0.7; }
        if(ball.y + ball.radius > canvas.height) { ball.y = canvas.height - ball.radius; ball.vy *= -0.7; }

        // Walls checking
        for(let w of walls) {
            // Simple AABB collision
            let testX = ball.x;
            let testY = ball.y;
            
            if (ball.x < w.x) testX = w.x;
            else if (ball.x > w.x + w.width) testX = w.x + w.width;
            
            if (ball.y < w.y) testY = w.y;
            else if (ball.y > w.y + w.height) testY = w.y + w.height;
            
            let distX = ball.x - testX;
            let distY = ball.y - testY;
            let distance = Math.sqrt((distX*distX) + (distY*distY));
            
            if (distance <= ball.radius) {
                // Bounce
                if(Math.abs(distX) > Math.abs(distY)) {
                    ball.vx *= -0.7;
                    ball.x += Math.sign(distX) * (ball.radius - distance);
                } else {
                    ball.vy *= -0.7;
                    ball.y += Math.sign(distY) * (ball.radius - distance);
                }
            }
        }

        // Holes
        for(let h of holes) {
            let dx = ball.x - h.x;
            let dy = ball.y - h.y;
            if (Math.sqrt(dx*dx + dy*dy) < h.radius) {
                // Fell in!
                gameState = 'OVER';
                msgOverlay.innerHTML = "<div style='color:#E30613'>YOU DIED!</div><div style='font-size:1rem;color:#FFF;margin-top:10px'>(Tap to Restart)</div>";
                msgOverlay.style.opacity = 1;
            }
        }

        // Goal
        if (ball.x > goal.x && ball.x < goal.x + goal.width &&
            ball.y - ball.radius < goal.y + goal.height) {
            gameState = 'WIN';
            level++;
            msgOverlay.innerHTML = "<div style='color:#00FFCC'>LEVEL CLEARED!</div><div style='font-size:1rem;color:#FFF;margin-top:10px'>(Tap for Next Level)</div>";
            msgOverlay.style.opacity = 1;
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid/background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }
    for(let i=0; i<canvas.height; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(canvas.width,i); ctx.stroke(); }

    // Draw Goal
    ctx.fillStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.fillRect(goal.x, goal.y, goal.width, goal.height);
    ctx.strokeStyle = '#00FFCC';
    ctx.lineWidth = 3;
    ctx.strokeRect(goal.x, goal.y, goal.width, goal.height);
    
    // Draw Walls
    ctx.fillStyle = '#0A0A0A';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00FFCC';
    for(let w of walls) {
        ctx.fillRect(w.x, w.y, w.width, w.height);
        ctx.strokeStyle = '#00FFCC';
        ctx.strokeRect(w.x, w.y, w.width, w.height);
    }
    ctx.shadowBlur = 0;

    // Draw Holes
    for(let h of holes) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius, 0, Math.PI*2);
        const grad = ctx.createRadialGradient(h.x, h.y, h.radius*0.1, h.x, h.y, h.radius);
        grad.addColorStop(0, '#000');
        grad.addColorStop(1, '#ff3333');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw Ball
    if(gameState !== 'OVER') {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI*2);
        ctx.fillStyle = ball.color;
        ctx.fill();
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Draw Tilt Indicator
    if (activeTouchId !== null && gameState === 'PLAY') {
        ctx.beginPath();
        ctx.arc(baseTouch.x, baseTouch.y, 40, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(baseTouch.x + tilt.x * 40, baseTouch.y + tilt.y * 40, 15, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(0, 255, 204, 0.6)';
        ctx.fill();
    }
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Reset via tap on overlay
document.addEventListener('click', () => {
    if(gameState === 'OVER' || gameState === 'WIN') {
        loadLevel(gameState === 'WIN' ? level : 1);
    }
});

// Init
loadLevel(level);
loop();
