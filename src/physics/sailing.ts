import { BOAT_CONFIG as B } from '../config/boat';
import { DEG_TO_RAD, ENVIRONMENT_CONFIG as E, KNOTS_TO_MPS } from '../config/environment';
import type { BoatState, Controls, SailingSettings, SailState, Telemetry, Vec2, WindSample } from './types';

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
  const speed = meanSpeed * (1 + gust);
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
  const jibOpening = clamp(Math.abs(relativeWind) / DEG_TO_RAD - B.jibTargetAttackDeg - B.jibEffectiveTwistDeg,
    B.minJibAngleDeg, B.maxJibAngleDeg) * DEG_TO_RAD;
  const main = sailForce(apparent, relativeWind, mainOpening, B.mainEffectiveTwistDeg * DEG_TO_RAD, B.mainAreaM2);
  const jib = sailForce(apparent, relativeWind, jibOpening, B.jibEffectiveTwistDeg * DEG_TO_RAD, B.jibAreaM2);
  const airForce = { x: main.force.x + jib.force.x, z: main.force.z + jib.force.z };
  const forwardSpeed = dot(state.velocity, f);
  const sideSpeed = dot(state.velocity, right);
  const board = foilForce(forwardSpeed, sideSpeed, 0, B.boardAreaM2,
    B.boardLiftSlope, B.boardMaxLiftCoefficient, B.boardProfileDragCoefficient, B.boardInducedDragFactor);
  const rudderSideSpeed = sideSpeed - B.rudderLeverArmM * state.yawRate;
  const rudder = foilForce(forwardSpeed, rudderSideSpeed, state.rudder, B.rudderAreaM2,
    B.rudderLiftSlope, B.rudderMaxLiftCoefficient, B.rudderProfileDragCoefficient, B.rudderInducedDragFactor);
  const neutralRudder = foilForce(forwardSpeed, sideSpeed, 0, B.rudderAreaM2,
    B.rudderLiftSlope, B.rudderMaxLiftCoefficient, B.rudderProfileDragCoefficient, B.rudderInducedDragFactor);
  const hullSpeed = B.hullSpeedCoefficient * Math.sqrt(B.waterlineLengthM * B.metresToFeet) * KNOTS_TO_MPS;
  const hullDrag = 0.5 * E.waterDensityKgM3 * B.wettedAreaM2
    * (B.hullFrictionCoefficient + B.hullFormDragCoefficient) * forwardSpeed ** 2
    + B.waveDragForceN * (Math.abs(forwardSpeed) / hullSpeed) ** B.waveDragExponent;
  const hullSideDrag = 0.5 * E.waterDensityKgM3 * B.hullSideAreaM2 * B.hullSideDragCoefficient * sideSpeed * Math.abs(sideSpeed);
  const longitudinal = board.x + rudder.x - Math.sign(forwardSpeed) * hullDrag;
  const lateral = board.z + rudder.z - hullSideDrag;
  // Phase 1 assumes a balanced upright rig: neutral-rudder leeway forces have no net yaw moment.
  const yawMoment = -(rudder.z - neutralRudder.z) * B.rudderLeverArmM
    - state.yawRate * (B.yawDampingNmSeconds + B.yawFlowDampingNmSecondsPerMps * Math.abs(forwardSpeed));
  return { force: { x: airForce.x + f.x * longitudinal + right.x * lateral,
    z: airForce.z + f.z * longitudinal + right.z * lateral }, yawMoment,
    main: main.sail, jib: jib.sail, wind, apparent, relativeWind, forwardSpeed, sideSpeed,
    drive: dot(airForce, f), side: dot(airForce, right), hullDrag };
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
  for (let i = 0; i < steps; i++) {
    const rudderTarget = clamp(controls.steer, -1, 1) * B.rudderMaxAngleDeg * DEG_TO_RAD;
    state.rudder += (rudderTarget - state.rudder) * (1 - Math.exp(-h / B.rudderResponseSeconds));
    const result = forces(state, settings);
    state.velocity.x += result.force.x / mass * h;
    state.velocity.z += result.force.z / mass * h;
    state.position.x += state.velocity.x * h;
    state.position.z += state.velocity.z * h;
    state.yawRate += result.yawMoment / inertia * h;
    state.heading = compass(state.heading + state.yawRate * h);
    state.time += h;
    state.main = result.main;
    state.jib = result.jib;
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
  };
}
