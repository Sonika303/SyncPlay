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
const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE", "PRE", "VER", "TION", "IC", "AL", "OUS", "ABLE", "MENT"];

onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) return;
    myUid = user.uid;
    document.getElementById("partyId").innerText = "PARTY ID: " + partyCode;

    const partyRef = ref(db, `parties/${partyCode}`);
    const partySnap = await get(partyRef);
    
    if (partySnap.exists()) {
        const partyData = partySnap.val();
        if (partyData.hostId === myUid) {
            isHost = true;
            onDisconnect(partyRef).remove();

            // Host finds players and kicks off the engine
            const huntForPlayers = setInterval(async () => {
                const pSnap = await get(ref(db, `parties/${partyCode}/players`));
                if (pSnap.exists()) {
                    const playersObj = pSnap.val();
                    players = Object.keys(playersObj);
                    
                    if (players.length > 0) {
                        clearInterval(huntForPlayers);
                        const gDataSnap = await get(ref(db, `parties/${partyCode}/gameData`));
                        // Force init if game hasn't truly started
                        if (!gDataSnap.exists() || gDataSnap.val().syllable === "WAITING") {
                            forceInit(playersObj);
                        }
                    }
                }
            }, 1000);
        }
    }

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
    await set(ref(db, `parties/${partyCode}/playersData`), startData);
    await set(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "READY?",
        timer: 15,
        turn: players[0],
        status: "playing",
        lastWord: ""
    });
    
    setTimeout(() => updateTurn(0), 3000);
}

async function updateTurn(idx) {
    if (!gameActive || players.length === 0) return;
    
    const actualIdx = idx % players.length;
    const nextUid = players[actualIdx];

    const pSnap = await get(ref(db, `parties/${partyCode}/playersData/${nextUid}`));
    if (pSnap.exists() && pSnap.val().lives <= 0) {
        return updateTurn(idx + 1); // Skip dead players
    }

    // Phase 1: Set to Choosing
    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "Choosing...",
        turn: nextUid,
        timer: 15
    });

    // Phase 2: Show Syllable after short delay
    setTimeout(async () => {
        if(!gameActive) return;
        const randomSyl = syllables[Math.floor(Math.random() * syllables.length)];
        await update(ref(db, `parties/${partyCode}/gameData`), {
            syllable: randomSyl,
            timer: 15
        });
        // Clear any old actions left in the database
        await remove(ref(db, `parties/${partyCode}/action`));
    }, 1200);
}

function listenToGame() {
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        
        // Update turn UI
        get(ref(db, `parties/${partyCode}/playersData/${data.turn}`)).then(s => {
            if(s.exists()){
                const p = s.val();
                const info = document.getElementById("turn-info");
                info.innerText = p.name.toUpperCase() + "'S TURN";
                info.style.color = p.color;
            }
        });

        if (data.status === "finished") {
            gameActive = false;
            document.getElementById("syllable").innerText = "GAME OVER";
            if (isHost) document.getElementById("resetBtn").style.display = "block";
        }
    });

    // Listen for Player Stats (Hearts)
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
                <div class="mini-avatar" style="background:${p.color}">${p.name.charAt(0).toUpperCase()}</div>
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

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists() || !gameActive) return;
        const action = snap.val();

        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        const gameData = gSnap.val();
        
        // 1. Verify it's the right player's turn
        // 2. Verify there is an active syllable to match
        if (action.uid === gameData.turn && gameData.syllable.length > 0 && gameData.syllable !== "Choosing...") {
            const word = action.word.toUpperCase().trim();
            const syl = gameData.syllable.toUpperCase();

            if (word.includes(syl) && word.length >= 3) {
                console.log("✅ Valid Word:", word);
                
                // Clear action so it doesn't trigger twice
                await remove(ref(db, `parties/${partyCode}/action`));
                
                // Switch turns
                updateTurn(players.indexOf(action.uid) + 1);
            } else {
                console.warn("❌ Invalid Word Attempt:", word);
                // Clear action so player can try again
                await remove(ref(db, `parties/${partyCode}/action`));
            }
        }
    });
}

// Timer Loop (Host Only)
setInterval(async () => {
    if (isHost && gameActive) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if (snap.exists()) {
            let d = snap.val();
            // Only count down if a syllable is actually on screen
            if (d.syllable !== "Choosing..." && d.syllable !== "READY?" && d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } 
            else if (d.timer <= 0 && d.status === "playing") {
                // Time's up!
                const pRef = ref(db, `parties/${partyCode}/playersData/${d.turn}`);
                const pSnap = await get(pRef);
                if (pSnap.exists()) {
                    await update(pRef, { lives: pSnap.val().lives - 1 });
                    updateTurn(players.indexOf(d.turn) + 1);
                }
            }
        }
    }
}, 1000);

async function checkWinner(playersData) {
    const alivePlayers = Object.keys(playersData).filter(uid => playersData[uid].lives > 0);
    // If only 1 player left (and there were at least 2 to start)
    if (alivePlayers.length <= 1 && gameActive && players.length > 1) {
        gameActive = false;
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