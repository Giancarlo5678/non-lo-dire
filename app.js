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
