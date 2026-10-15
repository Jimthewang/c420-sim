# C420 simulator progress

## All seven phases implemented — final review and public deployment pending

The game now supports a complete sailing session: menu, setup, pre-start sailing, three-minute sequence, fleet race, finish, results, and another race or return to the menu. The later request to complete every phase together replaces the original intermediate stopping points. The original SPEC.md remains unchanged.

| Phase | What is built |
| --- | --- |
| 1 | Pinned project setup, custom wind/sail/hull/foil forces, ocean, C420, keyboard helm/trim, two cameras, settings, debug readout, tests, and Pages workflows. |
| 2 | Heel, weather helm, capsize and recovery, adjustable centerboard, planing, tack speed loss, gybe response, and calibrated speeds. |
| 3 | Two moving sailors whose weight changes righting force and drag; automatic and manual jib/hiking controls, plus bounded roll-tack assistance. |
| 4 | Windward mark, leeward gate, start/finish line, 180-second sequence, OCS return, correct-side rounding, race results, restart, free sail, start practice, and time trial. |
| 5 | Synthesized wind, hull wash, planing, luffing, maneuvers, horns, and optional final-ten-second beeps; sound mute and pause. |
| 6 | Up to seven selectable AI opponents using the same boat physics, wind shadows, boat avoidance, OCS/capsize recovery, simplified right-of-way, and sailed penalty turns. |
| 7 | Three assistance levels, six interactive lessons, three-race low-point scoring, browser-saved records and lesson progress, graphics settings, and fleet rendering optimizations. |

## Verification completed

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

- Sailing coefficients, planing, roll-tack work, crew movement, spinnaker, and wind shadows are simplified and editable. Waves are visual, and there is no full fluid or sail-cloth simulation.
- Right-of-way and contact rules are a training approximation. Mark-room, protests, full overlap exceptions, and collision impact forces are not implemented. A single sailed 360° turn is the game's simplified penalty.
- The optional digital-N course and phone touch controls are outside the seven requested phases.
- The game was checked on this Mac, not benchmarked across a range of average laptops. A low graphics setting is included; rendering still needs user feedback on other hardware.
- LocalStorage saves belong to the current browser and address. The local and future public game have separate records. Clearing browser data removes those records. An unfinished series is session-only.
- All-DNF ties do not count as a saved series win. Long/light-air races can hit the 20-minute limit.

## Delivery and next step

[Pull request #1](https://github.com/Jimthewang/c420-sim/pull/1) contains the complete game on branch `phase-1-core`; its title and description cover the full delivery. Its automated Checks tab runs the same tests and build. No changes are pushed directly to `main`.

The local game is at [127.0.0.1:4173/c420-sim](http://127.0.0.1:4173/c420-sim/). Double-click **Play C420.command** in the repository folder to start it on this Mac. [README.md](README.md) explains every mode, control, setting, and recovery procedure without requiring coding knowledge.

Public deployment is **not yet claimed**. The remaining release step is final review/merge of the pull request, with GitHub Pages configured for GitHub Actions, followed by a successful deployment and a check of [the public game](https://jimthewang.github.io/c420-sim/). Automated and browser checks do not substitute for the user's acceptance of sailing realism.
