import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyCODp3h025sM3jl7Ji0GJgVuGoWCD1wddU",
    authDomain: "syncplay-17b6e.firebaseapp.com",
    databaseURL: "https://syncplay-17b6e-default-rtdb.firebaseio.com",
    projectId: "syncplay-17b6e",
    storageBucket: "syncplay-17b6e.firebasestorage.app",
    messagingSenderId: "86016195929",
    appId: "1:86016195929:web:40262a28786f2ead712048"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const urlParams = new URLSearchParams(window.location.search);
const partyCode = urlParams.get('code');
const statusEl = document.getElementById('conn-status');

// --- GAME CONFIG ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const dashBar = document.getElementById('dash-bar');

canvas.width = 600; canvas.height = 600;
let score = 0;
let gameOver = false;
let lastSpawn = 0;
let timeScale = 1;
let multiplier = 1;
let magnetTimer = 0;
let slowMoTimer = 0;

// --- MULTI-CHARACTER STATE ---
const chefs = {}; 
const colors = ['#6c5ce7', '#ff7675', '#55efc4', '#fab1a0', '#fdcb6e', '#0984e3'];

function createChef(id, name, index) {
    return {
        id, x: 100 + (index * 80), y: 300,
        radius: 18, baseSpeed: 1.2, vx: 0, vy: 0,
        friction: 0.82, facing: 1, dashCharge: 100,
        name: name, color: colors[index % colors.length],
        remoteInput: { x: 0, y: 0, dash: false },
        lastDashState: false // Track button state to prevent spam
    };
}

let critic = { x: -50, y: 400, active: false, speed: 1.5 };
const items = [];
const hazards = [];

// --- CONNECTION LOGIC ---
if (partyCode) {
    onValue(ref(db, `parties/${partyCode}/players`), (snapshot) => {
        if (snapshot.exists()) {
            const playersData = snapshot.val();
            const playerIds = Object.keys(playersData);

            if (statusEl) {
                statusEl.innerText = `${playerIds.length} CHEFS CONNECTED`;
                statusEl.style.color = "#00ff00";
            }

            playerIds.forEach((id, index) => {
                if (!chefs[id]) {
                    let cleanName = playersData[id].name || "CHEF";
                    chefs[id] = createChef(id, cleanName.toUpperCase(), index);
                }

                const pData = playersData[id];
                if (pData.inputs) {
                    // Optimized Dash Trigger: Only dash if dash was FALSE and is now TRUE
                    if (pData.inputs.dash && !chefs[id].lastDashState && chefs[id].dashCharge >= 100) {
                        chefs[id].vx *= 6; 
                        chefs[id].vy *= 6;
                        chefs[id].dashCharge = 0;
                        canvas.classList.add('shake');
                        setTimeout(() => canvas.classList.remove('shake'), 100);
                    }
                    chefs[id].lastDashState = pData.inputs.dash;
                    chefs[id].remoteInput = pData.inputs;
                }
            });

            // Cleanup disconnected chefs
            Object.keys(chefs).forEach(id => { if (!playersData[id]) delete chefs[id]; });
        }
    });
}

// --- KEYBOARD (BACKUP FOR HOST) ---
const keys = { w: false, a: false, s: false, d: false, " ": false };
window.addEventListener('keydown', (e) => { 
    const k = e.key.toLowerCase(); if(keys.hasOwnProperty(k)) keys[k] = true; 
});
window.addEventListener('keyup', (e) => { 
    const k = e.key.toLowerCase(); if(keys.hasOwnProperty(k)) keys[k] = false; 
});

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
        currentY: -250, speed: (isHand ? 18 : 7 + Math.random()*5) * (1 + score*0.02),
        landed: false, timer: 0, radius: isHand ? 95 : 25,
        rotation: Math.random()*Math.PI, rotSpeed: (Math.random()-0.5)*0.2
    });
}

function update(time) {
    if (gameOver) return;

    if (slowMoTimer > 0) { slowMoTimer--; timeScale = 0.4; } else { timeScale = 1; }
    if (magnetTimer > 0) magnetTimer--;

    Object.values(chefs).forEach(p => {
        if (p.dashCharge < 100) p.dashCharge += 0.8;
        
        let f = p.friction;
        hazards.forEach(h => { if (Math.hypot(p.x - h.x, p.y - h.y) < h.r) f = 0.98; });

        let moveX = p.remoteInput.x || 0;
        let moveY = p.remoteInput.y || 0;

        // Keyboard Support for Chef 1
        if (p === Object.values(chefs)[0]) {
            if (keys.w) moveY -= 1; if (keys.s) moveY += 1;
            if (keys.a) moveX -= 1; if (keys.d) moveX += 1;
        }

        p.vx += moveX * p.baseSpeed;
        p.vy += moveY * p.baseSpeed;
        p.x += p.vx; p.y += p.vy;
        p.vx *= f; p.vy *= f;

        p.x = Math.max(15, Math.min(585, p.x));
        p.y = Math.max(15, Math.min(585, p.y));

        if (p.vx < -0.1) p.facing = -1; if (p.vx > 0.1) p.facing = 1;

        if (typeof DisasterSystem !== 'undefined') {
            DisasterSystem.soaps.forEach((s, i) => {
                if (Math.hypot(p.x - s.x, p.y - s.y) < 30) DisasterSystem.soaps.splice(i, 1);
            });
            DisasterSystem.powerups.forEach((pow, i) => {
                if (Math.hypot(p.x - pow.x, p.y - pow.y) < 30) {
                    if (pow.type === 'MAGNET') magnetTimer = 400;
                    if (pow.type === 'CLOCK') slowMoTimer = 300;
                    DisasterSystem.powerups.splice(i, 1);
                }
            });
            if (DisasterSystem.blender.active && Math.hypot(p.x - 300, p.y - 300) < 75) die(p.name + " SHREDDED!");
            if (DisasterSystem.hotTile.active && p.x > DisasterSystem.hotTile.x && p.x < DisasterSystem.hotTile.x + 50 && p.y > DisasterSystem.hotTile.y && p.y < DisasterSystem.hotTile.y + 50) die(p.name + " BURNED!");
        }

        if (critic.active && Math.hypot(p.x - critic.x, p.y - critic.y) < 30) { 
            score = Math.max(0, score-5); critic.active = false; 
        }
    });

    if (!critic.active && Math.random() < 0.006) { critic.active = true; critic.x = -50; critic.y = 100 + Math.random()*400; }
    if (critic.active) {
        critic.x += critic.speed * timeScale;
        if (critic.x > 650) critic.active = false;
    }

    if (typeof DisasterSystem !== 'undefined') DisasterSystem.triggerRandom(time);
    if (time - lastSpawn > Math.max(150, 1100 - (score * 10))) { spawnItem(); lastSpawn = time; }

    render(time);
    requestAnimationFrame(update);
}

