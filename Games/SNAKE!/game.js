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
    // 1. SAFETY CHECK: If no code, don't just stay black, show an error
    if (!partyCode) {
        ctx.fillStyle = "white";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("ERROR: NO ROOM CODE FOUND", canvas.width/2, canvas.height/2);
        return;
    }

    resize();
    window.addEventListener('resize', resize);
    
    // 2. LISTEN FOR PLAYER DATA
    onValue(ref(db, `parties/${partyCode}/players`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        Object.keys(data).forEach(uid => {
            if (!players[uid]) {
                // NEW PLAYER JOINED - Randomize start position
                players[uid] = {
                    name: data[uid].name || "Player",
                    color: data[uid].color || "#6c5ce7",
                    parts: [
                        {gx: Math.floor(cols/2), gy: Math.floor(rows/2)}, 
                        {gx: Math.floor(cols/2)-1, gy: Math.floor(rows/2)}, 
                        {gx: Math.floor(cols/2)-2, gy: Math.floor(rows/2)}
                    ],
                    dir: {x: 1, y: 0},
                    nextDir: {x: 1, y: 0},
                    moveProgress: 0
                };
            } else {
                // UPDATE DIRECTION FROM FIREBASE
                if (data[uid].dir) {
                    const newD = data[uid].dir;
                    const currD = players[uid].dir;
                    // Prevent 180-degree turns
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

function drawPlayer(uid, p) {
    const head = p.parts[0];
    
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    // Draw Body Segments
    p.parts.forEach((part, i) => {
        if (i === 0) return; // Skip head for now
        
        const prev = p.parts[i-1];
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(10, 25 - (i * 0.8));
        
        ctx.beginPath();
        ctx.moveTo(part.gx * gridSize + gridSize/2, part.gy * gridSize + gridSize/2);
        ctx.lineTo(prev.gx * gridSize + gridSize/2, prev.gy * gridSize + gridSize/2);
        ctx.stroke();
    });

    // Draw Head with Glow
    const headX = head.gx * gridSize + gridSize/2;
    const headY = head.gy * gridSize + gridSize/2;
    
    ctx.shadowBlur = 15;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(headX, headY, 22, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Name Tag
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, headX, headY - 35);
}

function updatePlayers() {
    Object.keys(players).forEach(uid => {
        const p = players[uid];
        p.moveProgress += 0.15; // Animation Speed

        if (p.moveProgress >= 1) {
            p.moveProgress = 0;
            p.dir = p.nextDir;

            let ngx = p.parts[0].gx + p.dir.x;
            let ngy = p.parts[0].gy + p.dir.y;

            // Screen Wrapping
            if(ngx < 0) ngx = cols - 1; else if(ngx >= cols) ngx = 0;
            if(ngy < 0) ngy = rows - 1; else if(ngy >= rows) ngy = 0;

            // Apple Collision
            if(ngx === apple.gx && ngy === apple.gy) {
                spawnApple();
                const scoreEl = document.getElementById('s-norm');
                if(scoreEl) scoreEl.innerText = parseInt(scoreEl.innerText) + 1;
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
    // Background
    ctx.fillStyle = '#010409';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    
    // Checkerboard Grid
    for(let r=0; r<rows; r++) {
        for(let c=0; c<cols; c++) {
            ctx.fillStyle = (r+c)%2===0 ? '#0d1117' : '#161b22';
            ctx.fillRect(c*gridSize, r*gridSize, gridSize, gridSize);
        }
    }

    // Draw Apple
    const ax = apple.gx * gridSize + gridSize/2;
    const ay = apple.gy * gridSize + gridSize/2;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ef4444';
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ax, ay, 18, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    updatePlayers();
    Object.keys(players).forEach(uid => drawPlayer(uid, players[uid]));

    requestAnimationFrame(gameLoop);
}

// Start the game
init();