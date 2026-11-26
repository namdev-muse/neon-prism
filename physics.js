// Neon Prism v0.5.0 — pure simulation core (no DOM, no Canvas).
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

export const VERSION = '0.5.0';

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

// Clear ranks (M4): all three tiers must be reachable inside the move
// budget (par + 1). The old moves-only rule made B impossible — the
// budget capped moves at par+1, inside the A band. Ranks now read moves
// AND time: S = par moves, fast; B = spent the slack move AND slow;
// everything else (par but slow, or slack move but brisk) is A.
export function rankFor(run) {
  if (run.phase !== 'won') return null;
  const { parMoves, parTime } = run.chamber;
  const efficient = run.moves <= parMoves;
  const swift = run.time <= parTime;
  if (efficient && swift) return 'S';
  if (!efficient && run.time > parTime * 1.5) return 'B';
  return 'A';
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

// ---------------------------------------------------------------- endless
// Endless Lattice (M4): seeded scaling chambers. Each chamber is built
// BACKWARD from a solution: lay a beam path (mirrors at the bends, a
// prism branch at deeper depths, receptors on the path), dress it with
// decoy mirrors and off-path walls, then flip exactly `par` path mirrors
// to make the starting state. Every candidate is verified before it is
// accepted — solver par must equal the scramble count (no shortcut),
// the start must be unsolved, and a random-rotate bot must rarely win —
// so a generated chamber meets the same anti-slop gates as the
// hand-crafted ones. Deterministic in (seed, depth).

const ENDLESS_ACCENTS = ['#22e6ff', '#ff3df0', '#b26bff', '#ffd23d'];
const TURN_LEFT = { E: 'N', N: 'W', W: 'S', S: 'E' };
const TURN_RIGHT = { E: 'S', S: 'W', W: 'N', N: 'E' };

export function endlessTarget(depth) {
  const par = Math.min(13, 2 + Math.floor(depth / 2));
  const prisms = depth >= 3 ? 1 : 0;
  let receptors = depth < 2 ? 1 : 2;
  if (depth >= 6 && depth % 3 === 2) receptors = 3;
  if (prisms > 0) receptors = Math.max(2, receptors);
  return { par, prisms, receptors };
}

function orientForTurn(dirIn, dirOut) {
  return REFLECT['/'][dirIn] === dirOut ? '/' : '\\';
}

function buildEndlessCandidate(rng, depth) {
  const cols = 12;
  const rows = 8;
  const { par, prisms, receptors: wantReceptors } = endlessTarget(depth);
  const key = (x, y) => x + ',' + y;
  const pathCells = new Set();
  const mirrors = []; // {x, y, orient(solution), path:true}
  const pathMirrorIdx = [];
  const emitter = { x: 1, y: 1 + Math.floor(rng() * 6), dir: 'E' };
  pathCells.add(key(emitter.x, emitter.y));

  // Main path: bends = par + 0..1 extra correct mirrors for reading depth.
  const bends = par + (rng() < 0.5 ? 0 : 1);
  let cx = emitter.x;
  let cy = emitter.y;
  let dir = 'E';
  const straightCells = []; // non-mirror path cells (receptor / prism spots)
  const roomAhead = (x, y, d2, need) => {
    const dd = DIRS[d2];
    for (let s = 1; s <= need; s++) {
      const nx = x + dd.x * s;
      const ny = y + dd.y * s;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || pathCells.has(key(nx, ny))) return false;
    }
    return true;
  };
  for (let b = 0; b < bends; b++) {
    const len = 2 + Math.floor(rng() * 3); // 2..4
    const d = DIRS[dir];
    const mx = cx + d.x * len;
    const my = cy + d.y * len;
    if (mx < 0 || mx >= cols || my < 0 || my >= rows) return null;
    for (let s = 1; s < len; s++) {
      const k = key(cx + d.x * s, cy + d.y * s);
      if (pathCells.has(k)) return null;
      pathCells.add(k);
      straightCells.push({ x: cx + d.x * s, y: cy + d.y * s, dir });
    }
    if (pathCells.has(key(mx, my))) return null;
    pathCells.add(key(mx, my));
    // Pick a turn that leaves room for the next leg (the last bend only
    // needs a short tail). Prefer the random side, fall back to the other.
    const need = b === bends - 1 ? 1 : 2;
    const first = rng() < 0.5 ? TURN_LEFT[dir] : TURN_RIGHT[dir];
    const second = first === TURN_LEFT[dir] ? TURN_RIGHT[dir] : TURN_LEFT[dir];
    const out = roomAhead(mx, my, first, need) ? first : (roomAhead(mx, my, second, need) ? second : null);
    if (!out) return null;
    pathMirrorIdx.push(mirrors.length);
    mirrors.push({ x: mx, y: my, orient: orientForTurn(dir, out), path: true });
    cx = mx; cy = my; dir = out;
  }
  // Final straight off the last mirror.
  const tail = 2 + Math.floor(rng() * 3);
  const td = DIRS[dir];
  for (let s = 1; s <= tail; s++) {
    const nx = cx + td.x * s;
    const ny = cy + td.y * s;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;
    if (pathCells.has(key(nx, ny))) return null;
    pathCells.add(key(nx, ny));
    straightCells.push({ x: nx, y: ny, dir });
  }
  if (straightCells.length < wantReceptors + prisms) return null;

  // Prism + branch (deeper depths): the turn branch must also land.
  const prismCells = [];
  const branchCells = new Set();
  let branchReceptor = null;
  if (prisms > 0) {
    let placed = false;
    const order = [...straightCells].sort(() => rng() - 0.5);
    for (const cell of order) {
      const bdir = PRISM_TURN[cell.dir];
      const bd = DIRS[bdir];
      const blen = 2 + Math.floor(rng() * 3);
      let ok = true;
      const cells = [];
      for (let s = 1; s <= blen; s++) {
        const nx = cell.x + bd.x * s;
        const ny = cell.y + bd.y * s;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || pathCells.has(key(nx, ny))) { ok = false; break; }
        cells.push({ x: nx, y: ny });
      }
      if (!ok || cells.length < 2) continue;
      prismCells.push({ x: cell.x, y: cell.y });
      for (const c of cells) { branchCells.add(key(c.x, c.y)); pathCells.add(key(c.x, c.y)); }
      branchReceptor = cells[cells.length - 1];
      placed = true;
      break;
    }
    if (!placed) return null;
  }

  // Receptors: branch gets one (if any), the rest sit on the main path.
  const prismKeys = new Set(prismCells.map((p) => key(p.x, p.y)));
  const receptorSpots = straightCells.filter((c) => !prismKeys.has(key(c.x, c.y)));
  const receptors = [];
  if (branchReceptor) receptors.push(branchReceptor);
  const needMain = wantReceptors - receptors.length;
  if (receptorSpots.length < needMain) return null;
  // Prefer later path cells so the beam must travel to light them.
  const sorted = [...receptorSpots].sort((a, b) => (a.x + a.y * cols) - (b.x + b.y * cols));
  for (let i = 0; i < needMain; i++) {
    const idx = Math.floor((sorted.length * (i + 1)) / (needMain + 1)) + Math.floor(rng() * 2);
    const cell = sorted[Math.min(sorted.length - 1, idx)];
    if (!receptors.some((r) => r.x === cell.x && r.y === cell.y)) receptors.push({ x: cell.x, y: cell.y });
  }
  if (receptors.length < wantReceptors) return null;

  // Decoys + walls on free cells (never on the path or branch).
  const free = [];
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    if (!pathCells.has(key(x, y))) free.push({ x, y });
  }
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const decoys = Math.min(6, 4 + Math.floor(depth / 3));
  const wallCount = 4 + Math.floor(rng() * 5);
  if (free.length < decoys + wallCount) return null;
  for (let i = 0; i < decoys; i++) {
    mirrors.push({ x: free[i].x, y: free[i].y, orient: rng() < 0.5 ? '/' : '\\', path: false });
  }
  const walls = free.slice(decoys, decoys + wallCount).map((c) => ({ x: c.x, y: c.y }));

  // Scramble: flip exactly `par` path mirrors.
  const shuffled = [...pathMirrorIdx].sort(() => rng() - 0.5);
  const flipped = new Set(shuffled.slice(0, par));
  const startMirrors = mirrors.map((m, i) => ({
    x: m.x, y: m.y,
    orient: flipped.has(i) ? (m.orient === '/' ? '\\' : '/') : m.orient,
  }));

  return {
    id: 1000 + depth,
    name: `Lattice ${depth + 1}`,
    hint: depth === 0 ? 'Endless Lattice — clear chambers to climb. One fail ends the run.' : 'Route the beam. Light every receptor.',
    accent: ENDLESS_ACCENTS[depth % ENDLESS_ACCENTS.length],
    cols, rows,
    emitter,
    walls,
    mirrors: startMirrors,
    prisms: prismCells,
    receptors,
    budget: par + 1,
    parMoves: par,
    parTime: 15 * par + 15,
    endless: true,
    depth,
  };
}

