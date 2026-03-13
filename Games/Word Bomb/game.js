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

    // Listen for players
    onValue(ref(db, `parties/${partyCode}/players`), async (snap) => {
        if (!snap.exists()) return;
        players = Object.keys(snap.val());
        console.log("Current Players:", players);

        // First player is host
        if (myUid === players[0] && !isHost) {
            isHost = true;
            console.log("👑 You are the Host. Initializing...");
            
            // Initial setup
            const playersObj = snap.val();
            let startData = {};
            players.forEach(uid => { 
                startData[uid] = { lives: 3, name: playersObj[uid].name || "Player" }; 
            });

            await set(ref(db, `parties/${partyCode}/playersData`), startData);
            await set(ref(db, `parties/${partyCode}/gameData`), {
                syllable: "Choosing...",
                timer: 15,
                turn: players[0]
            });

            updateTurn(0);
        }
    });

    listenToGame();
    listenForControllerInput();
});

async function updateTurn(idx) {
    const nextUid = players[idx % players.length];
    console.log("🔄 Switching turn to:", nextUid);

    await update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: "Choosing...",
        turn: nextUid,
        timer: 15
    });

    setTimeout(async () => {
        const syl = syllables[Math.floor(Math.random() * syllables.length)];
        await update(ref(db, `parties/${partyCode}/gameData`), { syllable: syl, timer: 15 });
        await remove(ref(db, `parties/${partyCode}/action`));
        console.log("✨ Active Syllable:", syl);
    }, 1500);
}

function listenToGame() {
    // UI Update for Syllable/Timer
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        document.getElementById("turn-info").innerText = "PLAYER TURN: " + data.turn.substring(0,5);
    });

    // UI Update for Hearts
    onValue(ref(db, `parties/${partyCode}/playersData`), (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();
        const display = document.getElementById("lives-display");
        display.innerHTML = "";
        
        Object.keys(data).forEach(uid => {
            const p = data[uid];
            const card = document.createElement("div");
            card.className = `player-card ${p.lives <= 0 ? 'dead' : ''}`;
            card.innerHTML = `<span class="player-name">${p.name}</span><br><span class="hearts">${"❤️".repeat(Math.max(0, p.lives))}</span>`;
            display.appendChild(card);
        });
    });
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists()) return;
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        const gameData = gSnap.val();

        if (action.uid === gameData.turn && gameData.syllable !== "Choosing...") {
            if (action.word.toUpperCase().includes(gameData.syllable)) {
                console.log("🎯 Correct Word!");
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

setInterval(async () => {
    if (isHost) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if (snap.exists()) {
            let d = snap.val();
            if (d.syllable !== "Choosing..." && d.timer > 0) {
                update(ref(db, `parties/${partyCode}/gameData`), { timer: d.timer - 1 });
            } else if (d.syllable !== "Choosing..." && d.timer <= 0) {
                console.log("⏰ BOOM!");
                const pRef = ref(db, `parties/${partyCode}/playersData/${d.turn}`);
                const pSnap = await get(pRef);
                await update(pRef, { lives: pSnap.val().lives - 1 });
                findNextPlayer(d.turn);
            }
        }
    }
}, 1000);