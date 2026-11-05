export function seedSingleElimination(teams) {
  const count = teams.length;
  const matches = [];
  for (let i = 0; i < Math.floor(count / 2); i++) {
    matches.push({
      id: `m1_${i + 1}`,
      t1: teams[i * 2]?.id || null,
      t2: teams[i * 2 + 1]?.id || null,
      winner: null
    });
  }
  return {
    type: "single",
    rounds: [{ id: "r1", matches }]
  };
}

export function seedDoubleElimination(teams) {
  return seedSingleElimination(teams); // Contoh penyederhanaan
}

export function seedGroups(teams, groupCount = 2) {
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push({ id: `g${i + 1}`, teamIds: [] });
  }
  teams.forEach((t, index) => {
    groups[index % groupCount].teamIds.push(t.id);
  });
  return { type: "groups", groups };
}

export function applySingleResult(bracket, matchId, winnerId) {
  bracket.rounds.forEach(r => {
    r.matches.forEach(m => {
      if (m.id === matchId) m.winner = winnerId;
    });
  });
}

export function applyDoubleResult(bracket, matchId, winnerId) {
  applySingleResult(bracket, matchId, winnerId);
}

export function applyGroupResult(bracket, matchId, winnerId) {
  // Handler group result
}

export function groupStandings(group, teamsById) {
  return group.teamIds.map(id => ({ team: teamsById[id]?.name || id, points: 0 }));
}