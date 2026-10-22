# Phase 1 implementation plan

**Goal:** Deliver one reviewable pull request containing a playable free-sailing C420 and a verified GitHub Pages build.

**Architecture:** A pure TypeScript force model runs at a fixed time step. Three.js reads the resulting position, heading, and sail state. A small HTML interface handles controls, feedback, settings, and help. No general physics engine.

**Scope:** SPEC.md Phase 1. Original dimensions and future toggles stay editable in the two config files. No race logic or future systems are implemented early.

## Shared contract
- World uses metres: x east, z south, height y up. Heading is radians clockwise from north (north = -z). Wind direction is the compass direction wind comes FROM.
- `src/physics/types.ts` defines shared state/settings/telemetry.
- Physics API: `createBoatState()`, `stepBoat(state, controls, settings, dt)`, `sampleWind(x, z, time, settings)`, `getTelemetry(state, settings)`; all mutation is confined to `stepBoat`.
- Rendering API: `createWorld(canvas)` returns `resize()`, `render(state, telemetry, settings, cameraMode, dt)`, `dispose()`. Camera mode is `'chase' | 'tactical'`.
- Control `steer` is -1 port / +1 starboard; `mainSheet` is 0 fully eased / 1 fully sheeted. The jib trims automatically.

## Tasks and verification
1. Save SPEC.md and phase log; pin stable dependencies; configure Vite base and official Pages Actions. Verify dependency install and production build.
2. Write failing physics tests, implement wind/apparent-wind, sail lift/drag, hull/foil resistance, flow-dependent steering and fixed-step motion. Verify head-to-wind, trim response, bounded speeds, symmetry, zero-speed rudder, and timestep stability.
3. Build a recognizable C420 and procedural local water normals using official Three.js Water/Sky. Verify no external runtime assets, daylight appearance, sail motion and both cameras.
4. Connect keyboard input, launch, pause, reset, help, tuning and debug. Verify each action in the browser and prevent stuck keys after focus loss.
5. Run automated tests, type checking, production build, and browser smoke tests. Record actual results and limitations in PROGRESS.md. Review final diff and publish one PR; never push main.

## Delivery boundary
The user requested a PR review after each phase and main-only deployment. Prepare all changes and the local playable preview first. Do not claim the public Pages site is live until deployment is confirmed. Stop before Phase 2 and request phase feedback.
