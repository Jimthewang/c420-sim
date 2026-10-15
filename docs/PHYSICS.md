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
4. The mainsheet limits boom travel; an eased sheet lets the boom align with airflow. The automatic jib crew adjusts its foot angle toward a configured effective angle of attack. An effective twist offset represents upper sail sections being more eased than the foot. Low angles of attack luff, attached flow develops lift, and excess angle transitions to less lift and more pressure drag. A stalled sail can still drive the boat downwind by pressure drag.
5. Centerboard and rudder lift depend on water speed squared and leeway. Their lift is perpendicular to water-relative motion; profile and induced drag remove energy. Sideways hull drag limits drift when the foils have little useful forward flow.
6. Fore-and-aft hull resistance combines quadratic skin/form drag with an eighth-power wave-making term around the conventional displacement hull speed. This resists further acceleration; it does not impose a hard speed limit.
7. The sum of these forces accelerates the boat's mass plus an added-water mass. Rudder force produces a turning moment, with rotational inertia and water damping. Its local water velocity includes the stern moving sideways during a turn; after the tiller centres, this creates a restoring force and arrests the turn. There is no steering authority at rest, and the rudder reverses its effect when backing.
8. Side force times sail-effort height produces the heeling moment. Crew mass, lateral lever arm and gravity produce crew righting moment; hull form stability adds restoring moment. Their difference drives roll acceleration with inertia and damping. Heel reduces effective sail force and changes hull resistance. Heel also introduces weather helm, so the helmsman must hold course rather than expect a released tiller to keep the heading forever.
9. The automatic crew moves gradually toward the windward side, using available leverage to balance sail pressure. In light air it moves slightly leeward; on broad reaches/runs it moves aft. These actual positions change righting moment and hull drag. Manual mode accepts jib-sheet and signed lateral-hiking inputs. A config-only trapeze option adds crew leverage.
10. Planing support grows with speed relative to the square root of gravity times waterline length, also called the Froude number. Reaching trim, heel and fore/aft weight affect the transition. Wave-making and wetted-area drag fall, while dynamic-support and spray drag remain. This permits higher speeds without removing resistance or introducing a target-speed table.
11. If heel exceeds the stability threshold, the boat capsizes: the sails stop driving and water drag slows it. Manual recovery requires the main eased, the board sufficiently down, and sustained righting input. Difficulty-level automatic assistance sends these same control inputs; it does not change the physics.
12. Real wind-side crossings count tacks or gybes. A timely roll tack can transfer a small, capped amount of crew work into forward motion during its exit. A loose-sheet gybe adds a breeze-dependent rolling impulse. Optional spinnaker pressure force applies on broad reaches and runs. Other boats cast bounded downwind wind-speed deficits using the same apparent-wind calculation as the clear-air boat.

Integration uses small semi-implicit steps: first velocity changes from force, then position changes from velocity. The default step is 1/120 second. No polar table, target-speed interpolation or wind-angle speed multiplier drives the boat.

## Deliberate approximations

- Roll, crew movement, capsize recovery and planing are reduced physical models. They are not a full six-degree-of-freedom hull solver. Waves are visual rather than individual impacts on the hull.
- The main and jib are two lumped airfoils. Effective spanwise twist and the coefficient curves are tunable approximations, not measured C420 sail-section data. There is no sail cloth solver or explicit jib-main slot interaction. Debug sail angle of attack is this effective airflow angle, rather than simply the boom angle subtracted from apparent wind.
- The upright rig is assumed balanced in yaw: neutral-rudder leeway forces are offset by the rig/board balance. Turning moment combines local rudder flow, hull damping and an empirical heel-dependent weather-helm lever. Detailed changing centers of pressure are not resolved.
- Raising the centerboard reduces its effective area continuously. Foil lift uses a bounded sinusoidal coefficient and a simple induced-drag curve. The model does not calculate ventilation or free-surface effects.
- Automatic hiking responds to calculated sail pressure, with delayed movement and finite leverage. The two sailors currently have the same lateral target; their separate weights and actual movement positions feed the combined righting moment.
- Roll-tack propulsion is a bounded crew-work approximation, capped by `crew mass × gravity × body-height change × efficiency`, delivered only in a brief tack-exit window and with a minimum interval between useful rolls. It is not unlimited speed from pressing a key. Gybing impulse represents boom and sheet load rather than a cloth-and-rig impact solver.
- Capsize recovery models the required control sequence and continuous righting effort. It does not simulate swimming, turtling, ropes or sailors separately climbing onto the board.
- The optional spinnaker uses a pressure-drag approximation. It does not yet resolve spinnaker-specific lift on a tight reach. Wind shadows use an empirical widening downwind plume, not computational fluid dynamics.
- Wind gust bands move along the selected mean wind direction while the wind direction oscillates. Waves are visual; their appearance responds to wind speed.
- The no-go region is gradual. Around 30° the boat stalls or drifts backward; at 35° it can creep upwind inefficiently. The strongest measured close-hauled performance is around 45°. There is no artificial 40° cutoff.
- On a run, the sail status may correctly report separated/stalled airflow even when pressure drag is providing useful propulsion; easing improves the available projected area. Trim hints and result tips avoid calling this normal downwind pressure flow an overtrimmed reaching sail.

## Calibration check

These are model results, not observations from a real C420. Conditions: steady northerly, 130 kg crew, automatic crew, no spinnaker, zero initial velocity, 150 seconds of integration and a simple helmsman controller holding the requested heading against weather helm. Gusts/shifts are disabled. The board is fully down upwind and 60% down on reaches. Mainsheet was swept over representative trim settings.

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

The automated suite checks the original force/trim/steering/energy invariants plus board leeway, manual jib, crew righting, capsize, required recovery inputs, planing speeds, optimized-trim upper-speed bounds, bounded roll-tack benefit, gybe impulse, spinnaker force and wind-shadow direction. Existing course/speed regressions now hold their course against real weather helm; their original assumption of an upright boat holding heading with a centred tiller is obsolete. Run `pnpm test`.

## References and limits

The airfoil force form follows NASA's [lift equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/). The lift-squared induced-drag form follows NASA's [induced drag explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/). The loss of attached flow and rise in drag at excessive angle of attack follow NASA's [inclination and stall explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/inclination-effects-on-drag/). These sources support the physics relationships, not the simulator's chosen C420 coefficients or speed calibration. Hull/sail dimensions and the conventional hull-speed relationship were supplied in SPEC.md.
