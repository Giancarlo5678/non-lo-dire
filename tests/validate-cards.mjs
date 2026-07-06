import assert from 'node:assert/strict';
import { CARDS } from '../cards.js';

assert.ok(Array.isArray(CARDS), 'CARDS must be an array');
assert.ok(CARDS.length >= 1400, `expected ~1500 cards, got ${CARDS.length}`);

const seen = new Set();
for (const [i, card] of CARDS.entries()) {
  assert.ok(card && typeof card.w === 'string' && card.w.trim().length > 0, `card ${i}: missing word`);
  const key = card.w.trim().toLowerCase();
  assert.ok(!seen.has(key), `duplicate word: ${card.w}`);
  seen.add(key);
  assert.ok(Array.isArray(card.t) && card.t.length === 5, `card ${i} (${card.w}): needs exactly 5 forbidden words`);
  const forbidden = new Set();
  for (const t of card.t) {
    assert.ok(typeof t === 'string' && t.trim().length > 0, `card ${i} (${card.w}): empty forbidden word`);
    const tk = t.trim().toLowerCase();
    assert.ok(tk !== key, `card ${i} (${card.w}): forbidden word equals the word`);
    assert.ok(!forbidden.has(tk), `card ${i} (${card.w}): duplicate forbidden word "${t}"`);
    forbidden.add(tk);
  }
}
console.log(`validate-cards: OK (${CARDS.length} cards)`);
