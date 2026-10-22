import { beforeEach, describe, expect, it } from 'vitest';
import * as sailing from './sailing';
import { BOAT_CONFIG as B } from '../config/boat';
import { DEFAULT_SETTINGS, DEG_TO_RAD as D } from '../config/environment';
import { configureTerrainCourse } from '../world/terrain';
import type { BoatState, SailingSettings } from './types';

const steady = { ...DEFAULT_SETTINGS, shifts: false, gusts: false };
const dt = 1 / 120;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
function hold(state: BoatState, heading: number, seconds: number, settings: SailingSettings = steady, mainSheet = 1) {
  for (let t = 0; t < seconds; t += dt) sailing.stepBoat(state,
    { steer: wrap(heading - state.heading) * 2 - state.yawRate * .8, mainSheet }, settings, dt);
}
beforeEach(() => configureTerrainCourse({ windDirectionDeg: 90, length: 3000 }));

describe('continuous sailing maneuvers', () => {
  it('keeps force continuous as reversed airflow passes the moving sail centreline', () => {
    const state = sailing.createBoatState(); state.heading = 190 * D;
    state.rigInitialized = true; state.jib.angle = 0;
    const settings = { ...steady, windSpeedKnots: 20 };
    state.main.angle = 10 * D - 1e-8;
    const before = sailing.getTelemetry(state, settings);
    state.main.angle = 10 * D + 1e-8;
    const after = sailing.getTelemetry(state, settings);
    expect(Math.abs(after.sideForce - before.sideForce)).toBeLessThan(.01);
    expect(Math.abs(after.driveForce - before.driveForce)).toBeLessThan(.01);
    state.main.angle = 10 * D;
    expect(Math.abs(sailing.getTelemetry(state, settings).main.lift)).toBeLessThan(1e-8);
  });
  it('does not award tacks for wind shifts without a hull turn', () => {
    const state = sailing.createBoatState(); state.heading = 0;
    configureTerrainCourse({ windDirectionDeg: 0, length: 3000 });
    for (let t = 0; t < 200; t += dt) sailing.stepBoat(state,
      { steer: 0, mainSheet: 0 }, { ...steady, shifts: true }, dt);
    expect(Math.abs(wrap(state.heading))).toBeLessThan(1 * D);
    expect(state.tackCount).toBe(0);
  });

  it('moves the boom continuously through a real steered gybe and couples the roll kick to its crossing', () => {
    const state = sailing.createBoatState(); state.heading = 150 * D;
    const settings = { ...steady, windSpeedKnots: 18 };
    hold(state, state.heading, 25, settings, .15);
    let maxJump = 0, maxAcceleration = 0, crossingTime = -1, kickTime = -1, largestKick = 0;
    for (let t = 0; t < 5; t += dt) {
      const angle = state.main.angle, rate = state.rollRate, angularVelocity = state.mainAngularVelocity;
      const before = sailing.getTelemetry(state, settings);
      const predictedRate = rate + (before.heelingMoment - before.rightingMoment - B.rollDampingNmSeconds * rate) / B.rollInertiaKgM2 * dt;
      sailing.stepBoat(state, { steer: 1, mainSheet: .15 }, settings, dt);
      maxJump = Math.max(maxJump, Math.abs(state.main.angle - angle));
      maxAcceleration = Math.max(maxAcceleration, Math.abs(state.mainAngularVelocity - angularVelocity) / dt);
      if (angle * state.main.angle < 0 && crossingTime < 0) crossingTime = state.time;
      const kick = Math.abs(state.rollRate - predictedRate);
      if (kick > largestKick) { largestKick = kick; kickTime = state.time; }
    }
    expect(maxJump / D).toBeLessThan(3);
    expect(maxAcceleration / D).toBeLessThanOrEqual(B.mainAngularAccelerationDegPerSecond2 + 1e-8);
    expect(crossingTime).toBeGreaterThan(0);
    expect(largestKick).toBeGreaterThan(.04);
    expect(Math.abs(kickTime - crossingTime)).toBeLessThanOrEqual(dt * 1.01);
    expect(state.gybeCount).toBe(1);
  });

  it.each([false, true])('Space produces an actual crew roll and flatten with autoCrew=%s', autoCrew => {
    const flat = sailing.createBoatState(), rolled = sailing.createBoatState();
    for (const state of [flat, rolled]) { state.heading = 45 * D; state.velocity = { x: 1.5, z: -1.5 }; }
    let crewDifference = 0, heelDifference = 0;
    for (let t = 0; t < 8; t += dt) {
      const controls = { steer: t < 3 ? -1 : 0, mainSheet: 1, hike: 0 };
      sailing.stepBoat(flat, controls, { ...steady, autoCrew }, dt);
      sailing.stepBoat(rolled, { ...controls, rollTack: true }, { ...steady, autoCrew }, dt);
      crewDifference = Math.max(crewDifference, Math.abs(rolled.crew.crewX - flat.crew.crewX));
      heelDifference = Math.max(heelDifference, Math.abs(rolled.heel - flat.heel));
    }
    expect(crewDifference).toBeGreaterThan(.08);
    expect(heelDifference / D).toBeGreaterThan(2);
    expect(rolled.tackCount).toBe(1);
    expect(rolled.capsized).toBe(false);
  });

  it('hands automatic sail trim and crew position to manual control without a jump', () => {
    const state = sailing.createBoatState(); state.heading = 45 * D;
    hold(state, state.heading, 30);
    const before = sailing.getTelemetry(state, steady);
    const handoff = sailing.handoffToManualCrew(state, steady);
    const after = sailing.getTelemetry(state, { ...steady, autoCrew: false });
    expect(handoff.hike).toBeCloseTo(state.crew.hike, 8);
    expect(after.jib.angle).toBeCloseTo(before.jib.angle, 8);
    expect(after.driveForce).toBeCloseTo(before.driveForce, 8);
    for (let t = 0; t < 3; t += dt) sailing.stepBoat(state,
      { steer: wrap(45 * D - state.heading) * 2 - state.yawRate * .8, mainSheet: 1, ...handoff },
      { ...steady, autoCrew: false }, dt);
    expect(Math.abs(state.heel) / D).toBeLessThan(8);
  });

  it('also hands off correctly when a GUI toggles the setting before the first physical tick', () => {
    const state = sailing.createBoatState();
    const before = sailing.getTelemetry(state, steady);
    sailing.handoffToManualCrew(state, { ...steady, autoCrew: false });
    const after = sailing.getTelemetry(state, { ...steady, autoCrew: false });
    expect(after.jib.angle).toBeCloseTo(before.jib.angle, 8);
    expect(after.driveForce).toBeCloseTo(before.driveForce, 8);
  });

  it('telemetry reports the current moving rig without changing its state', () => {
    const state = sailing.createBoatState(); hold(state, state.heading, 2, steady, .15);
    sailing.stepBoat(state, { steer: 0, mainSheet: 1 }, steady, dt);
    const snapshot = structuredClone(state);
    const telemetry = sailing.getTelemetry(state, steady);
    expect(telemetry.main.angle).toBe(state.main.angle);
    expect(telemetry.jib.angle).toBe(state.jib.angle);
    expect(state).toEqual(snapshot);
  });
});
