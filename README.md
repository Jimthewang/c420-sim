# C420 Sailing Simulator

A browser sailing game built around a Club 420 dinghy. Phase 1 is free sailing: steer, trim the mainsail, watch the wind, and explore how the boat responds.

**Play locally on this Mac:** double-click **Play C420.command** in this folder. It opens the built game in your browser. Keep its Terminal window open while playing. If the game is already running, use [the local game](http://127.0.0.1:4173/c420-sim/). This launcher uses the already-installed local runtime and dependencies; it is not a portable installer.

**Game address:** [jimthewang.github.io/c420-sim](https://jimthewang.github.io/c420-sim/). This address becomes available after the Phase 1 pull request is merged and GitHub Pages finishes publishing. A pull request is a proposed set of changes that can be reviewed before it becomes the public game.

## Start sailing

1. Open the game in desktop Chrome or Safari and click **Start sailing**.
2. Let the boat build speed with the wind coming from the side. This is a **reach**.
3. Hold **A/D** or the **left/right arrow** keys to steer.
4. Hold **W** to pull the mainsail in, or **S** to let it out. This changes the **mainsheet**, the rope that controls the mainsail's angle.
5. Watch the speed and sail feedback. **Luffing** means the sail is fluttering instead of producing useful lift. **Stalled** means airflow has separated from an overtrimmed sail, reducing drive.
6. Press **C** to see the boat from above. Try steering toward the wind, notice the loss of speed, then bear away to get moving again. **Bear away** means turn farther away from the direction the wind comes from.

The smaller forward sail, the **jib**, trims automatically. Steering gets weaker as the boat slows because the rudder needs water flowing past it. A **tack** is a turn through the wind; a **gybe** is a turn with the wind passing across the stern. Both happen by steering, without an automatic turn button.

## Controls

| Key | Action |
| --- | --- |
| A / left arrow | Steer left (port) |
| D / right arrow | Steer right (starboard) |
| W | Pull mainsheet in |
| S | Ease mainsheet out |
| C | Switch chase / overhead camera |
| Esc | Pause / resume |
| R | Reset the free-sailing session |
| H | Show / hide controls help |
| F3 | Show / hide physics readout |
| G | Show / hide settings |

## Change conditions

Press **G** to open settings. Adjust wind speed from 4 to 20 knots, wind direction, wind shifts, gusts, and combined crew weight. A **knot** is one nautical mile per hour; a **gust** is a temporary increase in wind speed. Settings apply to the current session. Reset returns the boat to its starting position.

The F3 readout shows the quantities behind the boat's motion:

- **True wind:** wind relative to the water.
- **Apparent wind:** wind felt on the moving boat, after allowing for boat velocity.
- **Angle of attack:** the angle between a sail and its incoming airflow.
- **Leeway:** sideways movement through the water.
- **VMG:** velocity made good, or the part of boat speed that moves directly upwind; negative values mean progress downwind.

Heel and righting moments are marked as unavailable in Phase 1. **Heel** is the boat leaning sideways; a **righting moment** is the turning force that brings it upright.

## Tune the boat

The game's editable numbers live in two files. A **config file** holds settings separately from the calculations that use them:

- [src/config/boat.ts](src/config/boat.ts): boat dimensions, sail sizes, weight, sail response, hull resistance, and steering.
- [src/config/environment.ts](src/config/environment.ts): wind behavior, air and water properties, and simulation timing.

Each value has a comment explaining its sailing meaning and units. Change one value at a time, sail the same heading and wind conditions, and compare the F3 readout. Ask Codex to make a change if you prefer; you do not need to edit code yourself. Important changes should also pass the automated physics checks described in [setup notes](docs/SETUP.md).

This first phase uses a custom force model with apparent wind, sail lift and drag, sideways water resistance, hull resistance, and flow-dependent rudder response. Boat motion follows these calculated forces. It is an early training model, and the speed calibration will be refined with sailor feedback.

## What comes next

Phase 1 has no races or sound. Dynamic heel, capsizing, centerboard adjustment, planing, and more complete tack/gybe behavior come in Phase 2. Two moving sailors arrive in Phase 3, and the first complete race in Phase 4. **Planing** means the hull rises and skims over the water at higher speed.

Read [PROGRESS.md](PROGRESS.md) for completed checks and known limitations, and [SPEC.md](SPEC.md) for the full requested game. Each phase is delivered as one pull request, with feedback before the next phase begins.

## Development and publishing

[Setup notes](docs/SETUP.md) explain how to run a local copy and how GitHub Pages publishes the game. The project uses TypeScript, Vite, Three.js, lil-gui, and Vitest with exact dependency versions and a saved dependency lockfile. A **lockfile** records the installed dependency versions so another computer can reproduce the same setup.

Three.js's official Water and Sky examples provide the ocean-rendering foundation. The sailing calculations are custom; the game does not run a general-purpose physics engine.
