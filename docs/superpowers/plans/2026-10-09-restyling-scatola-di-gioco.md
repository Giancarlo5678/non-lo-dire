# Restyling "scatola di gioco" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridisegnare la PWA "Non lo dire" come una scatola di gioco da tavolo e sistemare l'usabilità del turno, senza toccare regole e carte.

**Architecture:** Vanilla JS a moduli ES, nessun build. `game.js` (logica pura, testata) e `cards.js` restano invariati; cambiano solo presentazione (`index.html`, `style.css`), il livello UI (`app.js`), gli asset (`fonts/`, icone) e la cache offline (`sw.js`).

**Tech Stack:** HTML/CSS/JS nativi, node:test, service worker, GitHub Pages.

Spec: `docs/superpowers/specs/2026-10-09-restyling-scatola-di-gioco-design.md`

## Global Constraints

- Zero dipendenze, nessun build step; i font sono file woff2 nel repo (licenza OFL), mai caricati da CDN.
- `game.js` e `cards.js` invariati; `npm test` (19 test + validazione carte) deve restare verde.
- Colori: `--box #A4161A`, `--paper #FDFCFA`, `--ink #1C1917`, `--table #2B211C`, `--ok #2F7D4F`.
- Caratteri: Zilla Slab 600/700 (titoli, parola, punteggi, timer), Atkinson Hyperlegible 400/700 (resto).
- Setup e passaggio telefono su fondo `--box`; turno, fine turno, risultati su `--table`.
- Tasti del turno su una riga: Vietata a sinistra, Skip al centro più stretto, Indovinata a destra.
- Niente pulsante "Annulla". Movimento solo in risposta alle azioni, spento con `prefers-reduced-motion`.
- Limiti invariati: 2–6 squadre, 1–20 round.
- `sw.js`: `CACHE = 'nonlodire-v3'`, font aggiunti ad `ASSETS`.
- Commit a nome dell'utente, senza trailer. Push su `main` solo dopo approvazione degli screenshot.

---

### Task 1: Font self-hosted e cache offline

**Files:**
- Create: `fonts/zilla-slab-600.woff2`, `fonts/zilla-slab-700.woff2`, `fonts/atkinson-hyperlegible-400.woff2`, `fonts/atkinson-hyperlegible-700.woff2`, `fonts/LICENSE.md`
- Modify: `sw.js:1-5`

**Interfaces:**
- Produces: i quattro percorsi `fonts/*.woff2` usati dalle `@font-face` del Task 2.

- [ ] **Step 1: Scaricare i sottoinsiemi latin (coprono le lettere accentate italiane)**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@600;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap")
mkdir -p fonts
# prende l'URL del blocco /* latin */ di ogni famiglia/peso
echo "$CSS" | awk '/\/\* latin \*\//{l=1} l&&/font-family/{f=$0} l&&/font-weight/{w=$2} l&&/src:/{match($0,/https:[^)]+/); print f"|"w"|"substr($0,RSTART,RLENGTH); l=0}' \
 | while IFS='|' read fam w url; do
     case "$fam" in *Zilla*) n=zilla-slab;; *) n=atkinson-hyperlegible;; esac
     curl -s -o "fonts/$n-${w%;}.woff2" "$url"; done
ls -la fonts/
```
Expected: 4 file `.woff2` da 10–40 KB ciascuno.

- [ ] **Step 2: Nota di licenza**

<!-- file: fonts/LICENSE.md -->
```markdown
# Font

- **Zilla Slab** — Mozilla Foundation, SIL Open Font License 1.1
- **Atkinson Hyperlegible** — Braille Institute of America, SIL Open Font License 1.1

