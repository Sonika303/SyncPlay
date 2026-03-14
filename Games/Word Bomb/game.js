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
let gameActive = false;
const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE", "PRE", "VER", "TION", "IC", "AL", "OUS", "ABLE", "MENT"];

onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) return;
    myUid = user.uid;
    document.getElementById("partyId").innerText = "ID: " + partyCode;

    const partyRef = ref(db, `parties/${partyCode}`);
    const partySnap = await get(partyRef);
    
    if (partySnap.exists()) {
        if (partySnap.val().hostId === myUid) {
            isHost = true;
            onDisconnect(partyRef).remove();
            
            // Start looking for players immediately
            const pRef = ref(db, `parties/${partyCode}/players`);
            onValue(pRef, (snap) => {
                if (snap.exists() && !gameActive) {
                    const pObj = snap.val();
                    const pKeys = Object.keys(pObj);
                    if (pKeys.length >= 1) forceInit(pObj);
                }
            }, { onlyOnce: true });
        }
    }
    listenToGame();
    listenForControllerInput();
});

async function forceInit(playersObj) {
    gameActive = true;
    players = Object.keys(playersObj);
    let startData = {};
    players.forEach(uid => { 
        startData[uid] = { 
            lives: 3, 
            name: playersObj[uid].name || "Player",
            color: playersObj[uid].color || "#f1c40f" 
        }; 
    });

    await set(ref(db, `parties/${partyCode}/playersData`), startData);
    await set(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "READY?",
        timer: 10,
        turn: players[0],
        status: "playing",
        lastWord: ""
    });
    
    setTimeout(() => updateTurn(0), 2000);
}

async function updateTurn(idx) {
    if (!isHost) return; 
    
    // Ensure we have the latest player list
    const pSnap = await get(ref(db, `parties/${partyCode}/playersData`));
    if (!pSnap.exists()) return;
    const pData = pSnap.val();
    players = Object.keys(pData);

    let nextIdx = idx % players.length;
    let attempts = 0;

    // Skip dead players
    while (pData[players[nextIdx]].lives <= 0 && attempts < players.length) {
        nextIdx = (nextIdx + 1) % players.length;
        attempts++;
    }

    const randomSyl = syllables[Math.floor(Math.random() * syllables.length)];
    
    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: randomSyl,
        turn: players[nextIdx],
        timer: 10,
        lastWord: "" 
    });
    await remove(ref(db, `parties/${partyCode}/action`));
}

function listenToGame() {
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        document.getElementById("word-display").innerText = data.lastWord || "";

        if (data.status === "finished") {
            gameActive = false;
            document.getElementById("turn-info").innerText = "GAME OVER";
            if (isHost) document.getElementById("resetBtn").style.display = "block";
        } else {
            get(ref(db, `parties/${partyCode}/playersData/${data.turn}`)).then(s => {
                if(s.exists()){
                    const info = document.getElementById("turn-info");
                    info.innerText = s.val().name.toUpperCase() + "'S TURN";
                    info.style.color = s.val().color;
                }
            });
        }

        document.querySelectorAll('.player-card').forEach(card => {
            card.classList.toggle('active-turn', card.dataset.uid === data.turn);
        });
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
            card.dataset.uid = uid;
            card.innerHTML = `
                <div class="mini-avatar" style="background:${p.color}">${p.name.charAt(0).toUpperCase()}</div>
                <div class="player-name">${p.name}</div>
                <div class="hearts">${p.lives > 0 ? "❤️".repeat(p.lives) : "💀"}</div>
            `;
            display.appendChild(card);
        });
        if (isHost) checkWinner(data);
    });
}

async function isValidWord(word) {
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
        return response.ok;
    } catch { return false; }
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists()) return;
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        const gameData = gSnap.val();
        
        if (action.uid === gameData.turn && gameData.status === "playing") {
            const word = action.word.toUpperCase().trim();
            const syl = gameData.syllable.toUpperCase();

            await update(ref(db, `parties/${partyCode}/gameData`), { lastWord: word });

            if (word.includes(syl) && word.length > syl.length) {
                const valid = await isValidWord(word);
                if (valid) {
                    confetti({ particleCount: 150, spread: 70, origin: { y: 0.7 } });
                    updateTurn(players.indexOf(action.uid) + 1);
                }
            }
        }
    });
}

// HOST-ONLY CLOCK
setInterval(async () => {
    if (isHost) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if (!snap.exists()) return;
        const d = snap.val();

        if (d.status === "playing" && !["READY?", "Choosing..."].includes(d.syllable)) {
            if (d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } else {
                const pRef = ref(db, `parties/${partyCode}/playersData/${d.turn}`);
                const pSnap = await get(pRef);
                if (pSnap.exists()) {
                    const newLives = Math.max(0, pSnap.val().lives - 1);
                    await update(pRef, { lives: newLives });
                    updateTurn(players.indexOf(d.turn) + 1);
                }
            }
        }
    }
}, 1000);

async function checkWinner(playersData) {
    const alive = Object.keys(playersData).filter(uid => playersData[uid].lives > 0);
    const total = Object.keys(playersData).length;
    if (total > 1 && alive.length <= 1) {
        await update(ref(db, `parties/${partyCode}/gameData`), { status: "finished" });
    }
}

window.resetGame = async () => {
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    if (pSnap.exists()) {
        document.getElementById("resetBtn").style.display = "none";
        forceInit(pSnap.val());
    }
};