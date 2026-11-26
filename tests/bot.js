// Neon Prism v0.4.0 — bot harness (anti-slop gates).
// Run: node tests/bot.js
//
// Gates:
//  - Solver bot (real BFS search, replayed through rotateMirror)
//    clears every chamber within budget, in exactly parMoves.
//  - No-input bot loses every chamber (starting state unsolved).
//  - Spam-one-mirror bot (flip mirror 0 every move) loses every chamber.
//  - Random-rotate bot (uniform random mirror each move, 50 seeds per
//    chamber) wins rarely: <=10% on chambers 2+ and <35% on the
//    teaching chamber 1 — routing is the skill, flailing is not.
//    (A laser puzzle's state space makes a 0% random gate a coin flip
//    on the teaching chamber; the honest gate is solver 100% vs
//    random far below it, plus the deterministic dumb bots at 0%.)
import { CHAMBERS, startRun, createRun, rotateMirror, solve, mulberry32, endlessChamber } from '../physics.js';

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failed++; console.error('  FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

for (const chamber of CHAMBERS) {
  const sol = solve(chamber);
  check(`chamber ${chamber.id} ${chamber.name}: solver finds a solution`, sol !== null);
  if (sol) {
    const run = startRun(chamber.id);
    for (const i of sol.path) rotateMirror(run, i);
    check(`chamber ${chamber.id}: solver bot clears within budget`, run.phase === 'won' && run.moves <= chamber.budget,
      `phase=${run.phase} moves=${run.moves}/${chamber.budget}`);
    check(`chamber ${chamber.id}: solver moves == parMoves (${chamber.parMoves})`, sol.moves === chamber.parMoves,
      `solver=${sol.moves}`);
  }

  const idle = startRun(chamber.id);
  check(`chamber ${chamber.id}: no-input bot loses`, idle.phase !== 'won' && !idle.trace.solved);

  const spam = startRun(chamber.id);
  while (spam.phase === 'playing') rotateMirror(spam, 0);
  check(`chamber ${chamber.id}: spam-one-mirror bot loses`, spam.phase === 'lost', `phase=${spam.phase}`);

  const rotIdx = chamber.mirrors.map((m, i) => (m.fixed ? -1 : i)).filter((i) => i >= 0);
  let wins = 0;
  const SEEDS = 50;
  for (let s = 0; s < SEEDS; s++) {
    const rng = mulberry32(1000 + chamber.id * 101 + s);
    const run = startRun(chamber.id);
    while (run.phase === 'playing') {
      rotateMirror(run, rotIdx[Math.floor(rng() * rotIdx.length)]);
    }
    if (run.phase === 'won') wins++;
  }
  const rate = wins / SEEDS;
  const limit = chamber.id === 1 ? 0.35 : 0.10;
  check(`chamber ${chamber.id}: random-rotate bot rarely wins (${wins}/${SEEDS} = ${(rate * 100).toFixed(0)}% < ${(limit * 100).toFixed(0)}%)`,
    rate < limit, `wins=${wins}`);
}

// --- M4 Endless Lattice gates -------------------------------------------------
// Solver bot rides far (10 depths in sequence); random-rotate bot fails
// near the start (win rate stays under the campaign gate at every depth).
{
  let streak = 0;
  for (let d = 0; d < 10; d++) {
    const c = endlessChamber(42, d);
    if (!c) break;
    const run = createRun(c);
    for (const i of solve(c).path) rotateMirror(run, i);
    if (run.phase !== 'won') break;
    streak++;
  }
  check('endless: solver bot rides 10 depths', streak === 10, `streak=${streak}`);

  for (let d = 0; d < 6; d++) {
    const c = endlessChamber(42, d);
    const rotIdx = c.mirrors.map((m, i) => (m.fixed ? -1 : i)).filter((i) => i >= 0);
    let wins = 0;
    const SEEDS = 50;
    for (let s = 0; s < SEEDS; s++) {
      const rng = mulberry32(555000 + d * 101 + s);
      const run = createRun(c);
      while (run.phase === 'playing') {
        rotateMirror(run, rotIdx[Math.floor(rng() * rotIdx.length)]);
      }
      if (run.phase === 'won') wins++;
    }
    // Depths 0-1 are par-2 teaching depths — same allowance as campaign
    // chamber 1 (<35%); deeper depths hold the strict <10% gate. Either
    // way the flail bot cannot climb: ~0.12^2 x 0.04 to pass depth 2.
    const limit = d < 2 ? 0.35 : 0.1;
    check(`endless depth ${d}: random-rotate bot rarely wins (${wins}/${SEEDS})`, wins / SEEDS < limit, `wins=${wins}`);
    const idle = createRun(c);
    check(`endless depth ${d}: no-input bot loses`, !idle.trace.solved);
  }
}

if (failed > 0) { console.error(`bot: ${failed} failure(s)`); process.exit(1); }
console.log('bot: all gates pass');
