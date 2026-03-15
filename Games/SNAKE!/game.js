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
const lobbyURL = `https://sonika303.github.io/SyncPlay/?code=${partyCode}`;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mCanvas = document.getElementById('minimap');
const mCtx = mCanvas?.getContext('2d');

let gridSize = 70;
let cols, rows;
let players = {}; 
let apple = {gx: 5, gy: 5, isGold: false, phase: 0};
let shopTile = {gx: 10, gy: 10};
let partyScore = 0;
let goldApples = 0;
let trees = [];

// NEW: Sync-Lock State
let isShifting = false;

// Weather State
let weatherTimer = 60;
let currentWeather = "CLEAR"; 
const weathers = ["CLEAR", "RAIN", "SNOW", "FOG"];
const weatherIcons = { "CLEAR": "☀️", "RAIN": "🌧️", "SNOW": "❄️", "FOG": "🌫️" };

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
    
    // BACK TO LOBBY SYSTEM: Redirect Listener
    onValue(ref(db, `parties/${partyCode}/status`), (snap) => {
        if (snap.val() === "lobby") {
            window.location.href = lobbyURL;
        }
    });

    // BACK TO LOBBY SYSTEM: Button Logic
    const lobbyBtn = document.getElementById('btn-lobby');
    if (lobbyBtn) {
        lobbyBtn.onclick = () => {
            update(ref(db, `parties/${partyCode}`), { status: "lobby" });
        };
    }
    
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
        const shop = document.getElementById('shop');
        if(shop) shop.style.display = snapshot.val() ? 'grid' : 'none';
    });

    setInterval(() => {
        weatherTimer--;
        const timerFill = document.getElementById('timer-fill');
        if(timerFill) timerFill.style.width = (weatherTimer / 60 * 100) + "%";

        if (weatherTimer <= 0) {
            weatherTimer = 60;
            currentWeather = weathers[Math.floor(Math.random() * weathers.length)];
            const wLabel = document.getElementById('weather-label');
            const wIcon = document.getElementById('w-icon');
            if(wLabel) wLabel.innerText = currentWeather + " SKIES";
            if(wIcon) wIcon.innerText = weatherIcons[currentWeather];
        }
    }, 1000);

    spawnTrees();
    spawnApple();
    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / gridSize);
    rows = Math.floor(canvas.height / gridSize);
    if(mCanvas) { mCanvas.width = 180; mCanvas.height = 180; }
}

function spawnTrees() {
    trees = [];
    for(let i=0; i<10; i++) {
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
    if (isShifting) return; // Prevention for "Fast Switching"
    isShifting = true;

    currentBiomeIndex = (currentBiomeIndex + 1) % biomes.length;
    const b = biomes[currentBiomeIndex];
    const bTxt = document.getElementById('biome-txt');
    if(bTxt) { 
        bTxt.innerText = b.name; 
        bTxt.style.color = b.accent; 
        bTxt.style.textShadow = `0 0 20px ${b.accent}66`;
    }

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        const shiftX = dx !== 0 ? (dx > 0 ? - (cols - 1) : (cols - 1)) : 0;
        const shiftY = dy !== 0 ? (dy > 0 ? - (rows - 1) : (rows - 1)) : 0;
        p.parts.forEach(part => { part.gx += shiftX; part.gy += shiftY; });
    });

    spawnTrees();
    spawnApple();
    shopTile.gx = Math.floor(Math.random() * (cols - 2)) + 1;
    shopTile.gy = Math.floor(Math.random() * (rows - 2)) + 1;

    // Release shift lock after 400ms pause
    setTimeout(() => { isShifting = false; }, 400);
}

function drawSnake(p) {
    const isWater = biomes[currentBiomeIndex].type === 'water';
    p.swimPhase += 0.15;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    p.parts.forEach((part, i) => {
        const x = part.gx * gridSize + gridSize/2;
        const y = part.gy * gridSize + gridSize/2;
        const swimOff = isWater ? Math.sin(p.swimPhase + i * 0.5) * 15 : 0;
        
        const finalX = x + (p.dir.y * swimOff);
        const finalY = y + (p.dir.x * swimOff);

        if (i === 0) ctx.moveTo(finalX, finalY);
        else ctx.lineTo(finalX, finalY);
    });

    ctx.shadowBlur = 15;
    ctx.shadowColor = p.color;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 36;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 12;
    ctx.stroke();

    const head = p.parts[0];
    const hX = head.gx * gridSize + gridSize/2;
    const hY = head.gy * gridSize + gridSize/2;
    
    // Eyes
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(hX + p.dir.x*12 - p.dir.y*8, hY + p.dir.y*12 + p.dir.x*8, 6, 0, Math.PI*2);
    ctx.arc(hX + p.dir.x*12 + p.dir.y*8, hY + p.dir.y*12 - p.dir.x*8, 6, 0, Math.PI*2);
    ctx.fill();

    // USERNAME: Floating Badge
    ctx.font = "bold 16px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(hX - 50, hY - 65, 100, 25); // Subtle background
    ctx.fillStyle = "white";
    ctx.fillText(p.name, hX, hY - 47);

    ctx.restore();
}

