import { getDatabase, ref, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. YOUR EXACT ACHIEVEMENTS
export const ACHIEVEMENT_LIB = {
    WELCOME_JOIN:   { name: "First Steps", icon: "🎟️", desc: "Joined the Arena" },
    APPLE_10:       { name: "Hungry Snake", icon: "🍎", desc: "Collected 10 Apples" },
    GOLD_APPLE:     { name: "Midas Touch", icon: "✨", desc: "Found a Golden Apple" },
    WORD_BOMB_10:   { name: "Word Master", icon: "💣", desc: "Survived 10 Rounds" }
};

// 2. CSS INJECTION (The Minecraft Vibe)
const style = document.createElement('style');
style.textContent = `
    #ach-popup {
        position: fixed; top: -120px; right: 20px;
        background: #212121; border: 4px solid #000;
        padding: 12px 24px; display: flex; align-items: center; gap: 16px;
        font-family: 'Courier New', Courier, monospace; z-index: 10000;
        transition: 0.6s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        box-shadow: 0 10px 20px rgba(0,0,0,0.5); pointer-events: none;
    }
    #ach-popup.show { top: 20px; }
    .ach-icon { font-size: 32px; }
    .ach-title { color: #ffff55; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
    .ach-name { color: #ffffff; font-size: 18px; font-weight: bold; }
`;
document.head.appendChild(style);

// 3. THE LOGIC (Saves to Firebase + Shows Popup)
export async function unlockAchievement(uid, achId) {
    const ach = ACHIEVEMENT_LIB[achId];
    if (!ach || !uid) return;

    const db = getDatabase();
    const achRef = ref(db, `users/${uid}/Achievements/${achId}`);

    // Check if already unlocked to prevent spamming
    const snapshot = await get(achRef);
    if (!snapshot.exists()) {
        // 1. Save to Firebase folder: users/UID/Achievements/ID: true
        await update(ref(db, `users/${uid}/Achievements`), {
            [achId]: true
        });

        // 2. Show the visual popup
        showPopup(ach);
        console.log(`🏆 Achievement Unlocked: ${ach.name}`);
    }
}

function showPopup(ach) {
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

    popup.classList.add('show');
    setTimeout(() => popup.classList.remove('show'), 5000);
}