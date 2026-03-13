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
    if (!user) return;
    myUid = user.uid;
    document.getElementById("partyId").innerText = "Party: " + partyCode;

    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    if(!pSnap.exists()) return;
    const playersObj = pSnap.val();
    players = Object.keys(playersObj);

    // HOST ONLY: Setup Lives
    if (myUid === players[0]) {
        let startData = {};
        players.forEach(uid => { 
            startData[uid] = { 
                lives: 3, 
                name: playersObj[uid].name || "Player" 
            }; 
        });
        await set(ref(db, `parties/${partyCode}/playersData`), startData);
        updateTurn(0);
    }

    listenToGame();
    listenForControllerInput();
});

async function updateTurn(playerIndex) {
    document.getElementById("syllable").innerText = "Choosing...";
    
    setTimeout(async () => {
        const randomSyllable = syllables[Math.floor(Math.random() * syllables.length)];
        await update(ref(db, `parties/${partyCode}/gameData`), {
            syllable: randomSyllable,
            turn: players[playerIndex],
            timer: 15
        });
        remove(ref(db, `parties/${partyCode}/action`));
    }, 1200);
}

function listenToGame() {
    // Listen for Syllable & Turn
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if(!snap.exists()) return;
        const data = snap.val();
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        
        get(ref(db, `parties/${partyCode}/playersData/${data.turn}/name`)).then(s => {
            document.getElementById("turn-info").innerText = (s.val() || "Player") + "'s TURN";
        });
    });

    // Listen for Lives UI
    onValue(ref(db, `parties/${partyCode}/playersData`), (snap) => {
        if(!snap.exists()) return;
        const data = snap.val();
        const display = document.getElementById("lives-display");
        display.innerHTML = "";
        
        let alivePlayers = [];
        Object.keys(data).forEach(uid => {
            if(data[uid].lives > 0) alivePlayers.push(uid);

            const card = document.createElement("div");
            card.className = `player-card ${data[uid].lives <= 0 ? 'dead' : ''}`;
            card.innerHTML = `
                <span class="player-name">${data[uid].name}</span>
                <span class="hearts">${"❤️".repeat(data[uid].lives)}</span>
            `;
            display.appendChild(card);
        });

        if (alivePlayers.length === 1 && players.length > 1) {
            alert(data[alivePlayers[0]].name + " WINS!");
            window.location.href = "../../host.html";
        }
    });
}

function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists()) return;
        const action = snap.val();
        const gSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        const gameData = gSnap.val();

        if (action.uid === gameData.turn) {
            if (action.word.toUpperCase().includes(gameData.syllable)) {
                findNextPlayer(action.uid);
            }
        }
    });
}

async function findNextPlayer(currentUid) {
    const snap = await get(ref(db, `parties/${partyCode}/playersData`));
    const data = snap.val();
    let idx = players.indexOf(currentUid);
    
    for(let i=1; i<=players.length; i++) {
        let nextIdx = (idx + i) % players.length;
        if(data[players[nextIdx]] && data[players[nextIdx]].lives > 0) {
            updateTurn(nextIdx);
            return;
        }
    }
}

// Timer Logic
setInterval(async () => {
    if (players.length > 0 && players[0] === myUid) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData`));
        if(!snap.exists()) return;
        let data = snap.val();

        if (data.timer > 0) {
            update(ref(db, `parties/${partyCode}/gameData`), { timer: data.timer - 1 });
        } else {
            const pDataSnap = await get(ref(db, `parties/${partyCode}/playersData/${data.turn}`));
            if(pDataSnap.exists()) {
                let currentLives = pDataSnap.val().lives;
                await update(ref(db, `parties/${partyCode}/playersData/${data.turn}`), { lives: currentLives - 1 });
            }
            findNextPlayer(data.turn);
        }
    }
}, 1000);