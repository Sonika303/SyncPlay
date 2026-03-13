import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// !!! USE YOUR EXACT CONFIG FROM INDEX.HTML HERE !!!
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
    
    // Get player list
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    players = Object.keys(pSnap.val());
    
    // If I am the host (first in list), I start the first turn
    if (myUid === players[0]) {
        updateTurn(0);
    }
    
    listenToGame();
});

function updateTurn(playerIndex) {
    const randomSyllable = syllables[Math.floor(Math.random() * syllables.length)];
    update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: randomSyllable,
        turn: players[playerIndex],
        timer: 10
    });
}

function listenToGame() {
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if(!snap.exists()) return;
        const data = snap.val();
        
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        
        const isMyTurn = (data.turn === myUid);
        document.getElementById("input").disabled = !isMyTurn;
        document.getElementById("turn-info").innerText = isMyTurn ? "YOUR TURN!" : "Wait...";
        if(isMyTurn) document.getElementById("input").focus();
    });
}

// Handle word submission
document.getElementById("input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        const word = e.target.value.toUpperCase();
        const currentSyllable = document.getElementById("syllable").innerText;
        
        if (word.includes(currentSyllable)) {
            e.target.value = "";
            let nextIdx = (players.indexOf(myUid) + 1) % players.length;
            updateTurn(nextIdx);
        } else {
            alert("Must contain " + currentSyllable);
        }
    }
});

// The Host handles the timer countdown
setInterval(async () => {
    if (players[0] === myUid) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData/timer`));
        let time = snap.val();
        if (time > 0) {
            update(ref(db, `parties/${partyCode}/gameData`), { timer: time - 1 });
        } else {
            // Exploded! Move to next player
            const turnSnap = await get(ref(db, `parties/${partyCode}/gameData/turn`));
            let currentIdx = players.indexOf(turnSnap.val());
            updateTurn((currentIdx + 1) % players.length);
        }
    }
}, 1000);
