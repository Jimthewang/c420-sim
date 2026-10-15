import { BOAT_CONFIG as B } from '../config/boat';
import { DEG_TO_RAD, ENVIRONMENT_CONFIG as E, KNOTS_TO_MPS } from '../config/environment';
import type { BoatState, Controls, SailingSettings, SailState, Telemetry, Vec2, WindSample } from './types';
import { resolveTerrainCollision } from './collisions';

const TAU = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const compass = (angle: number) => (angle % TAU + TAU) % TAU;
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;
const forward = (heading: number): Vec2 => ({ x: Math.sin(heading), z: -Math.cos(heading) });

export function createBoatState(): BoatState {
  const sail: SailState = { angle: 0, angleOfAttack: 0, lift: 0, drag: 0, status: 'luffing' };
  return {
    position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 },
    heading: B.initialHeadingDeg * DEG_TO_RAD, yawRate: 0, time: 0,
    mainSheet: B.initialMainSheet, rudder: 0, main: { ...sail }, jib: { ...sail },
    heel: 0, rollRate: 0, centerboard: 1, jibSheet: B.initialMainSheet,
    capsized: false, rightingProgress: 0, planing: 0,
    crew: { skipperX: 0, crewX: 0, foreAft: 0, hike: 0 },
    tackCount: 0, gybeCount: 0, lastTackTime: -B.rollTackMinIntervalSeconds,
    previousWindSide: 0, rollTackEnergy: 0,
  };
}

/** Wind vectors point where air moves; direction is where it comes from. */
export function sampleWind(x: number, z: number, time: number, settings: SailingSettings): WindSample {
  const meanDirection = settings.windDirectionDeg * DEG_TO_RAD;
  const meanSpeed = settings.windSpeedKnots * KNOTS_TO_MPS;
  const windFrom = forward(meanDirection);
  const across = x * Math.cos(meanDirection) + z * Math.sin(meanDirection);
  const along = -x * windFrom.x - z * windFrom.z - meanSpeed * time;
  const primary = Math.sin(TAU * along / E.puffAlongLengthM
    + E.puffCrossDistortion * Math.sin(TAU * across / E.puffAcrossLengthM));
  const secondary = Math.sin(TAU * (along + across * E.puffSecondaryCrossSlope) / E.puffSecondaryLengthM);
  const gust = settings.gusts
    ? E.puffAmplitude * (E.puffPrimaryShare * primary + (1 - E.puffPrimaryShare) * secondary) : 0;
  const shift = settings.shifts ? E.shiftAmplitudeDeg * DEG_TO_RAD
    * (E.shiftPrimaryShare * Math.sin(TAU * time / E.shiftPeriodSeconds)
      + (1 - E.shiftPrimaryShare) * Math.sin(TAU * time / E.shiftSecondaryPeriodSeconds)) : 0;
  const direction = compass(meanDirection + shift);
  let shadow = 0;
  for (const source of settings.windShadows ?? []) {
    const dx = x - source.position.x; const dz = z - source.position.z;
    if (Math.hypot(dx, dz) < E.windShadowIgnoreRadiusM) continue;
    const distance = -dx * Math.sin(direction) + dz * Math.cos(direction);
    if (distance <= 0 || distance > E.windShadowLengthM) continue;
    const lateral = dx * Math.cos(direction) + dz * Math.sin(direction);
    const width = E.windShadowInitialWidthM + distance * E.windShadowSpread;
    const deficit = E.windShadowMaxReduction * Math.exp(-distance / E.windShadowDecayM)
      * Math.exp(-((lateral / width) ** 2));
    shadow = Math.min(E.windShadowMaxReduction, shadow + deficit);
  }
  const speed = meanSpeed * (1 + gust) * (1 - shadow);
  return { velocity: { x: -Math.sin(direction) * speed, z: Math.cos(direction) * speed }, speed, direction, gust };
}

