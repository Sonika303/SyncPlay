import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gridSize = 65;
let cols, rows;
let players = {}; 
let apple = {gx: 10, gy: 10, isGold: false};

// Initialize Game
function init() {
    resize();
    window.addEventListener('resize', resize);
    
    // Listen for Player Data from Firebase
    onValue(ref(db, `parties/${partyCode}/players`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        // Update our local players object
        Object.keys(data).forEach(uid => {
            if (!players[uid]) {
                // Initialize new player snake locally
                players[uid] = {
                    ...data[uid],
                    parts: [{gx: 5, gy: 5}, {gx: 4, gy: 5}, {gx: 3, gy: 5}],
                    dir: {x: 1, y: 0},
                    moveProgress: 0
                };
            } else {
                // Update direction from Firebase (controller input)
                players[uid].nextDir = data[uid].dir || {x: 1, y: 0};
                players[uid].name = data[uid].name;
            }
        });
    });

    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / gridSize);
    rows = Math.floor(canvas.height / gridSize);
}

function getBiome(gx, gy) {
    const mx = Math.floor(gx / cols), my = Math.floor(gy / rows);
    if(mx === 0 && my === 0) return { name: 'Forest', c1: '#059669', c2: '#047857', color: '#10b981' };
    if(mx === 1 && my === 0) return { name: 'Tundra', c1: '#f1f5f9', c2: '#cbd5e1', color: '#94a3b8' };
    if(mx === 0 && my === 1) return { name: 'Desert', c1: '#fbbf24', c2: '#d97706', color: '#f59e0b' };
    return { name: 'Sea', c1: '#0ea5e9', c2: '#0369a1', color: '#38bdf8' };
}

function drawPlayer(uid, p) {
    const h = p.parts[0];
    const biome = getBiome(h.gx, h.gy);
    const rx = (h.gx % cols + p.dir.x * p.moveProgress) * gridSize + gridSize/2;
    const ry = (h.gy % rows + p.dir.y * p.moveProgress) * gridSize + gridSize/2;

    // Draw Body
    p.parts.forEach((part, i) => {
        if(Math.floor(part.gx/cols) !== Math.floor(h.gx/cols) || Math.floor(part.gy/rows) !== Math.floor(h.gy/rows)) return;
        let sx = (part.gx % cols) * gridSize + gridSize/2;
        let sy = (part.gy % rows) * gridSize + gridSize/2;

        ctx.strokeStyle = p.color || '#34d399';
        ctx.lineWidth = 22 + ((p.parts.length - i) / p.parts.length) * 15;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if(i === 0) { ctx.moveTo(sx, sy); ctx.lineTo(rx, ry); }
        else {
            const prev = p.parts[i-1];
            ctx.moveTo(sx, sy); 
            ctx.lineTo((prev.gx % cols)*gridSize+gridSize/2, (prev.gy % rows)*gridSize+gridSize/2);
        }
        ctx.stroke();
    });

    // Draw Head & Name
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(p.name.toUpperCase(), rx, ry - 40); // SHOW USERNAME

    ctx.save(); ctx.translate(rx, ry); ctx.rotate(Math.atan2(p.dir.y, p.dir.x));
    ctx.fillStyle = '#064e3b'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function updatePlayers() {
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.15;

        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            if (p.nextDir) p.dir = p.nextDir;

            let ngx = p.parts[0].gx + p.dir.x;
            let ngy = p.parts[0].gy + p.dir.y;

            // Wrap around
            if(ngx < 0) ngx = cols*2-1; else if(ngx >= cols*2) ngx = 0;
            if(ngy < 0) ngy = rows*2-1; else if(ngy >= rows*2) ngy = 0;

            // Collision with Apple
            if(ngx === apple.gx && ngy === apple.gy) {
                spawnApple();
            } else {
                p.parts.pop();
            }
            p.parts.unshift({gx: ngx, gy: ngy});
        }
    });
}

function spawnApple() {
    apple.gx = Math.floor(Math.random()*(cols*2));
    apple.gy = Math.floor(Math.random()*(rows*2));
}

function gameLoop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Draw background based on first player's biome (or default)
    const firstPlayer = Object.values(players)[0];
    const biome = firstPlayer ? getBiome(firstPlayer.parts[0].gx, firstPlayer.parts[0].gy) : getBiome(0,0);
    
    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            ctx.fillStyle = (r+c)%2===0 ? biome.c1 : biome.c2;
            ctx.fillRect(c*gridSize, r*gridSize, gridSize, gridSize);
        }
    }

    // Draw Apple
    const ax = (apple.gx%cols)*gridSize+gridSize/2, ay = (apple.gy%rows)*gridSize+gridSize/2;
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(ax, ay, 15, 0, Math.PI*2); ctx.fill();

    // Update and Draw all players
    updatePlayers();
    Object.keys(players).forEach(uid => drawPlayer(uid, players[uid]));

    requestAnimationFrame(gameLoop);
}

init();