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

let players = []; 
let myUid;
let isHost = false;
let gameActive = true;
const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE", "PRE", "VER", "TION"];

onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) {
        console.error("No user or no party code found");
        return;
    }
    myUid = user.uid;
    document.getElementById("partyId").innerText = "PARTY ID: " + partyCode;

    const partyRef = ref(db, `parties/${partyCode}`);
    const partySnap = await get(partyRef);
    
    if (partySnap.exists() && partySnap.val().hostId === myUid) {
        isHost = true;
        console.log("Invisible Host Mode: ACTIVE");
        onDisconnect(partyRef).remove();

        // --- STUCK FIX: INITIAL CHECK ---
        // If host joins and players are already there, start immediately.
        const pSnap = await get(ref(db, `parties/${partyCode}/players`));
        if (pSnap.exists()) {
            const playersObj = pSnap.val();
            players = Object.keys(playersObj);
            
            const gDataSnap = await get(ref(db, `parties/${partyCode}/gameData`));
            if (!gDataSnap.exists() || gDataSnap.val().syllable === "WAITING") {
                console.log("Force starting engine on load...");
                forceInit(playersObj);
            }
        }
    }

    // Monitor Players list
    onValue(ref(db, `parties/${partyCode}/players`), async (snap) => {
        if (!snap.exists()) {
            players = [];
            return;
        }
        const playersObj = snap.val();
        players = Object.keys(playersObj);

        // Host-only: Trigger start if players join while we are on this page
        if (isHost && players.length > 0) {
            const gameDataSnap = await get(ref(db, `parties/${partyCode}/gameData`));
            if (!gameDataSnap.exists() || (gameDataSnap.val() && gameDataSnap.val().syllable === "WAITING")) {
                forceInit(playersObj);
            }
        }
    });

    listenToGame();
    listenForControllerInput();
});

async function forceInit(playersObj) {
    let startData = {};
    players.forEach(uid => { 
        startData[uid] = { 
            lives: 3, 
            name: playersObj[uid].name || "Player",
            color: playersObj[uid].color || "#667eea" 
        }; 
    });

    gameActive = true;
    // Set player data first, then game state
    await set(ref(db, `parties/${partyCode}/playersData`), startData);
    await set(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "READY?",
        timer: 15,
        turn: players[0],
        status: "playing"
    });
    
    setTimeout(() => updateTurn(0), 2500);
}

async function updateTurn(idx) {
    if (!gameActive || players.length === 0) return;
    
    const actualIdx = idx % players.length;
    const nextUid = players[actualIdx];

    // Skip dead players
    const pSnap = await get(ref(db, `parties/${partyCode}/playersData/${nextUid}`));
    if (pSnap.exists() && pSnap.val().lives <= 0) {
        return updateTurn(idx + 1);
    }

    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "Choosing...",
        turn: nextUid,
        timer: 15
    });

    setTimeout(async () => {
        if(!gameActive) return;
        const randomSyl = syllables[Math.floor(Math.random() * syllables.length)];
        await update(ref(db, `parties/${partyCode}/gameData`), {
            syllable: randomSyl,
            timer: 15
        });
        await remove(ref(db, `parties/${partyCode}/action`));
    }, 1000);
}

function listenToGame() {
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        
        if (data.status === "finished") {
            gameActive = false;
            document.getElementById("syllable").innerText = "GAME OVER";
            document.getElementById("turn-info").innerText = "WE HAVE A WINNER!";
            if (isHost) document.getElementById("resetBtn").style.display = "block";
            return;
        }

        get(ref(db, `parties/${partyCode}/playersData/${data.turn}`)).then(s => {
            if(s.exists()){
                const p = s.val();
                const info = document.getElementById("turn-info");
                info.innerText = p.name.toUpperCase() + "'S TURN";
                info.style.color = p.color;
            }
        });
    });

    onValue(ref(db, `parties/${partyCode}/playersData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        const display = document.getElementById("lives-display");
        display.innerHTML = "";
        
        Object.keys(data).forEach(uid => {
            const p = data[uid];
            const initial = p.name.charAt(0).toUpperCase();
            const card = document.createElement("div");
            card.className = `player-card ${p.lives <= 0 ? 'dead' : ''}`;
            card.innerHTML = `
                <div class="mini-avatar" style="background:${p.color}">${initial}</div>
                <div class="player-info">
                    <span class="player-name">${p.name}</span><br>
                    <span class="hearts">${p.lives > 0 ? "❤️".repeat(p.lives) : "💀"}</span>
                </div>
            `;
            display.appendChild(card);
        });
        if (isHost) checkWinner(data);
    });
}

async function checkWinner(playersData) {
    const alivePlayers = Object.keys(playersData).filter(uid => playersData[uid].lives > 0);
    if (alivePlayers.length <= 1 && gameActive && players.length > 1) {
        gameActive = false;
        await update(ref(db, `parties/${partyCode}/gameData`), { status: "finished" });
    }
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists() || !gameActive) return;
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        if(!gSnap.exists()) return;
        
        const gameData = gSnap.val();
        if (action.uid === gameData.turn && gameData.syllable.length <= 4) {
            const word = action.word.toUpperCase().trim();
            if (word.includes(gameData.syllable) && word.length >= 3) {
                console.log("Word Accepted!");
                findNextPlayer(action.uid);
            }
        }
    });
}

async function findNextPlayer(currentUid) {
    let idx = players.indexOf(currentUid);
    updateTurn(idx + 1);
}

setInterval(async () => {
    if (isHost && gameActive) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if (snap.exists()) {
            let d = snap.val();
            if (d.syllable !== "Choosing..." && d.syllable !== "READY?" && d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } 
            else if (d.timer <= 0 && d.status === "playing") {
                const pRef = ref(db, `parties/${partyCode}/playersData/${d.turn}`);
                const pSnap = await get(pRef);
                if (pSnap.exists()) {
                    let newLives = pSnap.val().lives - 1;
                    await update(pRef, { lives: newLives });
                    findNextPlayer(d.turn);
                }
            }
        }
    }
}, 1000);

window.resetGame = async () => {
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    if (pSnap.exists()) {
        document.getElementById("resetBtn").style.display = "none";
        forceInit(pSnap.val());
    }
};