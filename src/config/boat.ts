export const BOAT_CONFIG = {
  lengthM: 4.2, // Overall Club 420 hull length from bow to transom.
  waterlineLengthM: 3.9, // Approximate immersed hull length used for wave-making resistance.
  beamM: 1.63, // Maximum hull width.
  hullMassKg: 105, // Hull and fitted gear weight before the two sailors are added.
  addedMassKg: 35, // Water accelerated along with the hull makes acceleration less immediate.
  mastHeightM: 6.26, // Approximate mast height for the visible rig.
  boomHeightM: 0.95, // Boom height above the water in the upright Phase 1 model.
  mainAreaM2: 7.5, // Mainsail working area.
  jibAreaM2: 2.8, // Jib working area.
  mainFootM: 2.45, // Approximate visible mainsail foot length.
  jibFootM: 1.6, // Approximate visible jib foot length.
  spinnakerAreaM2: 9, // Reserved spinnaker area; the spinnaker is not simulated in Phase 1.
  spinnakerEnabled: false, // College-style sailing starts without a spinnaker; no Phase 1 effect.
  trapezeEnabled: false, // Reserved for later crew mechanics; no Phase 1 effect.
  initialHeadingDeg: 90, // Launch on an eastward beam reach in the default northerly breeze.
  initialMainSheet: 0.65, // Start with the main drawing on the default reach.
  mainSheetRatePerSecond: 0.3, // Holding trim/ease moves through the full sheet range in about 3.3 seconds.
  minMainAngleDeg: 8, // Tightest possible boom angle from the aft centreline.
  maxMainAngleDeg: 88, // Fully eased boom angle; sheeting cannot force it past square.
  minJibAngleDeg: 10, // Tightest jib lead angle used by the automatic crew.
  maxJibAngleDeg: 80, // Fully eased jib angle on a deep reach or run.
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
  boardAreaM2: 0.32, // Effective immersed centerboard area; fixed fully down in Phase 1.
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
};
