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

console.log("🔥 Script Loaded and Running");

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const urlParams = new URLSearchParams(window.location.search);
const partyCode = urlParams.get('code');

let players = []; 
let myUid;
let isHost = false;
const syllables = ["ION", "ENT", "TER", "ING", "PRO", "STA", "CON", "ATE"];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.error("❌ No user logged in");
        return;
    }
    if (!partyCode) {
        console.error("❌ No party code found in URL");
        return;
    }

    myUid = user.uid;
    console.log("✅ Authenticated as:", myUid);
    document.getElementById("partyId").innerText = "Party: " + partyCode;

    // 1. WATCH PLAYERS
    onValue(ref(db, `parties/${partyCode}/players`), async (snap) => {
        if (!snap.exists()) return;
        
        const playersObj = snap.val();
        players = Object.keys(playersObj);
        console.log("Current Players:", players);

        // 2. FORCE START LOGIC
        // If gameData doesn't exist, the first person to see this screen initializes it
        const gameDataSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        
        if (!gameDataSnap.exists() && !isHost) {
            isHost = true; 
            console.log("👑 Host Management active for this session.");
            
            let startData = {};
            players.forEach(uid => { 
                startData[uid] = { 
                    lives: 3, 
                    name: playersObj[uid].name || "Player" 
                }; 
            });

            // Set lives and initial turn
            await set(ref(db, `parties/${partyCode}/playersData`), startData);
            await set(ref(db, `parties/${partyCode}/gameData`), {
                syllable: "Choosing...",
                timer: 15,
                turn: players[0]
            });

            // Trigger the syllable shuffle
            updateTurn(0);
        } else if (myUid === players[0]) {
            // Backup host check
            isHost = true;
        }
    });

    listenToGame();
    listenForControllerInput();
});

async function updateTurn(idx) {
    if (players.length === 0) return;
    const nextUid = players[idx % players.length];
    console.log("🔄 Switching turn to:", nextUid);

    // Set UI to choosing state
    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "Choosing...",
        turn: nextUid,
        timer: 15
    });

    // Short delay for the "Choosing..." effect
    setTimeout(async () => {
        const randomSyl = syllables[Math.floor(Math.random() * syllables.length)];
        console.log("✨ Active Syllable:", randomSyl);
        
        await update(ref(db, `parties/${partyCode}/gameData`), {
            syllable: randomSyl,
            timer: 15
        });
        
        // Clear old inputs
        await remove(ref(db, `parties/${partyCode}/action`));
    }, 1500);
}

function listenToGame() {
    // Sync Timer and Syllable
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        
        // Fetch current player name
        get(ref(db, `parties/${partyCode}/playersData/${data.turn}/name`)).then(s => {
            const turnName = s.exists() ? s.val() : "Wait...";
            document.getElementById("turn-info").innerText = turnName.toUpperCase() + "'s TURN";
        });
    });

    // Sync Lives/Hearts Display
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
                <span class="player-name">${p.name}</span><br>
                <span class="hearts">${"❤️".repeat(Math.max(0, p.lives))}</span>
            `;
            display.appendChild(card);
        });
    });
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists()) return;
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        if(!gSnap.exists()) return;
        
        const gameData = gSnap.val();

        // If correct player types correct word
        if (action.uid === gameData.turn && gameData.syllable !== "Choosing...") {
            const word = action.word.toUpperCase();
            if (word.includes(gameData.syllable)) {
                console.log("🎯 Correct Word! Moving to next player.");
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
    // Loop through players to find someone with lives left
    for (let i = 1; i <= players.length; i++) {
        let nIdx = (idx + i) % players.length;
        if (data[players[nIdx]].lives > 0) {
            updateTurn(nIdx);
            return;
        }
    }
}

// Timer Logic (Runs only on Host machine)
setInterval(async () => {
    if (isHost) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if (snap.exists()) {
            let d = snap.val();
            // Count down if a syllable is active
            if (d.syllable !== "Choosing..." && d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } 
            // Boom if timer hits zero
            else if (d.syllable !== "Choosing..." && d.timer <= 0) {
                console.log("💥 BOOM! Player lost a life.");
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