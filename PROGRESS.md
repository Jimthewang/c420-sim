# C420 simulator progress

## All seven phases plus the NPR, camera and collision overhaul implemented

The game now supports a complete sailing session: menu, setup, pre-start sailing, three-minute sequence, fleet race, finish, results, and another race or return to the menu. The later request to complete every phase together replaces the original intermediate stopping points. The original SPEC.md remains unchanged.

| Phase | What is built |
| --- | --- |
| 1 | Pinned project setup, custom wind/sail/hull/foil forces, ocean, C420, keyboard helm/trim, three cameras, settings, debug readout, tests, and Pages workflows. |
| 2 | Heel, weather helm, capsize and recovery, adjustable centerboard, planing, tack speed loss, gybe response, and calibrated speeds. |
| 3 | Two moving sailors whose weight changes righting force and drag; automatic and manual jib/hiking controls, plus bounded roll-tack assistance. |
| 4 | Windward mark, leeward gate, start/finish line, 180-second sequence, OCS return, correct-side rounding, race results, restart, free sail, start practice, and time trial. |
| 5 | Synthesized wind, hull wash, planing, luffing, maneuvers, horns, and optional final-ten-second beeps; sound mute and pause. |
| 6 | Up to seven selectable AI opponents using the same boat physics, wind shadows, boat avoidance, OCS/capsize recovery, simplified right-of-way, and sailed penalty turns. |
| 7 | Three assistance levels, six interactive lessons, three-race low-point scoring, browser-saved records and lesson progress, graphics settings, and fleet rendering optimizations. |

## NPR, free camera and collision overhaul

- All solid models now use a three-step toon ramp, welded inverted-hull outlines, a cream/lemon/coral palette and a 2048 PCF sunlight shadow map. Curved hull, tanks, seats, foils, committee boat and buoys replace boxes. Day/night lighting, outline visibility and island seed controls are available in the HUD.
- Seeded four-octave terrain creates irregular islands, bays, reefs, trees and a lighthouse while keeping the race corridor deep. Flat triangulated water, boats, shoreline/spray foam and camera clearance share a continuous gust-responsive wave sampler.
- Orbit, diorama and tactical modes support drag rotation, right/middle/Shift-drag pan, 4–180 m scroll zoom and smooth double-click/V recentering. Camera navigation continues while the simulation is paused, with clearance above both land and water.
- Every HUD, setup panel and result dialog uses solid cream/bright blocks, 3 px black borders and hard offset shadows. Narrow-screen layout preserves the sailing controls.
- Swept terrain/appendage grounding and oriented-box/circle contacts separate boats, marks and the committee boat with friction and linear/angular impulses. Existing race adjudication runs before physical separation. Sailors duck during boom sweeps, with actual body/outline geometry checked against internal solids.
- `getTelemetry` and the original aerodynamic/hydrodynamic integrator are retained. AI navigates the new solid obstacles and recovers from backing using real helm/sheet inputs.

## Current overhaul verification

- **130 tests across 13 files passed** in the final local run. TypeScript and production build passed; the existing bundle-size advisory remains.
- All five full-physics fleet regressions still finish every boat with no outstanding penalty: light/standard/heavy wind, 120/220/350 m courses, one/two laps, and nine boats in rotated gusting wind. A backed-down boat also recovers through real controls and completes its course.
- Collision tests cover swept high-speed crossings, linear/angular momentum and energy, hull/foil clearance against actual triangulated terrain, both capsize directions, and an eight-boat queue pressed into shore. The independent reviewer reran the original failing capsize and queue probes successfully after the fixes.
- Full sailor meshes, limb instances and outline shells are checked against internal solids in 378 normal-suite configurations; a separate independent dense sweep passed 1,638 poses. These are sampled geometry checks, not a claim of a formal proof for every possible pose.
- The final production renderer was exercised in the in-app Chromium browser and Safari. Checks include actual sailing, orbit/three-mode navigation, zoom/recenter, pause camera operation, outline toggling, seed regeneration, day/night, race countdown, and narrow-screen lesson layout. Current-build console inspection found no errors or warnings in the tested flow.
- The original `sailForce`, `foilForce`, `forces`, `sampleWind`, crew/maneuver calculations and `getTelemetry` remain byte-for-byte unchanged. Existing OCS, rounding, wind-shadow, penalty, tutorial and record assertions pass. Only physically invalid test setup paths were corrected to avoid teleporting through newly solid objects; straight-line speed tests now reserve an empty calibration corridor.