function sailForce(apparent: Vec2, relativeWind: number, opening: number, twist: number, area: number): { sail: SailState; force: Vec2 } {
  const speed = Math.hypot(apparent.x, apparent.z);
  const windSide = Math.sign(relativeWind) || 1;
  const actualOpening = Math.min(opening, Math.abs(relativeWind));
  const attack = Math.abs(relativeWind) - Math.min(actualOpening + twist, Math.abs(relativeWind));
  const attackDeg = attack / DEG_TO_RAD;
  const luffing = attackDeg <= B.sailLuffAngleDeg || speed < B.velocityEpsilonMps;
  const stalled = attackDeg > B.sailStallAngleDeg;
  const separation = clamp((attackDeg - B.sailPeakAngleDeg) / (B.sailSeparatedAngleDeg - B.sailPeakAngleDeg), 0, 1);
  const attachedLift = B.sailMaxLiftCoefficient
    * clamp((attackDeg - B.sailLuffAngleDeg) / (B.sailPeakAngleDeg - B.sailLuffAngleDeg), 0, 1);
  const separatedLift = B.sailSeparatedLiftCoefficient * Math.sin(2 * attack);
  const liftCoefficient = luffing ? 0 : attachedLift * (1 - separation) + separatedLift * separation;
  const dragCoefficient = luffing ? B.sailLuffDragCoefficient : B.sailProfileDragCoefficient
    + B.sailInducedDragFactor * liftCoefficient ** 2
    + B.sailSeparatedDragCoefficient * Math.sin(attack) ** 2 * separation;
  const pressureArea = 0.5 * E.airDensityKgM3 * speed ** 2 * area;
  const lift = pressureArea * liftCoefficient;
  const drag = pressureArea * dragCoefficient;
  const inverseSpeed = speed > B.velocityEpsilonMps ? 1 / speed : 0;
  // Lift is perpendicular to airflow; drag follows it. The windward side fixes lift sign.
  const force = {
    x: (apparent.x * drag - apparent.z * lift * windSide) * inverseSpeed,
    z: (apparent.z * drag + apparent.x * lift * windSide) * inverseSpeed,
  };
  return { sail: { angle: -windSide * actualOpening, angleOfAttack: attack, lift, drag,
    status: luffing ? 'luffing' : stalled ? 'stalled' : 'drawing' }, force };
}

/** Local coordinates: x forward, z starboard. Foil lift is perpendicular to water-relative motion. */
function foilForce(forwardSpeed: number, sideSpeed: number, angle: number, area: number,
  liftSlope: number, maxLift: number, profileDrag: number, inducedDrag: number): Vec2 {
  const speed = Math.hypot(forwardSpeed, sideSpeed);
  if (speed < B.velocityEpsilonMps) return { x: 0, z: 0 };
  const attack = Math.atan2(sideSpeed, forwardSpeed) + angle;
  const cl = clamp(liftSlope * Math.sin(2 * attack) / 2, -maxLift, maxLift);
  const cd = profileDrag + inducedDrag * cl ** 2;
  const pressureArea = 0.5 * E.waterDensityKgM3 * speed ** 2 * area;
  return {
    x: pressureArea * (cl * sideSpeed - cd * forwardSpeed) / speed,
    z: pressureArea * (-cl * forwardSpeed - cd * sideSpeed) / speed,
  };
}

