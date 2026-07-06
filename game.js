export const SKIPS_PER_TURN = 3;
export const TURN_MS = 60000;

export function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newGame({ teamNames, totalRounds, deckSize, deckOrder = null, cardIndex = 0, rng = Math.random }) {
  const order = deckOrder ?? shuffle(Array.from({ length: deckSize }, (_, i) => i), rng);
  return {
    phase: 'handoff',
    teams: teamNames.map((name) => ({ name, score: 0 })),
    totalRounds,
    currentRound: 1,
    currentTeamIndex: 0,
    skipsLeft: SKIPS_PER_TURN,
    turnPoints: 0,
    deckOrder: order,
    cardIndex,
    turnEndsAt: null,
  };
}

export function currentCard(state, cards) {
  return cards[state.deckOrder[state.cardIndex]];
}

export function advance(state) {
  const next = state.cardIndex + 1;
  if (next >= state.deckOrder.length) {
    return { ...state, deckOrder: shuffle(state.deckOrder), cardIndex: 0 };
  }
  return { ...state, cardIndex: next };
}

function bumpScore(state, delta) {
  return state.teams.map((t, i) =>
    i === state.currentTeamIndex ? { ...t, score: t.score + delta } : t
  );
}

export function correct(state) {
  return advance({ ...state, teams: bumpScore(state, +1), turnPoints: state.turnPoints + 1 });
}

export function taboo(state) {
  return advance({ ...state, teams: bumpScore(state, -1), turnPoints: state.turnPoints - 1 });
}

export function skip(state) {
  if (state.skipsLeft <= 0) return state;
  return advance({ ...state, skipsLeft: state.skipsLeft - 1 });
}

export function startTurn(state, now = Date.now(), turnMs = TURN_MS) {
  return { ...state, phase: 'turn', turnEndsAt: now + turnMs };
}

export function endTurn(state) {
  return { ...state, phase: 'turnEnd' };
}

export function nextTurn(state) {
  let teamIndex = state.currentTeamIndex + 1;
  let round = state.currentRound;
  if (teamIndex >= state.teams.length) {
    teamIndex = 0;
    round += 1;
  }
  if (round > state.totalRounds) {
    return { ...state, phase: 'gameOver' };
  }
  return {
    ...state,
    phase: 'handoff',
    currentTeamIndex: teamIndex,
    currentRound: round,
    skipsLeft: SKIPS_PER_TURN,
    turnPoints: 0,
    turnEndsAt: null,
  };
}

export function standings(state) {
  const sorted = state.teams
    .map((t) => ({ name: t.name, score: t.score }))
    .sort((a, b) => b.score - a.score);
  let rank = 0;
  let prevScore = null;
  return sorted.map((t, i) => {
    if (t.score !== prevScore) {
      rank = i + 1;
      prevScore = t.score;
    }
    return { ...t, rank };
  });
}
