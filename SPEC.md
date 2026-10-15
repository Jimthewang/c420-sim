You are building a realistic college sailing simulator in the browser. I am a college sailor (sailing club president) with no coding experience. Realism, playability, and clear communication with me are equally important.

# Repository, tools, and plugins
- Repository: https://github.com/Jimthewang/c420-sim (connected through the GitHub plugin). Work only in this repository.
- On your first task, save this entire prompt into the repo as SPEC.md. In every future session, read SPEC.md and PROGRESS.md before doing anything.
- Deliver each phase as ONE pull request with a clear title (e.g., "Phase 1: core physics and deployment"). Never push directly to main.
- Stack (use stable, well-established versions and pin exact versions in package.json):
  - Vite as the build tool
  - TypeScript for all code
  - three (Three.js) for 3D rendering, including its official water/sky examples as a starting point for the ocean
  - lil-gui for the settings and tuning panel
  - Web Audio API for all sound (synthesized, no audio files)
  - Vitest for automated physics tests
- Do NOT use a general-purpose physics engine (cannon-es, Rapier, Ammo, etc.). They do not model sails, foils, or hiking. Write a custom sailing physics module so every force is visible and tunable.
- Hosting: GitHub Pages deployed by GitHub Actions, using the official actions (actions/configure-pages, actions/upload-pages-artifact, actions/deploy-pages), triggered on every push to main.
- IMPORTANT: set Vite's base path to "/c420-sim/" so assets load correctly on GitHub Pages.
- The live game will be at https://jimthewang.github.io/c420-sim/

# How to work with me
- I have no coding experience. Never assume I can read or debug code.
- After each phase, give me a short report in this order:
  1. What you built, in plain English (no code)
  2. Why you made any important design choices
  3. Numbered steps to test it on the live site: what to click, what keys to press, and what I should see if it is working correctly
  4. Any decision you need from me, one question at a time
- Define any technical term the first time you use it, in one sentence.
- Be direct and concise. No filler, no repeated warnings.
- If something I ask for is unrealistic or conflicts with real sailing physics, tell me plainly and propose the closest realistic option.
- Maintain PROGRESS.md: a running log of what each phase completed, known issues, and what comes next, written so a non-programmer can follow it.
- Replace the existing README.md with one that explains in plain English how to play, how to change settings, and how to tune physics values in the config files.

# Goal
A 3D browser game simulating a Club 420 (C420) in college-style fleet racing (ICSA format: two-person crew, short courses, 3-minute starting sequence). Boat behavior must come from real sailing physics and theory, not scripted animations. It must also be a real, playable game that a non-sailor can learn and a college sailor finds authentic.

# Playability (this must be a game, not just a simulation)
- Every phase must end with something playable on the live site: open the link, press a key, and sail.
- Game flow: title screen → race setup (wind speed, number of AI boats, difficulty, course) → pre-start (boat placed near the line, free to sail before the sequence begins) → 3-minute sequence → race → finish → results screen (finish place, time, OCS/penalties) → "Race again" or "Back to menu". Esc pauses; R restarts the race.
- Difficulty levels change assists only, never the physics:
  - Beginner: trim indicator showing "too tight / too loose" for each sail, laylines and course arrows shown, quick auto-righting after a capsize
  - Intermediate: laylines only
  - Realistic: no assists, full capsize-and-righting procedure
- Tutorial mode: short interactive lessons, each with a clear goal and a pass check: (1) steer and trim on a reach, (2) find the no-go zone and sail upwind, (3) tack, (4) gybe, (5) round a mark, (6) practice start. Explain in sailing language a beginner can follow.
- Practice modes: free sail, start practice (repeat sequences back to back), and time trial around the course.
- Scoring: finish place against AI boats; a series mode with college-style low-point scoring (1st = 1 point, 2nd = 2, etc.) across multiple races. Save personal bests in the browser with localStorage.
- Clear feedback: short on-screen messages for luffing, stalled, OCS, wrong side of mark, and penalties, plus 2–3 tips on the results screen (e.g., "you pinched on the first beat").
- A controls help overlay (H key) listing all keys.
- Desktop keyboard is the priority. Touch controls for phones are optional, after Phase 7.

# Config files
Put ALL physical constants and tuning values in src/config/boat.ts and src/config/environment.ts, with a plain-English comment on every value explaining what it means in sailing terms. Expose the most important ones (wind speed, crew weight, spinnaker on/off) in the lil-gui panel.

# C420 specifications (approximate; keep editable in config)
- LOA ~4.20 m, beam ~1.63 m, hull weight ~105 kg
- Mainsail + jib ~10.3 m² total (main ~7.5 m², jib ~2.8 m²); spinnaker ~9 m² (OFF by default, since college C420s are usually sailed without one)
- Two crew, combined weight ~130 kg (default), adjustable
- Centerboard (adjustable up/down) and a kick-up rudder
- No trapeze by default (toggle in config)

