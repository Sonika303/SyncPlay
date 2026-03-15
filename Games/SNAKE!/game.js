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
const mCanvas = document.getElementById('minimap');
const mCtx = mCanvas?.getContext('2d');

let gridSize = 75;
let cols, rows;
let players = {}; 
let apple = {gx: 5, gy: 5, isGold: false};
let shopTile = {gx: 10, gy: 10};
let partyScore = 0;
let goldApples = 0;
let trees = [];

const biomes = [
    { name: "FOREST", bg1: "#0a1a0a", bg2: "#102610", accent: "#10b981", type: 'land' },
    { name: "DESERT", bg1: "#2d1b00", bg2: "#3d2b00", accent: "#fbbf24", type: 'land' },
    { name: "WATER", bg1: "#0c1e4a", bg2: "#162e6a", accent: "#38bdf8", type: 'water' },
    { name: "VOID", bg1: "#020617", bg2: "#0f172a", accent: "#818cf8", type: 'land' }
];
let currentBiomeIndex = 0;

function init() {
    if (!partyCode) return;
    resize();
    window.addEventListener('resize', resize);
    
    onValue(ref(db, `parties/${partyCode}/players`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        Object.keys(data).forEach(uid => {
            if (!players[uid]) {
                const sx = Math.floor(Math.random() * (cols - 10)) + 5;
                const sy = Math.floor(Math.random() * (rows - 10)) + 5;
                players[uid] = {
                    name: data[uid].name || "Player",
                    color: data[uid].color || "#6c5ce7",
                    parts: [{gx: sx, gy: sy}, {gx: sx-1, gy: sy}, {gx: sx-2, gy: sy}],
                    dir: {x: 1, y: 0},
                    nextDir: {x: 1, y: 0},
                    moveProgress: 0,
                    tongueLen: 0,
                    swimPhase: Math.random() * Math.PI
                };
            } else if (data[uid].dir) {
                const newD = data[uid].dir;
                const currD = players[uid].dir;
                if (!(newD.x === -currD.x && newD.y === -currD.y)) {
                    players[uid].nextDir = newD;
                }
            }
        });
    });

    spawnTrees();
    spawnApple();
    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / gridSize);
    rows = Math.floor(canvas.height / gridSize);
}

function spawnTrees() {
    trees = Array.from({length: 10}, () => ({
        gx: Math.floor(Math.random() * cols),
        gy: Math.floor(Math.random() * rows),
        scale: 0.7 + Math.random() * 0.6
    }));
}

function spawnApple() {
    apple.gx = Math.floor(Math.random() * (cols - 4)) + 2;
    apple.gy = Math.floor(Math.random() * (rows - 4)) + 2;
    apple.isGold = Math.random() > 0.9;
}

function shiftWorld(dx, dy) {
    currentBiomeIndex = (currentBiomeIndex + 1) % biomes.length;
    const b = biomes[currentBiomeIndex];
    const bTxt = document.getElementById('biome-txt');
    if(bTxt) { bTxt.innerText = b.name; bTxt.style.color = b.accent; }

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        const sX = dx !== 0 ? (dx > 0 ? -(cols-1) : (cols-1)) : 0;
        const sY = dy !== 0 ? (dy > 0 ? -(rows-1) : (rows-1)) : 0;
        p.parts.forEach(pt => { pt.gx += sX; pt.gy += sY; });
    });

    spawnTrees();
    spawnApple();
    shopTile.gx = Math.floor(Math.random() * (cols - 4)) + 2;
    shopTile.gy = Math.floor(Math.random() * (rows - 4)) + 2;
}

function drawMinimap() {
    if(!mCtx) return;
    mCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
    mCtx.fillRect(0, 0, mCanvas.width, mCanvas.height);

    const sX = mCanvas.width / cols;
    const sY = mCanvas.height / rows;

    // Minimap Trees
    mCtx.fillStyle = "#14532d";
    trees.forEach(t => mCtx.fillRect(t.gx * sX, t.gy * sY, sX, sY));

    // Minimap Apple
    mCtx.fillStyle = apple.isGold ? "#fbbf24" : "#ef4444";
    mCtx.fillRect(apple.gx * sX, apple.gy * sY, sX * 1.5, sY * 1.5);

    // Minimap Players
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        mCtx.fillStyle = p.color;
        p.parts.forEach(pt => mCtx.fillRect(pt.gx * sX, pt.gy * sY, sX * 2, sY * 2));
    });
}