function render(time) {
    ctx.clearRect(0, 0, 600, 600);
    drawFloor();
    if (typeof DisasterSystem !== 'undefined') DisasterSystem.draw(ctx, time);
    if (critic.active) drawCritic(critic.x, critic.y);
    
    hazards.forEach((h, i) => {
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI*2); ctx.fill();
        h.timer -= timeScale; if (h.timer <= 0) hazards.splice(i, 1);
    });

    items.forEach((item, index) => {
        ctx.beginPath(); ctx.ellipse(item.targetX, item.targetY, item.radius, item.radius/2, 0, 0, Math.PI*2);
        ctx.fillStyle = item.type === 'HAND' ? "rgba(255, 0, 0, 0.2)" : "rgba(0,0,0,0.1)";
        ctx.fill();

        if (item.currentY < item.targetY) {
            item.currentY += item.speed * timeScale;
            item.rotation += item.rotSpeed * timeScale;
        } else if (!item.landed) {
            item.landed = true;
            if (item.type === 'HAND') {
                canvas.classList.add('shake');
                setTimeout(() => canvas.classList.remove('shake'), 200);
            }
            
            Object.values(chefs).forEach(p => {
                if (Math.hypot(p.x - item.targetX, p.y - item.targetY) < item.radius) die(p.name + " BONKED!");
            });

            if (item.type === 'OIL') hazards.push({x: item.targetX, y: item.targetY, r: 75, timer: 400});
            score += 1 * multiplier; 
            if(scoreEl) scoreEl.innerText = score + " [" + getRank(score) + "]";
        }
        drawPolishedItem(item);
        if (item.landed) item.timer++;
        if (item.timer > 20) items.splice(index, 1);
    });

    Object.values(chefs).forEach(p => drawPlayer(p));
}

function die(m) { 
    gameOver = true; 
    alert("GAME OVER: " + m + "\nFinal Score: " + score); 
    location.reload(); 
}

function drawFloor() {
    ctx.fillStyle = "#e5c29f"; ctx.fillRect(0,0,600,600);
    ctx.strokeStyle = "rgba(0,0,0,0.03)";
    for(let i=0; i<600; i+=50) { ctx.strokeRect(i, 0, 50, 600); ctx.strokeRect(0, i, 600, 50); }
}

function drawCritic(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#2c3e50"; ctx.fillRect(-10, 0, 20, 15);
    ctx.fillStyle = "#ffe0bd"; ctx.beginPath(); ctx.arc(0, -10, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "black"; ctx.font = "bold 10px Arial"; ctx.textAlign="center"; ctx.fillText("CRITIC", 0, -25);
    ctx.restore();
}

function drawPlayer(p) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.name, 0, -55);
    ctx.scale(p.facing, 1);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillRect(-12, -35, 24, 15);
    ctx.beginPath(); ctx.arc(0, -35, 14, 0, Math.PI*2); ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#333"; ctx.fillRect(6, -5, 3, 3); ctx.fillRect(-2, -5, 3, 3);
    ctx.restore();
}

function drawPolishedItem(item) {
    ctx.save(); ctx.translate(item.targetX, item.currentY); ctx.rotate(item.rotation);
    if (item.type === 'HAND') {
        ctx.fillStyle = "#d2a679"; ctx.fillRect(-45, -50, 90, 100);
        ctx.fillStyle = "#c19a6b"; for(let i=0; i<4; i++) ctx.fillRect(-40 + (i*22), -90, 18, 60);
    } else if (item.type === 'OIL') {
        ctx.fillStyle = "#34495e"; ctx.fillRect(-12, -30, 24, 50);
        ctx.fillStyle = "#f1c40f"; ctx.fillRect(-10, -5, 20, 20);
    } else if (item.type === 'KNIFE') {
        ctx.fillStyle = "#bdc3c7"; ctx.beginPath(); ctx.moveTo(-6, -35); ctx.lineTo(6, -35); ctx.lineTo(0, 10); ctx.fill();
        ctx.fillStyle = "#3e2723"; ctx.fillRect(-5, 10, 10, 20);
    } else if (item.type === 'POT') {
        ctx.fillStyle = "#7f8c8d"; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#2c3e50"; ctx.fillRect(20, -5, 15, 10);
    } else {
        ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(0,0,25,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = "#3498db"; ctx.stroke();
    }
    ctx.restore();
}

if (typeof window.DisasterSystem === 'undefined') {
    window.DisasterSystem = { triggerRandom: () => {}, draw: () => {}, soaps: [], powerups: [], blender: {active: false}, hotTile: {active: false} };
}

requestAnimationFrame(update);