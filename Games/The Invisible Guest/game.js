const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1100;
canvas.height = 750;

// --- GAME STATE ---
let fearScore = 0;
let energy = 100;
let currentFloor = 1;
let objectsHauntedCount = 0;
let gameOver = false;
let possessCooldown = 0;

const ghost = {
    x: 550, y: 375, r: 20, vx: 0, vy: 0, 
    speed: 0.45, friction: 0.92, bob: 0
};

const stairs = { x: 500, y: 325, w: 100, h: 100 };

class Buster {
    constructor(id, floor, x, y) {
        this.id = id;
        this.floor = floor;
        this.x = x; this.y = y; this.r = 22;
        this.angle = 0;
        this.speed = 2.4;
        this.state = 'PATROL'; // PATROL, INVESTIGATE, EXORCISE
        this.target = { x: Math.random() * 1000, y: Math.random() * 700 };
        this.viewDist = 300;
        this.viewAngle = 0.7;
        this.exorcismTimer = 0;
        this.focusObject = null;
    }

    update() {
        if (this.floor !== currentFloor) return;

        if (this.state === 'EXORCISE') {
            this.exorcismTimer--;
            document.getElementById('alert').style.opacity = 1;
            if (this.exorcismTimer <= 0) {
                if (this.focusObject) {
                    this.focusObject.state = 0;
                    this.focusObject.isBurntOut = true; // Permanent disable
                }
                this.state = 'PATROL';
                this.focusObject = null;
                document.getElementById('alert').style.opacity = 0;
            }
            return;
        }

        let dx = this.target.x - this.x;
        let dy = this.target.y - this.y;
        this.angle = Math.atan2(dy, dx);
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        if (Math.hypot(dx, dy) < 20) {
            this.target = { x: Math.random() * 1000, y: Math.random() * 700 };
        }

        // Check for Haunted Objects in sight
        props.forEach(p => {
            if (p.floor === this.floor && p.state > 0 && !p.isBurntOut) {
                let distToProp = Math.hypot(p.x + p.w/2 - this.x, p.y + p.h/2 - this.y);
                if (distToProp < this.viewDist) {
                    this.state = 'EXORCISE';
                    this.exorcismTimer = 300; // 5 seconds
                    this.focusObject = p;
                    this.target = { x: p.x + p.w/2, y: p.y + p.h/2 };
                }
            }
        });

        // Ghost Detection
        let d = Math.hypot(ghost.x - this.x, ghost.y - this.y);
        if (d < this.viewDist) {
            let a = Math.atan2(ghost.y - this.y, ghost.x - this.x);
            let diff = Math.abs(a - this.angle);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff < this.viewAngle / 2) {
                gameOver = true;
                alert("BUSTED ON FLOOR " + currentFloor);
                location.reload();
            }
        }
    }

    draw() {
        if (this.floor !== currentFloor) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Flashlight
        let g = ctx.createRadialGradient(0,0,0, 0,0,this.viewDist);
        g.addColorStop(0, this.state === 'EXORCISE' ? "rgba(255, 0, 0, 0.5)" : "rgba(255, 255, 180, 0.3)");
        g.addColorStop(1, "rgba(255, 255, 180, 0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, this.viewDist, -this.viewAngle/2, this.viewAngle/2); ctx.fill();

        // 3D Model
        ctx.fillStyle = "#111"; ctx.fillRect(-22, -15, 12, 30); // Pack
        ctx.fillStyle = "#2c3e50"; ctx.beginPath(); ctx.ellipse(0, 0, 22, 16, 0, 0, Math.PI*2); ctx.fill(); // Body
        ctx.fillStyle = "#f39c12"; ctx.beginPath(); ctx.arc(8, 0, 10, 0, Math.PI*2); ctx.fill(); // Helmet
        ctx.fillStyle = "#f1c40f"; ctx.fillRect(15, 6, 12, 6); // Flashlight
        
        if (this.state === 'EXORCISE') {
            ctx.strokeStyle = "red"; ctx.lineWidth = 3; ctx.strokeRect(-25, -20, 50, 40);
        }
        ctx.restore();
    }
}

let busters = [
    new Buster(1, 1, 100, 100), 
    new Buster(2, 1, 900, 600),
    new Buster(3, 2, 500, 100)
];