function forces(state: BoatState, settings: SailingSettings) {
  const f = forward(state.heading);
  const right = { x: -f.z, z: f.x };
  const wind = sampleWind(state.position.x, state.position.z, state.time, settings);
  const apparent = { x: wind.velocity.x - state.velocity.x, z: wind.velocity.z - state.velocity.z };
  const apparentFrom = Math.atan2(-apparent.x, apparent.z);
  const relativeWind = wrap(apparentFrom - state.heading);
  const mainOpening = (B.maxMainAngleDeg - state.mainSheet * (B.maxMainAngleDeg - B.minMainAngleDeg)) * DEG_TO_RAD;
  const jibOpening = settings.autoCrew !== false
    ? clamp(Math.abs(relativeWind) / DEG_TO_RAD - B.jibTargetAttackDeg - B.jibEffectiveTwistDeg,
      B.minJibAngleDeg, B.maxJibAngleDeg) * DEG_TO_RAD
    : (B.maxJibAngleDeg - state.jibSheet * (B.maxJibAngleDeg - B.minJibAngleDeg)) * DEG_TO_RAD;
  const main = sailForce(apparent, relativeWind, mainOpening, B.mainEffectiveTwistDeg * DEG_TO_RAD, B.mainAreaM2);
  const jib = sailForce(apparent, relativeWind, jibOpening, B.jibEffectiveTwistDeg * DEG_TO_RAD, B.jibAreaM2);
  const airForce = { x: main.force.x + jib.force.x, z: main.force.z + jib.force.z };
  const trueWindAngle = wrap(wind.direction - state.heading);
  if ((settings.spinnaker ?? B.spinnakerEnabled) && Math.abs(trueWindAngle) > B.spinnakerMinAngleDeg * DEG_TO_RAD) {
    const apparentSpeed = Math.hypot(apparent.x, apparent.z);
    const pressure = 0.5 * E.airDensityKgM3 * apparentSpeed * B.spinnakerAreaM2 * B.spinnakerDragCoefficient;
    airForce.x += pressure * apparent.x; airForce.z += pressure * apparent.z;
  }
  const upright = state.capsized ? 0 : Math.cos(state.heel) ** 2;
  airForce.x *= upright; airForce.z *= upright;
  main.sail.lift *= upright; main.sail.drag *= upright;
  jib.sail.lift *= upright; jib.sail.drag *= upright;
  if (state.capsized) main.sail.status = jib.sail.status = 'luffing';
  const forwardSpeed = dot(state.velocity, f);
  const sideSpeed = dot(state.velocity, right);
  const boardArea = B.boardAreaM2 * (B.boardResidualAreaShare + (1 - B.boardResidualAreaShare) * state.centerboard);
  const board = foilForce(forwardSpeed, sideSpeed, 0, boardArea,
    B.boardLiftSlope, B.boardMaxLiftCoefficient, B.boardProfileDragCoefficient, B.boardInducedDragFactor);
  const rudderSideSpeed = sideSpeed - B.rudderLeverArmM * state.yawRate;
  const rudder = foilForce(forwardSpeed, rudderSideSpeed, state.rudder, B.rudderAreaM2,
    B.rudderLiftSlope, B.rudderMaxLiftCoefficient, B.rudderProfileDragCoefficient, B.rudderInducedDragFactor);
  const neutralRudder = foilForce(forwardSpeed, sideSpeed, 0, B.rudderAreaM2,
    B.rudderLiftSlope, B.rudderMaxLiftCoefficient, B.rudderProfileDragCoefficient, B.rudderInducedDragFactor);
  const hullSpeed = B.hullSpeedCoefficient * Math.sqrt(B.waterlineLengthM * B.metresToFeet) * KNOTS_TO_MPS;
  const heelDrag = 1 + B.heelDragFactor * Math.sin(state.heel) ** 2
    - B.lightHeelDragRelief * Math.sin(Math.min(Math.abs(state.heel), B.crewTargetHeelDeg * DEG_TO_RAD))
      / (B.crewTargetHeelDeg * DEG_TO_RAD);
  const aftTrim = clamp(state.crew.foreAft / B.crewAftShiftM, 0, 1);
  const hullDrag = (0.5 * E.waterDensityKgM3 * B.wettedAreaM2
    * (B.hullFrictionCoefficient + B.hullFormDragCoefficient) * forwardSpeed ** 2
    * (1 - B.planingFrictionRelief * state.planing) * (1 - B.planingHullTrimDragFactor * state.planing * aftTrim)
    + B.waveDragForceN * (Math.abs(forwardSpeed) / hullSpeed) ** B.waveDragExponent
      * (1 - state.planing) ** B.planingWaveReliefExponent) * heelDrag
    + state.planing * (B.planingSupportDragRatio * (B.hullMassKg + settings.crewWeightKg) * B.gravityMps2
      + B.planingSprayDragKgPerM * forwardSpeed ** 2);
  const hullSideDrag = 0.5 * E.waterDensityKgM3 * B.hullSideAreaM2 * B.hullSideDragCoefficient * sideSpeed * Math.abs(sideSpeed);
  const longitudinal = board.x + rudder.x - Math.sign(forwardSpeed) * hullDrag;
  const lateral = board.z + rudder.z - hullSideDrag;
  const side = dot(airForce, right);
  // The upright rig is balanced; heel adds weather helm toward the windward side.
  const yawMoment = -(rudder.z - neutralRudder.z) * B.rudderLeverArmM
    - state.yawRate * (B.yawDampingNmSeconds + B.yawFlowDampingNmSecondsPerMps * Math.abs(forwardSpeed))
    - side * B.weatherHelmLeverM * Math.sin(Math.abs(state.heel));
  const crewLever = state.crew.skipperX * B.skipperWeightShare + state.crew.crewX * (1 - B.skipperWeightShare);
  const heelingMoment = side * B.sailEffortHeightM;
  const rightingMoment = B.hullRightingNm * Math.sin(state.heel) * Math.cos(state.heel)
    - settings.crewWeightKg * B.gravityMps2 * crewLever * Math.cos(state.heel);
  return { force: { x: airForce.x + f.x * longitudinal + right.x * lateral,
    z: airForce.z + f.z * longitudinal + right.z * lateral }, yawMoment,
    main: main.sail, jib: jib.sail, wind, apparent, relativeWind, forwardSpeed, sideSpeed,
    drive: dot(airForce, f), side, hullDrag, heelingMoment, rightingMoment, trueWindAngle };
}

