# "Non lo dire" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable iPhone PWA for the Taboo-style party game "Non lo dire": teams take 60-second turns making teammates guess words without saying 5 forbidden words, with scoring, skips, rounds, and a large local card database.

**Architecture:** Static PWA, zero build step. Pure game logic (`game.js`) is a set of immutable state-transition functions with no DOM access, fully unit-tested under Node. The UI layer (`app.js`) wires that logic to five screens, the timer, Wake Lock, and `localStorage` persistence. Card data (`cards.js`) is a plain data module. A service worker caches every asset for offline play.

**Tech Stack:** Vanilla JavaScript ES modules, HTML, CSS. No dependencies, no bundler. Node's built-in test runner (`node --test`) and `node:assert` for tests. Hosted on GitHub Pages.

## Global Constraints

- **No runtime dependencies, no build step.** Only browser-native APIs and Node built-ins (`node:test`, `node:assert`, `node:zlib`, `node:fs`). Adding an npm package is a plan violation.
- **ES modules everywhere.** `package.json` has `"type": "module"`; `index.html` loads `app.js` with `<script type="module">`; `game.js`/`cards.js` use `export`.
- **`game.js` is DOM-free and pure.** Every function returns a new state object; no mutation of inputs, no `window`/`document`/`localStorage` references. This is what makes it testable.
- **Italian UI copy and card content.** All player-facing text and all cards are in Italian.
- **Rules (verbatim from spec):** 2–6 teams; rounds 1–20; correct = **+1** and next card; forbidden word said = **−1** and next card; **3 skips** per turn (no score change); each turn is **60 seconds**; each card has exactly **5** forbidden words.
- **Deck consumed across games.** Cards are shuffled once and consumed progressively even across separate games; reshuffle only when the whole deck is exhausted.
- **Timer is timestamp-based** (`Date.now()`), never a tick counter, so backgrounding the app never causes drift.
- **Card count target:** ~1500 cards; concrete, fun-to-describe Italian words (objects, animals, food, characters, places, actions, jobs). No dull abstractions ("globalizzazione").

**File structure (locked in before tasks):**

```
package.json          "type":"module", test script
.gitignore            node_modules/, .DS_Store
index.html            markup for the 5 screens + <script type="module" src="app.js">
style.css             mobile-first styles
game.js               pure logic: newGame, startTurn, correct, taboo, skip, endTurn, nextTurn, currentCard, standings, shuffle
cards.js              export const CARDS = [{ w, t:[5] }, ...]  (~1500)
app.js                DOM rendering, timer, Wake Lock, localStorage glue
sw.js                 service worker: precache all assets
manifest.webmanifest  name, icons, standalone
icons/                icon-180.png, icon-192.png, icon-512.png
tools/make-icons.mjs  zero-dep PNG icon generator (node:zlib)
tests/logic.test.mjs  unit tests for game.js
tests/validate-cards.mjs  card database integrity check
docs/                 spec + this plan (already committed)
```

**Manual verification note:** `game.js` and `cards.js` carry automated tests (the bug-prone logic). `app.js`/UI is verified through documented manual steps in the browser — there is no browser test framework, and adding one would violate the zero-dependency constraint.

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `game.js` (stub)
- Create: `tests/logic.test.mjs` (smoke test)

