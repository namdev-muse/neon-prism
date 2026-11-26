// Neon Prism v1.0.0 — smoke tests for the pure sim (physics.js).
// Run: node tests/smoke.js
import {
  VERSION, CHAMBERS, chamberById, traceBeam, createRun, startRun,
  rotateMirror, mirrorIndexAt, solve, reflect, prismTurn, rankFor,
  endlessChamber, endlessTarget,
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
check('12 chambers defined', CHAMBERS.length === 12);
check('solver pars strictly increasing (difficulty curve)', CHAMBERS.every((c, i) => i === 0 || c.parMoves > CHAMBERS[i - 1].parMoves),
  CHAMBERS.map((c) => c.parMoves).join(','));
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

{
  // M3 feel data: every trace reports where beam heads die (beam-block
  // sparks), and a finished run names its score parts.
  for (const c of CHAMBERS) {
    const t = traceBeam(c, c.mirrors.map((m) => m.orient));
    check(`chamber ${c.id}: trace reports beam endpoints`, Array.isArray(t.endpoints) && t.endpoints.length > 0);
    check(`chamber ${c.id}: endpoints are in-bounds cells`, t.endpoints.every((e) => e.x >= 0 && e.x < c.cols && e.y >= 0 && e.y < c.rows));
  }
  const run = startRun(1);
  const sol = solve(run.chamber);
  for (const i of sol.path) rotateMirror(run, i);
  check('won run names its score parts', run.phase === 'won' && run.scoreParts && run.scoreParts.clear === 1000);
  check('score parts sum to the score', run.scoreParts.clear + run.scoreParts.efficiency + run.scoreParts.time === run.score,
    JSON.stringify(run.scoreParts) + ' vs ' + run.score);
  const lost = startRun(1);
  rotateMirror(lost, 2); rotateMirror(lost, 3); rotateMirror(lost, 4);
  check('lost run names its lit-only score part', lost.phase === 'lost' && lost.scoreParts && lost.scoreParts.lit === lost.score);
}

{
  // M4 ranks: all three tiers reachable inside the budget (par + 1).
  // S = par moves, fast. A = par but slow, or slack move but brisk.
  // B = slack move AND slow.
  const base = startRun(1);
  const sol = solve(base.chamber);
  const mk = (extraMove, time) => {
    const run = startRun(1);
    for (const i of sol.path) rotateMirror(run, i);
    run.time = time;
    if (extraMove) { run.moves = run.chamber.parMoves + 1; }
    return run;
  };
  check('rank S: par moves, fast', rankFor(mk(false, 10)) === 'S');
  check('rank A: par moves, slow', rankFor(mk(false, 999)) === 'A');
  check('rank A: slack move, brisk', rankFor(mk(true, 10)) === 'A');
  check('rank B: slack move, slow', rankFor(mk(true, 999)) === 'B');
  check('rank null when not won', rankFor(startRun(1)) === null);
}

{
  // M4 Endless Lattice: deterministic, scaling, solvable, unsolved start.
  const a = endlessChamber(42, 3);
  const b = endlessChamber(42, 3);
  check('endless chamber is deterministic in (seed, depth)', JSON.stringify(a) === JSON.stringify(b));
  check('endless chamber is flagged endless with depth', a.endless === true && a.depth === 3);
  let prevPar = 0;
  let scaling = true;
  for (let d = 0; d < 10; d++) {
    const c = endlessChamber(42, d);
    if (!c) { scaling = false; break; }
    const t = endlessTarget(d);
    const s = solve(c);
    if (!s || s.moves !== c.parMoves || c.parMoves !== t.par) scaling = false;
    if (c.parMoves < prevPar) scaling = false;
    prevPar = c.parMoves;
    const start = traceBeam(c, c.mirrors.map((m) => m.orient));
    if (start.solved) scaling = false;
    const cells = new Set();
    let overlap = false;
    for (const p of [c.emitter, ...c.walls, ...c.mirrors, ...c.prisms, ...c.receptors]) {
      const k = p.x + ',' + p.y;
      if (cells.has(k) || p.x < 0 || p.x >= c.cols || p.y < 0 || p.y >= c.rows) overlap = true;
      cells.add(k);
    }
    if (overlap) scaling = false;
    if (c.budget !== c.parMoves + 1) scaling = false;
  }
  check('endless depths 0-9 scale (par 2->6), solvable at par, unsolved start, no overlaps', scaling);
  check('endless prism appears by depth 3', endlessChamber(42, 3).prisms.length === 1);
  check('endless depth 0 has no prism', endlessChamber(42, 0).prisms.length === 0);
  // Solver replays an endless chamber through the public hook.
  const c = endlessChamber(7, 5);
  const run = createRun(c);
  for (const i of solve(c).path) rotateMirror(run, i);
  check('solver bot clears an endless chamber through rotateMirror', run.phase === 'won' && run.moves <= c.budget);
}

console.log(`smoke: ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
