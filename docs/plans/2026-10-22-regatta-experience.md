# The regatta experience

Baseline: `0957c84`. The user delegates creative direction for a substantial design upgrade. Preserve the current C420 forces, race adjudication, lessons, solid collisions and articulated crew.

## Direction

A vivid miniature coastal regatta, with the boat as the main character. The existing cream, lemon, coral, green and teal palette remains. The opening scene frames the full boat beside the menu; on the water, information sits around an open central view. Water needs moving surface structure and thin trails rather than isolated white lumps. Race information should explain where the player is going and what just happened, using authoritative state.

## Work and checks

1. **Coastal art and showcase.** Add ocean tonal detail, smaller spray, persistent surface wakes and a considered menu camera. Preserve wave heights, water seams, pause behavior and the three camera controls. Check existing water/camera tests and inspect daylight, night and low quality in the browser.
2. **Club identity and interface.** Refine the welcome, setup, HUD and results within the existing Neo-Brutalism system. Preserve every mode and action. Check keyboard access and 1280, 1024, 390 and 319-pixel layouts.
3. **Race companion.** Draw the real course, fleet and recent player track in a compact north-up chart. Show actual target bearing, closing speed and legal course progress. Derive start-line estimates from hull geometry and finite line crossing; label estimates. Realistic mode keeps assistance restrictions.
4. **Race moments and debrief.** Display player-specific legal starts, roundings, penalties, OCS, capsizes and finishes without consuming race events or changing game state. Sample a bounded sailing log for real speed, distance, maneuvers and a results trace. Test pauses, resets, competing events and completed runs.
5. **Delivery.** Run the full regression suite, type checking and production build. Independently review new logic; visually iterate on the actual game. Keep the local server running and update the existing PR without merging.

Success means a cohesive playable upgrade with verified controls, real rather than invented telemetry, and no regression in the preserved sailing systems. Cross-device performance and sailor acceptance remain empirical limits, not claims of perfection.
