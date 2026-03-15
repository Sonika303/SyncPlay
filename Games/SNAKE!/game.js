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

let gridSize = 70;
let cols, rows;
let players = {}; 
let apple = {gx: 5, gy: 5, isGold: false, phase: 0};
let shopTile = {gx: 10, gy: 10};
let partyScore = 0;
let goldApples = 0;
let trees = [];

const biomes = [
    { name: "FOREST", bg1: "#1a2e1a", bg2: "#233d23", accent: "#10b981", type: 'land' },
    { name: "DESERT", bg1: "#3d2b16", bg2: "#4d3a1e", accent: "#fbbf24", type: 'land' },
    { name: "WATER", bg1: "#1e3a8a", bg2: "#2563eb", accent: "#38bdf8", type: 'water' },
    { name: "VOID", bg1: "#0f172a", bg2: "#1e293b", accent: "#6366f1", type: 'land' }
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
                const sx = Math.floor(Math.random() * (cols - 5)) + 2;
                const sy = Math.floor(Math.random() * (rows - 5)) + 2;
                players[uid] = {
                    name: data[uid].name || "Player",
                    color: data[uid].color || "#6c5ce7",
                    parts: [{gx: sx, gy: sy}, {gx: sx-1, gy: sy}, {gx: sx-2, gy: sy}],
                    dir: {x: 1, y: 0},
                    nextDir: {x: 1, y: 0},
                    moveProgress: 0,
                    tongueLen: 0,
                    swimPhase: 0
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

    onValue(ref(db, `parties/${partyCode}/gameState/shopOpen`), (snapshot) => {
        document.getElementById('shop').style.display = snapshot.val() ? 'grid' : 'none';
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
    trees = [];
    for(let i=0; i<8; i++) {
        trees.push({
            gx: Math.floor(Math.random() * cols),
            gy: Math.floor(Math.random() * rows),
            scale: 0.8 + Math.random() * 0.5
        });
    }
}

function spawnApple() {
    apple.gx = Math.floor(Math.random() * (cols - 2)) + 1;
    apple.gy = Math.floor(Math.random() * (rows - 2)) + 1;
    apple.isGold = Math.random() > 0.9;
}

function shiftWorld(dx, dy) {
    currentBiomeIndex = (currentBiomeIndex + 1) % biomes.length;
    const b = biomes[currentBiomeIndex];
    
    // UI Feedback
    const bTxt = document.getElementById('biome-txt');
    if(bTxt) { bTxt.innerText = b.name; bTxt.style.color = b.accent; }

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        const shiftX = dx !== 0 ? (dx > 0 ? - (cols - 1) : (cols - 1)) : 0;
        const shiftY = dy !== 0 ? (dy > 0 ? - (rows - 1) : (rows - 1)) : 0;
        
        p.parts.forEach(part => {
            part.gx += shiftX;
            part.gy += shiftY;
        });
    });

    spawnTrees();
    spawnApple();
    shopTile.gx = Math.floor(Math.random() * (cols - 2)) + 1;
    shopTile.gy = Math.floor(Math.random() * (rows - 2)) + 1;
}

function drawApple(x, y, isGold) {
    const time = Date.now() / 200;
    const bounce = Math.sin(time) * 5;
    
    ctx.save();
    ctx.translate(x * gridSize + gridSize/2, y * gridSize + gridSize/2 + bounce);
    
    // Leaf
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.ellipse(5, -18, 10, 5, Math.PI/4, 0, Math.PI*2);
    ctx.fill();

    // Body
    ctx.fillStyle = isGold ? "#fbbf24" : "#ef4444";
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(-7, -7, 6, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
}

function drawTree(tree) {
    const b = biomes[currentBiomeIndex];
    if (b.type === 'water') return; // No trees in water

    ctx.save();
    ctx.translate(tree.gx * gridSize + gridSize/2, tree.gy * gridSize + gridSize/2);
    ctx.scale(tree.scale, tree.scale);

    // Trunk
    ctx.fillStyle = "#452714";
    ctx.fillRect(-10, 0, 20, 30);

    // Foliage (Cartoonish)
    ctx.fillStyle = b.accent;
    for(let i=0; i<3; i++) {
        ctx.beginPath();
        ctx.arc(0, -15 - (i*15), 25 - (i*5), 0, Math.PI*2);
        ctx.fill();
    }
    ctx.restore();
}

function drawSnake(p) {
    const isWater = biomes[currentBiomeIndex].type === 'water';
    p.swimPhase += 0.2;

    p.parts.forEach((part, i) => {
        const x = part.gx * gridSize + gridSize/2;
        const y = part.gy * gridSize + gridSize/2;
        
        // Swimming Sine Wave
        const swimOff = isWater ? Math.sin(p.swimPhase + i * 0.5) * 15 : 0;
        
        ctx.fillStyle = i === 0 ? "white" : p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        const size = i === 0 ? 28 : 22 - (i * 0.5); // Tapered body
        ctx.arc(x + (p.dir.y * swimOff), y + (p.dir.x * swimOff), Math.max(size, 10), 0, Math.PI*2);
        ctx.fill();

        // Face details on head
        if(i === 0) {
            // Tongue logic
            if(Math.random() > 0.98) p.tongueLen = 20;
            if(p.tongueLen > 0) {
                ctx.strokeStyle = "#ff4d4d";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + p.dir.x * (30 + p.tongueLen), y + p.dir.y * (30 + p.tongueLen));
                ctx.stroke();
                p.tongueLen -= 2;
            }
            
            // Eyes
            ctx.fillStyle = "black";
            ctx.beginPath();
            ctx.arc(x + p.dir.x*10 - p.dir.y*10, y + p.dir.y*10 + p.dir.x*10, 4, 0, Math.PI*2);
            ctx.arc(x + p.dir.x*10 + p.dir.y*10, y + p.dir.y*10 - p.dir.x*10, 4, 0, Math.PI*2);
            ctx.fill();
        }
    });
    ctx.shadowBlur = 0;
}

function updatePlayers() {
    if (document.getElementById('shop').style.display === 'grid') return;

    let shiftX = 0, shiftY = 0;

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.18;

        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            p.dir = p.nextDir;

            let ngx = p.parts[0].gx + p.dir.x;
            let ngy = p.parts[0].gy + p.dir.y;

            // Trigger World Shift
            if (ngx < 0) shiftX = -1;
            else if (ngx >= cols) shiftX = 1;
            else if (ngy < 0) shiftY = -1;
            else if (ngy >= rows) shiftY = 1;

            if (ngx === apple.gx && ngy === apple.gy) {
                if (apple.isGold) goldApples++; else partyScore++;
                document.getElementById('s-norm').innerText = partyScore;
                document.getElementById('s-gold').innerText = goldApples;
                spawnApple();
            } else {
                p.parts.pop();
            }
            p.parts.unshift({ gx: ngx, gy: ngy });
        }
    });

    if (shiftX !== 0 || shiftY !== 0) shiftWorld(shiftX, shiftY);
}

function gameLoop() {
    const biome = biomes[currentBiomeIndex];
    
    // Background
    ctx.fillStyle = biome.bg1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Better Grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for(let i=0; i<=cols; i++) { ctx.beginPath(); ctx.moveTo(i*gridSize, 0); ctx.lineTo(i*gridSize, canvas.height); ctx.stroke(); }
    for(let i=0; i<=rows; i++) { ctx.beginPath(); ctx.moveTo(0, i*gridSize); ctx.lineTo(canvas.width, i*gridSize); ctx.stroke(); }

    trees.forEach(drawTree);
    
    // Shop Tile Visual
    ctx.fillStyle = biome.accent;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.roundRect(shopTile.gx * gridSize + 5, shopTile.gy * gridSize + 5, gridSize - 10, gridSize - 10, 20);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    drawApple(apple.gx, apple.gy, apple.isGold);
    updatePlayers();
    Object.keys(players).forEach(uid => drawSnake(players[uid]));

    requestAnimationFrame(gameLoop);
}

init();