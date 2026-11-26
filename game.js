// Neon Prism v0.3.0 — game shell (Canvas 2D rendering, screens, feel).
// Pure sim lives in physics.js; this file owns presentation + input.
import {
  VERSION, CHAMBERS, chamberById, startRun, rotateMirror,
  mirrorIndexAt, solve, rankFor,
} from './physics.js';

const SAVE_KEY = 'neon-prism-save-v1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function defaultSave() {
  return {
    version: 1,
    best: {},
    unlocked: 1,
    settings: { volume: 0.8, shake: 1, music: true, sfx: true, flash: true, muted: false, textSize: 'normal', contrast: false },
  };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    const d = defaultSave();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  } catch { return defaultSave(); }
}
const save = loadSave();
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

// ------------------------------------------------------------------ audio
let audioCtx = null;
let masterGain = null;
let musicTimer = null;
let musicStep = 0;
const audioState = { hasAudio: false, musicOn: false, musicPlaying: false };

function ensureAudio() {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = save.settings.muted ? 0 : save.settings.volume;
    masterGain.connect(audioCtx.destination);
    audioState.hasAudio = true;
  } catch { audioCtx = null; }
}
function tone(freq, dur, type = 'sine', vol = 0.2, when = 0) {
  if (!audioCtx || !save.settings.sfx || save.settings.muted) return;
  const t = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g); g.connect(masterGain);
  osc.start(t); osc.stop(t + dur + 0.05);
}
const sfx = {
  tick() { tone(1200, 0.05, 'square', 0.06); },
  rotate() { tone(660, 0.09, 'triangle', 0.18); tone(990, 0.07, 'triangle', 0.12, 0.04); },
  denied() { tone(160, 0.16, 'sawtooth', 0.16); },
  lit() { tone(880, 0.14, 'sine', 0.22); tone(1320, 0.18, 'sine', 0.16, 0.06); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, i * 0.09)); },
  lose() { tone(220, 0.3, 'sawtooth', 0.18); tone(147, 0.4, 'sawtooth', 0.16, 0.12); },
};
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]];
function musicLift() {
  // Generative music lifts with receptors lit: base octave, +1 octave
  // with one lit, +2 octaves with two or more (M3 feel pass).
  const lit = state.run ? state.run.trace.litCount : 0;
  return lit === 0 ? 1 : lit === 1 ? 2 : 4;
}
function musicTick() {
  if (!audioCtx || !save.settings.music || save.settings.muted) return;
  const chord = CHORDS[Math.floor(musicStep / 4) % CHORDS.length];
  const lift = musicLift();
  const note = chord[musicStep % chord.length] * lift;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = note;
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(g); g.connect(masterGain);
  osc.start(t); osc.stop(t + 0.55);
  musicStep++;
}
function setMusic(on) {
  save.settings.music = on;
  audioState.musicOn = on;
  if (on && audioCtx && !musicTimer) {
    musicTimer = setInterval(musicTick, 280);
    audioState.musicPlaying = true;
  } else if (!on && musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
    audioState.musicPlaying = false;
  }
  persist();
}

// ------------------------------------------------------------------ state
const state = {
  phase: 'menu', // menu | chambers | howto | settings | playing | pause | complete | gameover
  chamberId: 1,
  run: null,
  demoRun: null,
  demoChamber: 1,
  demoTimer: 0,
  selected: 0,
  kbSelect: false, // selection box shows only after keyboard input (M1 playtest: a default box on mirror 0 was a soft hint)
  autopilot: false,
  autopilotTimer: 0,
  autopilotPath: [],
  done: false,
  won: false,
  sessionUnlock: false,
};
const feel = {
  trauma: 0, timeScale: 1, slowMoT: 0, hitStopT: 0,
  flashT: 0, flashMax: 0, flashColor: '255,255,255', zoomT: 0,
  particles: [], pops: [], shockwaves: [],
  mirrorAnim: new Map(), // index -> { t, from, to }
  // Cumulative feedback-bundle counters (M3): every game event fires its
  // bundle within the same frame as the input; the render check asserts
  // these move so no event can silently go dead.
  fxCounts: { rotate: 0, lit: 0, solve: 0, fail: 0, block: 0, denied: 0 },
};
let dprCap = 2;
let fpsLowT = 0;
let fpsFrames = 0;
let fpsTime = 0;
let fpsShown = 0;

