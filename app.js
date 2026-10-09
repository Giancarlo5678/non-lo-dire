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
  $('turn-points').textContent = `turno ${signed(state.turnPoints)}`;
  $('skip-count').textContent = String(state.skipsLeft);
  $('btn-skip').disabled = state.skipsLeft <= 0;
}

// Punti con segno tipografico: +2, 0, −1 (meno vero, non il trattino)
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

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
  $('turnend-summary').textContent = `${team}: ${signed(state.turnPoints)} in questo turno`;
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
