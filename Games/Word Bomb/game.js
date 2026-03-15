import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = getAuth(app);
const urlParams = new URLSearchParams(window.location.search);
const partyCode = urlParams.get('code');

let myUid;
let isHost = false;
let gameActive = false;
let timerInterval = null;
let usedWords = [];
let currentTurnUid = null; // Track this for UI highlighting

const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE", "PRE", "VER", "TION", "IC", "AL", "OUS", "ABLE", "MENT", "ACK", "IGHT", "AND", "EST"];

// --- INITIALIZATION ---
onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) return;
    myUid = user.uid;
    document.getElementById("partyId").innerText = `ROOM: ${partyCode}`;

    const partySnap = await get(ref(db, `parties/${partyCode}`));
    if (partySnap.exists()) {
        const partyData = partySnap.val();
        if (partyData.hostId === myUid) {
            isHost = true;
            // Host UI Setup
            document.getElementById('host-controls').style.display = 'flex';
            document.getElementById('player-msg').style.display = 'none';
            
            if (!partyData.playersData || partyData.gameData?.status !== "playing") {
                prepareGame();
            } else {
                gameActive = true;
                startHostTimer();
            }
        }
    }
    listenToGame();
    listenForControllerInput();
});

async function prepareGame() {
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    if (pSnap.exists()) forceInit(pSnap.val());
}

async function forceInit(playersObj) {
    if (!isHost) return;
    const playerIds = Object.keys(playersObj || {});
    if (playerIds.length === 0) return;

    gameActive = true;
    usedWords = [];
    let startData = {};
    playerIds.forEach(uid => { 
        startData[uid] = { 
            lives: 3, 
            name: playersObj[uid].name || "Player",
            color: playersObj[uid].color || "#6c5ce7" 
        }; 
    });

    const updates = {};
    updates[`parties/${partyCode}/playersData`] = startData;
    updates[`parties/${partyCode}/usedWords`] = [];
    updates[`parties/${partyCode}/action`] = null;
    updates[`parties/${partyCode}/gameData`] = {
        syllable: "READY?",
        timer: 5,
        turn: playerIds[0],
        status: "playing",
        lastWord: "GET READY!",
        redirect: "controller" 
    };

    await update(ref(db), updates);
    setTimeout(() => updateTurn(0), 5000);
    startHostTimer();
}

// --- CORE GAME LOGIC ---
async function updateTurn(idx) {
    if (!isHost) return; 
    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
    if (!pSnap.exists()) return;
    
    const pData = pSnap.val();
    const playerIds = Object.keys(pData);
    let nextIdx = idx % playerIds.length;
    
    let attempts = 0;
    while (pData[playerIds[nextIdx]].lives <= 0 && attempts < playerIds.length) {
        nextIdx = (nextIdx + 1) % playerIds.length;
        attempts++;
    }

    const randomSyl = syllables[Math.floor(Math.random() * syllables.length)];
    await remove(ref(db, `parties/${partyCode}/action`));
    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: randomSyl,
        turn: playerIds[nextIdx],
        timer: 15,
        lastWord: "" 
    });
}

function listenToGame() {
    // Listener for Game State
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        currentTurnUid = data.turn; // Sync current turn
        
        document.getElementById("syllable").innerText = data.syllable || "---";
        document.getElementById("timer").innerText = data.timer ?? "0";
        document.getElementById("word-display").innerText = data.lastWord || "";

        const bomb = document.getElementById("bomb");
        if (data.timer <= 5 && data.status === "playing") {
            bomb.className = "shake-fast";
        } else {
            bomb.className = "shake-slow";
        }

        if (data.status === "finished" || data.status === "gameOver") {
            showVictoryScreen();
        } else if (data.status === "lobby") {
            window.location.href = `../../host.html?code=${partyCode}`;
        } else {
            document.getElementById("victory-overlay").style.display = "none";
            if (data.turn) updateTurnUI(data.turn);
        }
    });

    // Listener for Players/Lives
    onValue(ref(db, `parties/${partyCode}/playersData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        const display = document.getElementById("lives-display");
        display.innerHTML = "";
        
        Object.keys(data).forEach(uid => {
            const p = data[uid];
            const isDead = p.lives <= 0;
            const isTurn = (uid === currentTurnUid);

            const card = document.createElement("div");
            card.className = `player-card ${isDead ? 'dead' : ''} ${isTurn && !isDead ? 'active-turn-ui' : ''}`;
            card.innerHTML = `
                <div class="mini-avatar" style="background:${p.color}">${p.name.charAt(0).toUpperCase()}</div>
                <div class="player-name">${p.name}</div>
                <div class="heart-container">${isDead ? "💀 ELIMINATED" : "❤️".repeat(p.lives)}</div>
            `;
            display.appendChild(card);
        });

        if (isHost) checkWinner(data);
    });
}

async function updateTurnUI(turnUid) {
    const s = await get(ref(db, `parties/${partyCode}/playersData/${turnUid}`));
    if(s.exists()){
        const p = s.val();
        const info = document.getElementById("turn-info");
        info.innerText = `${p.name.toUpperCase()}'S TURN`;
        info.style.color = p.color;
    }
}

function startHostTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(async () => {
        if (!isHost || !gameActive) return;

        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        const d = snap.val();

        if (d && d.status === "playing" && !["READY?", "WAITING"].includes(d.syllable)) {
            if (d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } else {
                handleExplosion(d.turn);
            }
        }
    }, 1000);
}

async function handleExplosion(uid) {
    const pRef = ref(db, `parties/${partyCode}/playersData/${uid}`);
    const pSnap = await get(pRef);
    if (pSnap.exists()) {
        const newLives = Math.max(0, pSnap.val().lives - 1);
        await update(pRef, { lives: newLives });
        const idsSnap = await get(ref(db, `parties/${partyCode}/playersData`));
        const keys = Object.keys(idsSnap.val());
        updateTurn(keys.indexOf(uid) + 1);
    }
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists() || !isHost || !gameActive) return; 
        
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        const gameData = gSnap.val();
        
        if (action.uid === gameData.turn && gameData.status === "playing") {
            const word = (action.word || "").toUpperCase().trim();
            if (word.includes(gameData.syllable)) {
                const valid = await isValidWord(word);
                if (valid) {
                    usedWords.push(word.toLowerCase());
                    await update(ref(db, `parties/${partyCode}`), { 
                        "gameData/lastWord": word,
                        "usedWords": usedWords
                    });
                    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
                    updateTurn(Object.keys(pSnap.val()).indexOf(action.uid) + 1);
                } else {
                    await remove(ref(db, `parties/${partyCode}/action`));
                }
            }
        }
    });
}

async function isValidWord(word) {
    const cleanWord = word.toLowerCase().trim();
    if (usedWords.includes(cleanWord)) return false;
    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`);
        return res.ok;
    } catch { return cleanWord.length > 2; }
}

async function checkWinner(playersData) {
    const players = Object.keys(playersData);
    const alive = players.filter(uid => playersData[uid].lives > 0);
    
    // Check if only 1 player remains
    if (players.length > 1 && alive.length === 1 && gameActive) {
        await update(ref(db, `parties/${partyCode}/gameData`), { status: "gameOver" });
    }
}

async function showVictoryScreen() {
    gameActive = false;
    if (timerInterval) clearInterval(timerInterval);
    
    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
    if (pSnap.exists()) {
        const players = pSnap.val();
        const winnerEntry = Object.entries(players).find(([id, p]) => p.lives > 0);
        
        if (winnerEntry) {
            const [uid, winner] = winnerEntry;
            const overlay = document.getElementById("victory-overlay");
            const winnerContainer = document.getElementById("winner-container");
            
            // Generate the animated winner UI
            winnerContainer.innerHTML = `
                <div class="crown-icon">👑</div>
                <div class="winner-avatar-spin" style="background: ${winner.color}">
                    ${winner.name.charAt(0).toUpperCase()}
                </div>
                <h1 id="winner-text" style="font-size: 3.5rem; margin-top: 20px;">${winner.name.toUpperCase()} WINS!</h1>
                <p style="font-size: 1.5rem; color: #aaa;">The Word Bomb Master.</p>
            `;
            
            overlay.style.display = "flex";
            
            // Trigger confetti
            if (window.confetti) {
                confetti({ particleCount: 250, spread: 100, origin: { y: 0.6 }, colors: [winner.color, '#ffffff', '#f1c40f'] });
            }
        }
    }
}

// --- BUTTON EVENTS ---
document.getElementById('btn-reset').addEventListener('click', () => {
    prepareGame();
});

document.getElementById('btn-lobby').addEventListener('click', async () => {
    // Critical: Tell controllers to go home by setting redirect to false
    await update(ref(db, `parties/${partyCode}/gameData`), { 
        status: "lobby",
        redirect: false 
    });
});