# Physics model (must be physically grounded)
- Wind: true wind with realistic oscillating shifts (±5–10°) and puffs/lulls that move downwind and are visible as darker patches on the water. Adjustable wind speed (4–20 knots).
- Apparent wind = true wind minus boat velocity vector. All sail forces use apparent wind.
- Sails as airfoils: lift and drag coefficients as functions of angle of attack. Undertrimmed = luffing (loss of drive, visual flapping, sound). Overtrimmed = stall (drag rises, drive drops). Jib-main slot effect may be approximated.
- Sail force splits into drive and side force relative to the boat's heading.
- Centerboard and rudder as hydrofoils producing lift from leeway angle; leeway increases if the board is raised or speed is low.
- Hull drag: friction drag plus wave-making drag that rises steeply near hull speed (~1.34 × √LWL in feet, in knots); a planing transition on reaches/runs in sufficient breeze that reduces drag and allows speeds well above hull speed.
- Heel: heeling moment = side force × center-of-effort height. Righting moment = crew weight × hiking lever arm + hull form stability. Heel reduces effective sail force and increases weather helm. If heeling moment overwhelms righting moment, the boat capsizes (with a righting procedure).
- No-go zone emerges naturally (no useful progress closer than roughly 40–45° to true wind). Pinching vs footing tradeoff must exist.
- Steering: rudder effectiveness scales with water flow; no steerage when stopped; weather helm when heeled.
- Tacking and gybing: boom crosses, boat loses speed through a tack; a well-timed roll tack exits faster than a flat tack. Uncontrolled gybes in strong wind can capsize the boat.
- Sanity targets (adjust in config): upwind ~4–5 kts in 10 kts of wind; planing 8–10+ kts on a reach in 15+ kts.

# Crew (2 people, behave like real C420 sailors)
- Skipper: sits aft on the windward side, holds tiller extension and mainsheet, hikes as needed.
- Crew: forward, trims the jib, manages centerboard, moves weight to keep the boat at optimal heel.
- Light air: crew sits to leeward/centered to induce slight leeward heel and reduce wetted area. Medium: both on windward rail. Heavy: both fully hiked, boat flat. Downwind: weight moves aft; boat sailed flat or with slight windward heel.
- Tacks and gybes: both cross the boat with correct timing; roll tacks in light/medium air.
- Weight position must feed back into the physics (heel, trim, drag), not just be animation.
- Player controls the skipper (steering + mainsheet). Crew is AI-controlled by default, with an option for the player to control jib and hiking manually.

# Racing
- Windward-leeward course with start/finish line (committee boat + pin), windward mark, and leeward gate. Course is set relative to the wind direction. Option for a college-style "digital N" course later.
- 3-minute starting sequence following college procedure: horns at 3:00, 2:00, 1:00, and start. Visible countdown timer. Optional beeps in the final 10 seconds (toggleable, labeled as a game aid).
- OCS detection: if over the line at the start, the boat is flagged and must return and restart.
- Mark rounding detection (correct side), finish detection, elapsed time.

# Controls and visual style
- Keyboard: steer (A/D or arrows), mainsheet trim (W/S), tack/gybe by steering through the wind (no auto-tack button), centerboard up/down, camera toggle, Esc to pause, R to restart, H for controls help.
- Cameras: chase cam behind the boat, and a top-down tactical view showing wind direction, laylines, and marks.
- Visual style: clean and realistic, not cartoonish. Natural daylight, believable water with waves that scale with wind speed, white sails with visible telltales that respond to airflow, orange inflatable racing marks, and a simple committee boat. Minimal on-screen interface: boat speed, heading, start timer, and wind indicator in a corner, with everything else in the toggleable debug overlay.
- Must run smoothly on an average laptop in Chrome and Safari.

# Sound (Web Audio, all synthesized)
- Wind volume and pitch tied to apparent wind speed.
- Water/hull noise tied to boat speed; distinct planing sound.
- Sail luffing flutter when luffing; boom/sheet sounds on tacks and gybes.
- Race committee horns for the start sequence.

# Debug/realism overlay (toggle with a key)
Show: true wind speed/direction, apparent wind speed/angle, sail angle of attack for main and jib, heel angle, leeway angle, boat speed, VMG upwind/downwind, heeling vs righting moment. I will use this to check realism.

# Build in phases. STOP after each phase, deliver it as a pull request, give me the report described above, and wait for my feedback.
1. Project setup, SPEC.md, PROGRESS.md, README.md, GitHub Pages deployment, 3D water, one C420 hull with sails, wind, core physics, steering and trim controls, debug overlay. Must be playable: open the link and sail freely.
2. Heel, capsize, centerboard, planing, tacking/gybing behavior; sanity-check speeds against the targets above.
3. Two animated crew with weight placement feeding the physics; roll tacks.
4. Course, marks, 3-minute starting sequence, OCS, rounding and finish detection, plus title screen, results screen, restart, and practice modes (free sail, start practice, time trial). This phase delivers the first complete race from start to finish.
5. Sound.
6. AI opponent boats, wind shadow/disturbed air behind other boats, basic right-of-way (port/starboard, windward/leeward), and penalties.
7. Polish: difficulty levels, tutorial mode, series scoring, saved personal bests, settings panel, performance tuning.

Write automated Vitest tests for the physics (e.g., boat cannot make progress head-to-wind; speeds stay within plausible ranges) so later changes don't break realism.

Start with Phase 1.
