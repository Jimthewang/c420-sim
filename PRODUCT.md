# C420 Club Racing

## Register
Product: a playable browser sailing simulator with a miniature NPR world and Neo-Brutalism controls.

## People and purpose
A college sailor checks credible sailing behavior; a newcomer learns steering, sheet control, and racing. All seven original phases are implemented: free sailing, crew and capsize dynamics, races, AI fleets, synthesized sound, lessons, series, and saved records. SPEC.md remains the original gameplay brief; the October 2026 user request approves the visual, camera, and collision overhaul described in DESIGN.md.

## Experience
The player uses a desktop keyboard and mouse or trackpad to sail and freely inspect a vivid archipelago. A coastal boat showcase leads into grouped race setup. Clear instruments leave the central water open; a foldable course chart, actual leg progress and short race notices help the player read the race. Results show the player's recorded sailing trace. Main gameplay actions remain discoverable in setup and the H help panel. Appearance controls are immediately accessible; detailed force telemetry stays behind F3. Realistic assistance keeps navigation aids hidden.

## Principles
- Preserve the existing force calculations, race rules, teaching goals, and scorekeeping.
- Render waves and crew posture respond to simulation state without secretly steering the boat.
- Grounding and solid-object contacts resolve geometry after force integration; AI must recover using the same sailing model.
- Terrain regeneration keeps the active course and current fleet positions navigable.
- Test completed behavior and report the limits of the approximation. Automated checks do not replace sailor feedback.
- Keep HTML controls keyboard-accessible and readable, including pause, setup, results, and narrow-window layouts.