function updateCrew(state: BoatState, controls: Controls, settings: SailingSettings, sideForce: number, trueAngle: number, h: number) {
  const maxLever = B.crewMaxLeverM + (B.trapezeEnabled ? B.trapezeExtraLeverM : 0);
  const windSide = Math.sign(trueAngle);
  let target = clamp(controls.hike ?? 0, -1, 1) * maxLever;
  if (settings.autoCrew !== false) {
    target = settings.windSpeedKnots < B.crewLightWindKnots ? -windSide * B.crewLightHeelLeverM
      : clamp((-sideForce * B.sailEffortHeightM
        + Math.sign(sideForce) * B.hullRightingNm * Math.sin(B.crewTargetHeelDeg * DEG_TO_RAD))
          / (settings.crewWeightKg * B.gravityMps2), -maxLever, maxLever);
  }
  const response = 1 - Math.exp(-h / B.crewResponseSeconds);
  state.crew.skipperX += (target - state.crew.skipperX) * response;
  state.crew.crewX += (target - state.crew.crewX) * response;
  const aft = clamp((Math.abs(trueAngle) / DEG_TO_RAD - B.crewAftStartAngleDeg)
    / (180 - B.crewAftStartAngleDeg), 0, 1) * B.crewAftShiftM;
  state.crew.foreAft += (aft - state.crew.foreAft) * response;
  state.crew.hike = (state.crew.skipperX + state.crew.crewX) / (2 * maxLever);
}

function updateManeuver(state: BoatState, controls: Controls, settings: SailingSettings, trueAngle: number, apparentSpeed: number) {
  const side = Math.sign(Math.sin(trueAngle));
  if (Math.abs(Math.sin(trueAngle)) < Math.sin(B.maneuverDeadbandDeg * DEG_TO_RAD)) return;
  if (state.previousWindSide && side !== state.previousWindSide) {
    if (Math.abs(trueAngle) < Math.PI / 2) {
      state.tackCount++;
      if (state.time - state.lastTackTime >= B.rollTackMinIntervalSeconds
        && (controls.rollTack || settings.autoCrew !== false) && settings.windSpeedKnots <= B.rollTackMaxWindKnots) {
        state.rollTackEnergy = settings.crewWeightKg * B.gravityMps2 * B.rollTackCrewDropM * B.rollTackEfficiency;
      }
      state.lastTackTime = state.time;
    } else {
      state.gybeCount++;
      state.rollRate -= side * B.gybeRollImpulse * apparentSpeed ** 2 * (1 - state.mainSheet);
    }
  }
  state.previousWindSide = side;
}