**Interfaces:**
- Produces: a runnable `npm test` command; `game.js` module that later tasks extend.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "non-lo-dire",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Party game stile Taboo (PWA per iPhone)",
  "scripts": {
    "test": "node --test && node tests/validate-cards.mjs",
    "test:logic": "node --test",
    "icons": "node tools/make-icons.mjs"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 3: Create `game.js` stub**

```js
export const SKIPS_PER_TURN = 3;
export const TURN_MS = 60000;
```

- [ ] **Step 4: Write the smoke test in `tests/logic.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIPS_PER_TURN, TURN_MS } from '../game.js';

test('constants are the spec values', () => {
  assert.equal(SKIPS_PER_TURN, 3);
  assert.equal(TURN_MS, 60000);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ~/Desktop/NonLoDire && npm run test:logic`
Expected: PASS, 1 test passing.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore game.js tests/logic.test.mjs
git commit -m "chore: project scaffold and node test harness"
```

---

### Task 2: Deterministic shuffle and newGame

**Files:**
- Modify: `game.js`
- Modify: `tests/logic.test.mjs`

**Interfaces:**
- Consumes: `SKIPS_PER_TURN`, `TURN_MS` from Task 1.
- Produces:
  - `shuffle(arr, rng = Math.random) -> Array` — pure Fisher-Yates, returns a new array.
  - `newGame({ teamNames, totalRounds, deckSize, deckOrder = null, cardIndex = 0, rng = Math.random }) -> State`
  - State shape: `{ phase, teams:[{name,score}], totalRounds, currentRound, currentTeamIndex, skipsLeft, turnPoints, deckOrder:number[], cardIndex, turnEndsAt }`. Initial `phase` is `'handoff'`, `currentRound` 1, `currentTeamIndex` 0, `skipsLeft` 3, `turnPoints` 0, `turnEndsAt` null. If `deckOrder` is null a fresh `shuffle([0..deckSize-1])` is used.

- [ ] **Step 1: Write the failing tests**

Add to `tests/logic.test.mjs`:

```js
import { shuffle, newGame } from '../game.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:logic`
Expected: FAIL — `shuffle`/`newGame` not exported.

- [ ] **Step 3: Implement in `game.js`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:logic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game.js tests/logic.test.mjs
git commit -m "feat: shuffle and newGame initial state"
```

---

### Task 3: Current card lookup and deck advance with reshuffle

**Files:**
- Modify: `game.js`
- Modify: `tests/logic.test.mjs`

**Interfaces:**
- Consumes: State from Task 2.
- Produces:
  - `currentCard(state, cards) -> card` — returns `cards[state.deckOrder[state.cardIndex]]`.
  - internal `advance(state) -> State` (exported for testing) — increments `cardIndex`; when it reaches `deckOrder.length`, reshuffles `deckOrder` (via `shuffle`, default rng) and resets `cardIndex` to 0. Never mutates input.

- [ ] **Step 1: Write the failing tests**

Add:

```js
import { currentCard, advance } from '../game.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:logic`
Expected: FAIL — `currentCard`/`advance` not exported.

- [ ] **Step 3: Implement in `game.js`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:logic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game.js tests/logic.test.mjs
git commit -m "feat: current card lookup and deck advance with reshuffle"
```

---

### Task 4: Scoring actions — correct, taboo, skip

**Files:**
- Modify: `game.js`
- Modify: `tests/logic.test.mjs`

**Interfaces:**
- Consumes: `advance` from Task 3, `SKIPS_PER_TURN`.
- Produces (each pure, returns new State, stays in `phase 'turn'`):
  - `correct(state)` — current team `score +1`, `turnPoints +1`, then `advance`.
  - `taboo(state)` — current team `score -1`, `turnPoints -1`, then `advance`.
  - `skip(state)` — if `skipsLeft > 0`: `skipsLeft -1`, then `advance`; else returns state unchanged.

- [ ] **Step 1: Write the failing tests**

Add:

```js
import { correct, taboo, skip } from '../game.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:logic`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement in `game.js`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:logic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game.js tests/logic.test.mjs
git commit -m "feat: scoring actions correct, taboo, skip"
```

---

### Task 5: Turn lifecycle — startTurn, endTurn, nextTurn rotation, gameOver

**Files:**
- Modify: `game.js`
- Modify: `tests/logic.test.mjs`

**Interfaces:**
- Consumes: `TURN_MS`, `SKIPS_PER_TURN`, State.
- Produces:
  - `startTurn(state, now = Date.now(), turnMs = TURN_MS) -> State` — `phase 'turn'`, `turnEndsAt = now + turnMs`.
  - `endTurn(state) -> State` — `phase 'turnEnd'`.
  - `nextTurn(state) -> State` — advance to the next team; after the last team, increment `currentRound` and wrap `currentTeamIndex` to 0; if `currentRound` would exceed `totalRounds`, set `phase 'gameOver'`; otherwise `phase 'handoff'` with `skipsLeft` reset to `SKIPS_PER_TURN`, `turnPoints` 0, `turnEndsAt` null.

- [ ] **Step 1: Write the failing tests**

Add:

```js
import { startTurn, endTurn, nextTurn } from '../game.js';

test('startTurn sets phase and absolute deadline', () => {
  const s = startTurn(newGame({ teamNames: ['A','B'], totalRounds: 2, deckSize: 5 }), 1000, 60000);
  assert.equal(s.phase, 'turn');
  assert.equal(s.turnEndsAt, 61000);
});

test('endTurn moves to turnEnd', () => {
  assert.equal(endTurn({ phase: 'turn' }).phase, 'turnEnd');
});

test('nextTurn rotates to the next team within the same round', () => {
  const s = { ...newGame({ teamNames: ['A','B'], totalRounds: 2, deckSize: 5 }), phase: 'turnEnd', currentTeamIndex: 0, currentRound: 1, skipsLeft: 1, turnPoints: 4 };
  const n = nextTurn(s);
  assert.equal(n.phase, 'handoff');
  assert.equal(n.currentTeamIndex, 1);
  assert.equal(n.currentRound, 1);
  assert.equal(n.skipsLeft, 3);
  assert.equal(n.turnPoints, 0);
  assert.equal(n.turnEndsAt, null);
});

test('nextTurn wraps to next round after the last team', () => {
  const s = { ...newGame({ teamNames: ['A','B'], totalRounds: 2, deckSize: 5 }), phase: 'turnEnd', currentTeamIndex: 1, currentRound: 1 };
  const n = nextTurn(s);
  assert.equal(n.phase, 'handoff');
  assert.equal(n.currentTeamIndex, 0);
  assert.equal(n.currentRound, 2);
});

test('nextTurn ends the game after the last team of the last round', () => {
  const s = { ...newGame({ teamNames: ['A','B'], totalRounds: 2, deckSize: 5 }), phase: 'turnEnd', currentTeamIndex: 1, currentRound: 2 };
  const n = nextTurn(s);
  assert.equal(n.phase, 'gameOver');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:logic`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement in `game.js`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:logic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game.js tests/logic.test.mjs
git commit -m "feat: turn lifecycle and round rotation"
```

---

### Task 6: Standings with tie handling

**Files:**
- Modify: `game.js`
- Modify: `tests/logic.test.mjs`

**Interfaces:**
- Consumes: State.
- Produces: `standings(state) -> Array<{ name, score, rank }>` — teams sorted by score descending; equal scores share the same rank using standard competition ranking (1, 2, 2, 4). Does not mutate `state.teams`.

- [ ] **Step 1: Write the failing tests**

Add:

```js
import { standings } from '../game.js';

test('standings sorts by score descending with competition ranking for ties', () => {
  const state = { teams: [
    { name: 'A', score: 3 },
    { name: 'B', score: 5 },
    { name: 'C', score: 5 },
    { name: 'D', score: 1 },
  ] };
  const r = standings(state);
  assert.deepEqual(r.map((t) => t.name), ['B', 'C', 'A', 'D']);
  assert.deepEqual(r.map((t) => t.rank), [1, 1, 3, 4]);
});

test('standings does not mutate the source teams order', () => {
  const state = { teams: [{ name: 'A', score: 1 }, { name: 'B', score: 2 }] };
  standings(state);
  assert.equal(state.teams[0].name, 'A');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:logic`
Expected: FAIL — `standings` not exported.

- [ ] **Step 3: Implement in `game.js`**

```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:logic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game.js tests/logic.test.mjs
git commit -m "feat: standings with tie handling"
```

---

### Task 7: Card database and validation

**Files:**
- Create: `cards.js`
- Create: `tests/validate-cards.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const CARDS` — array of `{ w: string, t: [string,string,string,string,string] }`. `CARDS.length` is consumed by `app.js` as `deckSize`.

- [ ] **Step 1: Write the validation script `tests/validate-cards.mjs`**

```js
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
```

- [ ] **Step 2: Create `cards.js` with the full database**

Generate **~1500 Italian cards** meeting the Global Constraints (concrete, fun to describe; the 5 forbidden words are the 5 most obvious clues for that word). Draw from varied categories — animals, food & drink, objects, household items, sports, jobs, places, nature, transport, body, clothing, famous characters/fairy tales, actions/verbs, feelings-as-concrete-scenes, holidays. Format:

```js
export const CARDS = [
  { w: 'Mela', t: ['frutto', 'Biancaneve', 'rosso', 'albero', 'torta'] },
  { w: 'Pizza', t: ['margherita', 'forno', 'pomodoro', 'Napoli', 'formaggio'] },
  { w: 'Delfino', t: ['mare', 'salto', 'pesce', 'intelligente', 'acquario'] },
  { w: 'Chitarra', t: ['corde', 'musica', 'suonare', 'rock', 'strumento'] },
  { w: 'Ombrello', t: ['pioggia', 'aprire', 'bagnato', 'Mary Poppins', 'vento'] },
  // ... continue to ~1500 unique cards across the categories above
];
```

Generate in batches of ~100–150 while running `node tests/validate-cards.mjs` between batches to catch duplicates early. Keep each word unique across the whole file (the validator enforces this).

- [ ] **Step 3: Run the validator to verify it passes**

Run: `node tests/validate-cards.mjs`
Expected: `validate-cards: OK (~1500 cards)`, exit code 0.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: logic tests PASS and validator prints OK.

- [ ] **Step 5: Commit**

```bash
git add cards.js tests/validate-cards.mjs
git commit -m "feat: ~1500-card Italian database with validation"
```

---

### Task 8: Static HTML shell and styles for the five screens

**Files:**
- Create: `index.html`
- Create: `style.css`

**Interfaces:**
- Produces: DOM structure with stable IDs that `app.js` (Task 9+) reads/writes. Screens are `<section class="screen" id="screen-setup|handoff|turn|turnend|gameover">`; only the active one has class `active`.

- [ ] **Step 1: Create `index.html`**

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#7c3aed">
<title>Non lo dire</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="stylesheet" href="style.css">

<main id="app">
  <section class="screen active" id="screen-setup">
    <h1>Non lo dire</h1>
    <label>Numero di squadre
      <select id="team-count"></select>
    </label>
    <div id="team-names"></div>
    <label>Numero di round
      <input id="round-count" type="number" min="1" max="20" value="5" inputmode="numeric">
    </label>
    <button id="btn-start" class="primary big">Inizia partita</button>
    <button id="btn-resume" class="ghost hidden">Riprendi partita</button>
  </section>

  <section class="screen" id="screen-handoff">
    <p class="round-label" id="handoff-round"></p>
    <h2 id="handoff-team"></h2>
    <p>Passa il telefono a chi descrive.</p>
    <button id="btn-go" class="primary big">Via!</button>
    <div id="countdown" class="countdown hidden"></div>
  </section>

  <section class="screen" id="screen-turn">
    <div class="turn-top">
      <span id="turn-timer" class="timer">60</span>
      <div class="timerbar"><div id="turn-timerbar-fill"></div></div>
      <span id="turn-meta"></span>
    </div>
    <div class="card">
      <h2 id="card-word"></h2>
      <ul id="card-taboo"></ul>
    </div>
    <div class="turn-actions">
      <button id="btn-taboo" class="danger">✗ Vietata</button>
      <button id="btn-skip" class="ghost">Skip (<span id="skip-count">3</span>)</button>
      <button id="btn-correct" class="success">✓ Indovinata</button>
    </div>
  </section>

  <section class="screen" id="screen-turnend">
    <h2>Turno finito</h2>
    <p id="turnend-summary"></p>
    <ol id="turnend-standings" class="standings"></ol>
    <button id="btn-next" class="primary big"></button>
  </section>

  <section class="screen" id="screen-gameover">
    <h2>Risultati finali</h2>
    <ol id="gameover-standings" class="standings"></ol>
    <button id="btn-newgame" class="primary big">Nuova partita</button>
  </section>
</main>

<script type="module" src="app.js"></script>
```

- [ ] **Step 2: Create `style.css`**

```css
:root { --bg:#0f0f17; --fg:#f5f5fa; --accent:#7c3aed; --ok:#16a34a; --bad:#dc2626; --muted:#9aa0ae; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font: 500 18px/1.4 -apple-system, system-ui, sans-serif;
  background: var(--bg); color: var(--fg);
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
}
#app { max-width: 560px; margin: 0 auto; min-height: 100%; }
.screen { display: none; flex-direction: column; gap: 20px; padding: 24px; min-height: 100vh; justify-content: center; }
.screen.active { display: flex; }
.hidden { display: none !important; }
h1 { font-size: 2.4rem; text-align: center; margin: 0; color: var(--accent); }
h2 { font-size: 2rem; text-align: center; margin: 0; }
label { display: flex; flex-direction: column; gap: 8px; font-size: 1rem; color: var(--muted); }
select, input, button { font: inherit; padding: 14px; border-radius: 14px; border: 1px solid #2a2a3a; background: #1a1a26; color: var(--fg); }
button { border: 0; font-weight: 700; }
button.big { padding: 20px; font-size: 1.3rem; }
button.primary { background: var(--accent); color: #fff; }
button.success { background: var(--ok); color: #fff; }
button.danger { background: var(--bad); color: #fff; }
button.ghost { background: transparent; border: 1px solid #2a2a3a; color: var(--fg); }
button:disabled { opacity: .4; }
button:active { transform: scale(.98); }

.round-label { text-align: center; color: var(--muted); margin: 0; }
.countdown { text-align: center; font-size: 5rem; font-weight: 800; }

.turn-top { display: flex; align-items: center; gap: 12px; }
.timer { font-size: 2rem; font-weight: 800; min-width: 2.4ch; text-align: center; }
.timer.warn { color: var(--bad); }
.timerbar { flex: 1; height: 12px; background: #23232f; border-radius: 8px; overflow: hidden; }
#turn-timerbar-fill { height: 100%; width: 100%; background: var(--accent); transition: width .25s linear; }
#turn-meta { color: var(--muted); font-size: .9rem; white-space: nowrap; }

.card { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 24px; text-align: center; }
#card-word { font-size: 2.6rem; }
#card-taboo { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
#card-taboo li { background: #1a1a26; border-radius: 12px; padding: 12px; font-size: 1.3rem; }

.turn-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.turn-actions #btn-skip { grid-column: 1 / -1; }
.turn-actions button { padding: 22px; font-size: 1.2rem; }

.standings { list-style: none; counter-reset: rank; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.standings li { display: flex; justify-content: space-between; background: #1a1a26; padding: 14px; border-radius: 12px; font-size: 1.2rem; }
.standings li.leader { background: var(--accent); color: #fff; }
```

- [ ] **Step 3: Manual verification**

Run: `cd ~/Desktop/NonLoDire && python3 -m http.server 8000` then open `http://localhost:8000` in a browser.
Expected: the setup screen renders centered and dark-themed; other screens are hidden. (Empty dropdowns/lists are fine — they are populated in Task 9.) Stop the server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: static HTML shell and styles for the five screens"
```

---

### Task 9: app.js — router, setup screen, and persistence

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `newGame`, `standings` and constants from `game.js`; `CARDS` from `cards.js`.
- Produces (module-internal, used by later tasks):
  - `state` — the live game state (or null).
  - `save()` / `load()` — persist/read `{ state }` under `localStorage['nonlodire.game']`.
  - `show(phase)` — toggles the `.active` screen by phase name.
  - `render()` — dispatches to the current phase's renderer (setup renderer implemented here; others are stubs extended in later tasks).
  - `STORAGE_KEY = 'nonlodire.game'`.

- [ ] **Step 1: Create `app.js`**

```js
import { CARDS } from './cards.js';
import { newGame, startTurn, correct, taboo, skip, endTurn, nextTurn, currentCard, standings, TURN_MS, SKIPS_PER_TURN } from './game.js';

const STORAGE_KEY = 'nonlodire.game';
const $ = (id) => document.getElementById(id);
let state = null;

function save() {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify({ state }));
}
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY))?.state ?? null; }
  catch { return null; }
}
function show(phase) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${phase}`).classList.add('active');
}

// ---- Setup screen ----
function buildSetup() {
  const count = $('team-count');
  count.innerHTML = '';
  for (let n = 2; n <= 6; n++) count.append(new Option(`${n} squadre`, String(n)));
  count.value = '2';
  count.onchange = renderTeamNameInputs;
  renderTeamNameInputs();

  const saved = load();
  $('btn-resume').classList.toggle('hidden', !(saved && saved.phase !== 'gameOver'));
  $('btn-resume').onclick = () => { state = saved; render(); };
  $('btn-start').onclick = onStart;
}

function renderTeamNameInputs() {
  const n = Number($('team-count').value);
  const box = $('team-names');
  const existing = [...box.querySelectorAll('input')].map((i) => i.value);
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Squadra ${i + 1}`;
    input.value = existing[i] ?? '';
    box.append(input);
  }
}

function onStart() {
  const names = [...$('team-names').querySelectorAll('input')]
    .map((i, idx) => i.value.trim() || `Squadra ${idx + 1}`);
  const rounds = Math.min(20, Math.max(1, Number($('round-count').value) || 1));
  const prev = load();
  const carry = prev && prev.deckOrder
    ? { deckOrder: prev.deckOrder, cardIndex: prev.cardIndex }
    : {};
  state = newGame({ teamNames: names, totalRounds: rounds, deckSize: CARDS.length, ...carry });
  render();
}

// ---- Router ----
function render() {
  save();
  show(state ? phaseToScreen(state.phase) : 'setup');
  if (!state) return;
  const r = renderers[state.phase];
  if (r) r();
}
function phaseToScreen(phase) {
  return { handoff: 'handoff', turn: 'turn', turnEnd: 'turnend', gameOver: 'gameover' }[phase] ?? 'setup';
}

// Renderers are filled in by later tasks.
const renderers = {};

buildSetup();
const resumed = load();
if (resumed && resumed.phase && resumed.phase !== 'gameOver') {
  // Leave on setup; the Resume button is shown. Do not auto-resume.
}
show('setup');

// Exposed for later tasks in this module (no export needed — same file).
Object.assign(globalThis, {}); // placeholder, removed when renderers are added
```

- [ ] **Step 2: Manual verification**

Run: `python3 -m http.server 8000`, open `http://localhost:8000`.
Expected: team-count dropdown shows 2–6; changing it adds/removes name inputs; round input clamps to 1–20 on start. Clicking "Inizia partita" switches to the (still empty) handoff screen without a console error. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: app router, setup screen and localStorage persistence"
```

---

### Task 10: app.js — handoff, countdown, and the turn screen with timestamp timer + Wake Lock

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `startTurn`, `currentCard`, `CARDS`, `TURN_MS`, the `renderers`/`render`/`$` helpers from Task 9.
- Produces: `renderers.handoff`, `renderers.turn`; `startTimer()`/`stopTimer()`; `requestWakeLock()`/`releaseWakeLock()`.

- [ ] **Step 1: Add handoff renderer and countdown**

Replace the `const renderers = {};` line and the placeholder tail of `app.js` with:

```js
const renderers = {};

renderers.handoff = () => {
  $('handoff-round').textContent = `Round ${state.currentRound} di ${state.totalRounds}`;
  $('handoff-team').textContent = state.teams[state.currentTeamIndex].name;
  const cd = $('countdown');
  cd.classList.add('hidden');
  $('btn-go').classList.remove('hidden');
  $('btn-go').onclick = runCountdown;
};

function runCountdown() {
  $('btn-go').classList.add('hidden');
  const cd = $('countdown');
  cd.classList.remove('hidden');
  let n = 3;
  cd.textContent = String(n);
  const iv = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      clearInterval(iv);
      state = startTurn(state, Date.now(), TURN_MS);
      render();
    } else {
      cd.textContent = String(n);
    }
  }, 1000);
}
```

- [ ] **Step 2: Add the turn renderer, timer, and Wake Lock**

Append to `app.js`:

```js
let timerHandle = null;
let wakeLock = null;

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
}
function releaseWakeLock() {
  try { wakeLock?.release(); } catch {}
  wakeLock = null;
}

function renderCard() {
  const card = currentCard(state, CARDS);
  $('card-word').textContent = card.w;
  $('card-taboo').innerHTML = '';
  for (const t of card.t) {
    const li = document.createElement('li');
    li.textContent = t;
    $('card-taboo').append(li);
  }
  $('turn-meta').textContent =
    `${state.teams[state.currentTeamIndex].name} · punti turno: ${state.turnPoints}`;
  $('skip-count').textContent = String(state.skipsLeft);
  $('btn-skip').disabled = state.skipsLeft <= 0;
}

function tick() {
  const remainingMs = Math.max(0, state.turnEndsAt - Date.now());
  const secs = Math.ceil(remainingMs / 1000);
  $('turn-timer').textContent = String(secs);
  $('turn-timer').classList.toggle('warn', secs <= 10);
  $('turn-timerbar-fill').style.width = `${(remainingMs / TURN_MS) * 100}%`;
  if (remainingMs <= 0) {
    stopTimer();
    releaseWakeLock();
    state = endTurn(state);
    render();
  }
}
function startTimer() {
  stopTimer();
  tick();
  timerHandle = setInterval(tick, 250);
}
function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}

