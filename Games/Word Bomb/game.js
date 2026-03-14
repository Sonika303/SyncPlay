import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
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

const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE", "PRE", "VER", "TION", "IC", "AL", "OUS", "ABLE", "MENT"];

onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) return;
    myUid = user.uid;
    document.getElementById("partyId").innerText = "ID: " + partyCode;

    const partyRef = ref(db, `parties/${partyCode}`);
    const partySnap = await get(partyRef);
    
    if (partySnap.exists()) {
        const partyData = partySnap.val();
        if (partyData.hostId === myUid) {
            isHost = true;
            await remove(ref(db, `parties/${partyCode}/action`));
            
            const gameData = partyData.gameData || {};
            if (gameData.status !== "playing") {
                prepareGame();
            } else {
                gameActive = true;
                startHostTimer();
            }
        }
    }
    listenToGame();
    listenForControllerInput();
    listenForRedirect(); 
});

async function prepareGame() {
    const pRef = ref(db, `parties/${partyCode}/players`);
    const pSnap = await get(pRef);
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
    updates[`parties/${partyCode}/gameData`] = {
        syllable: "READY?",
        timer: 10,
        turn: playerIds[0],
        status: "playing",
        lastWord: "",
        redirect: false 
    };

    await update(ref(db), updates);
    document.getElementById("victory-overlay").style.display = "none";
    
    setTimeout(() => updateTurn(0), 3000);
    startHostTimer();
}

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
    
    // Clear the action first so the next player doesn't trigger the previous word
    await remove(ref(db, `parties/${partyCode}/action`));

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

        const timerEl = document.getElementById("timer");
        if (data.timer <= 3 && data.status === "playing") {
            timerEl.classList.add("shake-fast");
        } else {
            timerEl.classList.remove("shake-fast");
        }

        if (data.status === "finished") {
            showVictoryScreen();
        } else {
            document.getElementById("victory-overlay").style.display = "none";
            if (data.turn) updateTurnUI(data.turn);
        }
    });

    onValue(ref(db, `parties/${partyCode}/usedWords`), (snap) => {
        usedWords = snap.val() || [];
    });

    onValue(ref(db, `parties/${partyCode}/playersData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        const display = document.getElementById("lives-display");
        
        display.innerHTML = "";
        Object.keys(data).forEach(uid => {
            const p = data[uid];
            const card = document.createElement("div");
            card.className = `player-card ${p.lives <= 0 ? 'dead' : ''}`;
            card.innerHTML = `
                <div class="mini-avatar" style="background:${p.color}">${(p.name || "P").charAt(0).toUpperCase()}</div>
                <div class="player-name">${p.name || "Player"}</div>
                <div class="hearts">${p.lives > 0 ? "❤️".repeat(p.lives) : "💀"}</div>
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
        info.innerText = (p.name || "PLAYER").toUpperCase() + "'S TURN";
        info.style.color = p.color || "#ffffff";
    }
}

function showVictoryScreen() {
    gameActive = false;
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById("victory-overlay").style.display = "flex";
    if (isHost) document.getElementById("host-controls").style.display = "flex";
}

async function checkWinner(playersData) {
    const alive = Object.keys(playersData).filter(uid => playersData[uid].lives > 0);
    if (Object.keys(playersData).length > 1 && alive.length <= 1 && gameActive) {
        await update(ref(db, `parties/${partyCode}/gameData`), { status: "finished" });
    }
}

function listenForRedirect() {
    onValue(ref(db, `parties/${partyCode}/gameData/redirect`), (snap) => {
        if (snap.exists() && snap.val() === true) {
            window.location.href = `../../host.html?code=${partyCode}`;
        }
    });
}

window.resetGame = async () => {
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    if (pSnap.exists()) forceInit(pSnap.val());
};

window.changeGame = async () => {
    await update(ref(db, `parties/${partyCode}/gameData`), { redirect: true });
};

async function isValidWord(word) {
    const cleanWord = word.toLowerCase().trim();
    if (usedWords.includes(cleanWord)) return false;

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`);
        return response.ok;
    } catch { return false; }
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists() || !isHost) return; 
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        const gameData = gSnap.val();
        
        // Ensure this action hasn't been processed yet and belongs to current turn
        if (action.uid === gameData.turn && gameData.status === "playing") {
            const word = (action.word || "").toUpperCase().trim();
            if (word.includes(gameData.syllable)) {
                const valid = await isValidWord(word);
                if (valid) {
                    // Prevent immediate re-triggering
                    await remove(ref(db, `parties/${partyCode}/action`));
                    
                    usedWords.push(word.toLowerCase());
                    await update(ref(db, `parties/${partyCode}`), { 
                        "gameData/lastWord": word,
                        "usedWords": usedWords
                    });
                    
                    if (window.confetti) confetti({ particleCount: 150, spread: 70, origin: { y: 0.7 } });
                    
                    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
                    const ids = Object.keys(pSnap.val());
                    updateTurn(ids.indexOf(action.uid) + 1);
                }
            }
        }
    });
}

function startHostTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(async () => {
        if (!isHost || !gameActive) return;

        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if (!snap.exists()) return;
        const d = snap.val();

        if (d.status === "playing" && !["READY?", "WAITING"].includes(d.syllable)) {
            if (d.timer > 0) {
                // Atomic decrease
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } else {
                // TIMER EXPIRED
                const pRef = ref(db, `parties/${partyCode}/playersData/${d.turn}`);
                const pSnap = await get(pRef);
                if (pSnap.exists()) {
                    const currentLives = pSnap.val().lives;
                    const newLives = Math.max(0, currentLives - 1);
                    
                    // Batch these updates to prevent turn-skipping
                    const updates = {};
                    updates[`parties/${partyCode}/playersData/${d.turn}/lives`] = newLives;
                    await update(ref(db), updates);
                    
                    const idsSnap = await get(ref(db, `parties/${partyCode}/playersData`));
                    updateTurn(Object.keys(idsSnap.val()).indexOf(d.turn) + 1);
                }
            }
        }
    }, 1000);
}