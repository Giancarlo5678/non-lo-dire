import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIPS_PER_TURN, TURN_MS, shuffle, newGame } from '../game.js';

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
