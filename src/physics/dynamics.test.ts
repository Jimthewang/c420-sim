import { describe, expect, it } from 'vitest';
import { createBoatState, getTelemetry, sampleWind, stepBoat } from './sailing';
import { DEFAULT_SETTINGS, KNOTS_TO_MPS } from '../config/environment';
import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState, Controls, SailingSettings } from './types';

const steady = { ...DEFAULT_SETTINGS, shifts: false, gusts: false };
function run(state: BoatState, seconds: number, controls: Controls, settings: SailingSettings = steady) {
  for (let i = 0; i < seconds * 120; i++) stepBoat(state, controls, settings, 1 / 120);
  return state;
}

describe('heel, board and crew', () => {
  it('uses crew weight position to counter the real sail heeling moment', () => {
    const hiked = createBoatState(); const wrongSide = createBoatState();
    run(hiked, 12, { steer: 0, mainSheet: 0.65, hike: -0.7 }, { ...steady, autoCrew: false });
    run(wrongSide, 12, { steer: 0, mainSheet: 0.65, hike: 0.7 }, { ...steady, autoCrew: false });
    expect(hiked.crew.skipperX).toBeLessThan(0);
    expect(Math.abs(hiked.heel)).toBeLessThan(Math.abs(wrongSide.heel));
    expect(getTelemetry(hiked, steady).heelingMoment).not.toBe(0);
  });
  it('has substantially more leeway with the centerboard raised', () => {
    const down = createBoatState(); const up = createBoatState();
    down.heading = up.heading = Math.PI / 4;
    run(down, 90, { steer: 0, mainSheet: 1, board: 1 });
    run(up, 90, { steer: 0, mainSheet: 1, board: 0 });
    expect(Math.abs(getTelemetry(up, steady).leewayDeg)).toBeGreaterThan(Math.abs(getTelemetry(down, steady).leewayDeg) + 3);
  });
  it('lets manual jib trim change airflow and sail forces', () => {
    const state = createBoatState(); state.velocity.x = 2;
    run(state, 0.1, { steer: 0, mainSheet: 0.65, jibSheet: 0 }, { ...steady, autoCrew: false });
    expect(state.jib.status).toBe('luffing');
    run(state, 0.1, { steer: 0, mainSheet: 0.65, jibSheet: 1 }, { ...steady, autoCrew: false });
    expect(state.jib.status).toBe('stalled');
  });
  it('capsizes when strong wind overpowers crew on the wrong side', () => {
    const state = createBoatState();
    run(state, 15, { steer: 0, mainSheet: 0.65, hike: 1 }, { ...steady, windSpeedKnots: 20, autoCrew: false });
    expect(state.capsized).toBe(true);
  });
  it('requires an eased main and exposed board for the manual righting procedure', () => {
    const state = createBoatState(); state.capsized = true; state.heel = Math.PI / 2;
    run(state, 10, { steer: 0, mainSheet: 1, board: 1, righting: true });
    expect(state.capsized).toBe(true);
    run(state, 10, { steer: 0, mainSheet: 0, board: 0, righting: true });
    expect(state.capsized).toBe(true);
    run(state, 10, { steer: 0, mainSheet: 0, board: 1, righting: true });
    expect(state.capsized).toBe(false);
    expect(Math.abs(state.heel)).toBeLessThan(Math.PI / 4);
  });
});