renderers.turn = () => {
  renderCard();
  startTimer();
  requestWakeLock();
  // Button wiring is added in Task 11.
};
```

- [ ] **Step 3: Manual verification**

Run: `python3 -m http.server 8000`, open the site, start a 1-round 2-team game, tap "Via!".
Expected: 3-2-1 countdown, then a card with word + 5 forbidden words; the timer counts down from 60 and the bar shrinks; at 10s the number turns red; at 0 it switches to the (empty) turn-end screen. Buttons don't score yet (Task 11). Stop the server.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: handoff, countdown, turn screen with timestamp timer and wake lock"
```

---

### Task 11: app.js — turn buttons, turn-end screen, and standings rendering

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `correct`, `taboo`, `skip`, `endTurn`, `nextTurn`, `standings` from `game.js`; `renderStandings` (defined here).
- Produces: wired `#btn-correct`/`#btn-taboo`/`#btn-skip`; `renderers.turnEnd`; `renderStandings(listEl, state)`.

- [ ] **Step 1: Wire the turn buttons**

In `renderers.turn`, replace the `// Button wiring is added in Task 11.` comment with:

```js
  $('btn-correct').onclick = () => act(correct);
  $('btn-taboo').onclick = () => act(taboo);
  $('btn-skip').onclick = () => act(skip);
```

