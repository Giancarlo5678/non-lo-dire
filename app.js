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

buildSetup();
const resumed = load();
if (resumed && resumed.phase && resumed.phase !== 'gameOver') {
  // Leave on setup; the Resume button is shown. Do not auto-resume.
}
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
  $('btn-correct').onclick = () => act(correct);
  $('btn-taboo').onclick = () => act(taboo);
  $('btn-skip').onclick = () => act(skip);
};

function act(fn) {
  state = fn(state);
  save();
  renderCard();
}

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
