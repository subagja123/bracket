(function (global) {
  function shuffle(items) {
    const list = [...items];
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function nextPowerOfTwo(n) {
    let p = 1;
    while (p < n) p *= 2;
    return Math.max(2, p);
  }

  function matchId(prefix, round, index) {
    return prefix + "-r" + round + "-m" + index;
  }

  function slot(teamId, score) {
    return { teamId: teamId || null, score: Number(score) || 0 };
  }

  function createMatch(id, round, index, extra) {
    return Object.assign(
      {
        id: id,
        round: round,
        index: index,
        teamA: slot(null),
        teamB: slot(null),
        winnerId: null,
        loserId: null,
        status: "empty",
      },
      extra || {},
    );
  }

  function cloneMatch(match) {
    return {
      id: match.id,
      round: match.round,
      index: match.index,
      bracket: match.bracket,
      reset: match.reset,
      groupId: match.groupId,
      teamA: slot(match.teamA && match.teamA.teamId, match.teamA && match.teamA.score),
      teamB: slot(match.teamB && match.teamB.teamId, match.teamB && match.teamB.score),
      winnerId: match.winnerId || null,
      loserId: match.loserId || null,
      status: match.status,
    };
  }

  function bothTeams(match) {
    return Boolean(match.teamA.teamId && match.teamB.teamId);
  }

  function isSeededBye(match) {
    return (match.bracket === "winners" && match.round === 1) || match.allowBye;
  }

  function applyAutomatic(match) {
    const oneTeam = Boolean(match.teamA.teamId) !== Boolean(match.teamB.teamId);
    if (oneTeam && isSeededBye(match)) {
      match.winnerId = match.teamA.teamId || match.teamB.teamId;
      match.loserId = null;
      match.status = "bye";
      return;
    }
    if (bothTeams(match)) {
      if (match.winnerId && (match.winnerId === match.teamA.teamId || match.winnerId === match.teamB.teamId)) {
        match.loserId = match.winnerId === match.teamA.teamId ? match.teamB.teamId : match.teamA.teamId;
        match.status = "complete";
      } else {
        match.winnerId = null;
        match.loserId = null;
        match.status = "ready";
      }
      return;
    }
    match.winnerId = null;
    match.loserId = null;
    match.status = match.teamA.teamId || match.teamB.teamId ? "waiting" : "empty";
  }

  function place(match, which, teamId) {
    if (!match) return;
    const current = match[which].teamId;
    if (current !== teamId) {
      match[which] = slot(teamId, 0);
      match.winnerId = null;
      match.loserId = null;
    }
  }

  function findMatch(matches, id) {
    return matches.find(function (m) {
      return m.id === id;
    });
  }

  function roundLabel(round, totalRounds) {
    const remaining = totalRounds - round + 1;
    if (remaining === 1) return "Final";
    if (remaining === 2) return "Semifinals";
    if (remaining === 3) return "Quarterfinals";
    return "Round of " + Math.pow(2, remaining);
  }

  function snapshotResults(matches) {
    const map = {};
    matches.forEach(function (m) {
      map[m.id] = {
        a: m.teamA.teamId,
        b: m.teamB.teamId,
        scoreA: m.teamA.score,
        scoreB: m.teamB.score,
        winnerId: m.winnerId,
        status: m.status,
      };
    });
    return map;
  }

  function restoreResult(match, snap) {
    if (!snap || snap.status === "bye") return;
    if (!bothTeams(match)) return;
    const samePair =
      (snap.a === match.teamA.teamId && snap.b === match.teamB.teamId) ||
      (snap.a === match.teamB.teamId && snap.b === match.teamA.teamId);
    if (!samePair) return;
    if (snap.a === match.teamA.teamId) {
      match.teamA.score = snap.scoreA;
      match.teamB.score = snap.scoreB;
    } else {
      match.teamA.score = snap.scoreB;
      match.teamB.score = snap.scoreA;
    }
    if (snap.winnerId === match.teamA.teamId || snap.winnerId === match.teamB.teamId) {
      match.winnerId = snap.winnerId;
    }
  }

  function firstRoundPairings(teamIds) {
    const shuffled = shuffle(teamIds);
    const size = nextPowerOfTwo(shuffled.length);
    const byeCount = size - shuffled.length;
    const byeTeams = shuffled.slice(0, byeCount);
    const playTeams = shuffled.slice(byeCount);
    const pairs = [];
    for (let i = 0; i < size / 2; i += 1) {
      if (i < byeCount) {
        pairs.push([byeTeams[i], null]);
      } else {
        const p = (i - byeCount) * 2;
        pairs.push([playTeams[p], playTeams[p + 1]]);
      }
    }
    return { size: size, pairs: pairs };
  }

  function seedSingleElimination(teams) {
    const draw = firstRoundPairings(
      teams.map(function (t) {
        return t.id;
      }),
    );
    const size = draw.size;
    const rounds = Math.log2(size);
    const matches = [];
    for (let round = 1; round <= rounds; round += 1) {
      const count = size / Math.pow(2, round);
      for (let i = 0; i < count; i += 1) {
        const match = createMatch(matchId("wb", round, i), round, i, { bracket: "winners" });
        if (round === 1) {
          match.teamA = slot(draw.pairs[i][0]);
          match.teamB = slot(draw.pairs[i][1]);
        }
        matches.push(match);
      }
    }
    recomputeSingle(matches);
    return { type: "single", size: size, rounds: rounds, matches: matches };
  }

  function recomputeSingle(matches) {
    const snaps = snapshotResults(matches);
    matches.forEach(function (m) {
      if (m.round !== 1) {
        m.teamA = slot(null);
        m.teamB = slot(null);
        m.winnerId = null;
        m.loserId = null;
      }
    });
    const rounds = matches.reduce(function (max, m) {
      return Math.max(max, m.round);
    }, 1);
    for (let round = 1; round <= rounds; round += 1) {
      matches
        .filter(function (m) {
          return m.round === round;
        })
        .forEach(function (match) {
          restoreResult(match, snaps[match.id]);
          applyAutomatic(match);
          if (!match.winnerId || round === rounds) return;
          const next = findMatch(matches, matchId("wb", round + 1, Math.floor(match.index / 2)));
          place(next, match.index % 2 === 0 ? "teamA" : "teamB", match.winnerId);
        });
    }
  }

  function seedDoubleElimination(teams) {
    const draw = firstRoundPairings(
      teams.map(function (t) {
        return t.id;
      }),
    );
    const size = draw.size;
    const wbRounds = Math.log2(size);
    const lbRounds = Math.max(0, 2 * (wbRounds - 1));
    const matches = [];

    for (let round = 1; round <= wbRounds; round += 1) {
      const count = size / Math.pow(2, round);
      for (let i = 0; i < count; i += 1) {
        const match = createMatch(matchId("wb", round, i), round, i, { bracket: "winners" });
        if (round === 1) {
          match.teamA = slot(draw.pairs[i][0]);
          match.teamB = slot(draw.pairs[i][1]);
        }
        matches.push(match);
      }
    }

    for (let round = 1; round <= lbRounds; round += 1) {
      const pair = Math.ceil(round / 2);
      const count = Math.max(1, size / Math.pow(2, pair + 1));
      for (let i = 0; i < count; i += 1) {
        matches.push(createMatch(matchId("lb", round, i), round, i, { bracket: "losers" }));
      }
    }

    matches.push(createMatch("gf-r1-m0", 1, 0, { bracket: "grand", reset: false }));
    matches.push(createMatch("gf-r2-m0", 2, 0, { bracket: "grand", reset: true }));

    recomputeDouble({ size: size, wbRounds: wbRounds, lbRounds: lbRounds, matches: matches });
    return {
      type: "double",
      size: size,
      rounds: wbRounds,
      wbRounds: wbRounds,
      lbRounds: lbRounds,
      matches: matches,
    };
  }

  function processMatch(match, snaps) {
    restoreResult(match, snaps[match.id]);
    applyAutomatic(match);
  }

  function routeWinners(bracket, match) {
    const matches = bracket.matches;
    if (!match.winnerId) return;
    if (match.bracket === "winners") {
      if (match.round < bracket.wbRounds) {
        const next = findMatch(matches, matchId("wb", match.round + 1, Math.floor(match.index / 2)));
        place(next, match.index % 2 === 0 ? "teamA" : "teamB", match.winnerId);
      }
      if (match.status === "bye" || !match.loserId) return;
      if (bracket.lbRounds === 0) return;
      if (match.round === 1) {
        const lb = findMatch(matches, matchId("lb", 1, Math.floor(match.index / 2)));
        place(lb, match.index % 2 === 0 ? "teamA" : "teamB", match.loserId);
      } else {
        const lbRound = (match.round - 1) * 2;
        const lb = findMatch(matches, matchId("lb", lbRound, match.index));
        place(lb, "teamB", match.loserId);
      }
      return;
    }
    if (match.bracket === "losers") {
      if (match.round === bracket.lbRounds) return;
      const nextRound = match.round + 1;
      if (nextRound % 2 === 0) {
        const next = findMatch(matches, matchId("lb", nextRound, match.index));
        place(next, "teamA", match.winnerId);
      } else {
        const next = findMatch(matches, matchId("lb", nextRound, Math.floor(match.index / 2)));
        place(next, match.index % 2 === 0 ? "teamA" : "teamB", match.winnerId);
      }
    }
  }

  function recomputeDouble(bracket) {
    const matches = bracket.matches;
    const snaps = snapshotResults(matches);
    matches.forEach(function (m) {
      if (!(m.bracket === "winners" && m.round === 1)) {
        m.teamA = slot(null);
        m.teamB = slot(null);
        m.winnerId = null;
        m.loserId = null;
        m.status = "empty";
      }
    });

    function run(id) {
      const match = findMatch(matches, id);
      if (!match) return;
      processMatch(match, snaps);
      routeWinners(bracket, match);
    }

    for (let r = 1; r <= bracket.wbRounds; r += 1) {
      const wbCount = bracket.size / Math.pow(2, r);
      for (let i = 0; i < wbCount; i += 1) run(matchId("wb", r, i));
      if (!bracket.lbRounds) continue;
      if (r === 1) {
        const count = Math.max(1, bracket.size / 4);
        for (let i = 0; i < count; i += 1) {
          const lb = findMatch(matches, matchId("lb", 1, i));
          const srcA = findMatch(matches, matchId("wb", 1, i * 2));
          const srcB = findMatch(matches, matchId("wb", 1, i * 2 + 1));
          const sourcesDone =
            srcA &&
            srcB &&
            (srcA.status === "complete" || srcA.status === "bye") &&
            (srcB.status === "complete" || srcB.status === "bye");
          if (lb && sourcesDone && !bothTeams(lb) && (lb.teamA.teamId || lb.teamB.teamId)) {
            lb.allowBye = true;
          }
        }
        for (let i = 0; i < count; i += 1) run(matchId("lb", 1, i));
      } else {
        const dropRound = (r - 1) * 2;
        const pair = Math.ceil(dropRound / 2);
        const dropCount = Math.max(1, bracket.size / Math.pow(2, pair + 1));
        for (let i = 0; i < dropCount; i += 1) run(matchId("lb", dropRound, i));
        if (r < bracket.wbRounds) {
          const compactRound = dropRound + 1;
          const cPair = Math.ceil(compactRound / 2);
          const compactCount = Math.max(1, bracket.size / Math.pow(2, cPair + 1));
          for (let i = 0; i < compactCount; i += 1) run(matchId("lb", compactRound, i));
        }
      }
    }

    const wbFinal = findMatch(matches, matchId("wb", bracket.wbRounds, 0));
    const gf1 = findMatch(matches, "gf-r1-m0");
    const gf2 = findMatch(matches, "gf-r2-m0");
    if (wbFinal && wbFinal.winnerId) place(gf1, "teamA", wbFinal.winnerId);

    if (bracket.lbRounds === 0 && wbFinal && wbFinal.loserId) {
      place(gf1, "teamB", wbFinal.loserId);
    } else if (bracket.lbRounds > 0) {
      const lbFinal = findMatch(matches, matchId("lb", bracket.lbRounds, 0));
      if (lbFinal && lbFinal.winnerId) place(gf1, "teamB", lbFinal.winnerId);
    }

    processMatch(gf1, snaps);
    if (gf1.winnerId && gf1.loserId && gf1.winnerId === gf1.teamB.teamId) {
      place(gf2, "teamA", gf1.teamA.teamId);
      place(gf2, "teamB", gf1.teamB.teamId);
      processMatch(gf2, snaps);
    } else {
      gf2.teamA = slot(null);
      gf2.teamB = slot(null);
      gf2.winnerId = null;
      gf2.loserId = null;
      gf2.status = "empty";
    }
  }

  function seedGroups(teams, groupCount) {
    const shuffled = shuffle(teams);
    const count = Math.min(Math.max(2, Number(groupCount) || 2), Math.max(2, shuffled.length));
    const groups = [];
    for (let i = 0; i < count; i += 1) {
      groups.push({
        id: "G" + (i + 1),
        name: "Group " + String.fromCharCode(65 + i),
        teamIds: [],
        matches: [],
      });
    }
    shuffled.forEach(function (team, index) {
      groups[index % count].teamIds.push(team.id);
    });
    groups.forEach(function (group) {
      for (let i = 0; i < group.teamIds.length; i += 1) {
        for (let j = i + 1; j < group.teamIds.length; j += 1) {
          const match = createMatch(
            "g-" + group.id + "-m" + group.matches.length,
            1,
            group.matches.length,
            { groupId: group.id, bracket: "group" },
          );
          match.teamA = slot(group.teamIds[i]);
          match.teamB = slot(group.teamIds[j]);
          match.status = "ready";
          group.matches.push(match);
        }
      }
    });
    return { type: "groups", groupCount: count, groups: groups };
  }

  function decideFromScores(match, allowDraw) {
    if (!bothTeams(match)) throw new Error("Both teams must be present.");
    const a = Number(match.teamA.score) || 0;
    const b = Number(match.teamB.score) || 0;
    if (a === b) {
      if (!allowDraw) throw new Error("Scores cannot be tied in elimination matches.");
      match.winnerId = null;
      match.loserId = null;
      match.status = "draw";
      return match;
    }
    match.winnerId = a > b ? match.teamA.teamId : match.teamB.teamId;
    match.loserId = a > b ? match.teamB.teamId : match.teamA.teamId;
    match.status = "complete";
    return match;
  }

  function applyMatchScores(bracket, matchIdValue, scoreA, scoreB) {
    if (bracket.type === "groups") {
      let found = null;
      bracket.groups.forEach(function (group) {
        group.matches.forEach(function (match) {
          if (match.id === matchIdValue) found = match;
        });
      });
      if (!found) throw new Error("Match not found.");
      found.teamA.score = Number(scoreA) || 0;
      found.teamB.score = Number(scoreB) || 0;
      decideFromScores(found, true);
      return bracket;
    }

    const match = findMatch(bracket.matches, matchIdValue);
    if (!match) throw new Error("Match not found.");
    match.teamA.score = Number(scoreA) || 0;
    match.teamB.score = Number(scoreB) || 0;
    decideFromScores(match, false);
    if (bracket.type === "single") recomputeSingle(bracket.matches);
    if (bracket.type === "double") recomputeDouble(bracket);
    return bracket;
  }

  function groupStandings(group, teamsById) {
    const table = group.teamIds.map(function (id) {
      return {
        teamId: id,
        name: (teamsById[id] && teamsById[id].name) || id,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      };
    });
    function row(id) {
      return table.find(function (item) {
        return item.teamId === id;
      });
    }
    group.matches.forEach(function (match) {
      if (match.status !== "complete" && match.status !== "draw") return;
      const a = row(match.teamA.teamId);
      const b = row(match.teamB.teamId);
      const as = Number(match.teamA.score) || 0;
      const bs = Number(match.teamB.score) || 0;
      a.played += 1;
      b.played += 1;
      a.gf += as;
      a.ga += bs;
      b.gf += bs;
      b.ga += as;
      if (match.status === "draw" || as === bs) {
        a.draws += 1;
        b.draws += 1;
        a.points += 1;
        b.points += 1;
      } else if (match.winnerId === a.teamId) {
        a.wins += 1;
        b.losses += 1;
        a.points += 3;
      } else {
        b.wins += 1;
        a.losses += 1;
        b.points += 3;
      }
    });
    table.forEach(function (item) {
      item.gd = item.gf - item.ga;
    });
    table.sort(function (a, b) {
      return b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name);
    });
    return table;
  }

  function champion(bracket) {
    if (!bracket) return null;
    if (bracket.type === "single") {
      const finalMatch = bracket.matches.reduce(function (best, match) {
        return !best || match.round > best.round ? match : best;
      }, null);
      return finalMatch && finalMatch.status === "complete" ? finalMatch.winnerId : null;
    }
    if (bracket.type === "double") {
      const gf2 = findMatch(bracket.matches, "gf-r2-m0");
      if (gf2 && gf2.status === "complete") return gf2.winnerId;
      const gf1 = findMatch(bracket.matches, "gf-r1-m0");
      if (gf1 && gf1.status === "complete" && gf1.winnerId === gf1.teamA.teamId) return gf1.winnerId;
      return null;
    }
    return null;
  }

  function recompute(bracket) {
    if (!bracket) return bracket;
    if (bracket.type === "single") recomputeSingle(bracket.matches);
    if (bracket.type === "double") recomputeDouble(bracket);
    return bracket;
  }

  global.BracketEngine = {
    shuffle: shuffle,
    cloneMatch: cloneMatch,
    seedSingleElimination: seedSingleElimination,
    seedDoubleElimination: seedDoubleElimination,
    seedGroups: seedGroups,
    applyMatchScores: applyMatchScores,
    groupStandings: groupStandings,
    roundLabel: roundLabel,
    champion: champion,
    recompute: recompute,
  };
})(window);