Then add the `act` helper after `renderers.turn`:

```js
function act(fn) {
  state = fn(state);
  save();
  renderCard();
}
```

- [ ] **Step 2: Add standings rendering and the turn-end renderer**

Append:

```js
function renderStandings(listEl, st) {
  const rows = standings(st);
  const topScore = rows.length ? rows[0].score : 0;
  listEl.innerHTML = '';
  for (const t of rows) {
    const li = document.createElement('li');
    if (t.score === topScore) li.classList.add('leader');
    const name = document.createElement('span');
    name.textContent = `${t.rank}. ${t.name}`;
    const score = document.createElement('span');
    score.textContent = String(t.score);
    li.append(name, score);
    listEl.append(li);
  }
}

renderers.turnEnd = () => {
  stopTimer();
  releaseWakeLock();
  const team = state.teams[state.currentTeamIndex].name;
  $('turnend-summary').textContent = `${team}: ${state.turnPoints >= 0 ? '+' : ''}${state.turnPoints} in questo turno`;
  renderStandings($('turnend-standings'), state);
  const isLast = state.currentTeamIndex === state.teams.length - 1 && state.currentRound === state.totalRounds;
  $('btn-next').textContent = isLast ? 'Risultati finali' : 'Prossima squadra';
  $('btn-next').onclick = () => { state = nextTurn(state); render(); };
};
```