const $ = (id) => document.getElementById(id);
const screens = ['menu', 'chambers', 'howto', 'settings', 'pause', 'complete', 'gameover'];
function showScreen(name) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  $('hud').classList.toggle('hidden', !(name === null || state.phase === 'playing' || state.phase === 'pause'));
  if (name === 'menu') refreshMenu();
  if (name === 'chambers') refreshChambers();
  const focusMap = { menu: 'btn-play', chambers: null, howto: 'btn-howto-back', settings: 'btn-settings-back', pause: 'btn-resume', complete: 'btn-next', gameover: 'btn-retry' };
  const f = focusMap[name];
  if (f) { const el = $(f); if (el) el.focus(); }
  if (name === 'chambers') {
    const first = document.querySelector('#chamber-grid .level-card:not(:disabled)');
    if (first) first.focus();
    const panel = document.querySelector('#chambers .panel');
    if (panel) panel.scrollTop = 0;
  }
}

function toast(msg, ms = 2200) {
  const el = $('hud-toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}
function clearTransient() {
  $('hud-toast').classList.add('hidden');
  clearTimeout(toast._t);
  feel.pops.length = 0;
}

function refreshMenu() {
  const cleared = Object.keys(save.best).length;
  $('menu-best').textContent = cleared > 0 ? `${cleared} chamber${cleared === 1 ? '' : 's'} cleared` : 'No chambers cleared yet — Play starts Chamber 1.';
}
function refreshChambers() {
  const grid = $('chamber-grid');
  grid.innerHTML = '';
  for (const c of CHAMBERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'level-card';
    const locked = c.id > save.unlocked && !state.sessionUnlock;
    b.disabled = locked;
    const best = save.best[c.id];
    b.innerHTML = `<span class="card-name">${c.id}. ${c.name}</span>` +
      (locked ? '<span class="card-best">Locked</span>' :
        best ? `<span class="card-best">Best ${best.score}</span><span class="card-rank">RANK ${best.rank}</span>` :
        '<span class="card-best">Not cleared</span>');
    b.addEventListener('click', () => { sfx.tick(); startChamber(c.id); });
    b.addEventListener('mouseenter', () => sfx.tick());
    grid.appendChild(b);
  }
}

// ------------------------------------------------------------------ run control
function startChamber(id) {
  ensureAudio();
  const run = startRun(id);
  if (!run) return;
  state.run = run;
  state.chamberId = id;
  state.phase = 'playing';
  state.done = false;
  state.won = false;
  state.selected = 0;
  state.kbSelect = false;
  state.autopilotPath = [];
  state.autopilotTimer = 0;
  feel.mirrorAnim.clear();
  clearTransient();
  showScreen(null);
  $('hud').classList.remove('hidden');
  updateHud();
  toast(run.chamber.hint, 3200);
  if (save.settings.music) setMusic(true);
}

function endRun() {
  const run = state.run;
  if (!run) return;
  state.done = true;
  state.won = run.phase === 'won';
  if (run.phase === 'won') {
    const rank = rankFor(run);
    const prev = save.best[run.chamber.id];
    if (!prev || run.score > prev.score) {
      save.best[run.chamber.id] = { score: run.score, moves: run.moves, time: Math.round(run.time * 10) / 10, rank };
    }
    if (run.chamber.id >= save.unlocked) save.unlocked = Math.min(CHAMBERS.length, run.chamber.id + 1);
    persist();
    // Solve bundle (M3): hit-stop + slow-mo + flash + zoom + shockwave
    // ring + gold bursts on every receptor + the score as a number pop.
    feel.fxCounts.solve++;
    sfx.win();
    feel.hitStopT = 0.12;
    feel.slowMoT = 0.5;
    feel.flashColor = '255,255,255';
    feel.flashT = save.settings.flash ? 0.4 : 0;
    feel.flashMax = 0.4;
    feel.zoomT = 0.4;
    feel.shockwaves.push({ x: run.chamber.cols / 2, y: run.chamber.rows / 2, t: 0, life: 0.6 });
    for (const r of run.chamber.receptors) burst(r.x + 0.5, r.y + 0.5, '#ffd23d', 16);
    burst(run.chamber.cols / 2, run.chamber.rows / 2, '#ffd23d', 40);
    feel.pops.push({ x: run.chamber.cols / 2, y: run.chamber.rows / 2 - 0.5, text: '+' + run.score, t: 0 });
    setTimeout(() => {
      if (state.phase !== 'playing') return;
      state.phase = 'complete';
      const isLast = run.chamber.id >= CHAMBERS.length;
      $('complete-title').textContent = isLast ? 'All Chambers Clear' : 'Chamber Clear';
      $('complete-rank').textContent = 'RANK ' + rankFor(run);
      $('complete-score').textContent = 'Score ' + run.score;
      $('complete-detail').textContent = `${run.chamber.name} cleared in ${run.moves} moves (par ${run.chamber.parMoves})`;
      const parts = run.scoreParts;
      $('complete-parts').textContent = parts
        ? `Clear ${parts.clear} + Efficiency ${parts.efficiency} + Time ${parts.time} = ${run.score}`
        : '';
      // M2 carry-over: the last chamber used to show a disabled primary
      // button labelled "All Chambers Clear" — a dead-button look. Hide
      // it; the title carries the message and Menu is the action.
      $('btn-next').classList.toggle('hidden', isLast);
      $('btn-next').disabled = isLast;
      $('btn-next').textContent = 'Next Chamber';
      showScreen('complete');
      if (isLast) $('btn-complete-menu').focus();
    }, 900);
  } else {
    // Budget-fail bundle (M3): lose sting + heavy shake + red flash +
    // endpoint sparks + the partial score as a number pop.
    feel.fxCounts.fail++;
    sfx.lose();
    feel.trauma = Math.min(1, feel.trauma + 0.6);
    feel.flashColor = '255,60,60';
    feel.flashT = save.settings.flash ? 0.35 : 0;
    feel.flashMax = 0.35;
    for (const ep of run.trace.endpoints) burst(ep.x + 0.5, ep.y + 0.5, '#ff3df0', 6);
    if (run.score > 0) feel.pops.push({ x: run.chamber.cols / 2, y: run.chamber.rows / 2 - 0.5, text: '+' + run.score, t: 0 });
    setTimeout(() => {
      if (state.phase !== 'playing') return;
      state.phase = 'gameover';
      $('gameover-detail').textContent = `${run.chamber.name}: ${run.trace.litCount}/${run.trace.total} receptors lit in ${run.moves} moves. Score ${run.score}.`;
      showScreen('gameover');
    }, 700);
  }
}

function quitToMenu() {
  state.phase = 'menu';
  state.run = null;
  state.autopilot = false;
  clearTransient();
  showScreen('menu');
}

function updateHud() {
  const run = state.run;
  if (!run) return;
  $('hud-chamber').textContent = `Chamber ${run.chamber.id}: ${run.chamber.name}`;
  $('hud-receptors').textContent = `Receptors ${run.trace.litCount}/${run.trace.total}`;
  const left = run.chamber.budget - run.moves;
  $('hud-moves').textContent = `Moves left ${left}`;
  const fill = $('hud-moves-fill');
  fill.style.width = `${Math.max(0, (left / run.chamber.budget) * 100)}%`;
  // MOVES meter low state (M3): the last move reads magenta, not gold.
  fill.classList.toggle('low', left <= 1);
  $('hud-score').textContent = `Score ${run.score}`;
}

// ------------------------------------------------------------------ input
function cellFromEvent(ev) {
  const run = state.run || state.demoRun;
  if (!run) return null;
  const rect = canvas.getBoundingClientRect();
  const layout = computeLayout(run.chamber);
  const px = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const py = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const cx = Math.floor((px - layout.ox) / layout.cell);
  const cy = Math.floor((py - layout.oy) / layout.cell);
  if (cx < 0 || cx >= run.chamber.cols || cy < 0 || cy >= run.chamber.rows) return null;
  return { x: cx, y: cy };
}

function tryRotate(index) {
  const run = state.run;
  if (!run || state.phase !== 'playing') return false;
  const from = run.orients[index];
  const ok = rotateMirror(run, index);
  if (!ok) {
    feel.fxCounts.denied++;
    sfx.denied();
    if (run.deniedReason === 'fixed') toast('Fixed mirror — it cannot rotate.');
    else if (run.deniedReason === 'budget') toast('No moves left.');
    return false;
  }
  // Rotate-snap bundle (M3): sound + sparks at the mirror + micro-shake,
  // all in the same frame as the tap.
  feel.fxCounts.rotate++;
  feel.mirrorAnim.set(index, { t: 0, from, to: run.orients[index] });
  sfx.rotate();
  const m = run.chamber.mirrors[index];
  burst(m.x + 0.5, m.y + 0.5, '#22e6ff', 8);
  feel.trauma = Math.min(1, feel.trauma + 0.08);
  // Beam-block bundle (M3): sparks where each beam head dies at a wall
  // or the chamber edge, so a wrong bend reads instantly.
  for (const ep of run.trace.endpoints) {
    burst(ep.x + 0.5, ep.y + 0.5, '#7df2ff', 3);
    feel.fxCounts.block++;
  }
  if (run.lastLit) {
    feel.fxCounts.lit++;
    sfx.lit();
    feel.trauma = Math.min(1, feel.trauma + 0.1);
    toast(`Receptor lit — ${run.lastLit.count}/${run.lastLit.total}`);
    const r = run.chamber.receptors[run.lastLit.index];
    burst(r.x + 0.5, r.y + 0.5, '#ff3df0', 18);
    feel.pops.push({ x: r.x + 0.5, y: r.y, text: 'LIT', t: 0 });
  }
  updateHud();
  if (run.phase !== 'playing') endRun();
  return true;
}

canvas.addEventListener('pointerdown', (ev) => {
  ensureAudio();
  if (state.phase !== 'playing' || !state.run) return;
  const cell = cellFromEvent(ev);
  if (!cell) return;
  const idx = mirrorIndexAt(state.run.chamber, cell.x, cell.y);
  if (idx >= 0) {
    state.selected = idx;
    tryRotate(idx);
  } else {
    sfx.denied();
    toast('No mirror there — tap a mirror to rotate it.');
  }
});

window.addEventListener('keydown', (ev) => {
  ensureAudio();
  const k = ev.key;
  if (k === 'm' || k === 'M') {
    save.settings.muted = !save.settings.muted;
    if (masterGain) masterGain.gain.value = save.settings.muted ? 0 : save.settings.volume;
    persist();
    return;
  }
  if (state.phase === 'playing') {
    if (k === 'p' || k === 'P' || k === 'Escape') { pauseGame(); return; }
    if (k === 'r' || k === 'R') { startChamber(state.chamberId); return; }
    const rot = state.run.chamber.mirrors.map((m, i) => (m.fixed ? -1 : i)).filter((i) => i >= 0);
    if (k === 'Tab' || k === 'ArrowRight' || k === 'ArrowDown') {
      ev.preventDefault();
      state.kbSelect = true;
      const pos = rot.indexOf(state.selected);
      state.selected = rot[(pos + 1) % rot.length];
      sfx.tick();
    } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
      ev.preventDefault();
      state.kbSelect = true;
      const pos = rot.indexOf(state.selected);
      state.selected = rot[(pos - 1 + rot.length) % rot.length];
      sfx.tick();
    } else if (k === ' ' || k === 'Enter') {
      ev.preventDefault();
      state.kbSelect = true;
      tryRotate(state.selected);
    }
  } else if (state.phase === 'pause' && (k === 'p' || k === 'P' || k === 'Escape' || k === 'Enter')) {
    resumeGame();
  }
});

function pauseGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'pause';
  showScreen('pause');
}
function resumeGame() {
  if (state.phase !== 'pause') return;
  state.phase = 'playing';
  showScreen(null);
  $('hud').classList.remove('hidden');
}

