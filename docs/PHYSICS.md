# Sailing force model

This is an editable, physically based sailing model, calibrated for a plausible C420 free sail. It is not a measured C420 velocity-prediction program. All dimensions, coefficients and tuning values are in `src/config/boat.ts` and `src/config/environment.ts`.

## Coordinates and units

Positions and velocities use metres and metres per second. World x points east, z points south, and rendering y points up. Heading increases clockwise from north. Wind direction says where the wind comes **from**; the wind velocity vector points downwind. One knot is 0.514444 metres per second.

Positive steering turns the bow to starboard while moving forward. Positive sail angle puts the boom/foot to starboard of the aft centreline. Positive leeway means the boat is slipping to starboard. VMG, or velocity made good, is the part of boat velocity directed upwind; it is negative when moving downwind.

Positive heel lowers the starboard gunwale. Crew X positions are metres to starboard; fore/aft crew movement is metres aft. The centerboard setting is zero when raised and one when fully down. Planing is a continuous value from zero to one, describing how far the hull has transitioned from displacement sailing to dynamic support.

## What produces motion

1. The wind field combines slow oscillating shifts with a deterministic pattern of moving puffs and lulls. The pattern travels downwind at the mean wind speed. The renderer samples this same field for darker water patches. Shifts are limited to ±7° and puff speed changes to ±22% by default.
2. Apparent wind is exactly true wind velocity minus boat velocity. Both sails use this local airflow.
3. Sail lift and drag use `force = 0.5 × air density × apparent speed² × sail area × coefficient`. Lift acts perpendicular to apparent airflow and drag acts along it. They are projected onto forward and sideways boat directions for the debug readout.
4. The mainsheet sets the target limit for boom travel; an eased sheet lets the boom align with airflow. Actual main and jib angles advance with bounded angular speed and acceleration, and aerodynamic incidence uses these actual angles, including temporarily backed sails during crossings. The automatic jib crew adjusts its foot angle toward a configured effective angle of attack. An effective twist offset represents upper sail sections being more eased than the foot; it tapers toward fully reversed parallel flow so wrapping through ±180° cannot cause a force jump. Low angles of attack luff, attached flow develops lift, and excess angle transitions to less lift and more pressure drag. A stalled sail can still drive the boat downwind by pressure drag.
5. Centerboard and rudder lift depend on water speed squared and leeway. Their lift is perpendicular to water-relative motion; profile and induced drag remove energy. Sideways hull drag limits drift when the foils have little useful forward flow.
6. Fore-and-aft hull resistance combines quadratic skin/form drag with an eighth-power wave-making term around the conventional displacement hull speed. This resists further acceleration; it does not impose a hard speed limit.
7. The sum of these forces accelerates the boat's mass plus an added-water mass. Rudder force produces a turning moment, with rotational inertia and water damping. Its local water velocity includes the stern moving sideways during a turn; after the tiller centres, this creates a restoring force and arrests the turn. There is no steering authority at rest, and the rudder reverses its effect when backing.
8. Side force times sail-effort height produces the heeling moment. Crew mass, lateral lever arm and gravity produce crew righting moment; hull form stability adds restoring moment. Their difference drives roll acceleration with inertia and damping. Heel reduces effective sail force and changes hull resistance. Heel also introduces weather helm, so the helmsman must hold course rather than expect a released tiller to keep the heading forever.
9. The automatic crew moves gradually toward the windward side, using available leverage to balance sail pressure. In light air it moves slightly leeward; on broad reaches/runs it moves aft. These actual positions change righting moment and hull drag. Manual mode accepts jib-sheet and signed lateral-hiking inputs. A config-only trapeze option adds crew leverage.
10. Planing support grows with speed relative to the square root of gravity times waterline length, also called the Froude number. Reaching trim, heel and fore/aft weight affect the transition. Wave-making and wetted-area drag fall, while dynamic-support and spray drag remain. This permits higher speeds without removing resistance or introducing a target-speed table.
11. If heel exceeds the stability threshold, the boat capsizes: the sails stop driving and water drag slows it. Manual recovery requires the main eased, the board sufficiently down, and sustained righting input. Difficulty-level automatic assistance sends these same control inputs; it does not change the physics.
12. Tacks and gybes require a meaningful hull turn and an exit through a wind-angle deadband; oscillating wind alone does not count. Space requests an old-side roll followed by new-side flattening through the existing crew lever and righting-moment equations, in both automatic and manual crew modes. There is no separate forward-energy reward. A loose-sheet gybe adds a breeze-dependent rolling impulse when the actual boom crosses the centerline. Optional spinnaker pressure force applies on broad reaches and runs. Other boats cast bounded downwind wind-speed deficits using the same apparent-wind calculation as the clear-air boat.