- [ ] **Step 3: Manual verification**

Run the server, play a full turn: tap ✓/✗/Skip and watch `punti turno`, the score, and the skip counter (Skip disables at 0). Let the timer expire.
Expected: turn-end shows the turn summary and a standings list with the leader highlighted; "Prossima squadra" advances to the next handoff, and after the last team of the last round the button reads "Risultati finali". Stop the server.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: turn buttons, turn-end summary and standings"
```

---

### Task 12: app.js — game-over screen and new game

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `renderStandings`, `buildSetup`, `STORAGE_KEY`.
- Produces: `renderers.gameOver`.

- [ ] **Step 1: Add the game-over renderer**

Append:

```js
renderers.gameOver = () => {
  stopTimer();
  releaseWakeLock();
  renderStandings($('gameover-standings'), state);
  $('btn-newgame').onclick = () => {
    // Keep team names for convenience; deck position carries over via load() in onStart.
    const names = state.teams.map((t) => t.name);
    state = null;
    buildSetup();
    const box = $('team-names');
    $('team-count').value = String(names.length);
    renderTeamNameInputs();
    [...box.querySelectorAll('input')].forEach((inp, i) => { if (names[i]) inp.value = names[i]; });
    show('setup');
  };
};
```

- [ ] **Step 2: Persist final deck position at game over**

Confirm `render()` calls `save()` before rendering (it does, from Task 9). Because the game-over state still holds `deckOrder`/`cardIndex`, the next game's `onStart` picks them up through `load()`, so the deck keeps advancing across games. No code change needed beyond this check.

- [ ] **Step 3: Manual verification**

Play a 1-round, 2-team game to the end.
Expected: final standings show; "Nuova partita" returns to setup with the previous team names prefilled. Start a second game and confirm the first cards differ from the first game's opening cards (deck carried over). Stop the server.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: game over screen and new game with carried-over deck"
```