// Buttons (hover tick + press feedback via CSS).
function bind(id, fn) {
  const el = $(id);
  el.addEventListener('click', () => { ensureAudio(); sfx.tick(); fn(); });
  el.addEventListener('mouseenter', () => sfx.tick());
}
bind('btn-play', () => startChamber(Math.min(save.unlocked, CHAMBERS.length)));
bind('btn-chambers', () => { state.phase = 'chambers'; showScreen('chambers'); });
bind('btn-howto', () => { state.phase = 'howto'; showScreen('howto'); });
bind('btn-settings', () => { state.phase = 'settings'; showScreen('settings'); });
bind('btn-chambers-back', () => { state.phase = 'menu'; showScreen('menu'); });
bind('btn-howto-back', () => { state.phase = 'menu'; showScreen('menu'); });
bind('btn-settings-back', () => { state.phase = 'menu'; showScreen('menu'); });
bind('btn-pause', () => pauseGame());
bind('btn-resume', () => resumeGame());
bind('btn-restart', () => startChamber(state.chamberId));
bind('btn-quit', () => quitToMenu());
bind('btn-next', () => startChamber(Math.min(state.chamberId + 1, CHAMBERS.length)));
bind('btn-complete-menu', () => quitToMenu());
bind('btn-retry', () => startChamber(state.chamberId));
bind('btn-gameover-menu', () => quitToMenu());

