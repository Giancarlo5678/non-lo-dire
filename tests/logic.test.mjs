import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIPS_PER_TURN, TURN_MS } from '../game.js';

test('constants are the spec values', () => {
  assert.equal(SKIPS_PER_TURN, 3);
  assert.equal(TURN_MS, 60000);
});
