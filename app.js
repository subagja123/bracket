(function () {
  // --- KONFIGURASI FIREBASE ANDA ---
  const firebaseConfig = {
    apiKey: "AIzaSyALNq5dshCwnV0smKZoF4PRMqUjw6zqHTg",
    authDomain: "arena-bracket.firebaseapp.com",
    databaseURL: "https://arena-bracket-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "arena-bracket",
    storageBucket: "arena-bracket.firebasestorage.app",
    messagingSenderId: "215659276959",
    appId: "1:215659276959:web:2045b52d31850e0e4950aa",
    measurementId: "G-WE4ZG1P621"
  };

  // Inisialisasi Firebase & Realtime Database
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.database();
  const tournamentRef = db.ref("tournamentState");

  const SESSION_KEY = "arena-brackets-admin";
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "admin123";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      return Object.assign(structuredClone(defaultState), JSON.parse(raw));
    } catch (err) {
      return structuredClone(defaultState);
    }
  }

function saveState() {
  tournamentRef.set(state.data).catch(function (error) {
    showToast("Gagal menyimpan ke Firebase: " + error.message, true);
  });
}

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message, isError) {
    const el = $("toast");
    el.textContent = message;
    el.classList.toggle("error", Boolean(isError));
    el.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () {
      el.classList.add("hidden");
    }, 3500);
  }

  function teamName(id) {
    if (!id) return "BYE";
    const team = state.data.teams.find(function (item) {
      return item.id === id;
    });
    return team ? team.name : "TBD";
  }

  function modeLabel(mode) {
    return {
      single: "Single elimination",
      double: "Double elimination",
      groups: "Group stage",
    }[mode] || "No bracket yet";
  }

  function parseTeams(text) {
    const names = text
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
    const unique = [];
    names.forEach(function (name) {
      if (
        !unique.some(function (item) {
          return item.toLowerCase() === name.toLowerCase();
        })
      ) {
        unique.push(name);
      }
    });
    return unique.map(function (name, index) {
      return { id: "t" + (index + 1), name: name };
    });
  }

  function requireAdmin() {
    if (!state.isAdmin) throw new Error("Admin login is required to make changes.");
  }

  function render() {
    const data = state.data;
    const bracket = data.bracket;
    $("title").textContent = data.content.title;
    $("subtitle").textContent = data.content.subtitle;
    $("description").textContent = data.content.description;
    document.title = data.content.title;
    $("modeBadge").textContent = bracket
      ? modeLabel(bracket.type)
      : modeLabel(data.tournament.mode) + " (not generated)";
    $("adminPanel").classList.toggle("hidden", !state.isAdmin);
    $("loginBtn").classList.toggle("hidden", state.isAdmin);
    $("logoutBtn").classList.toggle("hidden", !state.isAdmin);
    $("contentTitle").value = data.content.title;
    $("contentSubtitle").value = data.content.subtitle;
    $("contentDescription").value = data.content.description;
    $("teamNames").value = data.teams
      .map(function (team) {
        return team.name;
      })
      .join("\n");
    $("modeSelect").value = data.tournament.mode;
    $("groupCount").value = String(data.tournament.groupCount || 4);
    $("groupCountWrap").classList.toggle("hidden", data.tournament.mode !== "groups");
    $("teamList").innerHTML = data.teams.length
      ? data.teams
          .map(function (team) {
            return '<span class="chip">' + escapeHtml(team.name) + "</span>";
          })
          .join("")
      : '<span class="chip">No teams yet</span>';
    $("bracketRoot").innerHTML = renderBracket(bracket);
    bindScoreInputs();
  }

  function renderBracket(bracket) {
    if (!bracket) {
      return '<p class="hint">The admin has not generated a bracket yet.</p>';
    }
    if (bracket.type === "groups") return renderGroups(bracket);
    if (bracket.type === "single") return renderSingle(bracket);
    return renderDouble(bracket);
  }

  function teamRow(match, side) {
    const team = match[side];
    const id = team && team.teamId;
    const isWinner = id && match.winnerId === id;
    const canEdit = state.isAdmin && match.teamA.teamId && match.teamB.teamId && match.status !== "bye";
    const label = id ? escapeHtml(teamName(id)) : match.status === "bye" ? "BYE" : "TBD";
    return (
      '<div class="team-row ' +
      (isWinner ? "winner " : "") +
      (id ? "" : "empty") +
      '"><span>' +
      label +
      '</span><input class="score-input" type="number" min="0" step="1" data-match="' +
      escapeHtml(match.id) +
      '" data-side="' +
      side +
      '" value="' +
      (team && id ? team.score : "") +
      '" ' +
      (canEdit ? "" : "disabled") +
      "></div>"
    );
  }

  function matchCard(match, caption) {
    return (
      '<article class="match" data-id="' +
      escapeHtml(match.id) +
      '"><div class="match-meta"><span>' +
      escapeHtml(caption || "") +
      "</span><span>" +
      escapeHtml(match.status) +
      "</span></div>" +
      teamRow(match, "teamA") +
      teamRow(match, "teamB") +
      "</article>"
    );
  }

  function column(title, matches, captions) {
    return (
      '<div class="round"><h3>' +
      escapeHtml(title) +
      "</h3>" +
      matches
        .map(function (match, index) {
          return matchCard(match, captions && captions[index]);
        })
        .join("") +
      "</div>"
    );
  }

  function renderSingle(bracket) {
    const champ = BracketEngine.champion(bracket);
    const rounds = [];
    for (let r = 1; r <= bracket.rounds; r += 1) {
      const matches = bracket.matches.filter(function (m) {
        return m.round === r;
      });
      rounds.push(column(BracketEngine.roundLabel(r, bracket.rounds), matches));
    }
    return (
      (champ ? '<p class="champion">Champion: ' + escapeHtml(teamName(champ)) + "</p>" : "") +
      '<div class="rounds">' +
      rounds.join("") +
      "</div>"
    );
  }

  function renderDouble(bracket) {
    const champ = BracketEngine.champion(bracket);
    const wb = [];
    for (let r = 1; r <= bracket.wbRounds; r += 1) {
      const matches = bracket.matches.filter(function (m) {
        return m.bracket === "winners" && m.round === r;
      });
      const title = r === bracket.wbRounds ? "Winners Final" : "Winners " + BracketEngine.roundLabel(r, bracket.wbRounds);
      wb.push(column(title, matches));
    }
    const lb = [];
    for (let r = 1; r <= bracket.lbRounds; r += 1) {
      const matches = bracket.matches.filter(function (m) {
        return m.bracket === "losers" && m.round === r;
      });
      lb.push(column("Losers Round " + r, matches));
    }
    const gf = bracket.matches.filter(function (m) {
      return m.bracket === "grand";
    });
    return (
      (champ ? '<p class="champion">Champion: ' + escapeHtml(teamName(champ)) + "</p>" : "") +
      "<h2>Winners bracket</h2><div class=\"rounds\">" +
      wb.join("") +
      "</div><h2>Losers bracket</h2>" +
      (lb.length ? '<div class="rounds">' + lb.join("") + "</div>" : '<p class="hint">With two teams, the first loss goes to the Grand Final.</p>') +
      "<h2>Grand Final</h2><div class=\"rounds\">" +
      column("Grand Final", [gf[0]], ["If the winners-bracket champion wins, the tournament ends."]) +
      column("Reset match", [gf[1]], ["Played only if the losers-bracket champion wins the first Grand Final."]) +
      "</div>"
    );
  }

  function renderGroups(bracket) {
    const teamsById = {};
    state.data.teams.forEach(function (team) {
      teamsById[team.id] = team;
    });
    return (
      '<div class="groups">' +
      bracket.groups
        .map(function (group) {
          const table = BracketEngine.groupStandings(group, teamsById);
          return (
            '<section class="group-card"><h3>' +
            escapeHtml(group.name) +
            "</h3><table><thead><tr><th>Pos</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>" +
            table
              .map(function (row, index) {
                return (
                  "<tr><td>" +
                  (index + 1) +
                  "</td><td>" +
                  escapeHtml(row.name) +
                  "</td><td>" +
                  row.played +
                  "</td><td>" +
                  row.wins +
                  "</td><td>" +
                  row.draws +
                  "</td><td>" +
                  row.losses +
                  "</td><td>" +
                  row.gd +
                  "</td><td>" +
                  row.points +
                  "</td></tr>"
                );
              })
              .join("") +
            "</tbody></table>" +
            group.matches
              .map(function (match) {
                return matchCard(match, "Round robin");
              })
              .join("") +
            "</section>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function bindScoreInputs() {
    document.querySelectorAll(".score-input").forEach(function (input) {
      function onScore() {
        if (!state.isAdmin) return;
        const matchId = input.getAttribute("data-match");
        const card = document.querySelector('.match[data-id="' + matchId + '"]');
        const a = card.querySelector('[data-side="teamA"]');
        const b = card.querySelector('[data-side="teamB"]');
        try {
          requireAdmin();
          BracketEngine.applyMatchScores(state.data.bracket, matchId, a.value, b.value);
          saveState();
          render();
        } catch (err) {
          showToast(err.message, true);
          render();
        }
      }
      input.addEventListener("change", onScore);
    });
  }

  $("loginBtn").addEventListener("click", function () {
    $("loginDialog").showModal();
    $("username").focus();
  });

  $("loginForm").addEventListener("submit", function (event) {
    event.preventDefault();
    if (event.submitter && event.submitter.value === "cancel") {
      $("loginDialog").close();
    }
  });

  $("loginSubmit").addEventListener("click", function () {
    const user = $("username").value.trim();
    const pass = $("password").value;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      state.isAdmin = true;
      sessionStorage.setItem(SESSION_KEY, "1");
      $("loginDialog").close();
      $("password").value = "";
      render();
      showToast("Admin signed in.");
    } else {
      showToast("Invalid admin credentials.", true);
    }
  });

  $("logoutBtn").addEventListener("click", function () {
    state.isAdmin = false;
    sessionStorage.removeItem(SESSION_KEY);
    render();
    showToast("Logged out. The bracket is now view-only.");
  });

  $("contentForm").addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      requireAdmin();
      state.data.content = {
        title: $("contentTitle").value.trim() || "Arena Brackets",
        subtitle: $("contentSubtitle").value.trim(),
        description: $("contentDescription").value.trim(),
      };
      saveState();
      render();
      showToast("Website content saved.");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("teamsForm").addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      requireAdmin();
      const teams = parseTeams($("teamNames").value);
      if (teams.length < 2) throw new Error("Enter at least two team names.");
      state.data.teams = teams;
      state.data.bracket = null;
      saveState();
      render();
      showToast("Teams saved. Generate the bracket to randomize matchups.");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("modeSelect").addEventListener("change", function () {
    $("groupCountWrap").classList.toggle("hidden", $("modeSelect").value !== "groups");
  });

  $("generateForm").addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      requireAdmin();
      const teams = state.data.teams;
      if (teams.length < 2) throw new Error("Save at least two teams first.");
      const mode = $("modeSelect").value;
      const groupCount = Number($("groupCount").value) || 4;
      state.data.tournament = { mode: mode, groupCount: groupCount };
      if (mode === "single") state.data.bracket = BracketEngine.seedSingleElimination(teams);
      else if (mode === "double") state.data.bracket = BracketEngine.seedDoubleElimination(teams);
      else state.data.bracket = BracketEngine.seedGroups(teams, groupCount);
      saveState();
      render();
      showToast("Matchups randomized.");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("resetBracket").addEventListener("click", function () {
    try {
      requireAdmin();
      if (!confirm("Clear the current bracket? Teams and website text will stay.")) return;
      state.data.bracket = null;
      saveState();
      render();
      showToast("Bracket cleared.");
    } catch (err) {
      showToast(err.message, true);
    }
  });

 // Taruh di paling bawah app.js menggantikan render(); lama
  tournamentRef.on("value", function (snapshot) {
    const val = snapshot.val();
    if (val) {
      state.data = Object.assign(structuredClone(defaultState), val);
    } else {
      state.data = structuredClone(defaultState);
    }

    if (state.data.bracket) {
      BracketEngine.recompute(state.data.bracket);
    }

    render();
  });
})();
