import { configureTerrainCourse } from '../world/terrain';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBoatState, getTelemetry, sampleWind, stepBoat } from './sailing';
import { DEFAULT_SETTINGS, KNOTS_TO_MPS } from '../config/environment';
import { BOAT_CONFIG as B } from '../config/boat';
import type { BoatState, SailingSettings } from './types';

const steady: SailingSettings = { ...DEFAULT_SETTINGS, shifts: false, gusts: false };
const radians = (degrees: number) => degrees * Math.PI / 180;

function sail(heading: number, sheet: number, seconds = 180, dt = 1 / 60, settings = steady): BoatState {
  // Reserve an empty test-tank corridor for long straight-line force calibration at every heading.
  configureTerrainCourse({windDirectionDeg:heading,length:2000});
  const state = createBoatState();
  state.heading = radians(heading);
  // A helmsman holds the requested course against the model's new heel-induced weather helm.
  for (let t = 0; t < seconds - dt / 2; t += dt) {
    const error = Math.atan2(Math.sin(radians(heading) - state.heading), Math.cos(radians(heading) - state.heading));
    stepBoat(state, { steer: error * 2 - state.yawRate * 0.8, mainSheet: sheet }, settings, dt);
  }
  return state;
}

// Force calibration runs in clear course water; coast response has its own geometry tests.
beforeEach(()=>configureTerrainCourse({windDirectionDeg:0,length:350}));

describe('wind and apparent wind', () => {
  it('uses a meteorological wind-from direction and SI velocity', () => {
    const wind = sampleWind(0, 0, 0, steady);
    expect(wind.velocity.x).toBeCloseTo(0);
    expect(wind.velocity.z).toBeCloseTo(10 * KNOTS_TO_MPS);
    expect(wind.speed).toBeCloseTo(10 * KNOTS_TO_MPS);
  });

  it('subtracts boat velocity from true wind', () => {
    const state = createBoatState();
    state.velocity = { x: 3, z: 0 };
    expect(getTelemetry(state, steady).apparentWindKnots * KNOTS_TO_MPS)
      .toBeCloseTo(Math.hypot(3, 10 * KNOTS_TO_MPS));
  });

  it('advects the puff pattern downwind and keeps it deterministic', () => {
    const settings = { ...steady, gusts: true };
    const first = sampleWind(30, -20, 0, settings);
    const later = sampleWind(30, -20 + 10 * KNOTS_TO_MPS * 12, 12, settings);
    expect(later.gust).toBeCloseTo(first.gust);
    expect(sampleWind(30, -20, 0, settings)).toEqual(first);
  });
});

describe('sail trim and symmetry', () => {
  it('distinguishes luffing from overtrimmed stall on a reach', () => {
    const state = createBoatState();
    state.velocity = { x: 2, z: 0 };
    stepBoat(state, { steer: 0, mainSheet: 0 }, steady, 1 / 60);
    expect(state.main.status).toBe('luffing');
    stepBoat(state, { steer: 0, mainSheet: 1 }, steady, 1 / 60);
    expect(state.main.status).toBe('stalled');
  });

  it('gets more drive from correctly trimmed sails than either extreme', () => {
    const speeds = [0, 0.65, 1].map(sheet => getTelemetry(sail(90, sheet), steady).speedKnots);
    expect(speeds[1]).toBeGreaterThan(speeds[0] + 0.8);
    expect(speeds[1]).toBeGreaterThan(speeds[2] + 0.3);
  });

  it('lets a slack mainsheet align the boom with airflow', () => {
    const state = createBoatState();
    state.heading = radians(30);
    stepBoat(state, { steer: 0, mainSheet: 0 }, steady, 1 / 120);
    expect(Math.abs(state.main.angle)).toBeCloseTo(radians(30), 2);
    expect(state.main.status).toBe('luffing');
  });

  it('mirrors port and starboard tack without a favored side', () => {
    const port = sail(50, 0.95);
    const starboard = sail(310, 0.95);
    expect(port.velocity.x).toBeCloseTo(-starboard.velocity.x, 6);
    expect(port.velocity.z).toBeCloseTo(starboard.velocity.z, 6);
    expect(port.main.angle).toBeGreaterThan(0);
    expect(starboard.main.angle).toBeLessThan(0);
  });
});

