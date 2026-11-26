// Neon Prism v0.3.0 — pure simulation core (no DOM, no Canvas).
//
// A 2D neon laser-mirror puzzle: an emitter fires a beam across a grid
// chamber. Mirrors bend the beam 90 degrees, prisms split it in two,
// walls stop it. Tap a mirror to rotate it (/ <-> \); light every
// receptor at once to clear the chamber. Each rotation costs a move
// against the chamber's move budget.
//
// The beam is live feedback of the player's own action (like a trail),
// never a prediction oracle: it shows what the beam does NOW, not what
// to do next. There is no auto-rotate and no hint that names a mirror.
//
// Coordinates: grid cells (x east, y south, matching canvas rows).
// Directions: 'E' | 'W' | 'N' | 'S'.
// Mirror '/': E<->N, W<->S. Mirror '\\': E<->S, W<->N.
// Prism: beam continues straight AND turns 90 degrees clockwise on
// screen (E->S, S->W, W->N, N->E). The beam passes through receptors
// (lighting them) and stops at walls and the chamber edge.
//
// Deterministic: chambers are hand-built from fixed numbers; the trace
// and the solver give identical results for identical inputs.

export const VERSION = '0.3.0';

export const DIRS = {
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
};

const REFLECT = {
  '/': { E: 'N', N: 'E', W: 'S', S: 'W' },
  '\\': { E: 'S', S: 'E', W: 'N', N: 'W' },
};

const PRISM_TURN = { E: 'S', S: 'W', W: 'N', N: 'E' };

export function reflect(dir, orient) {
  return REFLECT[orient][dir];
}

export function prismTurn(dir) {
  return PRISM_TURN[dir];
}

// ---------------------------------------------------------------- chambers
// Each chamber: grid size, emitter, walls, mirrors (rotatable unless
// fixed), prisms, receptors, move budget, pars. Mirror `orient` is the
// STARTING orientation. parMoves is the solver's minimum (verified by
// tests/bot.js); budget gives the player slack above it.

