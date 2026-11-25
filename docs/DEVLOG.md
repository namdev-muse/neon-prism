# Neon Prism — Devlog

## v0.1.0 — M1 Core (2026-11-26, local tree)

Built by the Neon Cycle finale run as the setup for sprint #14. Local tree only — repo creation, browser upload, live verification and the real-browser FUN playtest belong to the first milestone run (02:30). M1 is NOT done until that playtest says GO.

- Core: grid laser-mirror puzzle. Tap/click a mirror to rotate (/ ↔ \); prisms split the beam (straight + clockwise turn); walls stop it; light every receptor at once to clear; each rotation costs a move against the budget. Score from clear + efficiency + time; best + rank (S/A/B) saved per chamber; unlock chain; `?chamber=N` / `?unlock=1` public path (not in player UI).
- 3 chambers: First Light (1 receptor, par 2), Crossbeam (2 receptors, par 3), Prism Split (prism, 2 receptors, par 4). Each with its own accent and wall layout.
- Feel: trauma shake, hit-stop + slow-mo on solve, receptor sparks, score pops, named denied cues (fixed mirror / no moves / no mirror there), generative music lifting with receptors lit, synth SFX, FPS guard, settings (volume, shake, music, sfx, flashing, text size, contrast, perf readout).
- Menu: live attract demo (solver playing chamber 1) behind the panel, chamber cards, screen stack (menu / chambers / how-to / settings / pause / complete / game-over), hover tick + scale pop + press feedback, no version/engine text on player screens.
- Anti-slop gates: solver bot (BFS search replayed through the public rotate hook) clears all 3 in par moves; no-input and spam-one-mirror bots lose all 3; random-rotate bot wins 22% / 4% / 2% across 50 seeds (teaching chamber is the most forgiving; routing is the skill). No auto-rotate, no hint, no oracle — the beam shows what it does now, never what to do next.