Integration uses small semi-implicit steps: first velocity changes from force, then position changes from velocity. The default step is 1/120 second. No polar table, target-speed interpolation or wind-angle speed multiplier drives the boat.

## Deliberate approximations

- Roll, crew movement, capsize recovery and planing are reduced physical models. They are not a full six-degree-of-freedom hull solver. A shared four-point wave surface sets rendered heave, pitch and extra roll and is included in grounding clearance; it does not apply individual wave-impact forces to the sailing integrator.
- The main and jib are two lumped airfoils. Effective spanwise twist and the coefficient curves are tunable approximations, not measured C420 sail-section data. There is no sail cloth solver or explicit jib-main slot interaction. Debug sail angle of attack is this effective airflow angle, rather than simply the boom angle subtracted from apparent wind.
- The upright rig is assumed balanced in yaw: neutral-rudder leeway forces are offset by the rig/board balance. Turning moment combines local rudder flow, hull damping and an empirical heel-dependent weather-helm lever. Detailed changing centers of pressure are not resolved.
- Raising the centerboard reduces its effective area continuously. Foil lift uses a bounded sinusoidal coefficient and a simple induced-drag curve. The model does not calculate ventilation or free-surface effects.
- Automatic hiking responds to calculated sail pressure, with delayed movement and finite leverage. The two sailors currently have the same lateral target; their separate weights and actual movement positions feed the combined righting moment.
- Roll-tack timing and crew lever targets are reduced models: a brief old-side hold, a bounded flatten phase, a minimum forward speed, and a recovery interval. The old direct forward-work bonus has been removed. A roll changes heel and drag through the normal force model; this is not a full unsteady roll-propulsion solver and does not guarantee a faster tack. Gybing impulse represents boom and sheet load rather than a cloth-and-rig impact solver.
- Capsize recovery models the required control sequence and continuous righting effort. It does not simulate swimming, turtling, ropes or sailors separately climbing onto the board.
- The optional spinnaker uses a pressure-drag approximation. It does not yet resolve spinnaker-specific lift on a tight reach. Wind shadows use an empirical widening downwind plume, not computational fluid dynamics.
- Wind gust bands move along the selected mean wind direction while the wind direction oscillates. Local wind, including wind shadows, controls wave amplitude. Wave phase follows wavelength-based dispersion so a changing gust cannot cause a discontinuous phase jump.
- The no-go region is gradual. Around 30° the boat stalls or drifts backward; at 35° it can creep upwind inefficiently. The strongest measured close-hauled performance is around 45°. There is no artificial 40° cutoff.
- On a run, the sail status may correctly report separated/stalled airflow even when pressure drag is providing useful propulsion; easing improves the available projected area. Trim hints and result tips avoid calling this normal downwind pressure flow an overtrimmed reaching sail.

## Terrain, waves and solid contacts

The original NPR overhaul retained the sailing force model. The subsequent motion refinement preserves the core lift/drag, foil, hull and roll equations and read-only `getTelemetry`, while using continuous actual sail angles, coordinated crew movement, and validated maneuver crossings. Collision corrections run after each 1/120-second force substep and after the fleet advances together.