describe('planing and maneuvers', () => {
  it('planes faster than eight knots on a well-trimmed reach in a strong breeze', () => {
    const state = createBoatState();
    run(state, 150, { steer: 0, mainSheet: 0.65, board: 0.6 }, { ...steady, windSpeedKnots: 18 });
    expect(state.capsized).toBe(false);
    expect(state.planing).toBeGreaterThan(0.6);
    expect(getTelemetry(state, steady).speedKnots).toBeGreaterThan(8);
    expect(getTelemetry(state, steady).speedKnots).toBeLessThan(12);
  });
  it('keeps optimized broad-reaching speeds plausible, including a raised board', () => {
    for (const mainSheet of [0.45, 0.6, 0.75]) {
      const state = createBoatState(); state.heading = Math.PI * 2 / 3;
      const settings = { ...steady, windSpeedKnots: 20 };
      for (let i = 0; i < 150 * 60; i++) {
        const error = Math.atan2(Math.sin(Math.PI * 2 / 3 - state.heading), Math.cos(Math.PI * 2 / 3 - state.heading));
        stepBoat(state, { steer: 2 * error - 0.8 * state.yawRate, mainSheet, board: 0.6 }, settings, 1 / 60);
      }
      expect(getTelemetry(state, settings).speedKnots).toBeLessThan(12.5);
    }
  });
  it('counts real wind crossings as a tack and bounds roll-tack energy by crew work', () => {
    const state = createBoatState(); state.heading = 0.12; state.velocity = { x: 0.25, z: -2 };
    run(state, 0.1, { steer: 0, mainSheet: 1, rollTack: true });
    state.heading = -0.12;
    run(state, 0.1, { steer: 0, mainSheet: 1, rollTack: true });
    expect(state.tackCount).toBe(1);
    expect(state.rollTackEnergy).toBeGreaterThan(0);
    expect(state.rollTackEnergy).toBeLessThanOrEqual(steady.crewWeightKg * B.gravityMps2 * B.rollTackCrewDropM * B.rollTackEfficiency);
  });
  it('gets a bounded exit benefit from correctly timed rolling compared with a flat tack', () => {
    const flat = createBoatState(); const rolled = createBoatState();
    for (const state of [flat, rolled]) { state.heading = 0.12; state.velocity = { x: 0.25, z: -2 }; }
    const manual = { ...steady, autoCrew: false };
    run(flat, 0.1, { steer: 0, mainSheet: 1 }, manual);
    run(rolled, 0.1, { steer: 0, mainSheet: 1, rollTack: true }, manual);
    flat.heading = rolled.heading = -0.75;
    run(flat, 3, { steer: 0, mainSheet: 1, hike: 0.3 }, manual);
    run(rolled, 3, { steer: 0, mainSheet: 1, hike: 0.3, rollTack: true }, manual);
    expect(getTelemetry(rolled, manual).speedKnots).toBeGreaterThan(getTelemetry(flat, manual).speedKnots);
    expect(getTelemetry(rolled, manual).speedKnots - getTelemetry(flat, manual).speedKnots).toBeLessThan(0.8);
  });
  it('adds optional spinnaker propulsion on a run', () => {
    const state = createBoatState(); state.heading = Math.PI;
    const plain = getTelemetry(state, steady).driveForce;
    expect(getTelemetry(state, { ...steady, spinnaker: true }).driveForce).toBeGreaterThan(plain + 50);
  });
  it('an uncontrolled strong-wind gybe adds more roll impulse than a sheeted-in crossing', () => {
    const loose = createBoatState(); const controlled = createBoatState();
    const settings = { ...steady, windSpeedKnots: 20, autoCrew: false };
    for (const state of [loose, controlled]) {
      state.heading = 170 * Math.PI / 180;
      run(state, 1 / 120, { steer: 0, mainSheet: 0.1 }, settings);
      state.heading = 190 * Math.PI / 180;
    }
    run(loose, 1 / 120, { steer: 0, mainSheet: 0.1 }, settings);
    run(controlled, 1 / 120, { steer: 0, mainSheet: 1 }, settings);
    expect(loose.gybeCount).toBe(1);
    expect(Math.abs(loose.rollRate)).toBeGreaterThan(Math.abs(controlled.rollRate) + 0.3);
  });
});

describe('disturbed wind', () => {
  it('reduces wind behind another boat without changing upwind air or shading itself', () => {
    const shadow = { ...steady, windShadows: [{ position: { x: 0, z: 0 }, heading: Math.PI / 2 }] };
    expect(sampleWind(0, 12, 0, shadow).speed).toBeLessThan(10 * KNOTS_TO_MPS * 0.9);
    expect(sampleWind(0, -12, 0, shadow).speed).toBeCloseTo(10 * KNOTS_TO_MPS);
    expect(sampleWind(0, 0, 0, shadow).speed).toBeCloseTo(10 * KNOTS_TO_MPS);
  });
});