export const CHAMBERS = [
  {
    id: 1,
    name: 'First Light',
    hint: 'Tap a mirror to rotate it. Bend the beam onto the receptor.',
    accent: '#22e6ff',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 4, dir: 'E' },
    walls: [{ x: 8, y: 4 }, { x: 8, y: 5 }, { x: 3, y: 6 }],
    mirrors: [
      { x: 5, y: 4, orient: '\\' },
      { x: 5, y: 1, orient: '\\' },
      { x: 9, y: 5, orient: '/' },
      { x: 2, y: 1, orient: '\\' },
      { x: 10, y: 6, orient: '/' },
    ],
    prisms: [],
    receptors: [{ x: 9, y: 1 }],
    budget: 3, parMoves: 2, parTime: 45,
  },
  {
    id: 2,
    name: 'Crossbeam',
    hint: 'One beam, two receptors. Route it past both.',
    accent: '#ff3df0',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 6, dir: 'E' },
    walls: [{ x: 6, y: 4 }, { x: 6, y: 3 }, { x: 2, y: 4 }, { x: 10, y: 6 }],
    mirrors: [
      { x: 4, y: 6, orient: '\\' },
      { x: 4, y: 2, orient: '\\' },
      { x: 9, y: 2, orient: '\\' },
      { x: 9, y: 5, orient: '\\' },
      { x: 2, y: 2, orient: '/' },
      { x: 10, y: 4, orient: '/' },
    ],
    prisms: [],
    receptors: [{ x: 7, y: 2 }, { x: 6, y: 5 }],
    budget: 4, parMoves: 3, parTime: 60,
  },
  {
    id: 3,
    name: 'Prism Split',
    hint: 'The prism splits the beam. Both branches must land.',
    accent: '#b26bff',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 4, dir: 'E' },
    walls: [{ x: 3, y: 2 }, { x: 7, y: 5 }, { x: 10, y: 3 }],
    mirrors: [
      { x: 8, y: 4, orient: '\\' },
      { x: 8, y: 1, orient: '\\' },
      { x: 5, y: 6, orient: '/' },
      { x: 10, y: 4, orient: '/' },
      { x: 3, y: 6, orient: '\\' },
      { x: 2, y: 6, orient: '/' },
      { x: 0, y: 6, orient: '\\' },
      { x: 11, y: 1, orient: '/' },
    ],
    prisms: [{ x: 5, y: 4 }],
    receptors: [{ x: 11, y: 2 }, { x: 9, y: 6 }],
    budget: 5, parMoves: 4, parTime: 75,
  },
  {
    id: 4,
    name: 'Serpent',
    hint: 'Follow the snake. Every bend matters.',
    accent: '#22e6ff',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 6, dir: 'E' },
    walls: [{ x: 6, y: 6 }, { x: 10, y: 4 }, { x: 4, y: 7 }, { x: 3, y: 2 }, { x: 8, y: 1 }, { x: 9, y: 5 }, { x: 5, y: 6 }],
    mirrors: [
      { x: 4, y: 6, orient: '\\' },
      { x: 4, y: 2, orient: '\\' },
      { x: 8, y: 2, orient: '/' },
      { x: 8, y: 5, orient: '\\' },
      { x: 5, y: 5, orient: '/' },
      { x: 10, y: 6, orient: '/' },
      { x: 2, y: 2, orient: '\\' },
      { x: 10, y: 1, orient: '/' },
      { x: 2, y: 4, orient: '\\' },
    ],
    prisms: [],
    receptors: [{ x: 5, y: 3 }],
    budget: 6, parMoves: 5, parTime: 90,
  },
  {
    id: 5,
    name: 'Twin Branches',
    hint: 'The prism splits the beam. Both branches must land.',
    accent: '#ff3df0',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 4, dir: 'E' },
    walls: [{ x: 3, y: 1 }, { x: 11, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 1 }, { x: 9, y: 0 }, { x: 10, y: 3 }, { x: 3, y: 6 }, { x: 8, y: 7 }],
    mirrors: [
      { x: 6, y: 4, orient: '\\' },
      { x: 6, y: 1, orient: '\\' },
      { x: 9, y: 1, orient: '/' },
      { x: 9, y: 3, orient: '\\' },
      { x: 4, y: 6, orient: '/' },
      { x: 8, y: 6, orient: '\\' },
      { x: 2, y: 1, orient: '\\' },
      { x: 11, y: 2, orient: '/' },
      { x: 2, y: 6, orient: '/' },
      { x: 10, y: 7, orient: '\\' },
    ],
    prisms: [{ x: 4, y: 4 }],
    receptors: [{ x: 7, y: 3 }, { x: 8, y: 5 }],
    budget: 7, parMoves: 6, parTime: 105,
  },
  {
    id: 6,
    name: 'The Gauntlet',
    hint: 'A long corridor. Do not waste a bend.',
    accent: '#b26bff',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 7, dir: 'E' },
    walls: [{ x: 5, y: 7 }, { x: 9, y: 6 }, { x: 1, y: 3 }, { x: 2, y: 1 }, { x: 6, y: 0 }, { x: 5, y: 4 }, { x: 10, y: 5 }, { x: 11, y: 2 }, { x: 7, y: 1 }],
    mirrors: [
      { x: 3, y: 7, orient: '\\' },
      { x: 3, y: 1, orient: '\\' },
      { x: 6, y: 1, orient: '/' },
      { x: 6, y: 4, orient: '/' },
      { x: 10, y: 4, orient: '\\' },
      { x: 10, y: 2, orient: '/' },
      { x: 7, y: 2, orient: '\\' },
      { x: 8, y: 7, orient: '/' },
      { x: 2, y: 5, orient: '\\' },
      { x: 11, y: 1, orient: '/' },
      { x: 5, y: 3, orient: '\\' },
    ],
    prisms: [],
    receptors: [{ x: 8, y: 4 }, { x: 7, y: 6 }],
    budget: 8, parMoves: 7, parTime: 120,
  },
  {
    id: 7,
    name: 'Prism Crossfire',
    hint: 'Two branches, eight bends. Plan both.',
    accent: '#22e6ff',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 3, dir: 'E' },
    walls: [{ x: 10, y: 6 }, { x: 2, y: 7 }, { x: 5, y: 4 }, { x: 4, y: 1 }, { x: 8, y: 0 }, { x: 7, y: 4 }, { x: 11, y: 5 }, { x: 2, y: 6 }, { x: 6, y: 7 }, { x: 7, y: 5 }],
    mirrors: [
      { x: 5, y: 3, orient: '\\' },
      { x: 5, y: 1, orient: '\\' },
      { x: 8, y: 1, orient: '/' },
      { x: 8, y: 4, orient: '/' },
      { x: 11, y: 4, orient: '\\' },
      { x: 3, y: 6, orient: '/' },
      { x: 6, y: 6, orient: '\\' },
      { x: 6, y: 5, orient: '/' },
      { x: 9, y: 6, orient: '/' },
      { x: 1, y: 1, orient: '\\' },
      { x: 10, y: 2, orient: '/' },
      { x: 4, y: 7, orient: '\\' },
    ],
    prisms: [{ x: 3, y: 3 }],
    receptors: [{ x: 11, y: 2 }, { x: 4, y: 5 }],
    budget: 9, parMoves: 8, parTime: 135,
  },
  {
    id: 8,
    name: 'Switchback',
    hint: 'Nine bends. The beam doubles back on itself.',
    accent: '#ff3df0',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 1, dir: 'E' },
    walls: [{ x: 9, y: 5 }, { x: 1, y: 6 }, { x: 4, y: 0 }, { x: 3, y: 4 }, { x: 7, y: 5 }, { x: 6, y: 2 }, { x: 10, y: 1 }, { x: 11, y: 6 }, { x: 6, y: 7 }, { x: 2, y: 2 }],
    mirrors: [
      { x: 4, y: 1, orient: '/' },
      { x: 4, y: 4, orient: '/' },
      { x: 7, y: 4, orient: '\\' },
      { x: 7, y: 2, orient: '\\' },
      { x: 10, y: 2, orient: '/' },
      { x: 10, y: 6, orient: '\\' },
      { x: 6, y: 6, orient: '/' },
      { x: 6, y: 3, orient: '/' },
      { x: 2, y: 3, orient: '\\' },
      { x: 9, y: 1, orient: '/' },
      { x: 3, y: 6, orient: '\\' },
      { x: 11, y: 4, orient: '/' },
      { x: 8, y: 3, orient: '\\' },
    ],
    prisms: [],
    receptors: [{ x: 5, y: 4 }, { x: 2, y: 5 }],
    budget: 10, parMoves: 9, parTime: 150,
  },
  {
    id: 9,
    name: 'The Circuit',
    hint: 'Ten bends around the circuit.',
    accent: '#b26bff',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 4, dir: 'E' },
    walls: [{ x: 11, y: 6 }, { x: 2, y: 2 }, { x: 5, y: 5 }, { x: 4, y: 1 }, { x: 6, y: 3 }, { x: 10, y: 4 }, { x: 2, y: 7 }, { x: 9, y: 4 }],
    mirrors: [
      { x: 5, y: 4, orient: '\\' },
      { x: 5, y: 1, orient: '\\' },
      { x: 7, y: 1, orient: '/' },
      { x: 7, y: 3, orient: '/' },
      { x: 10, y: 3, orient: '\\' },
      { x: 10, y: 1, orient: '/' },
      { x: 3, y: 7, orient: '/' },
      { x: 6, y: 7, orient: '\\' },
      { x: 6, y: 5, orient: '\\' },
      { x: 9, y: 5, orient: '/' },
      { x: 8, y: 7, orient: '/' },
      { x: 11, y: 1, orient: '\\' },
      { x: 4, y: 6, orient: '/' },
      { x: 8, y: 2, orient: '\\' },
    ],
    prisms: [{ x: 3, y: 4 }],
    receptors: [{ x: 8, y: 1 }, { x: 9, y: 7 }],
    budget: 11, parMoves: 10, parTime: 165,
  },
  {
    id: 10,
    name: 'Serpent King',
    hint: 'Eleven bends. No shortcuts.',
    accent: '#22e6ff',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 7, dir: 'E' },
    walls: [{ x: 4, y: 7 }, { x: 11, y: 7 }, { x: 1, y: 4 }, { x: 5, y: 3 }, { x: 4, y: 6 }, { x: 8, y: 7 }, { x: 6, y: 1 }, { x: 10, y: 6 }, { x: 11, y: 3 }, { x: 9, y: 4 }],
    mirrors: [
      { x: 2, y: 7, orient: '\\' },
      { x: 2, y: 4, orient: '\\' },
      { x: 5, y: 4, orient: '/' },
      { x: 5, y: 6, orient: '/' },
      { x: 8, y: 6, orient: '\\' },
      { x: 8, y: 2, orient: '/' },
      { x: 6, y: 2, orient: '\\' },
      { x: 6, y: 5, orient: '/' },
      { x: 10, y: 5, orient: '\\' },
      { x: 10, y: 3, orient: '/' },
      { x: 9, y: 3, orient: '/' },
      { x: 4, y: 1, orient: '/' },
      { x: 11, y: 2, orient: '\\' },
      { x: 3, y: 6, orient: '/' },
      { x: 7, y: 7, orient: '\\' },
    ],
    prisms: [],
    receptors: [{ x: 3, y: 4 }, { x: 9, y: 1 }],
    budget: 12, parMoves: 11, parTime: 180,
  },
  {
    id: 11,
    name: 'Triple Split',
    hint: 'Three branches. Every one must land.',
    accent: '#ff3df0',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 2, dir: 'E' },
    walls: [{ x: 0, y: 5 }, { x: 11, y: 7 }, { x: 8, y: 1 }, { x: 10, y: 2 }, { x: 7, y: 3 }],
    mirrors: [
      { x: 8, y: 2, orient: '/' },
      { x: 8, y: 5, orient: '/' },
      { x: 11, y: 5, orient: '\\' },
      { x: 11, y: 3, orient: '/' },
      { x: 10, y: 3, orient: '\\' },
      { x: 6, y: 4, orient: '/' },
      { x: 7, y: 4, orient: '/' },
      { x: 3, y: 5, orient: '/' },
      { x: 5, y: 5, orient: '\\' },
      { x: 5, y: 3, orient: '/' },
      { x: 2, y: 3, orient: '\\' },
      { x: 2, y: 6, orient: '/' },
      { x: 4, y: 1, orient: '/' },
      { x: 9, y: 7, orient: '\\' },
      { x: 1, y: 6, orient: '/' },
      { x: 9, y: 1, orient: '\\' },
    ],
    prisms: [{ x: 3, y: 2 }, { x: 6, y: 2 }],
    receptors: [{ x: 10, y: 7 }, { x: 7, y: 7 }, { x: 3, y: 6 }],
    budget: 13, parMoves: 12, parTime: 195,
  },
  {
    id: 12,
    name: 'Void Crown',
    hint: 'The final chamber. Thirteen bends.',
    accent: '#ffd23d',
    cols: 12, rows: 8,
    emitter: { x: 1, y: 0, dir: 'E' },
    walls: [{ x: 2, y: 5 }, { x: 2, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 1 }, { x: 7, y: 0 }, { x: 6, y: 3 }, { x: 9, y: 4 }, { x: 8, y: 2 }, { x: 11, y: 1 }, { x: 8, y: 4 }, { x: 9, y: 7 }],
    mirrors: [
      { x: 3, y: 0, orient: '/' },
      { x: 3, y: 2, orient: '/' },
      { x: 5, y: 2, orient: '\\' },
      { x: 5, y: 1, orient: '\\' },
      { x: 7, y: 1, orient: '/' },
      { x: 7, y: 3, orient: '/' },
      { x: 9, y: 3, orient: '\\' },
      { x: 9, y: 2, orient: '\\' },
      { x: 11, y: 2, orient: '/' },
      { x: 11, y: 5, orient: '\\' },
      { x: 8, y: 5, orient: '\\' },
      { x: 8, y: 7, orient: '\\' },
      { x: 6, y: 7, orient: '/' },
      { x: 1, y: 3, orient: '/' },
      { x: 10, y: 7, orient: '\\' },
      { x: 2, y: 7, orient: '/' },
      { x: 6, y: 4, orient: '\\' },
    ],
    prisms: [],
    receptors: [{ x: 4, y: 2 }, { x: 10, y: 5 }, { x: 6, y: 5 }],
    budget: 14, parMoves: 13, parTime: 210,
  },
];