Sottoinsieme latin scaricato da Google Fonts e incluso nel repo per il funzionamento offline.
Testo della licenza: https://openfontlicense.org
```

- [ ] **Step 3: Aggiungere i font alla cache e bumpare la versione** (`sw.js`, righe 1–5)

```js
const CACHE = 'nonlodire-v3';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './game.js', './cards.js',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './fonts/zilla-slab-600.woff2', './fonts/zilla-slab-700.woff2',
  './fonts/atkinson-hyperlegible-400.woff2', './fonts/atkinson-hyperlegible-700.woff2',
];
```

- [ ] **Step 4: Verifica**

Run: `file fonts/*.woff2 && npm test`
Expected: 4 righe "Web Open Font Format (Version 2)"; test tutti `pass`.

- [ ] **Step 5: Commit**

```bash
git add fonts sw.js && git commit -m "feat: font Zilla Slab e Atkinson Hyperlegible inclusi per l'offline"
```

---

### Task 2: Markup, stile e icone "scatola di gioco"

**Files:**
- Modify (intero): `index.html`, `style.css`
- Modify: `manifest.webmanifest` (colori), `tools/make-icons.mjs` (colori/disegno), `icons/*.png` (rigenerate)

**Interfaces:**
- Consumes: `fonts/*.woff2` (Task 1).
- Produces per il Task 3 — id DOM: `team-count`, `team-count-minus`, `team-count-plus`, `round-count`, `round-count-minus`, `round-count-plus` (gli `<output>` contengono il valore in `textContent`), `team-names`, `btn-start`, `btn-resume`, `handoff-round`, `handoff-team`, `btn-go`, `countdown`, `turn-timer`, `turn-timerbar-fill`, `turn-team`, `turn-points`, `card`, `card-word`, `card-taboo`, `btn-taboo`, `btn-skip`, `skip-count`, `btn-correct`, `turnend-summary`, `turnend-standings`, `btn-next`, `gameover-lead`, `gameover-winner`, `gameover-standings`, `btn-newgame`. Attributo `body[data-screen]` con valori `setup|handoff|turn|turnend|gameover`. Classi animazione sulla `.card`: `stamp`, `out-right`, `out-left`, `enter` (i nomi coincidono con i `@keyframes`). Righe classifica: `li > .rank + .name + .score`, `li.leader`.

- [ ] **Step 1: Riscrivere `index.html`**

<!-- file: index.html -->
```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#A4161A">
<title>Non lo dire</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="preload" href="fonts/zilla-slab-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="style.css">
</head>
<body data-screen="setup">
<main id="app">
  <section class="screen active" id="screen-setup">
    <header class="cover">
      <svg class="logo" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="58" fill="#FDFCFA"/>
        <circle cx="60" cy="60" r="45" fill="none" stroke="#A4161A" stroke-width="14"/>
        <path d="M42 45h36a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H59l-10 9v-9h-7a6 6 0 0 1-6-6V51a6 6 0 0 1 6-6z" fill="#1C1917"/>
        <line x1="34" y1="34" x2="86" y2="86" stroke="#A4161A" stroke-width="11"/>
      </svg>
      <h1>Non lo dire</h1>
    </header>
    <div class="field">
      <span class="field-label" id="lbl-teams">Squadre</span>
      <div class="stepper" role="group" aria-labelledby="lbl-teams">
        <button type="button" class="step" id="team-count-minus" aria-label="Una squadra in meno">−</button>
        <output id="team-count" aria-live="polite">2</output>
        <button type="button" class="step" id="team-count-plus" aria-label="Una squadra in più">+</button>
      </div>
    </div>
    <div id="team-names" class="team-names"></div>
    <div class="field">
      <span class="field-label" id="lbl-rounds">Round</span>
      <div class="stepper" role="group" aria-labelledby="lbl-rounds">
        <button type="button" class="step" id="round-count-minus" aria-label="Un round in meno">−</button>
        <output id="round-count" aria-live="polite">5</output>
        <button type="button" class="step" id="round-count-plus" aria-label="Un round in più">+</button>
      </div>
    </div>
    <button id="btn-start" class="btn btn-paper">Inizia partita</button>
    <button id="btn-resume" class="btn-link hidden">Riprendi la partita salvata</button>
  </section>

  <section class="screen" id="screen-handoff">
    <p class="round-label" id="handoff-round"></p>
    <p class="lead">Tocca a</p>
    <h2 id="handoff-team" class="big-name"></h2>
    <p class="hint">Passa il telefono a chi descrive.</p>
    <button id="btn-go" class="btn btn-paper">Via!</button>
    <div id="countdown" class="countdown hidden" aria-live="assertive"></div>
  </section>

  <section class="screen" id="screen-turn">
    <div class="turn-top">
      <span id="turn-timer" class="timer">1:00</span>
      <div class="timerbar"><div id="turn-timerbar-fill"></div></div>
    </div>
    <div class="turn-meta">
      <span id="turn-team"></span>
      <span id="turn-points"></span>
    </div>
    <article class="card" id="card">
      <h2 id="card-word" class="card-word"></h2>
      <ul id="card-taboo" class="card-taboo" aria-label="Parole vietate"></ul>
    </article>
    <div class="turn-actions">
      <button id="btn-taboo" class="btn btn-taboo">✗ Vietata</button>
      <button id="btn-skip" class="btn btn-skip">Skip <span id="skip-count">3</span></button>
      <button id="btn-correct" class="btn btn-ok">✓ Indovinata</button>
    </div>
  </section>

  <section class="screen" id="screen-turnend">
    <h2 class="title">Turno finito</h2>
    <p id="turnend-summary" class="summary"></p>
    <ol id="turnend-standings" class="sheet"></ol>
    <button id="btn-next" class="btn btn-box"></button>
  </section>

  <section class="screen" id="screen-gameover">
    <p class="lead" id="gameover-lead">Vince</p>
    <h2 id="gameover-winner" class="big-name"></h2>
    <ol id="gameover-standings" class="sheet"></ol>
    <button id="btn-newgame" class="btn btn-box">Nuova partita</button>
  </section>
</main>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Riscrivere `style.css`**

<!-- file: style.css -->
```css
@font-face { font-family: 'Zilla Slab'; src: url('fonts/zilla-slab-600.woff2') format('woff2'); font-weight: 600; font-display: swap; }
@font-face { font-family: 'Zilla Slab'; src: url('fonts/zilla-slab-700.woff2') format('woff2'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Atkinson Hyperlegible'; src: url('fonts/atkinson-hyperlegible-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Atkinson Hyperlegible'; src: url('fonts/atkinson-hyperlegible-700.woff2') format('woff2'); font-weight: 700; font-display: swap; }

:root {
  --box: #A4161A;
  --paper: #FDFCFA;
  --ink: #1C1917;
  --ink-soft: #5B524C;
  --rule: #E6E0D8;
  --table: #2B211C;
  --table-raised: #3A2E27;
  --on-dark: #F6F0EA;
  --on-dark-soft: #CDBFB3;
  --on-box-soft: #F4D9D6;
  --ok: #2F7D4F;
  --warn: #FF8E7F;
  --slab: 'Zilla Slab', Rockwell, Georgia, serif;
  --sans: 'Atkinson Hyperlegible', -apple-system, system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font: 400 18px/1.4 var(--sans);
  background: var(--table); color: var(--on-dark);
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background-color .3s;
}
/* la "copertina" della scatola: setup e passaggio del telefono */
body[data-screen="setup"], body[data-screen="handoff"] { background: var(--box); }
#app { max-width: 560px; margin: 0 auto; }
.screen { display: none; flex-direction: column; gap: 18px; padding: 24px 20px; min-height: 100vh; min-height: 100dvh; justify-content: center; }
.screen.active { display: flex; }
.hidden { display: none !important; }
h1, h2 { font-family: var(--slab); font-weight: 700; margin: 0; line-height: 1.05; }