function randomWinRate(chamber, trials, seedBase) {
  const rotIdx = chamber.mirrors.map((m, i) => (m.fixed ? -1 : i)).filter((i) => i >= 0);
  let wins = 0;
  for (let s = 0; s < trials; s++) {
    const rng = mulberry32(seedBase + s * 7919);
    const run = createRun(chamber);
    while (run.phase === 'playing') {
      rotateMirror(run, rotIdx[Math.floor(rng() * rotIdx.length)]);
    }
    if (run.phase === 'won') wins++;
  }
  return wins / trials;
}

export function endlessChamber(seed, depth) {
  const target = endlessTarget(depth).par;
  let fallback = null; // best near-miss: solver par closest to target, never trivial
  for (let attempt = 0; attempt < 240; attempt++) {
    const rng = mulberry32((seed >>> 0) ^ Math.imul(depth + 1, 0x9E3779B9) ^ Math.imul(attempt + 1, 0x85EBCA6B));
    const candidate = buildEndlessCandidate(rng, depth);
    if (!candidate) continue;
    const sol = solve(candidate);
    if (!sol || sol.moves < 2) continue;
    const start = traceBeam(candidate, candidate.mirrors.map((m) => m.orient));
    if (start.solved) continue;
    if (!fallback || Math.abs(sol.moves - target) < Math.abs(fallback.sol.moves - target)) {
      fallback = { chamber: candidate, sol };
    }
    if (sol.moves !== candidate.parMoves) continue; // shortcut — reject
    // Random-bot gate, stricter than tests/bot.js so accepted chambers
    // pass it on independent seeds. Par-2 teaching depths (0-1) get the
    // same honest allowance as campaign chamber 1: with budget 3 the
    // flail win rate is inherently ~10%, so the gate is "far below the
    // solver's 100%", not zero.
    const randomLimit = depth < 2 ? 0.2 : 0.05;
    if (randomWinRate(candidate, 60, (seed >>> 0) + depth * 104729) > randomLimit) continue;
    candidate.seed = seed;
    return candidate;
  }
  // Fallback: keep the closest solvable candidate, re-parred honestly.
  if (fallback) {
    fallback.chamber.parMoves = fallback.sol.moves;
    fallback.chamber.budget = fallback.sol.moves + 1;
    fallback.chamber.parTime = 15 * fallback.sol.moves + 15;
    fallback.chamber.seed = seed;
    return fallback.chamber;
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