export function chamberById(id) {
  return CHAMBERS.find((c) => c.id === id) || null;
}

export function rotatableMirrors(chamber) {
  return chamber.mirrors.map((m, i) => ({ ...m, index: i })).filter((m) => !m.fixed);
}

// ---------------------------------------------------------------- beam trace
// Trace the beam for a given orientation array (one entry per mirror in
// chamber.mirrors order). Returns the drawn segments (cell-centre to
// cell-centre), the set of lit receptor indexes, and whether any beam
// head was stopped by a wall/edge (always true at chamber bounds).

export function traceBeam(chamber, orients) {
  const wallSet = new Set(chamber.walls.map((w) => w.x + ',' + w.y));
  const mirrorAt = new Map(chamber.mirrors.map((m, i) => [m.x + ',' + m.y, i]));
  const prismSet = new Set(chamber.prisms.map((p) => p.x + ',' + p.y));
  const receptorAt = new Map(chamber.receptors.map((r, i) => [r.x + ',' + r.y, i]));

  const segments = [];
  const endpoints = []; // last in-bounds cell of each stopped head (wall/edge) — the game sparks here (beam-block feedback)
  const lit = new Set();
  const visited = new Set();
  const heads = [{ x: chamber.emitter.x, y: chamber.emitter.y, dir: chamber.emitter.dir }];
  let steps = 0;

  while (heads.length > 0 && steps < 800) {
    const head = heads.pop();
    let { x, y, dir } = head;
    // Walk this head until it stops, reflects, or splits.
    while (steps < 800) {
      steps++;
      const d = DIRS[dir];
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < 0 || nx >= chamber.cols || ny < 0 || ny >= chamber.rows) {
        segments.push({ x1: x, y1: y, x2: nx, y2: ny, dir });
        endpoints.push({ x, y, dir, kind: 'edge' });
        break;
      }
      const k = nx + ',' + ny;
      if (wallSet.has(k)) {
        segments.push({ x1: x, y1: y, x2: nx, y2: ny, dir });
        endpoints.push({ x, y, dir, kind: 'wall' });
        break;
      }
      segments.push({ x1: x, y1: y, x2: nx, y2: ny, dir });
      x = nx; y = ny;
      if (receptorAt.has(k)) lit.add(receptorAt.get(k));
      const stateKey = x + ',' + y + ',' + dir;
      if (visited.has(stateKey)) break;
      visited.add(stateKey);
      if (mirrorAt.has(k)) {
        dir = reflect(dir, orients[mirrorAt.get(k)]);
      } else if (prismSet.has(k)) {
        heads.push({ x, y, dir: prismTurn(dir) });
        // straight head continues in the same direction
      }
    }
  }
  return { segments, endpoints, lit, litCount: lit.size, total: chamber.receptors.length, solved: lit.size === chamber.receptors.length };
}

