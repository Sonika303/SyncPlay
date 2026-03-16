import { getDatabase, ref, update, get, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

export const ACHIEVEMENT_LIB = {
    WELCOME_JOIN:   { name: "First Steps", icon: "🎟️", desc: "Joined the Arena" },
    APPLE_10:       { name: "Hungry Snake", icon: "🍎", desc: "Collected 10 Apples" },
    GOLD_APPLE:     { name: "Midas Touch", icon: "✨", desc: "Found a Golden Apple" },
    WORD_BOMB_10:   { name: "Word Master", icon: "💣", desc: "Survived 10 Rounds" }
};

// --- 1. THE LISTENER (Add this part!) ---
// This watches Firebase and triggers showPopup automatically
export function startAchievementListener(uid) {
    if (!uid) return;
    const db = getDatabase();
    const achRef = ref(db, `users/${uid}/Achievements`);

    // We use onValue to watch for ANY changes in the Achievements folder
    onValue(achRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Check if the user just earned any of our library achievements
        Object.keys(ACHIEVEMENT_LIB).forEach(achId => {
            // If the achievement is true in Firebase AND hasn't been shown in this session yet
            if (data[achId] === true && !window[`shown_${achId}`]) {
                showPopup(ACHIEVEMENT_LIB[achId]);
                window[`shown_${achId}`] = true; // Mark as shown so it doesn't spam
            }
        });
    });
}

// --- 2. THE UNLOCKER (To be called from inside games) ---
export async function unlockAchievement(uid, achId) {
    const ach = ACHIEVEMENT_LIB[achId];
    if (!ach || !uid) return;

    try {
        const db = getDatabase();
        const achRef = ref(db, `users/${uid}/Achievements/${achId}`);

        const snapshot = await get(achRef);
        if (!snapshot.exists()) {
            await update(ref(db, `users/${uid}/Achievements`), {
                [achId]: true
            });
            console.log(`🏆 Database Updated: ${ach.name}`);
        }
    } catch (error) {
        console.error("Achievement Error:", error);
    }
}

// --- 3. THE POPUP UI ---
function showPopup(ach) {
    if (!document.getElementById('ach-style')) {
        const style = document.createElement('style');
        style.id = 'ach-style';
        style.textContent = `
            #ach-popup {
                position: fixed !important;
                top: -150px;
                right: 20px;
                background: #212121 !important;
                border: 4px solid #000 !important;
                padding: 12px 24px !important;
                display: flex !important;
                align-items: center !important;
                gap: 16px !important;
                font-family: 'Courier New', Courier, monospace !important;
                z-index: 2147483647 !important;
                transition: 0.6s cubic-bezier(0.18, 0.89, 0.32, 1.28);
                box-shadow: 0 10px 20px rgba(0,0,0,0.5);
                pointer-events: none;
            }
            #ach-popup.show { top: 20px !important; }
            .ach-icon { font-size: 32px !important; }
            .ach-content { display: flex !important; flex-direction: column !important; text-align: left !important; }
            .ach-title { color: #ffff55 !important; font-size: 11px !important; font-weight: bold !important; text-transform: uppercase !important; margin: 0 !important; }
            .ach-name { color: #ffffff !important; font-size: 18px !important; font-weight: bold !important; margin: 0 !important; }
        `;
        document.head.appendChild(style);
    }

    const achSound = new Audio('./Sounds/achievement.mp3');
    achSound.volume = 0.6;
    achSound.play().catch(e => console.warn("Audio blocked: User must click page first."));

    let popup = document.getElementById('ach-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'ach-popup';
        document.body.appendChild(popup);
    }

    popup.innerHTML = `
        <div class="ach-icon">${ach.icon}</div>
        <div class="ach-content">
            <div class="ach-title">Advancement Made!</div>
            <div class="ach-name">${ach.name}</div>
        </div>
    `;

    setTimeout(() => popup.classList.add('show'), 100);
    setTimeout(() => popup.classList.remove('show'), 5000);
}