// Settings wiring.
function applySettings() {
  const s = save.settings;
  $('set-volume').value = Math.round(s.volume * 100);
  $('set-shake').value = Math.round(s.shake * 100);
  $('set-music').checked = s.music;
  $('set-sfx').checked = s.sfx;
  $('set-flash').checked = s.flash;
  $('set-textlarge').checked = s.textSize === 'large';
  $('set-contrast').checked = s.contrast;
  document.body.classList.toggle('text-large', s.textSize === 'large');
  document.body.classList.toggle('high-contrast', s.contrast);
  if (masterGain) masterGain.gain.value = s.muted ? 0 : s.volume;
}
$('set-volume').addEventListener('input', (e) => { save.settings.volume = e.target.value / 100; applySettings(); persist(); });
$('set-shake').addEventListener('input', (e) => { save.settings.shake = e.target.value / 100; persist(); });
$('set-music').addEventListener('change', (e) => setMusic(e.target.checked));
$('set-sfx').addEventListener('change', (e) => { save.settings.sfx = e.target.checked; persist(); });
$('set-flash').addEventListener('change', (e) => { save.settings.flash = e.target.checked; persist(); });
$('set-textlarge').addEventListener('change', (e) => { save.settings.textSize = e.target.checked ? 'large' : 'normal'; applySettings(); persist(); });
$('set-contrast').addEventListener('change', (e) => { save.settings.contrast = e.target.checked; applySettings(); persist(); });