---

### Task 13: PWA — icons, manifest, and offline service worker

**Files:**
- Create: `tools/make-icons.mjs`
- Create: `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png` (generated)
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Modify: `app.js` (register the service worker)

**Interfaces:**
- Consumes: nothing new.
- Produces: an installable, offline-capable PWA.

- [ ] **Step 1: Create the zero-dependency icon generator `tools/make-icons.mjs`**

```js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// Solid purple background with a centered white circle. No external deps.
function makePng(size) {
  const bg = [0x7c, 0x3a, 0xed], fg = [0xff, 0xff, 0xff];
  const cx = size / 2, cy = size / 2, r = size * 0.30;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      const c = inside ? fg : bg;
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

mkdirSync('icons', { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(`icons/icon-${size}.png`, makePng(size));
  console.log(`wrote icons/icon-${size}.png`);
}
```

- [ ] **Step 2: Generate the icons and verify they are valid PNGs**

Run: `cd ~/Desktop/NonLoDire && node tools/make-icons.mjs && file icons/*.png`
Expected: three lines "PNG image data, 180 x 180", "192 x 192", "512 x 512".

- [ ] **Step 3: Create `manifest.webmanifest`**

```json
{
  "name": "Non lo dire",
  "short_name": "Non lo dire",
  "description": "Party game stile Taboo",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f0f17",
  "theme_color": "#7c3aed",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Create `sw.js`**

```js
const CACHE = 'nonlodire-v1';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './game.js', './cards.js',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
```

- [ ] **Step 5: Register the service worker in `app.js`**

Add at the very top of `app.js` (after the imports):

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
```