## Earlier seven-phase verification

The following checks were completed for the version preceding the visual/collision overhaul; current regression results are reported above.

- **74 automated tests passed:** 34 physics tests, 31 race/AI tests, and 9 tutorial/record/scoring tests. TypeScript checks and the production build passed.
- Five automated full-physics races finished every boat without an outstanding penalty or DNF: 4/10/18-knot wind, 120/220/350-metre courses, one/two laps, and a nine-boat stress scenario with shifts, puffs, and rotated wind. The normal game allows at most eight boats including the player.
- An independent review ran four more complete fleet scenarios through light/heavy wind, shifts, puffs, rotated courses, and two laps; all boats finished. The bounded race time limit is 20 minutes after the start.
- Review regressions cover a bow crossing early while the boat centre is still below the line, clearing the whole hull before restarting, same-tack rear-end contact, genuine overlap, and AI capsize recovery.
- Current production build opened and sailed in **Chrome and Safari**. Checks included setup, keyboard steering/trim, camera changes, centerboard movement, settings, help, pause, and the start countdown. Both browsers visibly reported active audio after a launch gesture.
- In the in-app browser, lesson 1 passed through actual keyboard sailing, advanced to lesson 2, and stayed saved after reload. Realistic-mode strong-wind testing produced a capsize from incorrect hiking, then recovered through eased main, lowered board, and sustained righting input.
- A separate, clearly labeled local verification page drove the actual physics/AI through three races at 120 updates per second and displayed the real production results UI. Next-race navigation and cumulative scores were checked: final series scores included 1+3+1=5 and 2+1+4=7. This is accelerated AI/UI verification, not a claim that a human manually sailed the full series.
- Synthesized audio was also checked with an AudioContext test double for gesture unlock, changing gains, pause/mute, horns, and maneuver events. Audible quality and the feel of the game remain for sailor feedback.
- Competitive conditions lock during races. Personal bests save at the player's finish, even if the player leaves before the fleet finishes. Restarting after series results begins a fresh series rather than double-counting a race.

## Speed calibration

With 130 kg automatic crew, no spinnaker, steady wind, and the heading actively held against weather helm:

| Wind | Point of sail | Boat speed |
| --- | --- | --- |
| 10 knots | 45° upwind | 4.34 knots |
| 15 knots | 90° beam reach | 10.01 knots |
| 18 knots | 120° broad reach | 9.72 knots |
| 20 knots | 120° broad reach | 10.88 knots |

These are model calibration results, not measured C420 validation. Detailed assumptions and additional measurements are in [docs/PHYSICS.md](docs/PHYSICS.md).

## Limits that remain deliberate

- Sailing coefficients, planing, roll-tack work, crew movement, spinnaker, and wind shadows are simplified and editable. Waves drive rigid visual heave/pitch/roll and grounding clearance; there is no full fluid, six-axis wave-impact or sail-cloth simulation.
- Right-of-way and contact rules are a training approximation. Full mark-room, formal protests and all overlap exceptions are not implemented. Solid collision impacts are implemented with conservative hull envelopes. A single sailed 360° turn is the game's simplified penalty.
- The optional digital-N course and phone touch controls are outside the seven requested phases.
- The game was checked on this Mac, not benchmarked across a range of average laptops. A low graphics setting is included; rendering still needs user feedback on other hardware.
- LocalStorage saves belong to the current browser and address. The local and future public game have separate records. Clearing browser data removes those records. An unfinished series is session-only.
- All-DNF ties do not count as a saved series win. Long/light-air races can hit the 20-minute limit.

## Delivery and next step

[Pull request #1](https://github.com/Jimthewang/c420-sim/pull/1) contains the complete game on branch `phase-1-core`; its title and description cover the full delivery. Its automated Checks tab runs the same tests and build. No changes are pushed directly to `main`.

The local game is at [127.0.0.1:4173/c420-sim](http://127.0.0.1:4173/c420-sim/). Double-click **Play C420.command** in the repository folder to start it on this Mac. [README.md](README.md) explains every mode, control, setting, and recovery procedure without requiring coding knowledge.

Public deployment is **not yet claimed**. The remaining release step is final review/merge of the pull request, with GitHub Pages configured for GitHub Actions, followed by a successful deployment and a check of [the public game](https://jimthewang.github.io/c420-sim/). Automated and browser checks do not substitute for the user's acceptance of sailing realism.