describe('force integration', () => {
  it.each([0, 0.25, 0.5, 0.75, 1])('makes no windward progress head to wind at sheet %s', sheet => {
    const state = sail(0, sheet);
    expect(-state.position.z).toBeLessThanOrEqual(0.05);
    expect(getTelemetry(state, steady).vmgKnots).toBeLessThanOrEqual(0.01);
  });

  it('settles to a plausible 4–5 knot close-hauled speed in 10 knots', () => {
    const telemetry = getTelemetry(sail(45, 1), steady);
    expect(telemetry.speedKnots).toBeGreaterThan(4);
    expect(telemetry.speedKnots).toBeLessThan(5.1);
    expect(telemetry.vmgKnots).toBeGreaterThan(2);
  });

  it('cannot sustain useful upwind progress at 30 degrees, across all mainsheet settings', () => {
    for (const sheet of [0, 0.25, 0.5, 0.75, 1]) {
      expect(getTelemetry(sail(30, sheet), steady).vmgKnots).toBeLessThan(1);
    }
  });

  it('rewards footing to 45 degrees over pinching at 35 degrees', () => {
    const pinching = getTelemetry(sail(35, 1), steady);
    const sailing = getTelemetry(sail(45, 1), steady);
    expect(sailing.vmgKnots).toBeGreaterThan(pinching.vmgKnots + 0.6);
  });

  it('has no rudder authority at rest in still air', () => {
    const state = createBoatState();
    for (let i = 0; i < 120; i++) stepBoat(state, { steer: 1, mainSheet: 0.5 }, { ...steady, windSpeedKnots: 0 }, 1 / 60);
    expect(state.heading).toBeCloseTo(Math.PI / 2, 8);
    expect(state.yawRate).toBeCloseTo(0, 8);
  });

  it('turns starboard with forward flow and reverses rudder effect when backing', () => {
    const forward = createBoatState();
    const backward = createBoatState();
    forward.velocity.x = 2;
    backward.velocity.x = -2;
    for (let i = 0; i < 30; i++) {
      stepBoat(forward, { steer: 1, mainSheet: 0.5 }, { ...steady, windSpeedKnots: 0 }, 1 / 60);
      stepBoat(backward, { steer: 1, mainSheet: 0.5 }, { ...steady, windSpeedKnots: 0 }, 1 / 60);
    }
    expect(forward.heading).toBeGreaterThan(Math.PI / 2);
    expect(backward.heading).toBeLessThan(Math.PI / 2);
  });

  it('settles a turn after the tiller is centred, using water flow at the stern', () => {
    const state = createBoatState();
    state.velocity.x = 3 * KNOTS_TO_MPS;
    for (let i = 0; i < 240; i++) stepBoat(state, { steer: 1, mainSheet: 0.65 }, steady, 1 / 120);
    const releasedHeading = state.heading;
    expect(state.heading).toBeGreaterThan(radians(95));
    for (let i = 0; i < 360; i++) stepBoat(state, { steer: 0, mainSheet: 0.65 }, steady, 1 / 120);
    expect(Math.abs(state.yawRate)).toBeLessThan(radians(2));
    expect(state.heading - releasedHeading).toBeLessThan(radians(20));
  });

  it('loses kinetic energy with no wind instead of creating it through foil lift', () => {
    const state = createBoatState();
    state.velocity = { x: 3, z: 0.4 };
    let speed = Math.hypot(state.velocity.x, state.velocity.z);
    for (let i = 0; i < 600; i++) {
      stepBoat(state, { steer: 0, mainSheet: 1 }, { ...steady, windSpeedKnots: 0 }, 1 / 60);
      const next = Math.hypot(state.velocity.x, state.velocity.z);
      expect(next).toBeLessThanOrEqual(speed + 0.00001);
      speed = next;
    }
    expect(speed).toBeLessThan(1);
  });

  it('does not create total kinetic energy while turning or coasting in still air', () => {
    const mass = B.hullMassKg + steady.crewWeightKg + B.addedMassKg;
    const inertia = (B.hullMassKg + steady.crewWeightKg) * (B.lengthM ** 2 + B.beamM ** 2) / 12 + B.yawAddedInertiaKgM2;
    const energy = (state: BoatState) => 0.5 * mass * (state.velocity.x ** 2 + state.velocity.z ** 2)
      + 0.5 * inertia * state.yawRate ** 2;
    for (const yawRate of [-1, 0, 1]) for (const sideSpeed of [-0.4, 0.4]) for (const steer of [-1, 0, 1]) {
      const state = createBoatState();
      state.velocity = { x: 2, z: sideSpeed };
      state.yawRate = yawRate;
      state.rudder = steer * B.rudderMaxAngleDeg * Math.PI / 180;
      let previous = energy(state);
      for (let i = 0; i < 240; i++) {
        stepBoat(state, { steer, mainSheet: 0.65 }, { ...steady, windSpeedKnots: 0 }, 1 / 120);
        const current = energy(state);
        expect(current).toBeLessThanOrEqual(previous + 0.0001);
        previous = current;
      }
    }
  });

  it('keeps both displacement and planing speeds plausible over the supported wind range', () => {
    for (const windSpeedKnots of [4, 10, 20]) {
      for (const heading of [30, 60, 90, 135, 180]) {
        const state = sail(heading, 0.5, 120, 1 / 60, { ...steady, windSpeedKnots });
        expect(Number.isFinite(state.position.x)).toBe(true);
        expect(Math.hypot(state.velocity.x, state.velocity.z) / KNOTS_TO_MPS).toBeLessThan(13);
      }
    }
  });

  it('agrees across 60 and 120 Hz integration', () => {
    const slow = sail(60, 0.8, 60, 1 / 60);
    const fast = sail(60, 0.8, 60, 1 / 120);
    expect(Math.hypot(slow.position.x - fast.position.x, slow.position.z - fast.position.z)).toBeLessThan(0.3);
    expect(Math.abs(getTelemetry(slow, steady).speedKnots - getTelemetry(fast, steady).speedKnots)).toBeLessThan(0.02);
  });
});