function drawMinimap() {
    if(!mCtx) return;
    const b = biomes[currentBiomeIndex];
    const nextB = biomes[(currentBiomeIndex + 1) % biomes.length];
    
    mCtx.clearRect(0,0,mCanvas.width, mCanvas.height);
    mCtx.fillStyle = "rgba(0,0,0,0.85)";
    mCtx.fillRect(0,0, mCanvas.width, mCanvas.height);

    const scale = mCanvas.width / cols;

    mCtx.fillStyle = b.accent;
    trees.forEach(t => mCtx.fillRect(t.gx * scale, t.gy * scale, scale, scale));

    mCtx.fillStyle = apple.isGold ? "#fbbf24" : "#ef4444";
    mCtx.beginPath();
    mCtx.arc(apple.gx * scale + scale/2, apple.gy * scale + scale/2, scale, 0, Math.PI*2);
    mCtx.fill();

    Object.values(players).forEach(p => {
        mCtx.fillStyle = p.color;
        mCtx.fillRect(p.parts[0].gx * scale - scale, p.parts[0].gy * scale - scale, scale*3, scale*3);
    });

    mCtx.fillStyle = "white";
    mCtx.font = "bold 10px sans-serif";
    mCtx.fillText(b.name, 8, 18);
    mCtx.fillStyle = nextB.accent;
    mCtx.fillText(`NEXT: ${nextB.name} →`, 8, mCanvas.height - 10);
}

function drawWeatherEffect() {
    if (currentWeather === "CLEAR") return;
    ctx.save();
    if (currentWeather === "RAIN") {
        ctx.strokeStyle = "rgba(174,194,224,0.4)";
        ctx.lineWidth = 1;
        for(let i=0; i<50; i++) {
            let rx = Math.random() * canvas.width;
            let ry = Math.random() * canvas.height;
            ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 8, ry + 15); ctx.stroke();
        }
    } else if (currentWeather === "SNOW") {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for(let i=0; i<40; i++) {
            ctx.beginPath(); ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 2.5, 0, Math.PI*2); ctx.fill();
        }
    } else if (currentWeather === "FOG") {
        let grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, "rgba(255,255,255,0.15)");
        ctx.fillStyle = grad;
        ctx.fillRect(0,0, canvas.width, canvas.height);
    }
    ctx.restore();
}

function updatePlayers() {
    if (isShifting) return; // Stop movement while world is adjusting

    let shiftX = 0, shiftY = 0;
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.22; 
        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            p.dir = p.nextDir;
            let ngx = p.parts[0].gx + p.dir.x;
            let ngy = p.parts[0].gy + p.dir.y;

            if (ngx < 0) shiftX = -1;
            else if (ngx >= cols) shiftX = 1;
            else if (ngy < 0) shiftY = -1;
            else if (ngy >= rows) shiftY = 1;

            if (ngx === apple.gx && ngy === apple.gy) {
                if (apple.isGold) goldApples++; else partyScore++;
                const sn = document.getElementById('s-norm');
                const sg = document.getElementById('s-gold');
                if(sn) sn.innerText = partyScore;
                if(sg) sg.innerText = goldApples;
                spawnApple();
            } else { p.parts.pop(); }
            p.parts.unshift({ gx: ngx, gy: ngy });
        }
    });
    if (shiftX !== 0 || shiftY !== 0) shiftWorld(shiftX, shiftY);
}

function gameLoop() {
    const biome = biomes[currentBiomeIndex];
    ctx.fillStyle = biome.bg1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for(let i=0; i<=cols; i++) { ctx.beginPath(); ctx.moveTo(i*gridSize, 0); ctx.lineTo(i*gridSize, canvas.height); ctx.stroke(); }
    for(let i=0; i<=rows; i++) { ctx.beginPath(); ctx.moveTo(0, i*gridSize); ctx.lineTo(canvas.width, i*gridSize); ctx.stroke(); }

    trees.forEach(drawTree);
    
    ctx.fillStyle = biome.accent;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.roundRect(shopTile.gx * gridSize + 5, shopTile.gy * gridSize + 5, gridSize - 10, gridSize - 10, 20);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    drawApple(apple.gx, apple.gy, apple.isGold);
    updatePlayers();
    Object.keys(players).forEach(uid => drawSnake(players[uid]));
    drawWeatherEffect();
    drawMinimap();

    requestAnimationFrame(gameLoop);
}

function drawTree(tree) {
    const b = biomes[currentBiomeIndex];
    if (b.type === 'water') return;
    ctx.save();
    ctx.translate(tree.gx * gridSize + gridSize/2, tree.gy * gridSize + gridSize/2);
    ctx.scale(tree.scale, tree.scale);
    ctx.fillStyle = "#452714"; ctx.fillRect(-10, 0, 20, 30);
    ctx.fillStyle = b.accent;
    for(let i=0; i<3; i++) {
        ctx.beginPath(); ctx.arc(0, -15 - (i*15), 25 - (i*5), 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
}

function drawApple(x, y, isGold) {
    const time = Date.now() / 200;
    const bounce = Math.sin(time) * 5;
    ctx.save();
    ctx.translate(x * gridSize + gridSize/2, y * gridSize + gridSize/2 + bounce);
    ctx.fillStyle = "#4ade80"; ctx.beginPath(); ctx.ellipse(5, -18, 10, 5, Math.PI/4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = isGold ? "#fbbf24" : "#ef4444";
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

init();