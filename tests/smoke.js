// Neon Prism v0.1.0 — smoke tests for the pure sim (physics.js).
// Run: node tests/smoke.js
import {
  VERSION, CHAMBERS, chamberById, traceBeam, createRun, startRun,
  rotateMirror, mirrorIndexAt, solve, reflect, prismTurn, rankFor,
} from '../physics.js';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.error('  FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

console.log('smoke: Neon Prism ' + VERSION);

// --- reflection table -------------------------------------------------------
check("mirror / reflects E->N", reflect('E', '/') === 'N');
check("mirror / reflects N->E", reflect('N', '/') === 'E');
check("mirror / reflects W->S", reflect('W', '/') === 'S');
check("mirror / reflects S->W", reflect('S', '/') === 'W');
check("mirror \\ reflects E->S", reflect('E', '\\') === 'S');
check("mirror \\ reflects S->E", reflect('S', '\\') === 'E');
check("mirror \\ reflects W->N", reflect('W', '\\') === 'N');
check("mirror \\ reflects N->W", reflect('N', '\\') === 'W');
check('prism turns E->S (clockwise)', prismTurn('E') === 'S');
check('prism turns S->W', prismTurn('S') === 'W');
check('prism turns W->N', prismTurn('W') === 'N');
check('prism turns N->E', prismTurn('N') === 'E');

// --- chamber data sanity ----------------------------------------------------
check('3 chambers defined', CHAMBERS.length === 3);
for (const c of CHAMBERS) {
  const cells = new Set();
  const all = [c.emitter, ...c.walls, ...c.mirrors, ...c.prisms, ...c.receptors];
  let overlap = false;
  for (const p of all) {
    const k = p.x + ',' + p.y;
    if (cells.has(k)) overlap = true;
    cells.add(k);
    if (p.x < 0 || p.x >= c.cols || p.y < 0 || p.y >= c.rows) overlap = true;
  }
  check(`chamber ${c.id} ${c.name}: no overlapping/out-of-bounds cells`, !overlap);
  check(`chamber ${c.id}: budget above par`, c.budget > c.parMoves, `budget=${c.budget} par=${c.parMoves}`);
  const start = traceBeam(c, c.mirrors.map((m) => m.orient));
  check(`chamber ${c.id}: starting state is NOT solved (no-input loses)`, !start.solved);
  const sol = solve(c);
  check(`chamber ${c.id}: solver finds a solution`, sol !== null);
  if (sol) {
    check(`chamber ${c.id}: solver moves match parMoves`, sol.moves === c.parMoves, `solver=${sol.moves} par=${c.parMoves}`);
    check(`chamber ${c.id}: solver moves within budget`, sol.moves <= c.budget);
  }
}

// --- run mechanics ----------------------------------------------------------
{
  const run = startRun(1);
  check('startRun(1) creates a playing run', run && run.phase === 'playing' && run.moves === 0);
  const idx = mirrorIndexAt(run.chamber, 5, 4);
  check('mirrorIndexAt finds the path mirror', idx === 0);
  check('mirrorIndexAt returns -1 on empty cell', mirrorIndexAt(run.chamber, 0, 0) === -1);
  const ok = rotateMirror(run, idx);
  check('rotateMirror flips the mirror and counts a move', ok && run.moves === 1 && run.orients[idx] === '/');
  check('rotating one mirror does not yet solve chamber 1', run.phase === 'playing');
}
{
  // Full solution replay through the public hook.
  const run = startRun(1);
  const sol = solve(run.chamber);
  for (const i of sol.path) rotateMirror(run, i);
  check('replaying the solver path wins chamber 1', run.phase === 'won', `phase=${run.phase}`);
  check('won run has a positive score', run.score > 1000, `score=${run.score}`);
  check('optimal play ranks S', rankFor(run) === 'S', `rank=${rankFor(run)}`);
}
{
  // Budget exhaustion loses.
  const run = startRun(1);
  for (let i = 0; i < run.chamber.budget; i++) rotateMirror(run, 2); // decoy mirror
  check('wasting the budget loses the chamber', run.phase === 'lost', `phase=${run.phase} moves=${run.moves}`);
  const after = rotateMirror(run, 0);
  check('rotating after the run ends is denied (named reason)', after === false && run.deniedReason === 'none');
}
{
  // Fixed mirrors deny with a named reason (synthetic chamber).
  const chamber = {
    id: 99, name: 'Fixed Test', hint: '', accent: '#fff', cols: 6, rows: 4,
    emitter: { x: 0, y: 1, dir: 'E' }, walls: [],
    mirrors: [{ x: 3, y: 1, orient: '/', fixed: true }],
    prisms: [], receptors: [{ x: 3, y: 0 }], budget: 3, parMoves: 0, parTime: 10,
  };
  const run = createRun(chamber);
  const ok = rotateMirror(run, 0);
  check('rotating a fixed mirror is denied (named reason)', ok === false && run.deniedReason === 'fixed' && run.moves === 0);
  check('fixed-mirror chamber starts solved via the fixed mirror', run.trace.solved === true);
}
{
  // Beam loop guard: two mirrors bouncing forever must terminate.
  const chamber = {
    id: 98, name: 'Loop Test', hint: '', accent: '#fff', cols: 6, rows: 4,
    emitter: { x: 0, y: 1, dir: 'E' }, walls: [],
    mirrors: [
      { x: 2, y: 1, orient: '/' },
      { x: 2, y: 0, orient: '\\' },
      { x: 4, y: 0, orient: '/' },
      { x: 4, y: 1, orient: '\\' },
    ],
    prisms: [], receptors: [{ x: 5, y: 3 }], budget: 3, parMoves: 0, parTime: 10,
  };
  const trace = traceBeam(chamber, chamber.mirrors.map((m) => m.orient));
  check('beam loop terminates (guard) and does not solve', trace.solved === false && trace.segments.length > 0);
}
{
  // Prism splits: chamber 3 solution lights both receptors.
  const run = startRun(3);
  const sol = solve(run.chamber);
  for (const i of sol.path) rotateMirror(run, i);
  check('prism chamber solves with both branches lit', run.phase === 'won' && run.trace.litCount === 2);
}
{
  // Determinism: same inputs, same trace.
  const c = chamberById(2);
  const a = traceBeam(c, c.mirrors.map((m) => m.orient));
  const b = traceBeam(c, c.mirrors.map((m) => m.orient));
  check('trace is deterministic', JSON.stringify(a.segments) === JSON.stringify(b.segments) && a.litCount === b.litCount);
  check('startRun rejects unknown chamber', startRun(999) === null);
}

console.log(`smoke: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
