// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyB5DEX0fuSjTud04-mR__GDpiu1-vk9SIY",
    authDomain: "memory-game-66dad.firebaseapp.com",
    databaseURL: "https://memory-game-66dad-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "memory-game-66dad",
    storageBucket: "memory-game-66dad.firebasestorage.app",
    messagingSenderId: "94001818458",
    appId: "1:94001818458:web:95184599a49e78d286e163"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

const icons = ['🍎','🍌','🍇','🍒','🍉','🥝','🍍','🥥'];
let user = ""; // This will hold the nickname
let roomCode = "";
let isHost = false;
let dbRef = null;

// --- AUTH LOGIC ---
let isLoginMode = false;

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    getEl("auth-title").innerText = isLoginMode ? "Login" : "Create Account";
    getEl("authBtn").innerText = isLoginMode ? "Login" : "Sign Up";
    getEl("authNick").classList.toggle("hidden", isLoginMode);
    getEl("toggle-link").innerText = isLoginMode ? "Sign Up" : "Login";
}

async function handleAuth() {
    const email = getEl("authEmail").value;
    const pass = getEl("authPass").value;
    const nick = getEl("authNick").value;

    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, pass);
        } else {
            if (!nick) return alert("Please enter a nickname");
            const res = await auth.createUserWithEmailAndPassword(email, pass);
            await res.user.updateProfile({ displayName: nick });
            location.reload(); // Refresh to update user state
        }
    } catch (err) {
        alert(err.message);
    }
}

function logout() {
    auth.signOut().then(() => location.reload());
}

// Listen for User State (The "Brain" of the Auth system)
auth.onAuthStateChanged((firebaseUser) => {
    if (firebaseUser) {
        user = firebaseUser.displayName || "Player";
        getEl("auth-screen").classList.add("hidden");
        getEl("login").classList.remove("hidden");
        getEl("welcomeText").innerText = "Hi, " + user;
    } else {
        getEl("auth-screen").classList.remove("hidden");
        getEl("login").classList.add("hidden");
    }
});

// --- CORE GAME LOGIC ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'match') {
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    } else {
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }
}

function shuffle(array) { return [...array].sort(() => Math.random() - 0.5); }
function getEl(id) { return document.getElementById(id); }

function createRoom(){
    const room = getEl("roomName").value.trim();
    const pass = getEl("roomPass").value.trim();
    if(!room) return alert("Enter room name");

    roomCode = room; isHost = true;
    db.ref("rooms/"+roomCode).set({
        pass: pass, host: user, state: "waiting", winner: "",
        cards: shuffle([...icons, ...icons]),
        players: { [user]: { score: 0 } }
    });
    enterGameScreen();
}

function joinRoom(){
    const room = getEl("roomName").value.trim();
    const pass = getEl("roomPass").value.trim();
    if(!room) return alert("Enter room name");

    roomCode = room; isHost = false;
    db.ref("rooms/"+roomCode).once("value", s => {
        if(!s.exists()) return alert("No room found");
        if(s.val().pass !== pass) return alert("Wrong password");
        db.ref("rooms/"+roomCode+"/players/"+user).update({ score: 0 });
        enterGameScreen();
    });
}

function enterGameScreen() {
    getEl("login").classList.add("hidden");
    getEl("game").classList.remove("hidden");
    getEl("roomTitle").innerText = "Room: " + roomCode;
    getEl("lobbyRoomName").innerText = roomCode;
    dbRef = db.ref("rooms/"+roomCode);

    dbRef.on("value", snapshot => {
        const data = snapshot.val();
        if(!data) return;

        const players = data.players || {};
        const pNames = Object.keys(players);

        if (isHost && data.state === "waiting" && pNames.length === 2) {
            dbRef.update({ state: "playing" });
        }

        if (JSON.stringify(data.cards) !== lastCardsString) {
            lastCardsString = JSON.stringify(data.cards);
            setupLocalBoard(data.cards);
        }

        if (data.state === "waiting") {
            getEl("lobby").classList.remove("hidden");
            getEl("gameArea").classList.add("hidden");
            getEl("endScreen").classList.add("hidden");
        } else if (data.state === "playing") {
            getEl("lobby").classList.add("hidden");
            getEl("gameArea").classList.remove("hidden");
            getEl("endScreen").classList.add("hidden");
            if(!timerInterval) startTimer();
        } else if (data.state === "ended") {
            stopTimer();
            showEndScreen(data.winner);
        }
        updateScoresUI(players);
        renderChat(data.chat || {});
    });
}

