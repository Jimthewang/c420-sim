export const BOAT_CONFIG = {
  lengthM: 4.2, // Overall Club 420 hull length from bow to transom.
  waterlineLengthM: 3.9, // Approximate immersed hull length used for wave-making resistance.
  beamM: 1.63, // Maximum hull width.
  hullDraftM: 0.25, // Conservative hull-bottom depth enclosing the visible shell for shore contact.
  hullRailHeightM: 0.6, // Upper hull and bow rail envelope, needed when a capsized shell lies against land.
  boardLengthM: 1.1, // Shared visible and colliding centerboard span below its root.
  boardTopY: -0.05, // Centerboard root relative to the boat model's waterline origin.
  boardAftM: 0.02, // Centerboard root position aft of the hull centre.
  boardMinExtension: 0.12, // Fraction of centerboard still exposed when fully raised.
  rudderLengthM: 0.8, // Shared visible and colliding rudder blade span.
  rudderTopY: 0.18, // Rudder blade root above the model's waterline origin.
  rudderAftOffsetM: 0.095, // Blade centre lies this far aft of the transom.
  foilChordClearanceM: 0.18, // Conservatively encloses both foils' chord and bevel at either end.
  hullMassKg: 105, // Hull and fitted gear weight before the two sailors are added.
  addedMassKg: 35, // Water accelerated along with the hull makes acceleration less immediate.
  mastHeightM: 6.26, // Approximate mast height for the visible rig.
  boomHeightM: 0.95, // Boom height above the water when the boat is upright.
  mainAreaM2: 7.5, // Mainsail working area.
  jibAreaM2: 2.8, // Jib working area.
  mainFootM: 2.45, // Approximate visible mainsail foot length.
  jibFootM: 1.6, // Approximate visible jib foot length.
  spinnakerAreaM2: 9, // Optional spinnaker working area; college racing normally leaves it off.
  spinnakerEnabled: false, // Default to the college main-and-jib rig.
  trapezeEnabled: false, // When enabled in config, the crew has additional righting leverage.
  initialHeadingDeg: 90, // Launch on an eastward beam reach in the default northerly breeze.
  initialMainSheet: 0.65, // Start with the main drawing on the default reach.
  mainSheetRatePerSecond: 0.3, // Holding trim/ease moves through the full sheet range in about 3.3 seconds.
  minMainAngleDeg: 8, // Tightest possible boom angle from the aft centreline.
  maxMainAngleDeg: 88, // Fully eased boom angle; sheeting cannot force it past square.
  minJibAngleDeg: 10, // Tightest jib lead angle used by the automatic crew.
  maxJibAngleDeg: 80, // Fully eased jib angle on a deep reach or run.
  mainMaxAngularSpeedDegPerSecond: 160, // The boom takes finite time to cross; this bounds its visible and aerodynamic motion.
  mainAngularAccelerationDegPerSecond2: 720, // Rig inertia limits how quickly the boom starts and brakes its swing.
  jibMaxAngularSpeedDegPerSecond: 220, // The lighter jib crosses faster than the boom without teleporting.
  jibAngularAccelerationDegPerSecond2: 1100, // Cloth and sheet take-up give the jib a finite acceleration.
  rigAngularResponsePerSecond: 8, // Critically damped angular response brakes the rig smoothly as it reaches its sheet limit.
  mainEffectiveTwistDeg: 14, // Upper mainsail sections are eased beyond the boom; a lumped spanwise twist approximation.
  jibEffectiveTwistDeg: 12, // Upper jib sections are eased beyond its foot; limits how high the rig can point.
  jibTargetAttackDeg: 10, // Automatic crew aims for attached flow near the useful lift peak.
  sailLuffAngleDeg: 6, // Below this effective angle of attack the flexible sail luffs and loses lift.
  sailPeakAngleDeg: 10, // Effective angle of attack giving the strongest attached sail lift.
  sailStallAngleDeg: 18, // Above this angle the feedback calls the sail overtrimmed/stalled.
  sailSeparatedAngleDeg: 32, // Flow is fully separated above this angle of attack.
  sailMaxLiftCoefficient: 1.28, // Peak lift coefficient of the combined finite-height sail model.
  sailProfileDragCoefficient: 0.055, // Cloth, mast and baseline sail drag even with attached flow.
  sailInducedDragFactor: 0.13, // Additional sail drag proportional to lift coefficient squared.
  sailSeparatedDragCoefficient: 1.3, // Broadside pressure drag; this still drives a boat downwind.
  sailSeparatedLiftCoefficient: 0.62, // Reduced lift from stalled sails, fading to zero when square to flow.
  sailLuffDragCoefficient: 0.055, // Small cloth drag remains while the sail flaps along the flow.
  wettedAreaM2: 3.8, // Approximate underwater hull surface creating friction.
  hullFrictionCoefficient: 0.0038, // Effective hull skin friction, calibrated for a clean dinghy hull.
  hullFormDragCoefficient: 0.0045, // Extra fore-and-aft drag from hull shape and appendage junctions.
  hullSideAreaM2: 0.65, // Immersed side area opposing sideways drift even with stalled foils.
  hullSideDragCoefficient: 0.95, // Cross-flow drag limits sideways slipping at low sailing speeds.
  hullSpeedCoefficient: 1.34, // Conventional displacement hull speed in knots per square root of waterline feet.
  metresToFeet: 3.28084, // Unit conversion needed by the conventional hull-speed estimate.
  waveDragForceN: 58, // Wave-making resistance at the conventional hull speed.
  waveDragExponent: 8, // Wave resistance grows steeply as displacement speed approaches hull speed.
  boardAreaM2: 0.32, // Effective immersed centerboard area when fully down.
  boardLiftSlope: 4.4, // Centerboard lift response to small leeway angles, per radian.
  boardMaxLiftCoefficient: 1.05, // Maximum board lift before its flow separates.
  boardProfileDragCoefficient: 0.008, // Board drag at zero leeway.
  boardInducedDragFactor: 0.085, // Board drag rises with the lift required to resist leeway.
  rudderAreaM2: 0.105, // Immersed rudder blade area.
  rudderLeverArmM: 1.7, // Distance from the turning centre to the rudder blade.
  rudderMaxAngleDeg: 28, // Largest rudder deflection; large turns cost speed.
  rudderLiftSlope: 4.1, // Rudder lift response to angle of attack, per radian.
  rudderMaxLiftCoefficient: 1.05, // Rudder lift limit before separation.
  rudderProfileDragCoefficient: 0.01, // Rudder drag when sailing straight.
  rudderInducedDragFactor: 0.11, // Rudder drag added when steering force increases.
  rudderResponseSeconds: 0.14, // Small tiller response time smooths abrupt keyboard input.
  yawAddedInertiaKgM2: 90, // Surrounding water resists the hull's rotational acceleration.
  yawDampingNmSeconds: 95, // Hull water resistance damps residual turning when the tiller centres.
  yawFlowDampingNmSecondsPerMps: 160, // More water flow produces more resistance to yaw.
  velocityEpsilonMps: 0.00001, // Treat essentially still water/air as zero flow to avoid dividing by zero.
  gravityMps2: 9.81, // Gravity produces the crew's righting moment and determines planing support.
  sailEffortHeightM: 2.15, // Height of the sail force above the hull's roll centre.
  hullRightingNm: 1050, // Hull form stability at moderate heel, before stability falls toward capsize.
  rollInertiaKgM2: 230, // Resistance of hull, rig, crew and surrounding water to rolling.
  rollDampingNmSeconds: 650, // Water resistance prevents unrealistic side-to-side rolling oscillations.
  capsizeAngleDeg: 72, // Beyond this heel the rig falls into the water and sailing stops.
  capsizedAngleDeg: 88, // Resting angle of a capsized boat with the sail on the water.
  capsizedDragKgPerSecond: 160, // A hull and sail lying in the water quickly slow the boat.
  rightingSeconds: 8, // Time continuously applying righting effort with a released sheet and board down.
  rightingMinBoard: 0.6, // Enough board must be exposed to give the sailors a righting lever.
  rightingMaxMainSheet: 0.3, // Ease the main before righting so it does not immediately power up.
  recoveredHeelDeg: 15, // The hull comes upright with a small remaining heel.
  crewMaxLeverM: 0.95, // Effective combined crew centre of mass when fully hiking.
  trapezeExtraLeverM: 0.45, // Additional crew leverage if the optional trapeze is enabled.
  skipperWeightShare: 0.52, // Skipper share of the combined crew weight.
  crewResponseSeconds: 0.42, // Crew takes time to cross or change hiking position.
  crewLightWindKnots: 6, // Below this breeze the crew induces a small leeward heel.
  crewLightHeelLeverM: 0.09, // Small leeward weight placement reduces wetted hull area in light air.
  crewAftShiftM: 0.4, // Both sailors move aft on a broad reach or run to free the bow.
  crewAftStartAngleDeg: 105, // Start moving weight aft as the boat bears onto a broad reach.
  crewTargetHeelDeg: 3, // Automatic hiking leaves a small comfortable leeward heel.
  heelDragFactor: 1.2, // Heeling increases hull resistance through an immersed and distorted waterline.
  lightHeelDragRelief: 0.08, // A small light-air heel slightly reduces wetted surface resistance.
  weatherHelmLeverM: 0.11, // Heel moves sail effort relative to the underwater foils and turns the bow into wind.
  boardMovePerSecond: 0.8, // Moving the board takes about 1.25 seconds through its full travel.
  boardControlRatePerSecond: 0.4, // Holding a board key changes the requested board depth over 2.5 seconds.
  hikeControlRatePerSecond: 1, // Holding a hiking key crosses the normalized lateral control range in two seconds.
  boardResidualAreaShare: 0.02, // A fully raised board retains a very small exposed root area.
  planingStartFroude: 0.4, // Dynamic lift starts freeing the hull around this speed-to-waterline ratio.
  planingFullFroude: 0.66, // The hull is substantially supported by dynamic lift at this ratio.
  planingMinAngleDeg: 55, // Close-hauled trim and side loading keep the hull in displacement mode.
  planingFullAngleDeg: 85, // Broad-reaching sail force allows the full planing transition.
  planingResponseSeconds: 1.2, // The hull gradually rises or settles instead of switching modes abruptly.
  planingWaveReliefExponent: 4, // As the hull rises its displacement wave-making penalty drops rapidly.
  planingFrictionRelief: 0.65, // Less hull is wetted once it is supported dynamically.
  planingHullTrimDragFactor: 0.2, // Moving weight aft reduces planing resistance and bow immersion.
  planingSupportDragRatio: 0.06, // Supporting displacement dynamically also creates drag equal to a fraction of boat weight.
  planingSprayDragKgPerM: 6, // Spray and bottom pressure add speed-squared resistance after the hull rises.
  spinnakerMinAngleDeg: 100, // The spinnaker fills only on a broad reach or run.
  spinnakerDragCoefficient: 1.35, // Pressure force of the filled spinnaker in following apparent wind.
  maneuverDeadbandDeg: 20, // A maneuver is recorded only after sailing clearly onto the other wind side.
  maneuverMinHeadingChangeDeg: 20, // Wind shifts alone cannot substitute for this actual hull turn.
  rollTackMinIntervalSeconds: 8, // Crew needs time to reset before another coordinated roll sequence.
  rollTackMaxWindKnots: 14, // Roll tacks are useful only before heavy-air hiking dominates handling.
  rollTackTriggerAngleDeg: 8, // A requested roll begins just after the bow crosses head to wind.
  rollTackMinSpeedMps: 0.6, // A stopped boat cannot start the coordinated roll-tack sequence.
  rollTackHoldSeconds: 0.4, // The sailors briefly remain on the old side after crossing the wind.
  rollTackFlattenSeconds: 0.85, // They then cross to the new windward side and flatten the hull.
  rollTackLeverShare: 0.55, // The coordinated action uses this fraction of the available crew lever.
  rollTackMaxHeelDeg: 18, // Begin flattening early once the intended roll angle is reached.
  gybeRollImpulse: 0.012, // Actual boom-centreline crossing adds roll rate per squared apparent-wind speed with loose sheets.
};
