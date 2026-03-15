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

const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE", "PRE", "VER", "TION", "IC", "AL", "OUS", "ABLE", "MENT", "ACK", "IGHT", "AND", "EST"];

console.log("🚀 Script Loaded. Room:", partyCode);

// --- INITIALIZATION ---
onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) {
        console.error("❌ No user or no party code!");
        return;
    }
    myUid = user.uid;
    document.getElementById("partyId").innerText = `ROOM: ${partyCode}`;

    const partySnap = await get(ref(db, `parties/${partyCode}`));
    if (partySnap.exists()) {
        const partyData = partySnap.val();
        console.log("✅ Party Data Found. Host is:", partyData.hostId);

        if (partyData.hostId === myUid) {
            isHost = true;
            console.log("👑 YOU ARE THE HOST. Initializing systems...");
            document.getElementById('host-controls').style.display = 'flex';
            document.getElementById('player-msg').style.display = 'none';
            
            // Critical: Host must make sure gameData and playersData exist
            if (!partyData.playersData || partyData.gameData?.syllable === "LOBBY") {
                console.log("🛠 Game data empty/invalid. Forcing initialization...");
                prepareGame();
            } else {
                console.log("🕹 Game already in progress. Resuming...");
                gameActive = true;
                startHostTimer();
            }
        } else {
            console.log("👤 You are a Player. Watching host...");
        }
    }
    listenToGame();
    listenForControllerInput();
});

async function prepareGame() {
    console.log("🔍 Fetching players to start...");
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    if (pSnap.exists()) {
        forceInit(pSnap.val());
    } else {
        console.error("❌ No players found in /players/ node!");
    }
}

async function forceInit(playersObj) {
    if (!isHost) return;
    const playerIds = Object.keys(playersObj || {});
    if (playerIds.length === 0) {
        console.error("❌ Player list is empty!");
        return;
    }

    console.log("⚙️ Building game state for players:", playerIds);
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
    updates[`parties/${partyCode}/action`] = null; // Clear old actions
    updates[`parties/${partyCode}/gameData`] = {
        syllable: "READY?",
        timer: 5,
        turn: playerIds[0],
        status: "playing",
        lastWord: "GET READY!",
        redirect: "controller" 
    };

    try {
        await update(ref(db), updates);
        console.log("📡 Firebase Updated. Game Starting in 5s...");
        // Wait for the "READY?" countdown
        setTimeout(() => {
            console.log("🔥 First Turn Triggered!");
            updateTurn(0);
        }, 5000);
        startHostTimer();
    } catch (e) {
        console.error("❌ Firebase Update Failed:", e);
    }
}

// --- CORE GAME LOGIC ---
async function updateTurn(idx) {
    if (!isHost) return; 
    console.log("🔄 Changing Turn. Index:", idx);
    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
    if (!pSnap.exists()) return;
    
    const pData = pSnap.val();
    const playerIds = Object.keys(pData);
    let nextIdx = idx % playerIds.length;
    
    // Skip dead players
    let attempts = 0;
    while (pData[playerIds[nextIdx]].lives <= 0 && attempts < playerIds.length) {
        nextIdx = (nextIdx + 1) % playerIds.length;
        attempts++;
    }

    const randomSyl = syllables[Math.floor(Math.random() * syllables.length)];
    console.log("🆕 New Syllable:", randomSyl, "Next Player:", pData[playerIds[nextIdx]].name);
    
    await remove(ref(db, `parties/${partyCode}/action`)); // CRITICAL: Clear action so next player can submit
    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: randomSyl,
        turn: playerIds[nextIdx],
        timer: 15,
        lastWord: "" 
    });
}

function listenToGame() {
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        
        document.getElementById("syllable").innerText = data.syllable || "---";
        document.getElementById("timer").innerText = data.timer ?? "0";
        document.getElementById("word-display").innerText = data.lastWord || "";

        // UI Feedback
        const bomb = document.getElementById("bomb");
        if (data.timer <= 5) {
            bomb.className = "shake-fast";
        } else {
            bomb.className = "shake-slow";
        }

        if (data.status === "finished" || data.status === "gameOver") {
            showVictoryScreen();
        } else if (data.status === "lobby") {
            window.location.href = `../../host.html?code=${partyCode}`;
        } else {
            if (data.turn) updateTurnUI(data.turn);
        }
    });

    onValue(ref(db, `parties/${partyCode}/playersData`), (snap) => {
        if (!snap.exists()) return;
        console.log("💓 Hearts Updated");
        const data = snap.val();
        const display = document.getElementById("lives-display");
        display.innerHTML = "";
        
        Object.keys(data).forEach(uid => {
            const p = data[uid];
            const card = document.createElement("div");
            const isDead = p.lives <= 0;
            card.className = `player-card ${isDead ? 'dead' : ''}`;
            card.innerHTML = `
                <div class="mini-avatar" style="background:${p.color}">${p.name.charAt(0).toUpperCase()}</div>
                <div class="player-name">${p.name}</div>
                <div class="heart-container">${isDead ? "💀 DEAD" : "❤️".repeat(p.lives)}</div>
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
    console.log("⏰ Timer Started");
    timerInterval = setInterval(async () => {
        if (!isHost || !gameActive) return;

        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        const d = snap.val();

        if (d && d.status === "playing" && !["READY?", "WAITING"].includes(d.syllable)) {
            if (d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } else {
                console.log("💥 BOMB EXPLODED!");
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
            console.log("⌨️ Action Received:", word);

            if (word.includes(gameData.syllable)) {
                const valid = await isValidWord(word);
                if (valid) {
                    console.log("✅ Word Accepted!");
                    usedWords.push(word.toLowerCase());
                    await update(ref(db, `parties/${partyCode}`), { 
                        "gameData/lastWord": word,
                        "usedWords": usedWords
                    });
                    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
                    updateTurn(Object.keys(pSnap.val()).indexOf(action.uid) + 1);
                } else {
                    console.warn("❌ Word Rejected by Dictionary");
                    await remove(ref(db, `parties/${partyCode}/action`)); // Clear so they can try again
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
    
    if (players.length > 1 && alive.length === 1 && gameActive) {
        console.log("🏆 Winner Found!");
        await update(ref(db, `parties/${partyCode}/gameData`), { status: "gameOver" });
    }
}

async function showVictoryScreen() {
    gameActive = false;
    if (timerInterval) clearInterval(timerInterval);
    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
    if (pSnap.exists()) {
        const players = pSnap.val();
        const winner = Object.values(players).find(p => p.lives > 0);
        if (winner) {
            document.getElementById("winner-text").innerText = `${winner.name.toUpperCase()} WINS!`;
            document.getElementById("victory-overlay").style.display = "flex";
        }
    }
}

// --- BUTTON EVENTS ---
document.getElementById('btn-reset').addEventListener('click', () => prepareGame());
document.getElementById('btn-lobby').addEventListener('click', () => {
    update(ref(db, `parties/${partyCode}/gameData`), { status: "lobby" });
});