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
    
    const pSnap = await get(ref(db, `parties/${partyCode}/players`));
    players = Object.keys(pSnap.val());
    
    if (myUid === players[0]) {
        updateTurn(0);
    }
    
    listenToGame();
    listenForControllerInput(); // Added this to listen for phone input
});

function updateTurn(playerIndex) {
    const randomSyllable = syllables[Math.floor(Math.random() * syllables.length)];
    update(ref(db, `parties/${partyCode}/gameData`), {
        syllable: randomSyllable,
        turn: players[playerIndex],
        timer: 10
    });
    // Clear previous action so it doesn't trigger twice
    remove(ref(db, `parties/${partyCode}/action`));
}

function listenToGame() {
    onValue(ref(db, `parties/${partyCode}/gameData`), (snap) => {
        if(!snap.exists()) return;
        const data = snap.val();
        
        document.getElementById("syllable").innerText = data.syllable;
        document.getElementById("timer").innerText = data.timer;
        
        // Find the player's name whose turn it is
        get(ref(db, `parties/${partyCode}/players/${data.turn}/name`)).then((nameSnap) => {
            let name = nameSnap.val() || "Player";
            document.getElementById("turn-info").innerText = `${name}'s TURN`;
        });
    });
}

// THIS REPLACES THE KEYBOARD INPUT LOGIC
function listenForControllerInput() {
    onValue(ref(db, `parties/${partyCode}/action`), async (snap) => {
        if (!snap.exists()) return;
        
        const action = snap.val();
        const gameDataSnap = await get(ref(db, `parties/${partyCode}/gameData`));
        const gameData = gameDataSnap.val();

        // 1. Check if the word came from the player whose turn it actually is
        if (action.uid === gameData.turn) {
            const word = action.word.toUpperCase();
            const currentSyllable = gameData.syllable;

            // 2. Validate the word
            if (word.includes(currentSyllable)) {
                console.log("Correct word from controller!");
                let nextIdx = (players.indexOf(action.uid) + 1) % players.length;
                updateTurn(nextIdx);
            } else {
                console.log("Wrong word from controller!");
            }
        }
    });
}

setInterval(async () => {
    if (players[0] === myUid) {
        const snap = await get(ref(db, `parties/${partyCode}/gameData/timer`));
        let time = snap.val();
        if (time > 0) {
            update(ref(db, `parties/${partyCode}/gameData`), { timer: time - 1 });
        } else {
            const turnSnap = await get(ref(db, `parties/${partyCode}/gameData/turn`));
            let currentIdx = players.indexOf(turnSnap.val());
            updateTurn((currentIdx + 1) % players.length);
        }
    }
}, 1000);