# Sailing motion and crew refinement

Baseline: `1dba8dd`. Preserve the miniature NPR art direction, core sail/foil/hull coefficient model, race rules, lessons, and local launch workflow.

## Evidence and scope

The initial read-only probes found a 0.657 m single-frame crew-head jump, a boom that can change sides by about 150 degrees in one physics tick, automatic-to-manual control discontinuity, wind shifts counted as tacks without meaningful steering, non-interpolated 120 Hz poses, per-frame sail-outline allocation, and nonconforming near/far water edges. These defects define this upgrade. No commercial-game assets or new runtime dependencies are needed. Blender is not installed; original procedural geometry remains the model source.

## Implementation and verification

1. **Physical maneuvers and control handoff.** Reproduce the control discontinuity and false maneuvers in deterministic tests. Keep aerodynamic/hydrodynamic coefficients, add continuous actual rig motion, distinguish heading-driven crossings from wind shifts, and make roll coordination work with either crew mode. Verify force/telemetry agreement, tack/gybe behavior, and existing race/tutorial regressions.
2. **Stable visual interpolation.** Keep previous/current fixed-step snapshots and a persistent display state per boat. Interpolate position, shortest-path angles, rig, crew, and simulation time without writing back into physics. Test 90/144 Hz motion, angle wrapping, pause/reset boundaries, object identity, and source immutability.
3. **Articulated crew and rig.** Replace discontinuous emergency poses and stretching torsos with continuous clearance-aware poses and fixed-length articulation. Connect hands to steering and sheet tasks. Add pressure-dependent draft/twist and selective original cockpit hardware. Test temporal continuity, bone lengths, actual mesh clearance, and wind response; inspect close-up sailing in the browser.
4. **Renderer stability.** Reuse dynamic outline buffers, skip frozen work, stop frozen-time foam emission, and make water boundaries conform. Verify outline continuity, shared edge heights, pause behavior, and compare CPU timings using the same probe. CPU timings are not presented as browser FPS.
5. **Readable sailing feedback.** Expose apparent wind angle, upwind VMG, and actual helm deflection while preserving the existing HUD design and key controls. Verify readability and no overlap at desktop/narrow viewports.
6. **Integration.** Independent source review, full test suite, production build, then browser checks of free sail, tacks/gybes, crew-mode transition, pause, camera, and fleet start. Update project documentation and the existing PR branch, keeping local preview available. Do not merge without a separate instruction.

## Completion boundary

Deliver the tested improvements and concrete evidence. Commercial-game parity, physical calibration against an instrumented C420, exhaustive zero-clipping proof, and the user's acceptance of sailing feel are not established by unit tests or a visual smoke check.