// ---------------------------------------------------------------- run state

export function createRun(chamber) {
  const orients = chamber.mirrors.map((m) => m.orient);
  const trace = traceBeam(chamber, orients);
  return {
    chamber,
    orients,
    moves: 0,
    time: 0,
    phase: 'playing', // 'playing' | 'won' | 'lost'
    trace,
    deniedReason: null, // why the last input failed ('fixed' | 'budget' | 'none') — read by the game for the post-action cue
    lastLit: null, // { index, count, total } — the receptor the game should announce
    score: 0,
    scoreParts: null, // { clear, efficiency, time } on a win, { lit } on a loss — named on the complete screen (M2 carry-over)
  };
}

export function startRun(chamberId) {
  const chamber = chamberById(chamberId);
  if (!chamber) return null;
  return createRun(chamber);
}

export function finishScore(run) {
  if (run.phase === 'won') {
    const eff = Math.max(0, run.chamber.budget - run.moves) * 100;
    const timeBonus = Math.max(0, Math.round((run.chamber.parTime - run.time) * 10));
    run.scoreParts = { clear: 1000, efficiency: eff, time: timeBonus };
    run.score = 1000 + eff + timeBonus;
  } else {
    run.scoreParts = { lit: run.trace.litCount * 100 };
    run.score = run.trace.litCount * 100;
  }
  return run.score;
}

