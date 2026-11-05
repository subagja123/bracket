import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 1. Konfigurasi Database Firebase Realtime
const firebaseConfig = {
  databaseURL: "https://arena-bracket-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const stateRef = ref(db, "tournament_state");

const ADMIN_USER = "LPPM";
const ADMIN_PASS = "2528";

let isAdmin = false;
let state = {
  content: {
    title: "Arena Brackets",
    subtitle: "Live tournament display",
    description: "Follow matchups, results, and standings in real time."
  },
  teams: [],
  tournament: { mode: "single", groupCount: 2, generatedAt: null },
  bracket: null
};

// ==========================================
// 2. LOGIKA GENERASI BABAK LENGKAP & ALUR PEMENANG
// ==========================================

function seedSingleElimination(teams) {
  const count = teams.length;
  if (count < 2) return null;

  // Hitung jumlah babak yang dibutuhkan (2^n)
  let totalRounds = Math.ceil(Math.log2(count));
  let bracketSize = Math.pow(2, totalRounds);
  
  let rounds = [];
  let currentMatchesCount = bracketSize / 2;

  // Buat Struktur Babak dari Babak 1 sampai Final
  for (let r = 0; r < totalRounds; r++) {
    let matches = [];
    for (let m = 0; m < currentMatchesCount; m++) {
      matches.push({
        id: `r${r + 1}_m${m + 1}`,
        t1: r === 0 ? (teams[m * 2]?.id || null) : null,
        t2: r === 0 ? (teams[m * 2 + 1]?.id || null) : null,
        score1: 0,
        score2: 0,
        winner: null
      });
    }
    rounds.push({ id: `r${r + 1}`, matches });
    currentMatchesCount /= 2;
  }

  return { type: "single", rounds };
}

function updateBracketProgression(bracket) {
  if (!bracket || !bracket.rounds) return;

  for (let r = 0; r < bracket.rounds.length - 1; r++) {
    const currentRound = bracket.rounds[r];
    const nextRound = bracket.rounds[r + 1];

    currentRound.matches.forEach((m, idx) => {
      if (m.winner) {
        const nextMatchIdx = Math.floor(idx / 2);
        const isFirstSlot = idx % 2 === 0;

        if (isFirstSlot) {
          nextRound.matches[nextMatchIdx].t1 = m.winner;
        } else {
          nextRound.matches[nextMatchIdx].t2 = m.winner;
        }
      }
    });
  }
}

// ==========================================
// 3. REALTIME FIREBASE SYNC
// ==========================================
onValue(stateRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    state = { ...state, ...data };
  } else {
    set(stateRef, state);
  }
  render();
});

// ==========================================
// 4. DOM ELEMENTS & LISTENERS
// ==========================================
const formLogin = document.getElementById("form-login");
const btnLoginModal = document.getElementById("btn-login-modal");
const btnLogout = document.getElementById("btn-logout");
const modalLogin = document.getElementById("modal-login");
const btnCloseModal = document.getElementById("btn-close-modal");
const adminPanel = document.getElementById("admin-panel");

const contentTitle = document.getElementById("content-title");
const contentSubtitle = document.getElementById("content-subtitle");
const contentDescription = document.getElementById("content-description");

const inputTitle = document.getElementById("input-title");
const inputSubtitle = document.getElementById("input-subtitle");
const inputDescription = document.getElementById("input-description");
const btnSaveContent = document.getElementById("btn-save-content");

const inputTeams = document.getElementById("input-teams");
const btnSaveTeams = document.getElementById("btn-save-teams");

const selectMode = document.getElementById("select-mode");
const btnGenerateBracket = document.getElementById("btn-generate-bracket");
const bracketContainer = document.getElementById("bracket-container");

if (btnLoginModal) {
  btnLoginModal.addEventListener("click", (e) => {
    e.preventDefault();
    if (modalLogin) modalLogin.classList.remove("hidden");
  });
}

if (btnCloseModal) {
  btnCloseModal.addEventListener("click", (e) => {
    e.preventDefault();
    if (modalLogin) modalLogin.classList.add("hidden");
  });
}

if (formLogin) {
  formLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("login-username").value.trim();
    const pass = document.getElementById("login-password").value.trim();

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      isAdmin = true;
      if (modalLogin) modalLogin.classList.add("hidden");
      render();
    } else {
      alert("Username atau Password Salah!");
    }
  });
}

if (btnLogout) {
  btnLogout.addEventListener("click", (e) => {
    e.preventDefault();
    isAdmin = false;
    render();
  });
}

function saveState() {
  set(stateRef, state);
}

if (btnSaveContent) {
  btnSaveContent.addEventListener("click", (e) => {
    e.preventDefault();
    state.content = {
      title: inputTitle.value.trim(),
      subtitle: inputSubtitle.value.trim(),
      description: inputDescription.value.trim()
    };
    saveState();
  });
}