const props = [
    { floor: 1, id: 'piano', x: 800, y: 100, w: 140, h: 100, state: 0, isBurntOut: false },
    { floor: 1, id: 'table', x: 100, y: 500, w: 180, h: 100, state: 0, isBurntOut: false },
    { floor: 1, id: 'armor', x: 850, y: 550, w: 60, h: 120, state: 0, isBurntOut: false },
    { floor: 2, id: 'bed', x: 200, y: 150, w: 150, h: 180, state: 0, isBurntOut: false },
    { floor: 2, id: 'desk', x: 700, y: 400, w: 120, h: 80, state: 0, isBurntOut: false }
];

const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function update(time) {
    if (gameOver) return;

    // Movement
    let moveMult = energy > 0 ? 1 : 0.2;
    if (keys['w']) ghost.vy -= ghost.speed * moveMult;
    if (keys['s']) ghost.vy -= -ghost.speed * moveMult;
    if (keys['a']) ghost.vx -= ghost.speed * moveMult;
    if (keys['d']) ghost.vx -= -ghost.speed * moveMult;

    ghost.x += ghost.vx; ghost.y += ghost.vy;
    ghost.vx *= ghost.friction; ghost.vy *= ghost.friction;
    ghost.bob = Math.sin(time / 200) * 8;

    // Energy & Creaks
    let vel = Math.hypot(ghost.vx, ghost.vy);
    if (vel > 0.5) energy -= 0.1; else if (energy < 100) energy += 0.15;
    document.getElementById('energy-fill').style.width = energy + "%";

    if (vel > 3.8) { // Floor Creak
        busters.forEach(b => {
            if (b.floor === currentFloor) b.target = { x: ghost.x, y: ghost.y };
        });
    }

    // Stairs (Space)
    if (Math.hypot(ghost.x - (stairs.x+50), ghost.y - (stairs.y+50)) < 60) {
        if (keys[' ']) {
            currentFloor = currentFloor === 1 ? 2 : 1;
            ghost.x += 150; 
            document.getElementById('floor-indicator').innerText = "FLOOR " + currentFloor;
        }
    }

    // Haunt Logic (E)
    props.forEach(p => {
        if (p.floor !== currentFloor || p.isBurntOut) return;
        let inside = ghost.x > p.x && ghost.x < p.x + p.w && ghost.y > p.y && ghost.y < p.y + p.h;
        if (inside && keys['e'] && possessCooldown <= 0 && energy > 20) {
            p.state = 300; // Shaking for 5 seconds
            possessCooldown = 120;
            objectsHauntedCount++;
            fearScore += 7;
            document.getElementById('fear-fill').style.width = fearScore + "%";
            document.getElementById('object-counter').innerText = `HAUNTED: ${objectsHauntedCount} / 15`;
        }
        if (p.state > 0) p.state--;
    });

    if (possessCooldown > 0) possessCooldown--;

    busters.forEach(b => b.update());

    if (fearScore >= 100) { gameOver = true; alert("MANSION CONQUERED!"); location.reload(); }

    draw();
    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Map Tiles
    ctx.fillStyle = currentFloor === 1 ? "#0f0c1d" : "#1d0c0c";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for(let i=0; i<canvas.width; i+=50) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }

    // Stairs
    ctx.fillStyle = "#3e2723"; ctx.fillRect(stairs.x, stairs.y, stairs.w, stairs.h);
    ctx.fillStyle = "#fff"; ctx.fillText("STAIRS [SPACE]", stairs.x + 10, stairs.y + 50);

    // Props
    props.forEach(p => {
        if (p.floor !== currentFloor) return;
        ctx.save();
        if (p.state > 0) ctx.translate(Math.random()*8-4, Math.random()*8-4);
        
        ctx.fillStyle = p.isBurntOut ? "#222" : "#3d2b1f";
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = p.isBurntOut ? "#111" : "#5d4037";
        ctx.strokeRect(p.x, p.y, p.w, p.h);

        if (p.state > 0) {
            ctx.shadowBlur = 20; ctx.shadowColor = "#0ff";
            ctx.strokeStyle = "#0ff"; ctx.strokeRect(p.x-2, p.y-2, p.w+4, p.h+4);
        }
        ctx.restore();
    });

    busters.forEach(b => b.draw());

    // Ghost
    ctx.save();
    ctx.translate(ghost.x, ghost.y + ghost.bob);
    ctx.globalAlpha = 0.7; ctx.fillStyle = "white";
    ctx.beginPath(); ctx.arc(0, 0, ghost.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath(); ctx.arc(-6, -2, 3, 0, Math.PI*2); ctx.arc(6, -2, 3, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

update(0);