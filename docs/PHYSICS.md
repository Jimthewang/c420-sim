# Phase 1 force model

This is an editable, physically based sailing model, calibrated for a plausible C420 free sail. It is not a measured C420 velocity-prediction program. All dimensions, coefficients and tuning values are in `src/config/boat.ts` and `src/config/environment.ts`.

## Coordinates and units

Positions and velocities use metres and metres per second. World x points east, z points south, and rendering y points up. Heading increases clockwise from north. Wind direction says where the wind comes **from**; the wind velocity vector points downwind. One knot is 0.514444 metres per second.

Positive steering turns the bow to starboard while moving forward. Positive sail angle puts the boom/foot to starboard of the aft centreline. Positive leeway means the boat is slipping to starboard. VMG, or velocity made good, is the part of boat velocity directed upwind; it is negative when moving downwind.

## What produces motion

1. The wind field combines slow oscillating shifts with a deterministic pattern of moving puffs and lulls. The pattern travels downwind at the mean wind speed. The renderer samples this same field for darker water patches. Shifts are limited to ±7° and puff speed changes to ±22% by default.
2. Apparent wind is exactly true wind velocity minus boat velocity. Both sails use this local airflow.
3. Sail lift and drag use `force = 0.5 × air density × apparent speed² × sail area × coefficient`. Lift acts perpendicular to apparent airflow and drag acts along it. They are projected onto forward and sideways boat directions for the debug readout.
4. The mainsheet limits boom travel; an eased sheet lets the boom align with airflow. The automatic jib crew adjusts its foot angle toward a configured effective angle of attack. An effective twist offset represents upper sail sections being more eased than the foot. Low angles of attack luff, attached flow develops lift, and excess angle transitions to less lift and more pressure drag. A stalled sail can still drive the boat downwind by pressure drag.
5. Centerboard and rudder lift depend on water speed squared and leeway. Their lift is perpendicular to water-relative motion; profile and induced drag remove energy. Sideways hull drag limits drift when the foils have little useful forward flow.
6. Fore-and-aft hull resistance combines quadratic skin/form drag with an eighth-power wave-making term around the conventional displacement hull speed. This resists further acceleration; it does not impose a hard speed limit.
7. The sum of these forces accelerates the boat's mass plus an added-water mass. Rudder force produces a turning moment, with rotational inertia and water damping. Its local water velocity includes the stern moving sideways during a turn; after the tiller centres, this creates a restoring force and arrests the turn. There is no steering authority at rest, and the rudder reverses its effect when backing.

Integration uses small semi-implicit steps: first velocity changes from force, then position changes from velocity. The default step is 1/120 second. No polar table, target-speed interpolation or wind-angle speed multiplier drives the boat.

## Deliberate Phase 1 approximations

- The hull stays upright. There is no heel, capsize, crew righting moment, trapeze, planing, adjustable board, or wave-impact force yet. Reserved spinnaker/trapeze config fields do not enable those later systems.
- The main and jib are two lumped airfoils. Effective spanwise twist and the coefficient curves are tunable approximations, not measured C420 sail-section data. There is no sail cloth solver or explicit jib-main slot interaction. Debug sail angle of attack is this effective airflow angle, rather than simply the boom angle subtracted from apparent wind.
- The upright rig is assumed balanced in yaw: neutral-rudder leeway forces are offset by the rig/board balance. The turning moment comes from the change in rudder force when deflected plus hull damping. Heel-induced weather helm and detailed centers of pressure belong to Phase 2.
- The centerboard is fixed fully down. Foil lift uses a bounded sinusoidal coefficient and a simple induced-drag curve. The model does not calculate ventilation or free-surface effects.
- Wind gust bands move along the selected mean wind direction while the wind direction oscillates. Waves are visual; their appearance responds to wind speed.
- The no-go region is gradual. At 30° the boat makes essentially no windward progress; at 35° it can creep upwind inefficiently. The strongest measured VMG is near 45°. There is no artificial 40° cutoff.
- On a run, the sail status may correctly report separated/stalled airflow even when pressure drag is providing useful propulsion; easing improves the available projected area. A later coaching system can distinguish a stalled reaching sail from normal downwind pressure sailing.

## Calibration check

These are model results, not observations from a real C420. Conditions: 10-knot steady northerly, 130 kg crew, zero initial velocity, fixed heading, 180 seconds of integration, gusts/shifts disabled. Mainsheet was swept in 5% increments, selecting the greatest upwind VMG for headings below 90° and greatest speed on reaches/runs. Negative VMG means drifting or sailing away from the wind.

| Heading relative to wind | Speed (knots) | Upwind VMG (knots) | Mainsheet |
| --- | ---: | ---: | ---: |
| 0° | 1.22 backward | −1.22 | All settings luff |
| 20° | 1.19 backward | −1.12 | All settings luff |
| 30° | 0.33, mostly sideways | 0.02 | 100% |
| 35° | 2.00 | 1.57 | 100% |
| 40° | 3.31 | 2.43 | 100% |
| 45° | 4.29 | 2.85 | 100% |
| 50° | 4.68 | 2.78 | 100% |
| 60° | 4.91 | 2.23 | 90% |
| 90° | 4.96 | −0.12 | 65% |
| 120° | 4.72 | −2.38 | 25% |
| 180° | 3.91 | −3.91 | 15% |

The slightly eased sheet on a dead run reflects the model's fixed effective upper-sail twist. The sailor's feedback on how the boat feels is still needed before treating this calibration as accepted. Planing-speed targets are intentionally deferred to Phase 2.

Steering check: starting at 3.00 knots and heading 90°, hold starboard for two seconds, then release. The boat reaches 122.88° at release, 132.53° one second later, and settles near 132.94°. Turning rate falls from 23.41°/second at release to 1.46°/second after one second and 0.045°/second after two seconds. This response comes from local rudder water flow and damping, without snapping the heading to a target.

The automated suite checks wind direction/units, apparent wind subtraction, puff movement, luffing/stall, trim performance, slack-sheet boom alignment, mirrored tacks, head-to-wind behavior across five trim settings, poor progress at 30°, the pinching/footing tradeoff, close-hauled speed, no steerage at rest, reversed rudder effect in sternway, turn settling, translational and rotational energy dissipation, plausible speed bounds, and agreement at 60/120 Hz. Run `pnpm test`.

## References and limits

The airfoil force form follows NASA's [lift equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/). The lift-squared induced-drag form follows NASA's [induced drag explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/). The loss of attached flow and rise in drag at excessive angle of attack follow NASA's [inclination and stall explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/inclination-effects-on-drag/). These sources support the physics relationships, not the simulator's chosen C420 coefficients or speed calibration. Hull/sail dimensions and the conventional hull-speed relationship were supplied in SPEC.md.