function drawSnake(p) {
    const isWater = biomes[currentBiomeIndex].type === 'water';
    p.swimPhase += 0.15;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Draw the continuous body path
    ctx.beginPath();
    p.parts.forEach((pt, i) => {
        const x = pt.gx * gridSize + gridSize/2;
        const y = pt.gy * gridSize + gridSize/2;
        
        // Swimming animation
        const swim = isWater ? Math.sin(p.swimPhase + i * 0.7) * 18 : 0;
        const finalX = x + (p.dir.y * swim);
        const finalY = y + (p.dir.x * swim);

        if(i === 0) ctx.moveTo(finalX, finalY);
        else ctx.lineTo(finalX, finalY);
    });

    // Outer Glow / Body
    ctx.shadowBlur = 15;
    ctx.shadowColor = p.color;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 38;
    ctx.stroke();

    // Inner detail (makes it look 3D/Single model)
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 12;
    ctx.stroke();

    // Head Details
    const h = p.parts[0];
    const hX = h.gx * gridSize + gridSize/2;
    const hY = h.gy * gridSize + gridSize/2;

    // Eyes
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(hX + p.dir.x*15 - p.dir.y*10, hY + p.dir.y*15 + p.dir.x*10, 7, 0, Math.PI*2);
    ctx.arc(hX + p.dir.x*15 + p.dir.y*10, hY + p.dir.y*15 - p.dir.x*10, 7, 0, Math.PI*2);
    ctx.fill();
    
    // Pupils (looking forward)
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(hX + p.dir.x*20 - p.dir.y*10, hY + p.dir.y*20 + p.dir.x*10, 3, 0, Math.PI*2);
    ctx.arc(hX + p.dir.x*20 + p.dir.y*10, hY + p.dir.y*20 - p.dir.x*10, 3, 0, Math.PI*2);
    ctx.fill();

    // Tongue
    if(Math.random() > 0.98) p.tongueLen = 25;
    if(p.tongueLen > 0) {
        ctx.strokeStyle = "#ff4d4d";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(hX + p.dir.x*20, hY + p.dir.y*20);
        ctx.lineTo(hX + p.dir.x*(35 + p.tongueLen), hY + p.dir.y*(35 + p.tongueLen));
        ctx.stroke();
        p.tongueLen -= 1.5;
    }

    ctx.restore();
}

function gameLoop() {
    const biome = biomes[currentBiomeIndex];
    ctx.fillStyle = biome.bg1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Modern Grid
    ctx.strokeStyle = biome.bg2;
    ctx.lineWidth = 2;
    for(let i=0; i<=cols; i++) { ctx.beginPath(); ctx.moveTo(i*gridSize, 0); ctx.lineTo(i*gridSize, canvas.height); ctx.stroke(); }
    for(let i=0; i<=rows; i++) { ctx.beginPath(); ctx.moveTo(0, i*gridSize); ctx.lineTo(canvas.width, i*gridSize); ctx.stroke(); }

    // Trees
    trees.forEach(t => {
        ctx.save();
        ctx.translate(t.gx*gridSize+gridSize/2, t.gy*gridSize+gridSize/2);
        ctx.scale(t.scale, t.scale);
        ctx.fillStyle = "#3f2b1a"; ctx.fillRect(-8, 0, 16, 25);
        ctx.fillStyle = biome.accent;
        ctx.beginPath(); ctx.moveTo(0, -45); ctx.lineTo(35, 10); ctx.lineTo(-35, 10); ctx.fill();
        ctx.restore();
    });

    // Shop Tile
    ctx.fillStyle = biome.accent; ctx.globalAlpha = 0.2;
    ctx.beginPath(); ctx.roundRect(shopTile.gx*gridSize+10, shopTile.gy*gridSize+10, gridSize-20, gridSize-20, 15); ctx.fill();
    ctx.globalAlpha = 1.0;

    drawApple(apple.gx, apple.gy, apple.isGold);
    updatePlayers();
    Object.keys(players).forEach(uid => drawSnake(players[uid]));
    drawMinimap();

    requestAnimationFrame(gameLoop);
}

function updatePlayers() {
    let sX = 0, sY = 0;
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.22; 
        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            p.dir = p.nextDir;
            let nX = p.parts[0].gx + p.dir.x, nY = p.parts[0].gy + p.dir.y;
            if (nX < 0) sX = -1; else if (nX >= cols) sX = 1;
            else if (nY < 0) sY = -1; else if (nY >= rows) sY = 1;
            if (nX === apple.gx && nY === apple.gy) {
                if (apple.isGold) goldApples++; else partyScore++;
                document.getElementById('s-norm').innerText = partyScore;
                document.getElementById('s-gold').innerText = goldApples;
                spawnApple();
            } else { p.parts.pop(); }
            p.parts.unshift({ gx: nX, gy: nY });
        }
    });
    if (sX !== 0 || sY !== 0) shiftWorld(sX, sY);
}

init();