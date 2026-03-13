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
const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE"];

onAuthStateChanged(auth, async (user) => {
    if (!user || !partyCode) return;
    myUid = user.uid;
    document.getElementById("partyId").innerText = "Party: " + partyCode;

    // 1. Get current players list
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    if(!pSnap.exists()) return;
    
    const playersObj = pSnap.val();
    players = Object.keys(playersObj);

    // 2. Setup Game (Host Only - first person in the list)
    const checkData = await get(ref(db, `parties/${partyCode}/gameData`));
    
    if (myUid === players[0] && !checkData.exists()) {
        console.log("Host detected. Initializing game data...");
        
        let startData = {};
        players.forEach(uid => { 
            startData[uid] = { 
                lives: 3, 
                name: playersObj[uid].name || "Player" 
            }; 
        });

        // Save player lives and initial game state
        await set(ref(db, `parties/${partyCode}/playersData`), startData);
        await set(ref(db, `parties/${partyCode}/gameData`), {
            syllable: "Choosing...",
            timer: 15,
            turn: players[0]
        });

        // Trigger first syllable
        updateTurn(0);
    }

    listenToGame();
    listenForControllerInput();
});

async function updateTurn(playerIndex) {
    if (players.length === 0) return;
    const nextPlayerUid = players[playerIndex % players.length];

    // Show choosing state globally
    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "Choosing...",
        turn: nextPlayerUid,
        timer: 15
    });

    // Short delay for effect before picking a word
    setTimeout(async () => {
        const randomSyllable = syllables[Math.floor(Math.random() * syllables.length)];
        await update(ref(db, `parties/${partyCode}/gameData`), {
            syllable: randomSyllable,
            timer: 15
        });
        // Clear previous word submission
        await remove(ref(db, `parties/${partyCode}/action`));
    }, 1500);
}

function listenToGame() {
    // Sync UI with DB
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if(!snap.exists()) return;
        const data = snap.val();
        
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        
        // Show whose turn it is
        get(ref(db, `parties/${partyCode}/playersData/${data.turn}/name`)).then(s => {
            if(s.exists()) {
                document.getElementById("turn-info").innerText = s.val().toUpperCase() + "'s TURN";
            }
        });
    });

    // Update Hearts UI
    onValue(ref(db, `parties/${partyCode}/playersData`), (snap) => {
        if(!snap.exists()) return;
        const data = snap.val();
        const display = document.getElementById("lives-display");
        display.innerHTML = "";
        
        let aliveCount = 0;
        let winnerName = "";

        Object.keys(data).forEach(uid => {
            const p = data[uid];
            if(p.lives > 0) {
                aliveCount++;
                winnerName = p.name;
            }

            const card = document.createElement("div");
            card.className = `player-card ${p.lives <= 0 ? 'dead' : ''}`;
            card.innerHTML = `
                <span class="player-name">${p.name}</span>
                <span class="hearts">${"❤️".repeat(Math.max(0, p.lives))}</span>
            `;
            display.appendChild(card);
        });

        // Win check
        if (aliveCount === 1 && players.length > 1) {
            alert("GAME OVER! " + winnerName + " WINS!");
            window.location.href = "../../host.html";
        }
    });
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists()) return;
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        if(!gSnap.exists()) return;
        
        const gameData = gSnap.val();

        // Check word
        if (action.uid === gameData.turn && gameData.syllable !== "Choosing...") {
            const word = action.word.toUpperCase();
            if (word.includes(gameData.syllable)) {
                findNextPlayer(action.uid);
            }
        }
    });
}

async function findNextPlayer(currentUid) {
    const snap = await get(ref(db, `parties/${partyCode}/playersData`));
    if(!snap.exists()) return;
    const data = snap.val();
    
    let idx = players.indexOf(currentUid);
    
    for(let i = 1; i <= players.length; i++) {
        let nextIdx = (idx + i) % players.length;
        let nextUid = players[nextIdx];
        if(data[nextUid] && data[nextUid].lives > 0) {
            updateTurn(nextIdx);
            return;
        }
    }
}

// Host Timer Logic
setInterval(async () => {
    if (players.length > 0 && myUid === players[0]) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if(!snap.exists()) return;
        let data = snap.val();

        if (data.syllable !== "Choosing..." && data.timer > 0) {
            update(ref(db, `parties/${partyCode}/gameData`), { timer: data.timer - 1 });
        } else if (data.syllable !== "Choosing..." && data.timer <= 0) {
            // BOOM
            const pSnap = await get(ref(db, `parties/${partyCode}/playersData/${data.turn}`));
            if(pSnap.exists()) {
                let lives = pSnap.val().lives - 1;
                await update(ref(db, `parties/${partyCode}/playersData/${data.turn}`), { lives: lives });
                findNextPlayer(data.turn);
            }
        }
    }
}, 1000);