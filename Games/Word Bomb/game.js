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

let players = []; 
let myUid;
let isHost = false;
let gameActive = true;
const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE", "PRE", "VER", "TION"];

onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) {
        console.error("No user or no party code found in URL");
        return;
    }
    myUid = user.uid;
    document.getElementById("partyId").innerText = "PARTY ID: " + partyCode;

    // Monitor the players list
    onValue(ref(db, `parties/${partyCode}/players`), async (snap) => {
        if (!snap.exists()) return;
        const playersObj = snap.val();
        players = Object.keys(playersObj);

        // First player joined is the Host
        if (myUid === players[0]) {
            isHost = true;
            console.log("Host Status Confirmed");
            
            // Check if game setup is needed
            const gameDataSnap = await get(ref(db, `parties/${partyCode}/gameData`));
            if (!gameDataSnap.exists()) {
                console.log("Initializing Game Data...");
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

    try {
        // Set players data
        await set(ref(db, `parties/${partyCode}/playersData`), startData);
        // Set initial game state
        await set(ref(db, `parties/${partyCode}/gameData`), {
            syllable: "READY?",
            timer: 15,
            turn: players[0],
            status: "playing"
        });
        console.log("Database initialized successfully.");
        // Kick off the first turn
        setTimeout(() => updateTurn(0), 2000);
    } catch (e) {
        console.error("Database Write Failed: ", e);
    }
}

async function updateTurn(idx) {
    if (!gameActive || !players[idx % players.length]) return;
    const nextUid = players[idx % players.length];

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
    }, 1200);
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
            document.getElementById("timer").innerText = "🏆";
            if (isHost) document.getElementById("resetBtn").style.display = "block";
            return;
        }

        // Update turn UI
        get(ref(db, `parties/${partyCode}/playersData/${data.turn}`)).then(s => {
            if(s.exists()){
                const p = s.val();
                const info = document.getElementById("turn-info");
                info.innerText = p.name.toUpperCase() + "'S TURN";
                info.style.color = p.color;
            }
        });

        document.querySelectorAll('.player-card').forEach(card => {
            card.classList.remove('active-turn');
            if (card.getAttribute('data-uid') === data.turn) {
                card.classList.add('active-turn');
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
            card.setAttribute('data-uid', uid);
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
    if (alivePlayers.length === 1 && gameActive && players.length > 1) {
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
        if (action.uid === gameData.turn && gameData.syllable !== "Choosing..." && gameData.syllable !== "READY?") {
            const word = action.word.toUpperCase().trim();
            if (word.includes(gameData.syllable) && word.length >= 3) {
                findNextPlayer(action.uid);
            }
        }
    });
}

async function findNextPlayer(currentUid) {
    const snap = await get(ref(db, `parties/${partyCode}/playersData`));
    const data = snap.val();
    let idx = players.indexOf(currentUid);
    
    for (let i = 1; i <= players.length; i++) {
        let nIdx = (idx + i) % players.length;
        if (data[players[nIdx]].lives > 0) {
            updateTurn(nIdx);
            return;
        }
    }
}

// Host loop - Handles timer decrement
setInterval(async () => {
    if (isHost && gameActive) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if (snap.exists()) {
            let d = snap.val();
            if (d.syllable !== "Choosing..." && d.syllable !== "READY?" && d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } 
            else if (d.syllable !== "Choosing..." && d.syllable !== "READY?" && d.timer <= 0) {
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