export function rankFor(run) {
  if (run.phase !== 'won') return null;
  if (run.moves <= run.chamber.parMoves) return 'S';
  if (run.moves <= run.chamber.parMoves + 2) return 'A';
  return 'B';
}

// Rotate mirror `index`. Returns true if the rotation happened.
export function rotateMirror(run, index) {
  run.deniedReason = null;
  run.lastLit = null;
  if (run.phase !== 'playing') { run.deniedReason = 'none'; return false; }
  const m = run.chamber.mirrors[index];
  if (!m) { run.deniedReason = 'none'; return false; }
  if (m.fixed) { run.deniedReason = 'fixed'; return false; }
  if (run.moves >= run.chamber.budget) { run.deniedReason = 'budget'; return false; }
  const before = run.trace.litCount;
  run.orients[index] = run.orients[index] === '/' ? '\\' : '/';
  run.moves++;
  run.trace = traceBeam(run.chamber, run.orients);
  if (run.trace.litCount > before) {
    const newly = [...run.trace.lit].filter((i) => i >= 0);
    run.lastLit = { index: newly[newly.length - 1], count: run.trace.litCount, total: run.trace.total };
  }
  if (run.trace.solved) {
    run.phase = 'won';
    finishScore(run);
  } else if (run.moves >= run.chamber.budget) {
    run.phase = 'lost';
    finishScore(run);
  }
  return true;
}