// ------------------------------------------------------------------ particles
function burst(gx, gy, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.5 + Math.random() * 2.5;
    feel.particles.push({
      x: gx, y: gy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      t: 0, life: 0.4 + Math.random() * 0.4, color,
    });
  }
  if (feel.particles.length > 400) feel.particles.splice(0, feel.particles.length - 400);
}

// ------------------------------------------------------------------ layout + render
function computeLayout(chamber) {
  const W = canvas.width;
  const H = canvas.height;
  const cell = Math.floor(Math.min(W / (chamber.cols + 1), H / (chamber.rows + 2.2)));
  const gw = cell * chamber.cols;
  const gh = cell * chamber.rows;
  return { cell, ox: (W - gw) / 2, oy: (H - gh) / 2 + cell * 0.4, gw, gh };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);

function draw(run, dt) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#070718';
  ctx.fillRect(0, 0, W, H);
  if (!run) return;
  const chamber = run.chamber;
  const { cell, ox, oy } = computeLayout(chamber);
  const px = (gx) => ox + gx * cell;
  const py = (gy) => oy + gy * cell;

  // Shake + zoom punch.
  const shakeAmp = feel.trauma * feel.trauma * 14 * save.settings.shake;
  const sx = (Math.random() - 0.5) * 2 * shakeAmp;
  const sy = (Math.random() - 0.5) * 2 * shakeAmp;
  ctx.save();
  ctx.translate(W / 2 + sx, H / 2 + sy);
  const zoom = 1 + (feel.zoomT > 0 ? feel.zoomT * 0.06 : 0);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);

  // Grid.
  ctx.strokeStyle = 'rgba(80, 80, 200, 0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= chamber.cols; x++) {
    ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(chamber.rows)); ctx.stroke();
  }
  for (let y = 0; y <= chamber.rows; y++) {
    ctx.beginPath(); ctx.moveTo(px(0), py(y)); ctx.lineTo(px(chamber.cols), py(y)); ctx.stroke();
  }
  ctx.strokeStyle = chamber.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(px(0), py(0), cell * chamber.cols, cell * chamber.rows);

  // Walls.
  ctx.fillStyle = '#2a2a5e';
  for (const w of chamber.walls) {
    ctx.fillRect(px(w.x) + 2, py(w.y) + 2, cell - 4, cell - 4);
    ctx.strokeStyle = '#5555aa';
    ctx.lineWidth = 1;
    ctx.strokeRect(px(w.x) + 2, py(w.y) + 2, cell - 4, cell - 4);
  }

  // Beam (layered strokes, no shadowBlur — Surge FPS lesson).
  const segs = run.trace.segments;
  for (const pass of [[7, 'rgba(34,230,255,0.18)'], [3.5, 'rgba(34,230,255,0.55)'], [1.6, '#d8fbff']]) {
    ctx.strokeStyle = pass[1];
    ctx.lineWidth = pass[0] * (cell / 60);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of segs) {
      // Clamp the far end at the chamber border: the trace records the
      // out-of-bounds cell centre, but the beam must stop at the wall.
      const ex = Math.max(0, Math.min(chamber.cols, s.x2 + 0.5));
      const ey = Math.max(0, Math.min(chamber.rows, s.y2 + 0.5));
      ctx.moveTo(px(s.x1 + 0.5), py(s.y1 + 0.5));
      ctx.lineTo(px(ex), py(ey));
    }
    ctx.stroke();
  }

  // Emitter.
  const e = chamber.emitter;
  ctx.fillStyle = '#22e6ff';
  ctx.beginPath();
  ctx.arc(px(e.x + 0.5), py(e.y + 0.5), cell * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px(e.x + 0.5), py(e.y + 0.5), cell * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Prisms.
  for (const p of chamber.prisms) {
    const cx = px(p.x + 0.5), cy = py(p.y + 0.5), r = cell * 0.32;
    ctx.fillStyle = 'rgba(178,107,255,0.35)';
    ctx.strokeStyle = '#b26bff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Mirrors (with rotate animation + selection ring).
  chamber.mirrors.forEach((m, i) => {
    const cx = px(m.x + 0.5), cy = py(m.y + 0.5), r = cell * 0.36;
    let ang = run.orients[i] === '/' ? -Math.PI / 4 : Math.PI / 4;
    const anim = feel.mirrorAnim.get(i);
    if (anim) {
      const from = anim.from === '/' ? -Math.PI / 4 : Math.PI / 4;
      const to = anim.to === '/' ? -Math.PI / 4 : Math.PI / 4;
      ang = from + (to - from) * Math.min(1, anim.t / 0.18);
    }
    if (state.phase === 'playing' && state.kbSelect && state.selected === i) {
      ctx.strokeStyle = '#ffd23d';
      ctx.lineWidth = 2;
      ctx.strokeRect(px(m.x) + 3, py(m.y) + 3, cell - 6, cell - 6);
    }
    ctx.strokeStyle = m.fixed ? '#8888aa' : '#eaf6ff';
    ctx.lineWidth = Math.max(3, cell * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r);
    ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.stroke();
    ctx.fillStyle = m.fixed ? '#8888aa' : '#22e6ff';
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.07, 0, Math.PI * 2);
    ctx.fill();
  });

  // Receptors.
  chamber.receptors.forEach((r, i) => {
    const lit = run.trace.lit.has(i);
    const cx = px(r.x + 0.5), cy = py(r.y + 0.5);
    ctx.strokeStyle = lit ? '#ffd23d' : '#ff3df0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    if (lit) {
      ctx.fillStyle = 'rgba(255,210,61,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Shockwave rings (grid space, M3 solve bundle).
  for (const s of feel.shockwaves) {
    const k = s.t / s.life;
    ctx.globalAlpha = Math.max(0, 1 - k) * 0.8;
    ctx.strokeStyle = '#ffd23d';
    ctx.lineWidth = Math.max(1, cell * 0.08 * (1 - k));
    ctx.beginPath();
    ctx.arc(px(s.x), py(s.y), k * cell * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Particles (grid space).
  for (const p of feel.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(px(p.x) - 2, py(p.y) - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // Score pops.
  ctx.font = `bold ${Math.max(14, cell * 0.4)}px sans-serif`;
  ctx.textAlign = 'center';
  for (const pop of feel.pops) {
    ctx.globalAlpha = Math.max(0, 1 - pop.t / 0.9);
    ctx.fillStyle = '#ffd23d';
    ctx.fillText(pop.text, px(pop.x), py(pop.y) - pop.t * 30);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Flash overlay.
  if (feel.flashT > 0 && save.settings.flash) {
    ctx.fillStyle = `rgba(${feel.flashColor},${(feel.flashT / Math.max(0.01, feel.flashMax)) * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------------ main loop
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  // FPS guard (Surge pattern): sustained <28fps drops the DPR cap.
  fpsFrames++; fpsTime += rawDt;
  if (fpsTime >= 1) {
    fpsShown = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    if (fpsShown < 28 && dprCap > 1) { fpsLowT++; if (fpsLowT >= 2) triggerFpsGuard(); }
    else fpsLowT = 0;
    const pr = $('perf-readout');
    if (pr && state.phase === 'settings') pr.textContent = `${fpsShown} fps · render scale ${dprCap}x`;
  }

  // Feel timers run on real seconds.
  feel.trauma = Math.max(0, feel.trauma - rawDt * 1.6);
  feel.flashT = Math.max(0, feel.flashT - rawDt);
  feel.zoomT = Math.max(0, feel.zoomT - rawDt);
  feel.slowMoT = Math.max(0, feel.slowMoT - rawDt);
  feel.hitStopT = Math.max(0, feel.hitStopT - rawDt);
  feel.timeScale = feel.hitStopT > 0 ? 0.05 : (feel.slowMoT > 0 ? 0.35 : 1);
  for (const [i, a] of feel.mirrorAnim) {
    a.t += rawDt;
    if (a.t >= 0.18) feel.mirrorAnim.delete(i);
  }
  for (let i = feel.particles.length - 1; i >= 0; i--) {
    const p = feel.particles[i];
    p.t += rawDt; p.x += p.vx * rawDt; p.y += p.vy * rawDt;
    if (p.t >= p.life) feel.particles.splice(i, 1);
  }
  for (let i = feel.pops.length - 1; i >= 0; i--) {
    feel.pops[i].t += rawDt;
    if (feel.pops[i].t >= 0.9) feel.pops.splice(i, 1);
  }
  for (let i = feel.shockwaves.length - 1; i >= 0; i--) {
    feel.shockwaves[i].t += rawDt;
    if (feel.shockwaves[i].t >= feel.shockwaves[i].life) feel.shockwaves.splice(i, 1);
  }
  // Ambient beam sparks (M3): a slow trickle of sparks drifting off the
  // live beam so it reads as energy, not a static line. Kept cheap —
  // one particle on ~40% of frames, hard-capped by burst()'s pool cap.
  const sparkRun = state.phase === 'playing' ? state.run : state.demoRun;
  if (sparkRun && sparkRun.trace.segments.length > 0 && Math.random() < 0.4) {
    const segs = sparkRun.trace.segments;
    const s = segs[Math.floor(Math.random() * segs.length)];
    const f = Math.random();
    feel.particles.push({
      x: s.x1 + 0.5 + (s.x2 - s.x1) * f, y: s.y1 + 0.5 + (s.y2 - s.y1) * f,
      vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
      t: 0, life: 0.25 + Math.random() * 0.25, color: '#7df2ff',
    });
    if (feel.particles.length > 400) feel.particles.splice(0, feel.particles.length - 400);
  }

  const dt = rawDt * feel.timeScale;

  if (state.phase === 'playing' && state.run) {
    state.run.time += dt;
    if (state.autopilot) {
      state.autopilotTimer -= rawDt;
      if (state.autopilotTimer <= 0) {
        if (state.autopilotPath.length === 0 && state.run.phase === 'playing') {
          const sol = solve(state.run.chamber);
          // Replay from the CURRENT orientations: solve() starts from
          // chamber start, so only use it on a fresh run; otherwise
          // recompute by solving a synthetic chamber at current state.
          if (state.run.moves === 0 && sol) state.autopilotPath = [...sol.path];
          else {
            const synth = { ...state.run.chamber, mirrors: state.run.chamber.mirrors.map((m, i) => ({ ...m, orient: state.run.orients[i] })) };
            const s2 = solve(synth);
            state.autopilotPath = s2 ? [...s2.path] : [];
          }
        }
        const next = state.autopilotPath.shift();
        if (next !== undefined) { tryRotate(next); state.autopilotTimer = 0.45; }
      }
    }
    draw(state.run, dt);
  } else if (state.phase === 'menu' || state.phase === 'chambers' || state.phase === 'howto' || state.phase === 'settings') {
    // Live attract demo: the solver plays each chamber behind the menu,
    // cycling 1 -> 2 -> 3. Each step solves from the CURRENT orientations
    // (synthetic chamber), so the demo keeps moving through distinct
    // states instead of aliasing back to the same solved frame.
    if (!state.demoRun) { state.demoRun = startRun(state.demoChamber); state.demoTimer = 0; }
    state.demoTimer -= rawDt;
    if (state.demoTimer <= 0) {
      if (state.demoRun.phase === 'won' || state.demoRun.phase === 'lost') {
        state.demoChamber = state.demoChamber >= 3 ? 1 : state.demoChamber + 1;
        state.demoRun = startRun(state.demoChamber);
        state.demoTimer = 1.1;
      } else {
        const synth = { ...state.demoRun.chamber, mirrors: state.demoRun.chamber.mirrors.map((m, i) => ({ ...m, orient: state.demoRun.orients[i] })) };
        const sol = solve(synth);
        if (sol && sol.path.length > 0) {
          rotateMirror(state.demoRun, sol.path[0]);
          state.demoTimer = 0.8;
        } else {
          state.demoChamber = state.demoChamber >= 3 ? 1 : state.demoChamber + 1;
          state.demoRun = startRun(state.demoChamber);
          state.demoTimer = 1.1;
        }
      }
    }
    draw(state.demoRun, dt);
  } else if (state.run) {
    draw(state.run, dt);
  }
}

function triggerFpsGuard() {
  if (dprCap <= 1) return;
  dprCap = 1;
  resize();
}

// ------------------------------------------------------------------ hooks (tests + playtests)
function info() {
  const run = state.run || state.demoRun;
  if (!run) return { time: 0, lit: 0, total: 0, moves: 0, score: 0, beamSegments: 0 };
  // Screen-space beam tip: centre of the last segment, for render checks.
  const layout = computeLayout(run.chamber);
  const segs = run.trace.segments;
  const last = segs[segs.length - 1] || { x2: 0, y2: 0 };
  return {
    time: run.time,
    lit: run.trace.litCount,
    total: run.trace.total,
    moves: run.moves,
    score: run.score,
    beamSegments: segs.length,
    beamTip: { x: layout.ox + (last.x2 + 0.5) * layout.cell, y: layout.oy + (last.y2 + 0.5) * layout.cell },
    orients: [...run.orients],
  };
}

window.__prism = {
  version: VERSION,
  state,
  save,
  get dprCap() { return dprCap; },
  chambers: () => CHAMBERS.map((c) => ({ id: c.id, name: c.name })),
  info,
  feel: () => ({
    trauma: feel.trauma, timeScale: feel.timeScale, flashT: feel.flashT, flashMax: feel.flashMax,
    zoomT: feel.zoomT, slowMoT: feel.slowMoT, particlesAlive: feel.particles.length,
    pops: feel.pops.length, shockwaves: feel.shockwaves.length,
    shakeSetting: save.settings.shake,
    shakeAmp: feel.trauma * feel.trauma * 14 * save.settings.shake,
    flashEnabled: save.settings.flash,
    fxCounts: { ...feel.fxCounts },
  }),
  audio: () => ({ ...audioState, musicOn: save.settings.music, lift: musicLift() }),
  startChamber,
  rotateAt: (x, y) => {
    if (!state.run) return false;
    const idx = mirrorIndexAt(state.run.chamber, x, y);
    return idx >= 0 ? tryRotate(idx) : false;
  },
  rotateIndex: (i) => tryRotate(i),
  autopilot: (on) => { state.autopilot = !!on; state.autopilotPath = []; state.autopilotTimer = 0; },
  pause: pauseGame,
  resume: resumeGame,
  quitToMenu,
  setShake: (v) => { save.settings.shake = v; persist(); },
  setFlash: (v) => { save.settings.flash = !!v; persist(); },
  setMusic,
  setTextSize: (v) => { save.settings.textSize = v; applySettings(); persist(); },
  setContrast: (v) => { save.settings.contrast = !!v; applySettings(); persist(); },
  triggerFpsGuard,
  debugFlash: () => { feel.flashT = 0.3; feel.flashMax = 0.3; },
  debugToast: (msg, ms) => toast(msg, ms),
};

// ------------------------------------------------------------------ boot
resize();
applySettings();
const params = new URLSearchParams(location.search);
if (params.get('unlock') === '1') state.sessionUnlock = true;
const deepChamber = parseInt(params.get('chamber') || '', 10);
if (deepChamber >= 1 && deepChamber <= CHAMBERS.length) {
  state.sessionUnlock = true;
  startChamber(deepChamber);
} else {
  state.phase = 'menu';
  showScreen('menu');
}
requestAnimationFrame(frame);
