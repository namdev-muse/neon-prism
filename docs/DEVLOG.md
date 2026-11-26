# Neon Prism — Devlog

## v0.4.0 — M4 Progression & Depth (2026-11-26)

- **Endless Lattice mode**: seeded chambers that scale as you climb. Each chamber is generated backward from a solution — lay a beam path (mirrors at the bends, a prism branch from depth 3, receptors on the path), dress it with decoy mirrors and off-path walls, then flip exactly `par` path mirrors to make the starting state. Every candidate is verified before it ships to the player: solver par must equal the scramble count (no shortcuts), the start must be unsolved, and a random-rotate bot must rarely win. Par scales 2 → 13 with depth; budget is always par + 1. Clear to climb; one budget fail ends the run and banks the best streak + lattice score. Deterministic in (seed, depth) — `?endless=SEED` is the playtest path.
- **Ranks fixed so all three tiers are reachable**: the old moves-only rule made B impossible (budget caps moves at par + 1, inside the old A band). Ranks now read moves AND time — S = par moves, fast; B = spent the slack move and slow; A = everything else. Badges are color-coded (S gold, A cyan, B violet) on chamber cards and the complete screen.
- Verification: smoke 140/140 (adds rank-tier and endless determinism/scaling checks), bot gates all pass (solver rides 10 lattice depths; random bot 14% at the par-2 teaching depths — same allowance as campaign chamber 1 — and ≤4% deeper, so flailing cannot climb), render check PASS (adds the full endless flow: seeded entry, clear → streak, Next Lattice, fail → best banked), size sweep inspected by eye.

## v0.3.0 — M3 Feel & Juice (2026-11-26)

- Every event now fires its full feedback bundle in the same frame as the input: rotate-snap (sound + sparks at the mirror + micro-shake), beam-block sparks where each beam head dies at a wall or the chamber edge (the sim now reports beam endpoints), receptor-lit (sound + shake + burst + LIT pop), solve (hit-stop + slow-mo + flash + zoom + gold shockwave ring + per-receptor bursts + the score as a number pop), budget-fail (lose sting + heavy shake + red flash + endpoint sparks + partial-score pop). Cumulative fx counters in the test hook assert no event can silently go dead.
- Ambient beam sparks: a cheap trickle of sparks drifts off the live beam so it reads as energy, not a static line (hard-capped particle pool — no per-frame allocation growth).
- MOVES meter: the budget bar now turns magenta on the last move, so the final decision reads at a glance.
- Generative music lifts proportionally with receptors lit: base octave, +1 octave with one lit, +2 with two or more.
- Complete screen names the score parts (Clear 1000 + Efficiency + Time = total) — the sim now stores the breakdown per run.
- Fix from the M2 playtest: clearing chamber 12 no longer shows a disabled primary button labelled "All Chambers Clear" (a dead-button look). The title carries the message and the Next button is hidden.
- Verification: smoke 129/129 (adds endpoint + score-parts checks), bot gates all pass on 12 chambers, render check PASS (adds rotate/block/lit/solve/fail bundle assertions, music-lift, low-meter and last-chamber screen checks), size sweep inspected by eye at 1280x720 / 2560x1080 / 1080x2340.

## v0.2.0 — M2 Chamber Craft (2026-11-26)

- 12 hand-crafted chambers with a real difficulty curve: solver pars strictly increase 2 → 13 (First Light … Void Crown), each with its own shape, mirror/prism layout, receptor count and budget (par + 1). New chambers: Serpent, Twin Branches, The Gauntlet, Prism Crossfire, Switchback, The Circuit, Serpent King, Triple Split (two prisms, three branches), Void Crown.
- Chamber craft method: intended beam path designed first, solution mirrors start flipped, blocker walls kill wrong-way beams at the first cell so no shortcut route exists. Two late chambers (Triple Split, Void Crown) initially had 4–5 move shortcuts through accidental chains; fixed by moving receptors off shared beam lines and re-routing the tail — solver now proves par 12 and 13.
- Anti-slop gates on all 12: solver bot clears every chamber in exactly par; no-input and spam bots lose all 12; random-rotate bot wins 0/50 on chambers 4–12 (chambers 1–3 unchanged: 22% / 4% / 2%).
- Fix from the M1 playtest: the keyboard selection box no longer shows by default (it sat on mirror 0, which is on every solver path — a soft hint). It now appears only after keyboard input.

## v0.1.0 — M1 Core (2026-11-26, local tree)

Built by the Neon Cycle finale run as the setup for sprint #14. Local tree only — repo creation, browser upload, live verification and the real-browser FUN playtest belong to the first milestone run (02:30). M1 is NOT done until that playtest says GO.

- Core: grid laser-mirror puzzle. Tap/click a mirror to rotate (/ ↔ \); prisms split the beam (straight + clockwise turn); walls stop it; light every receptor at once to clear; each rotation costs a move against the budget. Score from clear + efficiency + time; best + rank (S/A/B) saved per chamber; unlock chain; `?chamber=N` / `?unlock=1` public path (not in player UI).
- 3 chambers: First Light (1 receptor, par 2), Crossbeam (2 receptors, par 3), Prism Split (prism, 2 receptors, par 4). Each with its own accent and wall layout.
- Feel: trauma shake, hit-stop + slow-mo on solve, receptor sparks, score pops, named denied cues (fixed mirror / no moves / no mirror there), generative music lifting with receptors lit, synth SFX, FPS guard, settings (volume, shake, music, sfx, flashing, text size, contrast, perf readout).
- Menu: live attract demo (solver playing chamber 1) behind the panel, chamber cards, screen stack (menu / chambers / how-to / settings / pause / complete / game-over), hover tick + scale pop + press feedback, no version/engine text on player screens.
- Anti-slop gates: solver bot (BFS search replayed through the public rotate hook) clears all 3 in par moves; no-input and spam-one-mirror bots lose all 3; random-rotate bot wins 22% / 4% / 2% across 50 seeds (teaching chamber is the most forgiving; routing is the skill). No auto-rotate, no hint, no oracle — the beam shows what it does now, never what to do next.