// Mirror index at a cell, or -1.
export function mirrorIndexAt(chamber, x, y) {
  return chamber.mirrors.findIndex((m) => m.x === x && m.y === y);
}

// ---------------------------------------------------------------- solver
// BFS over rotatable-mirror orientation states. Returns
// { moves, orients } for the fewest rotations from the starting state,
// or null if unsolvable. This is the decision bot's brain: real search
// decisions, exercised through the same rotateMirror hook the player
// uses (tests/bot.js replays the solution move by move).

export function solve(chamber) {
  const rotIdx = chamber.mirrors.map((m, i) => (m.fixed ? -1 : i)).filter((i) => i >= 0);
  const start = chamber.mirrors.map((m) => m.orient);
  const keyOf = (o) => rotIdx.map((i) => (o[i] === '/' ? '0' : '1')).join('');
  const seen = new Map([[keyOf(start), { orients: start, moves: 0, path: [] }]]);
  const queue = [seen.get(keyOf(start))];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (traceBeam(chamber, cur.orients).solved) {
      return { moves: cur.moves, orients: cur.orients, path: cur.path };
    }
    for (const i of rotIdx) {
      const next = [...cur.orients];
      next[i] = next[i] === '/' ? '\\' : '/';
      const k = keyOf(next);
      if (!seen.has(k)) {
        const node = { orients: next, moves: cur.moves + 1, path: [...cur.path, i] };
        seen.set(k, node);
        queue.push(node);
      }
    }
  }
  return null;
}

// Deterministic RNG for bot harnesses.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
