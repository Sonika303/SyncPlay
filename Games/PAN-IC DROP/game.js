const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const diffEl = document.getElementById('diff');
const multEl = document.getElementById('mult');
const dashBar = document.getElementById('dash-bar');

canvas.width = 600; canvas.height = 600;
let score = 0;
let gameOver = false;
let lastSpawn = 0;
let timeScale = 1;
let multiplier = 1;
let magnetTimer = 0;
let slowMoTimer = 0;

const player = { 
    x: 300, y: 300, radius: 18, baseSpeed: 1.5, vx: 0, vy: 0, 
    friction: 0.82, facing: 1, dashCharge: 100
};

let critic = { x: -50, y: 400, active: false, speed: 1.5 };
const items = [];
const hazards = [];

const keys = { w: false, a: false, s: false, d: false, " ": false };
window.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false; });

function getRank(s) {
    if (s < 10) return "DISHWASHER";
    if (s < 30) return "LINE COOK";
    if (s < 60) return "SOUS CHEF";
    if (s < 100) return "HEAD CHEF";
    return "ELITE MASTER";
}

function spawnItem() {
    const types = ['PLATE', 'KNIFE', 'POT', 'OIL', 'HAND'];
    const type = types[Math.floor(Math.random() * types.length)];
    const isHand = type === 'HAND';
    items.push({
        type, targetX: Math.random() * 500 + 50, targetY: Math.random() * 500 + 50,
        currentY: -250, speed: (isHand ? 18 : 7 + Math.random()*5) * (1 + score*0.05),
        landed: false, timer: 0, radius: isHand ? 95 : 25,
        rotation: Math.random()*Math.PI, rotSpeed: (Math.random()-0.5)*0.2
    });
}

function update(time) {
    if (gameOver) return;

    // Dash Logic
    if (player.dashCharge < 100) player.dashCharge += 0.6;
    dashBar.style.width = player.dashCharge + "%";
    if (keys[" "] && player.dashCharge >= 100) {
        player.vx *= 5.5; player.vy *= 5.5;
        player.dashCharge = 0;
    }

    // Power-ups
    if (slowMoTimer > 0) { slowMoTimer--; timeScale = 0.4; } else { timeScale = 1; }
    if (magnetTimer > 0) {
        magnetTimer--;
        DisasterSystem.soaps.forEach(s => {
            s.x += (player.x - s.x) * 0.12; s.y += (player.y - s.y) * 0.12;
        });
    }

    // Movement
    let f = player.friction;
    hazards.forEach(h => { if (Math.hypot(player.x - h.x, player.y - h.y) < h.r) f = 0.99; });
    if (keys.w) player.vy -= player.baseSpeed; if (keys.s) player.vy += player.baseSpeed;
    if (keys.a) player.vx -= player.baseSpeed; if (keys.d) player.vx += player.baseSpeed;
    player.x += player.vx; player.y += player.vy;
    player.vx *= f; player.vy *= f;

    player.x = Math.max(15, Math.min(585, player.x));
    player.y = Math.max(15, Math.min(585, player.y));

    // Critic
    if (!critic.active && Math.random() < 0.006) { critic.active = true; critic.x = -50; critic.y = 100 + Math.random()*400; }
    if (critic.active) {
        critic.x += critic.speed * timeScale;
        if (Math.hypot(player.x - critic.x, player.y - critic.y) < 30) { score = Math.max(0, score-5); critic.active = false; }
        if (critic.x > 650) { critic.active = false; }
    }

    DisasterSystem.triggerRandom(time);
    
    // Collisions
    if (DisasterSystem.blender.active && Math.hypot(player.x - 300, player.y - 300) < 70) die("SHREDDED!");
    if (DisasterSystem.hotTile.active && player.x > DisasterSystem.hotTile.x && player.x < DisasterSystem.hotTile.x + 50 && player.y > DisasterSystem.hotTile.y && player.y < DisasterSystem.hotTile.y + 50) die("BURNED!");
    
    DisasterSystem.soaps.forEach((s, i) => {
        if (Math.hypot(player.x - s.x, player.y - s.y) < 30) { hazards.length = 0; DisasterSystem.soaps.splice(i, 1); }
    });
    
    DisasterSystem.powerups.forEach((p, i) => {
        if (Math.hypot(player.x - p.x, player.y - p.y) < 30) {
            if (p.type === 'MAGNET') magnetTimer = 400;
            if (p.type === 'CLOCK') slowMoTimer = 250;
            DisasterSystem.powerups.splice(i, 1);
        }
    });

    if (time - lastSpawn > Math.max(110, 1100 - (score * 15))) { spawnItem(); lastSpawn = time; }

    render(time);
    requestAnimationFrame(update);
}

