import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, update, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let gridSize = 65;
let cols, rows;
let players = {}; 
let apple = {gx: 5, gy: 5, isGold: false};
let shopTile = {gx: 10, gy: 10};
let partyScore = 0;
let goldApples = 0;

const biomes = [
    { name: "FOREST", bg1: "#0d1117", bg2: "#161b22", accent: "#10b981" },
    { name: "DESERT", bg1: "#2d1b00", bg2: "#3d2b00", accent: "#fbbf24" },
    { name: "VOID", bg1: "#0f172a", bg2: "#1e293b", accent: "#6366f1" }
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
                // SPAWN AT RANDOM POSITIONS SO THEY DON'T STACK
                const sx = Math.floor(Math.random() * (cols - 5)) + 2;
                const sy = Math.floor(Math.random() * (rows - 5)) + 2;
                players[uid] = {
                    name: data[uid].name || "Player",
                    color: data[uid].color || "#6c5ce7",
                    parts: [{gx: sx, gy: sy}, {gx: sx-1, gy: sy}, {gx: sx-2, gy: sy}],
                    dir: {x: 1, y: 0},
                    nextDir: {x: 1, y: 0},
                    moveProgress: 0
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
        const isOpen = snapshot.val();
        document.getElementById('shop').style.display = isOpen ? 'grid' : 'none';
    });

    spawnApple();
    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / gridSize);
    rows = Math.floor(canvas.height / gridSize);
}

function spawnApple() {
    apple.gx = Math.floor(Math.random() * (cols - 2)) + 1;
    apple.gy = Math.floor(Math.random() * (rows - 2)) + 1;
    apple.isGold = Math.random() > 0.9;
}

function shiftWorld(dx, dy) {
    currentBiomeIndex = (currentBiomeIndex + 1) % biomes.length;
    const b = biomes[currentBiomeIndex];
    const bTxt = document.getElementById('biome-txt');
    if(bTxt) {
        bTxt.innerText = b.name;
        bTxt.style.color = b.accent;
    }

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.parts.forEach(part => {
            if (dx !== 0) part.gx = dx > 0 ? 0 : cols - 1;
            if (dy !== 0) part.gy = dy > 0 ? 0 : rows - 1;
        });
    });

    spawnApple();
    shopTile.gx = Math.floor(Math.random() * (cols - 2)) + 1;
    shopTile.gy = Math.floor(Math.random() * (rows - 2)) + 1;
}

function drawMinimap() {
    if(!mCtx) return;
    mCtx.fillStyle = "black";
    mCtx.fillRect(0, 0, mCanvas.width, mCanvas.height);
    
    const scaleX = mCanvas.width / cols;
    const scaleY = mCanvas.height / rows;

    // Draw Apple on Minimap
    mCtx.fillStyle = apple.isGold ? "#fbbf24" : "#ef4444";
    mCtx.fillRect(apple.gx * scaleX, apple.gy * scaleY, scaleX * 2, scaleY * 2);

    // Draw Players on Minimap
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        mCtx.fillStyle = p.color;
        p.parts.forEach(part => {
            mCtx.fillRect(part.gx * scaleX, part.gy * scaleY, scaleX, scaleY);
        });
    });
}

function updatePlayers() {
    const shopOpen = document.getElementById('shop').style.display === 'grid';
    if (shopOpen) return;

    let worldShiftNeeded = { x: 0, y: 0 };

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.15;

        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            p.dir = p.nextDir;

            let ngx = p.parts[0].gx + p.dir.x;
            let ngy = p.parts[0].gy + p.dir.y;

            if (ngx < 0) worldShiftNeeded = { x: -1, y: 0 };
            else if (ngx >= cols) worldShiftNeeded = { x: 1, y: 0 };
            else if (ngy < 0) worldShiftNeeded = { x: 0, y: -1 };
            else if (ngy >= rows) worldShiftNeeded = { x: 0, y: 1 };

            if (ngx === apple.gx && ngy === apple.gy) {
                if (apple.isGold) goldApples++; else partyScore++;
                document.getElementById('s-norm').innerText = partyScore;
                document.getElementById('s-gold').innerText = goldApples;
                spawnApple();
            } 
            else if (ngx === shopTile.gx && ngy === shopTile.gy) {
                update(ref(db, `parties/${partyCode}/gameState`), { shopOpen: true });
                p.parts.pop();
            } else {
                p.parts.pop();
            }
            p.parts.unshift({ gx: ngx, gy: ngy });
        }
    });

    if (worldShiftNeeded.x !== 0 || worldShiftNeeded.y !== 0) {
        shiftWorld(worldShiftNeeded.x, worldShiftNeeded.y);
    }
}

function gameLoop() {
    const biome = biomes[currentBiomeIndex];
    ctx.fillStyle = biome.bg1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? biome.bg1 : biome.bg2;
            ctx.fillRect(c * gridSize, r * gridSize, gridSize, gridSize);
        }
    }

    // Shop Tile
    ctx.fillStyle = biome.accent;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(shopTile.gx * gridSize, shopTile.gy * gridSize, gridSize, gridSize);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "white";
    ctx.font = "bold 20px Segoe UI";
    ctx.fillText("SHOP", shopTile.gx * gridSize + 5, shopTile.gy * gridSize + gridSize / 1.5);

    // Apple
    ctx.fillStyle = apple.isGold ? "#fbbf24" : "#ef4444";
    ctx.beginPath();
    ctx.arc(apple.gx * gridSize + gridSize / 2, apple.gy * gridSize + gridSize / 2, 18, 0, Math.PI * 2);
    ctx.fill();

    updatePlayers();
    drawMinimap();

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.parts.forEach((part, i) => {
            ctx.fillStyle = i === 0 ? "white" : p.color;
            ctx.beginPath();
            ctx.roundRect(part.gx * gridSize + 5, part.gy * gridSize + 5, gridSize - 10, gridSize - 10, 10);
            ctx.fill();
        });
    });

    requestAnimationFrame(gameLoop);
}

init();