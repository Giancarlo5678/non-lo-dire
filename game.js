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
