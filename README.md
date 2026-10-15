# C420 Sailing Simulator

A playable 3D Club 420 sailing game with a two-person crew, fleet racing, a three-minute start, six sailing lessons, practice modes, and a three-race series. All seven requested phases are implemented. The player and opponents use the same custom sailing physics; difficulty changes assistance.

**Play on this Mac:** double-click **Play C420.command** in this folder. Keep its Terminal window open while playing. If it is already running, [open the local game](http://127.0.0.1:4173/c420-sim/). This launcher uses this Mac's installed tools; it is not a portable installer.

**Public game address:** [jimthewang.github.io/c420-sim](https://jimthewang.github.io/c420-sim/). Public hosting requires merging [pull request #1](https://github.com/Jimthewang/c420-sim/pull/1) and completing the GitHub Pages deployment. The local build does not mean the public game is live.

## Your first sail

1. Click **Learn to sail**, select lesson 1, and click **Enter the water**.
2. Hold **A/D** to steer. Hold **W** to pull the mainsail in and **S** to ease it out. The **mainsheet** is the rope controlling the mainsail's angle.
3. Keep the wind coming from the side, a **reach**, and build at least 2.5 knots of speed for five seconds. A **knot** is one nautical mile per hour.
4. The lesson passes only after you steer, adjust the main, and meet its sailing goal. Click **Next lesson** to continue.
5. Use **H** for controls, **Esc** to pause, and **C** to cycle orbit, diorama, and tactical views. Tutorial completion is saved in this browser.

The six lessons cover reaching, the no-go zone, tacking, gybing, rounding a mark, and starting. The **no-go zone** is the angle too close to the wind for useful forward sailing. A **tack** turns the bow through the wind; a **gybe** changes sides with the wind passing across the stern. Steer through each maneuver yourself.

## Race the fleet

1. Click **Set up a race**. Choose wind, crew weight, rig, assistance, opponents, course length, and laps. The college rig uses only main and jib; the optional club rig adds a spinnaker for downwind sailing.
2. **Enter the water** and sail freely near the starting line. Press **N** or **Start sequence** when ready.
3. Horns sound at 3:00, 2:00, 1:00, and the start. Cross between the pin and committee boat toward the wind after the start. **OCS** means over the starting line early; return completely below the line and cross again.
4. Sail around the windward mark, keeping it to port (your left), then sail downwind between the two gate marks. On another lap, round either gate mark to the outside and head upwind again. On the last lap, continue downwind across the start/finish line.
5. Give way when on port tack to a starboard-tack boat. On the same tack, keep clear when overtaking or when overlapping to windward. A contact can require a penalty: press **P**, then sail one complete 360° turn before finishing.
6. Your completed time saves immediately. When the fleet finishes or the time limit expires, the results show places, elapsed times, OCS, penalties, and three sailing tips. Choose **Race again** or **Back to menu**.

**Three-race series** keeps the same fleet for three races. Low points win: first earns 1, second 2, and a boat that does not finish earns fleet size + 1. Ties compare best finishes, then the most recent race. Click **Next race** between races. The current series stays in the session; personal bests, lesson progress, and series wins persist in this browser.

## Practice and assistance

- **Free sail:** open water with live wind and boat tuning.
- **Start practice:** consecutive three-minute sequences; after a legal start, return below the line for the next sequence.
- **Time trial:** cross the line to start the clock, complete the course, and compare with your saved best under the same conditions.
- **Beginner:** main/jib trim hints, target arrows, laylines, and automatic capsize recovery.
- **Intermediate:** laylines, with manual capsize recovery.
- **Realistic:** instrument feedback without navigation or trim aids; manual recovery.

**Laylines** show approximate close-hauled approach directions to the next target. They move with the sampled wind and are guidance, not a guarantee of reaching the mark without another tack.

## Controls

| Key | Action |
| --- | --- |
| A / left arrow, D / right arrow | Steer port / starboard |
| W / S | Pull in / ease the mainsheet |
| Z / X | Raise / lower the centerboard |
| J / L | Pull in / ease the jib with manual crew |
| Q / E | Move manual crew weight to port / starboard |
| Space | Coordinate crew movement through a roll tack |
| F, held | Right a capsize with main eased and board down |
| P | Arm a penalty, then sail a full turn |
| N | Begin a three-minute starting sequence |
| Left drag | Orbit freely; drag vertically to tilt |
| Right / middle drag or Shift + left drag | Pan the focus across the water |
| Scroll / trackpad scroll | Smooth zoom from 4 to 180 metres |
| V or double-click the water | Smoothly recenter on your boat |
| C | Orbit follow → isometric diorama → tactical overview |
| G | Wind, boat, sound, and graphics settings |
| F3 | Physics readout (Fn+F3 may be needed on a Mac) |
| H | Controls help |
| Esc | Pause / resume; close settings |
| R | Restart the current session; after results, start a fresh race or series |

The crew trims the jib and balances weight automatically by default. Turn off **Automatic crew** under **G** to use J/L and Q/E. **Hiking** means moving body weight outward to balance the sail force. Crew weight and position affect heel, drag, and roll-tack performance.

**Heel** is the boat leaning sideways. If you capsize in intermediate or realistic mode, hold **S** until the main is fully eased, hold **X** until the board is fully down, then hold **F** for the recovery progress to finish. Beginner supplies those same actions automatically. **Planing** means the hull lifts and skims over the water at higher speed.

## Islands, views, and appearance

The curved boats sail among three-dimensional islands with yellow beaches, green meadows, turquoise cliffs, trees, and a lighthouse. Polygonal waves lift and tilt the boat; white foam follows shorelines, bow splashes, wakes, and roll tacks. The camera stays above water and ground. You can drag outside the pause card while paused to inspect the scene.

Use **Ink on/off** at the top left to toggle black model outlines, **New islands** to generate another terrain seed, and **Sun** to choose a fixed hour of day or night. These controls work during a session. The course and current fleet positions remain deep water when islands regenerate.

Land, other hulls, buoys, and the committee boat are solid. A shallow approach slows and slides the boat along shore; lowering the centerboard requires more clearance. Hitting a mark or another boat during a race can require the existing sailed penalty turn. Crew automatically crouch before a crossing boom and stay within the molded cockpit and rail.

## Settings and sound

Set wind (4–20 knots), combined crew weight, rig, fleet, and course before racing. Wind, weight, and rig lock during competitive sessions so records remain comparable. In **Free sail**, **G** also changes wind direction, oscillating shifts, moving puffs/lulls, crew weight, and spinnaker live. A **puff** is a patch of stronger wind.

Sound begins after an interaction. Wind, hull wash, planing hiss, sail flutter, maneuvers, and horns are synthesized locally. Sound can be muted. Optional **Final 10s beeps (aid)** add countdown cues. If graphics struggle, choose **low** quality. Leaving the game tab pauses it.

## Check and tune realism

**F3** shows true and apparent wind, sail angle of attack, heel, leeway, upwind VMG, heeling/righting moments, forces, planing, and wind shadow.

- **Apparent wind:** the breeze felt by the moving boat, after subtracting its velocity from true wind.
- **Angle of attack:** the angle between a sail and the incoming airflow.
- **Luffing:** an underfilled sail fluttering with little drive. **Stall:** separated airflow from excessive sail angle, which reduces useful lift; a downwind sail also works through pressure drag.
- **Leeway:** sideways drift through the water. **VMG:** the part of boat speed directed upwind; negative means downwind.
- **Righting moment:** the turning force that restores the boat upright. **Wind shadow:** reduced wind downwind of another boat.

The editable numbers are in [src/config/boat.ts](src/config/boat.ts) and [src/config/environment.ts](src/config/environment.ts), with sailing explanations and units. Race geometry and AI steering choices are in [src/game/config.ts](src/game/config.ts). Change one setting at a time, sail comparable conditions, and inspect F3. Ask Codex to adjust these if you prefer not to edit files.

The model is calibrated to approximately 4.34 knots upwind in steady 10-knot wind, and 10.01 knots on a beam reach in 15-knot wind. These are repeatable simulated targets, not measured C420 certification. Planing, roll tacks, spinnaker, crew motion, and disturbed air use documented approximations. Waves drive visible buoyancy and clearance, while the original sailing forces remain a reduced horizontal/heel model; race-rule decisions are simplified. See [physics notes](docs/PHYSICS.md) for assumptions, sources, and calibration.

## Development and publishing

[Setup notes](docs/SETUP.md) explain local installation, tests, and GitHub Pages. The project uses pinned TypeScript, Vite, Three.js, lil-gui, and Vitest versions, with no general-purpose physics engine. A custom three-band toon pipeline renders the seeded terrain, dynamic wave mesh, outlined models, and daylight. All audio is generated with Web Audio; there are no external asset or audio services at runtime.

Read [PROGRESS.md](PROGRESS.md) for verification and remaining acceptance/publication steps, and [SPEC.md](SPEC.md) for the unchanged original request. The later instruction to complete all phases together supersedes its intermediate stopping points. Optional phone controls and the alternative digital-N course remain outside this delivery.
