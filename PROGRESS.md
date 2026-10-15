# C420 simulator progress

## Phase 1 — built; review and public deployment pending

A playable local free-sailing C420 is built, with a daylight ocean, moving wind puffs, keyboard steering and mainsheet control, automatic jib trim, chase and overhead cameras, pause, reset, controls help, a physics readout, and wind/crew-weight settings. Apparent wind, sail lift and drag, hull resistance, and underwater foil forces determine the boat's motion. Apparent wind is the breeze felt on the moving boat.

The original request is saved in SPEC.md, and README.md explains how to play and tune the boat. Exact dependency versions and GitHub Actions checks are configured. The public build uses the required `/c420-sim/` address path.

### Checks completed

- All 22 automated physics tests passed, covering wind, sail trim, sailing too close to the wind, speed limits, steering, turning stability, energy behavior, and consistent motion at different update rates.
- The production build passed.
- GitHub's automated pull-request run passed the physics tests, TypeScript checks, and production build: [run 1](https://github.com/Jimthewang/c420-sim/actions/runs/38677302106).
- Chrome and Safari visual and keyboard checks were completed. The final Chrome check confirmed steering settles after releasing the key, mainsheet changes affect sailing feedback, and the production build renders without new console errors.
- In steady 10-knot wind, the boat reached 4.29 knots while heading 45° from the true wind with the main fully trimmed in.

### Limits and delivery status

The force model is an early approximation. Its sail and resistance values are tuned estimates, not measured C420 performance data. The speed check is a calibration point, not proof that every sailing condition is accurate; sailor feedback is still needed.

The boat is held upright and the centerboard is fixed down. Dynamic heel, capsizing, centerboard adjustment, planing, and refined tack/gybe behavior belong to Phase 2. Planing means the hull rises and skims over the water at higher speed. Moving sailors, racing, sound, opponents, and tutorials come in later phases. Unavailable heel and righting values are labeled as future work in the physics readout.

The public GitHub Pages game is not live yet. The local game runs at `http://127.0.0.1:4173/c420-sim/`; double-click `Play C420.command` in this folder to start it again on this Mac.

The game, deployment files, playing guide and local launcher are included in GitHub branch `phase-1-core`. Phase 1 is delivered as [pull request #1](https://github.com/Jimthewang/c420-sim/pull/1)—a reviewable proposal to change the repository. Publishing requires that request to be approved and merged into `main`, followed by a successful Pages deployment. Pages must be configured to use GitHub Actions. No direct push to `main` or automatic merge is planned. Local checks do not count as user acceptance or confirmed public deployment.

### Next

Collect feedback on the local game. After approval, configure Pages, merge, and verify the public game. Begin Phase 2 only after feedback on Phase 1.