- `src/world/terrain.ts` is the shared seeded four-octave height field. Warped island footprints create bays and reefs; the current course and occupied reset locations reserve deep water. Rendered terrain samples this field before splitting triangles for flat normals.
- Grounding probes the hull envelope, lowered centerboard and rudder with the same four-point wave pose used by the boat renderer. Sweeps include translation and turning. A terrain-gradient correction pushes the hull toward deeper water, removes inward velocity and applies tangential friction. A conservative mesh-clearance allowance covers interpolation between terrain vertices.
- Boat/boat and committee contacts use oriented boxes and separating-axis minimum translations. Marks use 0.75 m circles. Swept intermediate poses prevent a fast boat from jumping through a narrow obstacle. Contact impulses exchange linear and angular momentum with low restitution and friction; repeated terrain/solid projection resolves combined contacts.
- Right-of-way is judged from the encounter before separation. Actual mark and committee contacts produce the existing sailed-turn penalty during a race. Repeated resting contact does not accumulate a penalty every frame.
- AI uses the same helm, sheet and board inputs as the player. When backed into the no-go zone, it eases fully to back across the wind, then sheets in on the new tack and reverses the tiller as forward flow returns. No AI-only thrust or position teleport is used.

The collision envelopes are deliberately conservative rather than exact curved hull meshes. This avoids visible penetration at the cost of a small gap around curved bows. These are rigid contact and shallow-water models, not structural damage, six-axis buoyancy or fluid simulation.

## Earlier steady-state calibration

These are the pre-refinement model results, not observations from a real C420. The current regression suite retains its speed and VMG bounds; these individual values have not all been remeasured for the continuous-rig revision. Conditions: steady northerly, 130 kg crew, automatic crew, no spinnaker, zero initial velocity, 150 seconds of integration and a simple helmsman controller holding the requested heading against weather helm. Gusts/shifts are disabled. The board is fully down upwind and 60% down on reaches. Mainsheet was swept over representative trim settings.

| Wind (knots) | Heading to wind | Speed (knots) | Heel | Mainsheet |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 45° | 4.34 | 3.0° | 100% |
| 10 | 90° | 5.36 | 3.0° | 65% |
| 10 | 120° | 4.73 | 3.0° | 30% |
| 15 | 90° | 10.01 | 3.1° | 70% |
| 15 | 120° | 7.98 | 3.0° | 30% |
| 18 | 120° | 9.72 | 3.0° | 30% |
| 20 | 120° | 10.88 | 3.0° | 30% |
| 20 | 90° | 12.58 | 15.8° | 75% |

The upper reaching speeds are sensitive to empirical planing drag and need sailor feedback. At 10 knots, a 35° heading produced 2.01 knots boat speed and 1.58 knots upwind VMG; 30° stalled and drifted backward. The 45° calibration produced 2.90 knots upwind VMG. On a run, fixed upper-sail twist can favor a slightly sheeted-in boom over fully eased trim; this remains a calibration limitation.

The automated suite checks the original force/trim/steering/energy invariants plus board leeway, manual jib, crew righting, capsize, required recovery inputs, planing speeds, optimized-trim upper-speed bounds, coordinated roll/flatten behavior, continuous gybes and synchronized roll impulse, spinnaker force and wind-shadow direction. Existing course/speed regressions now hold their course against real weather helm; their original assumption of an upright boat holding heading with a centred tiller is obsolete. Run `pnpm test`.

## References and limits

The airfoil force form follows NASA's [lift equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/). The lift-squared induced-drag form follows NASA's [induced drag explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/). The loss of attached flow and rise in drag at excessive angle of attack follow NASA's [inclination and stall explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/inclination-effects-on-drag/). These sources support the physics relationships, not the simulator's chosen C420 coefficients or speed calibration. Hull/sail dimensions and the conventional hull-speed relationship were supplied in SPEC.md.

The motion/rig reference pass also used original manufacturer material: [Zim C420 parts guide](https://zimsailing.com/content/parts-guide-zim-c420.pdf), [Zim roll-tacking guidance](https://zimsailing.blogspot.com/2013/04/dos-and-donts-for-roll-tacking-420s-and.html), and the [North Sails C420 tuning guide hosted by the class association](https://club420.org/assets/documents/other_docs/North_Sails_Tuning_Guide.pdf). These inform geometry and action sequences, not numerical calibration claims.
