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

let gridSize = 65;
let cols, rows;
let players = {}; 
let apple = {gx: 5, gy: 5, isGold: false};
let shopTile = {gx: 0, gy: 0, active: true};
let partyScore = 0;
let goldApples = 0;
let hasCompass = false;

function init() {
    if (!partyCode) return;
    resize();
    window.addEventListener('resize', resize);
    
    // 1. Listen for Player Movements
    onValue(ref(db, `parties/${partyCode}/players`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        Object.keys(data).forEach(uid => {
            if (!players[uid]) {
                players[uid] = {
                    name: data[uid].name || "Player",
                    color: data[uid].color || "#6c5ce7",
                    parts: [{gx: 5, gy: 5}, {gx: 4, gy: 5}, {gx: 3, gy: 5}],
                    dir: {x: 1, y: 0},
                    nextDir: {x: 1, y: 0},
                    moveProgress: 0
                };
            } else {
                if (data[uid].dir) {
                    const newD = data[uid].dir;
                    const currD = players[uid].dir;
                    if (!(newD.x === -currD.x && newD.y === -currD.y)) {
                        players[uid].nextDir = newD;
                    }
                }
            }
        });
    });

    // 2. Listen for Shop State
    onValue(ref(db, `parties/${partyCode}/gameState/shopOpen`), (snapshot) => {
        const isOpen = snapshot.val();
        document.getElementById('shop').style.display = isOpen ? 'grid' : 'none';
    });

    // 3. Listen for Purchase Requests from Controllers
    onValue(ref(db, `parties/${partyCode}/gameState/buyRequest`), (snapshot) => {
        if (!snapshot.exists()) return;
        processPurchase();
    });

    spawnApple();
    spawnShopTile();
    requestAnimationFrame(gameLoop);
}

function processPurchase() {
    // Check if the team can afford the Compass
    if (partyScore >= 10 && goldApples >= 1 && !hasCompass) {
        partyScore -= 10;
        goldApples -= 1;
        hasCompass = true;

        // Update UI
        updateScoreUI();
        const effects = document.getElementById('effects-container');
        effects.innerHTML += `<div class="effect-tag" style="border-color: #fbbf24">UNLOCKED: 3D COMPASS</div>`;
        
        // Disable buy button on main screen
        const btn = document.getElementById('buy-btn');
        if(btn) {
            btn.innerText = "PURCHASED";
            btn.disabled = true;
        }

        // Close shop after purchase
        update(ref(db, `parties/${partyCode}/gameState`), { shopOpen: false });
    } else {
        console.log("Team cannot afford this yet!");
    }
}

function updateScoreUI() {
    document.getElementById('s-norm').innerText = partyScore;
    document.getElementById('s-gold').innerText = goldApples;
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

function spawnShopTile() {
    shopTile.gx = Math.floor(Math.random() * (cols - 2)) + 1;
    shopTile.gy = Math.floor(Math.random() * (rows - 2)) + 1;
}

function updatePlayers() {
    const shopOpen = document.getElementById('shop').style.display === 'grid';
    if (shopOpen) return;

    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.15;

        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            p.dir = p.nextDir;

            let ngx = p.parts[0].gx + p.dir.x;
            let ngy = p.parts[0].gy + p.dir.y;

            if(ngx < 0) ngx = cols - 1; else if(ngx >= cols) ngx = 0;
            if(ngy < 0) ngy = rows - 1; else if(ngy >= rows) ngy = 0;

            // Collision: Apple
            if(ngx === apple.gx && ngy === apple.gy) {
                if(apple.isGold) goldApples++; else partyScore++;
                updateScoreUI();
                spawnApple();
            } 
            // Collision: Shop Tile
            else if (ngx === shopTile.gx && ngy === shopTile.gy) {
                update(ref(db, `parties/${partyCode}/gameState`), { shopOpen: true });
                p.parts.pop(); 
            } 
            else {
                p.parts.pop();
            }
            p.parts.unshift({gx: ngx, gy: ngy});
        }
    });
}

function gameLoop() {
    ctx.fillStyle = '#010409';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    
    // Draw Grid
    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            ctx.fillStyle = (r+c)%2===0 ? '#0d1117' : '#161b22';
            ctx.fillRect(c*gridSize, r*gridSize, gridSize, gridSize);
        }
    }

    // Draw Shop Tile
    ctx.fillStyle = '#10b981';
    ctx.globalAlpha = 0.3;
    ctx.fillRect(shopTile.gx * gridSize, shopTile.gy * gridSize, gridSize, gridSize);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Segoe UI';
    ctx.fillText("SHOP", shopTile.gx * gridSize + 5, shopTile.gy * gridSize + gridSize/1.5);

    // Draw Apple
    const ax = apple.gx * gridSize + gridSize/2;
    const ay = apple.gy * gridSize + gridSize/2;
    ctx.fillStyle = apple.isGold ? '#fbbf24' : '#ef4444';
    ctx.shadowBlur = 15;
    ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(ax, ay, 18, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Compass Guide if unlocked
    if (hasCompass) {
        ctx.strokeStyle = '#fbbf24';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        // Just as an example, points from lead player to apple
        const firstP = players[Object.keys(players)[0]];
        if(firstP) {
            ctx.moveTo(firstP.parts[0].gx * gridSize + 32, firstP.parts[0].gy * gridSize + 32);
            ctx.lineTo(ax, ay);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    updatePlayers();
    
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.parts.forEach((part, i) => {
            ctx.fillStyle = i === 0 ? 'white' : p.color;
            ctx.beginPath();
            ctx.roundRect(part.gx * gridSize + 5, part.gy * gridSize + 5, gridSize - 10, gridSize - 10, 10);
            ctx.fill();
        });
    });

    requestAnimationFrame(gameLoop);
}

init();