if (btnSaveTeams) {
  btnSaveTeams.addEventListener("click", (e) => {
    e.preventDefault();
    const raw = inputTeams.value;
    const names = raw.split(/\r?\n|,/).map(n => n.trim()).filter(Boolean);
    const unique = [...new Set(names)];
    if (unique.length < 2) return alert("Masukkan minimal 2 tim");

    state.teams = unique.map((name, i) => ({ id: `t${i + 1}`, name }));
    state.bracket = null;
    saveState();
  });
}

if (btnGenerateBracket) {
  btnGenerateBracket.addEventListener("click", (e) => {
    e.preventDefault();
    if (!state.teams || state.teams.length < 2) return alert("Tambahkan minimal 2 tim terlebih dahulu");
    state.bracket = seedSingleElimination(state.teams);
    saveState();
  });
}

// ==========================================
// 5. RENDER UI BRACKET BESERTA EDIT SKOR
// ==========================================
function render() {
  if (contentTitle) contentTitle.textContent = state.content.title;
  if (contentSubtitle) contentSubtitle.textContent = state.content.subtitle;
  if (contentDescription) contentDescription.textContent = state.content.description;

  if (isAdmin) {
    if (adminPanel) adminPanel.classList.remove("hidden");
    if (btnLoginModal) btnLoginModal.classList.add("hidden");
    if (btnLogout) btnLogout.classList.remove("hidden");
  } else {
    if (adminPanel) adminPanel.classList.add("hidden");
    if (btnLoginModal) btnLoginModal.classList.remove("hidden");
    if (btnLogout) btnLogout.classList.add("hidden");
  }

  renderBracket();
}

function renderBracket() {
  if (!bracketContainer) return;

  if (!state.bracket || !state.bracket.rounds) {
    bracketContainer.innerHTML = `<p class="lede">Belum ada bagan turnamen yang dibuat.</p>`;
    return;
  }

  const teamsById = Object.fromEntries(state.teams.map(t => [t.id, t]));
  let html = `<div class="bracket-root"><div class="rounds">`;

  state.bracket.rounds.forEach((round, rIndex) => {
    const isFinal = rIndex === state.bracket.rounds.length - 1;
    const roundTitle = isFinal ? "Final" : `Babak ${rIndex + 1}`;

    html += `<div class="round"><h3>${roundTitle}</h3>`;
    round.matches.forEach((m) => {
      const t1 = teamsById[m.t1] || { name: m.t1 ? m.t1 : "TBD" };
      const t2 = teamsById[m.t2] || { name: m.t2 ? m.t2 : "TBD" };
      const isPickable = isAdmin ? 'pickable' : '';

      html += `
        <div class="match">
          <div class="match-team ${m.winner === m.t1 ? 'winner' : ''} ${isPickable}" onclick="window.setMatchWinner('${m.id}', '${m.t1}')">
            <span>${t1.name}</span>
            ${isAdmin ? `<input type="number" class="match-score-input" value="${m.score1 || 0}" onclick="event.stopPropagation()" onchange="window.updateScore('${m.id}', 1, this.value)">` : `<span>${m.score1 || 0}</span>`}
          </div>
          <div class="match-team ${m.winner === m.t2 ? 'winner' : ''} ${isPickable}" onclick="window.setMatchWinner('${m.id}', '${m.t2}')">
            <span>${t2.name}</span>
            ${isAdmin ? `<input type="number" class="match-score-input" value="${m.score2 || 0}" onclick="event.stopPropagation()" onchange="window.updateScore('${m.id}', 2, this.value)">` : `<span>${m.score2 || 0}</span>`}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  });

  html += `</div></div>`;
  bracketContainer.innerHTML = html;
}

// Global Handlers
window.setMatchWinner = function(matchId, winnerId) {
  if (!isAdmin || !winnerId || winnerId === "TBD") return;
  state.bracket.rounds.forEach(r => {
    r.matches.forEach(m => {
      if (m.id === matchId) m.winner = winnerId;
    });
  });
  updateBracketProgression(state.bracket);
  saveState();
};

window.updateScore = function(matchId, teamNum, scoreVal) {
  if (!isAdmin) return;
  const val = parseInt(scoreVal) || 0;
  state.bracket.rounds.forEach(r => {
    r.matches.forEach(m => {
      if (m.id === matchId) {
        if (teamNum === 1) m.score1 = val;
        if (teamNum === 2) m.score2 = val;

        // Otomatis tentukan pemenang dari skor tertinggi
        if (m.score1 > m.score2 && m.t1) m.winner = m.t1;
        else if (m.score2 > m.score1 && m.t2) m.winner = m.t2;
      }
    });
  });
  updateBracketProgression(state.bracket);
  saveState();
};