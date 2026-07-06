import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIPS_PER_TURN, TURN_MS, shuffle, newGame, currentCard, advance, correct, taboo, skip } from '../game.js';

test('constants are the spec values', () => {
  assert.equal(SKIPS_PER_TURN, 3);
  assert.equal(TURN_MS, 60000);
});

test('shuffle is a permutation and does not mutate input', () => {
  const src = [0, 1, 2, 3, 4];
  const out = shuffle(src, mulberry32(42));
  assert.notEqual(out, src);
  assert.deepEqual([...src], [0, 1, 2, 3, 4]);
  assert.deepEqual([...out].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('shuffle is deterministic for a given rng', () => {
  const a = shuffle([0, 1, 2, 3, 4, 5, 6, 7], mulberry32(1));
  const b = shuffle([0, 1, 2, 3, 4, 5, 6, 7], mulberry32(1));
  assert.deepEqual(a, b);
});

test('newGame builds the initial handoff state', () => {
  const s = newGame({ teamNames: ['A', 'B'], totalRounds: 5, deckSize: 10, rng: mulberry32(7) });
  assert.equal(s.phase, 'handoff');
  assert.deepEqual(s.teams, [{ name: 'A', score: 0 }, { name: 'B', score: 0 }]);
  assert.equal(s.totalRounds, 5);
  assert.equal(s.currentRound, 1);
  assert.equal(s.currentTeamIndex, 0);
  assert.equal(s.skipsLeft, 3);
  assert.equal(s.turnPoints, 0);
  assert.equal(s.turnEndsAt, null);
  assert.equal(s.cardIndex, 0);
  assert.deepEqual([...s.deckOrder].sort((a, b) => a - b), [0,1,2,3,4,5,6,7,8,9]);
});

test('newGame reuses a provided deckOrder and cardIndex', () => {
  const order = [3, 1, 2, 0];
  const s = newGame({ teamNames: ['X'], totalRounds: 1, deckSize: 4, deckOrder: order, cardIndex: 2 });
  assert.deepEqual(s.deckOrder, order);
  assert.equal(s.cardIndex, 2);
});

test('currentCard resolves through deckOrder', () => {
  const cards = [{ w: 'zero' }, { w: 'one' }, { w: 'two' }];
  const s = newGame({ teamNames: ['A'], totalRounds: 1, deckSize: 3, deckOrder: [2, 0, 1], cardIndex: 0 });
  assert.equal(currentCard(s, cards).w, 'two');
  assert.equal(currentCard({ ...s, cardIndex: 1 }, cards).w, 'zero');
});

test('advance moves to the next card without mutating input', () => {
  const s = newGame({ teamNames: ['A'], totalRounds: 1, deckSize: 3, deckOrder: [0, 1, 2], cardIndex: 0 });
  const s2 = advance(s);
  assert.equal(s2.cardIndex, 1);
  assert.equal(s.cardIndex, 0);
});

test('advance reshuffles and wraps when the deck is exhausted', () => {
  const s = newGame({ teamNames: ['A'], totalRounds: 1, deckSize: 3, deckOrder: [0, 1, 2], cardIndex: 2 });
  const s2 = advance(s);
  assert.equal(s2.cardIndex, 0);
  assert.equal(s2.deckOrder.length, 3);
  assert.deepEqual([...s2.deckOrder].sort((a, b) => a - b), [0, 1, 2]);
});

function turnState() {
  const s = newGame({ teamNames: ['A', 'B'], totalRounds: 3, deckSize: 5, deckOrder: [0,1,2,3,4], cardIndex: 0 });
  return { ...s, phase: 'turn', currentTeamIndex: 1 };
}

test('correct adds a point to the current team and advances', () => {
  const s = correct(turnState());
  assert.equal(s.teams[1].score, 1);
  assert.equal(s.teams[0].score, 0);
  assert.equal(s.turnPoints, 1);
  assert.equal(s.cardIndex, 1);
});

test('taboo removes a point from the current team and advances', () => {
  const s = taboo(turnState());
  assert.equal(s.teams[1].score, -1);
  assert.equal(s.turnPoints, -1);
  assert.equal(s.cardIndex, 1);
});

test('skip decrements skipsLeft and advances', () => {
  const s = skip(turnState());
  assert.equal(s.skipsLeft, 2);
  assert.equal(s.cardIndex, 1);
  assert.equal(s.teams[1].score, 0);
});

test('skip is a no-op when no skips remain', () => {
  const base = { ...turnState(), skipsLeft: 0 };
  const s = skip(base);
  assert.equal(s.skipsLeft, 0);
  assert.equal(s.cardIndex, base.cardIndex);
});

// Small seeded PRNG for deterministic tests.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
