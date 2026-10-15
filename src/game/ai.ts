import { BOAT_CONFIG as B } from '../config/boat';
import { DEG_TO_RAD } from '../config/environment';
import { getTelemetry, sampleWind } from '../physics/sailing';
import type { Controls, SailingSettings, Vec2 } from '../physics/types';
import { courseCoordinates, coursePoint, getNavigationTarget, requestPenaltyTurn } from './race';
import type { Racer, RaceState } from './race';
import { RACE_CONFIG as C } from './config';

interface Pilot { tack: number; loiterSide: number; tackHold: number }
const pilots = new WeakMap<Racer, Pilot>();
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Supplies helm and sheets only. Advance opponents with the same stepBoat used by the player. */
export function aiControls(racer: Racer, race: RaceState, settings: SailingSettings, dt: number): Controls {
  const state = racer.state;
  if (state.capsized) return { steer: 0, mainSheet: 0, board: 1, righting: true };
  const wind = sampleWind(state.position.x, state.position.z, state.time, settings);
  const telemetry = getTelemetry(state, settings);
  let pilot = pilots.get(racer);
  if (!pilot) {
    pilot = { tack: Math.sign(wrap(state.heading - wind.direction)) || 1, loiterSide: 1, tackHold: 0 };
    pilots.set(racer, pilot);
  }
  pilot.tackHold = Math.max(0, pilot.tackHold - dt);
  const index = race.racers.indexOf(racer);
  let target = getNavigationTarget(racer, race);
  if (race.phase === 'prestart' || race.phase === 'free' || race.phase === 'countdown' && race.countdown > 24) {
    const local = courseCoordinates(race.course, state.position);
    const halfLine = Math.hypot(race.course.committee.x, race.course.committee.z);
    if (local.x * pilot.loiterSide > halfLine + 3) pilot.loiterSide *= -1;
    target = coursePoint(race.course, pilot.loiterSide * (halfLine + 12), -28 - index * 9);
  }
  if (!target) return { steer: 0, mainSheet: 0, board: 1, righting: true };
  if (racer.penaltyTurns > 0 && race.phase === 'racing') requestPenaltyTurn(racer);
  const mainOpening = clamp(Math.abs(telemetry.apparentWindAngleDeg) - B.mainEffectiveTwistDeg - B.sailPeakAngleDeg, B.minMainAngleDeg, B.maxMainAngleDeg);
  const mainSheet = (B.maxMainAngleDeg - mainOpening) / (B.maxMainAngleDeg - B.minMainAngleDeg);
  const jibOpening = clamp(Math.abs(telemetry.apparentWindAngleDeg) - B.jibEffectiveTwistDeg - B.jibTargetAttackDeg, B.minJibAngleDeg, B.maxJibAngleDeg);
  const jibSheet = (B.maxJibAngleDeg - jibOpening) / (B.maxJibAngleDeg - B.minJibAngleDeg);
  let desired = Math.atan2(target.x - state.position.x, -(target.z - state.position.z));
  const relative = wrap(desired - wind.direction);
  const upwindAngle = C.aiUpwindAngleDeg * DEG_TO_RAD;
  if (Math.abs(relative) < upwindAngle) {
    if (Math.sign(relative) !== pilot.tack && Math.abs(relative) > upwindAngle - 4 * DEG_TO_RAD && pilot.tackHold === 0) {
      pilot.tack = Math.sign(relative) || -pilot.tack; pilot.tackHold = 10;
    }
    desired = wind.direction + pilot.tack * upwindAngle;
  } else {
    const proposed = Math.sign(relative) || pilot.tack;
    if (Math.abs(relative) < Math.PI / 2 && proposed !== pilot.tack && pilot.tackHold === 0) { pilot.tack = proposed; pilot.tackHold = 10; }
  }
  // Give-way boats bear away early; this does not replace the race's contact adjudication.
  const forward: Vec2 = { x: Math.sin(state.heading), z: -Math.cos(state.heading) };
  for (const other of race.racers) {
    if (other === racer || other.finishedAt !== null) continue;
    const dx = other.state.position.x - state.position.x, dz = other.state.position.z - state.position.z;
    const separation = Math.hypot(dx, dz);
    if (separation >= C.aiAvoidDistance || separation < 0.01 || dx * forward.x + dz * forward.z < 0) continue;
    const ownStarboard = Math.sin(wind.direction - state.heading) > 0;
    const otherStarboard = Math.sin(wind.direction - other.state.heading) > 0;
    const windward = (state.position.x - other.state.position.x) * Math.sin(wind.direction) - (state.position.z - other.state.position.z) * Math.cos(wind.direction) > 0;
    const following = dx * forward.x + dz * forward.z > B.lengthM / 2 && Math.abs(dx * Math.cos(state.heading) + dz * Math.sin(state.heading)) < B.beamM;
    if ((!ownStarboard && otherStarboard) || ownStarboard === otherStarboard && (windward || following)) desired += (Math.sign(wrap(state.heading - wind.direction)) || 1) * 0.5 * (1 - separation / C.aiAvoidDistance);
  }
  let steer = clamp(wrap(desired - state.heading) * C.aiHeadingGain - state.yawRate * C.aiYawDamping, -1, 1);
  if (racer.takingPenalty) steer = telemetry.speedKnots > 0.8 ? 0.65 : 1;
  return { steer, mainSheet, jibSheet, board: Math.abs(telemetry.trueWindAngleDeg) > 110 ? 0.45 : 1,
    hike: Math.sin(wind.direction - state.heading), righting: true, rollTack: pilot.tackHold > 7 && pilot.tackHold < 9 };
}

/** Every boat sees wakes from the rest of the fleet, never its own wind shadow. */
export function fleetSettings(racer: Racer, race: RaceState, settings: SailingSettings): SailingSettings {
  return { ...settings, autoCrew: racer.isPlayer ? settings.autoCrew : true,
    windShadows: race.racers.filter(other => other !== racer).map(other => ({ position: other.state.position, heading: other.state.heading })) };
}