/* --- controlli --- */
button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; }
button:disabled { opacity: .35; cursor: default; }
button:focus-visible, input:focus-visible { outline: 3px solid var(--paper); outline-offset: 3px; }
.btn { min-height: 60px; padding: 0 20px; border-radius: 14px; font-weight: 700; font-size: 1.2rem; transition: transform .08s; }
.btn:active:not(:disabled) { transform: scale(.97); }
.btn-paper { background: var(--paper); color: var(--box); font-family: var(--slab); font-size: 1.5rem; }
.btn-box { background: var(--box); color: #fff; font-family: var(--slab); font-size: 1.4rem; }
.btn-link { align-self: center; min-height: 44px; color: inherit; text-decoration: underline; text-underline-offset: 4px; font-size: 1rem; }

/* --- copertina --- */
.cover { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-bottom: 12px; }
.logo { width: 112px; height: 112px; filter: drop-shadow(0 8px 18px rgba(0, 0, 0, .3)); }
h1 { font-size: 3.2rem; color: #fff; letter-spacing: -0.01em; }
.field { display: flex; align-items: center; justify-content: space-between; }
.field-label { font-size: 1.1rem; font-weight: 700; }
.stepper { display: flex; align-items: center; gap: 6px; }
.stepper output { min-width: 2.2ch; text-align: center; font: 700 1.8rem var(--slab); font-variant-numeric: tabular-nums; }
.step { width: 48px; height: 48px; border-radius: 50%; background: rgba(0, 0, 0, .22); font-size: 1.6rem; line-height: 1; }
.team-names { display: flex; flex-direction: column; gap: 10px; }
.team-names input {
  width: 100%; font: 700 1.1rem var(--sans); padding: 14px 16px; border-radius: 12px; border: 0;
  background: var(--paper); color: var(--ink); -webkit-user-select: text; user-select: text;
}
.team-names input::placeholder { color: #8C827A; font-weight: 400; }

/* --- passaggio del telefono e risultati --- */
#screen-handoff, #screen-gameover { text-align: center; }
.round-label { margin: 0; color: var(--on-box-soft); font-size: 1rem; }
.lead { margin: 0; font-size: 1.2rem; }
.big-name { font-size: 3rem; overflow-wrap: anywhere; }
.hint { margin: 0 0 12px; }
.countdown { font: 700 9rem/1 var(--slab); font-variant-numeric: tabular-nums; }

/* --- turno --- */
.turn-top { display: flex; align-items: center; gap: 14px; }
.timer { font: 700 2.6rem/1 var(--slab); font-variant-numeric: tabular-nums; min-width: 3.2ch; }
.timer.warn { color: var(--warn); }
.timerbar { flex: 1; height: 10px; background: var(--table-raised); border-radius: 5px; overflow: hidden; }
#turn-timerbar-fill { height: 100%; width: 100%; background: var(--on-dark); transition: width .25s linear; }
.timer.warn + .timerbar #turn-timerbar-fill { background: var(--warn); }
.turn-meta { display: flex; justify-content: space-between; gap: 12px; color: var(--on-dark-soft); font-size: 1rem; margin-top: -8px; }
#turn-team { font-weight: 700; color: var(--on-dark); overflow-wrap: anywhere; }
.card {
  position: relative; flex: 1; display: flex; flex-direction: column;
  background: var(--paper); color: var(--ink); border-radius: 18px; overflow: hidden;
  box-shadow: 0 2px 0 #E2DBD1, 0 20px 40px rgba(0, 0, 0, .45);
}
.card-word { background: var(--box); color: #fff; text-align: center; font-size: clamp(2rem, 9vw, 2.6rem); padding: 26px 16px; overflow-wrap: anywhere; }
.card-taboo { list-style: none; margin: 0; padding: 4px 20px; flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; }
.card-taboo li { text-align: center; font-weight: 700; font-size: 1.4rem; padding: 10px 0; }
.card-taboo li + li { border-top: 1px solid var(--rule); }
.turn-actions { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; }
.btn-taboo { background: var(--box); color: #fff; padding: 0 10px; }
.btn-ok { background: var(--ok); color: #fff; padding: 0 10px; }
.btn-skip { border: 2px solid var(--on-dark-soft); color: var(--on-dark); padding: 0 14px; font-size: 1.05rem; }

/* timbro "VIETATA" e uscite della carta (i nomi delle classi = nomi dei keyframes, usati da app.js) */
.card::after {
  content: 'VIETATA'; position: absolute; top: 46%; left: 50%;
  transform: translate(-50%, -50%) rotate(-14deg) scale(1.6);
  padding: 6px 16px; border: 5px solid var(--box); border-radius: 10px;
  color: var(--box); background: rgba(253, 252, 250, .85);
  font: 700 2.6rem var(--slab); letter-spacing: .04em; opacity: 0; pointer-events: none;
}
.card.stamp::after { animation: stamp .5s ease-out forwards; }
.card.out-right { animation: out-right .26s ease-in forwards; }
.card.out-left { animation: out-left .26s ease-in forwards; }
.card.enter { animation: enter .18s ease-out; }
@keyframes stamp {
  0% { opacity: 0; transform: translate(-50%, -50%) rotate(-14deg) scale(1.6); }
  40%, 100% { opacity: 1; transform: translate(-50%, -50%) rotate(-14deg) scale(1); }
}
@keyframes out-right { to { transform: translateX(115%) rotate(8deg); opacity: 0; } }
@keyframes out-left { to { transform: translateX(-115%) rotate(-8deg); opacity: 0; } }
@keyframes enter { from { transform: scale(.96); opacity: 0; } }

/* --- fine turno e risultati: foglio segnapunti --- */
.title { text-align: center; font-size: 2.4rem; }
.summary { text-align: center; margin: 0; font-size: 1.2rem; color: var(--on-dark-soft); }
.sheet { list-style: none; margin: 0; padding: 6px 18px; background: var(--paper); color: var(--ink); border-radius: 14px; box-shadow: 0 16px 34px rgba(0, 0, 0, .4); text-align: left; }
.sheet li { display: flex; align-items: baseline; gap: 12px; padding: 14px 0; font-size: 1.15rem; }
.sheet li + li { border-top: 1px solid var(--rule); }
.sheet .rank { width: 1.6ch; color: var(--ink-soft); font: 700 1.1rem var(--slab); }
.sheet .name { flex: 1; font-weight: 700; overflow-wrap: anywhere; }
.sheet .score { font: 700 1.6rem var(--slab); font-variant-numeric: tabular-nums; }
.sheet li.leader .name, .sheet li.leader .score { color: var(--box); }

@media (prefers-reduced-motion: reduce) {
  .card, .card::after { animation: none !important; }
  body { transition: none; }
}
```

- [ ] **Step 3: Colori del manifest** — in `manifest.webmanifest` sostituire:

```json
  "background_color": "#A4161A",
  "theme_color": "#A4161A",
```

- [ ] **Step 4: Icona col cartello di divieto** — in `tools/make-icons.mjs` sostituire il commento e il corpo del ciclo dei pixel (righe 4–17):

```js
// Cartello di divieto: fondo rosso scatola, disco bianco, anello e barra rossi. No external deps.
function makePng(size) {
  const red = [0xa4, 0x16, 0x1a], white = [0xfd, 0xfc, 0xfa];
  const cx = size / 2, cy = size / 2;
  const rDisk = size * 0.36, rRingOut = size * 0.32, rRingIn = size * 0.24, bar = size * 0.035;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const onBar = Math.abs((x - cx) - (y - cy)) / Math.SQRT2 <= bar;
      let c = red;
      if (d <= rDisk) c = white;
      if (d <= rRingOut && d > rRingIn) c = red;
      if (d <= rRingIn) c = onBar ? red : white;
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2];
    }
  }
```
Run: `npm run icons && file icons/*.png`
Expected: 3 PNG (180, 192, 512) rigenerati.

- [ ] **Step 5: Verifica statica** — `npm test` verde (la logica non è toccata). La UI si verifica nel Task 3, perché `app.js` usa ancora i vecchi id.

- [ ] **Step 6: Commit** (insieme al Task 3: questo task da solo lascia la UI senza JS coerente)

---

### Task 3: Livello UI in `app.js`

**Files:**
- Modify (intero): `app.js`

**Interfaces:**
- Consumes: id e classi del Task 2; da `game.js` (invariato): `newGame`, `startTurn`, `correct`, `taboo`, `skip`, `endTurn`, `nextTurn`, `currentCard`, `standings`, `TURN_MS`. `skip` ritorna lo stesso oggetto se non restano skip.

- [ ] **Step 1: Riscrivere `app.js`**

<!-- file: app.js -->
```js
import { CARDS } from './cards.js';
import { newGame, startTurn, correct, taboo, skip, endTurn, nextTurn, currentCard, standings, TURN_MS } from './game.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

const STORAGE_KEY = 'nonlodire.game';
const $ = (id) => document.getElementById(id);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let state = null;

function save() {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify({ state }));
}
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY))?.state ?? null; }
  catch { return null; }
}

// Copertina (rossa) per setup e passaggio del telefono, tavolo (scuro) per il resto.
const COVER = new Set(['setup', 'handoff']);
function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(`screen-${screen}`).classList.add('active');
  document.body.dataset.screen = screen;
  document.querySelector('meta[name="theme-color"]').content = COVER.has(screen) ? '#A4161A' : '#2B211C';
}

// ---- Setup screen ----
// Stepper [−] n [+]: il valore vive nel textContent dell'<output>. Ritorna un setter.
function bindStepper(id, min, max, onChange = () => {}) {
  const out = $(id), minus = $(`${id}-minus`), plus = $(`${id}-plus`);
  const set = (v) => {
    const n = Math.min(max, Math.max(min, v));
    out.textContent = String(n);
    minus.disabled = n <= min;
    plus.disabled = n >= max;
    onChange();
  };
  minus.onclick = () => set(Number(out.textContent) - 1);
  plus.onclick = () => set(Number(out.textContent) + 1);
  set(Number(out.textContent));
  return set;
}

let setTeamCount = () => {};

function buildSetup() {
  setTeamCount = bindStepper('team-count', 2, 6, renderTeamNameInputs);
  bindStepper('round-count', 1, 20);
  setTeamCount(2);

  const saved = load();
  $('btn-resume').classList.toggle('hidden', !(saved && saved.phase !== 'gameOver'));
  $('btn-resume').onclick = () => { state = saved; render(); };
  $('btn-start').onclick = onStart;
}

function renderTeamNameInputs() {
  const n = Number($('team-count').textContent);
  const box = $('team-names');
  const existing = [...box.querySelectorAll('input')].map((i) => i.value);
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Squadra ${i + 1}`;
    input.setAttribute('aria-label', `Nome della squadra ${i + 1}`);
    input.maxLength = 24;
    input.autocapitalize = 'words';
    input.enterKeyHint = i < n - 1 ? 'next' : 'done';
    input.value = existing[i] ?? '';
    box.append(input);
  }
}

function onStart() {
  const names = [...$('team-names').querySelectorAll('input')]
    .map((i, idx) => i.value.trim() || `Squadra ${idx + 1}`);
  const rounds = Number($('round-count').textContent);
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

const renderers = {};

renderers.handoff = () => {
  $('handoff-round').textContent = `Round ${state.currentRound} di ${state.totalRounds}`;
  $('handoff-team').textContent = state.teams[state.currentTeamIndex].name;
  $('countdown').classList.add('hidden');
  $('btn-go').classList.remove('hidden');
  $('btn-go').onclick = runCountdown;
};

function runCountdown() {
  $('btn-go').onclick = null;
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

buildSetup();
show('setup');

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
}

function renderMeta() {
  $('turn-team').textContent = state.teams[state.currentTeamIndex].name;
  const p = state.turnPoints;
  $('turn-points').textContent = `turno ${p > 0 ? '+' : ''}${p}`;
  $('skip-count').textContent = String(state.skipsLeft);
  $('btn-skip').disabled = state.skipsLeft <= 0;
}

const formatTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

function tick() {
  if (!state || state.phase !== 'turn') { stopTimer(); return; }
  const remainingMs = Math.max(0, state.turnEndsAt - Date.now());
  const secs = Math.ceil(remainingMs / 1000);
  $('turn-timer').textContent = formatTime(secs);
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

// Durante l'animazione della carta i tasti sono ignorati (niente doppi tocchi).
let busy = false;

renderers.turn = () => {
  busy = false; // un'animazione interrotta dalla fine del turno non deve bloccare il turno dopo
  $('card').className = 'card';
  renderCard();
  renderMeta();
  startTimer();
  requestWakeLock();
  $('btn-correct').onclick = () => act(correct, 'out-right');
  $('btn-taboo').onclick = () => act(taboo, 'stamp');
  $('btn-skip').onclick = () => act(skip, 'out-left');
};

function act(fn, anim) {
  if (busy || !state || state.phase !== 'turn') return;
  const next = fn(state);
  if (next === state) return; // skip esauriti
  state = next;
  save();
  renderMeta();
  if (reducedMotion.matches) { renderCard(); return; }
  busy = true;
  const card = $('card');
  card.className = `card ${anim}`;
  const onEnd = (e) => {
    if (e.animationName !== anim) return; // ignora la fine di altre animazioni (es. 'enter')
    card.removeEventListener('animationend', onEnd);
    card.className = 'card enter';
    renderCard();
    busy = false;
  };
  card.addEventListener('animationend', onEnd);
}

function renderStandings(listEl, st) {
  const rows = standings(st);
  const topScore = rows.length ? rows[0].score : 0;
  listEl.innerHTML = '';
  for (const t of rows) {
    const li = document.createElement('li');
    if (t.score === topScore) li.classList.add('leader');
    for (const [cls, text] of [['rank', t.rank], ['name', t.name], ['score', t.score]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = String(text);
      li.append(span);
    }
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

renderers.gameOver = () => {
  stopTimer();
  releaseWakeLock();
  const winners = standings(state).filter((t) => t.rank === 1).map((t) => t.name);
  $('gameover-lead').textContent = winners.length > 1 ? 'Pareggio tra' : 'Vince';
  $('gameover-winner').textContent = winners.join(' e ');
  renderStandings($('gameover-standings'), state);
  $('btn-newgame').onclick = () => {
    // Keep team names for convenience; deck position carries over via load() in onStart.
    const names = state.teams.map((t) => t.name);
    state = null;
    buildSetup();
    setTeamCount(names.length);
    [...$('team-names').querySelectorAll('input')].forEach((inp, i) => { if (names[i]) inp.value = names[i]; });
    show('setup');
  };
};
```

- [ ] **Step 2: Test della logica** — Run: `npm test` → Expected: tutti `pass`.

- [ ] **Step 3: Smoke test nel browser** — `python3 -m http.server 8765`, poi con Playwright a 390×844:
  partita 2 squadre × 1 round; nel turno premere Indovinata, Vietata, Skip ×4 (il 4° ignorato:
  `skip-count` resta 0 e il tasto è disabilitato). Expected: punti turno `turno +0`, nessun errore
  in console, schermata `turnend` allo scadere, `gameover` alla fine con "Vince"/"Pareggio tra".

- [ ] **Step 4: Commit (Task 2 + 3)**

```bash
git add index.html style.css app.js manifest.webmanifest tools/make-icons.mjs icons
git commit -m "feat: restyling scatola di gioco — carta stampata, stepper, tasti del turno su una riga"
```

---

### Task 4: Verifica completa, documentazione, pubblicazione

**Files:**
- Modify: `README.md` (sezione grafica/deploy), `HANDOFF.md` (riga grafica e `CACHE` ora `nonlodire-v3`)

- [ ] **Step 1: Screenshot iPhone 390×844** di setup, passaggio, countdown, turno (normale, ultimi 10 s, timbro Vietata), fine turno, risultati. Controlli: tre tasti su una riga; nessun testo tagliato con un nome squadra di 24 caratteri; contrasto testi ≥ 4.5:1.
- [ ] **Step 2: Offline** — servire il sito, caricarlo una volta, poi Playwright `context.setOffline(true)` e ricaricare: app visibile e `document.fonts.check('700 16px "Zilla Slab"')` = `true`.
- [ ] **Step 3: Docs** — `HANDOFF.md`: `CACHE` corrente `nonlodire-v3`; grafica → token in `:root` di `style.css`, font in `fonts/`. `README.md`: stesse due informazioni.
- [ ] **Step 4: Commit** — `git commit -am "docs: aggiorna handoff e readme per il restyling"`
- [ ] **Step 5: Mostrare gli screenshot all'utente; solo dopo il suo ok:** `git push origin main`, attendere GitHub Pages (~1 min), verificare `https://giancarlo5678.github.io/non-lo-dire/` (200, `sw.js` con `nonlodire-v3`). Poi rimuovere il clone locale.