// (Remaining game logic remains similar to your original script)
let lastCardsString = "";
let localMatched = [];
let firstCard = null;
let isLocked = false;
let myScore = 0;
let timerInterval = null;
let seconds = 0;

function setupLocalBoard(cardIcons) {
    localMatched = []; firstCard = null; isLocked = false; myScore = 0;
    const grid = getEl("grid"); grid.innerHTML = "";
    cardIcons.forEach((icon, index) => {
        const card = document.createElement("div");
        card.className = "card";
        card.onclick = () => handleCardClick(card, icon, index);
        grid.appendChild(card);
    });
}

function handleCardClick(cardDiv, icon, index) {
    if (isLocked || localMatched.includes(index) || cardDiv.classList.contains("flipped")) return;
    cardDiv.classList.add("flipped");
    cardDiv.innerText = icon;

    if (!firstCard) {
        firstCard = { index, icon, el: cardDiv };
    } else {
        isLocked = true;
        if (firstCard.icon === icon) {
            playSound('match');
            localMatched.push(firstCard.index, index);
            cardDiv.classList.add("matched"); firstCard.el.classList.add("matched");
            myScore++;
            dbRef.child("players/"+user).update({ score: myScore });
            if (myScore === 8) dbRef.update({ state: "ended", winner: user });
            firstCard = null; isLocked = false;
        } else {
            setTimeout(() => {
                playSound('error');
                cardDiv.classList.remove("flipped"); cardDiv.innerText = "";
                firstCard.el.classList.remove("flipped"); firstCard.el.innerText = "";
                firstCard = null; isLocked = false;
            }, 700);
        }
    }
}

function startTimer() {
    seconds = 0; clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        const m = Math.floor(seconds/60).toString().padStart(2,'0');
        const s = (seconds%60).toString().padStart(2,'0');
        getEl("timer").innerText = `${m}:${s}`;
    }, 1000);
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

function updateScoresUI(players) {
    Object.entries(players).forEach(([pName, pData]) => {
        if(pName === user) getEl("myScoreEl").innerText = `You: ${pData.score}`;
        else getEl("opScoreEl").innerText = `${pName}: ${pData.score}`;
    });
}

function showEndScreen(winner) {
    getEl("endScreen").classList.remove("hidden");
    getEl("endTitle").innerText = winner === user ? "Victory! 🏆" : "Defeat 💀";
    getEl("endTitle").className = "result-title " + (winner === user ? "won" : "lost");
    getEl("endMessage").innerText = winner === user ? "You found all pairs!" : winner + " was faster.";
    if(isHost) getEl("hostControls").classList.remove("hidden");
    else getEl("waitControls").classList.remove("hidden");
}

function restartGame() {
    if(!isHost) return;
    const newCards = shuffle([...icons, ...icons]);
    dbRef.child("players").once("value", s => {
        let updates = {};
        s.forEach(p => { updates[p.key + "/score"] = 0; });
        dbRef.child("players").update(updates);
    });
    dbRef.update({ cards: newCards, state: "playing", winner: "", chat: {} });
}

function closeRoom() { if(confirm("Close room?")) { dbRef.remove(); location.reload(); } }
function copyCode() { navigator.clipboard.writeText(roomCode); alert("Copied!"); }
function renderChat(c) { 
    const b = getEl("chat"); b.innerHTML = ""; 
    Object.values(c).forEach(m => { const d = document.createElement("div"); d.innerText = m; b.appendChild(d); });
    b.scrollTop = b.scrollHeight;
}
function sendChat(e) { 
    if(e.key === "Enter" && e.target.value.trim()) { 
        dbRef.child("chat").push(user + ": " + e.target.value); 
        e.target.value = ""; 
    } 
}