- [ ] **Step 6: Manual verification**

Run: `python3 -m http.server 8000`, open in a browser, load once, then in DevTools → Application confirm the service worker is activated and the cache holds the assets. Reload with the network offline (DevTools → Network → Offline).
Expected: the app still loads and is fully playable offline. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add tools/make-icons.mjs icons manifest.webmanifest sw.js app.js
git commit -m "feat: PWA manifest, generated icons and offline service worker"
```

---

### Task 14: Deploy to GitHub Pages and verify on a real iPhone

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the finished PWA and the existing `origin` remote (`github.com/Giancarlo5678/non-lo-dire`).
- Produces: a live URL installable on iPhone.

- [ ] **Step 1: Create `README.md`**

```markdown
# Non lo dire

Party game stile Taboo, PWA per iPhone. A squadre, 60 secondi a turno per far
indovinare parole senza dire le 5 vietate. Si gioca dal vivo; l'app tiene punti,
timer, skip e round.

## Giocare
Apri la pagina pubblicata su iPhone (Safari) → Condividi → "Aggiungi alla schermata Home".
Funziona offline.

## Sviluppo
Nessuna dipendenza. `npm test` esegue i test della logica e valida il database carte.
Anteprima locale: `python3 -m http.server 8000` e apri http://localhost:8000
```

- [ ] **Step 2: Commit and push everything**

```bash
git add README.md
git commit -m "docs: readme with play and dev instructions"
git push -u origin main
```

- [ ] **Step 3: Enable GitHub Pages**

Run: `gh api -X POST repos/Giancarlo5678/non-lo-dire/pages -f source[branch]=main -f source[path]=/ 2>&1 || gh browse --settings`
Then confirm: `gh api repos/Giancarlo5678/non-lo-dire/pages --jq .html_url`
Expected: prints the live URL, e.g. `https://giancarlo5678.github.io/non-lo-dire/`. (If the API call is rejected, enable Pages manually: repo Settings → Pages → Source: `main` / root.)