function render(time) {
    ctx.clearRect(0, 0, 600, 600);
    drawFloor();
    DisasterSystem.draw(ctx, time);

    if (critic.active) drawCritic(critic.x, critic.y);

    hazards.forEach((h, i) => {
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI*2); ctx.fill();
        h.timer -= timeScale; if (h.timer <= 0) hazards.splice(i, 1);
    });

    items.forEach((item, index) => {
        // Shadow
        ctx.beginPath(); ctx.ellipse(item.targetX, item.targetY, item.radius, item.radius/2, 0, 0, Math.PI*2);
        ctx.fillStyle = item.type === 'HAND' ? "rgba(255, 0, 0, 0.3)" : "rgba(0,0,0,0.12)";
        ctx.fill();

        if (item.currentY < item.targetY) {
            item.currentY += item.speed * timeScale;
            item.rotation += item.rotSpeed * timeScale;
        } else if (!item.landed) {
            item.landed = true;
            if (item.type === 'HAND') document.body.classList.add('shake');
            setTimeout(() => document.body.classList.remove('shake'), 200);
            
            if (Math.hypot(player.x - item.targetX, player.y - item.targetY) < item.radius + 5) die("BONKED!");
            
            if (critic.active && Math.hypot(critic.x - item.targetX, critic.y - item.targetY) < item.radius + 10) {
                critic.active = false; 
            } else if (critic.active) {
                multiplier = 2;
                multEl.innerText = "2x MULTI!";
                setTimeout(() => { multiplier = 1; multEl.innerText = ""; }, 1500);
            }

            if (item.type === 'OIL') hazards.push({x: item.targetX, y: item.targetY, r: 75, timer: 500});
            score += 1 * multiplier; 
            scoreEl.innerText = score + " [" + getRank(score) + "]";
            diffEl.innerText = (1 + (score * 0.05)).toFixed(1);
        }
        drawPolishedItem(item);
        if (item.landed) item.timer++;
        if (item.timer > 15) items.splice(index, 1);
    });

    drawPlayer(player);
}

function die(m) { gameOver = true; alert(m + " | Rank: " + getRank(score) + " | Score: " + score); location.reload(); }

function drawFloor() {
    ctx.fillStyle = "#d2b48c"; ctx.fillRect(0,0,600,600);
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    for(let i=0; i<600; i+=50) { ctx.strokeRect(i, 0, 50, 600); ctx.strokeRect(0, i, 600, 50); }
}

function drawCritic(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#2c3e50"; // Suit
    ctx.fillRect(-10, 0, 20, 15);
    ctx.fillStyle = "#f39c12"; // Tie
    ctx.fillRect(-2, 0, 4, 8);
    ctx.fillStyle = "#ffe0bd"; // Head
    ctx.beginPath(); ctx.arc(0, -10, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "black"; ctx.font = "bold 9px Arial"; ctx.fillText("CRITIC", -15, -25);
    ctx.restore();
}

function drawPlayer(p) {
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.vx < -0.1) p.facing = -1; if (p.vx > 0.1) p.facing = 1;
    ctx.scale(p.facing, 1);
    // Body
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#ccc"; ctx.stroke();
    // Hat
    ctx.fillStyle = "#444"; ctx.fillRect(-12, -35, 24, 15);
    ctx.beginPath(); ctx.arc(0, -35, 14, 0, Math.PI*2); ctx.fill();
    // Eyes
    ctx.fillStyle = "#333"; ctx.fillRect(6, -5, 3, 3); ctx.fillRect(-2, -5, 3, 3);
    ctx.restore();
}

function drawPolishedItem(item) {
    ctx.save(); ctx.translate(item.targetX, item.currentY); ctx.rotate(item.rotation);
    
    if (item.type === 'HAND') {
        // Pro Hand with detail
        ctx.fillStyle = "#d2a679"; ctx.fillRect(-45, -50, 90, 100);
        ctx.fillStyle = "#c19a6b"; // Finger lines
        for(let i=0; i<4; i++) ctx.fillRect(-40 + (i*22), -90, 18, 60);
    } 
    else if (item.type === 'OIL') {
        // Metallic/Glass Bottle
        ctx.fillStyle = "#34495e"; ctx.fillRect(-12, -30, 24, 50); // Body
        ctx.fillStyle = "#f1c40f"; ctx.fillRect(-10, -5, 20, 20); // Oil inside
        ctx.strokeStyle = "white"; ctx.strokeRect(-12, -30, 24, 50);
    } 
    else if (item.type === 'KNIFE') {
        // Shiny Blade
        let grad = ctx.createLinearGradient(-5, 0, 5, 0);
        grad.addColorStop(0, "#bdc3c7"); grad.addColorStop(0.5, "#fff"); grad.addColorStop(1, "#bdc3c7");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(-6, -35); ctx.lineTo(6, -35); ctx.lineTo(3, 10); ctx.lineTo(-3, 10); ctx.fill();
        ctx.fillStyle = "#3e2723"; ctx.fillRect(-5, 10, 10, 20); // Wood Handle
    } 
    else if (item.type === 'POT') {
        // Steel Pot
        ctx.fillStyle = "#7f8c8d";
        ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#ecf0f1"; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = "#2c3e50"; ctx.fillRect(20, -5, 15, 10); // Handle
    }
    else { // PLATE
        ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(0,0,25,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#3498db"; ctx.lineWidth = 2; ctx.stroke(); // Blue rim
    }
    ctx.restore();
}
requestAnimationFrame(update);