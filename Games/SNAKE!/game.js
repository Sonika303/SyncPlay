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

function init() {
    resize();
    window.addEventListener('resize', resize);
    
    // Listen for Player Data from Firebase
    onValue(ref(db, `parties/${partyCode}/players`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        Object.keys(data).forEach(uid => {
            if (!players[uid]) {
                // NEW PLAYER JOINED
                players[uid] = {
                    name: data[uid].name || "Player",
                    color: data[uid].color || "#6c5ce7",
                    parts: [{gx: 5, gy: 5}, {gx: 4, gy: 5}, {gx: 3, gy: 5}],
                    dir: {x: 1, y: 0},
                    nextDir: {x: 1, y: 0},
                    moveProgress: 0
                };
            } else {
                // UPDATE EXISTING PLAYER DIRECTION
                if (data[uid].dir) {
                    // Prevent 180-degree turns
                    const newD = data[uid].dir;
                    const currD = players[uid].dir;
                    if (!(newD.x === -currD.x && newD.y === -currD.y)) {
                        players[uid].nextDir = newD;
                    }
                }
            }
        });
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

function getBiome(gx, gy) {
    // Simplified biome logic for current screen
    if(gx < cols/2 && gy < rows/2) return { name: 'Forest', c1: '#059669', c2: '#047857', color: '#10b981' };
    return { name: 'Jungle', c1: '#065f46', c2: '#064e3b', color: '#059669' };
}

function drawPlayer(uid, p) {
    const h = p.parts[0];
    // Smooth interpolation
    const rx = (h.gx + p.dir.x * (p.moveProgress - 1)) * gridSize + gridSize/2;
    const ry = (h.gy + p.dir.y * (p.moveProgress - 1)) * gridSize + gridSize/2;

    // Draw Body
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    p.parts.forEach((part, i) => {
        let sx = part.gx * gridSize + gridSize/2;
        let sy = part.gy * gridSize + gridSize/2;

        ctx.strokeStyle = p.color;
        ctx.lineWidth = 25 - (i * 0.5); // Tapered tail
        
        if (i === 0) {
            // Head is drawn separately for rotation
        } else {
            const prev = p.parts[i-1];
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(prev.gx * gridSize + gridSize/2, prev.gy * gridSize + gridSize/2);
            ctx.stroke();
        }
    });

    // Draw Head
    const headX = h.gx * gridSize + gridSize/2;
    const headY = h.gy * gridSize + gridSize/2;
    
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(headX, headY, 20, 0, Math.PI*2);
    ctx.fill();
    
    // Name Tag
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, headX, headY - 30);
}

function updatePlayers() {
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.15; // Speed

        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            p.dir = p.nextDir;

            let ngx = p.parts[0].gx + p.dir.x;
            let ngy = p.parts[0].gy + p.dir.y;

            // Proper Wrap around
            if(ngx < 0) ngx = cols - 1; else if(ngx >= cols) ngx = 0;
            if(ngy < 0) ngy = rows - 1; else if(ngy >= rows) ngy = 0;

            // Apple Check
            if(ngx === apple.gx && ngy === apple.gy) {
                spawnApple();
                document.getElementById('s-norm').innerText = parseInt(document.getElementById('s-norm').innerText) + 1;
            } else {
                p.parts.pop();
            }
            p.parts.unshift({gx: ngx, gy: ngy});
        }
    });
}

function spawnApple() {
    apple.gx = Math.floor(Math.random() * cols);
    apple.gy = Math.floor(Math.random() * rows);
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

    // Draw Apple
    const ax = apple.gx * gridSize + gridSize/2;
    const ay = apple.gy * gridSize + gridSize/2;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ax, ay, 15, 0, Math.PI*2);
    ctx.fill();
    // Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ef4444';
    ctx.stroke();
    ctx.shadowBlur = 0;

    updatePlayers();
    Object.keys(players).forEach(uid => drawPlayer(uid, players[uid]));

    requestAnimationFrame(gameLoop);
}

init();