- [ ] **Step 4: Manual verification on a real iPhone**

Open the live URL in Safari on an iPhone. Add to Home Screen. Launch from the icon.
Expected checklist:
- Launches standalone (no Safari chrome), portrait, dark theme.
- Full game playable: setup → handoff → 60s turn with working timer → scoring/skip → turn end → next team → final results.
- Screen stays awake during a turn (Wake Lock).
- Turn on Airplane Mode and relaunch: still works (offline cache).
- Lock the screen mid-turn for ~5s, unlock: the timer shows the correct reduced time (timestamp-based), not a frozen or drifted value.

- [ ] **Step 5: Final commit (if README/tweaks changed) and push**

```bash
git add -A && git commit -m "chore: finalize deploy" --allow-empty
git push
```

---

## Self-Review

**1. Spec coverage:**
- iPhone / PWA installabile → Tasks 8 (meta tags), 13 (manifest/SW/icons), 14 (deploy + Home Screen). ✓
- Gioco completo (2–6 squadre, far indovinare) → Tasks 9–12. ✓
- Punteggi squadre → Tasks 4, 6, 11. ✓
- Round 1–20 → Tasks 5 (rotation/gameOver), 9 (clamp input). ✓
- Mostra parola + 5 vietate → Tasks 7 (data, exactly 5 validated), 10 (render). ✓
- 60 secondi timestamp-based + Wake Lock → Task 10. ✓
- 3 skip senza punti → Task 4 (logic), 11 (UI, disable at 0). ✓
- +1 indovinata / −1 vietata / next card → Task 4. ✓
- DB ~1500 carte, no ripetizioni, divertenti, no astrattismi → Task 7 (generation + validator ≥1400, uniqueness). ✓
- Deck consumato tra partite + reshuffle a esaurimento → Task 3 (advance/reshuffle), 9/12 (carry via load). ✓
- Ripresa partita interrotta (localStorage) → Task 9 (Resume button). ✓
- Fine partita con vincitore/pareggi → Tasks 6, 11 (leader highlight), 12. ✓
- Testing (node/assert + card validation) → Tasks 1–7. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"-style placeholders. The one interim comment (`// Button wiring is added in Task 11.` in Task 10) is explicitly replaced in Task 11 Step 1 with concrete code. The Task 9 `Object.assign(globalThis, {})` placeholder line is naturally superseded when Task 10 replaces the `const renderers = {};` tail. ✓

**3. Type consistency:** State fields (`phase`, `teams[{name,score}]`, `totalRounds`, `currentRound`, `currentTeamIndex`, `skipsLeft`, `turnPoints`, `deckOrder`, `cardIndex`, `turnEndsAt`) are used identically across Tasks 2–12. Card shape `{ w, t:[5] }` is consistent in Tasks 7, 10, and the validator. Phase names (`handoff`, `turn`, `turnEnd`, `gameOver`) match between `game.js` (Task 5) and `phaseToScreen`/`renderers` (Tasks 9–12). Function names (`newGame`, `startTurn`, `correct`, `taboo`, `skip`, `endTurn`, `nextTurn`, `currentCard`, `standings`, `shuffle`) are stable throughout. ✓
