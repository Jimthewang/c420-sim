# Complete C420 Game Implementation Plan

> Execute with subagent-driven-development and test-driven-development. The user has explicitly authorized completing all remaining phases in one continuous delivery, overriding the original per-phase pause requirement. Preserve SPEC.md as the original request.

**Goal:** Deliver a playable fleet-racing C420 game covering phases 2–7, with measurable physics, full race flow, crew, audio, opponents, tutorials and saved scoring.

**Architecture:** Extend the existing custom force integrator. Keep deterministic race/AI/tutorial logic separate from browser rendering, audio and UI. Use the same integrator and environment for the player and every opponent. Maintain the existing phase-1-core branch and PR; no direct main push.

**Tech stack:** Existing pinned TypeScript, Vite, Three.js, lil-gui and Vitest; native Web Audio and localStorage. No new dependency needed.

## Global constraints
- Vite base remains `/c420-sim/`.
- All physical constants and tuning values live in src/config/boat.ts and src/config/environment.ts with explanatory comments.
- Difficulty changes assists only, never the physics. Beginner can recover automatically; realistic requires a manual righting procedure.
- College rig defaults to no spinnaker and no trapeze; both crew positions affect righting and drag.
- Three-minute starting sequence, OCS return/restart, correct-side roundings, ordered finish, low-point series.
- Six interactive lessons each require actual sailing input and a pass condition.
- Desktop Chrome and Safari, no external assets or sound files.
- Mark empirical coefficients and simplified racing-rule adjudication honestly; do not claim measured C420 validation or official umpiring.

## Task 1 — Boat dynamics and physical crew
Files: src/physics/types.ts, sailing.ts, sailing.test.ts; src/config/{boat,environment}.ts; docs/PHYSICS.md.
- [x] Add heel/roll, centerboard, capsize/righting, dynamic crew placement, manual jib/hiking, roll-tack and gybe response, planing resistance, optional spinnaker and wake disturbance.
- [x] Preserve existing API compatibility while supplying real telemetry for heel/moments/planing/crew.
- [x] Test board leeway, crew righting, capsize/righting, planing speed, tack energy bounds and zero-wind stability; keep prior regressions meaningful.
- [x] Calibrate steady 10-knot close-hauled and 15–20-knot reaching runs and document measurements.

## Task 2 — Race course, competitors and rules
Files: src/game/race.ts, ai.ts, race.test.ts and related game-only files.
- [x] Generate a wind-relative windward-leeward course with committee/start pin, windward mark and leeward gate.
- [x] Implement setup/prestart/countdown/racing/finish; free sail, start practice and time trial.
- [x] Detect start direction and segment crossing, OCS return, ordered correct-side rounding, finishes and time.
- [x] Use the same boat physics for opponents; tacking/gybing navigation and start timing, returning OCS boats, collision avoidance.
- [x] Implement bounded wind shadow and basic port/starboard and windward/leeward infringements with clear penalties and a penalty-turn clearing mechanism.
- [x] Add deterministic tests of geometry, chronology, penalties and complete AI course sailing.

## Task 3 — Scene and synthesized sound
Files: src/render/{boat,world,types}.ts and src/audio.ts.
- [x] Animate skipper and crew from the integrator's actual positions, including hiking, transitions, capsize and board state.
- [x] Render colored opponent boats, orange marks, committee boat, start line, target/layline assists, wind-scaled water and visible puffs.
- [x] Keep geometries reusable and cap rendering resolution for fleet performance; provide quality setting.
- [x] Synthesize wind, hull water, planing, luffing, boom/sheet events and countdown horns with user-gesture audio unlock; pause/mute fully silent.

## Task 4 — Complete playable application
Files: src/main.ts, ui.ts, style.css, src/game/tutorial.ts, records.ts and tests.
- [x] Title → setup → prestart → countdown → race → results → race again/menu; pause/restart everywhere.
- [x] All helm, sheet, centerboard, hiking/manual crew, righting and penalty controls reachable and documented.
- [x] HUD timing/OCS/next mark/place and real debug values; difficulty-gated trim/route/layline assists.
- [x] Tutorial reach, no-go/upwind, tack, gybe, rounding and start lessons with pass criteria and next/retry flow.
- [x] Low-point series across races, persistent personal bests, results with 2–3 behavior-derived tips.
- [x] Settings include wind, crew weight, spinnaker, assists, sound, optional final-ten-second beeps, graphics quality.

## Task 5 — Integration, review and delivery
- [x] Run relevant unit/integration tests and production build. Run automated full-race simulations and correct any completion/AI issues.
- [x] Review all added requirements against implementation, fixing actual gaps before declaring completion.
- [x] Browser checks: setup, tutorial pass/save, free sail, countdown, manual capsize/righting, help, settings, pause and cameras. OCS/full races use automated simulations; results/series UI uses a clearly labeled accelerated physical-race harness. Audio graph behavior uses a test double; browser playback activation is observed.
- [x] Prepare final README/PROGRESS and the playable local game for delivery through the existing PR. Check GitHub CI on the uploaded commit before final handoff; public merge/deployment remains the final release decision.

## Verification evidence

74 automated tests pass (34 physics, 31 race/AI, 9 learning/records); TypeScript and production build pass. Chrome, Safari, and in-app browser checks are recorded in PROGRESS.md. Independent reviews found and resolved hull-line detection, clear-astern responsibility, record timing, and series replay issues. Public release and user acceptance remain separate from implementation verification.