/** Semi-implicit integration; velocity comes from summed forces, never a target-speed table. */
export function stepBoat(state: BoatState, controls: Controls, settings: SailingSettings, dt: number): void {
  if (dt <= 0) return;
  const duration = Math.min(dt, E.maxFrameDelta);
  const steps = Math.ceil(duration / E.fixedTimeStep);
  const h = duration / steps;
  const mass = B.hullMassKg + settings.crewWeightKg + B.addedMassKg;
  const inertia = (B.hullMassKg + settings.crewWeightKg) * (B.lengthM ** 2 + B.beamM ** 2) / 12 + B.yawAddedInertiaKgM2;
  state.mainSheet = clamp(controls.mainSheet, 0, 1);
  if (controls.jibSheet !== undefined) state.jibSheet = clamp(controls.jibSheet, 0, 1);
  for (let i = 0; i < steps; i++) {
    const previousPosition = { ...state.position }, previousHeading = state.heading;
    const boardTarget = clamp(controls.board ?? state.centerboard, 0, 1);
    state.centerboard += clamp(boardTarget - state.centerboard, -B.boardMovePerSecond * h, B.boardMovePerSecond * h);
    if (state.capsized) {
      const canRight = controls.righting && state.centerboard >= B.rightingMinBoard && state.mainSheet <= B.rightingMaxMainSheet;
      state.rightingProgress = clamp(state.rightingProgress + (canRight ? h / B.rightingSeconds : -h / B.rightingSeconds), 0, 1);
      const drag = Math.exp(-B.capsizedDragKgPerSecond / mass * h);
      state.velocity.x *= drag; state.velocity.z *= drag; state.yawRate *= drag;
      state.position.x += state.velocity.x * h; state.position.z += state.velocity.z * h;
      state.heel = Math.sign(state.heel || 1) * B.capsizedAngleDeg * DEG_TO_RAD;
      state.rollRate = 0; state.planing = 0; state.time += h;
      state.main = { ...state.main, lift: 0, drag: 0, status: 'luffing' };
      state.jib = { ...state.jib, lift: 0, drag: 0, status: 'luffing' };
      if (state.rightingProgress >= 1) {
        state.capsized = false; state.rightingProgress = 0;
        state.heel = Math.sign(state.heel) * B.recoveredHeelDeg * DEG_TO_RAD;
        state.crew.skipperX = state.crew.crewX = 0;
      }
      resolveTerrainCollision(state, previousPosition, previousHeading, h, sampleWind(state.position.x, state.position.z, state.time, settings));
      continue;
    }
    const rudderTarget = clamp(controls.steer, -1, 1) * B.rudderMaxAngleDeg * DEG_TO_RAD;
    state.rudder += (rudderTarget - state.rudder) * (1 - Math.exp(-h / B.rudderResponseSeconds));
    const result = forces(state, settings);
    updateCrew(state, controls, settings, result.side, result.trueWindAngle, h);
    updateManeuver(state, controls, settings, result.trueWindAngle, Math.hypot(result.apparent.x, result.apparent.z));
    const reach = clamp((Math.abs(result.trueWindAngle) / DEG_TO_RAD - B.planingMinAngleDeg)
      / (B.planingFullAngleDeg - B.planingMinAngleDeg), 0, 1);
    const froude = Math.max(0, result.forwardSpeed) / Math.sqrt(B.gravityMps2 * B.waterlineLengthM);
    const planingTarget = clamp((froude - B.planingStartFroude) / (B.planingFullFroude - B.planingStartFroude), 0, 1)
      * reach * Math.cos(state.heel) ** 2;
    state.planing += (planingTarget - state.planing) * (1 - Math.exp(-h / B.planingResponseSeconds));
    if (state.time - state.lastTackTime > B.rollTackWindowSeconds) state.rollTackEnergy = 0;
    if (state.rollTackEnergy > 0 && result.forwardSpeed > B.rollTackMinSpeedMps) {
      const work = Math.min(state.rollTackEnergy, B.rollTackPowerWatts * h);
      const drive = work / (result.forwardSpeed * h);
      const f = forward(state.heading);
      result.force.x += f.x * drive; result.force.z += f.z * drive;
      state.rollTackEnergy -= work;
    }
    state.velocity.x += result.force.x / mass * h;
    state.velocity.z += result.force.z / mass * h;
    state.position.x += state.velocity.x * h;
    state.position.z += state.velocity.z * h;
    state.yawRate += result.yawMoment / inertia * h;
    state.heading = compass(state.heading + state.yawRate * h);
    state.rollRate += (result.heelingMoment - result.rightingMoment - B.rollDampingNmSeconds * state.rollRate) / B.rollInertiaKgM2 * h;
    state.heel += state.rollRate * h;
    if (Math.abs(state.heel) > B.capsizeAngleDeg * DEG_TO_RAD) state.capsized = true;
    state.time += h;
    state.main = result.main;
    state.jib = result.jib;
    resolveTerrainCollision(state, previousPosition, previousHeading, h, sampleWind(state.position.x, state.position.z, state.time, settings));
  }
}

export function getTelemetry(state: BoatState, settings: SailingSettings): Telemetry {
  const result = forces(state, settings);
  const speed = Math.hypot(state.velocity.x, state.velocity.z);
  return {
    speedKnots: speed / KNOTS_TO_MPS,
    headingDeg: compass(state.heading) / DEG_TO_RAD,
    trueWindKnots: result.wind.speed / KNOTS_TO_MPS,
    trueWindDirectionDeg: result.wind.direction / DEG_TO_RAD,
    apparentWindKnots: Math.hypot(result.apparent.x, result.apparent.z) / KNOTS_TO_MPS,
    apparentWindAngleDeg: result.relativeWind / DEG_TO_RAD,
    trueWindAngleDeg: wrap(result.wind.direction - state.heading) / DEG_TO_RAD,
    leewayDeg: speed > B.velocityEpsilonMps ? Math.atan2(result.sideSpeed, Math.abs(result.forwardSpeed)) / DEG_TO_RAD : 0,
    vmgKnots: dot(state.velocity, forward(result.wind.direction)) / KNOTS_TO_MPS,
    driveForce: result.drive, sideForce: result.side, hullDrag: result.hullDrag,
    main: result.main, jib: result.jib,
    heelDeg: state.heel / DEG_TO_RAD, heelingMoment: result.heelingMoment,
    rightingMoment: result.rightingMoment, planing: state.planing,
    windShadow: settings.windShadows?.length ? 1 - result.wind.speed
      / Math.max(B.velocityEpsilonMps, sampleWind(state.position.x, state.position.z, state.time, { ...settings, windShadows: [] }).speed) : 0,
  };
}
